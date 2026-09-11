import { readFileSync, writeFileSync, renameSync } from "node:fs";
import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase/config";
import { createClient } from "./supabase/server";
import { currentActor } from "./actor";
import { supabaseConfigured, demoEnabled } from "./supabase/config";
import { stopInputSchema } from "./archive";
import { sortStops } from "./geo";
import { mutateStops, type Placement, type StopPatch, type StopMutation } from "./itinerary-mutations";
import {
  FREE_TRIP_LIMIT,
  type ApiKey,
  type ChatRole,
  type Message,
  type Plan,
  type Stop,
  type Trip,
  type TravelMode,
} from "./types";

export type StopInput = {
  name: string;
  lng: number;
  lat: number;
  day: number;
  time?: string | null;
  note?: string | null;
  map_query?: string | null;
  mode?: TravelMode;
  /** 생략하면 해당 day 의 맨 뒤 */
  position?: number;
};

export type TripDetail = { trip: Trip; stops: Stop[]; messages: Message[] };

export type TripSummary = { trip: Trip; stops: Stop[] };

const uid = () => globalThis.crypto.randomUUID();

/* ------------------------------------------------------------------ *
 * 데모 모드 — Supabase 자격증명이 없을 때 쓰는 저장소.
 * 메모리에 들고 있되 변경될 때마다 디스크에 덤프해서, 서버를 재시작해도
 * 만든 여행이 남는다. 진짜 저장·인증·격리는 Supabase 를 붙이면 된다.
 * ponytail: 파일 하나에 통째로 덤프한다. 데모 규모라 충분하고, 여러 인스턴스로
 * 늘어나면 그때 Supabase 로 간다.
 * ------------------------------------------------------------------ */
const DEMO_USER = "demo-user";

export type UsageRow = {
  id: string;
  user_id: string;
  trip_id: string;
  in_tokens: number;
  out_tokens: number;
  usd: number;
  created_at: string;
};

type DemoDb = {
  trips: Trip[];
  stops: Stop[];
  messages: Message[];
  apiKeys: (ApiKey & { token_hash: string })[];
  usage: UsageRow[];
  mutationReceipts?: Record<string, { payload: string; result: unknown }>;
};

function seed(): DemoDb {
  const tripId = "demo-trip";
  const s = (
    name: string,
    lng: number,
    lat: number,
    day: number,
    position: number,
    extra: Partial<Stop> = {},
  ): Stop => ({
    id: uid(),
    trip_id: tripId,
    name,
    lng,
    lat,
    day,
    position,
    time: null,
    note: null,
    map_query: null,
    mode: "ground",
    ...extra,
  });
  return {
    trips: [
      {
        id: tripId,
        user_id: DEMO_USER,
        title: "간사이 3박 4일 (데모)",
        start_date: "2026-04-10",
        created_at: new Date().toISOString(),
      },
    ],
    stops: [
      s("김해공항", 128.9382, 35.1795, 1, 0, { time: "09:00", map_query: "김해국제공항" }),
      s("간사이공항", 135.2328, 34.4342, 1, 1, { mode: "flight", map_query: "関西国際空港" }),
      s("난바", 135.5013, 34.6659, 1, 2, { time: "14:00", map_query: "難波駅", note: "체크인 후 도톤보리" }),
      s("오사카성", 135.5259, 34.6873, 2, 0, { time: "10:00", map_query: "大阪城" }),
      s("우메다 스카이빌딩", 135.4903, 34.7053, 2, 1, { time: "18:00", map_query: "梅田スカイビル" }),
      s("교토역", 135.7581, 34.9858, 3, 0, { time: "09:30", map_query: "京都駅" }),
      s("후시미이나리", 135.7727, 34.9671, 3, 1, { time: "11:00", map_query: "伏見稲荷大社" }),
    ],
    messages: [],
    apiKeys: [],
    usage: [],
  };
}

const DEMO_FILE = process.env.DEMO_DB_PATH ?? ".demo-db.json";

function load(): DemoDb {
  try {
    const raw = readFileSync(/* turbopackIgnore: true */ DEMO_FILE, "utf8");
    const db = JSON.parse(raw) as DemoDb;
    if (Array.isArray(db.trips)) return db;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return seed();
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** Called after every demo-mode mutation; coalesced so a burst writes once. */
export function persistDemo() {
  if (supabaseConfigured || saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      const temporary = `${DEMO_FILE}.${process.pid}.tmp`;
      writeFileSync(temporary, JSON.stringify(g.__airoDemo ?? seed()), { mode: 0o600 });
      renameSync(temporary, DEMO_FILE);
    } catch (error) {
      console.error("데모 저장 실패", error);
    }
  }, 200);
}

const g = globalThis as unknown as { __airoDemo?: DemoDb };
const demo = (): DemoDb => {
  if (!demoEnabled) throw new Error("운영 환경에서는 데모 저장소를 사용할 수 없습니다.");
  const db = (g.__airoDemo ??= load());
  // 데모 저장소는 HMR 을 넘어 globalThis 에 남는다. 필드가 늘어난 뒤 살아남은
  // 예전 객체도 깨지지 않게 여기서 채운다.
  db.apiKeys ??= [];
  db.usage ??= [];
  return db;
};

/* ------------------------------------------------------------------ */

export async function currentUserId(): Promise<string | null> {
  const actor = currentActor();
  if (actor) return actor.userId;
  if (!supabaseConfigured) return demoEnabled ? DEMO_USER : null;
  const supabase = await createClient();
  const { data } = await supabase!.auth.getUser();
  return data.user?.id ?? null;
}

export async function currentPlan(): Promise<Plan> {
  if (!supabaseConfigured) return "free";
  const supabase = await createClient();
  const { data, error } = await supabase!
    .from("subscriptions")
    .select("plan,status")
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.plan === "pro" ? "pro" : "free";
}

export async function listTrips(): Promise<Trip[]> {
  if (!supabaseConfigured) return demo().trips;
  const supabase = await createClient();
  const { data, error } = await supabase!
    .from("trips")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Trip[];
}

/** 목록 화면용 — 여행마다 경로 썸네일을 그려야 해서 지점까지 함께 읽는다. */
export async function listTripSummaries(): Promise<TripSummary[]> {
  const trips = await listTrips();
  if (!trips.length) return [];

  if (!supabaseConfigured) {
    const db = demo();
    return trips.map((trip) => ({
      trip,
      stops: sortStops(db.stops.filter((s) => s.trip_id === trip.id)),
    }));
  }
  const supabase = await createClient();
  const { data, error } = await supabase!
    .from("stops")
    .select("*")
    .in("trip_id", trips.map((t) => t.id))
    .order("day")
    .order("position");
  if (error) throw new Error(error.message);

  const byTrip = new Map<string, Stop[]>();
  for (const stop of (data ?? []) as Stop[]) {
    const list = byTrip.get(stop.trip_id);
    if (list) list.push(stop);
    else byTrip.set(stop.trip_id, [stop]);
  }
  return trips.map((trip) => ({ trip, stops: byTrip.get(trip.id) ?? [] }));
}

export async function createTrip(
  title: string,
  startDate: string | null = null,
  requestId?: string,
): Promise<{ trip: Trip } | { error: string }> {
  if (typeof title !== "string" || !title.trim() || title.length > 120) return { error: "여행 이름을 120자 이내로 입력해 주세요." };
  title = title.trim();
  if (supabaseConfigured) {
    const supabase = (await createClient())!;
    const { data, error } = await supabase.rpc("create_trip_once", { p_title: title, p_start_date: startDate, p_request_id: requestId ?? null });
    if (error) return { error: error.message };
    return data as { trip: Trip };
  }
  const retry = demoReceipt(requestId, { operation: "createTrip", title, startDate });
  if (retry.previous) return retry.previous as { trip: Trip };
  const trips = await listTrips();
  const plan = await currentPlan();
  if (plan === "free" && trips.length >= FREE_TRIP_LIMIT)
    return {
      error: `무료 플랜은 여행 ${FREE_TRIP_LIMIT}개까지 만들 수 있어요. 프로로 올리면 무제한입니다.`,
    };

  const trip: Trip = { id: uid(), user_id: DEMO_USER, title, start_date: startDate, created_at: new Date().toISOString() };
  demo().trips.unshift(trip);
  const result = { trip };
  retry.save(result);
  return result;
}

export async function deleteTrip(tripId: string, expectedTitle?: string) {
  if (!supabaseConfigured) {
    const db = demo();
    if (expectedTitle !== undefined && db.trips.find(t => t.id === tripId)?.title !== expectedTitle) throw new Error("여행 이름이 바뀌었습니다. 다시 확인해 주세요.");
    db.trips = db.trips.filter((t) => t.id !== tripId);
    db.stops = db.stops.filter((s) => s.trip_id !== tripId);
    db.messages = db.messages.filter((m) => m.trip_id !== tripId);
    persistDemo();
    return;
  }
  const supabase = await createClient();
  let query = supabase!.from("trips").delete().eq("id", tripId);
  if (expectedTitle !== undefined) query = query.eq("title", expectedTitle);
  const { data, error } = await query.select("id");
  if (error) throw new Error(error.message);
  if (expectedTitle !== undefined && !data?.length) throw new Error("여행이 삭제되었거나 이름이 바뀌었습니다. 다시 확인해 주세요.");
}

export async function getTrip(tripId: string): Promise<TripDetail | null> {
  if (supabaseConfigured && !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(tripId)) return null;
  if (!supabaseConfigured) {
    const db = demo();
    const trip = db.trips.find((t) => t.id === tripId);
    if (!trip) return null;
    return {
      trip,
      stops: sortStops(db.stops.filter((s) => s.trip_id === tripId)),
      messages: db.messages.filter((m) => m.trip_id === tripId),
    };
  }
  const supabase = await createClient();
  const { data: trip, error: tripError } = await supabase!
    .from("trips")
    .select("*")
    .eq("id", tripId)
    .maybeSingle();
  if (tripError) throw new Error(tripError.message);
  if (!trip) return null;
  const [{ data: stops, error: stopsError }, { data: messages, error: messagesError }] = await Promise.all([
    supabase!
      .from("stops")
      .select("*")
      .eq("trip_id", tripId)
      .order("day")
      .order("position"),
    supabase!
      .from("messages")
      .select("*")
      .eq("trip_id", tripId)
      .order("created_at"),
  ]);
  if (stopsError || messagesError) throw new Error((stopsError ?? messagesError)!.message);
  return {
    trip: trip as Trip,
    stops: (stops ?? []) as Stop[],
    messages: (messages ?? []) as Message[],
  };
}

/** Demo receipts use the same request/payload rule as the transactional RPC. */
function demoReceipt(requestId: string | undefined, payload: unknown) {
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)])) : value;
  const encoded = JSON.stringify(canonical(payload));
  const receipts = demo().mutationReceipts ??= {};
  const key = requestId === undefined ? undefined : `${DEMO_USER}:${requestId}`;
  const existing = key ? receipts[key] : undefined;
  if (existing && existing.payload !== encoded) throw new Error("같은 requestId에 다른 변경을 지정할 수 없습니다.");
  return {
    previous: existing ? structuredClone(existing.result) : undefined,
    save(result: unknown) {
      if (key) receipts[key] = { payload: encoded, result: structuredClone(result) };
      persistDemo();
    },
  };
}

async function mutateItinerary(tripId: string, operation: StopMutation["operation"], payload: Record<string, unknown>, requestId?: string) {
  if (supabaseConfigured) {
    const client = (await createClient())!;
    const { data, error } = await client.rpc("mutate_itinerary", { p_trip: tripId, p_operation: operation, p_payload: payload, p_request_id: requestId ?? null });
    if (error) throw new Error(error.message);
    return data as { stop?: Stop | null; removed?: boolean; order?: string[] };
  }
  const receipt = demoReceipt(requestId, { tripId, operation, input: payload });
  if (receipt.previous) return receipt.previous as { stop?: Stop | null; removed?: boolean; order?: string[] };
  const db = demo();
  if (!db.trips.some(t => t.id === tripId)) throw new Error("여행을 찾을 수 없습니다.");
  let mutation: StopMutation;
  if (operation === "add") mutation = { operation, input: payload as StopPatch, newId: uid() };
  else if (operation === "move") {
    const { stopId, ...input } = payload;
    mutation = { operation, input, stopId: String(stopId) };
  } else if (operation === "remove") mutation = { operation, stopId: String(payload.stopId) };
  else mutation = { operation, day: Number(payload.day), stopIds: payload.stopIds as string[] };
  const { stops, ...result } = mutateStops(db.stops, tripId, mutation);
  db.stops = [...db.stops.filter(s => s.trip_id !== tripId), ...stops];
  receipt.save(result);
  return result;
}

export async function addStop(tripId: string, input: StopInput & Placement, requestId?: string): Promise<Stop> {
  const payload = { ...stopInputSchema.parse(input), ...(input.afterStopId ? { afterStopId: input.afterStopId } : {}), ...(input.beforeStopId ? { beforeStopId: input.beforeStopId } : {}) };
  const result = await mutateItinerary(tripId, "add", payload, requestId);
  if (!result.stop) throw new Error("장소를 저장하지 못했습니다.");
  return result.stop;
}

export async function moveStop(tripId: string, stopId: string, patch: StopPatch, requestId?: string): Promise<Stop | null> {
  const payload = { ...stopInputSchema.partial().parse(patch), ...(patch.afterStopId ? { afterStopId: patch.afterStopId } : {}), ...(patch.beforeStopId ? { beforeStopId: patch.beforeStopId } : {}), stopId };
  return (await mutateItinerary(tripId, "move", payload, requestId)).stop ?? null;
}

export async function removeStop(tripId: string, stopId: string, requestId?: string): Promise<boolean> {
  return (await mutateItinerary(tripId, "remove", { stopId }, requestId)).removed ?? false;
}

/** Omitted places stay at the end, in their existing order. */
export async function reorderDay(tripId: string, day: number, stopIds: string[], requestId?: string) {
  return (await mutateItinerary(tripId, "reorder", { day, stopIds }, requestId)).order ?? [];
}

export async function addMessage(
  tripId: string,
  role: ChatRole,
  content: string,
): Promise<Message> {
  const row = { trip_id: tripId, role, content };
  if (!supabaseConfigured) {
    const message: Message = {
      id: uid(),
      created_at: new Date().toISOString(),
      ...row,
    };
    demo().messages.push(message);
    persistDemo();
    return message;
  }
  const supabase = await createClient();
  const { data, error } = await supabase!
    .from("messages")
    .insert(row)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Message;
}

/* ------------------------------------------------------------------ *
 * API 키 — MCP 등 외부 클라이언트 인증용.
 * 원문은 저장하지 않는다. SHA-256 해시만 두고, 조회용 prefix 는 앞 8자.
 * ------------------------------------------------------------------ */

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

/** 밖으로 내보낼 필드만 명시적으로 고른다 — 새 필드가 생겨도 저절로 새지 않게. */
const publicKey = (k: ApiKey & { token_hash: string }): ApiKey => ({
  id: k.id,
  user_id: k.user_id,
  name: k.name,
  prefix: k.prefix,
  last_used_at: k.last_used_at,
  created_at: k.created_at,
  revoked_at: k.revoked_at,
  scopes: k.scopes ?? ["trips:read", "trips:write"],
  expires_at: k.expires_at ?? null,
});

/** 발급. 원문 토큰은 이 반환값이 유일한 노출 기회다. */
export async function createApiKey(
  name: string,
  options: { readOnly?: boolean; expiresInDays?: number } = {},
): Promise<{ key: ApiKey; token: string } | { error: string }> {
  const token = `airo_${randomBytes(32).toString("base64url")}`;
  const scopes: ApiKey["scopes"] = options.readOnly ? ["trips:read"] : ["trips:read", "trips:write"];
  const expires_at = new Date(Date.now() + (options.expiresInDays ?? 90) * 86_400_000).toISOString();
  const row = { name, token_hash: sha256(token), prefix: token.slice(0, 12), scopes, expires_at };

  if (!supabaseConfigured) {
    const key: ApiKey & { token_hash: string } = {
      id: uid(),
      user_id: DEMO_USER,
      last_used_at: null,
      created_at: new Date().toISOString(),
      revoked_at: null,
      ...row,
    };
    demo().apiKeys.unshift(key);
    persistDemo();
    return { key: publicKey(key), token };
  }
  const userId = await currentUserId();
  if (!userId) return { error: "로그인이 필요합니다." };
  const supabase = await createClient();
  const { data, error } = await supabase!
    .from("api_keys")
    .insert({ ...row, user_id: userId })
    .select("id,user_id,name,prefix,last_used_at,created_at,revoked_at,scopes,expires_at")
    .single();
  if (error) return { error: error.message };
  return { key: data as ApiKey, token };
}

export async function listApiKeys(): Promise<ApiKey[]> {
  if (!supabaseConfigured)
    return demo().apiKeys.map(publicKey);
  const supabase = await createClient();
  const { data, error } = await supabase!
    .from("api_keys")
    .select("id,user_id,name,prefix,last_used_at,created_at,revoked_at,scopes,expires_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ApiKey[];
}

export async function revokeApiKey(id: string) {
  const now = new Date().toISOString();
  if (!supabaseConfigured) {
    const key = demo().apiKeys.find((k) => k.id === id);
    if (key) key.revoked_at = now;
    persistDemo();
    return;
  }
  const supabase = await createClient();
  const { error } = await supabase!.from("api_keys").update({ revoked_at: now }).eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Bearer 토큰 → 소유자 id. 실패하면 null (호출부는 401).
 * 해시 비교는 상수시간으로 한다 — 길이가 다르면 즉시 실패시키고, 같으면
 * timingSafeEqual 로 확인한다.
 */
export async function resolveApiKey(token: string): Promise<{ userId: string; keyId: string; scopes: ApiKey["scopes"] } | null> {
  if (!token) return null;
  const hash = sha256(token);
  const same = (other: string) => {
    const a = Buffer.from(hash, "hex");
    const b = Buffer.from(other, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  };

  if (!supabaseConfigured) {
    for (const key of demo().apiKeys) {
      if (!key.revoked_at && (!key.expires_at || Date.parse(key.expires_at) > Date.now()) && same(key.token_hash)) {
        key.last_used_at = new Date().toISOString();
        persistDemo();
        return { userId: key.user_id, keyId: key.id, scopes: key.scopes ?? ["trips:read", "trips:write"] };
      }
    }
    return null;
  }

  // 세션이 없는 요청이라 RLS 를 통과할 수 없다. 해시 하나만 받아 소유자를
  // 돌려주는 security definer 함수만 호출한다 — service_role 은 쓰지 않는다.
  const anon = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.rpc("resolve_mcp_key", { p_hash: hash });
  if (error) throw new Error("MCP 인증 저장소를 사용할 수 없습니다.");
  if (!Array.isArray(data) || !data.length) return null;
  const row = data[0] as { user_id: string; token_hash: string; key_id: string; scopes: ApiKey["scopes"] };
  return same(row.token_hash) ? { userId: row.user_id, keyId: row.key_id, scopes: row.scopes } : null;
}

export async function resolveApiToken(token: string): Promise<string | null> {
  return (await resolveApiKey(token))?.userId ?? null;
}

/**
 * What one conversation actually cost us. Without this the pricing plan is a
 * guess; with it, "무료 몇 회" becomes a number we can defend.
 * ponytail: demo mode keeps rows in the same file as everything else. With
 * Supabase configured this needs a `usage` table — see the TODO below.
 */
export async function recordUsage(
  tripId: string,
  inTokens: number,
  outTokens: number,
  usd: number,
) {
  const userId = (await currentUserId()) ?? DEMO_USER;
  const row: UsageRow = {
    id: uid(),
    user_id: userId,
    trip_id: tripId,
    in_tokens: inTokens,
    out_tokens: outTokens,
    usd,
    created_at: new Date().toISOString(),
  };
  if (!supabaseConfigured) {
    demo().usage.push(row);
    persistDemo();
    return;
  }
  const client = (await createClient())!;
  const { error } = await client.from("usage").insert(row);
  if (error) throw new Error(error.message);
}

/** Token spend for a user, newest first. Feeds the cost view and any quota. */
export async function listUsage(limit = 200): Promise<UsageRow[]> {
  const userId = (await currentUserId()) ?? DEMO_USER;
  if (!supabaseConfigured)
    return demo()
      .usage.filter((u) => u.user_id === userId)
      .slice(-limit)
      .reverse();
  const client = (await createClient())!;
  const { data, error } = await client.from("usage").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return data as UsageRow[];
}

/** Messages this user has sent today, for the free-tier daily cap. */
export async function messagesToday(): Promise<number> {
  const userId = (await currentUserId()) ?? DEMO_USER;
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  if (!supabaseConfigured)
    return demo().usage.filter(
      (u) => u.user_id === userId && new Date(u.created_at) >= since,
    ).length;
  const client = (await createClient())!;
  const { count, error } = await client.from("usage").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since.toISOString());
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function updateTrip(tripId: string, patch: { title?: string; start_date?: string | null }) {
  if (!supabaseConfigured) {
    const trip = demo().trips.find((t) => t.id === tripId);
    if (!trip) return null;
    Object.assign(trip, patch); persistDemo(); return trip;
  }
  const client = (await createClient())!;
  const { data, error } = await client.from("trips").update(patch).eq("id", tripId).select().maybeSingle();
  if (error) throw new Error(error.message);
  return data as Trip | null;
}
