import type { Env, AppConfig } from "./config/env.js";

import { D1UserRepository } from "./infrastructure/d1/d1UserRepository.js";
import { D1BeatRepository } from "./infrastructure/d1/d1BeatRepository.js";
import { D1SocialRepository } from "./infrastructure/d1/d1SocialRepository.js";
import { R2AssetRepository } from "./infrastructure/r2/r2AssetRepository.js";
import { KvCache } from "./infrastructure/kv/kvCache.js";
import { KvRateLimiter } from "./infrastructure/kv/kvRateLimiter.js";
import {
  KvRefreshTokenStore,
  KvOAuthStateStore,
} from "./infrastructure/kv/kvTokenStores.js";
import { JwtTokenSigner } from "./infrastructure/auth/jwtTokenSigner.js";
import { GoogleOAuthProvider } from "./infrastructure/auth/googleOAuthProvider.js";

import { AuthService } from "./application/services/authService.js";
import { BeatService } from "./application/services/beatService.js";
import { FeedService } from "./application/services/feedService.js";
import { SocialService } from "./application/services/socialService.js";
import { UserService } from "./application/services/userService.js";
import { AssetService } from "./application/services/assetService.js";
import type { TokenSigner } from "./application/ports/tokenSigner.js";
import type { RateLimiter } from "./domain/repositories/rateLimiter.js";

// Composition root. The ONLY place that knows which concrete adapters back the
// ports — wire it once per request and everything downstream is interface-typed.
export interface Container {
  auth: AuthService;
  beats: BeatService;
  feed: FeedService;
  social: SocialService;
  users: UserService;
  assets: AssetService;
  tokenSigner: TokenSigner;
  rateLimiter: RateLimiter;
}

export function buildContainer(env: Env, config: AppConfig): Container {
  // --- adapters (infrastructure) ---
  const userRepo = new D1UserRepository(env.DB);
  const beatRepo = new D1BeatRepository(env.DB);
  const socialRepo = new D1SocialRepository(env.DB);
  const assetRepo = new R2AssetRepository(env.ASSETS, env.DB);
  const cache = new KvCache(env.CACHE);
  const rateLimiter = new KvRateLimiter(env.CACHE);
  const refreshStore = new KvRefreshTokenStore(env.TOKENS);
  const oauthStateStore = new KvOAuthStateStore(env.TOKENS);
  const tokenSigner = new JwtTokenSigner(env.JWT_SECRET);
  const oauthProvider = new GoogleOAuthProvider(config.google);

  // --- use cases (application) ---
  const auth = new AuthService(userRepo, oauthProvider, tokenSigner, refreshStore, oauthStateStore, {
    accessTtl: config.accessTtl,
    refreshTtl: config.refreshTtl,
    oauthStateTtl: config.oauthStateTtl,
    defaultRedirect: config.appOrigin,
  });
  const beats = new BeatService(beatRepo, userRepo, socialRepo, cache, config.assetPublicBase);
  const feed = new FeedService(beatRepo, userRepo, socialRepo, cache, config.assetPublicBase);
  const social = new SocialService(socialRepo, beatRepo, userRepo, cache);
  const users = new UserService(userRepo, socialRepo);
  const assets = new AssetService(assetRepo);

  return { auth, beats, feed, social, users, assets, tokenSigner, rateLimiter };
}
