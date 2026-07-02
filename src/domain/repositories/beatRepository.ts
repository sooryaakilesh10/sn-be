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
  // Bulk lookup used to hydrate a set of beats (e.g. a challenge leaderboard)
  // without an N+1 fan-out.
  findManyByIds(ids: string[]): Promise<Map<string, Beat>>;
  // Creating a beat also bumps the author's denormalized beats_count.
  create(beat: NewBeat): Promise<Beat>;
  update(id: string, patch: BeatPatch): Promise<Beat>;
  // Deleting also decrements the author's beats_count.
  delete(id: string): Promise<void>;

  listByUser(userId: string, cursor: string | null, limit: number): Promise<Beat[]>;
  listPublicFeed(query: FeedQuery): Promise<Beat[]>;
  // Public beats authored by people the viewer follows ("Following" feed),
  // newest first, keyset-paginated by id.
  listFollowingFeed(
    viewerId: string,
    cursor: string | null,
    limit: number,
  ): Promise<Beat[]>;
  // Genre -> interaction count for a viewer (their own beats + beats they liked),
  // used to weight the personalized "For You" ranking.
  viewerGenreWeights(viewerId: string): Promise<Record<string, number>>;

  incrementPlays(id: string): Promise<void>;
}
