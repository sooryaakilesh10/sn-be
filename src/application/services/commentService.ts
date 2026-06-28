import type { Beat } from "../../domain/entities/beat.js";
import type { CommentView } from "../../domain/entities/comment.js";
import type { CommentRepository } from "../../domain/repositories/commentRepository.js";
import type { BeatRepository } from "../../domain/repositories/beatRepository.js";
import type { UserRepository } from "../../domain/repositories/userRepository.js";
import type { Page } from "../../shared/pagination.js";
import { buildPage } from "../../shared/pagination.js";
import { AppError } from "../../shared/errors.js";
import { ulid } from "../../shared/id.js";
import { authorFromUser } from "../presenters/beatPresenter.js";

// Comments on beats. A comment is allowed on any beat the viewer can see (public
// beats, or their own private drafts). A comment can be removed by its author or
// by the beat's owner (moderation of your own page).
export class CommentService {
  constructor(
    private readonly comments: CommentRepository,
    private readonly beats: BeatRepository,
    private readonly users: UserRepository,
  ) {}

  async add(viewerId: string, beatId: string, body: string): Promise<CommentView> {
    const beat = await this.requireVisible(viewerId, beatId);
    const author = await this.users.findById(viewerId);
    if (!author) throw AppError.unauthorized();

    const comment = await this.comments.create({
      id: ulid(),
      beatId: beat.id,
      userId: viewerId,
      body,
    });

    return {
      id: comment.id,
      beatId: comment.beatId,
      body: comment.body,
      author: authorFromUser(author),
      createdAt: comment.createdAt,
      canDelete: true,
    };
  }

  async list(
    viewerId: string | null,
    beatId: string,
    cursor: string | null,
    limit: number,
  ): Promise<Page<CommentView>> {
    const beat = await this.requireVisible(viewerId, beatId);

    const rows = await this.comments.listByBeat(beatId, cursor, limit + 1);
    const page = buildPage(rows, limit, (c) => c.id);

    // Hydrate authors in one bulk lookup (no N+1).
    const authorIds = [...new Set(page.items.map((c) => c.userId))];
    const userMap = await this.users.findManyByIds(authorIds);

    const items: CommentView[] = page.items.map((c) => {
      const user = userMap.get(c.userId);
      const author = user
        ? authorFromUser(user)
        : { id: c.userId, username: "unknown", displayName: "Unknown", avatarUrl: null };
      return {
        id: c.id,
        beatId: c.beatId,
        body: c.body,
        author,
        createdAt: c.createdAt,
        canDelete: viewerId !== null && (c.userId === viewerId || beat.userId === viewerId),
      };
    });

    return { items, nextCursor: page.nextCursor };
  }

  async remove(viewerId: string, commentId: string): Promise<void> {
    const comment = await this.comments.findById(commentId);
    if (!comment) throw AppError.notFound("Comment not found");

    if (comment.userId !== viewerId) {
      // Not the author — only the beat's owner may remove it.
      const beat = await this.beats.findById(comment.beatId);
      if (!beat || beat.userId !== viewerId) {
        throw AppError.forbidden("You can't delete this comment");
      }
    }

    await this.comments.delete(commentId);
  }

  // A beat is commentable if it's public, or it's the viewer's own draft.
  private async requireVisible(viewerId: string | null, id: string): Promise<Beat> {
    const beat = await this.beats.findById(id);
    if (!beat) throw AppError.notFound("Beat not found");
    if (beat.visibility === "private" && beat.userId !== viewerId) {
      throw AppError.notFound("Beat not found");
    }
    return beat;
  }
}
