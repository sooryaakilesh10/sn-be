// Persistence port for Daily Beat Challenge entries and their likes.
//
// Entry likes are challenge-scoped and separate from a beat's own likes: a beat
// can be popular on the feed yet score differently in a challenge. Both writes
// are idempotent (backed by a unique key) so retries never double-count, and
// the denormalized `likes_count` is bumped in the same transaction as the like.

import type { ChallengeEntry } from "../entities/challenge.js";

export interface NewChallengeEntry {
  id: string;
  challengeId: string;
  userId: string;
  beatId: string;
}

export interface ChallengeRepository {
  // Create the viewer's entry, or swap the beat on their existing entry for the
  // day (one submission per user per challenge). Likes carry over on a swap.
  upsertEntry(entry: NewChallengeEntry): Promise<ChallengeEntry>;
  findEntryById(id: string): Promise<ChallengeEntry | null>;
  findViewerEntry(challengeId: string, userId: string): Promise<ChallengeEntry | null>;
  deleteEntry(id: string): Promise<void>;

  countEntries(challengeId: string): Promise<number>;
  // Top entries for a challenge, most-liked first (earliest submission breaks ties).
  leaderboard(challengeId: string, limit: number): Promise<ChallengeEntry[]>;

  // Which of these entry ids the viewer has liked (for leaderboard hydration).
  likedEntryIds(userId: string, entryIds: string[]): Promise<Set<string>>;
  // Returns true if the like was newly created / actually removed.
  likeEntry(userId: string, entryId: string): Promise<boolean>;
  unlikeEntry(userId: string, entryId: string): Promise<boolean>;
}
