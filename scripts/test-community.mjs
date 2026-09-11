// Community edition smoke: owner login, trip + stop, MCP API key, bridge worker rejection, sign-out.
// Usage: COMMUNITY_BASE_URL=http://localhost:3002 AIRO_OWNER_PASSWORD=... node scripts/test-community.mjs
import assert from "node:assert/strict";
const base = (process.env.COMMUNITY_BASE_URL ?? "http://localhost:3002").replace(/\/$/, "");
const password = process.env.AIRO_OWNER_PASSWORD;
assert.ok(password, "AIRO_OWNER_PASSWORD is required");

for (let n = 0; n < 60; n++) { try { if ((await fetch(base + "/login")).ok) break; } catch {} await new Promise(r => setTimeout(r, 1000)); }

const form = (fields) => new URLSearchParams(fields).toString();
const post = (path, body, headers = {}) => fetch(base + path, { method: "POST", redirect: "manual", headers: { Origin: base, "Content-Type": "application/x-www-form-urlencoded", ...headers }, body });

// unauthenticated
assert.equal((await fetch(base + "/api/trips")).status, 401, "API without session");
const guest = await fetch(base + "/app", { redirect: "manual" });
assert.equal(guest.status, 307, "app redirects to login");
assert.match(guest.headers.get("location"), /\/login/);

// wrong password, then right password
const bad = await post("/auth/local", form({ password: "definitely-wrong", next: "/app" }));
assert.equal(bad.status, 303); assert.match(bad.headers.get("location"), /error=password/);
const ok = await post("/auth/local", form({ password, next: "/app" }));
assert.equal(ok.status, 303, "login redirects");
assert.match(ok.headers.get("location"), /\/app$/);
const cookie = ok.headers.get("set-cookie")?.match(/airo_session=[^;]+/)?.[0];
assert.ok(cookie, "session cookie set");
assert.match(ok.headers.get("set-cookie"), /HttpOnly/);
const auth = { Cookie: cookie, Origin: base, "Content-Type": "application/json" };
const json = async (path, init = {}) => { const r = await fetch(base + path, { ...init, headers: { ...auth, ...(init.headers ?? {}) } }); return { status: r.status, data: await r.json().catch(() => null) }; };

// trips beyond the free limit (owner is 'pro' in SQL)
const ids = [];
for (let i = 0; i < 4; i++) { const r = await json("/api/trips", { method: "POST", body: JSON.stringify({ title: `커뮤니티 검증 ${i}` }) }); assert.equal(r.status, 201, JSON.stringify(r.data)); ids.push(r.data.trip.id); }
const stop = await json(`/api/trips/${ids[0]}`, { method: "POST", body: JSON.stringify({ name: "판테온", lng: 12.4768, lat: 41.8986, day: 1, time: "10:00" }) });
assert.equal(stop.status, 201, JSON.stringify(stop.data));
assert.equal((await json(`/api/trips/${ids[0]}`)).data.stops.length, 1);

// MCP over API key
const issued = await json("/api/keys", { method: "POST", body: JSON.stringify({ name: "community smoke" }) });
assert.equal(issued.status, 201, JSON.stringify(issued.data));
assert.match(issued.data.token, /^airo_/);
const mcp = async (body) => (await fetch(base + "/api/mcp", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${issued.data.token}` }, body: JSON.stringify(body) })).json();
assert.equal((await mcp({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke", version: "0" } } })).result.serverInfo.name, "airo");
const listed = await mcp({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "listTrips", arguments: {} } });
assert.ok(JSON.stringify(listed.result).includes("커뮤니티 검증 0"), "MCP sees the owner's trips");
assert.equal((await fetch(base + "/api/mcp", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer airo_nope" }, body: "{}" })).status, 401);

// bridge worker needs a paired device key
assert.equal((await fetch(base + "/api/bridge/worker", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${"a".repeat(64)}` }, body: JSON.stringify({ op: "heartbeat", id: "00000000-0000-4000-8000-000000000009", data: {} }) })).status, 401);

// cleanup + sign-out
await json(`/api/keys/${issued.data.key.id}`, { method: "DELETE" });
for (const id of ids) await json(`/api/trips/${id}`, { method: "DELETE" });
const out = await post("/auth/signout", "", { Cookie: cookie });
assert.equal(out.status, 303);
assert.match(out.headers.get("set-cookie") ?? "", /airo_session=;|Max-Age=0/);
assert.equal((await fetch(base + "/api/trips", { headers: { Cookie: cookie } })).status, 200, "JWT cookie stays valid until expiry; sign-out clears the browser copy");
console.log("community ok: password login, unlimited trips, stops, MCP API key, worker rejection, sign-out");
