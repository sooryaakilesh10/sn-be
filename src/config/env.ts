// Worker bindings + configuration, exactly as declared in wrangler.toml.
// This is the single typed surface where infrastructure meets the platform.

export interface Env {
  // --- bindings ---
  DB: D1Database;
  TOKENS: KVNamespace;
  CACHE: KVNamespace;
  ASSETS: R2Bucket;

  // --- vars ---
  ENVIRONMENT: string;
  APP_ORIGIN: string;
  COOKIE_DOMAIN: string;
  ACCESS_TOKEN_TTL: string;
  REFRESH_TOKEN_TTL: string;
  GOOGLE_REDIRECT_URI: string;
  ASSET_PUBLIC_BASE: string;

  // --- secrets (wrangler secret put) ---
  JWT_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
}

export interface AppConfig {
  environment: string;
  appOrigin: string;
  cookieDomain: string | undefined;
  accessTtl: number;
  refreshTtl: number;
  oauthStateTtl: number;
  assetPublicBase: string;
  google: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  };
  isProduction: boolean;
}

function int(value: string | undefined, fallback: number): number {
  const n = value ? Number(value) : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

// Parse + validate the loose string env into a typed config once per request.
export function loadConfig(env: Env): AppConfig {
  if (!env.JWT_SECRET) throw new Error("JWT_SECRET is not configured");
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error("Google OAuth credentials are not configured");
  }
  return {
    environment: env.ENVIRONMENT || "development",
    appOrigin: env.APP_ORIGIN || "http://localhost:8788",
    cookieDomain: env.COOKIE_DOMAIN || undefined,
    accessTtl: int(env.ACCESS_TOKEN_TTL, 900),
    refreshTtl: int(env.REFRESH_TOKEN_TTL, 2_592_000),
    oauthStateTtl: 600,
    assetPublicBase: env.ASSET_PUBLIC_BASE || "",
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      redirectUri: env.GOOGLE_REDIRECT_URI,
    },
    isProduction: (env.ENVIRONMENT || "development") === "production",
  };
}
