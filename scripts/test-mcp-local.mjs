import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

// Resolve repo TS imports without changing production bundler resolution.
registerHooks({ resolve(specifier, context, next) {
  try { return next(specifier, context); }
  catch (error) {
    if (error.code === "ERR_MODULE_NOT_FOUND" && specifier.startsWith(".") && context.parentURL?.includes("/src/")) return next(`${specifier}.ts`, context);
    throw error;
  }
} });
// Tests use injected providers/in-memory transports only. Any accidental fetch fails.
globalThis.fetch = async () => { throw new Error("Live API calls are forbidden in MCP local checks"); };
const { mutateStops } = await import("../src/lib/itinerary-mutations.ts");
const { toolSchemas, toolParameters } = await import("../src/lib/tool-contracts.ts");
const { bindTripTools, createToolRunner } = await import("../src/lib/tool-runtime.ts");
const { createAiroMcpServer } = await import("../src/lib/mcp-server.ts");
const { verifiedMcpIdentity, validMcpPermissions } = await import("../src/lib/mcp-claims.ts");
const { readMcpJson } = await import("../src/lib/mcp-http.ts");
const { nearestRoadPoint } = await import("../src/lib/route-tools.ts");
const { providerRedirect } = await import("../src/lib/oauth-redirect.ts");
const stop = (id, position, extra = {}) => ({ id, trip_id: "trip-a", name: id, lng: 12.49, lat: 41.89, day: 1, position, time: null, note: null, map_query: null, mode: "ground", ...extra });
const original = [stop("A", 0), stop("B", 4), stop("other-day", 0, { day: 2 })];
let result = mutateStops(original, "trip-a", { operation: "add", newId: "food", input: { name: "식당", lng: 12.491, lat: 41.891, day: 1, afterStopId: "A" } });
result = mutateStops(result.stops, "trip-a", { operation: "add", newId: "cafe", input: { name: "카페", lng: 12.492, lat: 41.892, day: 1, afterStopId: "food" } });
assert.deepEqual(result.stops.filter(s => s.day === 1).map(s => s.id), ["A", "food", "cafe", "B"]);
assert.deepEqual(original.map(s => s.position), [0, 4, 0], "no input snapshot mutation");
result = mutateStops(result.stops, "trip-a", { operation: "move", stopId: "cafe", input: { beforeStopId: "other-day" } });
assert.deepEqual(result.stops.filter(s => s.day === 2).map(s => s.id), ["cafe", "other-day"]);
result = mutateStops(result.stops, "trip-a", { operation: "reorder", day: 1, stopIds: ["B"] });
assert.deepEqual(result.order, ["B", "A", "food"], "omitted stops stay in order");
assert.throws(() => mutateStops(original, "trip-a", { operation: "move", stopId: "A", input: { afterStopId: "A" } }));
assert.throws(() => mutateStops(original, "trip-a", { operation: "add", newId: "bad", input: { day: 1, afterStopId: "other-day" } }));
assert.throws(() => mutateStops(original, "trip-a", { operation: "reorder", day: 1, stopIds: ["A", "A"] }));
assert.equal(toolSchemas.searchPlaces.safeParse({ query: "카페" }).success, false);
assert.equal(toolSchemas.addStop.safeParse({ tripId: "t", name: "place", day: 1, lng: 181, lat: 0 }).success, false);
assert.equal(toolSchemas.moveStop.safeParse({ tripId: "t", stopId: "s", time: "25:00" }).success, false);
assert.equal(toolSchemas.moveStop.safeParse({ tripId: "t", stopId: "s", afterStopId: "s" }).success, false);
assert.equal(toolSchemas.addStop.safeParse({ tripId: "t", name: "place", day: 1, lng: 1, lat: 1, afterStopId: "A", position: 2 }).success, false);
assert.equal(toolSchemas.getTrip.safeParse({ tripId: "t", userId: "other-owner" }).success, false);
assert.ok(toolParameters("searchPlaces").required.includes("tripId"));

const trip = { id: "trip-a", title: "로마 여행", user_id: "owner-a", start_date: null, created_at: "2026-01-01" };
let providerCalls = 0;
const fixtures = [stop("A", 0, { lng: 0, lat: 0 }), stop("B", 1, { lng: 0.02, lat: 0 })];
const deps = {
  listTrips: async () => [trip], getTrip: async id => id === trip.id ? { trip, stops: fixtures, messages: [{ content: "private chat" }] } : null,
  createTrip: async () => ({ error: "여행 개수 한도" }), updateTrip: async () => trip, deleteTrip: async () => {},
  addStop: async () => { throw new Error("저장 실패"); }, moveStop: async () => null, removeStop: async () => false, reorderDay: async () => [],
  roadRoute: async () => ({ coordinates: [[0, 0], [0, 0.01], [0.02, 0.01], [0.02, 0]], distance: 4500, duration: 3600, profile: "pedestrian" }),
  searchPlaces: async () => { providerCalls++; return { source: "fixture", places: [
    { id: "on-road", name: "길가 카페", lng: 0.01, lat: 0.0102, address: "fixture", category: "cafe" },
    { id: "straight-line", name: "직선 위 카페", lng: 0.01, lat: 0, address: "fixture", category: "cafe" },
  ] }; },
};
const run = createToolRunner(deps);
const bound = bindTripTools(run, trip.id);
assert.throws(() => bound("deleteTrip", { tripId: trip.id, expectedTitle: trip.title }), /채팅/);
assert.equal((await bound("searchPlaces", { tripId: "other-trip", query: "카페" })).tripId, trip.id, "chat cannot override bound trip");
providerCalls = 0;
assert.equal("messages" in await run("getTrip", { tripId: trip.id }), false);
assert.equal("messages" in await run("getTrip", { tripId: trip.id, includeMessages: true }), true);
await assert.rejects(run("createTrip", { title: "fourth" }), /한도/);
await assert.rejects(run("searchPlaces", { tripId: "other-owner-trip", query: "카페", near: { lng: 0, lat: 0 } }), /여행/);
assert.equal(providerCalls, 0, "ownership checked before external search");
await assert.rejects(createToolRunner(deps, ["trips:read"])("addStop", {}), /전용/);
await assert.rejects(run("deleteTrip", { tripId: trip.id, expectedTitle: "renamed" }), /이름/);
const route = await run("getDayRoute", { tripId: trip.id, day: 1 });
assert.equal(route.roadDistanceMeters, 4500); assert.equal("geometry" in route.legs[0], false);
const along = await run("searchAlongRoute", { tripId: trip.id, day: 1, query: "카페", radiusMeters: 200 });
assert.deepEqual(along.candidates.map(p => p.id), ["on-road"], "follow bent road, not origin/destination line");
assert.deepEqual(along.candidates[0].placement, { afterStopId: "A" });
assert.equal(providerCalls, 3, "bounded search calls");
assert.ok(nearestRoadPoint([180, 0.001], [[179.99, 0], [-179.99, 0]]).distance < 120, "antimeridian distance");
await assert.rejects(createToolRunner({ ...deps, roadRoute: async () => { throw new Error("route offline"); } })("getDayRoute", { tripId: trip.id, day: 1 }), /route offline/);

const now = Date.now(), claims = { iss: "https://auth.test/auth/v1", aud: ["authenticated", "https://airo.test/api/mcp"], exp: Math.floor(now / 1000) + 600, sub: "owner-a", role: "authenticated", client_id: "client-a", mcp_grant_version: "v1" };
const identity = c => verifiedMcpIdentity(c, claims.iss, "https://airo.test/api/mcp", now);
assert.equal(identity(claims).userId, "owner-a");
for (const patch of [{ aud: "authenticated" }, { iss: "https://other.test" }, { exp: 0 }, { client_id: null }, { mcp_grant_version: null }, { role: "service_role" }]) assert.equal(identity({ ...claims, ...patch }), null);
assert.equal(validMcpPermissions(["trips:write"]), null);
assert.equal(validMcpPermissions(["trips:read", "admin"]), null);
assert.throws(() => providerRedirect("https://user:pass@example.com"));
assert.throws(() => providerRedirect("javascript:alert(1)"));
assert.equal(providerRedirect("http://127.0.0.1:8080/callback?code=x"), "http://127.0.0.1:8080/callback?code=x");

const [a, b] = InMemoryTransport.createLinkedPair();
const server = createAiroMcpServer(run, ["trips:read", "trips:write"]);
const client = new Client({ name: "offline-contract-test", version: "1" });
await server.connect(a); await client.connect(b);
assert.equal((await client.listTools()).tools.length, 12);
assert.ok((await client.listResources()).resources.some(r => r.uri === "airo://trips"));
assert.ok((await client.listPrompts()).prompts.some(p => p.name === "plan-trip"));
assert.ok((await client.readResource({ uri: "airo://trips/trip-a" })).contents[0].text.includes("로마 여행"));
assert.equal((await client.callTool({ name: "addStop", arguments: { tripId: trip.id, name: "x", day: 1, lng: 1, lat: 1 } })).isError, true);
assert.equal((await client.callTool({ name: "createTrip", arguments: { title: "x" } })).isError, true, "business failures are MCP tool errors");
assert.equal((await client.callTool({ name: "searchPlaces", arguments: { query: "x" } })).isError, true);
await client.close(); await server.close();

async function transportRequest(body, headers = {}) {
  const server = createAiroMcpServer(run, ["trips:read"]);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  const req = new Request("https://airo.test/api/mcp", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers }, body: JSON.stringify(body) });
  try {
    const parsedBody = await readMcpJson(req);
    const response = await transport.handleRequest(req, { parsedBody });
    return { status: response.status, text: await response.text() };
  } finally { await server.close(); }
}
const listed = await transportRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" });
assert.equal(listed.status, 200); assert.equal(JSON.parse(listed.text).result.tools.length, 5);
assert.equal((await transportRequest({ jsonrpc: "2.0", method: "notifications/initialized" })).status, 202);
assert.equal((await transportRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { Accept: "application/json" })).status, 406);
assert.equal((await transportRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { "MCP-Protocol-Version": "1900-01-01" })).status, 400);
await assert.rejects(readMcpJson(new Request("https://airo.test", { method: "POST", body: JSON.stringify({ large: "a".repeat(100) }) }), 20), RangeError);
console.log("MCP contracts: order, road candidates, ownership, claims, tools/resources/prompts, SDK transport passed (no network)");

const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated; create role service_role; create role supabase_auth_admin;
    create schema auth;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    grant usage on schema auth,public to anon,authenticated,supabase_auth_admin;
    grant execute on function auth.uid(),auth.jwt() to authenticated,anon;
    alter default privileges in schema public grant all on tables to authenticated;`);
  for (const file of readdirSync("supabase/migrations").filter(f => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(`supabase/migrations/${file}`, "utf8").replace('create extension if not exists "pgcrypto";', "-- gen_random_uuid is built into this PostgreSQL build");
    try { await db.exec(sql); } catch (e) { throw new Error(`${file}: ${e.message}`); }
  }
  const owner = "00000000-0000-4000-8000-000000000001", other = "00000000-0000-4000-8000-000000000002";
  await db.query("insert into auth.users(id,email) values($1,'owner@fixture.test'),($2,'other@fixture.test')", [owner, other]);
  async function asUser(sub, extra = {}) { await db.exec("reset role"); await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub, role: "authenticated", ...extra })]); await db.exec("set role authenticated"); }
  const call = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.result;
  await asUser(owner);
  const created = await call("select public.create_trip_once($1,null,$2) result", ["로마 여행", "create-request-1"]);
  const tripId = created.trip.id;
  assert.equal((await call("select public.create_trip_once($1,null,$2) result", ["로마 여행", "create-request-1"])).trip.id, tripId);
  await assert.rejects(call("select public.create_trip_once($1,null,$2) result", ["다른 여행", "create-request-1"]), /requestId/);
  const mutate = (op, input, requestId = null, id = tripId) => call("select public.mutate_itinerary($1,$2,$3,$4) result", [id, op, JSON.stringify(input), requestId]);
  const add = (name, extra = {}, requestId = null) => mutate("add", { name, lng: 12.49, lat: 41.89, day: 1, ...extra }, requestId);
  const A = (await add("A")).stop, B = (await add("B")).stop;
  const food = (await add("식당", { afterStopId: A.id }, "food-request-1")).stop;
  assert.equal((await add("식당", { afterStopId: A.id }, "food-request-1")).stop.id, food.id, "retry returns same stop");
  const cafe = (await add("카페", { afterStopId: food.id })).stop;
  const order = async day => (await db.query("select id,name,position from public.stops where trip_id=$1 and day=$2 order by position", [tripId, day])).rows;
  assert.deepEqual((await order(1)).map(s => s.name), ["A", "식당", "카페", "B"]);
  await mutate("move", { stopId: cafe.id, day: 2 });
  assert.deepEqual((await order(1)).map(s => s.position), [0, 1, 2]);
  await mutate("move", { stopId: cafe.id, beforeStopId: B.id });
  assert.deepEqual((await order(1)).map(s => s.name), ["A", "식당", "카페", "B"]);
  const beforeInvalid = await order(1);
  await assert.rejects(add("bad", { beforeStopId: A.id, afterStopId: B.id }));
  await assert.rejects(mutate("move", { stopId: A.id, afterStopId: A.id }));
  assert.deepEqual(await order(1), beforeInvalid, "invalid mutation rolls back");
  await mutate("reorder", { day: 1, stopIds: [B.id] });
  assert.deepEqual((await order(1)).map(s => s.name), ["B", "A", "식당", "카페"]);
  assert.equal((await mutate("remove", { stopId: food.id })).removed, true);
  assert.equal((await mutate("remove", { stopId: food.id })).removed, false);
  assert.deepEqual((await order(1)).map(s => s.position), [0, 1, 2]);
  await asUser(other);
  assert.equal((await db.query("select * from public.trips where id=$1", [tripId])).rows.length, 0);
  await assert.rejects(mutate("add", { name: "intruder", lng: 0, lat: 0, day: 1 }), /여행/);

  const clientId = "00000000-0000-4000-8000-000000000010", grantVersion = "00000000-0000-4000-8000-000000000011";
  const resource = "https://airo.dev-heptivision.com/api/mcp";
  await asUser(owner);
  await db.query("insert into public.mcp_connections(user_id,client_id,client_name,redirect_uri,grant_version,permissions) values($1,$2,'Fixture AI','https://client.test/callback',$3,array['trips:read'])", [owner, clientId, grantVersion]);
  await db.exec("reset role");
  const hook = await call("select public.airo_mcp_token_hook($1) result", [JSON.stringify({ user_id: owner, claims: { sub: owner, role: "authenticated", aud: "authenticated", client_id: clientId } })]);
  assert.ok(hook.claims.aud.includes(resource)); assert.equal(hook.claims.mcp_grant_version, grantVersion);
  const wrongResource = await call("select public.airo_mcp_token_hook($1) result", [JSON.stringify({ user_id: owner, claims: { sub: owner, aud: "https://other.test", client_id: clientId } })]);
  assert.equal(wrongResource.claims.mcp_grant_version, undefined);
  await asUser(owner, hook.claims);
  assert.equal((await db.query("select * from public.trips")).rows.length, 1);
  await assert.rejects(add("not allowed"), /여행|row-level|permission/i);
  assert.equal((await db.query("select * from public.api_keys")).rows.length, 0);
  await assert.rejects(db.query("insert into public.mcp_connections(user_id,client_id,client_name,redirect_uri) values($1,$2,'Escalate','https://client.test')", [owner, "00000000-0000-4000-8000-000000000099"]), /row-level/);
  await asUser(owner);
  await db.query("update public.mcp_connections set permissions=array['trips:read','trips:write'] where client_id=$1", [clientId]);
  await asUser(owner, hook.claims);
  await add("allowed");
  await asUser(owner);
  await db.query("update public.mcp_connections set revoked_at=now() where client_id=$1", [clientId]);
  await asUser(owner, hook.claims);
  assert.equal((await db.query("select * from public.trips")).rows.length, 0, "revoked JWT loses access immediately");
  await asUser(owner);
  const keyId = "00000000-0000-4000-8000-000000000020";
  for (let i = 0; i < 120; i++) assert.equal(await call("select public.consume_mcp_request() result"), true);
  assert.equal(await call("select public.consume_mcp_request() result"), false, "per-account MCP request limit");
  await db.query("insert into public.api_keys(id,user_id,name,prefix,token_hash,scopes,expires_at) values($1,$2,'fixture','airo_x','fixturehash',array['trips:read'],now()+interval '1 day')", [keyId, owner]);
  await asUser(owner, { airo_key_id: keyId });
  assert.ok((await db.query("select * from public.trips")).rows.length);
  await assert.rejects(add("readonly key"), /여행|row-level|permission/i);
  await asUser(owner);
  await db.query("update public.api_keys set expires_at=now()-interval '1 second' where id=$1", [keyId]);
  await asUser(owner, { airo_key_id: keyId });
  assert.equal((await db.query("select * from public.trips")).rows.length, 0);
  await db.exec("reset role; set role anon;");
  assert.equal((await db.query("select * from public.resolve_mcp_key('fixturehash')")).rows.length, 0);
  console.log("MCP SQL: migrations 0001–0007, atomic insertion/reorder, retry receipts, owner isolation, OAuth/key RLS, audience hook, revocation/expiry passed (in-memory PostgreSQL)");
} finally { await db.close(); }
