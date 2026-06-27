import type { Env, AppConfig } from "../../config/env.js";
import type { Container } from "../../container.js";
import type { AccessTokenClaims } from "../../application/ports/tokenSigner.js";
import { AppError } from "../../shared/errors.js";

// Everything a route handler needs, assembled once per request.
export interface RequestContext {
  req: Request;
  url: URL;
  params: Record<string, string>;
  env: Env;
  config: AppConfig;
  services: Container;
  ctx: ExecutionContext;
  // Populated by optional-auth resolution; null for anonymous requests.
  viewer: AccessTokenClaims | null;
  requestId: string;
}

export type Handler = (c: RequestContext) => Promise<Response> | Response;

// Guard for protected routes — returns the viewer or throws 401.
export function requireViewer(c: RequestContext): AccessTokenClaims {
  if (!c.viewer) throw AppError.unauthorized();
  return c.viewer;
}
