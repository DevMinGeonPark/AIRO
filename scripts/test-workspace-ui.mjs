import { chromium, webkit, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import "./prepare-pdf-viewer.mjs";
import { registerHooks } from "node:module";
import sharp from "sharp";
import { checkWebManagement } from "./check-web-management-ui.mjs";
registerHooks({resolve(specifier,context,next){try{return next(specifier,context);}catch(error){if(error.code==="ERR_MODULE_NOT_FOUND"&&specifier.startsWith(".")&&context.parentURL?.includes("/src/"))return next(`${specifier}.ts`,context);throw error;}}});
const { defaultPredeparture } = await import("../src/lib/predeparture.ts");
const { emptyItineraryProgress, automaticCandidates } = await import("../src/lib/itinerary-progress.ts");
// Synthetic pattern only. Real travel QR bytes never enter public test artifacts.
const imageBody=await sharp({create:{width:300,height:300,channels:3,background:"#ffffff"}}).composite([{input:Buffer.from('<svg width="300" height="300"><path d="M30 30h70v70H30zM200 30h70v70h-70zM30 200h70v70H30zM145 145h25v25h-25z" fill="black"/></svg>')}]).png().toBuffer();
const imageFixture={name:"Visit Japan Web QR fixture",mime:"image/png",sha256:"b".repeat(64),width:300,height:300,sourceUrl:"https://www.vjw.digital.go.jp/main/#/vjwpic026",capturedAt:"2026-09-18T06:00:00.000Z"};

// A real two-page PDF keeps native browser PDF plugins out of these checks.
const pdfObjects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>"];
for (const number of [1, 2]) {
  const content = `0.1 0.3 0.8 rg 20 240 260 100 re f BT /F1 18 Tf 20 200 Td (Reservation page ${number}) Tj ET`;
  pdfObjects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << /Font << /F1 7 0 R >> >> /Contents ${number === 1 ? 4 : 6} 0 R >>`, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
}
pdfObjects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
let pdfBody = "%PDF-1.4\n";
const pdfOffsets = [0];
pdfObjects.forEach((object, index) => { pdfOffsets.push(Buffer.byteLength(pdfBody)); pdfBody += `${index + 1} 0 obj\n${object}\nendobj\n`; });
const xref = Buffer.byteLength(pdfBody);
pdfBody += `xref\n0 ${pdfOffsets.length}\n0000000000 65535 f \n${pdfOffsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${pdfOffsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

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
import { TripResources } from "@/components/trip-resources";
import { TripManagement } from "@/components/trip-management";
export const dynamic = "force-dynamic";
export default async function Page({searchParams}:{searchParams:Promise<{view?:string}>}) {
  if (process.env.NODE_ENV !== "development" || process.env.WORKSPACE_OFFLINE_PREVIEW !== "1") notFound();
  const {view}=await searchParams;
  if(view === "manage") return <TripManagement trip={${JSON.stringify(trip)}}/>;
  if(view === "linked-budget") return <ExpenseBudget trip={${JSON.stringify(trip)}} stops={${JSON.stringify(stops)}} initial={${JSON.stringify(empty)}} hasOriginal={false} initialReservation={{id:"00000000-0000-4000-8000-000000000444",name:"연결 예약",stopId:"A",bookingStatus:"confirmed",paymentStatus:"paid",reference:null,note:null}}/>;
  if(view === "ai") return <main className="mx-auto max-w-3xl px-5 py-10"><AiConnectionManager installUrl={null}/></main>;
  if(view === "resources") return <TripResources trip={${JSON.stringify(trip)}} stops={${JSON.stringify(stops)}} food={[{id:"seoul-hotel",name:"서울 숙소",lat:37.5665,lng:126.978,day:1,stopId:"A",kind:"hotel",cuisine:"숙소"}]} photos={{}} documents={[{name:"UNPLAN 예약 확인.pdf",sha256:"${"a".repeat(64)}"}]} initialSaved={[]} hasBudget={false}/>;
  if(view === "budget") return <ExpenseBudget trip={${JSON.stringify(trip)}} stops={${JSON.stringify(stops)}} initial={${JSON.stringify(empty)}} hasOriginal={false}/>;
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
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "no-preference", hasTouch: width < 1024, timezoneId: "Asia/Seoul", serviceWorkers: "block" });
    const page = await context.newPage(), errors = [], bookmarks = [], writes = [];
    await page.addInitScript(() => {
      window.__geo = {watches:new Map(),last:0,denied:false};
      Object.defineProperty(navigator,"geolocation",{configurable:true,value:{watchPosition(success,failure){const id=++window.__geo.last;window.__geo.watches.set(id,{success,failure});if(window.__geo.denied)queueMicrotask(()=>failure({code:1}));return id;},clearWatch(id){window.__geo.watches.delete(id);}}});
    });
    await page.clock.install({ time: new Date("2026-10-01T03:00:00Z") });
    page.on("pageerror", error => errors.push(error.message)); page.on("dialog", dialog => dialog.accept());
    let snapshot = { trip, stops: structuredClone(stops), messages: [] }, ledger = structuredClone(empty), budgetFailure = false, stopFailure = false;
    let todo = defaultPredeparture(), todoFailure = false, imageFailure = false, imageCalls = 0, imageListFailure = false;
    let progress=emptyItineraryProgress(), progressFailure=false, automaticCalls=0, progressGate=null;
    const management={documents:[],reservations:{revision:0,entries:[]},failure:false,latest:"1",undoCalls:0};
    let devices = [], job, apiCalls = 0, toolCalls = 0, pdfCalls = 0, pdfFailure = false;
    const deviceId = "00000000-0000-4000-8000-000000000222";
    await context.route("**/*", async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin !== origin) {
        if (url.hostname === "basemaps.cartocdn.com") return route.fulfill({ json: { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#15191f" } }] } });
        return route.abort();
      }
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if(url.pathname===`/api/mobile/trips/${trip.id}/resources`)return route.fulfill({json:{stops:snapshot.stops,documents:management.documents,reservations:management.reservations}});
      if(url.pathname===`/api/mobile/trips/${trip.id}/documents`){if(management.failure)return route.fulfill({status:503,json:{error:"PDF 저장 실패"}});const data=req.postDataJSON();if(req.method()==="POST"){assert.equal(Buffer.from(data.base64,"base64").toString(),pdfBody);management.documents=[{name:data.name,sha256:"c".repeat(64),stopIds:data.stopIds}];}else management.documents=management.documents.map(doc=>doc.sha256===data.sha256?{...doc,stopIds:data.stopIds}:doc);return route.fulfill({json:{ok:true}});}
      if(url.pathname===`/api/mobile/trips/${trip.id}/reservations`){if(req.method()==="PUT"){const data=req.postDataJSON();if(management.failure)return route.fulfill({status:503,json:{error:"예약 저장 실패"}});if(data.revision!==management.reservations.revision)return route.fulfill({status:409,json:{error:"다른 곳에서 예약이 변경됐습니다."}});management.reservations={revision:data.revision+1,entries:[data.reservation]};}return route.fulfill({json:management.reservations});}
      if(url.pathname===`/api/mobile/trips/${trip.id}/changes`)return route.fulfill({json:{changes:[{id:management.latest,created_at:"2026-10-01T03:00:00Z",fields:["reservations"]}]}});
      if(url.pathname.startsWith(`/api/mobile/trips/${trip.id}/changes/`)){if(req.method()==="POST"){if(req.postDataJSON().expectedLatestChangeId!==management.latest)return route.fulfill({status:409,json:{error:"최신 변경 이력을 확인하세요."}});management.undoCalls++;management.latest=String(Number(management.latest)+1);return route.fulfill({json:{ok:true}});}return route.fulfill({json:{id:url.pathname.split("/").at(-1),created_at:"2026-10-01T03:00:00Z",changes:{reservations:{before:{entries:[]},after:management.reservations}}}});}
      if(url.pathname.endsWith("/progress")) {
        if(req.method()==="PATCH") {
          if(progressGate)await progressGate;
          if(progressFailure)return route.fulfill({status:503,json:{error:"검증용 진행 저장 오류"}});
          const data=req.postDataJSON();
          if(data.revision!==progress.revision)return route.fulfill({status:409,json:{error:"진행 상태가 바뀌었어요."}});
          const before=JSON.stringify(progress),now=await page.evaluate(()=>Date.now()),stamp=new Date(now).toISOString();
          if(data.action==="manual"||data.action==="resume")progress.entries=progress.entries.filter(e=>e.stopId!==data.stopId);
          if(data.action==="manual")progress.entries.push({stopId:data.stopId,done:data.done,source:"manual",completedAt:data.done?stamp:null,updatedAt:stamp});
          if(data.action==="rule")progress.rules=[...progress.rules.filter(r=>r.stopId!==data.rule.stopId),...(data.rule.mode==="manual"?[]:[data.rule])];
          if(data.action==="timezone")progress.timeZone=data.timeZone;
          if(data.action==="automatic"){automaticCalls++;progress.entries.push(...automaticCandidates(progress,snapshot.stops,trip.start_date,now,data.position).map(candidate=>({...candidate,done:true,completedAt:stamp,updatedAt:stamp})));}
          if(JSON.stringify(progress)!==before)progress.revision++;
        }
        return route.fulfill({json:progress});
      }
      if(url.pathname.endsWith("/images")) return imageListFailure ? route.fulfill({status:503,json:{error:"fixture offline"}}) : route.fulfill({json:{images:[imageFixture]}});
      if(url.pathname.includes("/images/")) { imageCalls++;return imageFailure?route.fulfill({status:404,json:{error:"fixture missing"}}):route.fulfill({contentType:"image/png",body:imageBody}); }
      if (url.pathname.endsWith("/predeparture")) {
        if(req.method()==="PUT") {
          if(todoFailure) return route.fulfill({status:500,json:{error:"검증용 Todo 저장 오류"}});
          const value=req.postDataJSON();
          if(value.revision!==todo.revision) return route.fulfill({status:409,json:{error:"다른 곳에서 Todo가 변경됐어요."}});
          todo={...value,revision:todo.revision+1};
        }
        return route.fulfill({json:todo});
      }
      if (url.pathname.includes("/documents/")) { pdfCalls++; return pdfFailure ? route.fulfill({status:404,json:{error:"문서를 찾을 수 없습니다."}}) : route.fulfill({contentType:"application/pdf",headers:{"Cache-Control":"private, no-store"},body:pdfBody}); }
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
    const sheet = page.locator("#trip-itinerary"), handle = page.getByRole("separator", { name: "일정 시트 크기 조절" });
    const tabsNav = page.getByRole("navigation", { name: "여행 화면" });
    // 휴대폰: 지도만 보인다. 조작부는 빈 지도를 눌러야 나온다.
    const tapMap = async () => { const spot = await page.evaluate(() => { const canvas = document.querySelector(".workspace-map canvas"); for (let y = .3; y <= .8; y += .1) for (let x = .3; x <= .9; x += .1) { const px = Math.round(innerWidth * x), py = Math.round(innerHeight * y); if (document.elementFromPoint(px, py) === canvas) return { x: px, y: py }; } return null; }); assert.ok(spot, "no free map spot"); await page.mouse.click(spot.x, spot.y); };
    const revealTabs = async () => { if (width >= 1024) return; if (!await tabsNav.isVisible()) { const close=page.getByRole("button",{name:"장소 정보 닫기",exact:true});if(await close.isVisible())await close.click();await tapMap(); } await expect(tabsNav).toBeVisible(); };
    const openPlan = async () => { if (width >= 1024) return; await revealTabs(); await page.getByRole("button", { name: "일정", exact: true }).click(); await expect(sheet).toHaveAttribute("data-snap", "full"); };
    // Day 0 exists even with no stops, and a saved checklist survives reopening.
    await openPlan();
    await sheet.getByRole("button",{name:/^전날/}).click();
    const todoTrigger=sheet.getByRole("button",{name:"출국 전날 Todo",exact:true});
    await todoTrigger.click();
    const todoModal=page.locator(".predeparture-modal");
    await expect(todoModal).toContainText("9/30 수");
    const imageTrigger=todoModal.getByRole("button",{name:`이미지 보기: ${imageFixture.name}`,exact:true});
    await expect(imageTrigger).toBeVisible();assert.equal(imageCalls,0,"image originals load on demand");
    imageFailure=true;await imageTrigger.click();
    const imageModal=page.getByRole("dialog",{name:imageFixture.name,exact:true});
    await expect(imageModal.getByRole("alert")).toBeVisible();
    imageFailure=false;await imageModal.getByRole("button",{name:"다시 시도",exact:true}).click();
    await expect(imageModal.getByRole("img",{name:imageFixture.name,exact:true})).toBeVisible();
    await expect.poll(()=>imageModal.getByRole("img").evaluate(image=>image.complete&&image.naturalWidth)).toBe(300);
    assert.equal(context.pages().length,1);
    await expect(imageModal.getByRole("link",{name:"이미지 저장",exact:true})).toHaveAttribute("href",`/api/trips/${trip.id}/images/${imageFixture.sha256}?download=1`);
    await expect(imageModal.getByRole("link",{name:"원본 사이트 열기",exact:true})).toHaveAttribute("href",imageFixture.sourceUrl);
    await imageModal.getByRole("button",{name:"확대",exact:true}).click();
    await expect(imageModal.getByRole("img")).toHaveCSS("width","600px");
    await imageModal.getByRole("button",{name:"화면에 맞추기",exact:true}).click();
    await imageModal.getByRole("button",{name:"크게 보기",exact:true}).click();
    await expect(imageModal).toHaveAttribute("data-expanded","true");
    await imageModal.getByRole("button",{name:"작게 보기",exact:true}).click();
    assert.ok(await imageModal.evaluate(element=>element.scrollWidth<=element.clientWidth+1),"image viewer fits narrow screens");
    await page.screenshot({path:new URL(`image-viewer-${label}.png`,output).pathname});
    await page.keyboard.press("Escape");await expect(imageModal).toHaveCount(0);await expect(todoModal).toBeVisible();await expect(imageTrigger).toBeFocused();

    await todoModal.getByRole("checkbox",{name:"여권·지갑·결제 카드 챙기기"}).check();
    await todoModal.getByLabel("새 할 일",{exact:true}).fill("비자 서류 준비");
    await expect(todoModal).toHaveAttribute("data-inline","true");
    await todoModal.getByRole("button",{name:"Todo 크게 보기",exact:true}).click();
    await expect(todoModal).toHaveAttribute("data-expanded","true");
    await expect(todoModal.getByLabel("새 할 일",{exact:true})).toHaveValue("비자 서류 준비");
    await expect(todoModal.getByRole("checkbox",{name:"여권·지갑·결제 카드 챙기기"})).toBeChecked();
    await todoModal.getByRole("button",{name:"Todo 작게 보기",exact:true}).click();
    await expect(todoModal.getByLabel("새 할 일",{exact:true})).toHaveValue("비자 서류 준비");
    await todoModal.getByLabel("분류",{exact:true}).selectOption("documents");
    await todoModal.getByRole("button",{name:"추가",exact:true}).click();
    await expect(todoModal.getByRole("link",{name:/일본 비자 안내/})).toHaveAttribute("href","https://www.kr.emb-japan.go.jp/itpr_ko/visa_application.html");
    await expect(todoModal.getByRole("link",{name:"Visit Japan Web · QR 화면 로그인 후 여행을 선택해 주세요",exact:true})).toHaveAttribute("href",imageFixture.sourceUrl);
    await page.screenshot({path:new URL(`todo-${label}.png`,output).pathname});
    assert.ok(await todoModal.evaluate(element=>element.scrollWidth<=element.clientWidth+1),"Todo fits narrow screens");
    todoFailure=true;
    await todoModal.getByRole("button",{name:"저장하고 닫기",exact:true}).click();
    await expect(todoModal.getByRole("alert")).toContainText("검증용 Todo 저장 오류");
    await expect(todoModal.getByRole("checkbox",{name:"비자 서류 준비",exact:true})).toBeVisible();
    todoFailure=false;
    await todoModal.getByRole("button",{name:"저장하고 닫기",exact:true}).click();
    await expect(todoModal).toHaveCount(0); await expect(todoTrigger).toBeFocused();
    await todoTrigger.click();
    await expect(todoModal.getByRole("checkbox",{name:"여권·지갑·결제 카드 챙기기"})).toBeChecked();
    await todoModal.getByRole("button",{name:"비자 서류 준비 삭제",exact:true}).click();
    todo={...todo,revision:todo.revision+1};
    await todoModal.getByRole("button",{name:"저장하고 닫기",exact:true}).click();
    await expect(todoModal.getByRole("alert")).toContainText("다른 곳에서 Todo");
    await expect(todoModal.getByRole("checkbox",{name:"비자 서류 준비",exact:true})).toHaveCount(0);
    await todoModal.getByRole("button",{name:"최신 목록 불러오기",exact:true}).click();
    await expect(todoModal.getByRole("checkbox",{name:"비자 서류 준비",exact:true})).toBeVisible();
    await todoModal.getByRole("button",{name:"비자 서류 준비 삭제",exact:true}).click();
    await todoModal.getByRole("button",{name:"저장하고 닫기",exact:true}).click();
    await expect(todoModal).toHaveCount(0);
    await sheet.getByRole("button",{name:/^1일차/}).click();
    await todoTrigger.click();
    await expect(todoModal.getByRole("checkbox",{name:"여권·지갑·결제 카드 챙기기"})).toBeChecked();
    await todoModal.getByRole("button",{name:"저장하고 닫기",exact:true}).click();
    await expect(todoModal).toHaveCount(0);
    const progressCard=page.locator(".workspace-place-card");
    const checkA=sheet.getByRole("button",{name:"콜로세움 일정 완료",exact:true});
    await sheet.getByRole("button",{name:"전체",exact:true}).click();
    const mapStage=page.locator(".workspace-map"),checkB=sheet.getByRole("button",{name:"트레비 분수 일정 완료",exact:true}),checkC=sheet.getByRole("button",{name:"판테온 일정 완료",exact:true});
    await expect(mapStage).toHaveAttribute("data-road-routes","2");
    let releaseProgress;progressGate=new Promise(resolve=>releaseProgress=resolve);
    await checkB.click();
    await expect(checkB).toHaveAttribute("aria-pressed","true");assert.equal(progress.entries.length,0,"UI changes before the server replies");
    await expect(mapStage).toHaveAttribute("data-remaining-stops","2");await expect(mapStage).toHaveAttribute("data-road-routes","1");
    await expect(page.locator('.workspace-map-pin[data-completed=true]')).toHaveCount(1);
    await checkA.click();await checkA.click();await checkC.click();
    await expect(checkA).toHaveAttribute("aria-pressed","false");await expect(checkC).toHaveAttribute("aria-pressed","true");
    await expect(mapStage).toHaveAttribute("data-remaining-stops","1");await expect(mapStage).toHaveAttribute("data-road-routes","0");
    progressGate=null;releaseProgress();
    await expect.poll(()=>progress.entries.filter(entry=>entry.done).length).toBe(2);
    await expect(sheet.locator(".trip-progress-count")).not.toContainText("저장 중");
    await checkB.click();await checkC.click();
    await expect(mapStage).toHaveAttribute("data-road-routes","2");
    await expect(sheet.locator(".trip-progress-count")).not.toContainText("저장 중");
    progress=emptyItineraryProgress();await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
    await sheet.getByRole("button",{name:/^1일차/}).click();
    progressFailure=true;await checkA.click();
    await expect(sheet.getByRole("alert")).toContainText("검증용 진행 저장 오류");
    await expect(checkA).toHaveAttribute("aria-pressed","false");
    progressFailure=false;await checkA.click();
    await expect(checkA).toHaveAttribute("aria-pressed","true");
    await page.reload({waitUntil:"networkidle"});await openPlan();
    const firstDayChip=sheet.locator(".workspace-days").getByRole("button",{name:/^1일차/});
    if(await firstDayChip.getAttribute("aria-pressed")!=="true")await firstDayChip.click();
    await expect(checkA).toHaveAttribute("aria-pressed","true");
    await sheet.getByRole("button",{name:/콜로세움$/}).click();
    await progressCard.getByRole("combobox",{name:"콜로세움 체크 방법"}).selectOption("time");
    await progressCard.getByRole("button",{name:"콜로세움 일정 완료"}).click();
    await expect(progressCard).toContainText("자동 체크가 일시 정지");
    await page.clock.runFor(16000);
    assert.equal(progress.entries[0].done,false);
    await progressCard.getByRole("button",{name:"체크 초기화·자동 체크 다시 허용"}).click();
    await expect(progressCard).toContainText("시간 자동 체크 ·");
    await expect.poll(()=>progress.entries.find(entry=>entry.stopId==="A")?.source).toBe("time");
    await progressCard.getByRole("button",{name:"장소 정보 닫기"}).click();await openPlan();
    await sheet.getByRole("button",{name:/트레비 분수$/}).click();
    await progressCard.getByRole("combobox",{name:"트레비 분수 체크 방법"}).selectOption("location");
    await page.evaluate(()=>{window.__geo.denied=true});
    await progressCard.getByRole("button",{name:"위치 자동 체크 시작"}).click();
    await expect(progressCard).toContainText("위치 권한이 꺼져");
    await page.evaluate(()=>{window.__geo.denied=false});
    await progressCard.getByRole("button",{name:"위치 자동 체크 시작"}).click();
    await page.evaluate(stop=>{for(const w of window.__geo.watches.values())w.success({coords:{latitude:stop.lat,longitude:stop.lng,accuracy:200},timestamp:Date.now()});},stops[1]);
    await expect(progressCard).toContainText("위치 오차가 커요");
    assert.equal(progress.entries.some(e=>e.stopId==="B"),false);
    await page.evaluate(stop=>{for(const w of window.__geo.watches.values())w.success({coords:{latitude:stop.lat,longitude:stop.lng,accuracy:10},timestamp:Date.now()});},stops[1]);
    await expect(progressCard).toContainText("위치 자동 체크 ·");
    await progressCard.getByRole("button",{name:"위치 자동 체크 중지"}).click();
    await expect.poll(()=>page.evaluate(()=>window.__geo.watches.size)).toBe(0);
    await page.screenshot({path:new URL(`progress-${label}.png`,output).pathname});
    await expect.poll(()=>progress.entries.filter(e=>e.done).length).toBe(2);assert.ok(automaticCalls>=2);
    await progressCard.getByRole("button",{name:"장소 정보 닫기"}).click();await openPlan();
    await expect(sheet.getByRole("region",{name:"일정 진행",exact:true})).toContainText("일정 완료 2 / 2");
    await expect(mapStage).toHaveAttribute("data-remaining-stops","0");await expect(mapStage).toHaveAttribute("data-road-routes","0");
    const daySummary=sheet.locator(".trip-progress-summary");
    await daySummary.locator("summary").click();
    await daySummary.getByRole("combobox",{name:"표시한 일정 전체 체크 방법"}).selectOption("manual");
    await daySummary.getByRole("button",{name:"표시한 2곳에 적용",exact:true}).click();
    await expect(daySummary).toContainText("2곳에 적용했습니다.");assert.equal(progress.rules.length,0);
    await daySummary.locator("summary").click();
    if(width>=1024)await sheet.getByRole("button",{name:"전체",exact:true}).click();
    // MCP adds only attachment metadata: the open workspace must refresh it
    // without changing stops, and another same-day place must not inherit it.
    snapshot.attachments = { documents: [{name:"UNPLAN 예약 확인.pdf",mime:"application/pdf",sha256:"a".repeat(64),stopIds:["A"]}], reservations: [{id:"fixture-booking",name:"UNPLAN Fukuoka",stopId:"A",bookingStatus:"confirmed",paymentStatus:"paid",reference:"TEST-123",note:null,bookingUrl:"https://kr.trip.com/order/hotel"}] };
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    const card = page.locator(".workspace-place-card");
    await openPlan();
    await sheet.getByRole("button",{name:/콜로세움$/}).click();
    const pdfTrigger = card.getByRole("button",{name:"PDF 보기: UNPLAN 예약 확인.pdf"});
    assert.equal(pdfCalls,0,"PDF bytes are loaded only on demand");
    await pdfTrigger.click();
    const pdfModal = page.getByRole("dialog",{name:"UNPLAN 예약 확인.pdf"});
    await expect(pdfModal).toBeVisible();
    assert.equal(context.pages().length,1,"opening a PDF stays in a modal");
    await expect(pdfModal.getByRole("img",{name:"UNPLAN 예약 확인.pdf · 1페이지"})).toBeVisible({timeout:30000});
    await expect(pdfModal).toContainText("1 / 2 페이지");
    await pdfModal.getByRole("button",{name:"다음 PDF 페이지"}).click();
    await expect(pdfModal.getByRole("img",{name:"UNPLAN 예약 확인.pdf · 2페이지"})).toBeVisible();
    const small = await pdfModal.boundingBox();
    await pdfModal.getByRole("button",{name:"크게 보기",exact:true}).click();
    await expect(pdfModal).toHaveAttribute("data-expanded","true");
    assert.ok((await pdfModal.boundingBox()).height > small.height);
    await expect(pdfModal.getByRole("link",{name:"새 탭",exact:true})).toHaveAttribute("href",`/api/trips/${trip.id}/documents/${"a".repeat(64)}?view=1`);
    await expect(pdfModal.getByRole("link",{name:"다운로드",exact:true})).toHaveAttribute("href",`/api/trips/${trip.id}/documents/${"a".repeat(64)}`);
    await pdfModal.getByRole("button",{name:"작게 보기",exact:true}).click();
    await page.screenshot({path:new URL(`pdf-modal-${label}.png`,output).pathname});
    await page.keyboard.press("Escape");
    await expect(pdfModal).toHaveCount(0); await expect(pdfTrigger).toBeFocused();
    pdfFailure = true; await pdfTrigger.click();
    await expect(pdfModal.getByRole("alert")).toBeVisible();
    pdfFailure = false; await pdfModal.getByRole("button",{name:"다시 시도",exact:true}).click();
    await expect(pdfModal.getByRole("img",{name:"UNPLAN 예약 확인.pdf · 1페이지"})).toBeVisible();
    await pdfModal.getByRole("button",{name:"PDF 미리보기 닫기"}).click();
    await expect(pdfTrigger).toBeFocused();
    await expect(card.getByRole("link",{name:"Trip.com 예약 목록"})).toHaveAttribute("href","https://kr.trip.com/order/hotel?wkp=1");
    await expect(card).toContainText("예약 확정 · 결제 완료");
    await expect(card.getByRole("link",{name:"구글지도",exact:true})).toBeVisible();
    await page.evaluate(()=>Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async text=>{window.__copiedPlace=text}}}));
    await card.getByRole("button",{name:"콜로세움 복사",exact:true}).click();
    await expect(card.getByRole("button",{name:"콜로세움 복사",exact:true})).toContainText("복사됨");
    assert.equal(await page.evaluate(()=>window.__copiedPlace),"콜로세움");
    const calendarDownload=page.waitForEvent("download");
    await card.getByRole("button",{name:"캘린더에 추가",exact:true}).click();
    const calendar=await calendarDownload;
    assert.match(calendar.suggestedFilename(),/\.ics$/);
    assert.ok((await readFile(await calendar.path(),"utf8")).includes("DTSTART:20261001T010000Z"));
    const photoPicker=card.getByLabel("장소 사진 선택",{exact:true});
    await expect(photoPicker).toBeEnabled();
    await photoPicker.setInputFiles({name:"local-fixture.png",mimeType:"image/png",buffer:imageBody});
    const photoButton=card.getByRole("button",{name:"local-fixture.png 사진 보기",exact:true});
    await expect(photoButton.getByRole("img")).toBeVisible();
    await photoPicker.setInputFiles({name:"local-fixture.png",mimeType:"image/png",buffer:imageBody});
    await expect(photoButton).toHaveCount(1);
    await photoButton.click();
    const localViewer=page.getByRole("dialog",{name:"local-fixture.png 사진",exact:true});
    await expect.poll(()=>localViewer.getByRole("img").evaluate(image=>image.complete&&image.naturalWidth)).toBe(300);
    await localViewer.getByRole("button",{name:"확대",exact:true}).click();
    await expect(localViewer.getByRole("button",{name:"확대",exact:true})).toHaveAttribute("aria-pressed","true");
    await localViewer.getByRole("button",{name:"사진 닫기",exact:true}).click();

    await page.screenshot({path:new URL(`attachments-${label}.png`,output).pathname});
    await card.getByRole("button",{name:"장소 정보 닫기"}).click();
    await openPlan();
    await sheet.getByRole("button",{name:/트레비 분수$/}).click();
    await expect(card.getByRole("region",{name:"예약 및 첨부 자료"})).toHaveCount(0);
    await expect(card.getByRole("button",{name:"local-fixture.png 사진 보기",exact:true})).toHaveCount(0);
    await card.getByRole("button",{name:"장소 정보 닫기"}).click();
    await openPlan();await sheet.getByRole("button",{name:/콜로세움$/}).click();
    await expect(card.getByRole("button",{name:"local-fixture.png 사진 보기",exact:true})).toBeVisible();
    await card.getByRole("button",{name:"local-fixture.png 연결 해제",exact:true}).click();
    await expect(card.getByRole("button",{name:"local-fixture.png 사진 보기",exact:true})).toHaveCount(0);
    await card.getByRole("button",{name:"전체 일정 보기",exact:true}).click();await expect(card).toHaveCount(0);
    await openPlan();await sheet.locator(".workspace-days").getByRole("button",{name:/^1일차/}).click();
    if(width<1024)await page.getByRole("button",{name:"지도",exact:true}).click();
    await page.getByRole("button",{name:"Day 패널 접기",exact:true}).click();
    await expect(page.locator(".trip-workspace")).toHaveAttribute("data-day-collapsed","true");
    await page.reload({waitUntil:"networkidle"});
    await expect(page.locator(".trip-workspace")).toHaveAttribute("data-day-collapsed","true");
    if(width>=1024)await expect(sheet).toBeHidden();
    await page.getByRole("button",{name:"Day 패널 펼치기",exact:true}).click();
    await expect(page.locator(".trip-workspace")).toHaveAttribute("data-day-collapsed","false");
    if (width < 1024 && await tabsNav.isVisible()) await tapMap();
    if (width < 1024) { await expect(tabsNav).toBeHidden(); await expect(sheet).toBeHidden(); await expect(page.getByRole("region", { name: "오늘의 일정" })).toContainText("Day 1"); }
    if (width < 1024) {
      const overlay = page.getByRole("region", { name: "오늘의 일정" });
      await expect(overlay).toContainText("10/1 목 · 오늘");
      await expect(overlay.getByRole("button", { name: "이전 날", exact: true })).toBeEnabled();
      await overlay.getByRole("button", { name: "이전 날", exact: true }).click();
      await expect(overlay).toContainText("출국 전날");
      await expect(overlay.getByRole("button", { name: "이전 날", exact: true })).toBeDisabled();
      await overlay.getByRole("button", { name: "출국 전날 Todo", exact: true }).click();
      await expect(todoModal.getByRole("checkbox",{name:"여권·지갑·결제 카드 챙기기"})).toBeChecked();
      await page.keyboard.press("Escape");
      await overlay.getByRole("button", { name: "다음 날", exact: true }).click();
      if (engine === chromium) {
        const cdp = await context.newCDPSession(page);
        const gesture = async (dx, dy = 0, selector = ".day-overlay") => {
          const box = await page.locator(selector).boundingBox();
          const x = box.x + (dx < 0 ? box.width - 24 : 24), y = box.y + 28;
          await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
          for (let step = 1; step <= 6; step++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + dx * step / 6, y: y + dy * step / 6 }] });
          await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        };
        await gesture(-130);
        await expect(overlay).toContainText("Day 2");
        await expect(overlay).toHaveAttribute("data-open", "true");
        await expect(overlay.getByRole("button", { name: "다음 날", exact: true })).toBeDisabled();
        await gesture(-130); await expect(overlay).toContainText("Day 2");
        await gesture(130); await expect(overlay).toContainText("Day 1");
        await gesture(-15, 80); await expect(overlay).toContainText("Day 1");
        await gesture(-20); await expect(overlay).toContainText("Day 1");
        await cdp.detach();
      } else {
        await overlay.getByRole("button", { name: "다음 날", exact: true }).click();
        await expect(overlay).toContainText("Day 2");
        await overlay.getByRole("button", { name: "이전 날", exact: true }).click();
      }
      await page.clock.setFixedTime(new Date("2026-10-02T03:00:00Z"));
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect(overlay).toContainText("Day 1"); // Manual day choice survives the date refresh.
      await expect(overlay).not.toContainText("· 오늘");
      await overlay.getByRole("button", { name: "다음 날", exact: true }).click();
      await expect(overlay).toContainText("10/2 금 · 오늘");
      await overlay.getByRole("button", { name: "이전 날", exact: true }).click();
    }
    await page.clock.setFixedTime(new Date());
    await revealTabs();
    await page.getByRole("heading", { name: trip.title }).waitFor();
    if (width < 1024) {
      await openPlan();
      await handle.focus(); await page.keyboard.press("ArrowDown"); await expect(sheet).toBeHidden(); await expect(tabsNav).toBeHidden();
      await openPlan();
      const box = await handle.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y + height * .65, { steps: 10 }); await page.mouse.up();
      await expect(sheet).toBeHidden();
      await openPlan();
      await page.getByRole("button", { name: "전체", exact: true }).click();
    }
    // Clearing completed stops restores the remaining route and cached road geometry.
    await sheet.getByRole("button",{name:"콜로세움 일정 완료",exact:true}).click();
    await sheet.getByRole("button",{name:"트레비 분수 일정 완료",exact:true}).click();
    await expect(mapStage).toHaveAttribute("data-road-routes","2");
    await page.getByRole("button", { name: "전체 경로 따라가기", exact: true }).click();
    await expect(page.locator(".trip-workspace")).toHaveAttribute("data-playing", "true");
    await page.locator(".trip-moving-marker").waitFor();
    await page.getByRole("button", { name: "경로 재생 멈추기", exact: true }).click();
    await expect(page.locator(".trip-workspace")).toHaveAttribute("data-playing", "false");
    await expect(page.locator(".trip-moving-marker")).toHaveCount(0);
    await openPlan();
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
      await expect(page.locator(".trip-workspace")).toHaveAttribute("data-tab", "map");
      await expect(sheet).toBeHidden();
    }
    await page.screenshot({ path: new URL(`map-${label}.png`, output).pathname });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "map no overflow");
    if (width < 1024) {
      await revealTabs(); await page.getByRole("button", { name: "채팅", exact: true }).click();
      await page.getByPlaceholder("여행에 대해 말해보세요").fill("가는 길에 카페를 추가해 줘");
      await page.getByRole("button", { name: "지도", exact: true }).click();
      await revealTabs(); await page.getByRole("button", { name: "채팅", exact: true }).click();
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
    { const copied = await page.evaluate(()=>window.__copiedSetup); assert.ok(copied.includes(`${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3002"}/docs/codex/install`), `copied setup quotes this server's install guide: ${copied}`); }
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
    await page.goto(`${origin}/workspace-offline-check?view=resources`,{waitUntil:"networkidle"});
    await page.getByRole("button",{name:"PDF 보기: UNPLAN 예약 확인.pdf"}).click();
    await expect(pdfModal.getByRole("img",{name:"UNPLAN 예약 확인.pdf · 1페이지"})).toBeVisible();
    await pdfModal.getByRole("button",{name:"PDF 미리보기 닫기"}).click();
    await page.getByRole("button",{name:`이미지 보기: ${imageFixture.name}`,exact:true}).click();
    await expect.poll(()=>imageModal.getByRole("img").evaluate(image=>image.complete&&image.naturalWidth)).toBe(300);
    await imageModal.getByRole("button",{name:"이미지 뷰어 닫기",exact:true}).click();
    const koreanCard=page.locator(".trip-resources article").filter({hasText:"서울 숙소"});
    await expect(koreanCard.getByRole("link",{name:"네이버지도",exact:true})).toHaveAttribute("href",`https://map.naver.com/p/search/${encodeURIComponent("서울 숙소")}`);
    await expect(koreanCard.getByRole("link",{name:"카카오맵",exact:true})).toHaveAttribute("href",`https://map.kakao.com/link/map/${encodeURIComponent("서울 숙소")},37.5665,126.978`);
    await expect(koreanCard.getByRole("link",{name:"카카오 길찾기",exact:true})).toHaveAttribute("href",`https://map.kakao.com/link/to/${encodeURIComponent("서울 숙소")},37.5665,126.978`);
    await expect(koreanCard.getByRole("link",{name:"구글지도",exact:true})).toHaveCount(0);
    await page.evaluate(()=>Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async()=>{throw new Error("denied")}}}));
    await koreanCard.getByRole("button",{name:"서울 숙소 복사",exact:true}).click();
    await expect(koreanCard.getByRole("status")).toContainText("이름을 길게 눌러");
    await expect(koreanCard).not.toContainText("복사됨");
    assert.deepEqual(errors, []);
    await checkWebManagement({page,origin,management,pdfBody,output,label,tripId:trip.id,resetLedger:()=>{ledger=structuredClone(empty);},getLedger:()=>ledger});
    assert.deepEqual(errors,[]);
    checks.push({ viewport: label, nativeParity:true, optimisticChecksAndRemainingRoutes:true, dayProgressRules:true, todoPanelDraftAndResize:true, calendarFile:true, localPhotos:true, managementAndHistory:true, dayOneSharedTodo: true, progressManualReloadAndFailure: true, progressTimeAndManualOverride: true, progressLocationDeniedAccuracyCompletionStop: true, privateImageViewer: true, imageZoomSourceDownloadRetry: true, dayZeroTodo: true, todoPersistConflictRetry: true, placeCopy: true, domesticMaps: true, playbackAndStop: true, mobileSheet: width < 1024, bookmark: true, addErrorAndRetry: true, budgetCreateEditDelete: true, conflictDraftPreserved: true, serverErrorDraftPreserved: true, overflow: false, pageErrors: errors, mocked: true });
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
