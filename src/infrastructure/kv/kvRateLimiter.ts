import type { RateLimiter, RateLimitResult } from "../../domain/repositories/rateLimiter.js";

// Fixed-window limiter over KV. Approximate (KV is eventually consistent) but
// distributed and cheap — the right trade-off for coarse abuse protection.
// For strict per-key limits you'd promote a hot key to a Durable Object.
export class KvRateLimiter implements RateLimiter {
  constructor(private readonly kv: KVNamespace) {}

  async check(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const now = Math.floor(Date.now() / 1000);
    const window = Math.floor(now / windowSeconds);
    const bucketKey = `rl:${key}:${window}`;
    const resetSeconds = (window + 1) * windowSeconds - now;

    const current = Number((await this.kv.get(bucketKey)) ?? 0);
    if (current >= limit) {
      return { allowed: false, remaining: 0, resetSeconds };
    }

    // Best-effort increment. A small amount of slippage under heavy concurrency
    // is acceptable for abuse limiting and keeps this lock-free.
    await this.kv.put(bucketKey, String(current + 1), {
      expirationTtl: Math.max(60, windowSeconds),
    });
    return { allowed: true, remaining: limit - current - 1, resetSeconds };
  }
}
