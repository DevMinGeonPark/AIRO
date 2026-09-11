import { chromium, webkit, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";

const port = 3441, origin = `http://127.0.0.1:${port}`;
const fixtureDir = new URL("../src/app/workspace-offline-check/", import.meta.url);
const output = new URL("../assets/validation/workspace/", import.meta.url);
const nextEnvFile = new URL("../next-env.d.ts", import.meta.url), initialNextEnv = await readFile(nextEnvFile, "utf8");
const trip = { id: "00000000-0000-4000-8000-000000000100", user_id: "fixture", title: "로마에서 만드는 나만의 여행", start_date: "2026-10-01", created_at: "2026-09-10T00:00:00Z" };
const stop = (id, name, position, day = 1) => ({ id, trip_id: trip.id, name, lng: 12.49 + position * .004, lat: 41.89 + position * .004, day, position, time: "10:00", note: null, map_query: null, mode: "ground" });
const stops = [stop("A", "콜로세움", 0), stop("B", "트레비 분수", 1), stop("C", "판테온", 2, 2)];
const empty = { version: 1, revision: 0, reserve: 0, entries: [] };
await mkdir(output, { recursive: true }); await mkdir(fixtureDir);
await writeFile(new URL("page.tsx", fixtureDir), `import { notFound } from "next/navigation";
import { TripWorkspace } from "@/components/trip-workspace";
import { ExpenseBudget } from "@/components/expense-budget";
import { AiConnectionManager } from "@/components/ai-connection-manager";
export const dynamic = "force-dynamic";
export default async function Page({searchParams}:{searchParams:Promise<{view?:string}>}) {
  if (process.env.NODE_ENV !== "development" || process.env.WORKSPACE_OFFLINE_PREVIEW !== "1") notFound();
  const {view}=await searchParams;
  if(view === "ai") return <main className="mx-auto max-w-3xl px-5 py-10"><AiConnectionManager installUrl={null}/></main>;
  if(view === "budget") return <ExpenseBudget trip={${JSON.stringify(trip)}} stops={${JSON.stringify(stops)}} initial={${JSON.stringify(empty)}} hasOriginal={false} showSignOut={false}/>;
  return <TripWorkspace trip={${JSON.stringify(trip)}} initialStops={${JSON.stringify(stops)}} initialMessages={[]} showSignOut/>;
}`);
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "-p", String(port)], {
  cwd: new URL("../", import.meta.url), stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, NEXT_DIST_DIR: ".next-workspace-check", WORKSPACE_OFFLINE_PREVIEW: "1", NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "", OPENAI_API_KEY: "", GOOGLE_MAPS_API_KEY: "", MCP_OAUTH_ENABLED: "false", DEMO_DB_PATH: "/tmp/airo-workspace-never-write.json" },
});
let logs = "", browser; child.stdout.on("data", data => { logs += data; }); child.stderr.on("data", data => { logs += data; });
const checks = [];
try {
  const began = Date.now();
  while (!logs.includes("Ready in")) {
    if (child.exitCode !== null || Date.now() - began > 45000) throw new Error(logs.slice(-3000));
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  for (const [engine, width, height] of [[chromium, 1440, 1000], [chromium, 390, 844], [webkit, 320, 740]]) {
    browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {});
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "no-preference" });
    const page = await context.newPage(), errors = [], bookmarks = [], writes = [];
    page.on("pageerror", error => errors.push(error.message)); page.on("dialog", dialog => dialog.accept());
    let snapshot = { trip, stops: structuredClone(stops), messages: [] }, ledger = structuredClone(empty), budgetFailure = false, stopFailure = false;
    let devices = [], job, apiCalls = 0, toolCalls = 0;
    const deviceId = "00000000-0000-4000-8000-000000000222";
    await context.route("**/*", async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin !== origin) {
        if (url.hostname === "basemaps.cartocdn.com") return route.fulfill({ json: { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#15191f" } }] } });
        return route.abort();
      }
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if (url.pathname === "/api/bridge/devices") {
        if (req.method() === "POST") { const data=req.postDataJSON(); if(data.action === "pair") { assert.equal(data.key,"a".repeat(64)); devices=[{id:data.id,name:data.name,state:"starting",seenAt:null,revokedAt:null}]; } else devices=devices.map(d=>({...d,revokedAt:new Date().toISOString()})); return route.fulfill({json:{ok:true}}); }
        return route.fulfill({json:{devices}});
      }
      if (url.pathname === "/api/bridge/jobs") { const data=req.postDataJSON(); assert.equal(apiCalls,0); job={id:data.id,state:"running",output:"",error:null,pending:data.message !== "중지 테스트"}; snapshot.messages.push({id:crypto.randomUUID(),trip_id:trip.id,role:"user",content:data.message,created_at:new Date().toISOString()}); return route.fulfill({json:{id:job.id}}); }
      if (url.pathname.startsWith("/api/bridge/jobs/")) {
        if(req.method() === "POST") { const data=req.postDataJSON(); if(data.action === "cancel") job={...job,state:"cancelled",error:"중지됨",pending:false}; else { toolCalls++; snapshot.stops[0].time="11:30"; job={...job,state:"completed",output:"첫 장소의 시간을 11:30으로 변경했어요.",pending:false}; snapshot.messages.push({id:crypto.randomUUID(),trip_id:trip.id,role:"assistant",content:job.output,created_at:new Date().toISOString()}); } return route.fulfill({json:{changed:true}}); }
        return route.fulfill({json:job});
      }
      if (url.pathname === "/api/chat") { apiCalls++; assert.equal(req.postDataJSON().provider,"api"); return route.fulfill({contentType:"application/x-ndjson",body:JSON.stringify({type:"delta",text:"API 응답"})+"\n"+JSON.stringify({type:"done"})+"\n"}); }
      if (url.pathname.endsWith("/routes")) {
        const data = req.postDataJSON(), a = snapshot.stops.find(s => s.id === data.fromId), b = snapshot.stops.find(s => s.id === data.toId);
        return route.fulfill({ json: { coordinates: [[a.lng, a.lat], [a.lng, b.lat], [b.lng, b.lat]], distance: 1200, duration: 900, profile: "pedestrian" } });
      }
      if (url.pathname.endsWith("/budget")) {
        if (req.method() === "GET") return route.fulfill({ json: ledger });
        if (budgetFailure) return route.fulfill({ status: 500, json: { error: "검증용 저장 오류" } });
        const data = req.postDataJSON();
        if (data.revision !== ledger.revision) return route.fulfill({ status: 409, json: { error: "다른 창에서 예산이 변경됐습니다." } });
        ledger = { ...data, revision: ledger.revision + 1 }; writes.push(ledger);
        return route.fulfill({ json: ledger });
      }
      if (url.pathname === "/api/places/search") return route.fulfill({ json: { places: [{ id: "osm:42", name: "광장 카페", lat: 41.891, lng: 12.491, address: "Piazza della Rotonda", category: "cafe" }], source: "fixture" } });
      if (url.pathname.endsWith("/places")) { bookmarks.push(req.postDataJSON()); return route.fulfill({ json: { saved: true, placeId: "osm:42" } }); }
      if (url.pathname === `/api/trips/${trip.id}`) {
        if (req.method() === "POST") {
          if (stopFailure) return route.fulfill({ status: 500, json: { error: "검증용 일정 저장 오류" } });
          snapshot.stops.push({ ...stop("D", "광장 카페", 3), ...req.postDataJSON() });
        }
        return route.fulfill({ json: snapshot });
      }
      throw new Error(`Unmocked API: ${req.method()} ${url.pathname}`);
    });
    const label = `${engine.name()}-${width}`;
    await page.goto(`${origin}/workspace-offline-check`, { waitUntil: "networkidle", timeout: 60000 });
    await page.getByRole("heading", { name: trip.title }).waitFor();
    const sheet = page.locator("#trip-itinerary"), handle = page.getByRole("separator", { name: "일정 시트 크기 조절" });
    if (width < 1024) {
      await expect(sheet).toHaveAttribute("data-snap", "half");
      await handle.focus(); await page.keyboard.press("ArrowDown"); await expect(sheet).toHaveAttribute("data-snap", "peek");
      await handle.click({ trial: true });
      const box = await handle.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y - 170, { steps: 10 }); await page.mouse.up();
      await expect(sheet).not.toHaveAttribute("data-snap", "peek");
      await handle.focus(); await page.keyboard.press("End"); await expect(sheet).toHaveAttribute("data-snap", "full");
    }
    await page.getByRole("button", { name: "전체 경로 따라가기", exact: true }).click();
    await expect(page.locator(".trip-workspace")).toHaveAttribute("data-playing", "true");
    await page.locator(".trip-moving-marker").waitFor();
    await page.getByRole("button", { name: "경로 재생 멈추기", exact: true }).click();
    await expect(page.locator(".trip-workspace")).toHaveAttribute("data-playing", "false");
    await expect(page.locator(".trip-moving-marker")).toHaveCount(0);
    if (width < 1024) await page.getByRole("button", { name: "일정", exact: true }).click();
    await page.getByRole("button", { name: "주변 카페", exact: true }).click();
    await page.getByRole("button", { name: "광장 카페 즐겨찾기에 저장" }).waitFor();
    await page.getByRole("combobox", { name: "담을 일차" }).selectOption("2");
    await page.getByRole("button", { name: "광장 카페 즐겨찾기에 저장" }).click();
    await expect.poll(() => bookmarks.length).toBe(1); assert.equal(bookmarks[0].day, 2);
    stopFailure = true;
    await page.getByRole("button", { name: "추가", exact: true }).click();
    await page.getByText("검증용 일정 저장 오류").waitFor();
    assert.equal(snapshot.stops.length, 3);
    stopFailure = false;
    await page.getByRole("button", { name: "추가", exact: true }).click();
    await page.getByText("광장 카페을 일정에 추가했습니다.").waitFor();
    assert.equal(snapshot.stops.at(-1).day, 2);
    await page.getByRole("button", { name: "광장 카페", exact: true }).click();
    if (width < 1024) {
      await expect(sheet).toHaveAttribute("data-snap", "peek");
      await expect.poll(async () => (await sheet.boundingBox()).height / (await page.locator(".workspace-panes").boundingBox()).height).toBeLessThan(.26);
    }
    await page.screenshot({ path: new URL(`map-${label}.png`, output).pathname });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "map no overflow");
    if (width < 1024) {
      await page.getByRole("button", { name: "채팅", exact: true }).click();
      await page.getByPlaceholder("여행에 대해 말해보세요").fill("가는 길에 카페를 추가해 줘");
      await page.getByRole("button", { name: "지도", exact: true }).click();
      await page.getByRole("button", { name: "채팅", exact: true }).click();
      assert.equal(await page.getByPlaceholder("여행에 대해 말해보세요").inputValue(), "가는 길에 카페를 추가해 줘");
    }

    await expect(page.getByRole("button",{name:"내 Codex",exact:true})).toHaveAttribute("aria-pressed","true");
    await page.getByPlaceholder("여행에 대해 말해보세요").fill("첫 장소 시간을 11:30으로 바꿔줘");
    await expect(page.getByRole("button",{name:"보내기",exact:true})).toBeDisabled();
    assert.equal(apiCalls,0,"offline never falls back to API");
    devices=[{id:deviceId,name:"내 노트북",state:"ready",seenAt:new Date().toISOString(),revokedAt:null}];
    await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
    const connection=page.getByRole("status",{name:"현재 AI 연결"});
    await expect(connection).toContainText("내 노트북");
    await expect(connection).toContainText("연결됨");
    await page.getByRole("button",{name:"보내기",exact:true}).click();
    await expect(page.getByText("첫 장소의 시간을 11:30으로 변경했어요.",{exact:true})).toBeVisible();
    await expect(page.getByRole("button",{name:"내 Codex",exact:true})).toBeEnabled();
    assert.equal(toolCalls,1);assert.equal(snapshot.stops[0].time,"11:30");assert.equal(apiCalls,0);
    await page.screenshot({path:new URL(`codex-chat-${label}.png`,output).pathname});
    await page.getByPlaceholder("여행에 대해 말해보세요").fill("중지 테스트");await page.getByRole("button",{name:"보내기",exact:true}).click();
    await expect(connection).toContainText("이 기기에서 응답 중");
    devices=[{...devices[0],seenAt:new Date(Date.now()-60000).toISOString()},{...devices[0],id:"00000000-0000-4000-8000-000000000444",name:"다른 컴퓨터"}];
    await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
    await expect(connection).toContainText("오프라인");
    await expect(connection).toContainText("내 노트북");
    await expect(connection).not.toContainText("다른 컴퓨터");
    await page.getByRole("button",{name:"대화 중지",exact:true}).click();
    await expect(page.getByRole("button",{name:"API로 사용",exact:true})).toBeEnabled();
    assert.equal(apiCalls,0);assert.equal(snapshot.stops[0].time,"11:30");
    await page.getByRole("button",{name:"API로 사용",exact:true}).click();
    await expect(connection).toContainText("OpenAI API");
    await expect(connection).toContainText("AIRO 서버 · API 비용 발생");
    await expect(connection).not.toContainText("내 노트북");
    await page.getByPlaceholder("여행에 대해 말해보세요").fill("API 선택 테스트");await page.getByRole("button",{name:"보내기",exact:true}).click();
    await expect.poll(()=>apiCalls).toBe(1);
    await expect(page.getByRole("button",{name:"내 Codex",exact:true})).toBeEnabled();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));

    const pairingId="00000000-0000-4000-8000-000000000333";
    await page.evaluate(id=>sessionStorage.setItem(`airo.pair.${id}`,JSON.stringify({id,key:"a".repeat(64),name:"연결할 컴퓨터",expires:Date.now()+600000})),pairingId);
    await page.goto(`${origin}/workspace-offline-check?view=ai&pair=${pairingId}`,{waitUntil:"networkidle"});
    await page.evaluate(()=>Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async(text)=>{window.__copiedSetup=text;}}}));
    await page.getByRole("button",{name:"Codex 연결 요청 복사",exact:true}).click();
    assert.ok((await page.evaluate(()=>window.__copiedSetup)).includes("https://airo.dev-heptivision.com/docs/codex/install"));
    await page.getByRole("button",{name:"이 Codex 연결하기",exact:true}).click();
    await expect(page.getByRole("button",{name:"이 Codex 연결하기",exact:true})).toHaveCount(0);
    await expect(page.getByText("오프라인",{exact:true})).toBeVisible();
    assert.equal(await page.evaluate(id=>sessionStorage.getItem(`airo.pair.${id}`),pairingId),null);
    devices=devices.map(d=>({...d,state:"ready",seenAt:new Date().toISOString()}));await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
    await expect(page.getByText("연결됨",{exact:true})).toBeVisible();
    await page.screenshot({path:new URL(`codex-connect-${label}.png`,output).pathname,fullPage:true});
    await page.getByRole("button",{name:"연결 해제",exact:true}).click();await expect(page.getByText("연결 해제됨",{exact:true})).toBeVisible();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));

    await page.goto(`${origin}/workspace-offline-check?view=budget`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "여행 예산", exact: true }).waitFor();
    await page.getByLabel("지출 항목 이름", { exact: true }).fill("첫날 숙소");
    await page.getByLabel("지출 금액", { exact: true }).fill("120");
    await page.getByLabel("지출 통화", { exact: true }).selectOption("EUR");
    await page.getByLabel("계산용 환율", { exact: true }).fill("1500");
    await page.getByLabel("지출 일차", { exact: true }).selectOption("1");
    await page.getByLabel("이미 결제했어요", { exact: true }).check();
    await page.getByRole("button", { name: "항목 추가", exact: true }).click();
    await page.getByRole("button", { name: "첫날 숙소 수정", exact: true }).waitFor();
    assert.equal(ledger.entries[0].exchangeRate, 1500); assert.equal(ledger.entries[0].paid, true);
    await page.getByRole("button", { name: "첫날 숙소 수정", exact: true }).click();
    await page.getByLabel("지출 금액", { exact: true }).fill("130");
    ledger = { ...ledger, reserve: 9000, revision: ledger.revision + 1 };
    await page.getByRole("button", { name: "수정 저장", exact: true }).click();
    await page.getByRole("button", { name: "최신 예산 불러오기", exact: true }).click();
    await page.getByText("최신 예산을 불러왔습니다. 작성 중인 항목을 확인한 뒤 저장해 주세요.").waitFor();
    assert.equal(await page.getByLabel("지출 금액", { exact: true }).inputValue(), "130", "draft survives conflict reload");
    await page.getByRole("button", { name: "수정 저장", exact: true }).click();
    await expect.poll(() => ledger.entries[0].amount).toBe(130); assert.equal(ledger.reserve, 9000);
    await page.getByLabel("예비비", { exact: true }).fill("20000");
    await page.getByRole("button", { name: "예비비 저장", exact: true }).click();
    await expect.poll(() => ledger.reserve).toBe(20000);
    budgetFailure = true;
    await page.getByLabel("지출 항목 이름", { exact: true }).fill("저장 실패 후 남는 카페 비용");
    await page.getByLabel("지출 금액", { exact: true }).fill("6000");
    await page.getByRole("button", { name: "항목 추가", exact: true }).click();
    await page.getByText("검증용 저장 오류").waitFor();
    assert.equal(ledger.entries.length, 1); assert.equal(await page.getByLabel("지출 금액", { exact: true }).inputValue(), "6000");
    budgetFailure = false;
    await page.getByRole("button", { name: "항목 추가", exact: true }).click();
    await expect.poll(() => ledger.entries.length).toBe(2);
    await page.getByRole("button", { name: "저장 실패 후 남는 카페 비용 삭제", exact: true }).click();
    await expect.poll(() => ledger.entries.length).toBe(1);
    await page.getByRole("button", { name: "첫날 숙소 미결제로 변경", exact: true }).click();
    await expect.poll(() => ledger.entries[0].paid).toBe(false);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "budget no overflow");
    const nameBox = await page.getByText("첫날 숙소", { exact: true }).boundingBox();
    assert.ok(nameBox.width > 120, "expense name has readable width");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: new URL(`budget-${label}.png`, output).pathname, fullPage: true });
    assert.deepEqual(errors, []);
    checks.push({ viewport: label, playbackAndStop: true, mobileSheet: width < 1024, bookmark: true, addErrorAndRetry: true, budgetCreateEditDelete: true, conflictDraftPreserved: true, serverErrorDraftPreserved: true, overflow: false, pageErrors: errors, mocked: true });
    await context.close(); await browser.close(); browser = null;
    console.log(`Workspace browser checks passed: ${label}`);
  }
  await writeFile(new URL("checks.json", output), JSON.stringify(checks, null, 2));
} finally {
  if (browser) await browser.close(); child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), new Promise(resolve => setTimeout(resolve, 5000))]);
  await rm(fixtureDir, { recursive: true });
  await rm(new URL("../.next-workspace-check/dev/types/", import.meta.url), { recursive: true, force: true });
  await rm(new URL("../.next-workspace-check/types/", import.meta.url), { recursive: true, force: true });
  const configFile = new URL("../tsconfig.json", import.meta.url), config = JSON.parse(await readFile(configFile, "utf8"));
  config.include = config.include.filter(path => !path.startsWith(".next-workspace-check/"));
  await writeFile(configFile, JSON.stringify(config, null, 2) + "\n");
  if ((await readFile(nextEnvFile, "utf8")).includes(".next-workspace-check/")) await writeFile(nextEnvFile, initialNextEnv);
  await writeFile(new URL("preview.log", output), logs);
}
