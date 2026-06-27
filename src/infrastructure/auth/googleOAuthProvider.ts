import type {
  OAuthProvider,
  AuthorizationRequest,
  OAuthProfile,
} from "../../application/ports/oauthProvider.js";
import { AppError } from "../../shared/errors.js";
import { randomToken, base64UrlEncode } from "../../shared/id.js";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

// Authorization-Code flow with PKCE. We exchange the code server-side, then
// read the verified profile from the OIDC userinfo endpoint (avoids shipping
// JWKS verification while remaining secure — the access token came straight
// from Google over TLS).
export class GoogleOAuthProvider implements OAuthProvider {
  constructor(private readonly config: GoogleConfig) {}

  async buildAuthorizationRequest(): Promise<AuthorizationRequest> {
    const state = randomToken(16);
    const codeVerifier = randomToken(32);
    const codeChallenge = await s256(codeVerifier);

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      access_type: "offline",
      prompt: "consent",
    });

    return { url: `${AUTH_ENDPOINT}?${params}`, state, codeVerifier };
  }

  async exchangeCode(code: string, codeVerifier: string): Promise<OAuthProfile> {
    const tokenRes = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
        grant_type: "authorization_code",
        code_verifier: codeVerifier,
      }),
    });
    if (!tokenRes.ok) {
      throw AppError.unauthorized("Google token exchange failed");
    }
    const tokens = (await tokenRes.json()) as { access_token?: string };
    if (!tokens.access_token) throw AppError.unauthorized("No access token from Google");

    const userRes = await fetch(USERINFO_ENDPOINT, {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    if (!userRes.ok) throw AppError.unauthorized("Failed to load Google profile");

    const info = (await userRes.json()) as {
      sub: string;
      email: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
    };

    return {
      sub: info.sub,
      email: info.email,
      emailVerified: info.email_verified ?? false,
      name: info.name || info.email,
      picture: info.picture ?? null,
    };
  }
}

// PKCE S256 challenge = base64url(SHA-256(verifier)).
async function s256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}
