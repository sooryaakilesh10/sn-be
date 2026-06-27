import type { User } from "../entities/user.js";

export interface NewUser {
  id: string;
  googleSub: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface UserPatch {
  displayName?: string;
  bio?: string;
  avatarUrl?: string | null;
}

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByGoogleSub(sub: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  // Bulk lookup used to hydrate feed authors without an N+1 fan-out.
  findManyByIds(ids: string[]): Promise<Map<string, User>>;
  create(user: NewUser): Promise<User>;
  update(id: string, patch: UserPatch): Promise<User>;
}
