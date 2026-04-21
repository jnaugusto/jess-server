# Build stage
FROM node:22-slim AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install ALL dependencies including devDeps (needed for nest build)
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build and verify output exists
RUN pnpm run build && \
    echo "Build output:" && \
    find dist -name "*.js" | head -10 && \
    test -f dist/main.js || (echo "ERROR: dist/main.js not found!" && exit 1)

# Production stage
FROM node:22-slim AS runner

# Install system dependencies for Playwright
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    libgomp1 \
    libvulkan1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Use corepack consistently (same as builder)
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Copy package files and install prod only deps
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

# Install Playwright browsers
RUN npx playwright install --with-deps chromium

# Copy built output from builder
COPY --from=builder /app/dist ./dist

# Copy template assets if needed at runtime
COPY --from=builder /app/src/template/templates ./dist/template/templates

ENV NODE_ENV=production
ENV PORT=3005

EXPOSE 3005

CMD ["node", "dist/main"]
