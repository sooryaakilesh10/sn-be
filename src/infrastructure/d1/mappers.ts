import type { User } from "../../domain/entities/user.js";
import type { Beat, Genre, Visibility } from "../../domain/entities/beat.js";
import type { Comment } from "../../domain/entities/comment.js";

// Raw row shapes as returned by D1 (snake_case, SQLite scalar types).

export interface UserRow {
  id: string;
  google_sub: string;
  email: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string;
  beats_count: number;
  followers_count: number;
  following_count: number;
  created_at: number;
  updated_at: number;
}

export interface BeatRow {
  id: string;
  user_id: string;
  title: string;
  genre: string;
  mood: string;
  bpm: number;
  visibility: string;
  likes_count: number;
  plays_count: number;
  comments_count: number;
  remix_of: string | null;
  document: string;
  preview_asset: string | null;
  created_at: number;
  updated_at: number;
}

export interface CommentRow {
  id: string;
  beat_id: string;
  user_id: string;
  body: string;
  created_at: number;
}

export function mapUser(r: UserRow): User {
  return {
    id: r.id,
    googleSub: r.google_sub,
    email: r.email,
    username: r.username,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    bio: r.bio,
    beatsCount: r.beats_count,
    followersCount: r.followers_count,
    followingCount: r.following_count,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function mapBeat(r: BeatRow): Beat {
  return {
    id: r.id,
    userId: r.user_id,
    title: r.title,
    genre: r.genre as Genre,
    mood: r.mood,
    bpm: r.bpm,
    visibility: r.visibility as Visibility,
    likesCount: r.likes_count,
    playsCount: r.plays_count,
    commentsCount: r.comments_count ?? 0,
    remixOf: r.remix_of,
    document: safeParse(r.document),
    previewAsset: r.preview_asset,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function mapComment(r: CommentRow): Comment {
  return {
    id: r.id,
    beatId: r.beat_id,
    userId: r.user_id,
    body: r.body,
    createdAt: r.created_at,
  };
}

function safeParse(json: string): Record<string, unknown> {
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
