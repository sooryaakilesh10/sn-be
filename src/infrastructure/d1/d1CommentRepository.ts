import type { Comment } from "../../domain/entities/comment.js";
import type {
  CommentRepository,
  NewComment,
} from "../../domain/repositories/commentRepository.js";
import { mapComment, type CommentRow } from "./mappers.js";

export class D1CommentRepository implements CommentRepository {
  constructor(private readonly db: D1Database) {}

  async create(comment: NewComment): Promise<Comment> {
    const now = Date.now();
    // Atomic: insert the comment and bump the beat's denormalized counter
    // together so the count on the card can never drift from reality.
    const results = await this.db.batch<CommentRow>([
      this.db
        .prepare(
          `INSERT INTO comments (id, beat_id, user_id, body, created_at)
           VALUES (?, ?, ?, ?, ?)
           RETURNING *`,
        )
        .bind(comment.id, comment.beatId, comment.userId, comment.body, now),
      this.db
        .prepare("UPDATE beats SET comments_count = comments_count + 1 WHERE id = ?")
        .bind(comment.beatId),
    ]);
    const inserted = results[0]?.results[0];
    if (!inserted) throw new Error("Comment insert returned no row");
    return mapComment(inserted);
  }

  async findById(id: string): Promise<Comment | null> {
    const row = await this.db
      .prepare("SELECT * FROM comments WHERE id = ?")
      .bind(id)
      .first<CommentRow>();
    return row ? mapComment(row) : null;
  }

  async listByBeat(beatId: string, cursor: string | null, limit: number): Promise<Comment[]> {
    // Newest first by id (ULIDs are time-ordered), keyset-paginated.
    const sql = cursor
      ? `SELECT * FROM comments WHERE beat_id = ? AND id < ? ORDER BY id DESC LIMIT ?`
      : `SELECT * FROM comments WHERE beat_id = ? ORDER BY id DESC LIMIT ?`;
    const stmt = cursor
      ? this.db.prepare(sql).bind(beatId, cursor, limit)
      : this.db.prepare(sql).bind(beatId, limit);
    const { results } = await stmt.all<CommentRow>();
    return results.map(mapComment);
  }

  async delete(id: string): Promise<boolean> {
    // Decrement the owning beat's counter in the same transaction as the delete.
    const results = await this.db.batch([
      this.db
        .prepare(
          `UPDATE beats SET comments_count = MAX(0, comments_count - 1)
           WHERE id = (SELECT beat_id FROM comments WHERE id = ?)`,
        )
        .bind(id),
      this.db.prepare("DELETE FROM comments WHERE id = ?").bind(id),
    ]);
    return (results[1]?.meta.changes ?? 0) > 0;
  }
}
