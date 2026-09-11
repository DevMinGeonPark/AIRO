/** Geographic coordinates and road geometry from checked-in OpenStreetMap snapshots. */
import { routedJourney } from "./landing-routes";
export type Coordinate = readonly [longitude: number, latitude: number];
export type MapPoint = { x: number; y: number };
export type JourneyStop = { name: string; coordinate: Coordinate; waypoint: number };

const NORTH = Math.log(Math.tan(Math.PI / 4 + 35.065 * Math.PI / 360));
export const MAP_SIZE = { width: 7850, height: 5190 };
export function project([longitude, latitude]: Coordinate): MapPoint {
  return { x: (longitude - 135.65) * 50000, y: (NORTH - Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360))) * 180 / Math.PI * 50000 };
}
export function unproject({ x, y }: MapPoint): Coordinate {
  return [135.65 + x / 50000, (2 * Math.atan(Math.exp(NORTH - y / 50000 * Math.PI / 180)) - Math.PI / 2) * 180 / Math.PI];
}
export function formatCoordinate(coordinate: Coordinate) {
  return `${Math.abs(coordinate[1]).toFixed(5)}° ${coordinate[1] < 0 ? "S" : "N"}  ${Math.abs(coordinate[0]).toFixed(5)}° ${coordinate[0] < 0 ? "W" : "E"}`;
}

export type JourneyInput = { stops: JourneyStop[]; coordinates: Coordinate[] };
const trips: JourneyInput[] = [
  {
    stops: [
      { name: "난젠지", coordinate: [135.7926827, 35.0116224], waypoint: 0 },
      { name: "철학의 길", coordinate: [135.7946821, 35.0215812], waypoint: 6 },
      { name: "은각사", coordinate: [135.7984287, 35.0269122], waypoint: 12 },
    ],
    coordinates: [],
  },
  {
    stops: [
      { name: "니시키 시장", coordinate: [135.7647092, 35.0050295], waypoint: 0 },
      { name: "폰토초 골목", coordinate: [135.7712126, 35.0042456], waypoint: 4 },
      { name: "겐닌지", coordinate: [135.7746022, 35.0001782], waypoint: 10 },
    ],
    coordinates: [],
  },
  {
    stops: [
      { name: "도게츠교", coordinate: [135.6777631, 35.0128677], waypoint: 0 },
      { name: "텐류지", coordinate: [135.6746179, 35.0161665], waypoint: 4 },
      { name: "대나무 숲", coordinate: [135.6730827, 35.0176471], waypoint: 8 },
    ],
    coordinates: [],
  },
];

export function buildJourneys(trips: JourneyInput[], projectPoint = project) { return trips.map(trip => {
  const points = trip.coordinates.map(projectPoint);
  const distances = [0];
  for (let i = 1; i < points.length; i++) distances.push(distances[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  const length = distances.at(-1)!;
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const bounds = { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
  return {
    ...trip, points, length, distances, bounds,
    path: points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(""),
    stops: trip.stops.map(stop => ({ ...stop, point: projectPoint(stop.coordinate), progress: distances[stop.waypoint] / length })),
  };
}); }
export const JOURNEYS = buildJourneys(trips.map((trip, day) => routedJourney("kyoto", day, trip.stops)));

export function pointOnJourney(day: number, progress: number, journeys = JOURNEYS): MapPoint {
  const trip = journeys[day];
  const distance = Math.max(0, Math.min(1, progress)) * trip.length;
  const end = trip.distances.findIndex(d => d >= distance);
  if (end <= 0) return trip.points[0];
  const a = trip.points[end - 1], b = trip.points[end];
  const t = (distance - trip.distances[end - 1]) / (trip.distances[end] - trip.distances[end - 1]);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Quiet city labels, positioned in the same projection as the itineraries. */
export const MAP_LABELS = [
  { name: "교토", en: "KYOTO", coordinate: [135.749, 35.028] as Coordinate, major: true },
  { name: "가모가와", en: "KAMO RIVER", coordinate: [135.773, 35.023] as Coordinate },
  { name: "히가시야마", en: "HIGASHIYAMA", coordinate: [135.815, 35.016] as Coordinate, major: true },
  { name: "기온", en: "GION", coordinate: [135.78, 35.003] as Coordinate },
  { name: "교토교엔", en: "IMPERIAL GARDEN", coordinate: [135.763, 35.031] as Coordinate },
  { name: "아라시야마", en: "ARASHIYAMA", coordinate: [135.667, 35.025] as Coordinate, major: true },
  { name: "가쓰라강", en: "KATSURA RIVER", coordinate: [135.679, 35.01] as Coordinate },
  { name: "교토역", en: "KYOTO STATION", coordinate: [135.758, 34.988] as Coordinate },
].map(label => ({ ...label, point: project(label.coordinate) }));
export const ALL_JOURNEY_BOUNDS = {
  left: Math.min(...JOURNEYS.map(j => j.bounds.left)), right: Math.max(...JOURNEYS.map(j => j.bounds.right)),
  top: Math.min(...JOURNEYS.map(j => j.bounds.top)), bottom: Math.max(...JOURNEYS.map(j => j.bounds.bottom)),
};

/** Shared by the globe arrival and the SVG itinerary for an exact camera handoff. */
export type LandingCamera = MapPoint & { scale: number; ax: number; ay: number };
export function getLandingCamera(day: number, width: number, height: number, story = false, overview = false, journeys = JOURNEYS): LandingCamera {
  const b = overview ? journeyBounds(journeys) : journeys[day].bounds;
  let box = { x: 45, y: 55, w: width - 90, h: height - 100 };
  if (story) {
    if (width > height && width <= 1023 && height <= 500) box = { x: width * .43, y: 105, w: width * .45, h: height - 165 };
    else if (width >= 1024) box = overview ? { x: 150, y: 190, w: width - 300, h: height - 470 } : { x: width * (day === 0 ? .70 : .49), y: 200, w: width * (day === 0 ? .25 : .30), h: height - 350 };
    else if (width >= 768) box = overview ? { x: 65, y: 210, w: width - 130, h: height - 420 } : { x: width * .56, y: 230, w: width * .33, h: height - 510 };
    else box = { x: 48, y: 225, w: width - 116, h: Math.max(90, height - 445) };
  }
  return { x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2, ax: box.x + box.w / 2, ay: box.y + box.h / 2,
    scale: Math.max(.001, Math.min(box.w / (b.right - b.left + (overview ? 160 : 240)), box.h / (b.bottom - b.top + 180), story ? day === 0 ? .44 : .64 : .65)) };
}


function journeyBounds(journeys: typeof JOURNEYS) {
  return { left: Math.min(...journeys.map(j => j.bounds.left)), right: Math.max(...journeys.map(j => j.bounds.right)), top: Math.min(...journeys.map(j => j.bounds.top)), bottom: Math.max(...journeys.map(j => j.bounds.bottom)) };
}

export const KYOTO_MAP = { journeys: JOURNEYS, labels: MAP_LABELS, size: MAP_SIZE, basemap: { x: 0, y: 0, ...MAP_SIZE }, project, unproject, getCamera: getLandingCamera, pointOnJourney };

/** Each city gets its own Mercator origin, shared with its recorded basemap. */
export function createGeography(trips: JourneyInput[], name: string, en: string) {
  // The checked-in basemap origin is derived from landmark coordinates.
  // Routing may snap endpoints or take a detour, but must not move that origin.
  const coordinates = trips.flatMap(trip => trip.stops.map(stop => stop.coordinate));
  const lngs = coordinates.map(p => p[0]), lats = coordinates.map(p => p[1]);
  const west = Math.min(...lngs), east = Math.max(...lngs), south = Math.min(...lats), north = Math.max(...lats);
  const padX = Math.max(.015, (east - west) * .25), padY = Math.max(.012, (north - south) * .25);
  const origin = west - padX, top = Math.log(Math.tan(Math.PI / 4 + (north + padY) * Math.PI / 360));
  const project = ([lng, lat]: Coordinate): MapPoint => ({ x: (lng - origin) * 50000, y: (top - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))) * 180 / Math.PI * 50000 });
  const unproject = ({ x, y }: MapPoint): Coordinate => [origin + x / 50000, (2 * Math.atan(Math.exp(top - y / 50000 * Math.PI / 180)) - Math.PI / 2) * 180 / Math.PI];
  const edge = project([east + padX, south - padY]);
  const journeys = buildJourneys(trips, project);
  const routed = journeyBounds(journeys);
  const x = Math.min(0, routed.left - 100), y = Math.min(0, routed.top - 100);
  const basemap = { x, y, width: Math.max(edge.x, routed.right + 100) - x, height: Math.max(edge.y, routed.bottom + 100) - y };
  const coordinate: Coordinate = [(west + east) / 2, north + padY * .3];
  return { journeys, size: { width: edge.x, height: edge.y }, basemap, project, unproject,
    labels: [{ name, en, coordinate, major: true, point: project(coordinate) }],
    getCamera: (day: number, width: number, height: number, story = false, overview = false) => getLandingCamera(day, width, height, story, overview, journeys),
    pointOnJourney: (day: number, progress: number) => pointOnJourney(day, progress, journeys),
  };
}
