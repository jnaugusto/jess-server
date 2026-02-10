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

# Install dependencies for Upscayl/Real-ESRGAN and image processing
RUN apt-get update && apt-get install -y \
    wget \
    unzip \
    libgomp1 \
    libvulkan1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Install Upscayl CLI binary and models
# We download the Linux release which contains the upscayl-bin and models
RUN wget https://github.com/upscayl/upscayl/releases/download/v2.11.5/upscayl-2.11.5-linux.zip && \
    unzip upscayl-2.11.5-linux.zip -d /opt/upscayl_temp && \
    mkdir -p /opt/upscayl/models && \
    # Upscayl Linux zip structure: resources/bin/upscayl-bin and resources/models/
    mv /opt/upscayl_temp/resources/bin/upscayl-bin /usr/local/bin/upscayl-bin && \
    mv /opt/upscayl_temp/resources/models/* /opt/upscayl/models/ && \
    chmod +x /usr/local/bin/upscayl-bin && \
    rm -rf /opt/upscayl_temp upscayl-2.11.5-linux.zip

# Create models directory and copy custom models if they exist
# This allows overriding or adding models to /opt/upscayl/models
COPY models* /opt/upscayl/models/

WORKDIR /app

# Install production dependencies only (including sharp for linux)
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
