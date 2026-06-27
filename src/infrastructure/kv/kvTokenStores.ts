import type {
  RefreshTokenStore,
  RefreshRecord,
  OAuthStateStore,
  OAuthStateData,
} from "../../domain/repositories/tokenStore.js";

// Refresh tokens are opaque, hashed before they become a KV key so a KV dump
// never reveals usable tokens. TTL is delegated to KV (auto-expiry).
export class KvRefreshTokenStore implements RefreshTokenStore {
  constructor(private readonly kv: KVNamespace) {}

  async save(token: string, record: RefreshRecord, ttlSeconds: number): Promise<void> {
    await this.kv.put(await keyFor(token), JSON.stringify(record), {
      expirationTtl: ttlSeconds,
    });
  }

  async get(token: string): Promise<RefreshRecord | null> {
    return (await this.kv.get<RefreshRecord>(await keyFor(token), "json")) ?? null;
  }

  async revoke(token: string): Promise<void> {
    await this.kv.delete(await keyFor(token));
  }
}

// Short-lived OAuth handshake state (PKCE verifier + post-login redirect).
// `consume` deletes on read so a state can't be replayed.
export class KvOAuthStateStore implements OAuthStateStore {
  constructor(private readonly kv: KVNamespace) {}

  async save(state: string, data: OAuthStateData, ttlSeconds: number): Promise<void> {
    await this.kv.put(`oauth:${state}`, JSON.stringify(data), {
      expirationTtl: Math.max(60, ttlSeconds),
    });
  }

  async consume(state: string): Promise<OAuthStateData | null> {
    const key = `oauth:${state}`;
    const data = await this.kv.get<OAuthStateData>(key, "json");
    if (data) await this.kv.delete(key);
    return data ?? null;
  }
}

async function keyFor(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `refresh:${hex}`;
}
