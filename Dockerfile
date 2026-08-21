# syntax=docker/dockerfile:1

# GPX Viewer — multi-stage build.
# Stage 1 (build): Bun bundles the static site into dist/.
# Stage 2 (runtime): Caddy serves dist/ — no Node/Bun runtime in the image.

# ---- Build stage ----
FROM oven/bun:1.4.0-alpine AS build

WORKDIR /app

# Install dependencies first for better layer caching.
COPY --chown=bun:bun package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

# Copy the rest of the source and bundle the client.
COPY --chown=bun:bun . .
RUN bun run build

# ---- Runtime stage ----
FROM caddy:2.11.4-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:80/"]
