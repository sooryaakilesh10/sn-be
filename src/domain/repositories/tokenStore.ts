// Persistence ports for auth state that must outlive a single request but isn't
// relational: rotating refresh tokens and short-lived OAuth handshake state.
// Backed by KV (globally replicated, TTL-native) in infrastructure.

export interface RefreshRecord {
  userId: string;
  // Rotation chain id — lets us detect refresh-token reuse (theft).
  family: string;
  createdAt: number;
}

export interface RefreshTokenStore {
  save(token: string, record: RefreshRecord, ttlSeconds: number): Promise<void>;
  get(token: string): Promise<RefreshRecord | null>;
  revoke(token: string): Promise<void>;
}

export interface OAuthStateData {
  codeVerifier: string;
  // Where to send the browser after a successful login.
  redirectTo: string;
  createdAt: number;
}

export interface OAuthStateStore {
  save(state: string, data: OAuthStateData, ttlSeconds: number): Promise<void>;
  // One-time: reading consumes the state to prevent replay.
  consume(state: string): Promise<OAuthStateData | null>;
}
