// Port for an OpenID Connect provider (Google). Keeping this an interface lets
// the auth service stay provider-agnostic and unit-testable with a fake.

export interface AuthorizationRequest {
  url: string;          // where to redirect the browser
  state: string;        // CSRF/replay guard
  codeVerifier: string; // PKCE verifier to persist until callback
}

export interface OAuthProfile {
  sub: string;          // stable provider user id
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string | null;
}

export interface OAuthProvider {
  buildAuthorizationRequest(): Promise<AuthorizationRequest>;
  // Exchanges the auth code (with PKCE verifier) and returns the verified
  // profile of the signed-in user.
  exchangeCode(code: string, codeVerifier: string): Promise<OAuthProfile>;
}
