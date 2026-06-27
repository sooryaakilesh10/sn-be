import type { Beat, BeatView, BeatAuthor } from "../../domain/entities/beat.js";
import type { User } from "../../domain/entities/user.js";

export function authorFromUser(user: User): BeatAuthor {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
  };
}

export interface PresentOptions {
  author: BeatAuthor;
  likedByViewer: boolean;
  // Optional external CDN base URL for serving preview audio. Empty = no preview.
  assetBase: string;
  includeDocument?: boolean;
}

export function presentBeat(beat: Beat, opts: PresentOptions): BeatView {
  const view: BeatView = {
    id: beat.id,
    title: beat.title,
    genre: beat.genre,
    mood: beat.mood,
    bpm: beat.bpm,
    visibility: beat.visibility,
    likesCount: beat.likesCount,
    playsCount: beat.playsCount,
    remixOf: beat.remixOf,
    previewUrl: beat.previewAsset && opts.assetBase ? assetUrl(opts.assetBase, beat.previewAsset) : null,
    author: opts.author,
    likedByViewer: opts.likedByViewer,
    createdAt: beat.createdAt,
    updatedAt: beat.updatedAt,
  };
  if (opts.includeDocument) view.document = beat.document;
  return view;
}

function assetUrl(base: string, key: string): string {
  return `${base.replace(/\/$/, "")}/${key}`;
}
