import assert from "node:assert/strict";
import { readFileSync, mkdirSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { chromium } from "@playwright/test";
import { startAuthFixture, token, sessionCookie, testOwner, testOther, secret } from "./test-auth-fixture.mjs";
const base = "http://127.0.0.1:3106";
const fixture = startAuthFixture();
const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "-p", "3106"], { env: { ...process.env, NEXT_DIST_DIR: ".next-integration", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:3104", NEXT_PUBLIC_SUPABASE_ANON_KEY: token(testOwner, "anon"), NEXT_PUBLIC_SITE_URL: base, SUPABASE_JWT_SECRET: secret, OPENAI_API_KEY: "" }, stdio: ["ignore", "pipe", "pipe"] });
let log = ""; for (const stream of [app.stdout, app.stderr]) stream.on("data", (chunk) => { log += chunk; });
const cookie = (id) => { const c = sessionCookie(id); return `${c.name}=${c.value}`; };
async function request(path, { id = testOwner, method = "GET", body } = {}) {
  const res = await fetch(base + path, { method, headers: { ...(id ? { Cookie: cookie(id) } : {}), "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), redirect: "manual" });
  return { status: res.status, res, data: await res.json().catch(() => null) };
}
let browser;
try {
  const setup = spawnSync("docker", ["exec", "-i", "airo-migration-test", "psql", "-U", "postgres", "-d", "airo_test", "-v", "ON_ERROR_STOP=1"], { input: `delete from auth.users where id in ('${testOwner}','${testOther}'); insert into auth.users(id,email) values('${testOwner}','owner@example.test'),('${testOther}','other@example.test') on conflict do nothing; notify pgrst, 'reload schema';`, encoding: "utf8" });
  assert.equal(setup.status, 0, setup.stderr);
  for (let n = 0; n < 100; n++) { try { if ((await fetch(base + "/login")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }
  assert.equal((await request("/api/trips", { id: null })).status, 401);
  const archive = JSON.parse(readFileSync(".private/exports/personal-trip.json", "utf8"));
  const imported = await request("/api/trips/import", { method: "POST", body: archive });
  assert.equal(imported.status, 201, JSON.stringify(imported.data));
  const tripId = imported.data.tripId;
  assert.equal((await request("/api/trips/import", { method: "POST", body: archive })).status, 200);
  assert.equal((await request("/api/trips/import", { method: "POST", body: { ...archive, format: "legacy-trip" } })).status, 200, "Previous archive imports remain compatible");
  const issued = await request("/api/keys", { method: "POST", body: { name: "AIRO branding validation" } });
  assert.match(issued.data.token, /^airo_/);
  const mcp = await fetch(base + "/api/mcp", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${issued.data.token}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }) });
  assert.equal((await mcp.json()).result.serverInfo.name, "airo");
  await request(`/api/keys/${issued.data.key.id}`, { method: "DELETE" });
  const detail = await request(`/api/trips/${tripId}`);
  assert.equal(detail.data.stops.length, 59);
  assert.equal((await request(`/api/trips/${tripId}`, { id: testOther })).status, 404);
  assert.equal((await request(`/api/trips/${tripId}/export`, { id: testOther })).status, 404);
  assert.equal((await request(`/api/trips/${tripId}/documents/0`, { id: testOther })).status, 404);
  const stopId = detail.data.stops[0].id;
  assert.equal((await request(`/api/trips/${tripId}/stops/${stopId}`, { method: "PATCH", id: testOther, body: { note: "hijack" } })).status, 404);
  assert.equal((await request(`/api/trips/${tripId}/stops/${stopId}`, { method: "PATCH", body: { note: "integration edit" } })).status, 200);
  assert.equal((await request(`/api/trips/${tripId}/saved`, { method: "POST", body: { ids: [archive.data.food[0].id], saved: true } })).status, 200);
  const backup = await request(`/api/trips/${tripId}/export`);
  assert.equal(backup.status, 200);
  assert.equal(backup.data.format, "airo-trip");
  assert.match(backup.res.headers.get("content-disposition"), /airo-/);
  assert.equal(backup.data.stops[0].note, "integration edit");
  assert.deepEqual(backup.data.data.documents, archive.data.documents);
  assert.deepEqual(backup.data.data.savedPlaceIds, [archive.data.food[0].id]);
  const document = await fetch(`${base}/api/trips/${tripId}/documents/0`, { headers: { Cookie: cookie(testOwner) } });
  assert.equal(document.status, 200);
  assert.deepEqual(Buffer.from(await document.arrayBuffer()), Buffer.from(archive.data.documents[0].base64, "base64"));

  browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([sessionCookie(testOwner)]);
  const page = await context.newPage(); const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  mkdirSync(".private/verification", { recursive: true, mode: 0o700 });
  await page.goto(`${base}/app/${tripId}`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "출국 전날", exact: true }).waitFor();
  await page.getByRole("button", { name: "울산역 (KTX) 수정", exact: true }).click();
  await page.locator('textarea[name="note"]').fill("화면에서 수정한 메모");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await page.getByText("화면에서 수정한 메모", { exact: true }).waitFor();
  assert.equal((await request(`/api/trips/${tripId}`)).data.stops[0].note, "화면에서 수정한 메모");
  await page.screenshot({ path: ".private/verification/workspace.png" });
  await page.goto(`${base}/app/${tripId}/cost`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "여유형", exact: true }).click();
  await page.getByRole("button", { name: "D0", exact: false }).click();
  await page.getByText("이 날 쓸 돈", { exact: true }).waitFor();
  await page.screenshot({ path: ".private/verification/budget.png", fullPage: true });
  await page.goto(`${base}/app/${tripId}/resources`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "즐겨찾기 1", exact: true }).click();
  assert.equal(await page.locator("article").count(), 1);
  await page.screenshot({ path: ".private/verification/resources.png", fullPage: true });
  await page.goto(`${base}/app/settings/import`, { waitUntil: "networkidle" });
  await page.locator('input[type="file"]').setInputFiles(".private/exports/personal-trip.json");
  await page.getByRole("button", { name: "이 계정으로 가져오기", exact: true }).click();
  await page.getByText("이미 가져온 여행입니다.", { exact: false }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/app/${tripId}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "일정", exact: true }).click();
  await page.getByRole("heading", { name: "출국 전날", exact: true }).waitFor();
  await page.screenshot({ path: ".private/verification/mobile.png" });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, "Mobile content overflows");
  for (const path of ["/app", "/app/settings/keys", "/app/settings/import", `/app/${tripId}/settings`, `/app/${tripId}/resources`, `/app/${tripId}/cost`, "/docs/mcp", "/pricing", "/login"]) {
    await page.goto(base + path, { waitUntil: "networkidle" });
    assert.match(await page.locator("body").innerText(), /아이로|airo/i, `AIRO branding at ${path}`);
    assert.match(await page.title(), /아이로|airo/i);
  }
  assert.deepEqual(errors, [], "Browser runtime errors");
  console.log("integration ok: authenticated import/export/PDF, account isolation, edits/bookmarks, desktop/mobile workspace, budget, food");
} catch (error) { const page = browser?.contexts()[0]?.pages()[0]; if (page) await page.screenshot({ path: ".private/verification/failure.png" }); console.error(log.slice(-10000)); throw error; }
finally { await browser?.close(); app.kill("SIGTERM"); fixture.closeAllConnections(); fixture.close(); }
