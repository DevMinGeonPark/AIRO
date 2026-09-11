import type { LandingDestination } from "./landing-destinations";

const names: Record<string, string> = {
  포로로마노: "포로 로마노", 캄피돌리오광장: "캄피돌리오 광장", 트레비분수: "트레비 분수",
  스페인광장: "스페인 광장", 성베드로광장: "성베드로 광장", 나보나광장: "나보나 광장",
};
export const placeName = (name: string) => names[name] ?? name;
const romePlaces: Record<string, { image: string; description: string }> = {
  콜로세움: { image: "colosseum", description: "로마의 상징, 고대의 숨결을 느껴보세요." },
  포로로마노: { image: "forum", description: "시간이 멈춘 유적 사이를 걸어요." },
  캄피돌리오광장: { image: "capitoline", description: "로마를 내려다보는 광장에서 잠시 쉬어요." },
  판테온: { image: "pantheon", description: "천년의 시간을 품은 곳에서, 로마의 오늘을 만나요." },
  트레비분수: { image: "trevi", description: "언제나 여행자의 마음이 모이는 곳." },
  스페인광장: { image: "spanish-steps", description: "계단에 내려앉은 오후의 빛을 따라." },
  산탄젤로성: { image: "castle", description: "테베레강을 따라 성으로 걸어가요." },
  성베드로광장: { image: "st-peters", description: "긴 회랑과 넓은 광장 사이, 천천히." },
  나보나광장: { image: "navona", description: "분수 곁에서 로마의 일상을 만나요." },
};
export function placeStory(city: LandingDestination, name: string) {
  const place = city.id === "rome" ? romePlaces[name] : undefined;
  return place ? { image: `/travel/rome/${place.image}.jpg`, alt: `로마 ${placeName(name)}의 실제 풍경`, description: place.description }
    : { image: city.editorial.image, alt: city.editorial.imageAlt, description: city.editorial.featureDescription };
}
export const scheduleTimes = ["10:00", "11:30", "13:00"];
export function conversationDay(city: LandingDestination, day: number) {
  if (city.id === "rome" && day === 0) return [
    { name: "판테온", time: "10:00", ...placeStory(city, "판테온") },
    { name: "골목 안 작은 카페", time: "11:00", image: "/travel/rome/cafe.jpg", alt: "로마 안티코 카페 그레코", description: "조용한 골목에서, 커피 한 잔의 여유를." },
    { name: "트레비 분수", time: "12:00", ...placeStory(city, "트레비분수") },
  ];
  const journey = city.map.journeys[city.id === "rome" && day === 1 ? 0 : day];
  return journey.stops.map((stop, i) => ({ name: placeName(stop.name), time: scheduleTimes[i], ...placeStory(city, stop.name) }));
}
