export type TravelMode = "flight" | "ground";

export type Stop = {
  id: string;
  trip_id: string;
  name: string;
  lng: number;
  lat: number;
  /** Day 1 is start_date; day 0 preserves departure-eve plans. */
  day: number;
  /** Order within the day. Gaps are fine; only the sort matters. */
  position: number;
  /** Local start time, e.g. "16:00" */
  time: string | null;
  note: string | null;
  /** Official/local name to hand Google Maps. Falls back to coordinates. */
  map_query: string | null;
  /** How this stop is reached from the previous one. */
  mode: TravelMode;
  source_id?: string | null;
  date?: string | null;
};

export type Trip = {
  id: string;
  user_id: string;
  title: string;
  start_date: string | null;
  created_at: string;
  source_key?: string | null;
};

export type ChatRole = "user" | "assistant";

export type Message = {
  id: string;
  trip_id: string;
  role: ChatRole;
  content: string;
  created_at: string;
};

export type Plan = "free" | "pro";

/** token_hash 는 서버 밖으로 절대 나가지 않는다. */
export type ApiKey = {
  id: string;
  user_id: string;
  name: string;
  prefix: string;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
  scopes: ("trips:read" | "trips:write")[];
  expires_at: string | null;
};

export type McpConnection = {
  client_id: string;
  client_name: string;
  redirect_uri: string;
  permissions: ("trips:read" | "trips:write")[];
  authorized_at: string;
  revoked_at: string | null;
};

/** 무료 티어 제한. 초과하면 새 여행을 만들 수 없다. */
export const FREE_TRIP_LIMIT = 3;

/** 장소 검색 결과 한 건. 외부 지오코더 응답을 정규화한 모양. */
export type Place = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  category: string;
  /** Google only — OSM has no ratings. Null everywhere else. */
  rating?: number | null;
  ratingCount?: number | null;
  openNow?: boolean | null;
  website?: string | null;
};
