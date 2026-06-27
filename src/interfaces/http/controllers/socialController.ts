import type { RequestContext } from "../context.js";
import { requireViewer } from "../context.js";
import { json } from "../response.js";
import { parseLimit, decodeCursor } from "../../../shared/pagination.js";

export const socialController = {
  // POST /api/beats/:id/like
  async like(c: RequestContext): Promise<Response> {
    const viewer = requireViewer(c);
    const result = await c.services.social.like(viewer.sub, c.params.id!);
    return json(result);
  },

  // DELETE /api/beats/:id/like
  async unlike(c: RequestContext): Promise<Response> {
    const viewer = requireViewer(c);
    const result = await c.services.social.unlike(viewer.sub, c.params.id!);
    return json(result);
  },

  // POST /api/users/:id/follow
  async follow(c: RequestContext): Promise<Response> {
    const viewer = requireViewer(c);
    const result = await c.services.social.follow(viewer.sub, c.params.id!);
    return json(result);
  },

  // DELETE /api/users/:id/follow
  async unfollow(c: RequestContext): Promise<Response> {
    const viewer = requireViewer(c);
    const result = await c.services.social.unfollow(viewer.sub, c.params.id!);
    return json(result);
  },

  // GET /api/me/following — artists the viewer follows.
  async following(c: RequestContext): Promise<Response> {
    const viewer = requireViewer(c);
    const page = await c.services.social.listFollowing(
      viewer.sub,
      decodeCursor(c.url.searchParams.get("cursor")),
      parseLimit(c.url.searchParams.get("limit")),
    );
    return json(page);
  },
};
