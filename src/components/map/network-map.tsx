"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Map,
  NavigationControl,
  ScaleControl,
  Popup,
  LngLatBounds,
  type MapLayerMouseEvent,
  type StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { STATUS_COLORS } from "./status-colors";

// OpenStreetMap's own raster tiles. They need no key and carry no watermark.
//
// This used to point at CARTO's Voyager tiles, which were key-free when they
// were chosen and are not any more — they now return tiles stamped "API KEY
// REQUIRED" across the whole map.
//
// Attribution is a licence condition. MapLibre renders it from the
// `attribution` field below, so do not remove it.
const BASEMAP_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

const RASTER_BASEMAP: StyleSpecification = {
  version: 8,
  sources: {
    basemap: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: BASEMAP_ATTRIBUTION,
    },
  },
  layers: [{ id: "basemap", type: "raster", source: "basemap" }],
};

/**
 * Point NEXT_PUBLIC_MAP_STYLE at a vector style URL — MapTiler, Stadia, a
 * self-hosted tileserver — to swap the basemap without touching this file.
 *
 * Worth doing before this is used in earnest: OSM's tiles are run on donated
 * infrastructure with a usage policy that asks heavy users to go elsewhere,
 * and their cartography is busier than a data overlay really wants. Those
 * providers give a muted "positron"-style basemap on a free tier, which is
 * what a network overlay should sit on.
 */
const MAP_STYLE: string | StyleSpecification = process.env.NEXT_PUBLIC_MAP_STYLE || RASTER_BASEMAP;

type NetworkMapProps = {
  geojson: GeoJSON.FeatureCollection;
  className?: string;
  /** Name of a feature property holding a hex color. When set, lines are
   * colored by that property (data-driven, e.g. risk band) instead of by
   * status. Features missing the property fall back to the primary blue. */
  colorProperty?: string;
  /** Feature properties to list in the hover card, in order. Configured under
   * Settings → General → Map. */
  popupFields?: Array<{ key: string; label: string }>;
};

export function NetworkMap({ geojson, className, colorProperty, popupFields }: NetworkMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const router = useRouter();

  // The hover handler is registered once against the map, so it reads the
  // current fields through a ref rather than closing over the first render's.
  const popupFieldsRef = useRef(popupFields);
  useEffect(() => {
    popupFieldsRef.current = popupFields;
  }, [popupFields]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [-98.5, 39.5],
      zoom: 3,
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new ScaleControl({ maxWidth: 100, unit: "imperial" }), "bottom-right");

    map.on("load", () => {
      map.addSource("network", { type: "geojson", data: geojson });
      map.addLayer({
        id: "network-lines-casing",
        type: "line",
        source: "network",
        paint: { "line-width": 6, "line-color": "#ffffff", "line-opacity": 0.6 },
      });
      map.addLayer({
        id: "network-lines",
        type: "line",
        source: "network",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-width": 3,
          "line-color": colorProperty
            ? ["coalesce", ["get", colorProperty], "#2563eb"]
            : [
                "match",
                ["get", "status"],
                "ACTIVE",
                STATUS_COLORS.ACTIVE,
                "INACTIVE",
                STATUS_COLORS.INACTIVE,
                "ABANDONED",
                STATUS_COLORS.ABANDONED,
                "PLANNED",
                STATUS_COLORS.PLANNED,
                "REMOVED",
                STATUS_COLORS.REMOVED,
                STATUS_COLORS.ACTIVE,
              ],
        },
      });

      const bounds = new LngLatBounds();
      let hasCoords = false;
      for (const feature of geojson.features) {
        if (feature.geometry.type !== "LineString") continue;
        for (const coord of feature.geometry.coordinates) {
          bounds.extend(coord as [number, number]);
          hasCoords = true;
        }
      }
      if (hasCoords) map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 0 });

      const popup = new Popup({ closeButton: false, offset: 10 });

      map.on("mousemove", "network-lines", (e: MapLayerMouseEvent) => {
        map.getCanvas().style.cursor = "pointer";
        const feature = e.features?.[0];
        if (!feature) return;
        const props = feature.properties as Record<string, string | number | null>;

        // Values come from the database, so they are escaped rather than
        // interpolated — a segment named with an angle bracket must not be
        // able to inject markup into the card.
        const rows = (popupFieldsRef.current ?? [])
          .filter((f) => props[f.key] != null && props[f.key] !== "")
          .map((f) => `<div>${escapeHtml(f.label)}: <strong>${escapeHtml(String(props[f.key]))}</strong></div>`)
          .join("");

        popup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font-family:system-ui;font-size:12px;line-height:1.5">` +
              `<strong>${escapeHtml(String(props.assetCode ?? ""))}</strong>` +
              (rows || `<div>${escapeHtml(String(props.label ?? props.status ?? ""))}</div>`) +
              `</div>`
          )
          .addTo(map);
      });
      map.on("mouseleave", "network-lines", () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });
      map.on("click", "network-lines", (e: MapLayerMouseEvent) => {
        const feature = e.features?.[0];
        const id = feature?.properties?.id;
        if (id) router.push(`/assets/${id}`);
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Push new features into the existing map.
   *
   * Filtering the page is a client-side navigation, so this component is
   * re-rendered with new props but never remounted — the effect above does not
   * run again. Without this the map kept whatever it was first given, so the
   * heading could read "26 segments" over a map still drawing all 260.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const source = map.getSource("network");
      if (!source || !("setData" in source)) return;
      (source as { setData: (d: GeoJSON.FeatureCollection) => void }).setData(geojson);

      const bounds = new LngLatBounds();
      let hasCoords = false;
      for (const feature of geojson.features) {
        if (feature.geometry.type !== "LineString") continue;
        for (const coord of feature.geometry.coordinates) {
          bounds.extend(coord as [number, number]);
          hasCoords = true;
        }
      }
      // Re-frame on what is left. Filtering to a handful of segments and
      // leaving the view across the whole network reads as nothing happening.
      if (hasCoords) map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 300 });
    };

    // The first render's data is applied by the load handler; a later change
    // may arrive before or after the style has finished loading.
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [geojson]);

  return <div ref={containerRef} className={className} />;
}

/** Minimal escaping for values rendered into the popup's HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
