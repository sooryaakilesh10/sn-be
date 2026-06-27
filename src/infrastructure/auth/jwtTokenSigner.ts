import type { TokenSigner, AccessTokenClaims } from "../../application/ports/tokenSigner.js";
import { base64UrlEncode } from "../../shared/id.js";

// HS256 JWT signer built on WebCrypto — no dependencies, runs at the edge.
// Access tokens are verified statelessly on every request, so there is no
// shared session store to become a scaling bottleneck.
export class JwtTokenSigner implements TokenSigner {
  private keyPromise: Promise<CryptoKey> | null = null;

  constructor(private readonly secret: string) {}

  private key(): Promise<CryptoKey> {
    if (!this.keyPromise) {
      this.keyPromise = crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(this.secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"],
      );
    }
    return this.keyPromise;
  }

  async sign(payload: { sub: string; username: string }, ttlSeconds: number): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const claims: AccessTokenClaims = {
      sub: payload.sub,
      username: payload.username,
      iat: now,
      exp: now + ttlSeconds,
    };
    const header = encode({ alg: "HS256", typ: "JWT" });
    const body = encode(claims);
    const data = `${header}.${body}`;
    const sig = await crypto.subtle.sign("HMAC", await this.key(), bytes(data));
    return `${data}.${base64UrlEncode(new Uint8Array(sig))}`;
  }

  async verify(token: string): Promise<AccessTokenClaims | null> {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts as [string, string, string];

    const valid = await crypto.subtle.verify(
      "HMAC",
      await this.key(),
      base64UrlDecode(sig),
      bytes(`${header}.${body}`),
    );
    if (!valid) return null;

    let claims: AccessTokenClaims;
    try {
      claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(body)));
    } catch {
      return null;
    }
    if (typeof claims.exp !== "number" || claims.exp < Math.floor(Date.now() / 1000)) {
      return null; // expired
    }
    return claims;
  }
}

function encode(obj: unknown): string {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(obj)));
}

function bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function base64UrlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
