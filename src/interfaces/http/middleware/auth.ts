import type { TokenSigner, AccessTokenClaims } from "../../../application/ports/tokenSigner.js";
import { readCookie } from "../response.js";

export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";

// Optional auth: resolves the viewer from the access-token cookie (or a Bearer
// header, for non-browser clients). Never throws — protected routes enforce
// presence via `requireViewer`. Verification is a stateless HMAC check, so this
// adds no storage round-trip to any request.
export async function resolveViewer(
  req: Request,
  signer: TokenSigner,
): Promise<AccessTokenClaims | null> {
  const token = bearer(req) ?? readCookie(req, ACCESS_COOKIE);
  if (!token) return null;
  return signer.verify(token);
}

function bearer(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}
