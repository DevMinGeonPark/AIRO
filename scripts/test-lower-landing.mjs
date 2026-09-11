import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit, expect } from '@playwright/test';
const base = process.env.LANDING_BASE_URL ?? 'http://127.0.0.1:3018';
const out = process.env.LOWER_OUTPUT ?? 'assets/validation/lower/final';
await mkdir(out, { recursive: true });
const checks = [], errors = [];
const cities = [{ id: 'kyoto', name: '교토', en: 'KYOTO' }, ...JSON.parse(await readFile('src/lib/landing-destinations.json', 'utf8'))];
const editorial = JSON.parse(await readFile('src/lib/landing-editorial.json', 'utf8'));
const scopes = ['.lower-conversation', '.lower-routes', '.lower-materials', '.lower-integration', '.lower-finale'];
const mapState = el => {
  let fiber = el[Object.keys(el).find(key => key.startsWith('__reactFiber'))];
  for (; fiber; fiber = fiber.return) for (let hook = fiber.memoizedState; hook; hook = hook.next) {
    const map = hook.memoizedState;
    if (map?.getStyle) {
      const style = map.getStyle(), source = style.sources['route-source-lower-itinerary'];
      return { count: source?.data?.geometry?.coordinates?.length ?? 0, route: source?.data?.geometry?.coordinates, visible: map.queryRenderedFeatures({ layers: style.layers.some(l => l.id === 'route-layer-lower-itinerary') ? ['route-layer-lower-itinerary'] : [] }).length, city: style.sources.city.data };
    }
  }
  return { count: 0, visible: 0 };
};
for (const [name, engine, widths] of [['chrome', chromium, [1478, 1024, 768, 390, 320]], ['webkit', webkit, [1440, 768, 390, 320]]]) {
 const browser = await engine.launch({ headless: true, ...(name === 'chrome' ? { channel: 'chrome' } : {}) });
 try {
  for (const width of widths) {
   const p = await browser.newPage({ viewport: { width, height: width >= 768 ? 1000 : 844 }, reducedMotion: 'reduce' });
   p.on('pageerror', e => errors.push(`${name}/${width}: ${e.message}`));
   p.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) errors.push(`${r.status()} ${r.url()}`); });
   await p.goto(base, { waitUntil: 'networkidle' });
   await expect(p.locator('.globe-arrival')).toHaveAttribute('data-ready', 'true');
   await expect(p.locator('.landing-nav')).toHaveCount(1);
   await expect(p.locator('.nav-start')).toHaveCount(0);
   const lower = p.locator('.landing-lower');
   for (const bad of ['01 / FROM A THOUGHT', '하루의 흐름이, 한눈에.', '설렘만 챙겨요. 나머지는 여기에.']) assert.ok(!(await lower.innerText()).includes(bad));
   for (const selector of scopes) {
    await p.locator(selector).scrollIntoViewIfNeeded();
    await expect.poll(() => p.locator(selector+' img').evaluateAll(images => images.filter(i => i.getClientRects().length).every(i => i.complete && i.naturalWidth > 0))).toBe(true);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${selector}/${width} overflow`);
    const outside = await p.locator(selector).locator('button,a,h2,h3,h4').evaluateAll(elements => elements.filter(e => { const b = e.getBoundingClientRect(); return b.width && (b.left < -1 || b.right > innerWidth + 1); }).map(e => e.textContent));
    assert.deepEqual(outside, [], `${selector} controls/text out of viewport`);
   }
   for (const selector of ['#lower-route-title', '#lower-material-title']) assert.equal(await p.locator(selector).evaluate(e => getComputedStyle(e).fontStyle), 'normal');
   assert.match(await p.locator('.lower-conversation h2 span').evaluate(e => getComputedStyle(e).fontFamily), /AIRO Lower Serif/);
   assert.ok(await p.evaluate(() => document.fonts.check('16px "AIRO Lower Serif"', '여행이 되는 순간.')));
   await p.locator('.lower-conversation').scrollIntoViewIfNeeded();
   assert.deepEqual(await p.locator('.lower-generated-stops h4').allTextContents(), ['판테온', '골목 안 작은 카페', '트레비 분수']);
   await p.getByRole('button', { name: '조금 더 여유롭게 바꾸는 예시 보기' }).click();
   assert.deepEqual(await p.locator('.lower-generated-stops time').allTextContents(), ['10:00', '11:30', '13:30']);
   await p.getByRole('button', { name: '처음 예시 일정 다시 보기' }).click();
   for (let day = 2; day >= 0; day--) {
    await p.getByRole('tablist', { name: '대화 예시 날짜 선택' }).getByRole('tab').nth(day).click();
    await expect(p.locator('.lower-generated-stops')).toHaveAttribute('data-day', String(day+1));
   }
   await p.locator('.lower-routes').scrollIntoViewIfNeeded();
   const routes=[];
   for (let day = 0; day < 3; day++) {
    await p.getByRole('tablist', { name: '지도 날짜 선택' }).getByRole('tab').nth(day).click();
    await expect(p.locator('.lower-map-canvas')).toHaveAttribute('data-day', String(day+1));
    await expect.poll(async () => (await p.locator('.lower-map-canvas').evaluate(mapState)).count, {timeout:10000}).toBeGreaterThan(10);
    await expect.poll(async () => (await p.locator('.lower-map-canvas').evaluate(mapState)).visible, {timeout:10000}).toBeGreaterThan(0);
    routes.push(JSON.stringify((await p.locator('.lower-map-canvas').evaluate(mapState)).route));
    for (let stop=0; stop<3; stop++) {
     const list=p.locator('.lower-route-stops button').nth(stop);const expected=await list.locator('h4').innerText();await list.click();
     await expect(p.locator('.lower-place-card h4')).toHaveText(expected);
     await expect(p.locator('.lower-map-pin').nth(stop)).toHaveAttribute('aria-pressed','true');
     await p.locator('.lower-map-pin').nth((stop+1)%3).click();
     await expect(p.locator('.lower-route-stops button').nth((stop+1)%3)).toHaveAttribute('aria-pressed','true');
    }
   }
   assert.equal(new Set(routes).size, 3, 'Dates have different geographic routes');
   await p.getByRole('button',{name:'선택한 장소 카드 닫기'}).click();await expect(p.locator('.lower-place-card')).toHaveCount(0);
   await p.locator('.lower-map-pin').first().click();await expect(p.locator('.lower-place-card')).toBeVisible();
   await p.locator('.lower-materials').scrollIntoViewIfNeeded();
   await p.getByRole('button',{name:'예시 장소 북마크 해제'}).click();await expect(p.locator('.lower-material-status')).toContainText('해제');
   await p.getByRole('button',{name:'예시 장소 북마크 저장'}).click();
   await p.getByRole('group',{name:'여행 자료 종류'}).getByRole('button',{name:'예산',exact:true}).click();await expect(p.locator('.lower-material-status')).toContainText('예시 예산');
   const downloadWait=p.waitForEvent('download');await p.getByRole('link',{name:'숙소 예약 확인서 예시 PDF 내려받기'}).click();const download=await downloadWait;assert.match(download.suggestedFilename().normalize("NFC"),/예시.pdf$/);assert.equal(await download.failure(),null);
   for(let tool=0;tool<6;tool++){await p.getByRole('tablist',{name:'AI 도구 연동 미리보기'}).getByRole('tab').nth(tool).click();await expect(p.locator('.lower-tool-chat header')).toContainText(['ChatGPT','Claude Code','Cursor','Codex','Claude','ChatGPT'][tool]);await expect(p.locator('.lower-mcp-inserted')).toBeVisible();await expect(p.locator('.lower-tool-reply')).toHaveText('아이로에 반영했어요.');}
   await p.getByRole('tablist',{name:'AI 도구 연동 미리보기'}).getByRole('tab').last().press('Home');await expect(p.getByRole('tab',{name:'ChatGPT 데스크톱',exact:true})).toBeFocused();
   const foot=p.locator('.lower-footer');await expect(foot.getByRole('link',{name:/이용약관|개인정보/})).toHaveCount(0);await expect(foot).toContainText('개인정보처리방침 준비 중');
   const pdf=await p.request.get(base+'/examples/airo-reservation-sample.pdf');assert.equal(pdf.status(),200);assert.equal((await pdf.body()).subarray(0,4).toString(),'%PDF');
   await p.getByRole('tablist',{name:'지도 날짜 선택'}).getByRole('tab').first().click();
   await p.getByRole('group',{name:'여행 자료 종류'}).getByRole('button').first().click();
   for(const selector of scopes){await p.locator(selector).scrollIntoViewIfNeeded();await p.waitForTimeout(600);await p.locator(selector).screenshot({path:`${out}/${selector.slice(1)}-${name}-${width}.png`,style:'.landing-nav,.skip-link{visibility:hidden!important}'})}
   await foot.screenshot({path:`${out}/footer-${name}-${width}.png`});
   checks.push({engine:name,width,dayTabs:true,roadRoutes:3,linkedPinSelections:9,photoCards:true,bookmark:true,samplePdf:true,aiTabs:6,overflow:false,reducedMotion:true});console.log(`✓ ${name} ${width}: lower layout, 3 road routes, 9 pin/list selections, materials, MCP tabs`);
   await p.close();
  }
  const p=await browser.newPage({viewport:{width:name==='chrome'?1440:390,height:900},reducedMotion:'reduce'});p.on('pageerror',e=>errors.push(e.message));await p.goto(base,{waitUntil:'networkidle'});
  for (const city of cities){await p.locator('.destination-picker summary').click();await p.getByRole('textbox',{name:'도시 또는 나라 검색'}).fill(city.name);await p.getByRole('button',{name:`${city.name} 여행 선택`,exact:true}).click();await expect(p.locator('.landing-lower')).toHaveAttribute('data-destination',city.id);await expect(p.locator('.lower-trip-banner h3')).toHaveText(editorial[city.id].featureTitle);await expect(p.locator('.lower-route-schedule h3')).toHaveText(`느긋하게, ${city.name}`);await expect(p.locator('.lower-notebook h3')).toHaveText(`${city.name} 여행 노트`);await expect(p.locator('.lower-connected-trip h3')).toHaveText(`${city.name}의 둘째 날`);assert.equal(await p.locator('.lower-finale>img').getAttribute('alt'),editorial[city.id].featureImageAlt);}
  checks.push({engine:name,cityContexts:cities.length});console.log(`✓ ${name}: all ${cities.length} selected cities update all five sections`);await p.close();
 } finally {await browser.close()}
}
assert.deepEqual(errors, []);await writeFile(`${out}/checks.json`,JSON.stringify({base,checks,errors},null,2));
