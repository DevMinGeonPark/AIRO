import examples from "./landing-destinations.json";
import editorials from "./landing-editorial.json";
import { createGeography, KYOTO_MAP, type Coordinate } from "./landing-map";
import type { RegionId } from "./landing-regions";
import { routedJourney } from "./landing-routes";

const kyotoDays = [
  { image: "day1-philosophers-path", scene: "철학의 길 산책", time: "14:00 · 천천히 걷는 오후", user: "첫날은 교토 골목을 천천히 둘러보고 싶어.", reply: "좋아요. 철학의 길부터 우리 속도로 걸어볼까요?" },
  { image: "day2-cafe", scene: "골목 안 작은 카페", time: "15:00 · 커피 한 잔의 여유", user: "둘째 날은 카페 들르면서 여유롭게 걷고 싶어.", reply: "좋아요. 산책길을 따라 카페를 들르는 일정으로 함께 만들어볼까요?" },
  { image: "day3-arashiyama", scene: "아라시야마 대나무 숲", time: "09:00 · 고요하게 시작하는 아침", user: "마지막 날은 숲길에서 조용히 쉬어가고 싶어.", reply: "좋아요. 아라시야마의 고요한 숲길로 함께 떠나요." },
];

export type LandingDestination = {
  id: string; name: string; en: string; country: string; countryEn: string; title: string; tagline: string; region: RegionId;
  editorial: { image: string; imageAlt: string; description: string[]; featureImage: string; featureImageAlt: string; featureTitle: string; featureDescription: string };
  coordinate: Coordinate; days: typeof kyotoDays; map: typeof KYOTO_MAP;
};

export const DESTINATIONS: LandingDestination[] = [
  { id: "kyoto", name: "교토", en: "KYOTO", country: "일본", countryEn: "JAPAN", region: "asia", title: "느긋하게, 교토", tagline: "나만의 속도로 떠나는 3일", editorial: editorials.kyoto, coordinate: [135.7947, 35.0216], days: kyotoDays, map: KYOTO_MAP },
  ...examples.map(example => {
    const trips = example.stops.map((day, index) => {
      const stops = day.map(([name, lng, lat], waypoint) => ({ name: String(name), coordinate: [Number(lng), Number(lat)] as Coordinate, waypoint }));
      return routedJourney(example.id, index, stops);
    });
    const editorial = editorials[example.id as keyof typeof editorials];
    return { ...example, editorial, region: example.region as RegionId, title: `느긋하게, ${example.name}`, coordinate: trips[0].stops[1].coordinate,
      map: createGeography(trips, example.name, example.en),
      days: trips.map((trip, i) => ({
        image: "", scene: example.scenes[i], time: `${["10:00", "14:00", "09:00"][i]} · ${example.scenes[i]}`,
        user: `${["첫날", "둘째 날", "마지막 날"][i]}은 ${example.name}에서 ‘${example.scenes[i]}’ 코스로 여행하고 싶어.`,
        reply: `좋아요. ${trip.stops.map(stop => stop.name).join(" → ")} 순서로 여유롭게 둘러볼까요?`,
      })),
    };
  }),
];

export const DEFAULT_DESTINATION = DESTINATIONS.find(city => city.id === "rome")!;
