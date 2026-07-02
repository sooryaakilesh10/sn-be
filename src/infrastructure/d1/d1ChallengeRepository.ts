import type { ChallengeEntry } from "../../domain/entities/challenge.js";
import type {
  ChallengeRepository,
  NewChallengeEntry,
} from "../../domain/repositories/challengeRepository.js";
import { mapChallengeEntry, type ChallengeEntryRow } from "./mappers.js";

export class D1ChallengeRepository implements ChallengeRepository {
  constructor(private readonly db: D1Database) {}

  // Insert the entry, or (on the unique challenge_id+user_id) swap the beat on
  // the existing one — a creator can change their submission before the timer
  // ends. Likes and created_at are preserved on a swap so standings are stable.
  async upsertEntry(entry: NewChallengeEntry): Promise<ChallengeEntry> {
    const row = await this.db
      .prepare(
        `INSERT INTO challenge_entries
           (id, challenge_id, user_id, beat_id, likes_count, created_at)
         VALUES (?, ?, ?, ?, 0, ?)
         ON CONFLICT (challenge_id, user_id)
           DO UPDATE SET beat_id = excluded.beat_id
         RETURNING *`,
      )
      .bind(entry.id, entry.challengeId, entry.userId, entry.beatId, Date.now())
      .first<ChallengeEntryRow>();
    if (!row) throw new Error("Challenge entry upsert returned no row");
    return mapChallengeEntry(row);
  }

  async findEntryById(id: string): Promise<ChallengeEntry | null> {
    const row = await this.db
      .prepare("SELECT * FROM challenge_entries WHERE id = ?")
      .bind(id)
      .first<ChallengeEntryRow>();
    return row ? mapChallengeEntry(row) : null;
  }

  async findViewerEntry(challengeId: string, userId: string): Promise<ChallengeEntry | null> {
    const row = await this.db
      .prepare("SELECT * FROM challenge_entries WHERE challenge_id = ? AND user_id = ?")
      .bind(challengeId, userId)
      .first<ChallengeEntryRow>();
    return row ? mapChallengeEntry(row) : null;
  }

  async deleteEntry(id: string): Promise<void> {
    await this.db.prepare("DELETE FROM challenge_entries WHERE id = ?").bind(id).run();
  }

  async countEntries(challengeId: string): Promise<number> {
    const row = await this.db
      .prepare("SELECT COUNT(*) AS n FROM challenge_entries WHERE challenge_id = ?")
      .bind(challengeId)
      .first<{ n: number }>();
    return row?.n ?? 0;
  }

  async leaderboard(challengeId: string, limit: number): Promise<ChallengeEntry[]> {
    // Backed by idx_challenge_leaderboard: most-liked first, earliest wins ties.
    const { results } = await this.db
      .prepare(
        `SELECT * FROM challenge_entries
          WHERE challenge_id = ?
          ORDER BY likes_count DESC, id ASC
          LIMIT ?`,
      )
      .bind(challengeId, limit)
      .all<ChallengeEntryRow>();
    return results.map(mapChallengeEntry);
  }

  async likedEntryIds(userId: string, entryIds: string[]): Promise<Set<string>> {
    const set = new Set<string>();
    if (entryIds.length === 0) return set;
    const placeholders = entryIds.map(() => "?").join(",");
    const { results } = await this.db
      .prepare(
        `SELECT entry_id FROM challenge_entry_likes
          WHERE user_id = ? AND entry_id IN (${placeholders})`,
      )
      .bind(userId, ...entryIds)
      .all<{ entry_id: string }>();
    for (const r of results) set.add(r.entry_id);
    return set;
  }

  // The (user_id, entry_id) PK makes the insert idempotent; we only bump the
  // denormalized counter when a row was actually created.
  async likeEntry(userId: string, entryId: string): Promise<boolean> {
    const res = await this.db
      .prepare(
        "INSERT OR IGNORE INTO challenge_entry_likes (user_id, entry_id, created_at) VALUES (?, ?, ?)",
      )
      .bind(userId, entryId, Date.now())
      .run();
    const inserted = (res.meta.changes ?? 0) > 0;
    if (inserted) {
      await this.db
        .prepare("UPDATE challenge_entries SET likes_count = likes_count + 1 WHERE id = ?")
        .bind(entryId)
        .run();
    }
    return inserted;
  }

  async unlikeEntry(userId: string, entryId: string): Promise<boolean> {
    const res = await this.db
      .prepare("DELETE FROM challenge_entry_likes WHERE user_id = ? AND entry_id = ?")
      .bind(userId, entryId)
      .run();
    const removed = (res.meta.changes ?? 0) > 0;
    if (removed) {
      await this.db
        .prepare("UPDATE challenge_entries SET likes_count = MAX(0, likes_count - 1) WHERE id = ?")
        .bind(entryId)
        .run();
    }
    return removed;
  }
}
