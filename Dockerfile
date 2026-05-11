# syntax=docker/dockerfile:1.7
# Build stage — use bun for fast installs + nest build.
FROM oven/bun:1.3-debian AS builder

WORKDIR /app

# Copy lockfile + manifest first for layer cache hits.
COPY package.json bun.lock ./

# Install ALL dependencies (incl. devDeps — nest build needs them).
RUN --mount=type=cache,id=bun,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

# Copy source
COPY . .

# Build and verify output exists. NestJS still emits CommonJS to dist/.
RUN bun run build \
    && echo "Build output:" \
    && find dist -name "*.js" | head -10 \
    && test -f dist/main.js || (echo "ERROR: dist/main.js not found!" && exit 1)

# Production stage — use Node for runtime. NestJS + Express body-parser
# rely on Node's stream behavior; bun's Node-compat has subtle gaps that
# can leave req.body empty. We pay the bun cost in CI/install only.
FROM node:22-slim AS runner

# System deps Playwright/chromium needs at runtime.
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    libgomp1 \
    libvulkan1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Bring bun in too (small binary), just for installing prod deps from
# our bun.lock. Avoids needing to maintain a parallel package-lock.json.
COPY --from=oven/bun:1.3 /usr/local/bin/bun /usr/local/bin/bun
RUN ln -sf /usr/local/bin/bun /usr/local/bin/bunx

WORKDIR /app

# Prod-only deps via bun (reads bun.lock).
COPY package.json bun.lock ./
RUN --mount=type=cache,id=bun,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --production

# Playwright browsers + system deps.
RUN bunx playwright install --with-deps chromium

# Copy built output from builder
COPY --from=builder /app/dist ./dist

# Copy template assets needed at runtime
COPY --from=builder /app/src/template/templates ./dist/template/templates

ENV NODE_ENV=production
ENV PORT=3005

EXPOSE 3005

# Run on Node — stable Express body-parser, full NestJS compatibility.
CMD ["node", "dist/main"]
