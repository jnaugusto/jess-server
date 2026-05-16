# jess-server

The NestJS backend powering [jnaugusto.com](https://jnaugusto.com) — my personal portfolio and project hub. One API handles everything: AI chat, image processing, PDF generation, fleet tracking, real-time location sync, Google Drive integration, and more.

> The fleet tracking module ([Meridian](https://github.com/jnaugusto/jess-tracking-web)) lives here alongside the rest of the portfolio backend for easier management.

---

## What it does

- Streams AI responses about me over SSE using a large language model
- Processes and AI-upscales images (2× / 4× neural upscaling)
- Generates multi-page PDFs from HTML templates via a headless browser pool
- Extracts text from images via OCR (multi-language)
- Uploads files to Google Drive via OAuth2
- Broadcasts live driver locations to the Meridian fleet dashboard over WebSocket
- Accepts PowerSync CRUD batches from the Meridian mobile app and persists them to PostgreSQL
- Derives trip analytics (events, idle time, geocoded addresses) from raw GPS sequences

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
| PDF generation | Headless browser pool (Chromium) |
| Image processing | Image pipeline (resize/convert) + neural AI upscaling (2×/4×) |
| OCR | Multi-language OCR engine |
| Geocoding | Mapbox Geocoding API v5 |
| AI | LLM streaming (SSE), multi-model support |
| Validation | class-validator + class-transformer, Zod (drizzle-zod schemas) |
| Config | t3-oss/env-core — validated at startup, throws on missing vars |
| Docs | Swagger UI at `/api` |
| Rate limiting | `@nestjs/throttler` — 60 req/min global |

---

## Modules

| Module | Responsibility |
|--------|---------------|
| `auth` | Better Auth integration, session guards, JWT handling |
| `database` | Drizzle ORM client, schema, connection pooling |
| `chat` | LLM SSE streaming — portfolio Q&A assistant |
| `image` | Image processing, neural AI upscaling, OCR text extraction |
| `pdf` | Headless browser PDF generation with BullMQ job queue |
| `drive` | Google Drive OAuth2 file upload |
| `users` | User profile and settings |
| `powersync` | Meridian: CRUD upload handler, PowerSync JWT token generation |
| `locations` | Meridian: WebSocket gateway, driver presence tracking, live broadcast |
| `tracks` | Meridian: trip CRUD, event derivation, geocoding, point queries |
| `drivers` | Meridian: driver management, invite flow, vehicle assignment |
| `vehicles` | Meridian: vehicle registry |

---

## Key Engineering Details

**Headless browser pool for PDF generation**
Spinning up a browser instance per PDF request would OOM shared infrastructure. `PLAYWRIGHT_POOL_SIZE` (default 3) bounds concurrency. Each instance is recycled after `PLAYWRIGHT_MAX_PAGES` (default 10) renders to prevent memory creep from accumulated JS heap. BullMQ serializes the queue so jobs wait rather than spawning unbounded browsers.

**Neural image upscaling with quota enforcement**
The AI upscaling model has per-request cost. A Redis sliding-window counter enforces 3 upscales per 24h per IP. Images over 2M pixels are pre-downscaled before being sent to the model to avoid OOM on the inference side.

**WebSocket presence tracking (Meridian)**
`LocationsGateway` maintains an in-memory `Map<driverUserId, Set<socketId>>` — not just a boolean. A driver can have multiple sockets open simultaneously. Disconnect only announces `driver:offline` when the *last* socket for that user closes. Ping interval is 10s / timeout 5s, detecting dead connections in ~15s vs Socket.io's default 45s.

**PowerSync upload with savepoint isolation (Meridian)**
The mobile app uploads CRUD ops as ordered batches. One permanently-failing operation (e.g., a `location_points` insert referencing a deleted trip — FK violation) would block the entire queue under a single transaction. Each op is wrapped in a PostgreSQL `SAVEPOINT` so failures roll back and skip individually without aborting the batch.

**Trip event derivation (Meridian)**
A stateless analyzer over ordered GPS points produces a structured event timeline — speeding alerts (> 90 km/h), idle stops (≥ 2 min at < 2 km/h), trip start/end — without stored state. The 2-minute idle floor filters GPS jitter at red lights from genuine stops.

**Geocoding with lazy caching (Meridian)**
Trip coordinates are reverse-geocoded via Mapbox on first view and cached as JSON in the `tracks` row. A startup backfill job handles trips that predate this feature using a lateral JOIN to find first/last points, throttled at 200ms per request.

---

## Architecture

```
                    ┌─────────────────────────────────┐
HTTP clients ──────►│  NestJS App (Express 5)          │
                    │                                  │
                    │  AuthGuard · ValidationPipe      │
                    │  ThrottlerGuard · Swagger        │
                    │                                  │
                    │  chat  image  pdf  drive  users  │
                    │                                  │
                    │  ── Meridian ──────────────────  │
                    │  powersync  locations  tracks    │
                    │  drivers   vehicles              │
                    │                                  │
Socket.io  ◄───────►│  LocationsGateway (/locations)  │
                    └────────────┬────────────────────┘
                                 │
                    ┌────────────┼────────────┐
                 Redis        BullMQ       PostgreSQL
               (queues)    (pdf, image)   (Drizzle ORM)
```

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
DATABASE_URL=postgresql://user:pass@localhost:5432/jess_db
REDIS_HOST=localhost
REDIS_PORT=6379
BETTER_AUTH_SECRET=...
BETTER_AUTH_URL=http://localhost:3005/api/auth
AI_API_KEY=...
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

**Meridian-specific (optional — only needed if running fleet tracking):**
```env
POWERSYNC_URL=https://your-instance.powersync.journeyapps.com
POWERSYNC_JWT_PRIVATE_KEY=<base64-encoded-RS256-private-key>
MAPBOX_TOKEN=pk.your_token
```

**Useful endpoints:**
```
GET  /api      → Swagger UI (full API docs)
GET  /queues   → Bull Board job monitor
```

---

Built by [Jess Augusto](https://github.com/jnaugusto)
