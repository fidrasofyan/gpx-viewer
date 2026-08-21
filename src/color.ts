/**
 * Color helpers for elevation- and grade-coloring.
 */

/** Interpolate between two RGB colors given t in [0, 1]. */
function lerpColor(a: [number, number, number], b: [number, number, number], t: number): string {
  const c = a.map((v, i) => Math.round(v + (b[i]! - v) * t)) as [number, number, number];
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

const GREEN: [number, number, number] = [34, 197, 94];
const YELLOW: [number, number, number] = [234, 179, 8];
const RED: [number, number, number] = [239, 68, 68];

/**
 * Terrain elevation scale (green → yellow → red). `t` in [0, 1] maps the
 * track's elevation range onto the scale.
 */
export function elevationColor(t: number): string {
  const clamped = Math.min(1, Math.max(0, t));
  if (clamped < 0.5) return lerpColor(GREEN, YELLOW, clamped * 2);
  return lerpColor(YELLOW, RED, (clamped - 0.5) * 2);
}

/** Elevation → terrain color given a global min/max scale. */
export function elevationColorFor(ele: number, min: number, max: number): string {
  const span = max - min || 1;
  return elevationColor((ele - min) / span);
}

/**
 * Grade color: blue (steep down) → green (flat) → red (steep up).
 * `grade` is a percent slope; clamped to ±20% for a stable scale.
 */
export function gradeColor(grade: number): string {
  const g = Math.min(20, Math.max(-20, grade));
  const t = (g + 20) / 40; // 0 = -20%, 0.5 = flat, 1 = +20%
  if (t < 0.5) return lerpColor([37, 99, 235], [34, 197, 94], t * 2);
  return lerpColor([34, 197, 94], [239, 68, 68], (t - 0.5) * 2);
}

/** CSS linear-gradient string for the elevation legend bar. */
export function elevationGradientCSS(): string {
  return `linear-gradient(to right, ${elevationColor(0)}, ${elevationColor(0.25)}, ${elevationColor(0.5)}, ${elevationColor(0.75)}, ${elevationColor(1)})`;
}
