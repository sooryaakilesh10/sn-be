import type { SocialRepository } from "../../domain/repositories/socialRepository.js";
import type { UserRepository } from "../../domain/repositories/userRepository.js";
import { toPublicProfile, type PublicProfile } from "../../domain/entities/user.js";

// Suggests creators the viewer might want to follow. The repository ranks
// friends-of-friends first (people your friends follow) and tops up with
// popular creators, so both connected and brand-new users get good picks.
export class RecommendationService {
  constructor(
    private readonly social: SocialRepository,
    private readonly users: UserRepository,
  ) {}

  async suggestUsers(viewerId: string, limit: number): Promise<PublicProfile[]> {
    const ids = await this.social.suggestedUserIds(viewerId, limit);
    if (ids.length === 0) return [];
    const map = await this.users.findManyByIds(ids);
    // Preserve ranking order; these are, by construction, not yet followed.
    return ids
      .map((id) => map.get(id))
      .filter((u): u is NonNullable<typeof u> => Boolean(u))
      .map((u) => toPublicProfile(u, false));
  }
}
