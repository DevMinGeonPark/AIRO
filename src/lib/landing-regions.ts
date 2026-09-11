export const INITIAL_GLOBE_CENTER: [number, number] = [-40, 16];

export const REGIONS = [
  { id: "asia", name: "아시아", center: [105, 25] },
  { id: "europe", name: "유럽", center: [12, 45] },
  { id: "africa", name: "아프리카", center: [20, 0] },
  { id: "north-america", name: "북미", center: [-103, 32] },
  { id: "south-america", name: "남미", center: [-65, -20] },
  { id: "oceania", name: "오세아니아", center: [160, -18] },
] as const;
export type RegionId = typeof REGIONS[number]["id"];
export type GlobeView = RegionId | "world" | "destination";
