/**
 * Splits table — per-distance segment breakdown (time, pace, gain, avg HR).
 * Hidden entirely when the track has no timestamps.
 */

import { useMemo, useState } from "react";
import type { GpxPoint } from "../gpx";
import {
  computeSplits,
  formatDuration,
  formatPace,
  formatSpeed,
  type TrackStats,
} from "../geo";

interface Props {
  points: GpxPoint[];
  stats: TrackStats | null;
  /** Optional heading (e.g. "Splits — track name" in compare mode). */
  label?: string;
  /** Called when a split row is clicked (null = cleared). */
  onSelectSplit?: (split: { index: number; fromIdx: number; toIdx: number } | null) => void;
  /** Currently highlighted split index (1-based), if any. */
  selectedIndex?: number | null;
}

const OPTIONS = [1, 5, 10] as const;
type SplitOption = (typeof OPTIONS)[number] | "auto";

export function SplitsTable({ points, stats, label, onSelectSplit, selectedIndex }: Props) {
  const [option, setOption] = useState<SplitOption>(1);

  const hasTime = stats?.time.durationMs != null && stats.time.durationMs > 0;

  const splitKm = useMemo(() => {
    if (option !== "auto") return option;
    const avg = stats?.time.avgSpeedKmh;
    if (!avg || avg <= 0) return 1;
    // Roughly one split per ~12 minutes of effort.
    return Math.min(20, Math.max(1, Math.round(avg * 0.2)));
  }, [option, stats]);

  const splits = useMemo(
    () => (hasTime ? computeSplits(points, splitKm) : []),
    [points, splitKm, hasTime],
  );

  if (!hasTime || splits.length === 0) return null;

  const hasHr = stats?.hr != null;

  return (
    <div className="mt-5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          {label ?? "Splits"}
        </span>
        <div className="flex shrink-0 gap-0.5 text-[11px]">
          {([...OPTIONS, "auto"] as SplitOption[]).map((o) => (
            <button
              key={String(o)}
              type="button"
              onClick={() => setOption(o)}
              className={`rounded px-1.5 py-0.5 transition ${
                option === o
                  ? "bg-sky-500/20 text-sky-200"
                  : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
              }`}
            >
              {o === "auto" ? "auto" : `${o}k`}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse font-mono text-[11px] text-zinc-300">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500">
              <th className="py-1 pr-2 font-medium">#</th>
              <th className="py-1 pr-2 font-medium">km</th>
              <th className="py-1 pr-2 text-right font-medium">time</th>
              <th className="py-1 pr-2 text-right font-medium">pace</th>
              <th className="py-1 pr-2 text-right font-medium">avg</th>
              <th className="py-1 pr-2 text-right font-medium">gain</th>
              {hasHr && <th className="py-1 text-right font-medium">avg HR</th>}
            </tr>
          </thead>
          <tbody>
            {splits.map((s) => {
              const active = selectedIndex === s.index;
              return (
                <tr
                  key={s.index}
                  onClick={() =>
                    onSelectSplit?.(
                      active ? null : { index: s.index, fromIdx: s.fromIdx, toIdx: s.toIdx },
                    )
                  }
                  className={`cursor-pointer border-t border-white/5 transition ${
                    active ? "bg-sky-500/15 ring-1 ring-inset ring-sky-500/40" : "hover:bg-white/5"
                  }`}
                >
                  <td className="py-1 pr-2 text-zinc-500">{s.index}</td>
                  <td className="py-1 pr-2 text-zinc-400">
                    {(s.distFromM / 1000).toFixed(0)}–{(s.distToM / 1000).toFixed(1)}
                  </td>
                  <td className="py-1 pr-2 text-right">{formatDuration(s.durationMs)}</td>
                  <td className="py-1 pr-2 text-right">{formatPace(s.avgSpeedKmh)}</td>
                  <td className="py-1 pr-2 text-right text-sky-300/80">{formatSpeed(s.avgSpeedKmh)}</td>
                  <td className="py-1 pr-2 text-right text-emerald-300/80">
                    {Math.round(s.gainM)} m
                  </td>
                  {hasHr && (
                    <td className="py-1 text-right text-rose-300/80">
                      {s.avgHr === null ? "—" : Math.round(s.avgHr)}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
