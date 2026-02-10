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

# Build arguments for architecture detection
ARG TARGETPLATFORM
RUN echo "Building for $TARGETPLATFORM"

# Install dependencies for Upscayl/Real-ESRGAN and image processing
RUN apt-get update && apt-get install -y \
    wget \
    unzip \
    libgomp1 \
    libvulkan1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Install Upscayl CLI binary and models
# We favor the stable x86_64 build but provide the ARM64 nightly as a fallback for Mac M-series
RUN if [ "$TARGETPLATFORM" = "linux/arm64" ]; then \
      # ARM64 (M4 Mac) - Using a known working nightly/beta path if possible
      # Fallback to the stable x86_64 if ARM fails, as Rosetta will handle it
      wget https://github.com/upscayl/upscayl-ncnn/releases/download/v202311021448-nightly/upscayl-bin-202311021448-linux-arm64.zip -O upscayl.zip || \
      wget https://github.com/upscayl/upscayl/releases/download/v2.11.5/upscayl-2.11.5-linux.zip -O upscayl.zip; \
    else \
      # x86_64 (Windows Server)
      wget https://github.com/upscayl/upscayl/releases/download/v2.11.5/upscayl-2.11.5-linux.zip -O upscayl.zip; \
    fi && \
    unzip upscayl.zip -d /opt/upscayl_temp && \
    mkdir -p /opt/upscayl/models && \
    # Robustly find binary and models
    find /opt/upscayl_temp -type f \( -name "upscayl-bin" -o -name "upscayl-ncnn" \) -exec mv {} /usr/local/bin/upscayl-bin \; && \
    find /opt/upscayl_temp -name "models" -type d -exec cp -r {}/. /opt/upscayl/models/ \; && \
    chmod +x /usr/local/bin/upscayl-bin && \
    rm -rf /opt/upscayl_temp upscayl.zip

# Create models directory and copy custom models if they exist
COPY models* /opt/upscayl/models/

WORKDIR /app

# Install production dependencies only
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && \
    corepack prepare pnpm@latest --activate && \
    pnpm install --prod --frozen-lockfile

# Copy built assets from builder
COPY --from=builder /app/dist ./dist

# Set environment variables
ENV NODE_ENV=production

# Expose port
EXPOSE 8080

# Command to run the application
CMD ["node", "dist/main"]
