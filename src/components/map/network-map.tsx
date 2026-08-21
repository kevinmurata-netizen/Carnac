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

// OpenStreetMap data rendered by CARTO. Their "Voyager" raster style is built
// as a backdrop for data overlays — real streets, water and place names, but
// muted enough that the network lines stay the focus. No API key required.
//
// Attribution is a licence condition for both OSM and CARTO; MapLibre renders
// it automatically from the `attribution` field below, so do not remove it.
const BASEMAP_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors, © <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>';

const RASTER_BASEMAP: StyleSpecification = {
  version: 8,
  sources: {
    basemap: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
        "https://d.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      maxzoom: 20,
      attribution: BASEMAP_ATTRIBUTION,
    },
  },
  layers: [{ id: "basemap", type: "raster", source: "basemap" }],
};

/** Point NEXT_PUBLIC_MAP_STYLE at a vector style URL (MapTiler, Stadia, a
 * self-hosted tileserver) to swap the basemap without touching this file —
 * CARTO's free tiles are fine for development but rate-limited for production. */
const MAP_STYLE: string | StyleSpecification = process.env.NEXT_PUBLIC_MAP_STYLE || RASTER_BASEMAP;

type NetworkMapProps = {
  geojson: GeoJSON.FeatureCollection;
  className?: string;
  /** Name of a feature property holding a hex color. When set, lines are
   * colored by that property (data-driven, e.g. risk band) instead of by
   * status. Features missing the property fall back to the primary blue. */
  colorProperty?: string;
};

export function NetworkMap({ geojson, className, colorProperty }: NetworkMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const router = useRouter();

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
        const { assetCode, status, label } = feature.properties as {
          assetCode: string;
          status: string;
          label?: string;
        };
        popup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font-family:system-ui;font-size:12px"><strong>${assetCode}</strong><br/>${label ?? status}</div>`
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

  return <div ref={containerRef} className={className} />;
}
