import type { Env } from "./config/env.js";
import { loadConfig } from "./config/env.js";
import { buildContainer } from "./container.js";
import { buildRouter } from "./interfaces/http/routes.js";
import type { RequestContext } from "./interfaces/http/context.js";
import { resolveViewer } from "./interfaces/http/middleware/auth.js";
import { handlePreflight, applyCors } from "./interfaces/http/middleware/cors.js";
import { toErrorResponse } from "./interfaces/http/middleware/error.js";

// The router is stateless, so build it once at module scope. It is reused for
// the lifetime of the isolate across many requests — only per-request state
// (config, container, viewer) is rebuilt inside `fetch`.
const router = buildRouter();

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const requestId = crypto.randomUUID();
    let config;
    try {
      config = loadConfig(env);
    } catch (err) {
      // Misconfiguration — fail closed without leaking which secret is missing.
      return toErrorResponse(err, requestId, true);
    }

    // CORS preflight short-circuits before any work.
    const preflight = handlePreflight(req, config);
    if (preflight) return preflight;

    try {
      const url = new URL(req.url);
      const services = buildContainer(env, config);

      // Optional auth: stateless JWT verification, no storage round-trip.
      const viewer = await resolveViewer(req, services.tokenSigner);

      const { handler, params } = router.match(req.method, url.pathname);

      const context: RequestContext = {
        req,
        url,
        params,
        env,
        config,
        services,
        ctx,
        viewer,
        requestId,
      };

      const response = await handler(context);
      return applyCors(response, req, config);
    } catch (err) {
      return applyCors(toErrorResponse(err, requestId, config.isProduction), req, config);
    }
  },
};
