import type { AppConfig } from "../../config/env.js";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { ...JSON_HEADERS, ...(init.headers ?? {}) },
  });
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}

export function redirect(location: string, headers: Headers = new Headers()): Response {
  headers.set("location", location);
  return new Response(null, { status: 302, headers });
}

// --- cookies -------------------------------------------------------------
// Access + refresh tokens are stored in HttpOnly, Secure, SameSite cookies so
// the SPA never touches them from JS (XSS-resistant). The refresh cookie is
// path-scoped to the auth routes so it isn't sent on every API call.

export interface CookieOptions {
  maxAge: number;
  path?: string;
  config: AppConfig;
}

export function serializeCookie(name: string, value: string, opts: CookieOptions): string {
  const parts = [
    `${name}=${value}`,
    `Path=${opts.path ?? "/"}`,
    `Max-Age=${opts.maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (opts.config.isProduction) parts.push("Secure");
  if (opts.config.cookieDomain) parts.push(`Domain=${opts.config.cookieDomain}`);
  return parts.join("; ");
}

export function clearCookie(name: string, path: string, config: AppConfig): string {
  return serializeCookie(name, "", { maxAge: 0, path, config });
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const pair of header.split(/;\s*/)) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    if (pair.slice(0, eq) === name) return pair.slice(eq + 1);
  }
  return null;
}
