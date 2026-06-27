import type { RequestContext } from "../context.js";
import { requireViewer } from "../context.js";
import { json } from "../response.js";
import { readJson } from "../body.js";
import { asObject, optionalString } from "../../../shared/validation.js";
import { toPublicProfile } from "../../../domain/entities/user.js";

export const userController = {
  // GET /api/me — the signed-in user's own (private) record + stats.
  async me(c: RequestContext): Promise<Response> {
    const viewer = requireViewer(c);
    const user = await c.services.users.me(viewer.sub);
    return json({
      user: {
        ...toPublicProfile(user),
        email: user.email,
        createdAt: user.createdAt,
      },
    });
  },

  // PATCH /api/me — update display name / bio / avatar.
  async updateMe(c: RequestContext): Promise<Response> {
    const viewer = requireViewer(c);
    const body = asObject(await readJson(c.req));
    const user = await c.services.users.updateProfile(viewer.sub, {
      ...(body.displayName !== undefined && {
        displayName: optionalString(body, "displayName", { max: 60 }),
      }),
      ...(body.bio !== undefined && { bio: optionalString(body, "bio", { max: 280 }) ?? "" }),
      ...(body.avatarUrl !== undefined && {
        avatarUrl: optionalString(body, "avatarUrl", { max: 500 }) ?? null,
      }),
    });
    return json({ user: toPublicProfile(user) });
  },

  // GET /api/users/:username — public profile by handle.
  async profile(c: RequestContext): Promise<Response> {
    const profile = await c.services.users.profileByUsername(
      c.params.username!,
      c.viewer?.sub ?? null,
    );
    return json({ user: profile });
  },
};
