/**
 * Leaflet map view: renders tracks (elevation-colored or solid polylines),
 * routes (dashed), waypoints (custom markers), start/finish markers, and a
 * hover/focus point. Auto-fits the view to the data.
 */

import { useEffect, useRef } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GpxPoint } from "../gpx";
import { bearingDegrees } from "../geo";
import { elevationColorFor } from "../color";

export interface MapTrack {
  id: string;
  name: string;
  color: string;
  segments: GpxPoint[][];
}

export interface MapRoute {
  id: string;
  name: string;
  color: string;
  points: GpxPoint[];
}

export interface MapWaypoint {
  id: string;
  lat: number;
  lon: number;
  name: string | null;
}

interface Props {
  tracks: MapTrack[];
  routes: MapRoute[];
  waypoints: MapWaypoint[];
  /** A point to highlight on the map (e.g. from hovering a chart). */
  hoverPoint?: { lat: number; lon: number } | null;
  /** A point to pan to (e.g. from clicking a chart). nonce forces repeats. */
  focusPoint?: { lat: number; lon: number; nonce: number } | null;
  /** A stretch of track to highlight (e.g. from clicking a split row). */
  highlight?: [number, number][] | null;
  /** Global elevation range for coloring tracks (null → solid colors). */
  eleScale?: { min: number; max: number } | null;
}

const OSM_TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Quantize elevation into 24 steps so adjacent runs share a color. */
function quantizedColorFor(ele: number, min: number, max: number): string {
  const span = max - min || 1;
  const t = Math.min(1, Math.max(0, (ele - min) / span));
  return elevationColorFor(Math.round(t * 23) / 23, 0, 1);
}

function waypointIcon(name: string | null): L.DivIcon {
  return L.divIcon({
    className: "gpx-wpt-wrap",
    html: `<div class="gpx-wpt" title="${(name ?? "").replaceAll('"', "&quot;")}"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

/** Direction arrow, rotated to the given bearing (points north by default). */
function directionArrowIcon(bearing: number): L.DivIcon {
  return L.divIcon({
    className: "gpx-dir-wrap",
    html: `<svg width="22" height="22" viewBox="0 0 24 24" style="display:block"><path d="M12 2 L21 21 L12 16 L3 21 Z" fill="#38bdf8" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round" transform="rotate(${bearing} 12 12)"/></svg>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

export function MapView({ tracks, routes, waypoints, hoverPoint, focusPoint, highlight, eleScale }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const hoverMarkerRef = useRef<L.CircleMarker | null>(null);
  const highlightRef = useRef<L.LayerGroup | null>(null);

  // Init the map once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const map = L.map(container, {
      center: [20, 0],
      zoom: 2,
      zoomControl: true,
      attributionControl: true,
    });
    L.tileLayer(OSM_TILES, {
      attribution: OSM_ATTRIBUTION,
      maxZoom: 19,
    }).addTo(map);
    L.control.scale({ metric: true, imperial: false }).addTo(map);

    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      hoverMarkerRef.current = null;
    };
  }, []);

  // Hover marker — kept in its own layer so hovering a chart never triggers
  // a full redraw of the track geometry.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!hoverPoint) {
      if (hoverMarkerRef.current) {
        hoverMarkerRef.current.remove();
        hoverMarkerRef.current = null;
      }
      return;
    }

    const latlng: [number, number] = [hoverPoint.lat, hoverPoint.lon];
    if (hoverMarkerRef.current) {
      hoverMarkerRef.current.setLatLng(latlng);
    } else {
      hoverMarkerRef.current = L.circleMarker(latlng, {
        radius: 8,
        color: "#ffffff",
        weight: 2.5,
        fillColor: "#38bdf8",
        fillOpacity: 1,
      }).addTo(map);
    }
    hoverMarkerRef.current.bringToFront();
  }, [hoverPoint]);

  // Pan to a chart-clicked point.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusPoint) return;
    map.panTo([focusPoint.lat, focusPoint.lon], { animate: true, duration: 0.4 });
  }, [focusPoint]);

  // Split-range highlight — drawn in its own layer so it doesn't disturb the
  // track geometry; zooms the map to the highlighted stretch.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (highlightRef.current) {
      highlightRef.current.remove();
      highlightRef.current = null;
    }
    if (!highlight || highlight.length < 2) return;

    highlightRef.current = L.layerGroup().addTo(map);
    L.polyline(highlight, {
      color: "rgba(0,0,0,0.45)",
      weight: 9,
      opacity: 0.8,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(highlightRef.current);
    L.polyline(highlight, {
      color: "#ffffff",
      weight: 4.5,
      opacity: 0.95,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(highlightRef.current);

    // Direction arrow at the midpoint, rotated to the travel bearing.
    const mid = Math.floor(highlight.length / 2);
    const a = highlight[Math.max(0, mid - 1)]!;
    const b = highlight[Math.min(highlight.length - 1, mid + 1)]!;
    const bearing = bearingDegrees({ lat: a[0], lon: a[1] }, { lat: b[0], lon: b[1] });
    L.marker(highlight[mid]!, {
      icon: directionArrowIcon(bearing),
      interactive: false,
    }).addTo(highlightRef.current);

    map.fitBounds(L.latLngBounds(highlight), { padding: [40, 40], maxZoom: 16 });
  }, [highlight]);

  // Redraw layers whenever the data changes.
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    const allPoints: [number, number][] = [];

    const hasEle = eleScale !== null && eleScale !== undefined;

    for (const track of tracks) {
      for (const seg of track.segments) {
        if (seg.length < 2) continue;
        const latlngs = seg.map((p) => [p.lat, p.lon] as [number, number]);
        allPoints.push(...latlngs);

        if (hasEle && seg.some((p) => p.ele !== null)) {
          // Elevation-colored runs: merge consecutive points sharing a color.
          let run: [number, number][] = [];
          let runColor = "";
          const flush = () => {
            if (run.length >= 2) {
              L.polyline(run, {
                color: runColor,
                weight: 4,
                opacity: 0.9,
                lineCap: "round",
                lineJoin: "round",
              })
                .bindTooltip(track.name, { sticky: true })
                .addTo(layer);
            }
            run = [];
          };
          for (const p of seg) {
            if (p.ele === null) {
              flush();
              continue;
            }
            const c = quantizedColorFor(p.ele, eleScale!.min, eleScale!.max);
            if (run.length > 0 && c !== runColor) flush();
            runColor = c;
            run.push([p.lat, p.lon]);
          }
          flush();
        } else {
          L.polyline(latlngs, {
            color: track.color,
            weight: 4,
            opacity: 0.9,
            lineCap: "round",
            lineJoin: "round",
          })
            .bindTooltip(track.name, { sticky: true })
            .addTo(layer);
        }
      }

      // Start / finish markers for the track.
      const firstSeg = track.segments.find((s) => s.length > 0);
      const lastSeg = [...track.segments].reverse().find((s) => s.length > 0);
      if (firstSeg) {
        const p = firstSeg[0]!;
        allPoints.push([p.lat, p.lon]);
        L.circleMarker([p.lat, p.lon], {
          radius: 6,
          color: "#ffffff",
          weight: 2,
          fillColor: "#16a34a",
          fillOpacity: 1,
        })
          .bindTooltip(`Start — ${track.name}`, { direction: "top", offset: [0, -6] })
          .addTo(layer);
      }
      if (lastSeg) {
        const p = lastSeg[lastSeg.length - 1]!;
        allPoints.push([p.lat, p.lon]);
        L.circleMarker([p.lat, p.lon], {
          radius: 6,
          color: "#ffffff",
          weight: 2,
          fillColor: "#dc2626",
          fillOpacity: 1,
        })
          .bindTooltip(`Finish — ${track.name}`, { direction: "top", offset: [0, -6] })
          .addTo(layer);
      }
    }

    for (const route of routes) {
      if (route.points.length < 2) continue;
      const latlngs = route.points.map((p) => [p.lat, p.lon] as [number, number]);
      allPoints.push(...latlngs);
      L.polyline(latlngs, {
        color: route.color,
        weight: 3,
        opacity: 0.85,
        dashArray: "6 6",
      })
        .bindTooltip(route.name, { sticky: true })
        .addTo(layer);
    }

    for (const wp of waypoints) {
      allPoints.push([wp.lat, wp.lon]);
      L.marker([wp.lat, wp.lon], { icon: waypointIcon(wp.name) })
        .bindTooltip(wp.name ?? "Waypoint", { direction: "top", offset: [0, -8] })
        .addTo(layer);
    }

    if (allPoints.length > 0) {
      map.fitBounds(L.latLngBounds(allPoints), { padding: [28, 28], maxZoom: 16 });
    }

    // The container may have been resized between mount and first draw.
    map.invalidateSize();
  }, [tracks, routes, waypoints, eleScale]);

  return <div ref={containerRef} className="absolute inset-0 z-0" aria-label="Track map" />;
}
