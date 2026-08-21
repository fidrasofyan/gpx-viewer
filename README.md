# GPX Viewer

A local GPX track viewer built with **Bun + React 19 + Tailwind CSS v4 + Leaflet**.

Drop `.gpx` files onto the page (or use the **Add GPX files** button) and get:

- 🗺️ Tracks, routes, and waypoints rendered on an OpenStreetMap-backed Leaflet map, with start/finish markers, a scale bar, and **elevation-colored tracks** (green → red by altitude)
- 📊 Statistics: distance, elevation gain/loss, min/max elevation, duration, moving time, speeds, and heart-rate / cadence / power when the file carries them
- ⛰️ Tabbed bottom charts — **Elevation** (grade-colored line + grade strip), **Speed**, **Heart rate** (5-zone bands + time-in-zone, configurable max HR), **Cadence**, **Power** — all synced with the map (hover/drag highlights the point, click/tap centers it)
- 📂 Multiple files, per-file selection, track legend, a combined "All files" view, per-km **lap splits**, and a full **compare mode** (overlay two tracks with side-by-side stats and overlaid profiles)
- 📱 Responsive: desktop side-by-side layout, stacked mobile layout

All parsing happens **in your browser** — files are never uploaded anywhere.

## Development

```bash
bun install     # install dependencies
bun dev         # dev server with HMR → http://localhost:3000
```

## Production

```bash
bun run build   # bundles the client into dist/
bun start       # NODE_ENV=production server
```

## Docker

Bun runs as the web server in production mode inside the container (no separate
web server needed). The container listens on Bun's default port `3000`; the host
side is configured via a required `.env` file — the bind address (`HOST`) and the
port (`PORT`).

```bash
cp .env.example .env   # required — compose.yaml fails without HOST and PORT
docker compose up -d --build
```

Then open http://localhost:8080 (or the address/port from your `.env`).

- `Dockerfile` — `oven/bun:1.4.0-alpine`, non-root `bun` user, healthcheck, no volumes needed (the app is stateless and parses GPX in the browser).
- `compose.yaml` — service `gpx-viewer`, `restart: unless-stopped`, port `"${HOST:?...}:${PORT:?...}:3000"` (both `HOST` and `PORT` required from `.env`).

## Project layout

| Path | Purpose |
| --- | --- |
| `src/index.ts` | Bun server (serves the app) |
| `src/App.tsx` | App shell: header, sidebar, layout |
| `src/gpx.ts` | Tolerant GPX 1.0/1.1 parser (tracks, routes, waypoints) |
| `src/geo.ts` | Distance, elevation, time stats + profile building |
| `src/components/MapView.tsx` | Leaflet map rendering (elevation colors, start/finish, scale) |
| `src/components/ChartTabs.tsx` | Tabbed bottom charts (Elevation/Speed/HR/Cadence/Power) |
| `src/components/ProfileChart.tsx` | Reusable SVG chart (hover/click sync, bands, overlays, zones) |
| `src/components/ElevationProfile.tsx` | Elevation chart wrapper (grade coloring + grade strip) |
| `src/components/StatsPanel.tsx` / `SplitsTable.tsx` | Stats grid / per-km splits |
| `src/components/ComparePanel.tsx` | Side-by-side comparison stats |
| `src/components/FileSelector.tsx` / `Dropzone.tsx` | File list/chips / drag & drop upload |
| `src/color.ts` | Elevation (terrain) and grade color scales |

## Try it

```bash
bun dev
```

Then open http://localhost:3000 and drop any `.gpx` file onto the page.
