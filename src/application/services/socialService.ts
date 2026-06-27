import type { BeatRepository } from "../../domain/repositories/beatRepository.js";
import type { UserRepository } from "../../domain/repositories/userRepository.js";
import type { SocialRepository } from "../../domain/repositories/socialRepository.js";
import type { Cache } from "../../domain/repositories/cache.js";
import type { Page } from "../../shared/pagination.js";
import type { PublicProfile } from "../../domain/entities/user.js";
import { toPublicProfile } from "../../domain/entities/user.js";
import { buildPage } from "../../shared/pagination.js";
import { AppError } from "../../shared/errors.js";
import { feedCacheTag } from "./feedService.js";

export interface LikeResult {
  liked: boolean;
  likesCount: number;
}

export interface FollowResult {
  following: boolean;
}

// Likes and follows. Each mutation is idempotent so retries (flaky mobile
// networks) never double-count.
export class SocialService {
  constructor(
    private readonly social: SocialRepository,
    private readonly beats: BeatRepository,
    private readonly users: UserRepository,
    private readonly cache: Cache,
  ) {}

  async like(viewerId: string, beatId: string): Promise<LikeResult> {
    const beat = await this.beats.findById(beatId);
    if (!beat || (beat.visibility !== "public" && beat.userId !== viewerId)) {
      throw AppError.notFound("Beat not found");
    }
    const changed = await this.social.like(viewerId, beatId);
    if (changed && beat.visibility === "public") await this.bumpFeed();
    return { liked: true, likesCount: beat.likesCount + (changed ? 1 : 0) };
  }

  async unlike(viewerId: string, beatId: string): Promise<LikeResult> {
    const beat = await this.beats.findById(beatId);
    if (!beat) throw AppError.notFound("Beat not found");
    const changed = await this.social.unlike(viewerId, beatId);
    if (changed && beat.visibility === "public") await this.bumpFeed();
    return { liked: false, likesCount: Math.max(0, beat.likesCount - (changed ? 1 : 0)) };
  }

  async follow(viewerId: string, targetId: string): Promise<FollowResult> {
    if (viewerId === targetId) throw AppError.badRequest("You cannot follow yourself");
    const target = await this.users.findById(targetId);
    if (!target) throw AppError.notFound("User not found");
    await this.social.follow(viewerId, targetId);
    return { following: true };
  }

  async unfollow(viewerId: string, targetId: string): Promise<FollowResult> {
    await this.social.unfollow(viewerId, targetId);
    return { following: false };
  }

  async listFollowing(
    viewerId: string,
    cursor: string | null,
    limit: number,
  ): Promise<Page<PublicProfile>> {
    const ids = await this.social.listFollowing(viewerId, cursor, limit + 1);
    const page = buildPage(ids, limit, (id) => id);
    const userMap = await this.users.findManyByIds(page.items);
    const items = page.items
      .map((id) => userMap.get(id))
      .filter((u): u is NonNullable<typeof u> => Boolean(u))
      .map((u) => toPublicProfile(u, true));
    return { items, nextCursor: page.nextCursor };
  }

  private async bumpFeed(): Promise<void> {
    // Like counts feed "top" ordering; invalidate cached pages.
    await this.cache.set(feedCacheTag, Date.now(), 0);
  }
}
