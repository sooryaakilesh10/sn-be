# LoopFlow Backend — Cloudflare Workers

Backend for the LoopFlow music-creation + social app. Built to **scale
horizontally with no shared bottleneck** using a clean / hexagonal architecture
so business logic stays independent of Cloudflare primitives.

## Why this scales

| Concern | Mechanism |
| --- | --- |
| Compute | Stateless Workers — every request runs at the nearest edge PoP; the platform autoscales isolates. No servers to size. |
| Sessions | **Stateless JWT** access tokens (HS256, verified at the edge). No central session store to become a hotspot. Refresh tokens live in KV with rotation + reuse detection. |
| Source of truth | **D1** (SQLite) for users, beats metadata, likes, follows. Every list is keyset-paginated (no `OFFSET`) and backed by a covering/partial index, so latency stays flat as tables grow. |
| Hot reads | The discover feed is served from a **KV edge cache** keyed by a generation tag. Any public write bumps the tag, invalidating every cached page at once. Per-viewer "liked" state is layered on after the shared cache read. |
| Counters | `likes_count` / `followers_count` are **denormalized** and updated transactionally with the edge row, so feeds never aggregate. The like/follow rows remain the source of truth and can rebuild a counter if it drifts. |
| Large blobs | Audio (recordings, exports) goes to **R2** — unbounded, CDN-cacheable, streamed straight through the Worker. Only small metadata rows touch D1. |
| Abuse | Fixed-window **rate limiting** over KV, keyed by user or Cloudflare client IP. |
| Identifiers | **ULIDs** — time-sortable, so primary keys are append-mostly and double as pagination cursors. |

> Next scaling step (documented, not yet needed): a viral beat's `likes_count`
> row can become a write hotspot under D1's single-writer model. Promote that
> single counter to a **Durable Object** (or sharded counter) when a beat's
> like rate exceeds what one SQLite row can serialize.

## Architecture (clean / hexagonal)

```
src/
  domain/            # entities + repository PORTS (interfaces). Zero deps.
    entities/        #   User, Beat, Asset
    repositories/    #   UserRepository, BeatRepository, SocialRepository, …
  application/       # use cases — orchestrate ports, no I/O details
    services/        #   AuthService, BeatService, FeedService, SocialService, …
    ports/           #   OAuthProvider, TokenSigner
    presenters/      #   domain → API view mapping
  infrastructure/    # ADAPTERS implementing the ports
    d1/  kv/  r2/  auth/
  interfaces/http/   # transport: router, middleware, controllers
  config/env.ts      # typed bindings + config
  container.ts       # composition root — the only file that wires concretes
  index.ts           # Worker entry (fetch handler)
```

Dependencies point **inward**: `interfaces → application → domain`, and
`infrastructure → domain`. The domain knows nothing about Cloudflare, HTTP, or
JSON, which is what makes the services unit-testable with fakes.

## Setup

```bash
npm install

# 1. Create the resources (once)
npx wrangler d1 create loopflow
npx wrangler kv namespace create TOKENS
npx wrangler kv namespace create CACHE
npx wrangler r2 bucket create loopflow-assets
# → paste the printed ids into wrangler.toml

# 2. Apply the schema
npm run db:migrate:local      # local dev
npm run db:migrate:remote     # production

# 3. Secrets
cp .dev.vars.example .dev.vars   # fill in for local dev
npx wrangler secret put JWT_SECRET
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET

# 4. Run
npm run dev        # local
npm run deploy     # production
npm test           # unit tests
npm run typecheck
```

Google OAuth: add `${WORKER_ORIGIN}/auth/google/callback` as an authorized
redirect URI in the Google Cloud console, and set `GOOGLE_REDIRECT_URI` /
`APP_ORIGIN` in `wrangler.toml` accordingly.

## API

Auth cookies are `HttpOnly` + `SameSite=Lax` (+ `Secure` in prod). The SPA never
sees the tokens. Send requests with `credentials: "include"`.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/auth/google/start?redirect_to=` | – | Begin Google login |
| GET | `/auth/google/callback` | – | OAuth redirect target |
| POST | `/auth/refresh` | cookie | Rotate access+refresh tokens |
| POST | `/auth/logout` | cookie | Revoke + clear cookies |
| GET | `/api/me` | ✅ | Current user + stats |
| PATCH | `/api/me` | ✅ | Update displayName / bio / avatar |
| GET | `/api/me/beats?cursor=&limit=` | ✅ | Saved creations |
| GET | `/api/me/following?cursor=` | ✅ | Followed artists |
| POST | `/api/beats` | ✅ | Save a beat |
| GET | `/api/beats/:id` | optional | Load a beat (with full document) |
| PUT | `/api/beats/:id` | ✅ | Update a beat |
| DELETE | `/api/beats/:id` | ✅ | Delete a beat |
| POST | `/api/beats/:id/play` | – | Increment play count |
| POST/DELETE | `/api/beats/:id/like` | ✅ | Like / unlike |
| GET | `/api/feed?sort=recent\|top&genre=&cursor=` | optional | Discover feed |
| GET | `/api/users/:username` | optional | Public profile |
| POST/DELETE | `/api/users/:id/follow` | ✅ | Follow / unfollow |
| POST | `/api/assets?kind=voice\|piano\|chord\|export` | ✅ | Upload audio (raw body) |
| GET | `/api/assets/:id` | – | Stream audio |
| DELETE | `/api/assets/:id` | ✅ | Delete audio |

Errors are JSON: `{ "error": { "code", "message" }, "requestId" }`.

## Frontend integration

`client/loopflow-api.js` is a drop-in ES module that wraps these endpoints
(cookie auth, transparent token refresh on 401). It maps the existing
`localStorage` operations in `main.js` onto the API — see the header comment in
that file for the migration cheatsheet.
