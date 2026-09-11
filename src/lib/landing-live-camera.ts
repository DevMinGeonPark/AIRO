import type { Map } from "maplibre-gl";
import { diningCoordinates, type DiningScenario } from "./landing-dining";

const mercatorY = (latitude: number) => (1 - Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360)) / Math.PI) / 2;

/** Frame all outing choices during the descent, so opening chat never moves the camera. */
export function outingCamera(map: Map, scenario: DiningScenario) {
  const container = map.getContainer(), box = container.getBoundingClientRect();
  const window = container.closest(".hero-map")?.querySelector(".dining-map-window")?.getBoundingClientRect();
  const width = container.clientWidth, height = container.clientHeight;
  const frame = window ? { left: window.left - box.left, right: window.right - box.left, top: window.top - box.top, bottom: window.bottom - box.top } : { left: width * .4, right: width - 30, top: 150, bottom: height - 100 };
  const coordinates = [scenario, ...(scenario.alternatives ?? [])].flatMap(option => {
    const places = Object.values(option.categories).flat();
    return [option.origin.coordinate, option.destination.coordinate, ...places.map(place => place.coordinate), ...[option.route, ...places.map(place => place.route)].flatMap(diningCoordinates)];
  });
  const xs = coordinates.map(point => (point[0] + 180) / 360), ys = coordinates.map(point => mercatorY(point[1]));
  const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
  const pad = frame.bottom - frame.top < 220 ? 26 : 54;
  const world = Math.min(Math.max(16, frame.right - frame.left - pad * 2) / Math.max(1e-7, right - left), Math.max(16, frame.bottom - frame.top - pad * 2) / Math.max(1e-7, bottom - top), 512 * 2 ** 17);
  const x = (left + right) / 2 + (width / 2 - (frame.left + frame.right) / 2) / world;
  const y = (top + bottom) / 2 + (height / 2 - (frame.top + frame.bottom) / 2) / world;
  return { center: [x * 360 - 180, Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI] as [number, number], zoom: Math.log2(world / 512), pitch: 0, bearing: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 } };
}

export function outingRoads(scenario: DiningScenario): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [scenario, ...(scenario.alternatives ?? [])].flatMap(option => [option.route, ...Object.values(option.categories).flat().map(place => place.route)]).map(route => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: diningCoordinates(route).map(point => [...point]) } })) };
}
