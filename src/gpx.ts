/**
 * GPX parsing — types and a tolerant parser for GPX 1.0 / 1.1 files.
 *
 * Parsing happens fully in the browser (files never leave your machine).
 */

export interface GpxPoint {
  lat: number;
  lon: number;
  /** Elevation in meters, if present. */
  ele: number | null;
  /** Timestamp as epoch milliseconds, if present. */
  time: number | null;
  /** Heart rate in bpm, from gpxtpx/gpxx-style extensions, if present. */
  hr: number | null;
  /** Cadence in rpm/spm, from extensions, if present. */
  cad: number | null;
  /** Power in watts, from extensions, if present. */
  power: number | null;
}

export interface GpxWaypoint extends GpxPoint {
  name: string | null;
  symbol: string | null;
  desc: string | null;
}

export interface GpxSegment {
  points: GpxPoint[];
}

export interface GpxTrack {
  name: string;
  segments: GpxSegment[];
}

export interface GpxRoute {
  name: string;
  points: GpxPoint[];
}

export interface GpxFile {
  /** The original file name. */
  fileName: string;
  /** Name from <metadata><name>, if any. */
  name: string | null;
  tracks: GpxTrack[];
  routes: GpxRoute[];
  waypoints: GpxWaypoint[];
}

export class GpxParseError extends Error {}

function childText(el: Element, name: string): string | null {
  const kids = el.getElementsByTagNameNS("*", name);
  if (kids.length === 0) return null;
  return kids[0]!.textContent?.trim() || null;
}

/** Parse a <trkpt>/<rtept>/<wpt> element. Returns null when lat/lon are missing/invalid. */
function parsePoint(el: Element): GpxPoint | null {
  const lat = Number.parseFloat(el.getAttribute("lat") ?? "");
  const lon = Number.parseFloat(el.getAttribute("lon") ?? "");
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const eleRaw = childText(el, "ele");
  const timeRaw = childText(el, "time");

  const ele = eleRaw === null ? null : Number.parseFloat(eleRaw);
  const time = timeRaw === null ? null : Date.parse(timeRaw);

  return {
    lat,
    lon,
    ele: ele !== null && Number.isFinite(ele) ? ele : null,
    time: time !== null && Number.isFinite(time) ? time : null,
    // Fitness-watch extensions (namespaces vary: gpxtpx, gpxx, gpxdata, …).
    // Grab any descendant element named hr/cad/power regardless of namespace.
    hr: extNumber(el, "hr"),
    cad: extNumber(el, "cad"),
    power: extNumber(el, "power"),
  };
}

/** Parse a numeric extension value from any namespace, or null. */
function extNumber(el: Element, name: string): number | null {
  const kids = el.getElementsByTagNameNS("*", name);
  if (kids.length === 0) return null;
  const v = Number.parseFloat(kids[0]!.textContent ?? "");
  return Number.isFinite(v) ? v : null;
}

/** All direct child elements of `el` with the given local name. */
function directChildren(el: Element, name: string): Element[] {
  const out: Element[] = [];
  for (const child of Array.from(el.children)) {
    if (child.localName === name) out.push(child);
  }
  return out;
}

export function parseGpx(xmlText: string, fileName: string): GpxFile {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  const root = doc.documentElement;

  const rootName = root?.localName?.toLowerCase() ?? "";
  if (rootName === "parsererror" || rootName !== "gpx") {
    throw new GpxParseError(
      rootName === "parsererror" ? "Invalid XML — not a well-formed document" : "Not a GPX file",
    );
  }

  // <metadata><name> (don't pick up the first track name)
  let metadataName: string | null = null;
  const metadata = doc.getElementsByTagNameNS("*", "metadata");
  if (metadata.length > 0) metadataName = childText(metadata[0]!, "name");

  // --- Tracks -------------------------------------------------------------
  const tracks: GpxTrack[] = [];
  const trackEls = Array.from(doc.getElementsByTagNameNS("*", "trk"));
  trackEls.forEach((trk, i) => {
    const name = childText(trk, "name") ?? `Track ${i + 1}`;
    const segments: GpxSegment[] = [];

    const segEls = Array.from(trk.getElementsByTagNameNS("*", "trkseg"));
    if (segEls.length > 0) {
      for (const seg of segEls) {
        const points = Array.from(seg.getElementsByTagNameNS("*", "trkpt"))
          .map(parsePoint)
          .filter((p): p is GpxPoint => p !== null);
        if (points.length >= 2) segments.push({ points });
      }
    } else {
      // Some files put <trkpt> directly under <trk> without <trkseg>.
      const points = Array.from(trk.getElementsByTagNameNS("*", "trkpt"))
        .map(parsePoint)
        .filter((p): p is GpxPoint => p !== null);
      if (points.length >= 2) segments.push({ points });
    }

    if (segments.length > 0) tracks.push({ name, segments });
  });

  // --- Routes -------------------------------------------------------------
  const routes: GpxRoute[] = [];
  const routeEls = Array.from(doc.getElementsByTagNameNS("*", "rte"));
  routeEls.forEach((rte, i) => {
    const name = childText(rte, "name") ?? `Route ${i + 1}`;
    const points = Array.from(rte.getElementsByTagNameNS("*", "rtept"))
      .map(parsePoint)
      .filter((p): p is GpxPoint => p !== null);
    if (points.length >= 2) routes.push({ name, points });
  });

  // --- Waypoints ------------------------------------------------------------
  const waypoints: GpxWaypoint[] = [];
  const wptEls = Array.from(doc.getElementsByTagNameNS("*", "wpt"));
  for (const wpt of wptEls) {
    const p = parsePoint(wpt);
    if (!p) continue;
    waypoints.push({
      ...p,
      name: childText(wpt, "name"),
      symbol: childText(wpt, "sym"),
      desc: childText(wpt, "desc"),
    });
  }

  return { fileName, name: metadataName, tracks, routes, waypoints };
}

/** Flatten all segments of a track into a single point list. */
export function flattenTrack(track: GpxTrack): GpxPoint[] {
  return track.segments.flatMap((s) => s.points);
}

/** Flatten all points of a file (tracks + routes, in order). */
export function flattenFile(file: GpxFile): GpxPoint[] {
  return [
    ...file.tracks.flatMap(flattenTrack),
    ...file.routes.flatMap((r) => r.points),
  ];
}
