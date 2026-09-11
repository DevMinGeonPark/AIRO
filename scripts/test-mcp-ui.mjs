import { chromium, webkit, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";

const port = 3027, origin = `http://127.0.0.1:${port}`;
const fixtureDir = new URL("../src/app/mcp-offline-check/", import.meta.url);
const output = new URL("../assets/validation/mcp/", import.meta.url);
const nextEnvFile = new URL("../next-env.d.ts", import.meta.url);
const initialNextEnv = await readFile(nextEnvFile, "utf8");
const fixtureTrip = { id: "00000000-0000-4000-8000-000000000100", user_id: "fixture", title: "로마 여행", start_date: "2026-10-01", created_at: "2026-09-10T00:00:00Z" };
const makeStop = (id, name, position, extra = {}) => ({ id, trip_id: fixtureTrip.id, name, lng: 12.4922 + position * .004, lat: 41.8902 + position * .004, day: 1, position, time: "10:00", note: null, map_query: null, mode: "ground", ...extra });
const stops = [makeStop("A", "콜로세움", 0), makeStop("B", "트레비 분수", 1)];
const details = { authorization_id: "offline-authorization-request", client: { id: "00000000-0000-4000-8000-000000000200", name: "내 여행 AI", uri: "https://client.example", logo_uri: "" }, redirect_uri: "https://client.example/callback", user: { id: "fixture", email: "traveler@fixture.test" }, scope: "openid" };
const connection = { client_id: details.client.id, client_name: details.client.name, redirect_uri: details.redirect_uri, permissions: ["trips:read"], authorized_at: "2026-09-10T00:00:00Z", revoked_at: null };
await mkdir(output, { recursive: true });
// Refuse to overwrite a user's route. The temporary route exists only for this test process.
await mkdir(fixtureDir);
await writeFile(new URL("page.tsx", fixtureDir), `import { notFound } from "next/navigation";
import { McpConnectionManager } from "@/components/mcp-connection-manager";
import { McpConsent } from "@/components/mcp-consent";
import { ApiKeyManager } from "@/components/api-key-manager";
import { TripWorkspace } from "@/components/trip-workspace";
import { AppHeader } from "@/components/app-shell";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: {searchParams: Promise<{view?: string}>}) {
  if (process.env.NODE_ENV !== "development" || process.env.MCP_OFFLINE_PREVIEW !== "1") notFound();
  const { view } = await searchParams;
  if (view === "trip") return <TripWorkspace trip={${JSON.stringify(fixtureTrip)}} initialStops={${JSON.stringify(stops)}} initialMessages={[]} />;
  if (view === "consent") return <><AppHeader/><main className="mx-auto max-w-xl px-5 py-12"><McpConsent details={${JSON.stringify(details)}} /></main></>;
  return <><AppHeader/><main className="mx-auto max-w-4xl px-5 py-12"><h1 className="text-3xl font-semibold">MCP 연결</h1><McpConnectionManager endpoint="https://airo.example/api/mcp" oauthEnabled apiKeyEnabled={view !== "oauth-only"} initialConnections={[${JSON.stringify(connection)}]} /><section className="mt-12"><h2 className="text-lg font-medium">API 키로 연결하기</h2><ApiKeyManager initialKeys={[]} enabled={view !== "oauth-only"}/></section></main></>;
}`);
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "-p", String(port)], {
  cwd: new URL("../", import.meta.url), stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, NEXT_DIST_DIR: ".next-airo-mcp-ui", MCP_OFFLINE_PREVIEW: "1", NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "", OPENAI_API_KEY: "", GOOGLE_MAPS_API_KEY: "", MCP_OAUTH_ENABLED: "false", DEMO_DB_PATH: "/tmp/airo-mcp-ui-never-write.json" },
});
let logs = ""; child.stdout.on("data", b => { logs += b; }); child.stderr.on("data", b => { logs += b; });
let currentBrowser;
const checks = [];
try {
  const started = Date.now();
  while (!logs.includes("Ready in")) {
    if (child.exitCode !== null || Date.now() - started > 45000) throw new Error(`Preview did not start: ${logs.slice(-4000)}`);
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  for (const [engine, width, height] of [[chromium, 1440, 1000], [chromium, 390, 844], [webkit, 320, 740]]) {
    currentBrowser = await engine.launch(engine === chromium ? { channel: "chrome" } : {});
    const context = await currentBrowser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
    await context.addInitScript(() => { Object.defineProperty(navigator, "clipboard", { value: { writeText: async value => { window.__copiedText = value; } } }); });
    let snapshot = { trip: structuredClone(fixtureTrip), stops: structuredClone(stops), messages: [] }, revision = 1, gets = 0;
    const posts = [], routeCalls = [], errors = [], network = [];
    await context.route("**/*", async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin !== origin) {
        if (url.hostname === "basemaps.cartocdn.com") return route.fulfill({ json: { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#15191f" } }] } });
        network.push(url.hostname); return route.abort();
      }
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if (url.pathname.endsWith("/routes")) { const data = req.postDataJSON(); routeCalls.push(data); const from = snapshot.stops.find(s => s.id === data.fromId), to = snapshot.stops.find(s => s.id === data.toId); return route.fulfill({ json: { coordinates: [[from.lng, from.lat], [from.lng, to.lat], [to.lng, to.lat]], distance: 1200, duration: 900, profile: "pedestrian" } }); }
      if (url.pathname === `/api/trips/${fixtureTrip.id}`) {
        gets++; const etag = `"fixture-${revision}"`;
        return req.headers()["if-none-match"] === etag ? route.fulfill({ status: 304, headers: { ETag: etag }, body: "" }) : route.fulfill({ json: snapshot, headers: { ETag: etag } });
      }
      const data = req.postDataJSON(); posts.push({ path: url.pathname, data });
      if (url.pathname === "/api/keys") return route.fulfill({ status: 201, json: { token: "airo_fixture_not_a_real_key", key: { id: "fixture-key", user_id: "fixture", name: data.name, prefix: "airo_fixture", scopes: data.readOnly ? ["trips:read"] : ["trips:read", "trips:write"], expires_at: "2026-12-10T00:00:00Z", created_at: "2026-09-10T00:00:00Z", last_used_at: null, revoked_at: null } } });
      if (url.pathname === "/api/mcp/consent") return route.fulfill({ status: 400, json: { error: "가정 응답: 승인 요청이 만료되었습니다." } });
      if (url.pathname.startsWith("/api/mcp/connections/")) return route.fulfill({ json: { ok: true } });
      throw new Error(`Unmocked API request: ${req.method()} ${url.pathname}`);
    });
    const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
    const label = `${engine.name()}-${width}`;
    await page.goto(`${origin}/mcp-offline-check`, { waitUntil: "networkidle", timeout: 60000 });
    await page.getByRole("tab", { name: "Cursor", exact: true }).click();
    await page.getByRole("button", { name: "복사", exact: true }).click();
    assert.ok((await page.evaluate(() => window.__copiedText)).includes("${env:AIRO_API_KEY}"));
    await page.getByRole("tab", { name: "로그인으로 연결" }).click();
    await page.getByRole("combobox", { name: "내 여행 AI 접근 권한" }).selectOption("write");
    await page.getByText("다음 MCP 요청부터 변경한 권한이 적용됩니다.").waitFor();
    await page.getByRole("button", { name: "연결 해제", exact: true }).click();
    await page.getByText("도구의 아이로 접근을 차단했습니다.").waitFor();
    assert.ok(posts.some(p => p.path === `/api/mcp/connections/${details.client.id}` && p.data.action === "revoke"));
    await page.getByPlaceholder("키 이름 (예: 내 노트북 Claude)").fill("여행 노트북");
    await page.getByRole("combobox", { name: "API 키 접근 권한" }).selectOption("write");
    await page.getByRole("combobox", { name: "API 키 유효 기간" }).selectOption("30");
    await page.getByRole("button", { name: "발급", exact: true }).click();
    await page.getByText("airo_fixture_not_a_real_key", { exact: true }).waitFor();
    assert.ok(posts.some(p => p.path === "/api/keys" && p.data.readOnly === false && p.data.expiresInDays === 30));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: new URL(`settings-${label}.png`, output).pathname, fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "settings mobile width");
    await page.goto(`${origin}/mcp-offline-check?view=consent`, { waitUntil: "networkidle" });
    await page.getByLabel("함께 여행 만들기").check();
    await page.getByRole("button", { name: "연결 허용", exact: true }).click();
    await page.getByRole("alert").waitFor();
    assert.ok(posts.some(p => p.path === "/api/mcp/consent" && p.data.permission === "write" && p.data.decision === "approve"));
    await page.getByRole("button", { name: "취소", exact: true }).click();
    await expect.poll(() => posts.some(p => p.path === "/api/mcp/consent" && p.data.decision === "deny")).toBe(true);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "consent mobile width");
    await page.screenshot({ path: new URL(`consent-${label}.png`, output).pathname, fullPage: true });
    await page.goto(`${origin}/mcp-offline-check?view=oauth-only`, { waitUntil: "networkidle" });
    await expect(page.getByRole("button", { name: "발급", exact: true })).toHaveCount(0);
    await page.getByRole("tab", { name: "Codex", exact: true }).click();
    await page.getByText("아래 연결 정보를 도구에 추가하고 아이로 로그인과 여행 권한 승인을 진행하세요.").waitFor();
    assert.ok(!(await page.locator("#mcp-client-panel").innerText()).includes("AIRO_API_KEY"));
    await page.goto(`${origin}/mcp-offline-check?view=trip`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "로마 여행", exact: true }).waitFor();
    await page.clock.install();
    await page.getByRole("button", { name: "일정 직접 추가", exact: true }).click();
    await page.getByRole("textbox", { name: "장소 이름", exact: true }).fill("작성 중인 내 장소");
    const before = gets;
    snapshot.trip.title = "MCP에서 바꾼 로마 여행";
    snapshot.stops = [snapshot.stops[0], makeStop("food", "MCP로 추가한 식당", 1, { lng: 12.4942, lat: 41.8922 }), { ...snapshot.stops[1], position: 2 }]; revision++;
    await page.clock.fastForward(5100);
    assert.equal(gets, before, "polling pauses during place editing");
    assert.equal(await page.getByRole("textbox", { name: "장소 이름", exact: true }).inputValue(), "작성 중인 내 장소");
    await page.getByRole("button", { name: "닫기", exact: true }).click();
    await page.clock.fastForward(5100);
    await page.getByRole("heading", { name: "MCP에서 바꾼 로마 여행", exact: true }).waitFor();
    await page.getByRole("button", { name: "MCP로 추가한 식당 수정", exact: true }).waitFor({ state: "attached" });
    if (width < 1024) await page.getByRole("button", { name: "채팅", exact: true }).click();
    await page.getByPlaceholder("여행에 대해 말해보세요").fill("아직 보내지 않은 내 질문");
    snapshot.stops.push(makeStop("cafe", "MCP로 추가한 카페", 3)); revision++;
    await page.clock.fastForward(5100);
    await page.getByRole("button", { name: "MCP로 추가한 카페 수정", exact: true, includeHidden: true }).waitFor({ state: "attached" });
    assert.equal(await page.getByPlaceholder("여행에 대해 말해보세요").inputValue(), "아직 보내지 않은 내 질문");
    await expect.poll(() => routeCalls.some(c => c.fromId === "A" && c.toId === "food")).toBe(true);
    await expect.poll(() => routeCalls.some(c => c.fromId === "food" && c.toId === "B")).toBe(true);
    if (width < 1024) await page.getByRole("button", { name: "일정", exact: true }).click();
    await page.screenshot({ path: new URL(`workspace-${label}.png`, output).pathname, fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "workspace mobile width");
    assert.deepEqual(errors, []); assert.deepEqual(network, []);
    checks.push({ viewport: label, settings: true, consentPayload: true, editPreserved: true, chatDraftPreserved: true, externalTripAndStopsSynced: true, routeRecalculated: true, externalApiRequests: 0 });
    await context.close(); await currentBrowser.close(); currentBrowser = null;
    console.log(`MCP mocked UI passed: ${label}`);
  }
  await writeFile(new URL("checks.json", output), JSON.stringify(checks, null, 2));
} finally {
  if (currentBrowser) await currentBrowser.close();
  child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), new Promise(resolve => setTimeout(resolve, 5000))]);
  await rm(fixtureDir, { recursive: true });
  await rm(new URL("../.next-airo-mcp-ui/dev/types/", import.meta.url), { recursive: true, force: true });
  await rm(new URL("../.next-airo-mcp-ui/types/", import.meta.url), { recursive: true, force: true });
  const configFile = new URL("../tsconfig.json", import.meta.url);
  const config = JSON.parse(await readFile(configFile, "utf8"));
  config.include = config.include.filter(path => !path.startsWith(".next-airo-mcp-ui/"));
  await writeFile(configFile, JSON.stringify(config, null, 2) + "\n");
  if ((await readFile(nextEnvFile, "utf8")).includes(".next-airo-mcp-ui/")) await writeFile(nextEnvFile, initialNextEnv);
  await writeFile(new URL("preview.log", output), logs);
}
