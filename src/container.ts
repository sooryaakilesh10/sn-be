import type { Env, AppConfig } from "./config/env.js";

import { D1UserRepository } from "./infrastructure/d1/d1UserRepository.js";
import { D1BeatRepository } from "./infrastructure/d1/d1BeatRepository.js";
import { D1SocialRepository } from "./infrastructure/d1/d1SocialRepository.js";
import { D1CommentRepository } from "./infrastructure/d1/d1CommentRepository.js";
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
import { CommentService } from "./application/services/commentService.js";
import { UserService } from "./application/services/userService.js";
import { RecommendationService } from "./application/services/recommendationService.js";
import type { TokenSigner } from "./application/ports/tokenSigner.js";
import type { RateLimiter } from "./domain/repositories/rateLimiter.js";

// Composition root. The ONLY place that knows which concrete adapters back the
// ports — wire it once per request and everything downstream is interface-typed.
export interface Container {
  auth: AuthService;
  beats: BeatService;
  feed: FeedService;
  social: SocialService;
  comments: CommentService;
  users: UserService;
  recommendations: RecommendationService;
  tokenSigner: TokenSigner;
  rateLimiter: RateLimiter;
}

export function buildContainer(env: Env, config: AppConfig): Container {
  // --- adapters (infrastructure) ---
  const userRepo = new D1UserRepository(env.DB);
  const beatRepo = new D1BeatRepository(env.DB);
  const socialRepo = new D1SocialRepository(env.DB);
  const commentRepo = new D1CommentRepository(env.DB);
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
  const comments = new CommentService(commentRepo, beatRepo, userRepo);
  const users = new UserService(userRepo, socialRepo);
  const recommendations = new RecommendationService(socialRepo, userRepo, cache);

  return { auth, beats, feed, social, comments, users, recommendations, tokenSigner, rateLimiter };
}
