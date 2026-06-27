import type { RequestContext } from "../context.js";
import { requireViewer } from "../context.js";
import { json } from "../response.js";
import { parseLimit } from "../../../shared/pagination.js";

export const recommendationController = {
  // GET /api/recommendations/users — suggested creators to follow.
  async users(c: RequestContext): Promise<Response> {
    const viewer = requireViewer(c);
    const limit = parseLimit(c.url.searchParams.get("limit"));
    const users = await c.services.recommendations.suggestUsers(viewer.sub, limit);
    return json({ users });
  },
};
