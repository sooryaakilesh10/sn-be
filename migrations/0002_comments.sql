-- Comments on beats.
--
-- Same scaling discipline as the rest of the schema:
--   * ULID primary key → inserts stay sequential and double as the pagination
--     cursor (newest-first = ORDER BY id DESC, no OFFSET).
--   * `comments_count` is denormalized onto the owning beat row and kept correct
--     transactionally with each insert/delete, so feed/card reads never aggregate.
--   * The comments table remains the source of truth and can rebuild the counter
--     if it ever drifts.

PRAGMA foreign_keys = ON;

CREATE TABLE comments (
  id         TEXT PRIMARY KEY,
  beat_id    TEXT NOT NULL REFERENCES beats(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- List a beat's comments, newest first, keyset-paginated by id.
CREATE INDEX idx_comments_beat ON comments (beat_id, id DESC);

-- Denormalized counter on the owning beat (kept in sync on insert/delete).
ALTER TABLE beats ADD COLUMN comments_count INTEGER NOT NULL DEFAULT 0;
