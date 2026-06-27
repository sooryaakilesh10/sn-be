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

  async suggestedUserIds(viewerId: string, limit: number): Promise<string[]> {
    // 1) Friends-of-friends: people followed by those the viewer follows,
    //    ranked by how many mutual connections recommend them. This is the
    //    "people your friends follow" signal.
    const fof = await this.db
      .prepare(
        `SELECT f2.followee_id AS uid, COUNT(*) AS mutuals
           FROM follows f1
           JOIN follows f2 ON f2.follower_id = f1.followee_id
          WHERE f1.follower_id = ?1
            AND f2.followee_id <> ?1
            AND f2.followee_id NOT IN (SELECT followee_id FROM follows WHERE follower_id = ?1)
          GROUP BY f2.followee_id
          ORDER BY mutuals DESC, uid DESC
          LIMIT ?2`,
      )
      .bind(viewerId, limit)
      .all<{ uid: string; mutuals: number }>();

    const ordered: string[] = [];
    const seen = new Set<string>([viewerId]);
    for (const r of fof.results) {
      if (!seen.has(r.uid)) { ordered.push(r.uid); seen.add(r.uid); }
    }

    // 2) Top up with popular creators the viewer doesn't already follow, so new
    //    users (no social graph yet) still get strong suggestions.
    if (ordered.length < limit) {
      const popular = await this.db
        .prepare(
          `SELECT id AS uid FROM users
            WHERE id <> ?1
              AND id NOT IN (SELECT followee_id FROM follows WHERE follower_id = ?1)
            ORDER BY followers_count DESC, beats_count DESC, id DESC
            LIMIT ?2`,
        )
        .bind(viewerId, limit)
        .all<{ uid: string }>();
      for (const r of popular.results) {
        if (ordered.length >= limit) break;
        if (!seen.has(r.uid)) { ordered.push(r.uid); seen.add(r.uid); }
      }
    }

    return ordered.slice(0, limit);
  }
}
