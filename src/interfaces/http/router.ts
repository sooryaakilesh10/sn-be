import type { Handler, RequestContext } from "./context.js";
import { AppError } from "../../shared/errors.js";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface Route {
  method: Method;
  segments: string[]; // pattern split on "/", with ":name" params
  handler: Handler;
}

// Minimal trie-free router: routes are bucketed by segment count so matching is
// O(routes-with-this-length). Zero dependencies keeps the bundle tiny and cold
// starts fast.
export class Router {
  private routes: Route[] = [];

  add(method: Method, pattern: string, handler: Handler): this {
    this.routes.push({ method, segments: split(pattern), handler });
    return this;
  }

  get(p: string, h: Handler) { return this.add("GET", p, h); }
  post(p: string, h: Handler) { return this.add("POST", p, h); }
  put(p: string, h: Handler) { return this.add("PUT", p, h); }
  patch(p: string, h: Handler) { return this.add("PATCH", p, h); }
  delete(p: string, h: Handler) { return this.add("DELETE", p, h); }

  // Returns the handler + extracted params, or null if no path matches at all.
  // `pathMatched` distinguishes 404 (no path) from 405 (path, wrong method).
  match(method: string, path: string): { handler: Handler; params: Record<string, string> } {
    const parts = split(path);
    let pathMatched = false;

    for (const route of this.routes) {
      if (route.segments.length !== parts.length) continue;
      const params = tryMatch(route.segments, parts);
      if (!params) continue;
      pathMatched = true;
      if (route.method === method) return { handler: route.handler, params };
    }

    if (pathMatched) throw AppError.badRequest(`Method ${method} not allowed`);
    throw AppError.notFound("Route not found");
  }
}

function split(path: string): string[] {
  return path.split("/").filter((s) => s.length > 0);
}

function tryMatch(pattern: string[], parts: string[]): Record<string, string> | null {
  const params: Record<string, string> = {};
  for (let i = 0; i < pattern.length; i++) {
    const seg = pattern[i]!;
    const val = parts[i]!;
    if (seg.startsWith(":")) {
      params[seg.slice(1)] = decodeURIComponent(val);
    } else if (seg !== val) {
      return null;
    }
  }
  return params;
}

export type { RequestContext };
