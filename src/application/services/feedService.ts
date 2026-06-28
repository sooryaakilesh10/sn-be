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

  // "Following" — public beats from people the viewer follows. Per-viewer, so
  // it skips the shared cache.
  async following(req: FeedRequest): Promise<Page<BeatView>> {
    if (!req.viewerId) return { items: [], nextCursor: null };
    const rows = await this.beats.listFollowingFeed(req.viewerId, req.cursor, req.limit + 1);
    const page = buildPage(rows, req.limit, (b) => b.id);
    const items = await this.hydrate(page.items, req.viewerId);
    return { items, nextCursor: page.nextCursor };
  }

  // "For You" — a personalized ranking over a recent candidate pool. Blends
  // friends, genre affinity, fresh engagement and recency (with a little
  // exploration) so the feel is relevant AND newer creators still get reach.
  async forYou(req: FeedRequest): Promise<Page<BeatView>> {
    const pool = await this.loadShared({
      sort: "recent",
      genre: req.genre,
      cursor: null,
      limit: FORYOU_POOL,
      viewerId: req.viewerId,
    });

    const viewerId = req.viewerId;
    const authorIds = [...new Set(pool.beats.map((b) => b.userId))];
    // These three reads are independent — run them concurrently to cut latency.
    const [followed, liked, genreWeights] = await Promise.all([
      viewerId ? this.social.followingAmong(viewerId, authorIds) : Promise.resolve(new Set<string>()),
      viewerId
        ? this.social.likedBeatIds(viewerId, pool.beats.map((b) => b.id))
        : Promise.resolve(new Set<string>()),
      viewerId ? this.beats.viewerGenreWeights(viewerId) : Promise.resolve({} as Record<string, number>),
    ]);
    const maxGenre = Math.max(1, ...Object.values(genreWeights));

    const authorMap = new Map(pool.authors.map((a) => [a.id, a]));
    const ctx: ScoreCtx = { now: Date.now(), followed, liked, genreWeights, maxGenre };

    const ranked = pool.beats
      .filter((b) => authorMap.has(b.userId) && b.userId !== viewerId)
      .map((b) => ({ beat: b, score: score(b, ctx) }))
      .sort((a, z) => z.score - a.score)
      .slice(0, req.limit);

    const items = ranked.map(({ beat }) =>
      presentBeat(beat, {
        author: authorMap.get(beat.userId)!,
        likedByViewer: liked.has(beat.id),
        assetBase: this.assetBase,
      }),
    );
    return { items, nextCursor: null };
  }

  // Hydrate a plain list of beats with authors + the viewer's like state.
  private async hydrate(beats: Beat[], viewerId: string | null): Promise<BeatView[]> {
    const authorIds = [...new Set(beats.map((b) => b.userId))];
    // Authors and the viewer's like state are independent — fetch in parallel.
    const [authorMap, liked] = await Promise.all([
      this.users.findManyByIds(authorIds),
      viewerId
        ? this.social.likedBeatIds(viewerId, beats.map((b) => b.id))
        : Promise.resolve(new Set<string>()),
    ]);
    return beats.flatMap((beat) => {
      const author = authorMap.get(beat.userId);
      if (!author) return [];
      return [
        presentBeat(beat, {
          author: {
            id: author.id,
            username: author.username,
            displayName: author.displayName,
            avatarUrl: author.avatarUrl,
          },
          likedByViewer: liked.has(beat.id),
          assetBase: this.assetBase,
        }),
      ];
    });
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

// How many recent public beats to consider as "For You" candidates.
const FORYOU_POOL = 80;

interface ScoreCtx {
  now: number;
  followed: Set<string>;          // author ids the viewer follows
  liked: Set<string>;             // beat ids the viewer already liked
  genreWeights: Record<string, number>;
  maxGenre: number;
}

// Personalized relevance score for a beat. Higher = surfaced sooner.
function score(beat: Beat, ctx: ScoreCtx): number {
  const friend = ctx.followed.has(beat.userId) ? 3 : 0;            // friends first
  const affinity = ctx.maxGenre > 0 ? (ctx.genreWeights[beat.genre] ?? 0) / ctx.maxGenre : 0;
  const ageHours = Math.max(0, (ctx.now - beat.createdAt) / 3_600_000);
  const recency = Math.exp(-ageHours / 72);                        // ~3-day decay
  const engagement = Math.log1p(beat.likesCount * 3 + beat.playsCount);
  const seenPenalty = ctx.liked.has(beat.id) ? -0.5 : 0;           // already engaged
  const explore = Math.random() * 0.3;                             // give the long tail a chance
  // Engagement counts more when fresh, so a new strong post outranks an old hit.
  return friend + 2 * affinity + 1.2 * engagement * (0.4 + 0.6 * recency) + 2 * recency + explore + seenPenalty;
}
