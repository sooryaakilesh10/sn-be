import type { Comment } from "../entities/comment.js";

export interface NewComment {
  id: string;
  beatId: string;
  userId: string;
  body: string;
}

// Comments on beats. Insert/delete keep the beat's denormalized
// `comments_count` correct in the same transaction, so card/feed reads never
// have to aggregate. The comments table stays the source of truth.
export interface CommentRepository {
  create(comment: NewComment): Promise<Comment>;
  findById(id: string): Promise<Comment | null>;
  // Newest-first, keyset-paginated by id (ULIDs are time-ordered).
  listByBeat(beatId: string, cursor: string | null, limit: number): Promise<Comment[]>;
  // Removes the comment and decrements the counter; returns true if a row went.
  delete(id: string): Promise<boolean>;
}
