// Likes and follows. Both operations are idempotent and update denormalized
// counters atomically with the edge row so feeds never have to aggregate.

export interface SocialRepository {
  // Returns true if the like was newly created (false if it already existed).
  like(userId: string, beatId: string): Promise<boolean>;
  // Returns true if a like was actually removed.
  unlike(userId: string, beatId: string): Promise<boolean>;
  // Which of these beat ids the viewer has liked (for feed hydration).
  likedBeatIds(userId: string, beatIds: string[]): Promise<Set<string>>;

  follow(followerId: string, followeeId: string): Promise<boolean>;
  unfollow(followerId: string, followeeId: string): Promise<boolean>;
  isFollowing(followerId: string, followeeId: string): Promise<boolean>;
  // Ids the viewer follows, among the given candidates (feed hydration).
  followingAmong(followerId: string, candidateIds: string[]): Promise<Set<string>>;
  // Paginated list of users a given user follows.
  listFollowing(userId: string, cursor: string | null, limit: number): Promise<string[]>;
  // Suggested users to follow: friends-of-friends (ranked by mutual follows)
  // topped up with popular creators, excluding self + already-followed.
  suggestedUserIds(viewerId: string, limit: number): Promise<string[]>;
}
