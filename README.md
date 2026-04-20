# jess-server — Portfolio Backend API

NestJS backend powering [jess.dev](https://jess.dev). Handles the AI chat stream, image processing, PDF generation, location tracking, and Google Drive integration.

## Tech Stack

- **NestJS 11** + **TypeScript**
- **PostgreSQL** — primary database (Drizzle ORM)
- **Redis** + **BullMQ** — job queues and caching
- **Anthropic Claude** (`claude-haiku-4-5`) — AI chat streaming
- **Playwright** — headless browser pool for PDF generation
- **Sharp** — image processing
- **Better Auth** — authentication + JWT
- **Google Drive API** — OAuth2 file uploads
- **PowerSync** — real-time sync
- **Swagger** — auto-generated API docs

## Modules

| Module | Description |
|---|---|
| `chat` | Streams AI responses about Jess via Server-Sent Events (SSE) |
| `image` | Bulk image compression and conversion via Sharp + BullMQ |
| `pdf` | Multi-page PDF generation via Playwright headless browser pool |
| `locations` | Geolocation data storage and queries |
| `tracks` | GPS track recording and playback |
| `drive` | Google Drive file upload via OAuth2 |
| `auth` | Authentication via Better Auth + JWT guards |
| `users` | User management |
| `powersync` | Real-time sync JWT token generation |
| `analyze-site` | Headless website analysis via Playwright |

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm
- PostgreSQL
- Redis

### Install

```bash
pnpm install
```

### Environment

Copy `.env.example` and fill in your values:

```bash
cp .env.example .env
```

```env
PORT=3005
NODE_ENV=development
CORS_ORIGINS=http://localhost:5173,http://localhost:5174

DATABASE_URL=postgresql://postgres:password@localhost:5432/jess_db
REDIS_HOST=localhost
REDIS_PORT=6379

ANTHROPIC_API_KEY=your_anthropic_api_key

BETTER_AUTH_SECRET=your_secret
BETTER_AUTH_URL=http://localhost:3005/api/auth

POWERSYNC_URL=http://localhost:8080
POWERSYNC_JWT_PRIVATE_KEY=<base64-encoded-private-key>

GOOGLE_OAUTH_CLIENT_ID=your_client_id
GOOGLE_OAUTH_CLIENT_SECRET=your_client_secret
GOOGLE_OAUTH_REFRESH_TOKEN=your_refresh_token
GOOGLE_DRIVE_FOLDER_ID=your_folder_id

PLAYWRIGHT_POOL_SIZE=2
PLAYWRIGHT_MAX_PAGES=10
```

### Database

```bash
pnpm drizzle-kit push
```

### Dev

```bash
pnpm start:dev
```

### Production

```bash
pnpm build
pnpm start:prod
```

## API Docs

Swagger UI is available at:

```
http://localhost:3005/api
```

## Queue Dashboard

Bull Board is available at:

```
http://localhost:3005/queues
```

## Rate Limiting

- Global: 60 requests / minute per IP
- Chat endpoint: 20 requests / minute per IP

## Frontend

This server is the backend for [jess-web](../jess-web). See its README for frontend setup.

## License

MIT
