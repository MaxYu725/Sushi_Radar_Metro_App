"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
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
  onRequestLocation: () => Promise<MapPosition | null>;
};

type ScreenPoint = { x: number; y: number };
type ProjectedStore = ScreenPoint & { id: number; name: string; selected: boolean };
type ProjectedOverlay = {
  user: ScreenPoint;
  radius: number;
  stores: ProjectedStore[];
  selected: ScreenPoint | null;
  distanceLabel: string;
};

// Keep the style document in the app so loading a third-party style cannot
// prevent the map canvas from starting. Store, location and range overlays are
// rendered as app-owned DOM/SVG above the canvas and do not depend on style
// sources, glyphs or custom MapLibre layers.
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

export function NearbyMap({
  position,
  stores,
  selectedStore,
  selectedDistance,
  radius,
  accent,
  showLabels,
  onSelectStore,
  onRequestLocation,
}: NearbyMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const loadedRef = useRef(false);
  const overlayFrameRef = useRef(0);
  const initialViewRef = useRef({ position, radius });
  const latestOverlayRef = useRef({ position, stores, selectedStore, selectedDistance, radius });
  const [overlay, setOverlay] = useState<ProjectedOverlay | null>(null);
  const [mapError, setMapError] = useState("");
  const [locating, setLocating] = useState(false);

  const refreshOverlay = useCallback(() => {
    if (overlayFrameRef.current) return;
    overlayFrameRef.current = window.requestAnimationFrame(() => {
      overlayFrameRef.current = 0;
      const current = latestOverlayRef.current;
      setOverlay(projectOverlay(mapRef.current, current.position, current.stores, current.selectedStore, current.selectedDistance, current.radius));
    });
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let active = true;
    let timer = 0;
    void import("maplibre-gl").then((maplibregl) => {
      if (!active || !containerRef.current) return;
      const initial = initialViewRef.current;
      const configuredStyle = process.env.NEXT_PUBLIC_MAP_STYLE_URL?.trim();
      let fallbackUsed = !configuredStyle;
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: configuredStyle || DEFAULT_STYLE,
        center: [initial.position.longitude, initial.position.latitude],
        zoom: zoomForRadius(initial.radius),
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

      const initializeMap = () => {
        if (!active) return;
        window.clearTimeout(timer);
        loadedRef.current = true;
        setMapError("");
        map.resize();
        refreshOverlay();
      };

      map.on("style.load", initializeMap);
      map.on("load", initializeMap);
      map.on("move", refreshOverlay);
      map.on("resize", refreshOverlay);
      if (map.isStyleLoaded()) initializeMap();
      map.on("error", () => {
        if (!loadedRef.current && configuredStyle) applyBundledFallback();
      });
      timer = window.setTimeout(() => {
        if (loadedRef.current) return;
        if (configuredStyle) applyBundledFallback();
        else setMapError("地圖暫時未能載入，附近分店列表仍可使用。");
      }, 7_000);
    }).catch(() => setMapError("此瀏覽器未能啟動真實地圖，附近分店列表仍可使用。"));

    return () => {
      active = false;
      window.clearTimeout(timer);
      if (overlayFrameRef.current) window.cancelAnimationFrame(overlayFrameRef.current);
      overlayFrameRef.current = 0;
      loadedRef.current = false;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [refreshOverlay]);

  useEffect(() => {
    latestOverlayRef.current = { position, stores, selectedStore, selectedDistance, radius };
    refreshOverlay();
  }, [position, radius, refreshOverlay, selectedDistance, selectedStore, showLabels, stores]);

  const locateAndRecenter = async () => {
    if (locating) return;
    setLocating(true);
    try {
      const current = await onRequestLocation();
      if (!current) return;
      mapRef.current?.easeTo({
        center: [current.longitude, current.latitude],
        zoom: zoomForRadius(radius),
        duration: 500,
      });
      refreshOverlay();
    } finally {
      setLocating(false);
    }
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
      {overlay ? <>
        <svg className="map-data-overlay" width="100%" height="100%" aria-hidden="true">
          <circle className="map-radius" cx={overlay.user.x} cy={overlay.user.y} r={overlay.radius} fill={accent} stroke={accent} />
          {overlay.selected ? <line className="map-connection" x1={overlay.user.x} y1={overlay.user.y} x2={overlay.selected.x} y2={overlay.selected.y} stroke={accent} /> : null}
        </svg>
        <div className="map-marker-overlay">
          <span className="map-user-marker" style={{ left: overlay.user.x, top: overlay.user.y, "--marker-accent": accent } as CSSProperties} aria-label="目前位置" />
          {overlay.stores.map((store) => <button
            className={`map-store-marker${store.selected ? " selected" : ""}`}
            type="button"
            key={store.id}
            style={{ left: store.x, top: store.y, "--marker-accent": accent } as CSSProperties}
            onClick={() => onSelectStore(store.id)}
            aria-label={`選擇 ${store.name}`}
          ><span />{showLabels ? <small>{store.name}</small> : null}</button>)}
          {overlay.selected ? <span className="map-distance-label" style={{ left: (overlay.user.x + overlay.selected.x) / 2, top: (overlay.user.y + overlay.selected.y) / 2 }}>{overlay.distanceLabel}</span> : null}
        </div>
      </> : null}
      <button className="map-recenter" type="button" onClick={() => void locateAndRecenter()} aria-label="重新定位並返回目前位置" aria-busy={locating}>{locating ? "…" : "⌖"}</button>
      {mapError ? <div className="map-fallback">{mapError}</div> : null}
    </div>
  );
}

function projectOverlay(
  map: MapLibreMap | null,
  position: MapPosition,
  stores: MapStore[],
  selectedStore: MapStore | null,
  selectedDistance: number | null,
  radius: number,
): ProjectedOverlay | null {
  if (!map || !loadedRefReady(map)) return null;
  const user = map.project([position.longitude, position.latitude]);
  const longitudeScale = radius / (111_320 * Math.max(0.15, Math.cos(position.latitude * Math.PI / 180)));
  const radiusEdge = map.project([position.longitude + longitudeScale, position.latitude]);
  const selected = selectedStore?.latitude !== null && selectedStore?.latitude !== undefined
    && selectedStore.longitude !== null && selectedStore.longitude !== undefined
    ? map.project([selectedStore.longitude, selectedStore.latitude])
    : null;
  return {
    user: { x: user.x, y: user.y },
    radius: Math.hypot(radiusEdge.x - user.x, radiusEdge.y - user.y),
    stores: stores.flatMap((store) => {
      if (store.latitude === null || store.longitude === null) return [];
      const point = map.project([store.longitude, store.latitude]);
      return [{ x: point.x, y: point.y, id: store.id, name: store.name, selected: store.id === selectedStore?.id }];
    }),
    selected: selected ? { x: selected.x, y: selected.y } : null,
    distanceLabel: formatDistance(selectedDistance),
  };
}

function loadedRefReady(map: MapLibreMap) {
  return map.loaded() || map.isStyleLoaded();
}

function zoomForRadius(radius: number) {
  return Math.max(10.8, Math.min(16.2, 15.2 - Math.log2(Math.max(200, radius) / 500)));
}

function formatDistance(meters: number | null) {
  if (meters === null) return "—";
  return meters < 1_000 ? `${Math.round(meters)} 米` : `${(meters / 1_000).toFixed(1)} 公里`;
}
