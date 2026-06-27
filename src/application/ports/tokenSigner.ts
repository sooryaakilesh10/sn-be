// Port for issuing/verifying stateless access tokens (JWT). Verification happens
// at the edge on every request with no storage round-trip — this is what lets
// the API scale horizontally without a shared session store.

export interface AccessTokenClaims {
  sub: string;        // user id
  username: string;
  iat: number;
  exp: number;
}

export interface TokenSigner {
  sign(payload: { sub: string; username: string }, ttlSeconds: number): Promise<string>;
  verify(token: string): Promise<AccessTokenClaims | null>;
}
