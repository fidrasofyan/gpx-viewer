/**
 * Compare panel — side-by-side statistics for two tracks.
 */

import type { TrackStats } from "../geo";
import {
  formatDistance,
  formatDuration,
  formatElevation,
  formatSpeed,
} from "../geo";

interface Props {
  a: { name: string; stats: TrackStats };
  b: { name: string; stats: TrackStats };
}

export function ComparePanel({ a, b }: Props) {
  const rows: { label: string; av: string; bv: string }[] = [
    {
      label: "Distance",
      av: formatDistance(a.stats.distanceM),
      bv: formatDistance(b.stats.distanceM),
    },
    {
      label: "Elev gain",
      av: formatElevation(a.stats.elevation.gainM),
      bv: formatElevation(b.stats.elevation.gainM),
    },
    {
      label: "Elev loss",
      av: formatElevation(a.stats.elevation.lossM),
      bv: formatElevation(b.stats.elevation.lossM),
    },
    {
      label: "Min / max ele",
      av: `${formatElevation(a.stats.elevation.minEle)} / ${formatElevation(a.stats.elevation.maxEle)}`,
      bv: `${formatElevation(b.stats.elevation.minEle)} / ${formatElevation(b.stats.elevation.maxEle)}`,
    },
    {
      label: "Duration",
      av: formatDuration(a.stats.time.durationMs),
      bv: formatDuration(b.stats.time.durationMs),
    },
    {
      label: "Moving time",
      av: formatDuration(a.stats.time.movingMs),
      bv: formatDuration(b.stats.time.movingMs),
    },
    {
      label: "Avg speed",
      av: formatSpeed(a.stats.time.avgSpeedKmh),
      bv: formatSpeed(b.stats.time.avgSpeedKmh),
    },
    {
      label: "Max speed",
      av: formatSpeed(a.stats.time.maxSpeedKmh),
      bv: formatSpeed(b.stats.time.maxSpeedKmh),
    },
    {
      label: "Avg HR",
      av: a.stats.hr ? `${Math.round(a.stats.hr.avg ?? 0)} bpm` : "—",
      bv: b.stats.hr ? `${Math.round(b.stats.hr.avg ?? 0)} bpm` : "—",
    },
    {
      label: "Points",
      av: a.stats.pointCount.toLocaleString(),
      bv: b.stats.pointCount.toLocaleString(),
    },
  ];

  return (
    <div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 text-[11px]">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          Compare
        </span>
        <span className="max-w-[6rem] truncate text-right font-medium text-sky-300" title={a.name}>
          {a.name}
        </span>
        <span className="max-w-[6rem] truncate text-right font-medium text-amber-300" title={b.name}>
          {b.name}
        </span>
      </div>
      <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3 border-t border-white/5">
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <div className="py-1.5 text-zinc-400">{r.label}</div>
            <div className="py-1.5 pl-3 text-right font-mono text-zinc-100">{r.av}</div>
            <div className="py-1.5 pl-3 text-right font-mono text-amber-200/90">{r.bv}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
