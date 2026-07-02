import type {
  Challenge,
  ChallengeEntry,
  ChallengeEntryView,
  ChallengeView,
} from "../../domain/entities/challenge.js";
import type { Beat } from "../../domain/entities/beat.js";
import type { User } from "../../domain/entities/user.js";
import type { ChallengeRepository } from "../../domain/repositories/challengeRepository.js";
import type { BeatRepository } from "../../domain/repositories/beatRepository.js";
import type { UserRepository } from "../../domain/repositories/userRepository.js";
import { challengeForTimestamp } from "../../domain/challenges/catalog.js";
import { AppError } from "../../shared/errors.js";
import { ulid } from "../../shared/id.js";
import { presentBeat, authorFromUser } from "../presenters/beatPresenter.js";

// How many entries the leaderboard surfaces. Small on purpose: the leaderboard
// is a highlight reel, and each row carries its beat's playable document.
const LEADERBOARD_SIZE = 25;

export interface LikeEntryResult {
  liked: boolean;
  likesCount: number;
}

// The Daily Beat Challenge use case. The daily prompt is computed (never
// stored); this service owns submissions, the leaderboard, and challenge-scoped
// likes. Submitting is capped to the currently-open challenge, and a creator
// may swap or withdraw their entry until the timer ends.
export class ChallengeService {
  constructor(
    private readonly challenges: ChallengeRepository,
    private readonly beats: BeatRepository,
    private readonly users: UserRepository,
    private readonly assetBase: string,
  ) {}

  // Today's challenge plus the viewer's own submission (if any).
  async today(viewerId: string | null): Promise<ChallengeView> {
    const challenge = challengeForTimestamp(Date.now());
    const [entryCount, viewerEntry] = await Promise.all([
      this.challenges.countEntries(challenge.id),
      viewerId ? this.challenges.findViewerEntry(challenge.id, viewerId) : Promise.resolve(null),
    ]);

    const viewerEntryView = viewerEntry
      ? await this.hydrateOne(viewerEntry, viewerId, 0)
      : null;

    return this.toChallengeView(challenge, entryCount, viewerEntryView);
  }

  // Today's leaderboard: top entries ranked by challenge likes.
  async leaderboard(
    viewerId: string | null,
  ): Promise<{ challenge: ChallengeView; entries: ChallengeEntryView[] }> {
    const challenge = challengeForTimestamp(Date.now());
    const [rows, entryCount, viewerEntry] = await Promise.all([
      this.challenges.leaderboard(challenge.id, LEADERBOARD_SIZE),
      this.challenges.countEntries(challenge.id),
      viewerId ? this.challenges.findViewerEntry(challenge.id, viewerId) : Promise.resolve(null),
    ]);

    const entries = await this.hydrateMany(rows, viewerId);
    const viewerEntryView = viewerEntry
      ? entries.find((e) => e.entryId === viewerEntry.id) ??
        (await this.hydrateOne(viewerEntry, viewerId, 0))
      : null;

    return {
      challenge: this.toChallengeView(challenge, entryCount, viewerEntryView),
      entries,
    };
  }

  // Submit one of the viewer's beats to today's challenge. Idempotent per day:
  // resubmitting swaps which beat is entered without resetting its likes.
  async submit(viewerId: string, beatId: string): Promise<ChallengeEntryView> {
    const now = Date.now();
    const challenge = challengeForTimestamp(now);
    if (now >= challenge.endsAt) {
      throw AppError.badRequest("Today's challenge has closed. Come back tomorrow!");
    }

    const beat = await this.beats.findById(beatId);
    if (!beat) throw AppError.notFound("Beat not found");
    if (beat.userId !== viewerId) {
      throw AppError.forbidden("You can only submit your own beats");
    }

    const entry = await this.challenges.upsertEntry({
      id: ulid(now),
      challengeId: challenge.id,
      userId: viewerId,
      beatId,
    });

    // Rank isn't meaningful for a just-created entry; the leaderboard computes it.
    const view = await this.hydrateOne(entry, viewerId, 0);
    if (!view) throw AppError.notFound("Beat not found");
    return view;
  }

  // Withdraw the viewer's entry from today's challenge.
  async withdraw(viewerId: string): Promise<void> {
    const challenge = challengeForTimestamp(Date.now());
    const entry = await this.challenges.findViewerEntry(challenge.id, viewerId);
    if (!entry) return; // nothing to withdraw — treat as success (idempotent)
    await this.challenges.deleteEntry(entry.id);
  }

  async likeEntry(viewerId: string, entryId: string): Promise<LikeEntryResult> {
    const entry = await this.requireEntry(entryId);
    const changed = await this.challenges.likeEntry(viewerId, entryId);
    return { liked: true, likesCount: entry.likesCount + (changed ? 1 : 0) };
  }

  async unlikeEntry(viewerId: string, entryId: string): Promise<LikeEntryResult> {
    const entry = await this.requireEntry(entryId);
    const changed = await this.challenges.unlikeEntry(viewerId, entryId);
    return { liked: false, likesCount: Math.max(0, entry.likesCount - (changed ? 1 : 0)) };
  }

  // --- helpers ------------------------------------------------------------

  private async requireEntry(entryId: string): Promise<ChallengeEntry> {
    const entry = await this.challenges.findEntryById(entryId);
    if (!entry) throw AppError.notFound("Entry not found");
    return entry;
  }

  private toChallengeView(
    challenge: Challenge,
    entryCount: number,
    viewerEntry: ChallengeEntryView | null,
  ): ChallengeView {
    return { ...challenge, entryCount, viewerEntry };
  }

  // Hydrate a list of entries with their beats + authors (bulk, no N+1) and the
  // viewer's per-entry like state. Rank follows leaderboard order (1-based).
  private async hydrateMany(
    entries: ChallengeEntry[],
    viewerId: string | null,
  ): Promise<ChallengeEntryView[]> {
    if (entries.length === 0) return [];

    const beatIds = [...new Set(entries.map((e) => e.beatId))];
    const [beatMap, likedEntries] = await Promise.all([
      this.beats.findManyByIds(beatIds),
      viewerId
        ? this.challenges.likedEntryIds(viewerId, entries.map((e) => e.id))
        : Promise.resolve(new Set<string>()),
    ]);

    const authorIds = [
      ...new Set([...beatMap.values()].map((b) => b.userId)),
    ];
    const authorMap = await this.users.findManyByIds(authorIds);

    const views: ChallengeEntryView[] = [];
    let rank = 0;
    for (const entry of entries) {
      rank += 1;
      const beat = beatMap.get(entry.beatId);
      const author = beat ? authorMap.get(beat.userId) : undefined;
      if (!beat || !author) continue; // beat or author deleted — drop from board
      views.push(this.toEntryView(entry, rank, beat, author, viewerId, likedEntries.has(entry.id)));
    }
    return views;
  }

  private async hydrateOne(
    entry: ChallengeEntry,
    viewerId: string | null,
    rank: number,
  ): Promise<ChallengeEntryView | null> {
    const beat = await this.beats.findById(entry.beatId);
    if (!beat) return null;
    const author = await this.users.findById(beat.userId);
    if (!author) return null;
    const liked = viewerId
      ? (await this.challenges.likedEntryIds(viewerId, [entry.id])).has(entry.id)
      : false;
    return this.toEntryView(entry, rank, beat, author, viewerId, liked);
  }

  private toEntryView(
    entry: ChallengeEntry,
    rank: number,
    beat: Beat,
    author: User,
    viewerId: string | null,
    liked: boolean,
  ): ChallengeEntryView {
    return {
      entryId: entry.id,
      challengeId: entry.challengeId,
      rank,
      entryLikes: entry.likesCount,
      likedByViewer: liked,
      isOwn: viewerId !== null && entry.userId === viewerId,
      submittedAt: entry.createdAt,
      // Include the document so the entry is playable/loadable right in the
      // leaderboard (submission implies consent to display in the challenge).
      beat: presentBeat(beat, {
        author: authorFromUser(author),
        likedByViewer: false,
        assetBase: this.assetBase,
        includeDocument: true,
      }),
    };
  }
}
