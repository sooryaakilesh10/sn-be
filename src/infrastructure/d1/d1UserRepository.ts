import type { User } from "../../domain/entities/user.js";
import type { UserRepository, NewUser, UserPatch } from "../../domain/repositories/userRepository.js";
import { AppError } from "../../shared/errors.js";
import { mapUser, type UserRow } from "./mappers.js";

export class D1UserRepository implements UserRepository {
  constructor(private readonly db: D1Database) {}

  async findById(id: string): Promise<User | null> {
    const row = await this.db
      .prepare("SELECT * FROM users WHERE id = ?")
      .bind(id)
      .first<UserRow>();
    return row ? mapUser(row) : null;
  }

  async findByGoogleSub(sub: string): Promise<User | null> {
    const row = await this.db
      .prepare("SELECT * FROM users WHERE google_sub = ?")
      .bind(sub)
      .first<UserRow>();
    return row ? mapUser(row) : null;
  }

  async findByUsername(username: string): Promise<User | null> {
    const row = await this.db
      .prepare("SELECT * FROM users WHERE username = ?")
      .bind(username)
      .first<UserRow>();
    return row ? mapUser(row) : null;
  }

  async findManyByIds(ids: string[]): Promise<Map<string, User>> {
    const map = new Map<string, User>();
    if (ids.length === 0) return map;
    const placeholders = ids.map(() => "?").join(",");
    const { results } = await this.db
      .prepare(`SELECT * FROM users WHERE id IN (${placeholders})`)
      .bind(...ids)
      .all<UserRow>();
    for (const row of results) map.set(row.id, mapUser(row));
    return map;
  }

  async create(user: NewUser): Promise<User> {
    const now = Date.now();
    try {
      const row = await this.db
        .prepare(
          `INSERT INTO users
             (id, google_sub, email, username, display_name, avatar_url, bio,
              beats_count, followers_count, following_count, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, '', 0, 0, 0, ?, ?)
           RETURNING *`,
        )
        .bind(
          user.id,
          user.googleSub,
          user.email,
          user.username,
          user.displayName,
          user.avatarUrl,
          now,
          now,
        )
        .first<UserRow>();
      return mapUser(row!);
    } catch (e) {
      // UNIQUE(google_sub) — concurrent first-login of the same account.
      if (isUnique(e)) {
        const existing = await this.findByGoogleSub(user.googleSub);
        if (existing) return existing;
      }
      throw e;
    }
  }

  async update(id: string, patch: UserPatch): Promise<User> {
    const sets: string[] = [];
    const values: unknown[] = [];
    if (patch.displayName !== undefined) {
      sets.push("display_name = ?");
      values.push(patch.displayName);
    }
    if (patch.bio !== undefined) {
      sets.push("bio = ?");
      values.push(patch.bio);
    }
    if (patch.avatarUrl !== undefined) {
      sets.push("avatar_url = ?");
      values.push(patch.avatarUrl);
    }
    sets.push("updated_at = ?");
    values.push(Date.now());
    values.push(id);

    const row = await this.db
      .prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ? RETURNING *`)
      .bind(...values)
      .first<UserRow>();
    if (!row) throw AppError.notFound("User not found");
    return mapUser(row);
  }
}

function isUnique(e: unknown): boolean {
  return e instanceof Error && /UNIQUE/i.test(e.message);
}
