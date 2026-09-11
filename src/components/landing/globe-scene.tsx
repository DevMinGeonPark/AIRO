"use client";

import { useEffect, useRef, useState } from "react";
import { Map, MapMarker, MarkerContent, useMap } from "@/components/ui/map";
import type { GeoJSONSource, StyleSpecification, Map as MapLibreMap } from "maplibre-gl";
import { CityPreviewCard } from "./city-preview-card";
import type { Coordinate } from "@/lib/landing-map";
import { DESTINATIONS } from "@/lib/landing-destinations";
import { INITIAL_GLOBE_CENTER, REGIONS } from "@/lib/landing-regions";
import { useDestination } from "./destination-context";
import { useLiveJourneyMap } from "./live-journey-map";
import { loadDiningScenario } from "@/lib/landing-dining";
import { outingCamera, outingRoads } from "@/lib/landing-live-camera";
import { useLandingMotion } from "./motion-system";

const grid: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [
  ...Array.from({ length: 12 }, (_, i) => ({ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: Array.from({ length: 85 }, (_, j) => [-180 + i * 30, -84 + j * 2]) } })),
  ...[-60, -30, 0, 30, 60].map(lat => ({ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: Array.from({ length: 181 }, (_, j) => [-180 + j * 2, lat]) } })),
] };

// A self-hosted globe with Mapcn's MapLibre projection; no keys or tile requests.
const style: StyleSpecification = {
  version: 8,
  projection: { type: "globe" },
  sky: { "sky-color": "#0A0A0A", "horizon-color": "#34383C", "fog-color": "#0A0A0A", "sky-horizon-blend": .03, "horizon-fog-blend": 0, "fog-ground-blend": 0, "atmosphere-blend": .04 },
  sources: {
    earth: { type: "geojson", data: "/maps/world-land.geojson", attribution: '<a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noreferrer">Natural Earth</a>' },
    grid: { type: "geojson", data: grid },
    destination: { type: "geojson", data: { type: "FeatureCollection", features: [] }, attribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>' },
  },
  layers: [
    { id: "ocean", type: "background", paint: { "background-color": "#111418" } },
    { id: "land", type: "fill", source: "earth", paint: { "fill-color": ["interpolate", ["linear"], ["zoom"], 0, "#25282C", 5, "#202226", 10, "#0E0E0E"], "fill-outline-color": "#393E44" } },
    { id: "graticule", type: "line", source: "grid", maxzoom: 5, paint: { "line-color": "#7D858E", "line-opacity": .08, "line-width": .65 } },
    { id: "park", type: "fill", source: "destination", minzoom: 9, filter: ["all", ["==", ["geometry-type"], "Polygon"], ["==", ["get", "kind"], "park"]], paint: { "fill-color": "#171D19" } },
    { id: "water", type: "fill", source: "destination", minzoom: 9, filter: ["all", ["==", ["geometry-type"], "Polygon"], ["==", ["get", "kind"], "water"]], paint: { "fill-color": "#2C353C" } },
    { id: "river", type: "line", source: "destination", minzoom: 9, filter: ["==", ["get", "kind"], "river"], paint: { "line-color": "#2C353C", "line-width": ["interpolate", ["exponential", 2], ["zoom"], 10, .8, 16, 26] } },
    { id: "roads", type: "line", source: "destination", minzoom: 10, filter: ["all", ["==", ["geometry-type"], "LineString"], ["!=", ["get", "kind"], "river"]], paint: { "line-color": "#343434", "line-width": ["interpolate", ["exponential", 2], ["zoom"], 10, .3, 16, 3] } },
  ],
};
const styles = { light: style, dark: style };
const projection = { type: "globe" as const };
const cameraEase = (progress: number) => progress * progress * (3 - 2 * progress);

export type FlightTelemetry = { progress: number; coordinate: Coordinate };
type Props = { landed: boolean; flying: boolean; running: boolean; onStart: () => void; onArrive: () => void; onReady: () => void; onTelemetry: (value: FlightTelemetry) => void };

function globeArea(map: MapLibreMap) {
  const container = map.getContainer(), width = container.clientWidth, height = container.clientHeight;
  const landscape = width > height && width <= 1023 && height <= 500;
  const compact = width < 768 || landscape;
  if (landscape) return { compact, landscape, left: width * .4, right: width - 20, top: 78, bottom: height - 24 };
  const origin = container.getBoundingClientRect(), root = container.closest(".globe-arrival");
  const picker = root?.querySelector(".destination-picker")?.getBoundingClientRect();
  const regions = root?.querySelector(".globe-regions")?.getBoundingClientRect();
  if (!compact) return { compact, landscape, left: width * .42, right: width - 24, top: (picker ? picker.bottom - origin.top : 210) + 4, bottom: (regions ? regions.top - origin.top : height - 150) - 4 };
  return { compact, landscape, left: picker ? picker.left - origin.left : 20, right: picker ? picker.right - origin.left : width - 20, top: (picker ? picker.bottom - origin.top : height * .35) + 12, bottom: (regions ? regions.top - origin.top : height - 140) - 10 };
}

function GlobeCamera({ landed, flying, running, onArrive, onReady, onTelemetry }: Props) {
  const { map, isLoaded } = useMap();
  const { enabled } = useLandingMotion();
  const readyMap = useRef<typeof map>(null);
  const { setMap } = useLiveJourneyMap();
  const landedRef = useRef(landed);
  useEffect(() => { landedRef.current = landed; }, [landed]);
  useEffect(() => {
    if (!map) return;
    setMap(map);
    const record = () => {
      const center = map.getCenter();
      map.getContainer().dataset.camera = JSON.stringify({ center: [center.lng, center.lat], zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() });
    };
    record(); map.on("move", record);
    return () => { map.off("move", record); setMap(null); };
  }, [map, setMap]);
  const { destination, globeTarget, globeView, lastInteraction, spotlightDestination } = useDestination();
  const interaction = useRef(false);
  const resumeAt = useRef(0);
  const recent = useRef([destination.id]);
  const callbacks = useRef({ onArrive, onReady, onTelemetry });
  useEffect(() => { callbacks.current = { onArrive, onReady, onTelemetry }; }, [onArrive, onReady, onTelemetry]);
  useEffect(() => {
    if (!map || !isLoaded) return;
    const canvas = map.getCanvas();
    canvas.setAttribute("aria-label", "회전하는 지구본. 여행지 핀이나 여행지 선택 메뉴에서 여행을 둘러보세요.");
    canvas.tabIndex = -1;
    const hold = () => { interaction.current = true; };
    const release = () => { interaction.current = false; resumeAt.current = performance.now() + 8000; };
    map.on("dragstart", hold); map.on("dragend", release);
    return () => { map.off("dragstart", hold); map.off("dragend", release); };
  }, [map, isLoaded]);
  useEffect(() => {
    if (!map || !isLoaded || flying) return;
    const frameGlobe = (selection = true) => {
      const container = map.getContainer();
      const width = container.clientWidth, height = container.clientHeight;
      // A queued resize may run while the scroll scene removes its globe layer.
      // Framing a detached or zero-size map would produce an infinite zoom.
      if (!container.isConnected || width <= 0 || height <= 0) return;
      const area = globeArea(map);
      const diameter = area.compact ? Math.min(area.right - area.left, area.bottom - area.top) : Math.min(height * .92, width * .62);
      if (!Number.isFinite(diameter) || diameter <= 0) return;
      map.stop();
      const region = REGIONS.find(region => region.id === globeView);
      const center = globeView === "destination" ? globeTarget.coordinate : region?.center ?? INITIAL_GLOBE_CENTER;
      const current = map.getCenter();
      const longitude = ((center[0] - current.lng + 540) % 360 + 360) % 360 - 180;
      const angle = Math.hypot(longitude * Math.cos((center[1] + current.lat) * Math.PI / 360), center[1] - current.lat);
      // Hover pauses idle rotation, but must not turn a requested move into a jump.
      const duration = selection && readyMap.current === map && enabled ? Math.min(2200, 1200 + angle * 5) : 0;
      map.getContainer().dataset.view = globeView;
      map.easeTo({ center: [center[0], center[1]], zoom: Math.log2(diameter * Math.PI / 512), pitch: 0, bearing: 0,
        padding: area.compact ? { top: area.top, bottom: height - area.bottom, left: area.left, right: width - area.right } : { top: 0, bottom: 0, left: width * .35, right: 0 }, duration, easing: cameraEase });
    };
    frameGlobe();
    // Reveal only a rendered globe at its final initial size and position.
    // Later continent/city selections can still animate the camera.
    const reveal = () => { readyMap.current = map; callbacks.current.onReady(); };
    if (readyMap.current !== map) {
      map.once("render", reveal);
      map.triggerRepaint();
    }
    let width = map.getContainer().clientWidth, height = map.getContainer().clientHeight;
    const observer = new ResizeObserver(() => {
      const box = map.getContainer();
      if (!box.isConnected || box.clientWidth <= 0 || box.clientHeight <= 0) return;
      if (width === box.clientWidth && height === box.clientHeight) return;
      width = box.clientWidth; height = box.clientHeight; map.resize(); frameGlobe(false);
    });
    observer.observe(map.getContainer());
    return () => { observer.disconnect(); map.off("render", reveal); };
    // Running controls idle rotation; toggling it must not reframe the selected city.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, isLoaded, flying, globeTarget, globeView]);
  useEffect(() => {
    if (!map || !isLoaded || flying || !running) return;
    let frame = 0, previous = 0;
    const rotate = (now: number) => {
      const elapsed = previous ? Math.min(now - previous, 64) : 0;
      previous = now;
      if (!interaction.current && performance.now() >= resumeAt.current && !map.isMoving() && !map.getContainer().closest(".globe-arrival")?.querySelector("details[open]")) {
        const center = map.getCenter();
        map.jumpTo({ center: [center.lng - elapsed * .003, center.lat] });
      }
      frame = requestAnimationFrame(rotate);
    };
    frame = requestAnimationFrame(rotate);
    return () => cancelAnimationFrame(frame);
  }, [map, isLoaded, flying, running]);
  // Keep the selected card in the same render as its fractional-position marker.
  // Only the more expensive collision pass is throttled. Retain existing label
  // sides and give new labels extra clearance to avoid flickering at boundaries.
  useEffect(() => {
    if (!map || !isLoaded || flying) return;
    let previous = 0, trailing: number | undefined;
    const container = map.getContainer();
    const cities = DESTINATIONS.filter(city => city.id !== destination.id).map(city => ({
      city,
      button: container.querySelector<HTMLElement>(`[data-city-id="${city.id}"]`),
      name: container.querySelector<HTMLElement>(`[data-city-id="${city.id}"] .globe-city-name`),
    }));
    const labelCities = () => {
      const now = performance.now();
      const bounds = globeArea(map);
      const center = map.getCenter().wrap(), radians = Math.PI / 180;
      container.dataset.center = `${center.lng.toFixed(5)},${center.lat.toFixed(5)}`;
      const facing = (coordinate: Coordinate) => {
        const [lng, lat] = coordinate;
        return Math.sin(lat * radians) * Math.sin(center.lat * radians) + Math.cos(lat * radians) * Math.cos(center.lat * radians) * Math.cos((lng - center.lng) * radians);
      };
      const boxes: { left: number; right: number; top: number; bottom: number }[] = [];
      const selected = map.project([...destination.coordinate]);
      const label = container.querySelector<HTMLElement>(".globe-pin-label");
      const selectedButton = container.querySelector<HTMLElement>(".globe-destination");
      const selectedVisible = facing(destination.coordinate) > (selectedButton?.dataset.facing === "true" ? .015 : .05);
      if (selectedButton) selectedButton.dataset.facing = String(selectedVisible);
      if (label) {
        const labelWidth = label.offsetWidth, labelHeight = label.offsetHeight;
        const left = Math.max(bounds.left, Math.min(selected.x - labelWidth - 26, bounds.right - labelWidth));
        const top = Math.max(bounds.top + 8, Math.min(selected.y - (destination.editorial ? 8 : labelHeight * .5), bounds.bottom - labelHeight - 8));
        label.style.setProperty("--globe-label-x", `${left - selected.x}px`);
        label.style.setProperty("--globe-label-y", `${top - selected.y}px`);
        if (selectedVisible) {
          boxes.push({ left, right: left + labelWidth, top, bottom: top + labelHeight });
          boxes.push({ left: selected.x - 24, right: selected.x + 24, top: selected.y - 24, bottom: selected.y + 24 });
        }
      }
      if (now - previous < 120) {
        if (trailing === undefined) trailing = window.setTimeout(() => { trailing = undefined; labelCities(); }, 121 - (now - previous));
        return;
      }
      clearTimeout(trailing); trailing = undefined; previous = now;
      let count = 0;
      const ordered = [...cities].sort((a, b) =>
        Number(b.button?.matches(":hover, :focus-within")) - Number(a.button?.matches(":hover, :focus-within")) ||
        Number(b.city.region === globeView) - Number(a.city.region === globeView) ||
        Number(b.button?.dataset.labelVisible === "true") - Number(a.button?.dataset.labelVisible === "true"));
      for (const { city, button, name } of ordered) {
        if (!button || !name) continue;
        const point = map.project([...city.coordinate]), nameWidth = name.offsetWidth, nameHeight = name.offsetHeight;
        const wasVisible = button.dataset.labelVisible === "true";
        const clearance = wasVisible ? 0 : 5;
        const sides = button.dataset.labelSide === "left" ? ["left", "right"] : ["right", "left"];
        let visible = false;
        for (const side of sides) {
          const left = side === "right" ? point.x + 16 : point.x - 16 - nameWidth;
          const box = { left, right: left + nameWidth, top: point.y - nameHeight / 2, bottom: point.y + nameHeight / 2 };
          const inCanvas = box.left > bounds.left + clearance && box.right < bounds.right - clearance && box.top > bounds.top + clearance && box.bottom < bounds.bottom - clearance;
          if (facing(city.coordinate) > (wasVisible ? .12 : .18) && inCanvas && !boxes.some(other => box.left < other.right + 8 + clearance && box.right > other.left - 8 - clearance && box.top < other.bottom + 7 + clearance && box.bottom > other.top - 7 - clearance)) {
            button.dataset.labelSide = side; boxes.push(box); visible = true; count++; break;
          }
        }
        button.dataset.labelVisible = String(visible);
        button.dataset.facing = String(facing(city.coordinate) > .05);
      }
      container.dataset.visibleLabels = String(count);
    };
    map.on("render", labelCities);
    const timer = window.setTimeout(labelCities, 0);
    return () => { map.off("render", labelCities); clearTimeout(timer); clearTimeout(trailing); };
  }, [map, isLoaded, flying, destination, globeView]);
  // Spotlight one visible city every five seconds, without moving the camera.
  // Manual choices get twelve seconds; hover, drag, search and reduced motion
  // suspend discovery. Resuming never catches up on missed selections.
  useEffect(() => {
    if (!map || !isLoaded || flying || !running) return;
    let nextAt = performance.now() + Math.max(5000, 12000 - (Date.now() - lastInteraction));
    const discover = () => {
      const now = performance.now(), container = map.getContainer();
      const searching = container.closest(".globe-arrival")?.querySelector("details[open]") || document.querySelector(".mobile-destination-dialog[open]");
      if (interaction.current || map.isMoving() || searching || now < resumeAt.current) { nextAt = Math.max(nextAt, now + 5000); return; }
      if (now < nextAt) return;
      nextAt = now + 5000;
      const eligible = DESTINATIONS.filter(city => city.id !== destination.id &&
        (!REGIONS.some(region => region.id === globeView) || city.region === globeView) &&
        container.querySelector(`[data-city-id="${city.id}"]`)?.getAttribute("data-label-visible") === "true");
      const fresh = eligible.filter(city => !recent.current.includes(city.id));
      const pool = fresh.length ? fresh : eligible;
      if (!pool.length) return;
      const next = pool[Math.floor(Math.random() * pool.length)];
      recent.current = [...recent.current.slice(-4), next.id];
      container.dataset.spotlight = next.id;
      spotlightDestination(next.id);
    };
    const timer = window.setInterval(discover, 250);
    return () => clearInterval(timer);
  }, [map, isLoaded, flying, running, destination.id, globeView, lastInteraction, spotlightDestination]);
  useEffect(() => {
    if (!map || !flying) return;
    let cancelled = false, finished = false, timeout: number | undefined;
    let resizeObserver: ResizeObserver | undefined;
    const finish = () => {
      if (cancelled || finished) return;
      finished = true;
      const camera = map.getContainer().dataset.camera;
      if (camera) map.getContainer().dataset.arrivalCamera = camera;
      callbacks.current.onArrive();
    };
    let started = 0, duration = 0, last = 0;
    const update = () => {
      const now = performance.now();
      if (now - last < 80) return;
      last = now;
      const center = map.getCenter().wrap(), progress = duration ? Math.min(1, (now - started) / duration) : 1;
      map.getContainer().dataset.flightProgress = progress.toFixed(3);
      callbacks.current.onTelemetry({ progress, coordinate: [center.lng, center.lat] });
    };
    const prepare = async () => {
      try {
        const scenario = await loadDiningScenario(destination.id);
        if (cancelled) return;
        map.stop(); map.dragPan.disable();
        (map.getSource("destination") as GeoJSONSource | undefined)?.setData(`/maps/${destination.id}-detail.geojson`);
        const roads = outingRoads(scenario);
        if (!map.getSource("outing-roads")) {
          map.addSource("outing-roads", { type: "geojson", data: roads });
          map.addLayer({ id: "outing-roads", type: "line", source: "outing-roads", minzoom: 10, paint: { "line-color": "#343434", "line-width": 3 }, layout: { "line-cap": "round", "line-join": "round" } });
        } else (map.getSource("outing-roads") as GeoJSONSource).setData(roads);
        const camera = outingCamera(map, scenario), origin = map.getCenter();
        duration = enabled && !landedRef.current ? Math.min(4600, 3000 + Math.abs(camera.center[0] - origin.lng) * 7) : 0;
        started = performance.now();
        map.on("move", update); map.once("moveend", finish);
        map.once("render", callbacks.current.onReady);
        if (duration) map.flyTo({ ...camera, duration, curve: 1.25, easing: cameraEase, essential: false });
        else { map.jumpTo(camera); finish(); }
        timeout = window.setTimeout(finish, duration + 700);
        let width = map.getContainer().clientWidth, height = map.getContainer().clientHeight;
        resizeObserver = new ResizeObserver(() => {
          const container = map.getContainer();
          if (!finished || !container.isConnected || !container.clientWidth || !container.clientHeight || (width === container.clientWidth && height === container.clientHeight)) return;
          width = container.clientWidth; height = container.clientHeight;
          map.resize(); map.jumpTo(outingCamera(map, scenario));
        });
        resizeObserver.observe(map.getContainer());
      } catch {
        if (!cancelled) finish();
      }
    };
    const begin = () => { void prepare(); };
    if (map.getSource("destination")) begin();
    else map.once("style.load", begin);
    return () => {
      cancelled = true; clearTimeout(timeout); resizeObserver?.disconnect();
      map.off("style.load", begin); map.off("move", update); map.off("moveend", finish);
      map.off("render", callbacks.current.onReady); map.stop();
    };
    // A departure runs once; tab visibility and arrival UI must not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, flying, destination]);

  return null;
}

export default function GlobeScene(props: Props) {
  const { destination, selectDestination, globeView } = useDestination();
  const [hovered, setHovered] = useState(false);
  const hoverRelease = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hold = () => { clearTimeout(hoverRelease.current); setHovered(true); };
  const release = () => {
    clearTimeout(hoverRelease.current);
    hoverRelease.current = setTimeout(() => setHovered(false), 180);
  };
  useEffect(() => () => clearTimeout(hoverRelease.current), []);
  const width = window.innerWidth, height = window.innerHeight;
  const diameter = width < 768 ? width * .98 : Math.min(height * .92, width * .62);
  return <Map className="globe-mapcn" theme="dark" styles={styles} projection={projection}
    center={globeView === "destination" ? [...destination.coordinate] : INITIAL_GLOBE_CENTER} zoom={Math.log2(diameter * Math.PI / 512)}
    pixelRatio={Math.min(window.devicePixelRatio, 1.5)}
    cooperativeGestures
    locale={{ "CooperativeGesturesHandler.MobileHelpText": "두 손가락으로 지구본을 움직여 보세요" }}
    scrollZoom={false} doubleClickZoom={false} dragRotate={false} touchZoomRotate={false} keyboard={false}
    attributionControl={false} minZoom={-.75} maxZoom={17} maxPitch={0} canvasContextAttributes={{ antialias: true }}>
    <GlobeCamera {...props} running={props.running && (!hovered || props.flying)} />
    {DESTINATIONS.map(city => {
      const selected = city.id === destination.id;
      return <MapMarker key={city.id} longitude={city.coordinate[0]} latitude={city.coordinate[1]} anchor="center" subpixelPositioning opacityWhenCovered={0} onMouseEnter={hold} onMouseLeave={release}>
        <MarkerContent><button className={selected ? "globe-destination" : "globe-city-dot"} type="button" title={`${city.name} · ${city.country}`} data-city-id={city.id} data-region={city.region} data-active-region={city.region === globeView}
          tabIndex={selected ? 0 : -1}
          aria-label={selected ? `${city.countryEn} ${city.name} 여기서 시작하기 — 여행 미리보기` : `${city.name} 지구본 핀 선택`}
          onClick={() => selected ? props.onStart() : selectDestination(city.id)} onFocus={hold} onBlur={release} disabled={props.flying}>
          {selected ? <><span className="globe-pin"><i /><i /></span><CityPreviewCard city={city} /></> : <><span className="globe-city-light" /><span className="globe-city-name" aria-hidden="true">{city.name}</span></>}
        </button></MarkerContent>
      </MapMarker>;
    })}
  </Map>;
}
