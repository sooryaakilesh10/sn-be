import type { SocialRepository } from "../../domain/repositories/socialRepository.js";

export class D1SocialRepository implements SocialRepository {
  constructor(private readonly db: D1Database) {}

  // Likes ------------------------------------------------------------------
  // The (user_id, beat_id) PK makes the insert naturally idempotent; we only
  // bump the denormalized counter when a row was actually created. The like
  // table is the source of truth, so the counter can be rebuilt if it drifts.

  async like(userId: string, beatId: string): Promise<boolean> {
    const res = await this.db
      .prepare("INSERT OR IGNORE INTO likes (user_id, beat_id, created_at) VALUES (?, ?, ?)")
      .bind(userId, beatId, Date.now())
      .run();
    const inserted = (res.meta.changes ?? 0) > 0;
    if (inserted) {
      await this.db
        .prepare("UPDATE beats SET likes_count = likes_count + 1 WHERE id = ?")
        .bind(beatId)
        .run();
    }
    return inserted;
  }

  async unlike(userId: string, beatId: string): Promise<boolean> {
    const res = await this.db
      .prepare("DELETE FROM likes WHERE user_id = ? AND beat_id = ?")
      .bind(userId, beatId)
      .run();
    const removed = (res.meta.changes ?? 0) > 0;
    if (removed) {
      await this.db
        .prepare("UPDATE beats SET likes_count = MAX(0, likes_count - 1) WHERE id = ?")
        .bind(beatId)
        .run();
    }
    return removed;
  }

  async likedBeatIds(userId: string, beatIds: string[]): Promise<Set<string>> {
    const set = new Set<string>();
    if (beatIds.length === 0) return set;
    const placeholders = beatIds.map(() => "?").join(",");
    const { results } = await this.db
      .prepare(
        `SELECT beat_id FROM likes WHERE user_id = ? AND beat_id IN (${placeholders})`,
      )
      .bind(userId, ...beatIds)
      .all<{ beat_id: string }>();
    for (const r of results) set.add(r.beat_id);
    return set;
  }

  // Follows ----------------------------------------------------------------

  async follow(followerId: string, followeeId: string): Promise<boolean> {
    const res = await this.db
      .prepare(
        "INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)",
      )
      .bind(followerId, followeeId, Date.now())
      .run();
    const inserted = (res.meta.changes ?? 0) > 0;
    if (inserted) {
      // Both denormalized counters move together.
      await this.db.batch([
        this.db
          .prepare("UPDATE users SET following_count = following_count + 1 WHERE id = ?")
          .bind(followerId),
        this.db
          .prepare("UPDATE users SET followers_count = followers_count + 1 WHERE id = ?")
          .bind(followeeId),
      ]);
    }
    return inserted;
  }

  async unfollow(followerId: string, followeeId: string): Promise<boolean> {
    const res = await this.db
      .prepare("DELETE FROM follows WHERE follower_id = ? AND followee_id = ?")
      .bind(followerId, followeeId)
      .run();
    const removed = (res.meta.changes ?? 0) > 0;
    if (removed) {
      await this.db.batch([
        this.db
          .prepare("UPDATE users SET following_count = MAX(0, following_count - 1) WHERE id = ?")
          .bind(followerId),
        this.db
          .prepare("UPDATE users SET followers_count = MAX(0, followers_count - 1) WHERE id = ?")
          .bind(followeeId),
      ]);
    }
    return removed;
  }

  async isFollowing(followerId: string, followeeId: string): Promise<boolean> {
    const row = await this.db
      .prepare("SELECT 1 AS x FROM follows WHERE follower_id = ? AND followee_id = ?")
      .bind(followerId, followeeId)
      .first<{ x: number }>();
    return row !== null;
  }

  async followingAmong(followerId: string, candidateIds: string[]): Promise<Set<string>> {
    const set = new Set<string>();
    if (candidateIds.length === 0) return set;
    const placeholders = candidateIds.map(() => "?").join(",");
    const { results } = await this.db
      .prepare(
        `SELECT followee_id FROM follows WHERE follower_id = ? AND followee_id IN (${placeholders})`,
      )
      .bind(followerId, ...candidateIds)
      .all<{ followee_id: string }>();
    for (const r of results) set.add(r.followee_id);
    return set;
  }

  async listFollowing(userId: string, cursor: string | null, limit: number): Promise<string[]> {
    const sql = cursor
      ? `SELECT followee_id FROM follows WHERE follower_id = ? AND followee_id < ?
         ORDER BY followee_id DESC LIMIT ?`
      : `SELECT followee_id FROM follows WHERE follower_id = ?
         ORDER BY followee_id DESC LIMIT ?`;
    const stmt = cursor
      ? this.db.prepare(sql).bind(userId, cursor, limit)
      : this.db.prepare(sql).bind(userId, limit);
    const { results } = await stmt.all<{ followee_id: string }>();
    return results.map((r) => r.followee_id);
  }
}
