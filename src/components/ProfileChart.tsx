/**
 * ProfileChart — a reusable distance-based SVG chart (elevation, speed, HR, …).
 *
 * Features: hover/drag crosshair + readout, click/tap → onSelect, min/max
 * envelope band, extra overlay series (compare mode), horizontal zone bands
 * (HR), a per-x colored strip (grade), and responsive viewBox sizing.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { ProfileSample } from "../geo";

const DEFAULT_VW = 820;
const BASE_H = 215;
const STRIP_H = 16;

export interface OverlaySeries {
  samples: ProfileSample[];
  color: string;
  label: string;
}

interface Props {
  samples: ProfileSample[];
  color: string;
  formatValue?: (v: number) => string;
  yLabel?: string;
  /** Min/max envelope samples (rendered as a translucent band). */
  band?: ProfileSample[];
  overlays?: OverlaySeries[];
  /** Color the line per segment by value/dist (e.g. grade coloring). */
  segmentColor?: (value: number, distM: number) => string;
  /** Thin colored strip below the plot (e.g. grade). */
  strip?: { samples: ProfileSample[]; color: (value: number) => string };
  /** Horizontal shaded bands (e.g. HR zones). */
  zoneBands?: { from: number; to: number; color: string; label: string }[];
  /** Optional fixed y domain; else derived from data + zone bands. */
  yDomain?: [number, number];
  onHover?: (s: ProfileSample | null) => void;
  onSelect?: (s: ProfileSample) => void;
  emptyMessage?: string;
}

export function ProfileChart({
  samples,
  color,
  formatValue = (v) => v.toFixed(0),
  yLabel,
  band,
  overlays = [],
  segmentColor,
  strip,
  zoneBands = [],
  yDomain,
  onHover,
  onSelect,
  emptyMessage = "No data for this chart.",
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [hover, setHover] = useState<ProfileSample | null>(null);
  const [vw, setVw] = useState(DEFAULT_VW);

  // Match the viewBox width to the container so text stays legible at any size.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width ?? 0);
      if (w > 0) setVw(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const allSamples = useMemo(
    () => [samples, band ?? [], ...overlays.map((o) => o.samples), strip?.samples ?? []].flat(),
    [samples, band, overlays, strip],
  );
  const xMax = useMemo(
    () => allSamples.reduce((m, s) => Math.max(m, s.distM), 0),
    [allSamples],
  );

  // Y domain: fixed, or derived from data + zone bands.
  const yMinMax = useMemo(() => {
    if (yDomain) return yDomain;
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of allSamples) {
      if (s.value < lo) lo = s.value;
      if (s.value > hi) hi = s.value;
    }
    for (const z of zoneBands) {
      if (z.from < lo) lo = z.from;
      if (z.to > hi) hi = z.to;
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1] as [number, number];
    if (lo === hi) {
      lo -= 1;
      hi += 1;
    }
    const pad = (hi - lo) * 0.08;
    return [lo - pad, hi + pad] as [number, number];
  }, [allSamples, zoneBands, yDomain]);

  const [yMin, yMax] = yMinMax;
  const H = BASE_H + (strip ? STRIP_H : 0);
  const PAD = {
    top: 14,
    right: Math.max(10, vw * 0.015),
    bottom: strip ? 32 : 28,
    left: Math.min(54, Math.max(38, vw * 0.08)),
  };
  const plotW = vw - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (d: number) => PAD.left + (d / xMax) * plotW;
  const y = (e: number) => PAD.top + (1 - (e - yMin) / (yMax - yMin)) * plotH;

  // Primary line path (single color or per-segment colored).
  const linePaths = useMemo(() => {
    if (segmentColor) {
      const paths: { d: string; color: string }[] = [];
      for (let i = 1; i < samples.length; i++) {
        const a = samples[i - 1]!;
        const b = samples[i]!;
        const mid = (a.value + b.value) / 2;
        const midDist = (a.distM + b.distM) / 2;
        paths.push({
          d: `M${x(a.distM).toFixed(1)},${y(a.value).toFixed(1)}L${x(b.distM).toFixed(1)},${y(b.value).toFixed(1)}`,
          color: segmentColor(mid, midDist),
        });
      }
      return paths;
    }
    const d = samples
      .map((s, i) => `${i === 0 ? "M" : "L"}${x(s.distM).toFixed(1)},${y(s.value).toFixed(1)}`)
      .join(" ");
    return d ? [{ d, color }] : [];
  }, [samples, segmentColor, color, xMax, yMin, yMax, vw]); // eslint-disable-line react-hooks/exhaustive-deps

  // Envelope band (min/max per x bucket).
  const bandPath = useMemo(() => {
    if (!band || band.length === 0 || xMax <= 0) return "";
    const bucketCount = Math.min(140, band.length);
    const buckets = new Array<{ min: number; max: number }>(bucketCount);
    for (let i = 0; i < bucketCount; i++) buckets[i] = { min: Infinity, max: -Infinity };
    for (const s of band) {
      const b = Math.min(bucketCount - 1, Math.floor((s.distM / xMax) * bucketCount));
      const bucket = buckets[b]!;
      if (s.value < bucket.min) bucket.min = s.value;
      if (s.value > bucket.max) bucket.max = s.value;
    }
    const top: string[] = [];
    const bottom: string[] = [];
    buckets.forEach((b, i) => {
      const bx = x((i / bucketCount) * xMax);
      if (b.max !== -Infinity) top.push(`${i === 0 ? "M" : "L"}${bx.toFixed(1)},${y(b.max).toFixed(1)}`);
      if (b.min !== Infinity) bottom.push(`L${bx.toFixed(1)},${y(b.min).toFixed(1)}`);
    });
    return [...top, ...bottom.reverse()].join(" ");
  }, [band, xMax, yMin, yMax, vw]); // eslint-disable-line react-hooks/exhaustive-deps

  // Grade strip (colored rects per x bucket).
  const stripRects = useMemo(() => {
    if (!strip || strip.samples.length === 0 || xMax <= 0) return [];
    const bucketCount = Math.min(120, strip.samples.length);
    const vals = new Array<number>(bucketCount).fill(0);
    const counts = new Array<number>(bucketCount).fill(0);
    for (const s of strip.samples) {
      const b = Math.min(bucketCount - 1, Math.floor((s.distM / xMax) * bucketCount));
      vals[b]! += s.value;
      counts[b]!++;
    }
    const rects: { x: number; w: number; color: string }[] = [];
    const bw = plotW / bucketCount;
    for (let i = 0; i < bucketCount; i++) {
      const v = counts[i]! > 0 ? vals[i]! / counts[i]! : 0;
      rects.push({ x: PAD.left + i * bw, w: Math.max(0.5, bw - 0.5), color: strip.color(v) });
    }
    return rects;
  }, [strip, xMax, plotW, vw]); // eslint-disable-line react-hooks/exhaustive-deps

  if (samples.length === 0 && overlays.length === 0) {
    return (
      <div className="flex h-full min-h-[140px] items-center justify-center text-sm text-zinc-500">
        {emptyMessage}
      </div>
    );
  }

  const stripY = H - PAD.bottom + 6;

  // Axis ticks.
  const yTicks = Array.from({ length: 5 }, (_, i) => yMin + ((yMax - yMin) * i) / 4);
  const xTicks = 5;
  const xTickVals = Array.from({ length: xTicks + 1 }, (_, i) => (xMax * i) / xTicks);

  const nearest = (dist: number): ProfileSample => {
    let best = samples[0]!;
    for (const s of samples) {
      if (Math.abs(s.distM - dist) < Math.abs(best.distM - dist)) best = s;
    }
    return best;
  };

  const updateFromClientX = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const best = nearest(frac * xMax);
    setHover(best);
    onHover?.(best);
  };

  const onLeave = () => {
    setHover(null);
    onHover?.(null);
  };

  const handleClick = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onSelect?.(nearest(frac * xMax));
  };

  const hoverX = hover ? x(hover.distM) : 0;

  // Overlay values at the hover distance, for the tooltip.
  const overlayHover = hover
    ? overlays.map((o) => {
        let best = o.samples[0];
        if (!best) return null;
        for (const s of o.samples) {
          if (Math.abs(s.distM - hover.distM) < Math.abs(best!.distM - hover.distM)) best = s;
        }
        return { ...o, sample: best };
      })
    : [];

  return (
    <div ref={wrapRef} className="relative w-full">
      {overlays.length > 0 && (
        <div className="absolute right-0 top-0 z-10 flex flex-wrap items-center gap-2 text-[10px] text-zinc-400">
          {overlays.map((o) => (
            <span key={o.label} className="flex items-center gap-1">
              <span className="h-0.5 w-3 rounded" style={{ background: o.color }} />
              {o.label}
            </span>
          ))}
        </div>
      )}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${vw} ${H}`}
        className="w-full h-auto select-none touch-none"
        onMouseMove={(e) => updateFromClientX(e.clientX)}
        onMouseLeave={onLeave}
        onClick={(e) => handleClick(e.clientX)}
        onTouchStart={(e) => {
          const t = e.touches[0];
          if (!t) return;
          touchStartRef.current = { x: t.clientX, y: t.clientY };
          updateFromClientX(t.clientX);
        }}
        onTouchMove={(e) => {
          const t = e.touches[0];
          if (t) updateFromClientX(t.clientX);
        }}
        onTouchEnd={(e) => {
          const start = touchStartRef.current;
          const t = e.changedTouches[0];
          if (t && start && Math.abs(t.clientX - start.x) < 10 && Math.abs(t.clientY - start.y) < 10) {
            handleClick(t.clientX);
          }
          touchStartRef.current = null;
          onLeave();
        }}
        role="img"
        aria-label={yLabel ? `${yLabel} profile` : "Profile chart"}
      >
        {/* Zone bands (behind everything) */}
        {zoneBands.map((z) => {
          const y1 = y(z.from);
          const y2 = y(z.to);
          return (
            <rect
              key={z.label}
              x={PAD.left}
              y={Math.min(y1, y2)}
              width={plotW}
              height={Math.abs(y2 - y1)}
              fill={z.color}
              opacity={0.12}
            />
          );
        })}

        {/* Grid + y ticks */}
        {yTicks.map((t, i) => (
          <g key={`y${i}`}>
            <line x1={PAD.left} x2={vw - PAD.right} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.07)" />
            <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" className="fill-zinc-500 text-[11px] font-mono">
              {formatValue(t)}
            </text>
          </g>
        ))}
        {xTickVals.map((t, i) => (
          <text
            key={`x${i}`}
            x={x(t)}
            y={H - 8}
            textAnchor="middle"
            className="fill-zinc-500 text-[11px] font-mono"
          >
            {t >= 1000 ? `${(t / 1000).toFixed(1)}k` : Math.round(t)}m
          </text>
        ))}
        <text x={PAD.left} y={H - 8} textAnchor="start" className="fill-zinc-500 text-[11px]">
          distance →
        </text>

        {/* Grade strip */}
        {strip && stripRects.length > 0 && (
          <g>
            {stripRects.map((r, i) => (
              <rect key={i} x={r.x} y={stripY} width={r.w} height={STRIP_H - 4} rx={1} fill={r.color} opacity={0.85} />
            ))}
          </g>
        )}

        {/* Envelope band */}
        {bandPath && <path d={bandPath} fill={color} opacity={0.12} stroke="none" />}

        {/* Overlays */}
        {overlays.map((o) => (
          <path
            key={o.label}
            d={o.samples
              .map((s, i) => `${i === 0 ? "M" : "L"}${x(s.distM).toFixed(1)},${y(s.value).toFixed(1)}`)
              .join(" ")}
            fill="none"
            stroke={o.color}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={0.9}
          />
        ))}

        {/* Primary line */}
        {linePaths.map((p, i) => (
          <path
            key={i}
            d={p.d}
            fill="none"
            stroke={p.color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {/* Hover crosshair */}
        {hover && (
          <g>
            <line x1={hoverX} x2={hoverX} y1={PAD.top} y2={H - PAD.bottom} stroke="rgba(255,255,255,0.35)" strokeDasharray="3 3" />
            <circle cx={hoverX} cy={y(hover.value)} r={3.5} fill={color} stroke="#fff" strokeWidth={1.2} />
          </g>
        )}
      </svg>

      {/* Hover tooltip */}
      {hover && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border border-white/10 bg-zinc-900/95 px-2.5 py-1 text-xs shadow-lg"
          style={{ left: `${(hoverX / vw) * 100}%`, top: -8 }}
        >
          <span className="font-mono text-zinc-400">{formatDist(hover.distM)}</span>
          <span className="mx-1 text-zinc-600">·</span>
          <span className="font-mono text-white">{formatValue(hover.value)}</span>
          {overlayHover.map((o) =>
            o && o.sample ? (
              <div key={o.label} className="font-mono" style={{ color: o.color }}>
                {formatDist(o.sample.distM)} · {formatValue(o.sample.value)}
              </div>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}

function formatDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}
