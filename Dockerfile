# Build stage
FROM node:22-slim AS builder

# Install pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Copy configuration files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN pnpm run build

# Production stage
FROM node:22-slim AS runner

WORKDIR /app

# Install production dependencies only (including sharp for linux)
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && \
    corepack prepare pnpm@latest --activate
RUN pnpm install --prod --frozen-lockfile

# Copy built assets from builder
COPY --from=builder /app/dist ./dist

# Set environment variables for Cloud Run
# Cloud Run provides PORT env var automatically
ENV NODE_ENV=production

# Expose port (Cloud Run typically uses 8080 by default,
# but your app reads from PORT env var)
EXPOSE 8080

# Command to run the application
CMD ["node", "dist/main"]
