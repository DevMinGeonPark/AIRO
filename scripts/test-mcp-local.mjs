import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
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
const { isSouthKorea, mapsUrl, directionsUrl } = await import("../src/lib/place-maps.ts");
const { defaultPredeparture, predepartureSchema } = await import("../src/lib/predeparture.ts");
const { checkProgressSql } = await import("./check-itinerary-progress.mjs");
for (const [lat,lng] of [[37.5665,126.978],[35.1796,129.0756],[33.4996,126.5312],[37.4602,126.4407],[37.468,126.433],[37.484,130.906],[37.242,131.869],[37.967,124.64]]) assert.equal(isSouthKorea({lat,lng}),true);
for (const [lat,lng] of [[34.204,129.287],[33.59,130.401],[39.039,125.762],[37.9708,126.5544],[NaN,127]]) assert.equal(isSouthKorea({lat,lng}),false);
const koreanPlace={name:"숙소, 서울 & 호텔",lat:37.5665,lng:126.978};
assert.equal(mapsUrl(koreanPlace),`https://map.kakao.com/link/map/${encodeURIComponent(koreanPlace.name)},37.5665,126.978`);
assert.match(directionsUrl(koreanPlace),/^https:\/\/map.kakao.com\/link\/to\//);
assert.match(mapsUrl({...koreanPlace,lat:33.59,lng:130.401}),/^https:\/\/www.google.com\/maps\//);
assert.equal(predepartureSchema.safeParse(defaultPredeparture()).success,true);
assert.equal(predepartureSchema.safeParse({...defaultPredeparture(),items:[...defaultPredeparture().items,...defaultPredeparture().items]}).success,false);
const { mutateStops } = await import("../src/lib/itinerary-mutations.ts");
const { toolSchemas, toolParameters } = await import("../src/lib/tool-contracts.ts");
const { bindTripTools, createToolRunner } = await import("../src/lib/tool-runtime.ts");
const { createAiroMcpServer } = await import("../src/lib/mcp-server.ts");
const { verifiedMcpIdentity, validMcpPermissions } = await import("../src/lib/mcp-claims.ts");
const { readMcpJson } = await import("../src/lib/mcp-http.ts");
const { nearestRoadPoint } = await import("../src/lib/route-tools.ts");
const { providerRedirect } = await import("../src/lib/oauth-redirect.ts");
const { bookingLink, stopAttachments } = await import("../src/lib/trip-attachments.ts");
assert.equal(bookingLink("javascript:alert(1)"), null);
assert.equal(bookingLink("https://user:secret@trip.com/orders"), null);
assert.equal(bookingLink("https://kr.trip.com/order/hotel?orderId=123").href, "https://kr.trip.com/order/hotel?orderId=123&wkp=1");
assert.equal(bookingLink("https://trip.com.evil.test/order").label, "trip.com.evil.test 예약 열기");
const linkedDoc = {name:"예약.pdf",sha256:"a".repeat(64),mime:"application/pdf",stopIds:["A"]};
const attachmentFixture = {documents:[linkedDoc],reservations:[]};
assert.equal(stopAttachments({id:"A",note:null},attachmentFixture).documents.length,1);
assert.equal(stopAttachments({id:"B",name:"same name",note:null},attachmentFixture).documents.length,0,"names never guess a document association");
assert.equal(stopAttachments({id:"new-import-id",source_id:"A",note:null},attachmentFixture).documents.length,1,"import source IDs retain associations");
assert.equal(stopAttachments({id:"A",note:"Trip.com 예약 확정"},attachmentFixture).links[0].href,"https://kr.trip.com/m/orders/all?wkp=1");
assert.equal(stopAttachments({id:"A",note:"https://trip.com.evil.test/order"},attachmentFixture).links.length,0);
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
  listDocuments: async () => ({ documents: [{ name: "fixture.pdf", sha256: "a".repeat(64) }] }),
  getDocument: async () => ({ tripId: "trip-a", document: { name: "fixture.pdf", uri: `airo://trips/trip-a/documents/${"a".repeat(64)}`, mime: "application/pdf", base64: "JVBERi0xLjQKJSVFT0Y=" } }),
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
assert.equal((await client.listTools()).tools.length, 29);
assert.ok((await client.listResources()).resources.some(r => r.uri === "airo://trips"));
assert.ok((await client.listPrompts()).prompts.some(p => p.name === "plan-trip"));
assert.ok((await client.readResource({ uri: "airo://trips/trip-a" })).contents[0].text.includes("로마 여행"));
assert.equal((await client.callTool({ name: "addStop", arguments: { tripId: trip.id, name: "x", day: 1, lng: 1, lat: 1 } })).isError, true);
assert.equal((await client.callTool({ name: "createTrip", arguments: { title: "x" } })).isError, true, "business failures are MCP tool errors");
assert.equal((await client.callTool({ name: "searchPlaces", arguments: { query: "x" } })).isError, true);
const pdfResult = await client.callTool({ name: "getDocument", arguments: { tripId: trip.id, sha256: "a".repeat(64) } });
assert.equal(pdfResult.content[0].resource.mimeType, "application/pdf");
assert.equal("base64" in pdfResult.structuredContent.document, false, "PDF bytes use MCP blob resources, not JSON text");
assert.equal((await client.readResource({ uri: `airo://trips/trip-a/documents/${"a".repeat(64)}` })).contents[0].blob, "JVBERi0xLjQKJSVFT0Y=");
assert.equal(toolSchemas.updateNotificationSettings.safeParse({ tripId: "t", settings: { revision: 0, enabled: true, timeZone: "invalid", reminders: [] } }).success, false);
assert.equal(toolSchemas.attachDocument.safeParse({ tripId: "t", name: "bad.pdf", base64: "not-a-pdf" }).success, false);
for (const name of ["attachDocument", "setReservation", "addBudgetEntry", "updateBudgetEntry", "updateNotificationSettings", "revertChange"]) {
  await assert.rejects(createToolRunner(deps, ["trips:read"])(name, {}), /전용/);
}
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
assert.equal(listed.status, 200); assert.equal(JSON.parse(listed.text).result.tools.length, 13);
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
  // Every operation is one transaction/history entry, including all rows moved by reorder.
  const history = () => call("select public.list_trip_changes($1,null,50) result", [tripId]);
  const latest = async () => (await history()).changes[0].id;
  const undo = (id, expected) => call("select public.revert_trip_change($1,$2,$3) result", [tripId,id,expected]);
  const beforeReorder = await order(1);
  await mutate("reorder", { day: 1, stopIds: [A.id, B.id] });
  const reorderId = await latest();
  const reordered = await order(1);
  assert.notDeepEqual(reordered, beforeReorder);
  const undoResult = await undo(reorderId,reorderId);
  assert.deepEqual(await order(1),beforeReorder,"undo restores all affected stop positions together");
  await undo(undoResult.latestChangeId,undoResult.latestChangeId);
  assert.deepEqual(await order(1),reordered,"undo is itself reversible");
  await assert.rejects(undo(reorderId,reorderId), e => e.code === "40001", "stale history cannot overwrite changes");
  const page = (await history()).changes;
  assert.deepEqual(page.map(c => BigInt(c.id)), page.map(c => BigInt(c.id)).sort((a,b) => a > b ? -1 : 1));
  const previousPage = await call("select public.list_trip_changes($1,$2,2) result", [tripId,page[0].id]);
  assert.ok(previousPage.changes.every(c => BigInt(c.id) < BigInt(page[0].id)));
  const pdf = Buffer.from("%PDF-1.4\nfixture\n%%EOF");
  const document = { name: "예약.pdf", mime: "application/pdf", base64: pdf.toString("base64"), sha256: createHash("sha256").update(pdf).digest("hex") };
  const attach = value => call("select public.attach_trip_document($1,$2) result", [tripId,JSON.stringify(value)]);
  await attach(document);
  const documentId = await latest();
  assert.deepEqual(await attach(document),document);
  assert.equal(await latest(),documentId,"duplicate upload creates no duplicate document or history");
  const documentChange = await call("select public.get_trip_change($1,$2) result", [tripId,documentId]);
  assert.equal("base64" in documentChange.changes.documents.after[0],false);
  const linked = {...document,stopIds:[A.id,B.id]};
  assert.deepEqual(await attach(linked),linked,"reattaching a PDF links it without duplication");
  const linkedChange = await latest();
  assert.notEqual(linkedChange,documentId);
  assert.deepEqual(await attach(document),linked,"older clients preserve associations when omitted");
  const metadata = await call("select public.get_trip_attachments($1) result",[tripId]);
  assert.equal(metadata.documents.length,1);
  assert.equal("base64" in metadata.documents[0],false,"background refresh never transports PDF bytes");
  assert.deepEqual(metadata.documents[0].stopIds,[A.id,B.id]);
  await assert.rejects(attach({...document,stopIds:[crypto.randomUUID()]}),e=>e.code==="22023");
  await undo(linkedChange,linkedChange);
  assert.deepEqual(await attach(document),document,"link-only edits can be undone");
  await assert.rejects(attach({ ...document,sha256:"a".repeat(64) }), e => e.code === "22023");
  await assert.rejects(attach({ name: "missing.pdf",mime:"application/pdf" }), e => e.code === "22023");
  const setting = (field,value,revision=0) => call("select public.set_trip_management($1,$2,$3,$4) result", [tripId,field,JSON.stringify(value),revision]);
  const reservation = { id: crypto.randomUUID(),name:"숙소",stopId:A.id,stopIds:[B.id],bookingUrl:"https://kr.trip.com/order/hotel",documentSha256s:[document.sha256],bookingStatus:"confirmed",paymentStatus:"unpaid",reference:null,note:null };
  assert.equal(toolSchemas.setReservation.safeParse({tripId,revision:0,reservation}).success,true);
  assert.equal(toolSchemas.setReservation.safeParse({tripId,revision:0,reservation:{...reservation,bookingUrl:"javascript:alert(1)"}}).success,false);
  await assert.rejects(setting("reservations",{entries:[{...reservation,bookingUrl:"https://user:secret@trip.com"}]}),e=>e.code==="22023");
  await assert.rejects(setting("reservations",{entries:[{...reservation,documentSha256s:["a".repeat(64)]}]}),e=>e.code==="22023");
  await assert.rejects(setting("reservations",{entries:[{...reservation,stopIds:[crypto.randomUUID()]}]}),e=>e.code==="22023");
  let saved = await setting("reservations",{ revision:0,entries:[reservation] });
  assert.equal(saved.entries[0].paymentStatus,"unpaid","confirmed booking does not imply paid");
  saved = await setting("reservations",{ ...saved,entries:[{...reservation,paymentStatus:"paid"}] },1);
  const paidId = await latest();
  await undo(paidId,paidId);
  const archive = () => call("select data result from public.trip_archives where trip_id=$1",[tripId]);
  assert.equal((await archive()).reservations.entries[0].paymentStatus,"unpaid");
  assert.equal((await archive()).reservations.revision,3,"restored revision increases to reject stale editors");
  await assert.rejects(setting("reservations",saved,2),e=>e.code==="40001");
  await assert.rejects(setting("reservations",{ entries:[{...reservation,stopId:crypto.randomUUID()}] },3),e=>e.code==="22023");
  const settings = { revision:0,enabled:true,timeZone:"Asia/Seoul",reminders:[{ id:crypto.randomUUID(),title:"체크인",at:"2026-10-01T15:00:00+09:00",enabled:true }] };
  assert.equal((await setting("notificationSettings",settings)).revision,1);
  await assert.rejects(setting("notificationSettings",{...settings,timeZone:"invalid"},1),e=>e.code==="22023");
  const expense = { id:crypto.randomUUID(),name:"숙소",category:"stay",day:1,amount:120,currency:"EUR",exchangeRate:1500,paid:false };
  const saveBudget = (value,revision) => call("select public.update_trip_budget($1,$2,$3) result",[tripId,JSON.stringify(value),revision]);
  const budget = {version:1,reserve:20000,entries:[expense]};
  await saveBudget(budget,0);
  const budgetBeforeEdit = await latest();
  await saveBudget({...budget,entries:[{...expense,amount:150}]},1);
  await assert.rejects(undo(budgetBeforeEdit,await latest()),e=>e.code==="40001","cannot overwrite newer edits to same field");
  const budgetEdit = await latest();
  await undo(budgetEdit,budgetEdit);
  assert.equal((await archive()).expenseBudget.entries[0].amount,120);
  assert.equal((await archive()).expenseBudget.revision,3);
  assert.deepEqual((await archive()).documents,[document],"budget undo preserves PDF and settings");
  assert.equal((await archive()).notificationSettings.enabled,true);
  const saveTodo = (value, revision) => call("select public.update_trip_predeparture($1,$2,$3) result",[tripId,JSON.stringify(value),revision]);
  const todo=defaultPredeparture();
  assert.equal((await saveTodo(todo,0)).revision,1);
  const createdTodo=await latest();
  await undo(createdTodo,createdTodo);
  assert.deepEqual((await archive()).predepartureChecklist,{revision:2,items:[]});
  await assert.rejects(saveTodo(todo,1),e=>e.code==="40001");
  const firstTodo=await saveTodo(todo,2);
  await saveTodo({...firstTodo,items:firstTodo.items.map((item,i)=>({...item,done:i===0}))},3);
  const editedTodo=await latest();
  await undo(editedTodo,editedTodo);
  assert.equal((await archive()).predepartureChecklist.revision,5);
  assert.equal((await archive()).predepartureChecklist.items[0].done,false);
  assert.deepEqual((await archive()).documents,[document],"Todo changes preserve PDFs");
  await assert.rejects(saveTodo({items:[{...todo.items[0],done:"yes"}]},5),e=>e.code==="22023");
  await assert.rejects(saveTodo({items:[todo.items[0],todo.items[0]]},5),e=>e.code==="22023");
  const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aQ1sAAAAASUVORK5CYII=","base64");
  const image={name:"Private QR fixture",mime:"image/png",base64:png.toString("base64"),sha256:createHash("sha256").update(png).digest("hex"),width:1,height:1,sourceUrl:"https://www.vjw.digital.go.jp/main/#/vjwpic026",capturedAt:"2026-09-18T06:00:00.000Z"};
  const attachImage=value=>call("select public.attach_trip_image($1,$2) result",[tripId,JSON.stringify(value)]);
  const listImages=()=>call("select public.list_trip_images($1) result",[tripId]);
  const imageMetadata={...image};delete imageMetadata.base64;
  assert.deepEqual(await attachImage(image),imageMetadata);
  const imageChange=await latest();
  assert.deepEqual(await attachImage(image),imageMetadata,"identical original does not duplicate");
  assert.equal(await latest(),imageChange);
  assert.deepEqual(await listImages(),[imageMetadata]);
  const publicImageChange=await call("select public.get_trip_change($1,$2) result",[tripId,imageChange]);
  assert.equal("base64" in publicImageChange.changes.images.after[0],false,"QR bytes stay out of audit responses");
  await undo(imageChange,imageChange);
  assert.deepEqual(await listImages(),[]);
  assert.deepEqual((await archive()).documents,[document]);
  assert.equal((await archive()).predepartureChecklist.revision,5);
  await attachImage(image);
  await assert.rejects(attachImage({...image,mime:"image/svg+xml"}),e=>e.code==="22023");
  await assert.rejects(attachImage({...image,sha256:"a".repeat(64)}),e=>e.code==="22023");
  await assert.rejects(attachImage({...image,sourceUrl:"javascript:alert(1)"}),e=>e.code==="22023");
  await assert.rejects(attachImage({...image,width:5000}),e=>e.code==="22023");
  await assert.rejects(db.query("delete from public.trip_changes where trip_id=$1",[tripId]),e=>e.code==="42501","history cannot be erased by clients");
  await checkProgressSql({db,call,asUser,owner,other});
  await (await import("./check-stop-choices.mjs")).checkChoicesSql({db,call,asUser,owner,other});
  assert.equal(await call("select count(*)::int result from public.trip_changes where change_fields is distinct from array(select jsonb_object_keys(changes))"),0,"history summaries stay in sync with grouped updates and undo");
  const summaryBody=await call("select pg_get_functiondef('public.list_trip_changes(uuid,bigint,integer)'::regprocedure) result");
  assert.ok(summaryBody.includes('change_fields as fields'));assert.equal(summaryBody.includes('jsonb_object_keys'),false,"listing avoids decoding PDF/image audit payloads");
  await asUser(other);
  assert.deepEqual(await call("select public.get_trip_attachments($1) result",[tripId]),{documents:[],reservations:[]},"attachment metadata is owner isolated");
  assert.deepEqual(await listImages(),[],"private images are owner isolated");
  assert.deepEqual((await history()).changes,[],"history is owner isolated");
  await assert.rejects(attachImage(image),e=>e.code==="42501");
  await assert.rejects(saveTodo(todo,5),e=>e.code==="42501");
  await assert.rejects(attach(document),e=>e.code==="42501");
  await assert.rejects(setting("notificationSettings",settings),e=>e.code==="42501");
  await assert.rejects(undo(documentId,documentId),e=>e.code==="42501");
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
  assert.ok((await history()).changes.length,"read-only connection can read history");
  await assert.rejects(attachImage(image),e=>e.code==="42501");
  await assert.rejects(saveTodo(todo,5),e=>e.code==="42501");
  await assert.rejects(attach(document),e=>e.code==="42501");
  await assert.rejects(setting("notificationSettings",settings),e=>e.code==="42501");
  await assert.rejects(undo(documentId,documentId),e=>e.code==="42501");
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
  console.log("MCP SQL: migrations 0001–0016, compact history summaries, progress, private images/metadata/undo/ownership, Day 0 checklist ownership/revisions/undo, domestic maps, PDF/place links, reservation URLs, metadata isolation, budget, notifications, grouped history/undo, conflicts, OAuth/key RLS passed (in-memory PostgreSQL)");
} finally { await db.close(); }
