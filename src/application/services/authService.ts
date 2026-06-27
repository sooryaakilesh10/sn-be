import type { User } from "../../domain/entities/user.js";
import type { UserRepository } from "../../domain/repositories/userRepository.js";
import type {
  OAuthStateStore,
  RefreshTokenStore,
} from "../../domain/repositories/tokenStore.js";
import type { OAuthProvider, OAuthProfile } from "../ports/oauthProvider.js";
import type { TokenSigner } from "../ports/tokenSigner.js";
import { AppError } from "../../shared/errors.js";
import { ulid, randomToken } from "../../shared/id.js";

export interface IssuedSession {
  user: User;
  accessToken: string;
  refreshToken: string;
  accessTtl: number;
  refreshTtl: number;
}

export interface AuthConfig {
  accessTtl: number;
  refreshTtl: number;
  oauthStateTtl: number;
  defaultRedirect: string;
}

// Orchestrates the OAuth login, token issuance, and refresh-token rotation.
// Knows nothing about HTTP or cookies — the controller turns sessions into
// Set-Cookie headers.
export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly oauth: OAuthProvider,
    private readonly signer: TokenSigner,
    private readonly refreshStore: RefreshTokenStore,
    private readonly stateStore: OAuthStateStore,
    private readonly config: AuthConfig,
  ) {}

  async startLogin(redirectTo?: string): Promise<string> {
    const req = await this.oauth.buildAuthorizationRequest();
    await this.stateStore.save(
      req.state,
      {
        codeVerifier: req.codeVerifier,
        redirectTo: redirectTo || this.config.defaultRedirect,
        createdAt: Date.now(),
      },
      this.config.oauthStateTtl,
    );
    return req.url;
  }

  async handleCallback(
    code: string,
    state: string,
  ): Promise<{ session: IssuedSession; redirectTo: string }> {
    const stateData = await this.stateStore.consume(state);
    if (!stateData) throw AppError.unauthorized("Invalid or expired login state");

    const profile = await this.oauth.exchangeCode(code, stateData.codeVerifier);
    if (!profile.emailVerified) {
      throw AppError.forbidden("Google account email is not verified");
    }

    const user = await this.upsertFromProfile(profile);
    const session = await this.issueSession(user);
    return { session, redirectTo: stateData.redirectTo };
  }

  // Refresh-token rotation with reuse detection: a valid token is consumed and
  // replaced. If a token is presented that no longer exists, it was either
  // already rotated (stolen + replayed) or expired → force re-login.
  async refresh(refreshToken: string): Promise<IssuedSession> {
    const record = await this.refreshStore.get(refreshToken);
    if (!record) throw AppError.unauthorized("Session expired, please sign in again");

    await this.refreshStore.revoke(refreshToken);

    const user = await this.users.findById(record.userId);
    if (!user) throw AppError.unauthorized("Account no longer exists");

    return this.issueSession(user, record.family);
  }

  async logout(refreshToken: string | null): Promise<void> {
    if (refreshToken) await this.refreshStore.revoke(refreshToken);
  }

  private async issueSession(user: User, family?: string): Promise<IssuedSession> {
    const accessToken = await this.signer.sign(
      { sub: user.id, username: user.username },
      this.config.accessTtl,
    );
    const refreshToken = randomToken(32);
    await this.refreshStore.save(
      refreshToken,
      { userId: user.id, family: family ?? ulid(), createdAt: Date.now() },
      this.config.refreshTtl,
    );
    return {
      user,
      accessToken,
      refreshToken,
      accessTtl: this.config.accessTtl,
      refreshTtl: this.config.refreshTtl,
    };
  }

  private async upsertFromProfile(profile: OAuthProfile): Promise<User> {
    const existing = await this.users.findByGoogleSub(profile.sub);
    if (existing) return existing;

    const username = await this.allocateUsername(profile);
    return this.users.create({
      id: ulid(),
      googleSub: profile.sub,
      email: profile.email,
      username,
      displayName: profile.name || username,
      avatarUrl: profile.picture,
    });
  }

  // Derive a unique, URL-safe handle from the Google profile, appending a short
  // suffix on collision.
  private async allocateUsername(profile: OAuthProfile): Promise<string> {
    const base =
      slugify(profile.email.split("@")[0] ?? profile.name) || "producer";
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = attempt === 0 ? base : `${base}_${randomSuffix()}`;
      if (!(await this.users.findByUsername(candidate))) return candidate;
    }
    return `${base}_${randomSuffix()}${randomSuffix()}`;
  }
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6);
}
