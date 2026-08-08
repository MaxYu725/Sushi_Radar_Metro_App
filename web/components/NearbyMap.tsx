"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, GeoJSONSource, MapLayerMouseEvent, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export type MapPosition = { latitude: number; longitude: number };
export type MapStore = {
  id: number;
  name: string;
  latitude: number | null;
  longitude: number | null;
};

type NearbyMapProps = {
  position: MapPosition;
  stores: MapStore[];
  selectedStore: MapStore | null;
  selectedDistance: number | null;
  radius: number;
  accent: string;
  showLabels: boolean;
  onSelectStore: (id: number) => void;
};

// Keep the style document in the app.  The previous remote style JSON could
// time out on mobile networks, which prevented MapLibre's style event from
// firing and consequently hid our own store markers as well.  Raster tiles are
// still supplied by CARTO, but the map and local overlays now initialise even
// when individual background tiles are slow or unavailable.
const DEFAULT_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    "carto-dark": {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      maxzoom: 20,
      attribution: "© OpenStreetMap contributors © CARTO",
    },
  },
  layers: [
    { id: "radar-background", type: "background", paint: { "background-color": "#090b09" } },
    { id: "carto-dark", type: "raster", source: "carto-dark", minzoom: 0, maxzoom: 20 },
  ],
};
const EMPTY_COLLECTION = { type: "FeatureCollection", features: [] } as const;

export function NearbyMap({
  position,
  stores,
  selectedStore,
  selectedDistance,
  radius,
  accent,
  showLabels,
  onSelectStore,
}: NearbyMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const loadedRef = useRef(false);
  const latestRef = useRef({ position, stores, selectedStore, selectedDistance, radius, accent, showLabels, onSelectStore });
  const [mapError, setMapError] = useState("");

  useEffect(() => {
    latestRef.current = { position, stores, selectedStore, selectedDistance, radius, accent, showLabels, onSelectStore };
  }, [accent, onSelectStore, position, radius, selectedDistance, selectedStore, showLabels, stores]);

  const renderData = useCallback(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const current = latestRef.current;
    const validStores = current.stores.filter((store) => store.latitude !== null && store.longitude !== null);
    const storeData = {
      type: "FeatureCollection" as const,
      features: validStores.map((store) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [store.longitude as number, store.latitude as number] },
        properties: { id: store.id, name: store.name },
      })),
    };
    const userData = {
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [current.position.longitude, current.position.latitude] },
      properties: {},
    };
    const radiusData = {
      type: "Feature" as const,
      geometry: { type: "Polygon" as const, coordinates: [radiusRing(current.position, current.radius)] },
      properties: {},
    };
    const selected = current.selectedStore;
    const selectedLatitude = selected?.latitude;
    const selectedLongitude = selected?.longitude;
    const hasSelection = selectedLatitude !== null && selectedLatitude !== undefined && selectedLongitude !== null && selectedLongitude !== undefined;
    const lineData = hasSelection ? {
      type: "Feature" as const,
      geometry: {
        type: "LineString" as const,
        coordinates: [
          [current.position.longitude, current.position.latitude],
          [selectedLongitude as number, selectedLatitude as number],
        ],
      },
      properties: {},
    } : EMPTY_COLLECTION;
    const selectedData = hasSelection ? {
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [selectedLongitude as number, selectedLatitude as number] },
      properties: {},
    } : EMPTY_COLLECTION;
    const distanceData = hasSelection ? {
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [
          (current.position.longitude + (selectedLongitude as number)) / 2,
          (current.position.latitude + (selectedLatitude as number)) / 2,
        ],
      },
      properties: { label: formatDistance(current.selectedDistance) },
    } : EMPTY_COLLECTION;

    setSource(map, "radar-stores", storeData);
    setSource(map, "radar-user", userData);
    setSource(map, "radar-radius", radiusData);
    setSource(map, "radar-line", lineData);
    setSource(map, "radar-selected", selectedData);
    setSource(map, "radar-distance", distanceData);
    map.setPaintProperty("radar-radius-fill", "fill-color", current.accent);
    map.setPaintProperty("radar-radius-line", "line-color", current.accent);
    map.setPaintProperty("radar-connection", "line-color", current.accent);
    map.setPaintProperty("radar-user-halo", "circle-color", current.accent);
    map.setPaintProperty("radar-user", "circle-color", current.accent);
    map.setPaintProperty("radar-selected", "circle-color", current.accent);
    map.setLayoutProperty("radar-store-labels", "visibility", current.showLabels ? "visible" : "none");
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let active = true;
    let timer = 0;
    void import("maplibre-gl").then((maplibregl) => {
      if (!active || !containerRef.current) return;
      const current = latestRef.current;
      const configuredStyle = process.env.NEXT_PUBLIC_MAP_STYLE_URL?.trim();
      let fallbackUsed = !configuredStyle;
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: configuredStyle || DEFAULT_STYLE,
        center: [current.position.longitude, current.position.latitude],
        zoom: zoomForRadius(current.radius),
        pitch: 0,
        bearing: 0,
        attributionControl: {},
        cooperativeGestures: false,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

      const applyBundledFallback = () => {
        if (!active || fallbackUsed || loadedRef.current) return;
        fallbackUsed = true;
        setMapError("外部地圖樣式未能載入，正在切換備用底圖…");
        map.setStyle(DEFAULT_STYLE);
      };

      map.on("style.load", () => {
        if (!active) return;
        window.clearTimeout(timer);
        addRadarLayers(map);
        loadedRef.current = true;
        setMapError("");
        renderData();
      });
      map.on("error", () => {
        if (!loadedRef.current && configuredStyle) applyBundledFallback();
      });
      map.on("click", "radar-stores", (event: MapLayerMouseEvent) => {
        const id = Number(event.features?.[0]?.properties?.id);
        if (Number.isFinite(id)) latestRef.current.onSelectStore(id);
      });
      map.on("mouseenter", "radar-stores", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "radar-stores", () => { map.getCanvas().style.cursor = ""; });
      timer = window.setTimeout(() => {
        if (loadedRef.current) return;
        if (configuredStyle) applyBundledFallback();
        else setMapError("地圖暫時未能載入，附近分店列表仍可使用。");
      }, 7_000);
    }).catch(() => setMapError("此瀏覽器未能啟動真實地圖，附近分店列表仍可使用。"));

    return () => {
      active = false;
      window.clearTimeout(timer);
      loadedRef.current = false;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [renderData]);

  useEffect(() => { renderData(); }, [accent, position, radius, renderData, selectedDistance, selectedStore, showLabels, stores]);

  const recenter = () => {
    mapRef.current?.easeTo({
      center: [position.longitude, position.latitude],
      zoom: zoomForRadius(radius),
      duration: 500,
    });
  };

  return (
    <div
      className="real-map-shell"
      data-no-swipe="true"
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
    >
      <div ref={containerRef} className="real-map" role="application" aria-label="附近壽司郎真實地圖" />
      <button className="map-recenter" type="button" onClick={recenter} aria-label="返回目前位置">⌖</button>
      {mapError ? <div className="map-fallback">{mapError}</div> : null}
    </div>
  );
}

function addRadarLayers(map: MapLibreMap) {
  const addSource = (id: string) => {
    if (!map.getSource(id)) map.addSource(id, { type: "geojson", data: EMPTY_COLLECTION });
  };
  ["radar-radius", "radar-line", "radar-stores", "radar-selected", "radar-user", "radar-distance"].forEach(addSource);

  const addLayer = (layer: Parameters<MapLibreMap["addLayer"]>[0]) => {
    if (!map.getLayer(layer.id)) map.addLayer(layer);
  };
  addLayer({ id: "radar-radius-fill", type: "fill", source: "radar-radius", paint: { "fill-color": "#60a917", "fill-opacity": 0.08 } });
  addLayer({ id: "radar-radius-line", type: "line", source: "radar-radius", paint: { "line-color": "#60a917", "line-opacity": 0.5, "line-width": 1.5 } });
  addLayer({ id: "radar-connection", type: "line", source: "radar-line", paint: { "line-color": "#60a917", "line-opacity": 0.9, "line-width": 4 } });
  addLayer({ id: "radar-store-halo", type: "circle", source: "radar-stores", paint: { "circle-radius": 8, "circle-color": "#000000", "circle-opacity": 0.86 } });
  addLayer({ id: "radar-stores", type: "circle", source: "radar-stores", paint: { "circle-radius": 5, "circle-color": "#ffffff" } });
  addLayer({ id: "radar-store-labels", type: "symbol", source: "radar-stores", layout: { "text-field": ["get", "name"], "text-size": 11, "text-anchor": "left", "text-offset": [1, 0], "text-allow-overlap": false }, paint: { "text-color": "#f5f5f5", "text-halo-color": "#050505", "text-halo-width": 1.5 } });
  addLayer({ id: "radar-selected-halo", type: "circle", source: "radar-selected", paint: { "circle-radius": 18, "circle-color": "#000000", "circle-opacity": 0.72 } });
  addLayer({ id: "radar-selected", type: "circle", source: "radar-selected", paint: { "circle-radius": 10, "circle-color": "#60a917", "circle-stroke-color": "#050505", "circle-stroke-width": 4 } });
  addLayer({ id: "radar-user-halo", type: "circle", source: "radar-user", paint: { "circle-radius": 17, "circle-color": "#60a917", "circle-opacity": 0.24 } });
  addLayer({ id: "radar-user", type: "circle", source: "radar-user", paint: { "circle-radius": 7, "circle-color": "#60a917", "circle-stroke-color": "#050505", "circle-stroke-width": 3 } });
  addLayer({ id: "radar-distance-label", type: "symbol", source: "radar-distance", layout: { "text-field": ["get", "label"], "text-size": 12, "text-allow-overlap": true }, paint: { "text-color": "#ffffff", "text-halo-color": "#050505", "text-halo-width": 2 } });
}

function setSource(map: MapLibreMap, id: string, data: object) {
  (map.getSource(id) as GeoJSONSource | undefined)?.setData(data as Parameters<GeoJSONSource["setData"]>[0]);
}

function radiusRing(position: MapPosition, radius: number): number[][] {
  const latitudeScale = radius / 111_320;
  const longitudeScale = latitudeScale / Math.max(0.15, Math.cos(position.latitude * Math.PI / 180));
  return Array.from({ length: 65 }, (_, index) => {
    const angle = index / 64 * Math.PI * 2;
    return [
      position.longitude + Math.cos(angle) * longitudeScale,
      position.latitude + Math.sin(angle) * latitudeScale,
    ];
  });
}

function zoomForRadius(radius: number) {
  return Math.max(10.8, Math.min(16.2, 15.2 - Math.log2(Math.max(200, radius) / 500)));
}

function formatDistance(meters: number | null) {
  if (meters === null) return "—";
  return meters < 1_000 ? `${Math.round(meters)} 米` : `${(meters / 1_000).toFixed(1)} 公里`;
}
