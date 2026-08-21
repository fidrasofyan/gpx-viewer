/**
 * Elevation profile tab — a ProfileChart wrapper that shows elevation with a
 * min/max envelope band, grade-colored line, and a grade strip underneath.
 */

import { useMemo } from "react";
import type { GpxPoint } from "../gpx";
import {
  buildElevationProfile,
  buildGradeProfile,
  type ProfileSample,
} from "../geo";
import { gradeColor } from "../color";
import { ProfileChart, type OverlaySeries } from "./ProfileChart";

interface Props {
  points: GpxPoint[];
  onHover?: (s: ProfileSample | null) => void;
  onSelect?: (s: ProfileSample) => void;
  /** Extra elevation series to overlay (compare mode). */
  overlays?: OverlaySeries[];
}

export function ElevationProfile({ points, onHover, onSelect, overlays }: Props) {
  const eleSamples = useMemo(() => buildElevationProfile(points), [points]);
  const gradeSamples = useMemo(() => buildGradeProfile(points), [points]);

  // Color each line segment by the grade at its midpoint distance.
  const colorAt = (distM: number): string => {
    let best = gradeSamples[0];
    if (!best) return "#38bdf8";
    for (const s of gradeSamples) {
      if (Math.abs(s.distM - distM) < Math.abs(best.distM - distM)) best = s;
    }
    return gradeColor(best.value);
  };

  return (
    <ProfileChart
      samples={eleSamples}
      band={eleSamples}
      overlays={overlays}
      color="#38bdf8"
      yLabel="elevation"
      formatValue={(v) => `${Math.round(v)} m`}
      segmentColor={(_v, distM) => colorAt(distM)}
      strip={{ samples: gradeSamples, color: gradeColor }}
      onHover={onHover}
      onSelect={onSelect}
      emptyMessage="No elevation data in this track."
    />
  );
}
