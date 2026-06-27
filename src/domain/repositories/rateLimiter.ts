export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetSeconds: number;
}

// Fixed-window rate limiting. Backed by KV counters at the edge — approximate
// but cheap and globally distributed, which is the right trade-off for abuse
// protection (vs. exact limiting that would need a central coordinator).
export interface RateLimiter {
  check(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;
}
