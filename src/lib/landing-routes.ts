import snapshots from "./landing-routes.json";
import { decodePolyline } from "./polyline";
import type { JourneyInput, JourneyStop } from "./landing-map";

type Snapshot = { legs: string[]; profile: string; distanceKm: number; durationSeconds: number };
const routes: Record<string, Snapshot[]> = snapshots.cities;

/** The same sampled road geometry drives the line, visit timing and moving dot. */
export function routedJourney(city: string, day: number, stops: JourneyStop[]): JourneyInput {
  const route = routes[city]?.[day];
  if (!route || route.legs.length !== stops.length - 1) throw new Error(`Missing road route: ${city}/${day + 1}`);
  const coordinates: [number, number][] = [];
  const waypoints = [0];
  for (const shape of route.legs) {
    for (const point of decodePolyline(shape)) {
      const previous = coordinates.at(-1);
      if (!previous || previous[0] !== point[0] || previous[1] !== point[1]) coordinates.push(point);
    }
    waypoints.push(coordinates.length - 1);
  }
  return { coordinates, stops: stops.map((stop, index) => ({ ...stop, waypoint: waypoints[index] })) };
}
