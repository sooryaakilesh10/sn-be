import type { UserRepository, UserPatch } from "../../domain/repositories/userRepository.js";
import type { SocialRepository } from "../../domain/repositories/socialRepository.js";
import type { User, PublicProfile } from "../../domain/entities/user.js";
import { toPublicProfile } from "../../domain/entities/user.js";
import { AppError } from "../../shared/errors.js";

export interface ProfileUpdate {
  displayName?: string;
  bio?: string;
  avatarUrl?: string | null;
}

export class UserService {
  constructor(
    private readonly users: UserRepository,
    private readonly social: SocialRepository,
  ) {}

  async me(viewerId: string): Promise<User> {
    const user = await this.users.findById(viewerId);
    if (!user) throw AppError.unauthorized();
    return user;
  }

  // Public profile by username (how the frontend links to artists).
  async profileByUsername(
    username: string,
    viewerId: string | null,
  ): Promise<PublicProfile> {
    const user = await this.users.findByUsername(username);
    if (!user) throw AppError.notFound("User not found");
    const isFollowing =
      viewerId && viewerId !== user.id
        ? await this.social.isFollowing(viewerId, user.id)
        : undefined;
    return toPublicProfile(user, isFollowing);
  }

  async updateProfile(viewerId: string, update: ProfileUpdate): Promise<User> {
    const patch: UserPatch = {};
    if (update.displayName !== undefined) patch.displayName = update.displayName;
    if (update.bio !== undefined) patch.bio = update.bio;
    if (update.avatarUrl !== undefined) patch.avatarUrl = update.avatarUrl;
    return this.users.update(viewerId, patch);
  }
}
