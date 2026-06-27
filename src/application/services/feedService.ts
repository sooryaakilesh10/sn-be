import type { Beat, BeatView, Genre } from "../../domain/entities/beat.js";
import type { BeatRepository, FeedSort } from "../../domain/repositories/beatRepository.js";
import type { UserRepository } from "../../domain/repositories/userRepository.js";
import type { SocialRepository } from "../../domain/repositories/socialRepository.js";
import type { Cache } from "../../domain/repositories/cache.js";
import type { Page } from "../../shared/pagination.js";
import { buildPage } from "../../shared/pagination.js";
import { presentBeat } from "../presenters/beatPresenter.js";

// Single key holding a monotonically-increasing generation number. Any write to
// public content bumps it, atomically invalidating all cached feed pages.
export const feedCacheTag = "feed:generation";

// KV's minimum TTL is 60s; feeds are hot and tolerate this much staleness, and
// any public write bumps the generation tag to invalidate sooner anyway.
const FEED_TTL_SECONDS = 60;

interface CachedFeed {
  beats: Beat[];
  authors: Array<{ id: string; username: string; displayName: string; avatarUrl: string | null }>;
  nextCursor: string | null;
}

export interface FeedRequest {
  sort: FeedSort;
  genre?: Genre;
  cursor: string | null;
  limit: number;
  viewerId: string | null;
}

// Serves the discover feed. The expensive part (public beats + their authors)
// is cached at the edge and shared across all viewers; the cheap per-viewer
// part (which beats *you* liked) is layered on after the cache read.
export class FeedService {
  constructor(
    private readonly beats: BeatRepository,
    private readonly users: UserRepository,
    private readonly social: SocialRepository,
    private readonly cache: Cache,
    private readonly assetBase: string,
  ) {}

  async discover(req: FeedRequest): Promise<Page<BeatView>> {
    const cached = await this.loadShared(req);

    const authorMap = new Map(cached.authors.map((a) => [a.id, a]));
    const likedIds = req.viewerId
      ? await this.social.likedBeatIds(req.viewerId, cached.beats.map((b) => b.id))
      : new Set<string>();

    const items = cached.beats.flatMap((beat) => {
      const author = authorMap.get(beat.userId);
      if (!author) return []; // author deleted between cache fill and read
      return [
        presentBeat(beat, {
          author,
          likedByViewer: likedIds.has(beat.id),
          assetBase: this.assetBase,
        }),
      ];
    });

    return { items, nextCursor: cached.nextCursor };
  }

  // Returns the shared, viewer-independent slice of the feed, read-through KV.
  private async loadShared(req: FeedRequest): Promise<CachedFeed> {
    const generation = (await this.cache.get<number>(feedCacheTag)) ?? 0;
    const key = `feed:${generation}:${req.sort}:${req.genre ?? "all"}:${req.cursor ?? "head"}:${req.limit}`;

    const hit = await this.cache.get<CachedFeed>(key);
    if (hit) return hit;

    const rows = await this.beats.listPublicFeed({
      sort: req.sort,
      genre: req.genre,
      cursor: req.cursor,
      limit: req.limit + 1,
    });
    const page = buildPage(rows, req.limit, cursorFor(req.sort));

    const authorIds = [...new Set(page.items.map((b) => b.userId))];
    const authorMap = await this.users.findManyByIds(authorIds);

    const value: CachedFeed = {
      beats: page.items,
      authors: [...authorMap.values()].map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        avatarUrl: u.avatarUrl,
      })),
      nextCursor: page.nextCursor,
    };
    await this.cache.set(key, value, FEED_TTL_SECONDS);
    return value;
  }
}

// "top" sort is by likes then id; the cursor must encode both so paging is
// stable. We encode `likes:id` and the repository decodes it.
function cursorFor(sort: FeedSort): (b: Beat) => string {
  return sort === "top" ? (b) => `${b.likesCount}:${b.id}` : (b) => b.id;
}
