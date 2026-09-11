// 데모 모드(Supabase 미설정) 기준 엔드투엔드 점검.
// 사용법: npm run dev 를 3002 로 띄운 뒤  node scripts/smoke.mjs
import assert from "node:assert/strict";

const BASE = process.env.BASE ?? "http://localhost:3002";
const json = async (path, init) => {
  const res = await fetch(BASE + path, init);
  return { res, body: await res.json().catch(() => null) };
};
const post = (path, data) =>
  json(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });

const chat = async (tripId, message) => {
  const res = await fetch(BASE + "/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tripId, message }),
  });
  assert.equal(res.status, 200, "chat 200");
  const text = await res.text();
  const events = text.trim().split("\n").map((l) => JSON.parse(l));
  assert.ok(events.at(-1).type === "done", "스트림이 done 으로 끝나야 한다");
  return events;
};

const created = [];
let keyId = null;
try {
  // 1. 여행 생성
  const { res, body } = await post("/api/trips", { title: "스모크 여행" });
  assert.equal(res.status, 201, "여행 생성 201");
  created.push(body.trip.id);
  const tripId = body.trip.id;

  // 2. 채팅이 실제로 지점을 추가한다
  const before = (await json(`/api/trips/${tripId}`)).body.stops.length;
  const events = await chat(tripId, "도톤보리 핀 찍어줘");
  assert.ok(events.some((e) => e.type === "changed"), "도구 실행 이벤트가 있어야 한다");
  const after = (await json(`/api/trips/${tripId}`)).body;
  assert.equal(after.stops.length, before + 1, "지점이 하나 늘어야 한다");
  assert.equal(after.messages.length, 2, "사용자/어시스턴트 메시지가 저장돼야 한다");

  // 3. 채팅이 지점을 삭제한다
  await chat(tripId, "방금 거 삭제해줘");
  const afterDelete = (await json(`/api/trips/${tripId}`)).body;
  assert.equal(afterDelete.stops.length, before, "지점이 다시 줄어야 한다");

  // 4. 무료 티어 제한 (기본 데모 여행 1개 + 여기서 만든 것)
  const limit = 3;
  let count = (await json("/api/trips")).body.trips.length;
  while (count < limit) {
    const r = await post("/api/trips", { title: `채우기 ${count}` });
    assert.equal(r.res.status, 201);
    created.push(r.body.trip.id);
    count++;
  }
  const over = await post("/api/trips", { title: "한도 초과" });
  assert.equal(over.res.status, 400, "무료 한도를 넘으면 400");
  assert.match(over.body.error, /무료 플랜/);

  // 5. 장소 검색 → 결과에서 골라 담기
  const search = await post("/api/places/search", {
    query: "ラーメン",
    bbox: [135.0, 34.3, 135.9, 35.1],
    near: { lat: 34.66, lng: 135.5 },
    limit: 5,
  });
  assert.equal(search.res.status, 200, "검색 200");
  assert.ok(Array.isArray(search.body.places), "places 는 배열");
  assert.ok(search.body.places.length > 0, `검색 결과가 있어야 한다 (${search.body.reason ?? ""})`);
  const place = search.body.places[0];
  for (const f of ["id", "name", "address", "lat", "lng", "category"])
    assert.ok(f in place, `정규화 필드 ${f}`);
  assert.ok(
    place.lng > 135 && place.lng < 136 && place.lat > 34 && place.lat < 35.2,
    "bbox 안의 결과여야 한다",
  );

  const stopsBefore = (await json(`/api/trips/${tripId}`)).body.stops.length;
  const added = await post(`/api/trips/${tripId}`, {
    name: place.name,
    lng: place.lng,
    lat: place.lat,
    day: 1,
  });
  assert.equal(added.res.status, 201, "지점 추가 201");
  assert.equal(
    (await json(`/api/trips/${tripId}`)).body.stops.length,
    stopsBefore + 1,
    "검색 결과가 일정에 담겨야 한다",
  );

  // 6. MCP — 토큰 발급 후 실제 JSON-RPC 호출
  const keyRes = await post("/api/keys", { name: "smoke" });
  assert.equal(keyRes.res.status, 201, "키 발급 201");
  const token = keyRes.body.token;
  assert.match(token, /^airo_/, "토큰 접두사");
  assert.ok(!("token_hash" in keyRes.body.key), "해시는 응답에 없어야 한다");
  keyId = keyRes.body.key.id;

  const rpc = async (method, params, bearer = token, id = 1) => {
    const res = await fetch(BASE + "/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };

  const init = await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "smoke", version: "0" },
  });
  assert.equal(init.status, 200, "initialize 200");
  assert.equal(init.body.result.protocolVersion, "2025-06-18");
  assert.ok(init.body.result.serverInfo.name, "serverInfo");

  const list = await rpc("tools/list");
  const names = list.body.result.tools.map((t) => t.name).sort();
  assert.deepEqual(
    names,
    ["addStop", "createTrip", "getTrip", "listTrips", "moveStop", "removeStop", "reorderDay", "searchPlaces"].sort(),
    "8개 도구가 노출돼야 한다",
  );

  const listTrips = await rpc("tools/call", { name: "listTrips", arguments: {} });
  const trips = JSON.parse(listTrips.body.result.content[0].text).trips;
  assert.ok(trips.some((t) => t.id === tripId), "MCP listTrips 에 내 여행이 보여야 한다");

  const mcpBefore = (await json(`/api/trips/${tripId}`)).body.stops.length;
  const mcpAdd = await rpc("tools/call", {
    name: "addStop",
    arguments: { tripId, name: "MCP 테스트 지점", lng: 135.5, lat: 34.67, day: 1 },
  });
  assert.ok(!mcpAdd.body.result.isError, "MCP addStop 성공");
  assert.equal(
    (await json(`/api/trips/${tripId}`)).body.stops.length,
    mcpBefore + 1,
    "MCP 로 추가한 지점이 저장돼야 한다",
  );

  // 7. 잘못된 토큰은 401
  assert.equal((await rpc("tools/list", {}, "airo_nope")).status, 401, "가짜 토큰 401");
  assert.equal((await rpc("tools/list", {}, "")).status, 401, "토큰 없음 401");

  // 8. 폐기한 토큰도 401
  await fetch(`${BASE}/api/keys/${keyId}`, { method: "DELETE" });
  keyId = null;
  assert.equal((await rpc("tools/list")).status, 401, "폐기된 토큰 401");

  console.log("smoke ok");
} finally {
  for (const id of created)
    await fetch(`${BASE}/api/trips/${id}`, { method: "DELETE" });
  if (keyId) await fetch(`${BASE}/api/keys/${keyId}`, { method: "DELETE" });
}
