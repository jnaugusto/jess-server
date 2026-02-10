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
FROM --platform=linux/amd64 node:22-slim AS runner

# Install dependencies for Upscayl/Real-ESRGAN and image processing
RUN apt-get update && apt-get install -y \
    wget \
    unzip \
    libgomp1 \
    libvulkan1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Install Upscayl CLI binary and models
# Note: We use the linux-x86_64 version because it is the most stable.
# Docker Desktop on Mac (M1/M2/M3/M4) will run this via Rosetta 2 automatically.
RUN wget https://github.com/upscayl/upscayl/releases/download/v2.11.5/upscayl-2.11.5-linux.zip -O upscayl.zip && \
    unzip upscayl.zip -d /opt/upscayl_temp && \
    mkdir -p /opt/upscayl/models && \
    # Find the backend binary (can be upscayl-bin or upscayl-ncnn)
    find /opt/upscayl_temp -type f \( -name "upscayl-bin" -o -name "upscayl-ncnn" \) -exec mv {} /usr/local/bin/upscayl-bin \; && \
    # Find the models directory and copy its contents
    find /opt/upscayl_temp -name "models" -type d -exec cp -r {}/. /opt/upscayl/models/ \; && \
    chmod +x /usr/local/bin/upscayl-bin && \
    rm -rf /opt/upscayl_temp upscayl.zip

# Create models directory and copy custom models if they exist
COPY models* /opt/upscayl/models/

WORKDIR /app

# Install production dependencies only
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && \
    corepack prepare pnpm@latest --activate
RUN pnpm install --prod --frozen-lockfile

# Copy built assets from builder
COPY --from=builder /app/dist ./dist

# Set environment variables
ENV NODE_ENV=production

# Expose port
EXPOSE 8080

# Command to run the application
CMD ["node", "dist/main"]
