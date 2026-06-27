import type { RequestContext } from "../context.js";
import type { RateLimiter } from "../../../domain/repositories/rateLimiter.js";
import { AppError } from "../../../shared/errors.js";

// Identify the caller for rate limiting: the authenticated user if known,
// otherwise the client IP from Cloudflare's trusted header.
function callerKey(c: RequestContext): string {
  if (c.viewer) return `u:${c.viewer.sub}`;
  return `ip:${c.req.headers.get("cf-connecting-ip") ?? "unknown"}`;
}

export interface RateLimitOptions {
  bucket: string;     // logical bucket name (e.g. "mutations", "auth")
  limit: number;
  windowSeconds: number;
}

// Enforce a limit for this request, throwing 429 when exceeded. Returns headers
// to attach to the response so clients can self-throttle.
export async function enforceRateLimit(
  c: RequestContext,
  limiter: RateLimiter,
  opts: RateLimitOptions,
): Promise<Record<string, string>> {
  const result = await limiter.check(
    `${opts.bucket}:${callerKey(c)}`,
    opts.limit,
    opts.windowSeconds,
  );
  if (!result.allowed) {
    const err = AppError.rateLimited();
    (err as AppError & { retryAfter?: number }).retryAfter = result.resetSeconds;
    throw err;
  }
  return {
    "x-ratelimit-limit": String(opts.limit),
    "x-ratelimit-remaining": String(result.remaining),
    "x-ratelimit-reset": String(result.resetSeconds),
  };
}
