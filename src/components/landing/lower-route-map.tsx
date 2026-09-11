"use client";

import { useEffect, useMemo } from "react";
import type { StyleSpecification } from "maplibre-gl";
import { Map, MapMarker, MapRoute, MarkerContent, useMap } from "@/components/ui/map";
import { useDestination } from "./destination-context";
import { useLandingMotion } from "./motion-system";
import { placeName } from "@/lib/landing-lower";

function RouteCamera({ day, selected, progress, running, onReady }: { day: number; selected: number | null; progress: number; running: boolean; onReady: () => void }) {
  const { destination } = useDestination();
  const { map, isLoaded } = useMap();
  const { enabled } = useLandingMotion();
  const journey = destination.map.journeys[day];
  useEffect(() => {
    if (isLoaded) onReady();
  }, [isLoaded, onReady]);
  useEffect(() => {
    if (!map || !isLoaded) return;
    const fit = () => {
      const points = journey.coordinates;
      const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
      const desktop = window.innerWidth >= 768;
      const cardSpace = map.getContainer().clientWidth >= 640 ? 285 : 235;
      map.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], {
        padding: { top: 60, bottom: 65, left: 65, right: desktop ? cardSpace : 65 },
        maxZoom: 15.5, duration: enabled ? 600 : 0,
      });
      map.getContainer().dataset.day = String(day + 1);
    };
    fit();
    const resize = new ResizeObserver(fit); resize.observe(map.getContainer());
    return () => resize.disconnect();
  }, [map, isLoaded, journey, day, enabled]);
  useEffect(() => {
    if (!map || !isLoaded) return;
    map.getContainer().dataset.selectedStop = selected === null ? "" : String(selected + 1);
  }, [map, isLoaded, selected]);
  useEffect(() => {
    if (!map) return;
    map.getContainer().dataset.routeProgress = progress.toFixed(3);
    map.getContainer().dataset.routeRunning = String(running);
  }, [map, progress, running]);
  return null;
}

type Coordinate = [number, number];

function routeDistances(coordinates: Coordinate[]) {
  const distances = [0];
  const radians = Math.PI / 180;
  for (let index = 1; index < coordinates.length; index++) {
    const [lonA, latA] = coordinates[index - 1], [lonB, latB] = coordinates[index];
    const dLat = (latB - latA) * radians, dLon = (lonB - lonA) * radians;
    const haversine = Math.sin(dLat / 2) ** 2 + Math.cos(latA * radians) * Math.cos(latB * radians) * Math.sin(dLon / 2) ** 2;
    distances.push(distances[index - 1] + 2 * 6_371_000 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)));
  }
  return distances;
}

/** Only truncate the existing road polyline; never connect the itinerary pins directly. */
function routeFrame(coordinates: Coordinate[], distances: number[], progress: number) {
  if (progress >= 1) return { coordinates, point: coordinates[coordinates.length - 1] };
  if (progress <= 0) return { coordinates: [coordinates[0], coordinates[0]], point: coordinates[0] };
  const target = distances[distances.length - 1] * progress;
  let low = 1, high = distances.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (distances[middle] < target) low = middle + 1;
    else high = middle;
  }
  const start = coordinates[low - 1], end = coordinates[low];
  const length = distances[low] - distances[low - 1];
  const fraction = length > 0 ? (target - distances[low - 1]) / length : 0;
  const point: Coordinate = [start[0] + (end[0] - start[0]) * fraction, start[1] + (end[1] - start[1]) * fraction];
  return { coordinates: [...coordinates.slice(0, low), point], point };
}

export default function LowerRouteMap({ day, selected, onSelect, progress, running, onReady }: { day: number; selected: number | null; onSelect: (stop: number) => void; progress: number; running: boolean; onReady: () => void }) {
  const { destination } = useDestination();
  const journey = destination.map.journeys[day];
  const style = useMemo<StyleSpecification>(() => ({
    version: 8,
    sources: {
      city: { type: "geojson", data: `/maps/${destination.id}-detail.geojson`, attribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>' },
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#202323" } },
      { id: "parks", type: "fill", source: "city", filter: ["==", ["get", "kind"], "park"], paint: { "fill-color": "#272F29" } },
      { id: "water", type: "fill", source: "city", filter: ["==", ["get", "kind"], "water"], paint: { "fill-color": "#29383F" } },
      { id: "rivers", type: "line", source: "city", filter: ["==", ["get", "kind"], "river"], paint: { "line-color": "#29383F", "line-width": ["interpolate", ["exponential", 2], ["zoom"], 10, 1, 16, 28] } },
      { id: "roads", type: "line", source: "city", filter: ["all", ["==", ["geometry-type"], "LineString"], ["!=", ["get", "kind"], "river"]], paint: { "line-color": "#515455", "line-width": ["interpolate", ["exponential", 2], ["zoom"], 10, .4, 16, 3.5] } },
    ],
  }), [destination.id]);
  const coordinates = useMemo(() => journey.coordinates.map(p => [...p] as [number, number]), [journey]);
  const distances = useMemo(() => routeDistances(coordinates), [coordinates]);
  const drawProgress = Math.max(0, Math.min(1, (progress - 0.25) / 0.6));
  const frame = useMemo(() => routeFrame(coordinates, distances, drawProgress), [coordinates, distances, drawProgress]);
  return <Map className="lower-map-canvas" styles={{ dark: style, light: style }} theme="dark" center={[...destination.coordinate]} zoom={12} scrollZoom={false} dragRotate={false} touchPitch={false} cooperativeGestures attributionControl={{ compact: true }}>
    <RouteCamera day={day} selected={selected} progress={progress} running={running} onReady={onReady} />
    <MapRoute id="lower-itinerary" coordinates={frame.coordinates} color="#86A5FF" width={3.5} opacity={drawProgress > 0 ? 1 : 0} interactive={false} />
    {journey.stops.map((stop, index) => <MapMarker key={`${day}-${index}`} longitude={stop.coordinate[0]} latitude={stop.coordinate[1]} anchor="bottom">
      <MarkerContent><button type="button" className="lower-map-pin" data-selected={selected === index} data-revealed={progress >= index * 0.1} data-pop={progress >= index * 0.1 && progress < index * 0.1 + 0.07} onClick={() => onSelect(index)} aria-label={`${index + 1}. ${placeName(stop.name)} 지도에서 선택`} aria-pressed={selected === index}><span>{index + 1}</span><small>{placeName(stop.name)}</small></button></MarkerContent>
    </MapMarker>)}
    {drawProgress > 0 && drawProgress < 1 && <MapMarker longitude={frame.point[0]} latitude={frame.point[1]} anchor="center"><MarkerContent className="lower-route-traveler"><span aria-hidden="true" className="lower-route-travel-dot" /></MarkerContent></MapMarker>}
  </Map>;
}
