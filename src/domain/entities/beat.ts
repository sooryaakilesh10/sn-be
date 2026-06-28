// Beat (a saved creation / project). `document` is the opaque creative payload
// produced by the frontend (grid, pianoNotes, pattern banks, arrangement, fx).
// The backend treats it as a versioned blob and never reaches inside it.

export type Genre = "trap" | "lofi" | "house" | "ambient";
export type Visibility = "private" | "public";

export const GENRES: readonly Genre[] = ["trap", "lofi", "house", "ambient"];
export const VISIBILITIES: readonly Visibility[] = ["private", "public"];

export interface BeatDocument {
  // Loose by design — the schema lives in the frontend and evolves there.
  version?: number;
  grid?: unknown;
  gridSteps?: number;
  pianoNotes?: unknown;
  patternBanks?: unknown;
  arrangement?: unknown;
  fxSettings?: unknown;
  fxActive?: unknown;
  [key: string]: unknown;
}

export interface Beat {
  id: string;
  userId: string;
  title: string;
  genre: Genre;
  mood: string;
  bpm: number;
  visibility: Visibility;
  likesCount: number;
  playsCount: number;
  commentsCount: number;
  remixOf: string | null;
  document: BeatDocument;
  previewAsset: string | null;
  createdAt: number;
  updatedAt: number;
}

// Author summary embedded in feed responses (avoids N+1 user fetches).
export interface BeatAuthor {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

// Shape returned to clients. Omits the heavy `document` in list/feed views;
// included only when fetching a single beat for editing.
export interface BeatView {
  id: string;
  title: string;
  genre: Genre;
  mood: string;
  bpm: number;
  visibility: Visibility;
  likesCount: number;
  playsCount: number;
  commentsCount: number;
  remixOf: string | null;
  previewUrl: string | null;
  author: BeatAuthor;
  likedByViewer: boolean;
  createdAt: number;
  updatedAt: number;
  document?: BeatDocument;
}
