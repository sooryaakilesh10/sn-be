import type { RequestContext } from "../context.js";
import { requireViewer } from "../context.js";
import { json, noContent } from "../response.js";
import { readJson } from "../body.js";
import { enforceRateLimit } from "../middleware/rateLimit.js";
import { parseLimit, decodeCursor } from "../../../shared/pagination.js";
import { asObject, requireString } from "../../../shared/validation.js";

export const commentController = {
  // GET /api/beats/:id/comments — newest first, keyset-paginated. Optional auth
  // (so anonymous visitors can read); `canDelete` reflects the viewer's rights.
  async list(c: RequestContext): Promise<Response> {
    const page = await c.services.comments.list(
      c.viewer?.sub ?? null,
      c.params.id!,
      decodeCursor(c.url.searchParams.get("cursor")),
      parseLimit(c.url.searchParams.get("limit")),
    );
    return json(page);
  },

  // POST /api/beats/:id/comments — add a comment to a beat.
  async create(c: RequestContext): Promise<Response> {
    const viewer = requireViewer(c);
    await enforceRateLimit(c, c.services.rateLimiter, {
      bucket: "comment-write",
      limit: 30,
      windowSeconds: 60,
    });
    const body = asObject(await readJson(c.req));
    const text = requireString(body, "body", { min: 1, max: 500 });

    const comment = await c.services.comments.add(viewer.sub, c.params.id!, text);
    return json({ comment }, { status: 201 });
  },

  // DELETE /api/comments/:id — author or beat owner may remove.
  async remove(c: RequestContext): Promise<Response> {
    const viewer = requireViewer(c);
    await c.services.comments.remove(viewer.sub, c.params.id!);
    return noContent();
  },
};
