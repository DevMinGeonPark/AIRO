import "server-only";

/**
 * Category search, which a name geocoder cannot do.
 *
 * Photon matches names, so "맥주공장" finds a pub called 맥주광장 in Incheon
 * rather than the seventeen breweries within 40km of Namba. A category has to be
 * asked of OSM by tag, which is what Overpass is for.
 */
export type Category = {
  label: string;
  /** Overpass tag filters, OR'd. Keep them indexable — exact key=value, no regex. */
  filters: string[];
  /** Search radius in metres. Cheap broad tags need a small one. */
  radius?: number;
  /**
   * Applied in JS after the query. Lets us ask Overpass for the cheap broad tag
   * (all restaurants nearby) and narrow to ramen here, because a regex value
   * filter server-side cannot use the tag index and times out.
   */
  refine?: RegExp;
};

/**
 * Korean/English category words → Overpass tag filters (OR'd together).
 * ponytail: a hand-kept list of what a traveller actually asks for. Add a row
 * when a real query misses; do not try to cover all of OSM.
 */
const TABLE: [RegExp, Category][] = [
  [/맥주\s*공장|양조장|브루어리|브루잉|수제\s*맥주|craft\s*beer|brewery/i,
    { label: "양조장", filters: ['["craft"="brewery"]', '["microbrewery"="yes"]'] }],
  [/사케|술도가|청주\s*양조|distillery|사케\s*공장/i,
    { label: "주조장", filters: ['["craft"="distillery"]', '["craft"="brewery"]', '["shop"="alcohol"]'] }],
  [/와이너리|winery/i, { label: "와이너리", filters: ['["craft"="winery"]'] }],
  [/라멘|라면|ramen/i, { label: "라멘", filters: ['["amenity"="restaurant"]', '["amenity"="fast_food"]'], radius: 2500, refine: /ramen|ラーメン|らーめん|拉麺|麺屋|中華そば/i }],
  [/초밥|스시|sushi/i, { label: "초밥", filters: ['["amenity"="restaurant"]'], radius: 2500, refine: /sushi|寿司|すし|鮨/i }],
  [/이자카야|선술집|izakaya/i, { label: "이자카야", filters: ['["amenity"="pub"]', '["amenity"="restaurant"]'], radius: 2000, refine: /izakaya|居酒屋|酒場/i }],
  [/야키토리|꼬치/i, { label: "야키토리", filters: ['["amenity"="restaurant"]', '["amenity"="pub"]'], radius: 2500, refine: /yakitori|焼き?鳥|やきとり/i }],
  [/야키니쿠|고기\s*집|불고기|바베큐|barbecue/i, { label: "고기", filters: ['["amenity"="restaurant"]'], radius: 2500, refine: /barbecue|yakiniku|steak|焼肉|ホルモン/i }],
  [/카페|커피|cafe|coffee/i, { label: "카페", filters: ['["amenity"="cafe"]'], radius: 1500 }],
  [/바$|바텐더|칵테일|위스키|bar\b/i, { label: "바", filters: ['["amenity"="bar"]'], radius: 1500 }],
  [/편의점|convenience/i, { label: "편의점", filters: ['["shop"="convenience"]'], radius: 1200 }],
  [/슈퍼|마트|supermarket/i, { label: "슈퍼", filters: ['["shop"="supermarket"]'], radius: 2000 }],
  [/온천|목욕탕|센토|onsen/i, { label: "온천", filters: ['["amenity"="public_bath"]'], radius: 20000 }],
  [/사우나|sauna/i, { label: "사우나", filters: ['["leisure"="sauna"]', '["amenity"="public_bath"]'] }],
  [/수족관|아쿠아리움|aquarium/i, { label: "수족관", filters: ['["tourism"="aquarium"]'] }],
  [/박물관|미술관|museum/i, { label: "박물관", filters: ['["tourism"="museum"]', '["tourism"="gallery"]'] }],
  [/신사(?!동)|신궁|shrine/i, { label: "신사", filters: ['["religion"="shinto"]'] }],
  [/절$|사찰|사원|temple/i, { label: "사찰", filters: ['["religion"="buddhist"]'] }],
  [/성$|성터|castle/i, { label: "성", filters: ['["historic"="castle"]', '["historic"="castle_wall"]'] }],
  [/공원|park/i, { label: "공원", filters: ['["leisure"="park"]'], radius: 3000 }],
  [/전망대|전망\s*台|viewpoint|타워/i, { label: "전망대", filters: ['["tourism"="viewpoint"]', '["man_made"="tower"]["tourism"="attraction"]'] }],
  [/시장|market/i, { label: "시장", filters: ['["amenity"="marketplace"]'] }],
  [/백화점|department/i, { label: "백화점", filters: ['["shop"="department_store"]'] }],
  [/약국|pharmacy/i, { label: "약국", filters: ['["amenity"="pharmacy"]'], radius: 1500 }],
  [/주차장|parking/i, { label: "주차장", filters: ['["amenity"="parking"]'], radius: 1000 }],
  [/해변|해수욕장|beach/i, { label: "해변", filters: ['["natural"="beach"]'] }],
  [/서점|책방|bookshop/i, { label: "서점", filters: ['["shop"="books"]'] }],
  [/빵집|베이커리|bakery/i, { label: "베이커리", filters: ['["shop"="bakery"]'], radius: 2000 }],
  [/역$|기차역|station/i, { label: "역", filters: ['["railway"="station"]'], radius: 5000 }],
];

export function matchCategory(query: string): Category | null {
  const q = query.trim();
  for (const [re, cat] of TABLE) if (re.test(q)) return cat;
  return null;
}
