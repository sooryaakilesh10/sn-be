import type { Beat, BeatDocument, Genre, Visibility } from "../entities/beat.js";

export interface NewBeat {
  id: string;
  userId: string;
  title: string;
  genre: Genre;
  mood: string;
  bpm: number;
  visibility: Visibility;
  remixOf: string | null;
  document: BeatDocument;
}

export interface BeatPatch {
  title?: string;
  genre?: Genre;
  mood?: string;
  bpm?: number;
  visibility?: Visibility;
  document?: BeatDocument;
  previewAsset?: string | null;
}

export type FeedSort = "recent" | "top";

export interface FeedQuery {
  sort: FeedSort;
  genre?: Genre;
  cursor: string | null;
  limit: number; // repository fetches limit + 1 to detect "has more"
}

export interface BeatRepository {
  findById(id: string): Promise<Beat | null>;
  // Creating a beat also bumps the author's denormalized beats_count.
  create(beat: NewBeat): Promise<Beat>;
  update(id: string, patch: BeatPatch): Promise<Beat>;
  // Deleting also decrements the author's beats_count.
  delete(id: string): Promise<void>;

  listByUser(userId: string, cursor: string | null, limit: number): Promise<Beat[]>;
  listPublicFeed(query: FeedQuery): Promise<Beat[]>;

  incrementPlays(id: string): Promise<void>;
}
