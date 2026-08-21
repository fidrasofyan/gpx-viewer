/**
 * ChartTabs — the bottom panel with metric tabs (Elevation | Speed | Heart
 * rate | Cadence | Power). Only tabs with data are shown. Every chart shares
 * hover/click sync with the map via the onHover/onSelect callbacks.
 */

import { useMemo, useState } from "react";
import type { GpxPoint } from "../gpx";
import {
  buildCadenceProfile,
  buildElevationProfile,
  buildHrProfile,
  buildPowerProfile,
  buildSpeedProfile,
  formatDuration,
  hrZoneTimes,
  hrZones,
  type ProfileSample,
  type TrackStats,
} from "../geo";
import { ProfileChart, type OverlaySeries } from "./ProfileChart";
import { ElevationProfile } from "./ElevationProfile";

type Tab = "elev" | "speed" | "hr" | "cad" | "power";

const TABS: { key: Tab; label: string }[] = [
  { key: "elev", label: "Elevation" },
  { key: "speed", label: "Speed" },
  { key: "hr", label: "Heart rate" },
  { key: "cad", label: "Cadence" },
  { key: "power", label: "Power" },
];

interface Props {
  points: GpxPoint[];
  stats: TrackStats | null;
  /** Extra elevation series to overlay (compare mode). */
  overlays?: OverlaySeries[];
  onHover?: (s: ProfileSample | null) => void;
  onSelect?: (s: ProfileSample) => void;
}

function tabCls(active: boolean): string {
  return `shrink-0 rounded-full px-3 py-1 text-xs transition ${
    active
      ? "bg-sky-500/20 text-sky-200 ring-1 ring-sky-500/40"
      : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
  }`;
}

export function ChartTabs({ points, stats, overlays, onHover, onSelect }: Props) {
  const [tab, setTab] = useState<Tab>("elev");
  const [maxHrOverride, setMaxHrOverride] = useState<number | null>(null);

  const eleSamples = useMemo(() => buildElevationProfile(points), [points]);
  const speedSamples = useMemo(() => buildSpeedProfile(points), [points]);
  const hrSamples = useMemo(() => buildHrProfile(points), [points]);
  const cadSamples = useMemo(() => buildCadenceProfile(points), [points]);
  const powerSamples = useMemo(() => buildPowerProfile(points), [points]);

  const available: Tab[] = useMemo(() => {
    const t: Tab[] = ["elev"];
    if (speedSamples.length > 0) t.push("speed");
    if (hrSamples.length > 0) t.push("hr");
    if (cadSamples.length > 0) t.push("cad");
    if (powerSamples.length > 0) t.push("power");
    return t;
  }, [speedSamples, hrSamples, cadSamples, powerSamples]);

  const active: Tab = available.includes(tab) ? tab : "elev";

  const maxHr = maxHrOverride ?? stats?.hr?.max ?? 180;
  const zones = useMemo(() => hrZones(maxHr), [maxHr]);
  const zoneTimes = useMemo(
    () => (active === "hr" && stats?.hr ? hrZoneTimes(points, maxHr) : []),
    [active, stats, points, maxHr],
  );

  const chartProps = { onHover, onSelect };

  return (
    <div>
      <div className="no-scrollbar -mx-3 mb-2 flex items-center gap-1 overflow-x-auto px-3">
        {TABS.filter((t) => available.includes(t.key)).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={tabCls(t.key === active)}
          >
            {t.label}
          </button>
        ))}
        {active === "hr" && (
          <label className="ml-auto flex shrink-0 items-center gap-1.5 text-[11px] text-zinc-500">
            max HR
            <input
              type="number"
              min={60}
              max={240}
              value={maxHrOverride ?? ""}
              placeholder={String(Math.round(stats?.hr?.max ?? 180))}
              onChange={(e) =>
                setMaxHrOverride(e.target.value === "" ? null : Number(e.target.value))
              }
              className="w-16 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[11px] text-zinc-200 outline-none focus:border-sky-500/50"
            />
            <span className="hidden text-zinc-600 sm:inline">bpm · blank = file max</span>
          </label>
        )}
      </div>

      <div className="relative">
        {active === "elev" && (
          <ElevationProfile points={points} overlays={overlays} {...chartProps} />
        )}
        {active === "speed" && (
          <ProfileChart
            samples={speedSamples}
            color="#10b981"
            yLabel="speed"
            formatValue={(v) => `${v.toFixed(1)} km/h`}
            emptyMessage="No time data — the speed chart needs timestamps."
            {...chartProps}
          />
        )}
        {active === "hr" && (
          <>
            <ProfileChart
              samples={hrSamples}
              color="#f43f5e"
              yLabel="heart rate"
              formatValue={(v) => `${Math.round(v)} bpm`}
              zoneBands={zones}
              emptyMessage="No heart-rate data in this file."
              {...chartProps}
            />
            {zoneTimes.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {zoneTimes.map(({ zone, timeMs }) => (
                  <span
                    key={zone.label}
                    className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-zinc-300"
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: zone.color }} />
                    {zone.label}
                    <span className="font-mono text-zinc-400">{formatDuration(timeMs)}</span>
                  </span>
                ))}
              </div>
            )}
          </>
        )}
        {active === "cad" && (
          <ProfileChart
            samples={cadSamples}
            color="#a855f7"
            yLabel="cadence"
            formatValue={(v) => `${Math.round(v)} rpm`}
            emptyMessage="No cadence data in this file."
            {...chartProps}
          />
        )}
        {active === "power" && (
          <ProfileChart
            samples={powerSamples}
            color="#f97316"
            yLabel="power"
            formatValue={(v) => `${Math.round(v)} W`}
            emptyMessage="No power data in this file."
            {...chartProps}
          />
        )}
      </div>
    </div>
  );
}
