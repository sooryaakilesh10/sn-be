import type { SocialRepository } from "../../domain/repositories/socialRepository.js";
import type { UserRepository } from "../../domain/repositories/userRepository.js";
import type { Cache } from "../../domain/repositories/cache.js";
import { toPublicProfile, type PublicProfile } from "../../domain/entities/user.js";

// Suggestions change slowly and aren't critical, so a short read-through cache
// avoids re-running the (relatively heavy) friends-of-friends query on every
// page load. A brand-new follow may linger here for at most this long.
const REC_TTL_SECONDS = 60;

// Suggests creators the viewer might want to follow. The repository ranks
// friends-of-friends first (people your friends follow) and tops up with
// popular creators, so both connected and brand-new users get good picks.
export class RecommendationService {
  constructor(
    private readonly social: SocialRepository,
    private readonly users: UserRepository,
    private readonly cache: Cache,
  ) {}

  async suggestUsers(viewerId: string, limit: number): Promise<PublicProfile[]> {
    const cacheKey = `rec:users:${viewerId}:${limit}`;
    const cached = await this.cache.get<PublicProfile[]>(cacheKey);
    if (cached) return cached;

    const ids = await this.social.suggestedUserIds(viewerId, limit);
    if (ids.length === 0) {
      await this.cache.set(cacheKey, [], REC_TTL_SECONDS);
      return [];
    }
    const map = await this.users.findManyByIds(ids);
    // Preserve ranking order; these are, by construction, not yet followed.
    const result = ids
      .map((id) => map.get(id))
      .filter((u): u is NonNullable<typeof u> => Boolean(u))
      .map((u) => toPublicProfile(u, false));

    await this.cache.set(cacheKey, result, REC_TTL_SECONDS);
    return result;
  }
}
