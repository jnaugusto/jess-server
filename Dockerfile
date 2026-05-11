# syntax=docker/dockerfile:1.7
# Build stage — uses Bun's debian image so we can `apt-get` Playwright
# system deps in the runner without needing a separate Node toolchain.
FROM oven/bun:1.3-debian AS builder

WORKDIR /app

# Copy lockfile + manifest first to maximise layer cache hits.
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

# Production stage
FROM oven/bun:1.3-debian AS runner

# System deps Playwright/chromium needs at runtime.
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    libgomp1 \
    libvulkan1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Prod-only deps. Frozen lockfile in prod = same versions everywhere.
COPY package.json bun.lock ./
RUN --mount=type=cache,id=bun,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --production

# Install Playwright browsers + their system deps.
# `bunx` is bun's npx-equivalent and works for the playwright CLI.
RUN bunx playwright install --with-deps chromium

# Copy built output from builder
COPY --from=builder /app/dist ./dist

# Copy template assets needed at runtime
COPY --from=builder /app/src/template/templates ./dist/template/templates

ENV NODE_ENV=production
ENV PORT=3005

EXPOSE 3005

# Bun runs CommonJS just fine; this stays compatible if you ever switch
# back to `node dist/main` since dist/ doesn't change.
CMD ["bun", "dist/main.js"]
