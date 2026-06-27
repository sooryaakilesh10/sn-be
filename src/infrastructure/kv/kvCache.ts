import type { Cache } from "../../domain/repositories/cache.js";

// Edge cache over Workers KV. Reads are served from the nearest PoP, which is
// what lets a viral feed be served without touching the database.
export class KvCache implements Cache {
  constructor(private readonly kv: KVNamespace) {}

  async get<T>(key: string): Promise<T | null> {
    return (await this.kv.get<T>(key, "json")) ?? null;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    // KV requires a TTL of >= 60s; values meant to live "forever" (the feed
    // generation marker) pass ttl 0 and are stored without expiration.
    const options =
      ttlSeconds >= 60 ? { expirationTtl: ttlSeconds } : undefined;
    await this.kv.put(key, JSON.stringify(value), options);
  }

  async delete(key: string): Promise<void> {
    await this.kv.delete(key);
  }
}
