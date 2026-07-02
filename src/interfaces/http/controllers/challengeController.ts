import type { RequestContext } from "../context.js";
import { requireViewer } from "../context.js";
import { json, noContent } from "../response.js";
import { readJson } from "../body.js";
import { enforceRateLimit } from "../middleware/rateLimit.js";
import { asObject, requireString } from "../../../shared/validation.js";

export const challengeController = {
  // GET /api/challenges/today — the day's prompt + the viewer's own entry.
  // Optional auth (anonymous visitors can read the challenge).
  async today(c: RequestContext): Promise<Response> {
    const challenge = await c.services.challenges.today(c.viewer?.sub ?? null);
    return json({ challenge });
  },

  // GET /api/challenges/today/leaderboard — ranked entries + the challenge.
  async leaderboard(c: RequestContext): Promise<Response> {
    const result = await c.services.challenges.leaderboard(c.viewer?.sub ?? null);
    return json(result);
  },

  // POST /api/challenges/today/entries — submit one of your beats { beatId }.
  async submit(c: RequestContext): Promise<Response> {
    const viewer = requireViewer(c);
    await enforceRateLimit(c, c.services.rateLimiter, {
      bucket: "challenge-write",
      limit: 30,
      windowSeconds: 60,
    });
    const body = asObject(await readJson(c.req));
    const beatId = requireString(body, "beatId", { min: 1, max: 64 });

    const entry = await c.services.challenges.submit(viewer.sub, beatId);
    return json({ entry }, { status: 201 });
  },

  // DELETE /api/challenges/today/entry — withdraw your submission.
  async withdraw(c: RequestContext): Promise<Response> {
    const viewer = requireViewer(c);
    await c.services.challenges.withdraw(viewer.sub);
    return noContent();
  },

  // POST /api/challenges/entries/:id/like — like an entry (challenge-scoped).
  async like(c: RequestContext): Promise<Response> {
    const viewer = requireViewer(c);
    await enforceRateLimit(c, c.services.rateLimiter, {
      bucket: "challenge-like",
      limit: 120,
      windowSeconds: 60,
    });
    const result = await c.services.challenges.likeEntry(viewer.sub, c.params.id!);
    return json(result);
  },

  // DELETE /api/challenges/entries/:id/like — remove your like.
  async unlike(c: RequestContext): Promise<Response> {
    const viewer = requireViewer(c);
    const result = await c.services.challenges.unlikeEntry(viewer.sub, c.params.id!);
    return json(result);
  },
};
