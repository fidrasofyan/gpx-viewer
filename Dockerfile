# syntax=docker/dockerfile:1

# GPX Viewer — Bun is the web server (production mode, no separate web server).
# The frontend is bundled by Bun at startup via the `index.html` import.

FROM oven/bun:1.4.0-alpine

WORKDIR /app

# Install dependencies first for better layer caching.
COPY --chown=bun:bun package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

# Copy the rest of the source.
COPY --chown=bun:bun . .

# The runtime never writes outside the image; make the app dir fully owned by
# the non-root `bun` user and drop privileges.
RUN chown -R bun:bun /app
USER bun

ENV NODE_ENV=production

# Bun's default server port inside the container (host mapping is set in compose.yaml).
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:3000/').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"]

CMD ["bun", "src/index.ts"]
