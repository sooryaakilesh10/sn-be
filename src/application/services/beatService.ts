import type { Beat, BeatView, Genre, Visibility } from "../../domain/entities/beat.js";
import type { BeatRepository, NewBeat, BeatPatch } from "../../domain/repositories/beatRepository.js";
import type { UserRepository } from "../../domain/repositories/userRepository.js";
import type { SocialRepository } from "../../domain/repositories/socialRepository.js";
import type { Cache } from "../../domain/repositories/cache.js";
import type { Page } from "../../shared/pagination.js";
import { buildPage } from "../../shared/pagination.js";
import { AppError } from "../../shared/errors.js";
import { ulid } from "../../shared/id.js";
import { presentBeat, authorFromUser } from "../presenters/beatPresenter.js";
import { feedCacheTag } from "./feedService.js";

export interface CreateBeatInput {
  title: string;
  genre: Genre;
  mood: string;
  bpm: number;
  visibility: Visibility;
  remixOf?: string | null;
  document: Record<string, unknown>;
}

export interface UpdateBeatInput {
  title?: string;
  genre?: Genre;
  mood?: string;
  bpm?: number;
  visibility?: Visibility;
  document?: Record<string, unknown>;
}

export interface Viewer {
  id: string;
}

// Owns the lifecycle of a user's beats. Enforces ownership and keeps the feed
// cache coherent by bumping a generation tag whenever public content changes.
export class BeatService {
  constructor(
    private readonly beats: BeatRepository,
    private readonly users: UserRepository,
    private readonly social: SocialRepository,
    private readonly cache: Cache,
    private readonly assetBase: string,
  ) {}

  async create(viewerId: string, input: CreateBeatInput): Promise<BeatView> {
    const author = await this.users.findById(viewerId);
    if (!author) throw AppError.unauthorized();

    const remixOf = await this.resolveRemixParent(input.remixOf);

    const data: NewBeat = {
      id: ulid(),
      userId: viewerId,
      title: input.title,
      genre: input.genre,
      mood: input.mood,
      bpm: input.bpm,
      visibility: input.visibility,
      remixOf,
      document: input.document,
    };
    const beat = await this.beats.create(data);
    if (beat.visibility === "public") await this.invalidateFeed();

    return presentBeat(beat, {
      author: authorFromUser(author),
      likedByViewer: false,
      assetBase: this.assetBase,
      includeDocument: true,
    });
  }

  async getForEdit(viewerId: string | null, id: string): Promise<BeatView> {
    const beat = await this.requireVisible(viewerId, id);
    const author = await this.users.findById(beat.userId);
    if (!author) throw AppError.notFound("Beat author not found");

    const liked = viewerId
      ? (await this.social.likedBeatIds(viewerId, [beat.id])).has(beat.id)
      : false;

    return presentBeat(beat, {
      author: authorFromUser(author),
      likedByViewer: liked,
      assetBase: this.assetBase,
      includeDocument: true,
    });
  }

  async update(viewerId: string, id: string, input: UpdateBeatInput): Promise<BeatView> {
    const beat = await this.requireOwned(viewerId, id);

    const patch: BeatPatch = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.genre !== undefined) patch.genre = input.genre;
    if (input.mood !== undefined) patch.mood = input.mood;
    if (input.bpm !== undefined) patch.bpm = input.bpm;
    if (input.visibility !== undefined) patch.visibility = input.visibility;
    if (input.document !== undefined) patch.document = input.document;

    const updated = await this.beats.update(id, patch);

    // Any change to a public beat — or a visibility flip — affects the feed.
    if (updated.visibility === "public" || beat.visibility === "public") {
      await this.invalidateFeed();
    }

    const author = await this.users.findById(viewerId);
    return presentBeat(updated, {
      author: authorFromUser(author!),
      likedByViewer: false,
      assetBase: this.assetBase,
      includeDocument: true,
    });
  }

  async delete(viewerId: string, id: string): Promise<void> {
    const beat = await this.requireOwned(viewerId, id);
    await this.beats.delete(id);
    if (beat.visibility === "public") await this.invalidateFeed();
  }

  async listMine(viewerId: string, cursor: string | null, limit: number): Promise<Page<BeatView>> {
    const author = await this.users.findById(viewerId);
    if (!author) throw AppError.unauthorized();

    const rows = await this.beats.listByUser(viewerId, cursor, limit + 1);
    const page = buildPage(rows, limit, (b) => b.id);
    const liked = await this.social.likedBeatIds(
      viewerId,
      page.items.map((b) => b.id),
    );

    return {
      items: page.items.map((b) =>
        presentBeat(b, {
          author: authorFromUser(author),
          likedByViewer: liked.has(b.id),
          assetBase: this.assetBase,
        }),
      ),
      nextCursor: page.nextCursor,
    };
  }

  async registerPlay(id: string): Promise<void> {
    await this.beats.incrementPlays(id);
  }

  // --- guards -------------------------------------------------------------

  private async requireOwned(viewerId: string, id: string): Promise<Beat> {
    const beat = await this.beats.findById(id);
    if (!beat) throw AppError.notFound("Beat not found");
    if (beat.userId !== viewerId) throw AppError.forbidden("You don't own this beat");
    return beat;
  }

  private async requireVisible(viewerId: string | null, id: string): Promise<Beat> {
    const beat = await this.beats.findById(id);
    if (!beat) throw AppError.notFound("Beat not found");
    if (beat.visibility === "private" && beat.userId !== viewerId) {
      throw AppError.notFound("Beat not found");
    }
    return beat;
  }

  private async resolveRemixParent(remixOf?: string | null): Promise<string | null> {
    if (!remixOf) return null;
    const parent = await this.beats.findById(remixOf);
    if (!parent || parent.visibility !== "public") {
      throw AppError.badRequest("Cannot remix a non-public beat");
    }
    return parent.id;
  }

  private async invalidateFeed(): Promise<void> {
    // Bumping the generation tag invalidates every cached feed page at once,
    // far cheaper than enumerating per-page cache keys.
    await this.cache.set(feedCacheTag, Date.now(), 0);
  }
}
