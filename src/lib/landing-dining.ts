import type { Coordinate } from "./landing-map";
import { decodePolyline } from "./polyline";

export type DiningRoute = { legs: string[]; distanceKm: number; durationSeconds: number };
export type VisitCategory = "restaurant" | "cafe" | "bar" | "dessert";
export const VISIT_CATEGORIES: { id: VisitCategory; label: string; request: string; choiceLabel: string }[] = [
  { id: "restaurant", label: "식당", request: "가는 길에 맛있는 밥집 있어?", choiceLabel: "식당" },
  { id: "cafe", label: "카페", request: "가는 길에 커피 한 잔 할 카페 있어?", choiceLabel: "카페" },
  { id: "bar", label: "술집", request: "근처에 한잔하기 좋은 술집 있어?", choiceLabel: "술집" },
  { id: "dessert", label: "디저트", request: "가는 길에 디저트 먹을 곳도 찾아줘.", choiceLabel: "디저트 가게" },
];
export const visitCategoryInfo = (category: VisitCategory) => VISIT_CATEGORIES.find(item => item.id === category)!;
export type DiningPlace = { name: string; coordinate: Coordinate };
export type DiningRestaurant = DiningPlace & { id: string; originalName: string; cuisine: string; source: string; route: DiningRoute; category?: VisitCategory; tags?: Record<string, string> };
export type DiningScenario = { origin: DiningPlace; destination: DiningPlace; restaurants: DiningRestaurant[]; categories: Record<VisitCategory, DiningRestaurant[]>; route: DiningRoute; alternatives?: DiningScenario[] };
type ScenarioCollection = { cities: Record<string, DiningScenario> };
let pending: Promise<[ScenarioCollection, ScenarioCollection]> | undefined;
async function fetchScenarios(url: string): Promise<ScenarioCollection> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("미리보기를 불러오지 못했어요.");
  return response.json();
}

export async function loadDiningScenario(city: string): Promise<DiningScenario> {
  pending ??= Promise.all([fetchScenarios("/maps/outing-scenarios.json"), fetchScenarios("/maps/target-scenarios.json")]);
  const [data, targets] = await pending.catch(error => { pending = undefined; throw error; });
  const scenario = data.cities[city];
  const alternate = targets.cities[city];
  if (![scenario, alternate].every(value => value && VISIT_CATEGORIES.every(({ id }) => value.categories?.[id]?.length === 3))) { pending = undefined; throw new Error("미리보기를 불러오지 못했어요."); }
  return { ...scenario, alternatives: [alternate] };
}

export function diningCoordinates(route: DiningRoute): Coordinate[] {
  return route.legs.flatMap(decodePolyline).filter((point, index, all) => index === 0 || point[0] !== all[index - 1][0] || point[1] !== all[index - 1][1]);
}

export function routeMinutes(route: Pick<DiningRoute, "durationSeconds">) { return Math.max(1, Math.ceil(route.durationSeconds / 60)); }
export function objectName(name: string) {
  const last = name.charCodeAt(name.length - 1);
  return `${name}${last >= 0xAC00 && last <= 0xD7A3 && (last - 0xAC00) % 28 ? "을" : "를"}`;
}
export function routeDistance(route: Pick<DiningRoute, "distanceKm">) { return route.distanceKm < 1 ? `${Math.round(route.distanceKm * 1000)}m` : `${route.distanceKm.toFixed(1)}km`; }
export function detourLabel(restaurant: DiningRestaurant, direct: DiningRoute) {
  const minutes = Math.max(0, Math.round((restaurant.route.durationSeconds - direct.durationSeconds) / 60));
  return minutes < 1 ? "큰 우회 없이" : `도보 +${minutes}분`;
}
export function cuisineLabel(restaurant: DiningRestaurant) {
  const names: Record<string, string> = { sandwich: "샌드위치", peruvian: "페루 요리", regional: "지역 요리", japanese: "일식", korean: "한식", chinese: "중식", italian: "이탈리안", french: "프랑스 요리", seafood: "해산물", fish: "생선 요리", pizza: "피자", ramen: "라멘", noodle: "면 요리", sushi: "스시", indian: "인도 요리", thai: "태국 요리", mexican: "멕시코 요리", vietnamese: "베트남 요리", steak_house: "스테이크", international: "세계 요리", vegetarian: "채식", tofu: "두부 요리" };
  return restaurant.cuisine.split(";").map(key => names[key]).find(Boolean) ?? "길 위의 식당";
}

export function placeLabel(place: DiningRestaurant, category: VisitCategory) {
  if (category === "restaurant") return cuisineLabel(place);
  if (category === "cafe") return "커피·차";
  if (category === "bar") return "바·펍";
  return place.tags?.amenity === "ice_cream" || /ice_cream/i.test(place.cuisine) ? "아이스크림" : "베이커리·디저트";
}
