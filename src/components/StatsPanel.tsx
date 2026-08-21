/**
 * Stats panel — a grid of computed track statistics.
 */

import type { TrackStats } from "../geo";
import {
  formatDistance,
  formatDuration,
  formatElevation,
  formatSpeed,
} from "../geo";

interface Props {
  stats: TrackStats | null;
}

/** Explicit Intl formatter for timestamps (cached at module level). */
const dateTimeFmt = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(ts: number | null): string | null {
  return ts === null ? null : dateTimeFmt.format(ts);
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-0.5 break-words font-mono text-sm leading-snug text-zinc-100">{value}</div>
      {sub && <div className="text-[10px] text-zinc-500">{sub}</div>}
    </div>
  );
}

export function StatsPanel({ stats }: Props) {
  if (!stats) {
    return (
      <p className="text-sm text-zinc-500">
        Load a GPX file to see its statistics here.
      </p>
    );
  }

  const { distanceM, pointCount, elevation, time, hr, cad, power } = stats;
  const startDate = formatDate(time.startTime);
  const endDate = formatDate(time.endTime);

  return (
    <div className="grid grid-cols-2 gap-2">
      <Stat label="Distance" value={formatDistance(distanceM)} />
      <Stat
        label="Elevation gain"
        value={formatElevation(elevation.gainM)}
        sub="cumulative"
      />
      <Stat
        label="Elevation loss"
        value={formatElevation(elevation.lossM)}
        sub="cumulative"
      />
      <Stat label="Min / max elev" value={`${formatElevation(elevation.minEle)} / ${formatElevation(elevation.maxEle)}`} />
      <Stat label="Duration" value={formatDuration(time.durationMs)} />
      <Stat label="Moving time" value={formatDuration(time.movingMs)} />
      <Stat label="Avg speed" value={formatSpeed(time.avgSpeedKmh)} />
      <Stat label="Moving avg" value={formatSpeed(time.movingAvgSpeedKmh)} />
      <Stat label="Max speed" value={formatSpeed(time.maxSpeedKmh)} />
      {hr && (
        <Stat
          label="Heart rate"
          value={`${hr.avg === null ? "—" : Math.round(hr.avg)} / ${hr.max === null ? "—" : Math.round(hr.max)} bpm`}
          sub="avg / max"
        />
      )}
      {cad && (
        <Stat
          label="Cadence"
          value={`${cad.avg === null ? "—" : Math.round(cad.avg)} rpm`}
          sub="average"
        />
      )}
      {power && (
        <Stat
          label="Power"
          value={`${power.avg === null ? "—" : Math.round(power.avg)} W`}
          sub="average"
        />
      )}
      <Stat label="Points" value={pointCount.toLocaleString()} />
      <Stat label="Start" value={startDate ?? "—"} sub={time.startTime ? "local time" : undefined} />
      <Stat label="End" value={endDate ?? "—"} sub={time.endTime ? "local time" : undefined} />
    </div>
  );
}
