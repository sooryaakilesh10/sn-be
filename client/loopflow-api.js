// LoopFlow API client — drop-in browser ES module.
//
// Usage in main.js:
//   import { api } from "./backend/client/loopflow-api.js";
//   api.configure({ baseUrl: "https://loopflow-backend.<you>.workers.dev" });
//
// Migration cheatsheet (replace the localStorage calls in main.js):
//   localStorage.setItem('loopflow_beats', …)  →  await api.beats.create({...})
//   AppState.savedBeats = JSON.parse(saved)     →  (await api.beats.listMine()).items
//   likeBeat(id)                                →  await api.beats.like(id) / unlike(id)
//   followArtist(author)                        →  await api.users.follow(userId)
//   populateDiscoveryFeed()                     →  (await api.feed.discover()).items
//   login button                                →  api.auth.startLogin()
//
// Auth is cookie-based (HttpOnly); every call sends credentials and the client
// transparently refreshes the access token once on a 401 before retrying.

let config = { baseUrl: "" };

export function configure(opts) {
  config = { ...config, ...opts };
}

class ApiError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

let refreshing = null; // de-dupe concurrent refreshes

async function request(method, path, { body, query, raw, contentType } = {}, _retried = false) {
  const url = new URL(config.baseUrl + path, config.baseUrl || location.origin);
  if (query) for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }

  const headers = {};
  let payload;
  if (raw !== undefined) {
    payload = raw;
    if (contentType) headers["content-type"] = contentType;
  } else if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const res = await fetch(url, {
    method,
    headers,
    body: payload,
    credentials: "include",
  });

  // Transparent one-shot refresh on expiry.
  if (res.status === 401 && !_retried && !path.startsWith("/auth/")) {
    if (!refreshing) {
      refreshing = fetch(config.baseUrl + "/auth/refresh", {
        method: "POST",
        credentials: "include",
      }).finally(() => { refreshing = null; });
    }
    const refreshed = await refreshing;
    if (refreshed.ok) return request(method, path, { body, query, raw, contentType }, true);
  }

  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data.error || {};
    throw new ApiError(res.status, err.code || "ERROR", err.message);
  }
  return data;
}

export const api = {
  configure,
  ApiError,

  auth: {
    // Full-page redirect into Google OAuth.
    startLogin(redirectTo = location.href) {
      const u = new URL(config.baseUrl + "/auth/google/start", config.baseUrl || location.origin);
      u.searchParams.set("redirect_to", redirectTo);
      location.assign(u.toString());
    },
    refresh: () => request("POST", "/auth/refresh"),
    logout: () => request("POST", "/auth/logout"),
  },

  me: {
    get: () => request("GET", "/api/me").then((d) => d.user),
    update: (patch) => request("PATCH", "/api/me", { body: patch }).then((d) => d.user),
    following: (cursor) => request("GET", "/api/me/following", { query: { cursor } }),
  },

  beats: {
    // beat: { title, genre, mood, bpm, visibility, document, remixOf? }
    create: (beat) => request("POST", "/api/beats", { body: beat }).then((d) => d.beat),
    get: (id) => request("GET", `/api/beats/${id}`).then((d) => d.beat),
    update: (id, patch) => request("PUT", `/api/beats/${id}`, { body: patch }).then((d) => d.beat),
    remove: (id) => request("DELETE", `/api/beats/${id}`),
    listMine: (cursor, limit) => request("GET", "/api/me/beats", { query: { cursor, limit } }),
    play: (id) => request("POST", `/api/beats/${id}/play`),
    like: (id) => request("POST", `/api/beats/${id}/like`),
    unlike: (id) => request("DELETE", `/api/beats/${id}/like`),
  },

  feed: {
    // sort: "recent" | "top"; genre: optional
    discover: (opts = {}) => request("GET", "/api/feed", { query: opts }),
  },

  comments: {
    // Newest-first page of comments on a beat: { items, nextCursor }.
    list: (beatId, opts = {}) => request("GET", `/api/beats/${beatId}/comments`, { query: opts }),
    add: (beatId, body) =>
      request("POST", `/api/beats/${beatId}/comments`, { body: { body } }).then((d) => d.comment),
    remove: (id) => request("DELETE", `/api/comments/${id}`),
  },

  users: {
    profile: (username) => request("GET", `/api/users/${username}`).then((d) => d.user),
    follow: (id) => request("POST", `/api/users/${id}/follow`),
    unfollow: (id) => request("DELETE", `/api/users/${id}/follow`),
  },
};
