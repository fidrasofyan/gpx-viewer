/**
 * Geographic + track statistics utilities.
 */

import type { GpxPoint } from "./gpx";

const EARTH_RADIUS_M = 6_371_000;
/** Speed (m/s) below which we treat the track as paused/stopped. ≈ 1.8 km/h. */
const MOVING_SPEED_MS = 0.5;

export interface GeoBounds {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance between two points, in meters. */
export function haversineM(a: Pick<GpxPoint, "lat" | "lon">, b: Pick<GpxPoint, "lat" | "lon">): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(s));
}

/**
 * Great-circle bearing from `a` to `b`, in degrees clockwise from north
 * (0 = north, 90 = east, …).
 */
export function bearingDegrees(
  a: Pick<GpxPoint, "lat" | "lon">,
  b: Pick<GpxPoint, "lat" | "lon">,
): number {
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δλ = toRad(b.lon - a.lon);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Total horizontal distance of a point list, in meters. */
export function totalDistanceM(points: GpxPoint[]): number {
  let d = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a && b) d += haversineM(a, b);
  }
  return d;
}

/** Cumulative distance at each point (index 0 is 0). Same length as input. */
export function cumulativeDistanceM(points: GpxPoint[]): number[] {
  const out = new Array<number>(points.length);
  if (points.length === 0) return out;
  out[0] = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a && b) out[i] = out[i - 1]! + haversineM(a, b);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Elevation
// ---------------------------------------------------------------------------

export interface ElevationStats {
  gainM: number;
  lossM: number;
  minEle: number | null;
  maxEle: number | null;
}

export function elevationStats(points: GpxPoint[]): ElevationStats {
  let gain = 0;
  let loss = 0;
  let minEle: number | null = null;
  let maxEle: number | null = null;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!p) continue;
    const ele = p.ele;
    if (ele === null) continue;
    if (minEle === null || ele < minEle) minEle = ele;
    if (maxEle === null || ele > maxEle) maxEle = ele;
    if (i > 0) {
      const prev = points[i - 1]?.ele;
      if (prev != null) {
        const d = ele - prev;
        if (d > 0) gain += d;
        else loss += -d;
      }
    }
  }

  return { gainM: gain, lossM: loss, minEle, maxEle };
}

// ---------------------------------------------------------------------------
// Time / speed
// ---------------------------------------------------------------------------

export interface TimeStats {
  startTime: number | null;
  endTime: number | null;
  durationMs: number | null;
  movingMs: number | null;
  avgSpeedKmh: number | null;
  movingAvgSpeedKmh: number | null;
  maxSpeedKmh: number | null;
}

function kmh(ms: number): number {
  return ms * 3.6;
}

export function timeStats(points: GpxPoint[]): TimeStats {
  let startTime: number | null = null;
  let endTime: number | null = null;
  let durationMs: number | null = null;
  let movingMs: number | null = null;
  let maxSpeedKmh: number | null = null;

  // First and last point with a timestamp bound the activity window.
  for (const p of points) {
    if (p.time !== null) {
      if (startTime === null || p.time < startTime) startTime = p.time;
      if (endTime === null || p.time > endTime) endTime = p.time;
    }
  }
  if (startTime !== null && endTime !== null) durationMs = endTime - startTime;

  let moving = 0;
  let prev: GpxPoint | null = null;
  for (const p of points) {
    if (prev && p.time !== null && prev.time !== null) {
      const dt = (p.time - prev.time) / 1000; // seconds
      if (dt > 0) {
        const dist = haversineM(prev, p);
        const speed = dist / dt; // m/s
        if (speed > MOVING_SPEED_MS) {
          moving += dt * 1000; // back to ms
          if (maxSpeedKmh === null || kmh(speed) > maxSpeedKmh) maxSpeedKmh = kmh(speed);
        }
      }
    }
    prev = p;
  }
  if (moving > 0) movingMs = moving;

  const dist = totalDistanceM(points);
  const hours = durationMs !== null && durationMs > 0 ? durationMs / 3_600_000 : null;
  const movingHours = movingMs !== null && movingMs > 0 ? movingMs / 3_600_000 : null;
  const distKm = dist / 1000;

  return {
    startTime,
    endTime,
    durationMs,
    movingMs,
    avgSpeedKmh: hours !== null ? distKm / hours : null,
    movingAvgSpeedKmh: movingHours !== null ? distKm / movingHours : null,
    maxSpeedKmh,
  };
}

// ---------------------------------------------------------------------------
// Metrics (HR / cadence / power) & zones
// ---------------------------------------------------------------------------

export interface MetricSummary {
  avg: number | null;
  max: number | null;
  count: number;
}

function metricSummary(points: GpxPoint[], get: (p: GpxPoint) => number | null): MetricSummary | null {
  let sum = 0;
  let max: number | null = null;
  let count = 0;
  for (const p of points) {
    const v = get(p);
    if (v === null || !Number.isFinite(v)) continue;
    sum += v;
    count++;
    if (max === null || v > max) max = v;
  }
  if (count === 0) return null;
  return { avg: sum / count, max, count };
}

export interface HrZone {
  from: number;
  to: number;
  label: string;
  color: string;
}

/** Standard 5-zone heart-rate bands as a fraction of max HR. */
export function hrZones(maxHr: number): HrZone[] {
  const defs: [number, number, string, string][] = [
    [0.5, 0.6, "Z1", "#3b82f6"], // blue
    [0.6, 0.7, "Z2", "#22c55e"], // green
    [0.7, 0.8, "Z3", "#eab308"], // yellow
    [0.8, 0.9, "Z4", "#f97316"], // orange
    [0.9, 1.0, "Z5", "#ef4444"], // red
  ];
  return defs.map(([lo, hi, label, color]) => ({
    from: maxHr * lo,
    to: maxHr * hi,
    label,
    color,
  }));
}

/** Time spent in each HR zone (based on consecutive HR readings). */
export function hrZoneTimes(points: GpxPoint[], maxHr: number): { zone: HrZone; timeMs: number }[] {
  const zones = hrZones(maxHr);
  const times = zones.map(() => 0);
  let prev: GpxPoint | null = null;
  for (const p of points) {
    if (prev && p.time !== null && prev.time !== null && p.hr !== null && prev.hr !== null) {
      const dt = p.time - prev.time;
      if (dt > 0) {
        const mid = (p.hr + prev.hr) / 2;
        const idx = zones.findIndex((z) => mid >= z.from && mid <= z.to);
        if (idx >= 0) times[idx]! += dt;
      }
    }
    prev = p;
  }
  return zones.map((zone, i) => ({ zone, timeMs: times[i]! }));
}

// ---------------------------------------------------------------------------
// Per-point series for charts (speeds, grades)
// ---------------------------------------------------------------------------

/** Per-point speed in km/h (from timestamps); null where unknown. */
export function perPointSpeedKmh(points: GpxPoint[]): (number | null)[] {
  const out = new Array<number | null>(points.length).fill(null);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b || a.time === null || b.time === null) continue;
    const dt = (b.time - a.time) / 1000; // seconds
    if (dt <= 0) continue;
    out[i] = kmh(haversineM(a, b) / dt);
  }
  return out;
}

/** Per-point grade in percent (from elevation); null where unknown. */
export function perPointGrade(points: GpxPoint[]): (number | null)[] {
  const out = new Array<number | null>(points.length).fill(null);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b || a.ele === null || b.ele === null) continue;
    const dist = haversineM(a, b);
    if (dist < 1) continue;
    out[i] = ((b.ele - a.ele) / dist) * 100;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Splits
// ---------------------------------------------------------------------------

export interface Split {
  index: number;
  distFromM: number;
  distToM: number;
  durationMs: number | null;
  gainM: number;
  lossM: number;
  avgSpeedKmh: number | null;
  avgHr: number | null;
  /** Point index range into the input array covering this split. */
  fromIdx: number;
  toIdx: number;
}

/** Split a track into chunks of `splitKm` km (one pass over the points). */
export function computeSplits(points: GpxPoint[], splitKm: number): Split[] {
  if (points.length < 2) return [];
  const splitM = splitKm * 1000;
  const cum = cumulativeDistanceM(points);
  const total = cum[cum.length - 1] ?? 0;
  const n = Math.max(1, Math.ceil(total / splitM));

  const gain = new Array<number>(n).fill(0);
  const loss = new Array<number>(n).fill(0);
  const hrSum = new Array<number>(n).fill(0);
  const hrCount = new Array<number>(n).fill(0);
  const firstTime = new Array<number | null>(n).fill(null);
  const lastTime = new Array<number | null>(n).fill(null);
  const firstIdx = new Array<number>(n).fill(-1);
  const lastIdx = new Array<number>(n).fill(-1);

  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const si = Math.min(n - 1, Math.floor((cum[i] ?? 0) / splitM));
    if (firstIdx[si] === -1) firstIdx[si] = i;
    lastIdx[si] = i;
    if (p.ele !== null && i > 0) {
      const prev = points[i - 1]!;
      const prevSi = Math.min(n - 1, Math.floor((cum[i - 1] ?? 0) / splitM));
      if (prev.ele !== null && prevSi === si) {
        const d = p.ele - prev.ele;
        if (d > 0) gain[si]! += d;
        else loss[si]! += -d;
      }
    }
    if (p.hr !== null) {
      hrSum[si]! += p.hr;
      hrCount[si]!++;
    }
    if (p.time !== null) {
      if (firstTime[si] === null) firstTime[si] = p.time;
      lastTime[si] = p.time;
    }
  }

  const out: Split[] = [];
  for (let s = 0; s < n; s++) {
    const fromM = s * splitM;
    const toM = Math.min(total, (s + 1) * splitM);
    const ft = firstTime[s] ?? null;
    const lt = lastTime[s] ?? null;
    const durationMs = ft !== null && lt !== null ? lt - ft : null;
    const distM = toM - fromM;
    out.push({
      index: s + 1,
      distFromM: fromM,
      distToM: toM,
      durationMs,
      gainM: gain[s]!,
      lossM: loss[s]!,
      avgSpeedKmh:
        durationMs !== null && durationMs > 0 ? distM / 1000 / (durationMs / 3_600_000) : null,
      avgHr: hrCount[s]! > 0 ? hrSum[s]! / hrCount[s]! : null,
      fromIdx: firstIdx[s]!,
      toIdx: lastIdx[s]!,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Track stats
// ---------------------------------------------------------------------------

export interface TrackStats {
  distanceM: number;
  pointCount: number;
  elevation: ElevationStats;
  time: TimeStats;
  hr: MetricSummary | null;
  cad: MetricSummary | null;
  power: MetricSummary | null;
}

export function computeStats(points: GpxPoint[]): TrackStats {
  return {
    distanceM: totalDistanceM(points),
    pointCount: points.length,
    elevation: elevationStats(points),
    time: timeStats(points),
    hr: metricSummary(points, (p) => p.hr),
    cad: metricSummary(points, (p) => p.cad),
    power: metricSummary(points, (p) => p.power),
  };
}

export function boundsOf(points: GpxPoint[]): GeoBounds | null {
  if (points.length === 0) return null;
  let minLat = Infinity;
  let minLon = Infinity;
  let maxLat = -Infinity;
  let maxLon = -Infinity;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }
  return { minLat, minLon, maxLat, maxLon };
}

// ---------------------------------------------------------------------------
// Chart series
// ---------------------------------------------------------------------------

/** One sample of a distance-based series (elevation, speed, HR, …). */
export interface ProfileSample {
  distM: number;
  value: number;
  /** Index into the original point array. */
  idx: number;
}

/**
 * Build a distance-based series from a point list, keeping only points with a
 * valid value. Downsampled (bucketed min/max) to at most `maxSamples` points.
 */
export function buildSeries(
  points: GpxPoint[],
  getValue: (p: GpxPoint, i: number) => number | null,
  maxSamples = 600,
): ProfileSample[] {
  const cum = cumulativeDistanceM(points);
  const raw: ProfileSample[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const v = getValue(p, i);
    if (v === null || !Number.isFinite(v)) continue;
    raw.push({ distM: cum[i]!, value: v, idx: i });
  }
  if (raw.length === 0) return [];

  if (raw.length <= maxSamples) return raw;

  const bucketSize = Math.ceil(raw.length / maxSamples);
  const out: ProfileSample[] = [];
  for (let start = 0; start < raw.length; start += bucketSize) {
    const bucket = raw.slice(start, start + bucketSize);
    const min = bucket.reduce((a, b) => (b.value < a.value ? b : a));
    const max = bucket.reduce((a, b) => (b.value > a.value ? b : a));
    out.push(min);
    if (min !== max) out.push(max);
  }
  return out.sort((a, b) => a.distM - b.distM);
}

export function buildElevationProfile(points: GpxPoint[], maxSamples = 600): ProfileSample[] {
  return buildSeries(points, (p) => p.ele, maxSamples);
}

export function buildSpeedProfile(points: GpxPoint[], maxSamples = 600): ProfileSample[] {
  const speeds = perPointSpeedKmh(points);
  return buildSeries(points, (_p, i) => speeds[i] ?? null, maxSamples);
}

export function buildGradeProfile(points: GpxPoint[], maxSamples = 600): ProfileSample[] {
  const grades = perPointGrade(points);
  return buildSeries(points, (_p, i) => grades[i] ?? null, maxSamples);
}

export function buildHrProfile(points: GpxPoint[], maxSamples = 600): ProfileSample[] {
  return buildSeries(points, (p) => p.hr, maxSamples);
}

export function buildCadenceProfile(points: GpxPoint[], maxSamples = 600): ProfileSample[] {
  return buildSeries(points, (p) => p.cad, maxSamples);
}

export function buildPowerProfile(points: GpxPoint[], maxSamples = 600): ProfileSample[] {
  return buildSeries(points, (p) => p.power, maxSamples);
}

/** Simple moving-average smoothing over a series' value, window `size` (odd). */
export function smoothSeries(samples: ProfileSample[], size = 9): ProfileSample[] {
  if (samples.length <= size || size <= 1) return samples;
  const half = Math.floor(size / 2);
  return samples.map((s, i) => {
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(samples.length - 1, i + half); j++) {
      sum += samples[j]!.value;
      n++;
    }
    return { ...s, value: sum / n };
  });
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

export function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

export function formatElevation(m: number | null): string {
  return m === null ? "—" : `${Math.round(m)} m`;
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const min = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${min.toString().padStart(2, "0")}m`;
  if (min > 0) return `${min}m ${s.toString().padStart(2, "0")}s`;
  return `${s}s`;
}

export function formatSpeed(kmh: number | null): string {
  return kmh === null ? "—" : `${kmh.toFixed(1)} km/h`;
}

/** Pace as min:sec per km (lower is faster). */
export function formatPace(speedKmh: number | null): string {
  if (speedKmh === null || speedKmh <= 0) return "—";
  const minPerKm = 60 / speedKmh;
  const min = Math.floor(minPerKm);
  const sec = Math.round((minPerKm - min) * 60);
  return `${min}:${sec.toString().padStart(2, "0")} /km`;
}
