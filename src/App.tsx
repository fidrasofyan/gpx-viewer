/**
 * GPX Viewer — main app shell.
 *
 * Responsive layout:
 *  - Desktop (md+): header / sidebar (files, legend, stats, splits) / map + chart tabs.
 *  - Mobile (<md):  header / file chips / map / chart tabs / stats, stacked & scrollable.
 * Compare mode overlays two files on the map with side-by-side stats.
 * Parsing happens client-side; files never leave the browser.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./index.css";

import { parseGpx, flattenFile } from "./gpx";
import {
  buildElevationProfile,
  computeStats,
  type ProfileSample,
} from "./geo";
import type { LoadedFile, LoadError } from "./types";
import { elevationGradientCSS } from "./color";
import { MapView, type MapTrack, type MapRoute, type MapWaypoint } from "./components/MapView";
import { ChartTabs } from "./components/ChartTabs";
import { StatsPanel } from "./components/StatsPanel";
import { SplitsTable } from "./components/SplitsTable";
import { ComparePanel } from "./components/ComparePanel";
import { FileSelector } from "./components/FileSelector";
import { Dropzone } from "./components/Dropzone";
import { Errors } from "./components/Errors";
import { newId } from "./id";

const PALETTE = [
  "#f43f5e", // rose-500
  "#3b82f6", // blue-500
  "#22c55e", // green-500
  "#eab308", // yellow-500
  "#a855f7", // purple-500
  "#06b6d4", // cyan-500
  "#f97316", // orange-500
  "#ec4899", // pink-500
  "#84cc16", // lime-500
  "#6366f1", // indigo-500
];

/** True on md+ (≥768px) screens; tracks changes live. */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isDesktop;
}

export function App() {
  const isDesktop = useIsDesktop();

  const [files, setFiles] = useState<LoadedFile[]>([]);
  const [errors, setErrors] = useState<LoadError[]>([]);
  const [selectedId, setSelectedId] = useState<string>("all");
  // Hovered chart sample → highlighted on the map.
  const [hoverSample, setHoverSample] = useState<ProfileSample | null>(null);
  // Chart click → pan the map to that point.
  const [focusRequest, setFocusRequest] = useState<{ lat: number; lon: number; nonce: number } | null>(null);
  // Split row click → highlight that stretch of track on the map.
  const [selectedSplit, setSelectedSplit] = useState<{
    index: number;
    fromIdx: number;
    toIdx: number;
  } | null>(null);
  // Compare mode.
  const [compare, setCompare] = useState(false);
  const [compareAId, setCompareAId] = useState<string | null>(null);
  const [compareBId, setCompareBId] = useState<string | null>(null);

  // ---------------------------------------------------------------- loaders
  const handleFiles = useCallback(async (fileList: File[]) => {
    const newErrors: LoadError[] = [];
    const newFiles: LoadedFile[] = [];

    for (const file of fileList) {
      const lower = file.name.toLowerCase();
      if (!lower.endsWith(".gpx") && !lower.endsWith(".xml")) {
        newErrors.push({ fileName: file.name, message: "Not a .gpx/.xml file" });
        continue;
      }
      try {
        const text = await file.text();
        const gpx = parseGpx(text, file.name);
        const hasData =
          gpx.tracks.length > 0 || gpx.routes.length > 0 || gpx.waypoints.length > 0;
        if (!hasData) {
          newErrors.push({ fileName: file.name, message: "No tracks, routes, or waypoints found" });
          continue;
        }
        newFiles.push({ id: newId(), gpx });
      } catch (e) {
        newErrors.push({
          fileName: file.name,
          message: e instanceof Error ? e.message : "Could not parse file",
        });
      }
    }

    if (newFiles.length > 0) {
      setFiles((prev) => [...prev, ...newFiles]);
      setSelectedId(newFiles[0]!.id);
    }
    if (newErrors.length > 0) {
      setErrors((prev) => [...prev, ...newErrors]);
    }
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    setSelectedId((sel) => (sel === id ? "all" : sel));
  }, []);

  const clearAll = useCallback(() => {
    setFiles([]);
    setErrors([]);
    setSelectedId("all");
    setCompare(false);
  }, []);

  // Disable compare automatically if fewer than 2 files remain.
  useEffect(() => {
    if (files.length < 2) setCompare(false);
  }, [files]);

  // Auto-enable compare when the file count *grows* to exactly 2 (adding a
  // second file), so "two files" immediately means "compare" — but not when
  // files are removed down to 2.
  const prevFileCountRef = useRef(0);
  useEffect(() => {
    if (files.length === 2 && prevFileCountRef.current < 2 && !compare) {
      setCompareAId(files[0]!.id);
      setCompareBId(files[1]!.id);
      setCompare(true);
    }
    prevFileCountRef.current = files.length;
  }, [files, compare]);

  const toggleCompare = useCallback(() => {
    if (!compare && files.length >= 2) {
      setCompareAId(files[0]!.id);
      setCompareBId(files[1]!.id);
    }
    setCompare(!compare);
  }, [compare, files]);

  // ------------------------------------------------------------------ data
  const visibleFiles = useMemo(
    () => (selectedId === "all" ? files : files.filter((f) => f.id === selectedId)),
    [files, selectedId],
  );

  const compareA = useMemo(
    () => (compare ? files.find((f) => f.id === compareAId) ?? files[0] ?? null : null),
    [compare, files, compareAId],
  );
  const compareB = useMemo(() => {
    if (!compare || !compareA) return null;
    return (
      files.find((f) => f.id === compareBId && f.id !== compareA.id) ??
      files.find((f) => f.id !== compareA.id) ??
      compareA
    );
  }, [compare, files, compareBId, compareA]);

  // Files feeding the map.
  const mapFiles = useMemo(() => {
    if (compare) return [compareA, compareB].filter((f): f is LoadedFile => f !== null);
    return visibleFiles;
  }, [compare, compareA, compareB, visibleFiles]);

  // Data for the map.
  const mapData = useMemo(() => {
    const tracks: MapTrack[] = [];
    const routes: MapRoute[] = [];
    const waypoints: MapWaypoint[] = [];

    mapFiles.forEach((f, fileIdx) => {
      f.gpx.tracks.forEach((t, ti) => {
        tracks.push({
          id: `${f.id}-t${ti}`,
          name: t.name,
          color: PALETTE[(fileIdx + ti) % PALETTE.length]!,
          segments: t.segments.map((s) => s.points),
        });
      });
      f.gpx.routes.forEach((r, ri) => {
        routes.push({
          id: `${f.id}-r${ri}`,
          name: r.name,
          color: PALETTE[(fileIdx + 4 + ri) % PALETTE.length]!,
          points: r.points,
        });
      });
      f.gpx.waypoints.forEach((w, wi) => {
        waypoints.push({ id: `${f.id}-w${wi}`, lat: w.lat, lon: w.lon, name: w.name });
      });
    });

    return { tracks, routes, waypoints };
  }, [mapFiles]);

  // Primary chart/stats points (file A in compare mode, else the selection).
  const chartPoints = useMemo(() => {
    if (compare && compareA) return flattenFile(compareA.gpx);
    return visibleFiles.flatMap((f) => flattenFile(f.gpx));
  }, [compare, compareA, visibleFiles]);

  const stats = useMemo(
    () => (chartPoints.length > 0 ? computeStats(chartPoints) : null),
    [chartPoints],
  );
  const statsB = useMemo(
    () => (compare && compareB ? computeStats(flattenFile(compareB.gpx)) : null),
    [compare, compareB],
  );

  // Global elevation scale for track coloring (tracks only).
  const eleScale = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    let any = false;
    for (const t of mapData.tracks) {
      for (const seg of t.segments) {
        for (const p of seg) {
          if (p.ele !== null) {
            any = true;
            if (p.ele < min) min = p.ele;
            if (p.ele > max) max = p.ele;
          }
        }
      }
    }
    return any ? { min, max } : null;
  }, [mapData]);

  // Elevation overlay for compare mode.
  const compareOverlays = useMemo(() => {
    if (!compare || !compareB) return undefined;
    return [
      {
        samples: buildElevationProfile(flattenFile(compareB.gpx)),
        color: "#f59e0b",
        label: compareB.gpx.fileName,
      },
    ];
  }, [compare, compareB]);

  // Hover/focus → map point.
  const hoverPoint = useMemo(() => {
    if (!hoverSample) return null;
    const p = chartPoints[hoverSample.idx];
    return p ? { lat: p.lat, lon: p.lon } : null;
  }, [hoverSample, chartPoints]);

  // Highlighted split → lat/lon list for the map overlay.
  const splitHighlight = useMemo(() => {
    if (!selectedSplit) return null;
    return chartPoints
      .slice(selectedSplit.fromIdx, selectedSplit.toIdx + 1)
      .map((p) => [p.lat, p.lon] as [number, number]);
  }, [selectedSplit, chartPoints]);

  const handleChartSelect = useCallback(
    (s: ProfileSample) => {
      const p = chartPoints[s.idx];
      if (!p) return;
      setFocusRequest((prev) => ({ lat: p.lat, lon: p.lon, nonce: (prev?.nonce ?? 0) + 1 }));
    },
    [chartPoints],
  );

  // Reset chart-driven state when the underlying data changes.
  useEffect(() => {
    setHoverSample(null);
    setFocusRequest(null);
    setSelectedSplit(null);
  }, [chartPoints]);

  const totals = useMemo(() => {
    let tracks = 0;
    let waypoints = 0;
    let points = 0;
    for (const f of files) {
      tracks += f.gpx.tracks.length;
      waypoints += f.gpx.waypoints.length;
      for (const t of f.gpx.tracks) for (const s of t.segments) points += s.points.length;
      for (const r of f.gpx.routes) points += r.points.length;
    }
    return { tracks, waypoints, points };
  }, [files]);

  const selectCls =
    "max-w-[38vw] truncate rounded border border-white/10 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 outline-none focus:border-sky-500/50 md:max-w-[14rem]";

  const currentFileName = files.find((f) => f.id === selectedId)?.gpx.fileName ?? "";

  const statsBlock = (
    <>
      <div className="mb-2 flex items-baseline justify-between gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        <span>{compare ? "Comparison" : "Statistics"}</span>
        {!compare && (
          <span className="truncate text-[10px] font-normal normal-case tracking-normal text-zinc-400">
            {selectedId === "all" ? "all files (combined)" : currentFileName}
          </span>
        )}
      </div>
      {compare && stats && statsB && compareA && compareB ? (
        <ComparePanel
          a={{ name: compareA.gpx.fileName, stats }}
          b={{ name: compareB.gpx.fileName, stats: statsB }}
        />
      ) : (
        <StatsPanel stats={stats} />
      )}
      {!compare && (
        <SplitsTable
          points={chartPoints}
          stats={stats}
          onSelectSplit={setSelectedSplit}
          selectedIndex={selectedSplit?.index ?? null}
        />
      )}
    </>
  );

  return (
    <div className="flex h-full flex-col bg-[#0b0e14] text-zinc-100">
      {/* Header */}
      <header className="flex shrink-0 items-center gap-3 border-b border-white/10 bg-zinc-950/60 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-sky-400">
            <path d="m8 3 4 8 5-5 5 15H2L8 3z" />
          </svg>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold leading-none text-white">GPX Viewer</h1>
            <p className="mt-1 hidden text-[11px] leading-none text-zinc-500 sm:block">
              drop .gpx files — parsed locally, never uploaded
            </p>
          </div>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {files.length > 0 && (
            <>
              <span className="hidden text-xs text-zinc-500 xl:inline">
                {totals.tracks} track{totals.tracks === 1 ? "" : "s"} · {totals.waypoints} waypoint
                {totals.waypoints === 1 ? "" : "s"} · {totals.points.toLocaleString()} points
              </span>
              {files.length >= 2 && (
                <button
                  type="button"
                  onClick={toggleCompare}
                  className={`rounded-lg px-2.5 py-1.5 text-xs transition ${
                    compare
                      ? "bg-amber-500/20 text-amber-200 ring-1 ring-amber-500/40"
                      : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                  }`}
                >
                  Compare
                </button>
              )}
              <button
                type="button"
                onClick={clearAll}
                className="rounded-lg px-2.5 py-1.5 text-xs text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200"
              >
                Clear all
              </button>
            </>
          )}
          <Dropzone onFiles={handleFiles} />
        </div>
      </header>

      {/* Compare bar */}
      {compare && files.length >= 2 && compareA && (
        <div className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-zinc-950/40 px-4 py-2">
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Compare
          </span>
          <select
            value={compareA.id}
            onChange={(e) => setCompareAId(e.target.value || null)}
            className={selectCls}
            aria-label="First track to compare"
          >
            {files.map((f) => (
              <option key={f.id} value={f.id}>
                {f.gpx.fileName}
              </option>
            ))}
          </select>
          <span className="shrink-0 text-xs text-zinc-500">vs</span>
          {compareB && (
            <select
              value={compareB.id}
              onChange={(e) => setCompareBId(e.target.value || null)}
              className={selectCls}
              aria-label="Second track to compare"
            >
              {files
                .filter((f) => f.id !== compareA.id)
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.gpx.fileName}
                  </option>
                ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => setCompare(false)}
            className="ml-auto rounded p-1 text-zinc-500 transition hover:bg-white/10 hover:text-zinc-200"
            aria-label="Close compare mode"
          >
            ✕
          </button>
        </div>
      )}

      {/* Body */}
      {files.length === 0 ? (
        <div className="flex flex-1 items-center justify-center overflow-y-auto p-8">
          <div className="max-w-md text-center">
            <div className="text-6xl">🗺️</div>
            <h2 className="mt-4 text-xl font-semibold text-white">Drop a GPX file to get started</h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              Tracks, routes, and waypoints are parsed in your browser and rendered on a map with
              statistics and an elevation profile. Everything stays on your device.
            </p>
            <div className="mt-6 flex justify-center">
              <Dropzone
                onFiles={handleFiles}
                label="Browse GPX files"
                buttonClassName="inline-flex items-center gap-2 rounded-xl border border-sky-500/40 bg-sky-500/15 px-6 py-3 text-sm font-medium text-sky-200 transition hover:bg-sky-500/25"
              />
            </div>
            <div className="mt-6 w-full text-left">
              <Errors errors={errors} onClearErrors={() => setErrors([])} />
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Desktop layout */}
          {isDesktop && (
            <div className="flex min-h-0 flex-1 overflow-hidden">
              <aside className="w-96 shrink-0 overflow-y-auto border-r border-white/10 bg-zinc-950/40 p-3">
                <FileSelector
                  files={files}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onRemove={removeFile}
                  errors={errors}
                  onClearErrors={() => setErrors([])}
                  variant="list"
                />

                <div className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  On the map
                </div>
                <ul className="space-y-1 text-xs">
                  {mapData.tracks.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 text-zinc-300">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.color }} />
                      <span className="truncate">{t.name}</span>
                    </li>
                  ))}
                  {mapData.routes.map((r) => (
                    <li key={r.id} className="flex items-center gap-2 text-zinc-400">
                      <span
                        className="h-0.5 w-3 shrink-0 border-t-2 border-dashed"
                        style={{ borderColor: r.color }}
                      />
                      <span className="truncate">{r.name}</span>
                    </li>
                  ))}
                  {mapData.waypoints.length > 0 && (
                    <li className="flex items-center gap-2 text-zinc-400">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-amber-400 bg-amber-400/40" />
                      <span>
                        {mapData.waypoints.length} waypoint{mapData.waypoints.length === 1 ? "" : "s"}
                      </span>
                    </li>
                  )}
                  {eleScale && !compare && (
                    <li className="mt-2">
                      <div
                        className="h-2 w-full rounded"
                        style={{ background: elevationGradientCSS() }}
                      />
                      <div className="mt-0.5 flex justify-between font-mono text-[10px] text-zinc-500">
                        <span>{Math.round(eleScale.min)} m</span>
                        <span>{Math.round(eleScale.max)} m</span>
                      </div>
                    </li>
                  )}
                  {mapData.tracks.length === 0 && mapData.routes.length === 0 && (
                    <li className="text-zinc-500">No geometry in this selection.</li>
                  )}
                </ul>

                <div className="mt-5">{statsBlock}</div>
              </aside>

              <main className="flex min-w-0 flex-1 flex-col">
                <div className="relative min-h-0 flex-1">
                  <MapView
                    tracks={mapData.tracks}
                    routes={mapData.routes}
                    waypoints={mapData.waypoints}
                    hoverPoint={hoverPoint}
                    focusPoint={focusRequest}
                    highlight={splitHighlight}
                    eleScale={compare ? null : eleScale}
                  />
                </div>
                <div className="shrink-0 border-t border-white/10 bg-zinc-950/40 p-3">
                  <ChartTabs
                    points={chartPoints}
                    stats={stats}
                    overlays={compareOverlays}
                    onHover={setHoverSample}
                    onSelect={handleChartSelect}
                  />
                </div>
              </main>
            </div>
          )}

          {/* Mobile layout */}
          {!isDesktop && (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <div className="shrink-0 border-b border-white/10 bg-zinc-950/40 px-3 pb-2 pt-3">
                <FileSelector
                  files={files}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onRemove={removeFile}
                  errors={errors}
                  onClearErrors={() => setErrors([])}
                  variant="chips"
                />
              </div>

              <div className="relative h-[52vh] shrink-0">
                <MapView
                  tracks={mapData.tracks}
                  routes={mapData.routes}
                  waypoints={mapData.waypoints}
                  hoverPoint={hoverPoint}
                  focusPoint={focusRequest}
                  highlight={splitHighlight}
                  eleScale={compare ? null : eleScale}
                />
              </div>

              <div className="shrink-0 border-t border-white/10 bg-zinc-950/40 p-3">
                <ChartTabs
                  points={chartPoints}
                  stats={stats}
                  overlays={compareOverlays}
                  onHover={setHoverSample}
                  onSelect={handleChartSelect}
                />
              </div>

              <div className="shrink-0 border-t border-white/10 bg-zinc-950/40 px-3 py-3">
                {statsBlock}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default App;
