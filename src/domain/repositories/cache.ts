// Read-through cache port for hot, eventually-consistent reads (the discover
// feed). Backed by KV at the edge so popular feeds are served without ever
// touching D1.

export interface Cache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
}
