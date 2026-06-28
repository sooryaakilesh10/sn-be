import { describe, it, expect, beforeEach } from "vitest";
import { CommentService } from "../src/application/services/commentService.js";
import type { Comment } from "../src/domain/entities/comment.js";
import type { Beat } from "../src/domain/entities/beat.js";
import type { User } from "../src/domain/entities/user.js";
import type {
  CommentRepository,
  NewComment,
} from "../src/domain/repositories/commentRepository.js";
import type { BeatRepository } from "../src/domain/repositories/beatRepository.js";
import type { UserRepository } from "../src/domain/repositories/userRepository.js";
import { AppError } from "../src/shared/errors.js";

// --- in-memory fakes -------------------------------------------------------

class FakeComments implements Partial<CommentRepository> {
  rows: Comment[] = [];
  async create(c: NewComment): Promise<Comment> {
    const row: Comment = { ...c, createdAt: Date.now() };
    this.rows.unshift(row);
    return row;
  }
  async findById(id: string): Promise<Comment | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async listByBeat(beatId: string, _cursor: string | null, limit: number): Promise<Comment[]> {
    return this.rows.filter((r) => r.beatId === beatId).slice(0, limit);
  }
  async delete(id: string): Promise<boolean> {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => r.id !== id);
    return this.rows.length < before;
  }
}

function beat(over: Partial<Beat> = {}): Beat {
  return {
    id: "beat1",
    userId: "owner",
    title: "t",
    genre: "trap",
    mood: "custom",
    bpm: 120,
    visibility: "public",
    likesCount: 0,
    playsCount: 0,
    commentsCount: 0,
    remixOf: null,
    document: {},
    previewAsset: null,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

function user(id: string): User {
  return {
    id,
    googleSub: id,
    email: `${id}@x.com`,
    username: id,
    displayName: id,
    avatarUrl: null,
    bio: "",
    beatsCount: 0,
    followersCount: 0,
    followingCount: 0,
    createdAt: 0,
    updatedAt: 0,
  };
}

function makeService(b: Beat) {
  const comments = new FakeComments();
  const beats: Partial<BeatRepository> = { async findById() { return b; } };
  const users: Partial<UserRepository> = {
    async findById(id: string) { return user(id); },
    async findManyByIds(ids: string[]) {
      return new Map(ids.map((id) => [id, user(id)]));
    },
  };
  const svc = new CommentService(
    comments as unknown as CommentRepository,
    beats as unknown as BeatRepository,
    users as unknown as UserRepository,
  );
  return { svc, comments };
}

// --- tests -----------------------------------------------------------------

describe("CommentService", () => {
  let svc: CommentService;
  let comments: FakeComments;

  beforeEach(() => {
    ({ svc, comments } = makeService(beat()));
  });

  it("adds a comment to a public beat", async () => {
    const view = await svc.add("alice", "beat1", "nice loop");
    expect(view.body).toBe("nice loop");
    expect(view.author.id).toBe("alice");
    expect(view.canDelete).toBe(true);
    expect(comments.rows).toHaveLength(1);
  });

  it("lets the beat owner delete any comment", async () => {
    const view = await svc.add("alice", "beat1", "hi");
    await expect(svc.remove("owner", view.id)).resolves.toBeUndefined();
    expect(comments.rows).toHaveLength(0);
  });

  it("forbids a stranger from deleting someone else's comment", async () => {
    const view = await svc.add("alice", "beat1", "hi");
    await expect(svc.remove("mallory", view.id)).rejects.toMatchObject({ status: 403 });
    expect(comments.rows).toHaveLength(1);
  });

  it("marks canDelete correctly per viewer when listing", async () => {
    await svc.add("alice", "beat1", "hi");
    const asBob = await svc.list("bob", "beat1", null, 20);
    expect(asBob.items[0]!.canDelete).toBe(false);
    const asOwner = await svc.list("owner", "beat1", null, 20);
    expect(asOwner.items[0]!.canDelete).toBe(true);
  });

  it("hides a private beat's comments from non-owners (404)", async () => {
    ({ svc } = makeService(beat({ visibility: "private", userId: "owner" })));
    await expect(svc.list("intruder", "beat1", null, 20)).rejects.toBeInstanceOf(AppError);
    await expect(svc.add("intruder", "beat1", "x")).rejects.toMatchObject({ status: 404 });
  });
});
