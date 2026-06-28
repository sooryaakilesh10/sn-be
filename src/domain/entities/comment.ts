// A comment on a beat. Pure data — no persistence or framework concerns.

import type { BeatAuthor } from "./beat.js";

export interface Comment {
  id: string;
  beatId: string;
  userId: string;
  body: string;
  createdAt: number;
}

// Shape returned to clients: the comment plus an embedded author summary so the
// frontend can render it without an N+1 user fetch (mirrors BeatAuthor).
export interface CommentView {
  id: string;
  beatId: string;
  body: string;
  author: BeatAuthor;
  createdAt: number;
  // True when the viewer is allowed to delete this comment (author or beat owner).
  canDelete: boolean;
}
