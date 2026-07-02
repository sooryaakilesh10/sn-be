-- Daily Beat Challenge.
--
-- Every UTC day the platform "releases" a small challenge (e.g. "Kick & Bass
-- only", "90 BPM Lofi", "8 bars only", "Summer Vibes"). The challenge itself is
-- NOT stored here: it is derived deterministically from the date by a curated
-- catalog in code (see domain/challenges/catalog.ts), so there is no scheduler
-- to run and every isolate agrees on today's prompt for free. `challenge_id` is
-- the UTC day key ("YYYY-MM-DD"); a row simply pins an entry to that day.
--
-- Same scaling discipline as the rest of the schema:
--   * ULID entry ids → sequential inserts + keyset-friendly ordering.
--   * `likes_count` denormalized on the entry and kept correct transactionally,
--     so the leaderboard never aggregates the likes table on read.
--   * One entry per user per challenge (UNIQUE) — resubmitting swaps the beat.

PRAGMA foreign_keys = ON;

CREATE TABLE challenge_entries (
  id           TEXT PRIMARY KEY,
  -- UTC day key, e.g. '2026-07-02'. The prompt/rules for the day are computed.
  challenge_id TEXT NOT NULL,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The submitted creation. Deleting the beat withdraws the entry.
  beat_id      TEXT NOT NULL REFERENCES beats(id) ON DELETE CASCADE,
  likes_count  INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL
);

-- One submission per creator per day (resubmit swaps the beat in place).
CREATE UNIQUE INDEX idx_challenge_entry_user ON challenge_entries (challenge_id, user_id);
-- Leaderboard: within a challenge, most-liked first, earliest submission wins ties.
CREATE INDEX idx_challenge_leaderboard ON challenge_entries (challenge_id, likes_count DESC, id ASC);

CREATE TABLE challenge_entry_likes (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_id   TEXT NOT NULL REFERENCES challenge_entries(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, entry_id)
);
-- "Has this user liked this entry" + reverse lookups for hydration.
CREATE INDEX idx_challenge_entry_likes_entry ON challenge_entry_likes (entry_id);
