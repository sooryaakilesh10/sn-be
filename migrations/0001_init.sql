-- LoopFlow schema (D1 / SQLite).
--
-- Design notes for scale:
--   * Surrogate text ids (ULID-like, time-sortable) so inserts stay sequential
--     and cursor pagination can use the primary key directly.
--   * Mutable creative payloads live in a single JSON column (`document`) so the
--     schema is stable as the frontend's beat format evolves; only the columns
--     we filter/sort on are promoted to real columns + indexes.
--   * Counters (likes/followers) are denormalized onto the owning row and kept
--     correct with transactional batches, so feed reads never aggregate.
--   * Every list query is backed by a covering index and paginated by cursor
--     (no OFFSET), which keeps latency flat as tables grow.

PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id              TEXT PRIMARY KEY,
  google_sub      TEXT NOT NULL UNIQUE,
  email           TEXT NOT NULL,
  username        TEXT NOT NULL UNIQUE,
  display_name    TEXT NOT NULL,
  avatar_url      TEXT,
  bio             TEXT NOT NULL DEFAULT '',
  beats_count     INTEGER NOT NULL DEFAULT 0,
  followers_count INTEGER NOT NULL DEFAULT 0,
  following_count INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE TABLE beats (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  genre         TEXT NOT NULL,
  mood          TEXT NOT NULL DEFAULT 'custom',
  bpm           INTEGER NOT NULL DEFAULT 120,
  -- 'private' | 'public'. Only public beats appear in the discover feed.
  visibility    TEXT NOT NULL DEFAULT 'private',
  likes_count   INTEGER NOT NULL DEFAULT 0,
  plays_count   INTEGER NOT NULL DEFAULT 0,
  remix_of      TEXT REFERENCES beats(id) ON DELETE SET NULL,
  -- Full creative document: grid, pianoNotes, pattern banks, arrangement, fx…
  document      TEXT NOT NULL,
  -- Optional rendered-audio asset (R2 object key) for instant feed playback.
  preview_asset TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

-- "My saved creations", newest first.
CREATE INDEX idx_beats_user_recent ON beats (user_id, created_at DESC, id DESC);
-- Discover feed (public only), newest first.
CREATE INDEX idx_beats_public_recent ON beats (created_at DESC, id DESC)
  WHERE visibility = 'public';
-- Trending (public only), most-liked first.
CREATE INDEX idx_beats_public_top ON beats (likes_count DESC, id DESC)
  WHERE visibility = 'public';
-- Genre-filtered discover.
CREATE INDEX idx_beats_public_genre ON beats (genre, created_at DESC, id DESC)
  WHERE visibility = 'public';

CREATE TABLE likes (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  beat_id    TEXT NOT NULL REFERENCES beats(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, beat_id)
);
-- "Has this user liked this beat" + reverse lookups.
CREATE INDEX idx_likes_beat ON likes (beat_id);

CREATE TABLE follows (
  follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (follower_id, followee_id)
);
CREATE INDEX idx_follows_followee ON follows (followee_id);

CREATE TABLE assets (
  id          TEXT PRIMARY KEY,   -- also the R2 object key
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,      -- 'voice' | 'piano' | 'chord' | 'export'
  content_type TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_assets_user ON assets (user_id, created_at DESC);
