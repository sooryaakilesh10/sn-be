import type { RequestContext } from "../context.js";
import type { IssuedSession } from "../../../application/services/authService.js";
import { json, redirect, serializeCookie, clearCookie, readCookie } from "../response.js";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "../middleware/auth.js";
import { enforceRateLimit } from "../middleware/rateLimit.js";
import { AppError } from "../../../shared/errors.js";
import { toPublicProfile } from "../../../domain/entities/user.js";

// Refresh cookie is scoped to the auth path so it isn't sent on every API call.
const REFRESH_PATH = "/auth";

export const authController = {
  // GET /auth/google/start — begins the OAuth dance.
  async start(c: RequestContext): Promise<Response> {
    const redirectTo = c.url.searchParams.get("redirect_to") ?? undefined;
    const url = await c.services.auth.startLogin(redirectTo);
    return redirect(url);
  },

  // GET /auth/google/callback — Google redirects here with ?code&state.
  async callback(c: RequestContext): Promise<Response> {
    const code = c.url.searchParams.get("code");
    const state = c.url.searchParams.get("state");
    if (!code || !state) throw AppError.badRequest("Missing code or state");

    const { session, redirectTo } = await c.services.auth.handleCallback(code, state);
    const headers = sessionCookies(c, session);
    return redirect(redirectTo, headers);
  },

  // POST /auth/refresh — rotates tokens using the refresh cookie.
  async refresh(c: RequestContext): Promise<Response> {
    await enforceRateLimit(c, c.services.rateLimiter, {
      bucket: "auth-refresh",
      limit: 30,
      windowSeconds: 60,
    });
    const token = readCookie(c.req, REFRESH_COOKIE);
    if (!token) throw AppError.unauthorized("No refresh token");

    const session = await c.services.auth.refresh(token);
    const headers = sessionCookies(c, session);
    return json({ user: toPublicProfile(session.user) }, { headers });
  },

  // POST /auth/logout — revokes the refresh token and clears cookies.
  async logout(c: RequestContext): Promise<Response> {
    const token = readCookie(c.req, REFRESH_COOKIE);
    await c.services.auth.logout(token);

    const headers = new Headers();
    headers.append("set-cookie", clearCookie(ACCESS_COOKIE, "/", c.config));
    headers.append("set-cookie", clearCookie(REFRESH_COOKIE, REFRESH_PATH, c.config));
    return json({ ok: true }, { headers });
  },
};

function sessionCookies(c: RequestContext, session: IssuedSession): Headers {
  const headers = new Headers();
  headers.append(
    "set-cookie",
    serializeCookie(ACCESS_COOKIE, session.accessToken, {
      maxAge: session.accessTtl,
      path: "/",
      config: c.config,
    }),
  );
  headers.append(
    "set-cookie",
    serializeCookie(REFRESH_COOKIE, session.refreshToken, {
      maxAge: session.refreshTtl,
      path: REFRESH_PATH,
      config: c.config,
    }),
  );
  return headers;
}
