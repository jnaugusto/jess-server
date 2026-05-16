# Meridian — API Server

The NestJS backend powering the [Meridian fleet tracking platform](https://github.com/jnaugusto/jess-tracking-web). Handles real-time location broadcasting, offline sync uploads, trip analytics, background job processing, and authentication across the driver app and web dashboard.

> Part of a three-repo system: [driver app](https://github.com/jnaugusto/jess-tracking-app) · [web dashboard](https://github.com/jnaugusto/jess-tracking-web) · **API server**

---

## What it does

- Broadcasts live driver locations to fleet managers via Socket.io with presence tracking
- Accepts PowerSync CRUD upload batches from the mobile app and applies them to PostgreSQL
- Derives trip events (speeding, idle stops, trip start/end) from raw GPS point sequences
- Reverse-geocodes trip start/end coordinates via Mapbox, caches results in the database
- Runs background jobs for PDF generation (Playwright) and image upscaling (Replicate AI)
- Streams Claude AI responses for the portfolio chat assistant

---

## Stack

![NestJS](https://img.shields.io/badge/NestJS_11-E0234E?style=flat&logo=nestjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat&logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-FF4438?style=flat&logo=redis&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=flat&logo=socket.io&logoColor=white)

| Concern | Choice |
|---------|--------|
| Framework | NestJS 11 (Express 5) |
| ORM | Drizzle ORM — type-safe query builder, no magic |
| Auth | Better Auth — session management, email/password, OAuth |
| Real-time | Socket.io 4 with `@nestjs/websockets` |
| Job queues | BullMQ + Redis, Bull Board monitoring UI |
| PDF generation | Playwright (headless Chromium pool) |
| Image processing | Sharp (resize/convert) + Replicate (Real-ESRGAN upscaling) |
| OCR | Tesseract.js — multi-language text extraction |
| Geocoding | Mapbox Geocoding API v5 |
| AI | Anthropic Claude (`claude-haiku-4-5`), Google Generative AI |
| Validation | class-validator + class-transformer, Zod (drizzle-zod schemas) |
| Config | t3-oss/env-core — validated at startup, throws on missing vars |
| Docs | Swagger UI at `/api` |
| Rate limiting | `@nestjs/throttler` — 60 req/min global, skip-annotated on sync endpoints |

---

## Architecture

```
                    ┌─────────────────────────────────┐
HTTP clients ──────►│  NestJS App (Express 5)          │
                    │                                  │
                    │  AuthGuard (Better Auth)         │
                    │  ValidationPipe (class-validator)│
                    │  ThrottlerGuard (rate limit)     │
                    │                                  │
                    │  ┌──────────┐  ┌──────────────┐ │
                    │  │  Tracks  │  │  PowerSync   │ │
                    │  │  Service │  │  Service     │ │
                    │  └──────────┘  └──────────────┘ │
                    │                                  │
                    │  ┌──────────────────────────┐   │
                    │  │  LocationsGateway        │   │
                    │  │  Socket.io /locations ns │   │
Socket.io  ◄───────►│  │  presence: Map<uid,Set>  │   │
                    │  └──────────────────────────┘   │
                    │                                  │
                    │  ┌──────────┐  ┌──────────────┐ │
                    │  │  BullMQ  │  │  DatabaseSvc │ │
                    │  │  Queues  │  │  (Drizzle)   │ │
                    │  └──────────┘  └──────────────┘ │
                    └─────────────────────────────────┘
                              │               │
                           Redis           PostgreSQL
```

---

## Key Engineering Details

**WebSocket presence tracking**
`LocationsGateway` maintains an in-memory `Map<driverUserId, Set<socketId>>` — not just a connected/disconnected boolean. A driver can have multiple sockets (e.g., app reopened before old socket timed out). Disconnect only announces `driver:offline` when the *last* socket for that user closes. Ping interval is 10s / timeout 5s — dead connections are detected in ~15s vs Socket.io's default 45s.

**Dual-path location ingestion**
The mobile app sends every GPS tick over two channels simultaneously:
- **WebSocket** (`location:tick`) → gateway transforms to `LiveLocationBroadcast` → emits to dashboard room within the same event loop tick
- **PowerSync CRUD upload** → batched, persisted to PostgreSQL → source of truth for trip history

The dashboard gets sub-second updates; the database gets every point even through network interruptions.

**PowerSync upload with savepoint isolation**
The mobile app uploads CRUD transactions as ordered batches. One permanently-failing operation (e.g., a location point referencing a deleted trip — FK violation) would block the entire queue forever under a single transaction. Each operation is wrapped in a PostgreSQL `SAVEPOINT`:

```sql
SAVEPOINT sp_0;
INSERT INTO location_points ...;   -- fails: FK violation
ROLLBACK TO SAVEPOINT sp_0;        -- skip and log warning
SAVEPOINT sp_1;
INSERT INTO tracks ...;            -- succeeds
RELEASE SAVEPOINT sp_1;
-- outer transaction commits with sp_1's work
```

The queue drains even with corrupt entries.

**Trip event derivation**
A stateless analyzer runs over the ordered `location_points` sequence and produces a structured event timeline without any stored state:
- **Speeding:** leading-edge detection at > 90 km/h (25 m/s) — one event per episode, not per point
- **Idle:** stop lasting ≥ 2 minutes at < 2 km/h (0.56 m/s) — the 2-minute floor filters GPS jitter at red lights
- **Start / Stop:** injected from track metadata, not derived from points

**Geocoding with lazy caching**
Reverse-geocoding every trip at write time would burn Mapbox quota fast. Instead, `start_geocode` and `end_geocode` are null until the trip detail page is first viewed — geocoded on-demand, then stored as JSON in the `tracks` row. A startup backfill job processes any trips that predate this feature using a lateral JOIN to find first/last points efficiently, throttled at 200ms per request.

**Playwright browser pool**
Spinning up a Chromium instance per PDF request would OOM shared infrastructure. `PLAYWRIGHT_POOL_SIZE` (default 3) bounds the concurrency. Each browser instance is recycled after `PLAYWRIGHT_MAX_PAGES` (default 10) renders to prevent memory creep from accumulated JS heap. BullMQ serializes the queue so jobs wait rather than spawning unbounded browsers.

**Image upscaling with quota enforcement**
Replicate's Real-ESRGAN API upscales images 2× or 4× but has per-request cost. A Redis sliding-window counter enforces 3 upscales per 24h per IP before Sharp is used as a fallback. Images over 2M pixels are pre-downscaled by Sharp before being sent to the GPU model to avoid OOM on the inference side.

---

## Modules

| Module | Responsibility |
|--------|---------------|
| `auth` | Better Auth integration, session guards, JWT handling |
| `database` | Drizzle ORM client, schema, connection pooling |
| `powersync` | CRUD upload handler, PowerSync JWT token generation |
| `locations` | WebSocket gateway, presence tracking, live broadcast |
| `tracks` | Trip CRUD, event derivation, geocoding, point queries |
| `drivers` | Driver management, invite flow, vehicle assignment |
| `vehicles` | Vehicle registry |
| `chat` | Claude SSE streaming for portfolio Q&A |
| `image` | Sharp processing, Replicate upscaling, Tesseract OCR |
| `pdf` | Playwright headless PDF generation with job queue |
| `drive` | Google Drive OAuth2 file upload |
| `users` | User profile and settings |

---

## Database Schema

```
users ──< sessions
  │
  ├──< drivers ──< tracks ──< location_points
  │       │            (idx: userId+startTime, trackId+timestamp)
  │       └──> vehicles
  │
  ├──< driver_invites
  └──< user_settings
```

All table types are inferred from Drizzle's `createSelectSchema()` / `createInsertSchema()` — a single source of truth for DB types, Zod validation, and TypeScript types.

---

## Local Setup

**Prerequisites:** Node 18+, pnpm, PostgreSQL, Redis

```bash
pnpm install
cp .env.example .env   # fill in required vars
pnpm drizzle-kit push  # apply schema to DB
pnpm start:dev         # http://localhost:3005
```

**Environment (required):**
```env
PORT=3005
DATABASE_URL=postgresql://user:pass@localhost:5432/meridian
REDIS_HOST=localhost
REDIS_PORT=6379
BETTER_AUTH_SECRET=...
BETTER_AUTH_URL=http://localhost:3005/api/auth
POWERSYNC_URL=https://your-instance.powersync.journeyapps.com
POWERSYNC_JWT_PRIVATE_KEY=<base64-encoded-RS256-private-key>
MAPBOX_TOKEN=pk.your_token
ANTHROPIC_API_KEY=sk-ant-...
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

**Useful endpoints:**
```
GET  /api          → Swagger UI
GET  /queues       → Bull Board job monitor
POST /powersync/upload  → PowerSync CRUD batch (auth required)
GET  /powersync/token   → Mint PowerSync JWT
```

---

Built by [Jess Augusto](https://github.com/jnaugusto)
