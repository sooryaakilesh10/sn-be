// Core user entity. Pure data — no persistence or framework concerns.

export interface User {
  id: string;
  googleSub: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  beatsCount: number;
  followersCount: number;
  followingCount: number;
  createdAt: number;
  updatedAt: number;
}

// What a user may safely see about another user.
export interface PublicProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  beatsCount: number;
  followersCount: number;
  followingCount: number;
  isFollowing?: boolean; // populated when a viewer is known
}

export function toPublicProfile(u: User, isFollowing?: boolean): PublicProfile {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    bio: u.bio,
    beatsCount: u.beatsCount,
    followersCount: u.followersCount,
    followingCount: u.followingCount,
    ...(isFollowing === undefined ? {} : { isFollowing }),
  };
}
