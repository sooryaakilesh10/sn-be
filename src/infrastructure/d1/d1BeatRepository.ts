import type { Beat } from "../../domain/entities/beat.js";
import type {
  BeatRepository,
  NewBeat,
  BeatPatch,
  FeedQuery,
} from "../../domain/repositories/beatRepository.js";
import { AppError } from "../../shared/errors.js";
import { mapBeat, type BeatRow } from "./mappers.js";

export class D1BeatRepository implements BeatRepository {
  constructor(private readonly db: D1Database) {}

  async findById(id: string): Promise<Beat | null> {
    const row = await this.db
      .prepare("SELECT * FROM beats WHERE id = ?")
      .bind(id)
      .first<BeatRow>();
    return row ? mapBeat(row) : null;
  }

  async create(beat: NewBeat): Promise<Beat> {
    const now = Date.now();
    // Atomic: insert the beat and bump the author's denormalized counter
    // together so the profile stat can never drift from reality.
    const results = await this.db.batch<BeatRow>([
      this.db
        .prepare(
          `INSERT INTO beats
             (id, user_id, title, genre, mood, bpm, visibility,
              likes_count, plays_count, remix_of, document, preview_asset,
              created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, NULL, ?, ?)
           RETURNING *`,
        )
        .bind(
          beat.id,
          beat.userId,
          beat.title,
          beat.genre,
          beat.mood,
          beat.bpm,
          beat.visibility,
          beat.remixOf,
          JSON.stringify(beat.document),
          now,
          now,
        ),
      this.db
        .prepare("UPDATE users SET beats_count = beats_count + 1 WHERE id = ?")
        .bind(beat.userId),
    ]);
    const inserted = results[0]?.results[0];
    if (!inserted) throw new Error("Beat insert returned no row");
    return mapBeat(inserted);
  }

  async update(id: string, patch: BeatPatch): Promise<Beat> {
    const sets: string[] = [];
    const values: unknown[] = [];
    const push = (col: string, val: unknown) => {
      sets.push(`${col} = ?`);
      values.push(val);
    };

    if (patch.title !== undefined) push("title", patch.title);
    if (patch.genre !== undefined) push("genre", patch.genre);
    if (patch.mood !== undefined) push("mood", patch.mood);
    if (patch.bpm !== undefined) push("bpm", patch.bpm);
    if (patch.visibility !== undefined) push("visibility", patch.visibility);
    if (patch.document !== undefined) push("document", JSON.stringify(patch.document));
    if (patch.previewAsset !== undefined) push("preview_asset", patch.previewAsset);
    push("updated_at", Date.now());
    values.push(id);

    const row = await this.db
      .prepare(`UPDATE beats SET ${sets.join(", ")} WHERE id = ? RETURNING *`)
      .bind(...values)
      .first<BeatRow>();
    if (!row) throw AppError.notFound("Beat not found");
    return mapBeat(row);
  }

  async delete(id: string): Promise<void> {
    // Decrement the author's counter in the same transaction as the delete.
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE users SET beats_count = MAX(0, beats_count - 1)
           WHERE id = (SELECT user_id FROM beats WHERE id = ?)`,
        )
        .bind(id),
      this.db.prepare("DELETE FROM beats WHERE id = ?").bind(id),
    ]);
  }

  async listByUser(userId: string, cursor: string | null, limit: number): Promise<Beat[]> {
    // Newest first by id (ULIDs are time-ordered), keyset-paginated.
    const sql = cursor
      ? `SELECT * FROM beats WHERE user_id = ? AND id < ? ORDER BY id DESC LIMIT ?`
      : `SELECT * FROM beats WHERE user_id = ? ORDER BY id DESC LIMIT ?`;
    const stmt = cursor
      ? this.db.prepare(sql).bind(userId, cursor, limit)
      : this.db.prepare(sql).bind(userId, limit);
    const { results } = await stmt.all<BeatRow>();
    return results.map(mapBeat);
  }

  async listPublicFeed(query: FeedQuery): Promise<Beat[]> {
    const where: string[] = ["visibility = 'public'"];
    const params: unknown[] = [];

    if (query.genre) {
      where.push("genre = ?");
      params.push(query.genre);
    }

    let order: string;
    if (query.sort === "top") {
      order = "likes_count DESC, id DESC";
      if (query.cursor) {
        // Cursor encodes "likes:id" for stable keyset paging on a compound key.
        const [likesStr, id] = splitTopCursor(query.cursor);
        where.push("(likes_count < ? OR (likes_count = ? AND id < ?))");
        params.push(Number(likesStr), Number(likesStr), id);
      }
    } else {
      order = "id DESC";
      if (query.cursor) {
        where.push("id < ?");
        params.push(query.cursor);
      }
    }

    params.push(query.limit);
    const { results } = await this.db
      .prepare(`SELECT * FROM beats WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ?`)
      .bind(...params)
      .all<BeatRow>();
    return results.map(mapBeat);
  }

  async incrementPlays(id: string): Promise<void> {
    await this.db
      .prepare("UPDATE beats SET plays_count = plays_count + 1 WHERE id = ?")
      .bind(id)
      .run();
  }
}

function splitTopCursor(cursor: string): [string, string] {
  const idx = cursor.indexOf(":");
  if (idx === -1) return ["0", cursor];
  return [cursor.slice(0, idx), cursor.slice(idx + 1)];
}
