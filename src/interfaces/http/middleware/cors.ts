import type { AppConfig } from "../../../config/env.js";

// CORS for the SPA. Credentials are allowed (cookies), so the origin must be
// echoed explicitly (never "*") and limited to the configured app origin.
export function corsHeaders(req: Request, config: AppConfig): Headers {
  const headers = new Headers();
  const origin = req.headers.get("origin");
  if (origin && origin === config.appOrigin) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-credentials", "true");
    headers.set("vary", "Origin");
  }
  return headers;
}

export function handlePreflight(req: Request, config: AppConfig): Response | null {
  if (req.method !== "OPTIONS") return null;
  const headers = corsHeaders(req, config);
  headers.set("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  headers.set(
    "access-control-allow-headers",
    req.headers.get("access-control-request-headers") || "content-type,authorization",
  );
  headers.set("access-control-max-age", "86400");
  return new Response(null, { status: 204, headers });
}

export function applyCors(res: Response, req: Request, config: AppConfig): Response {
  const cors = corsHeaders(req, config);
  if (![...cors.keys()].length) return res;
  const merged = new Headers(res.headers);
  cors.forEach((v, k) => merged.set(k, v));
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: merged });
}
