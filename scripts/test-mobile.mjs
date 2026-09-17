import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { chromium, webkit, expect } from '@playwright/test';
import { sessionCookie, testOwner } from './test-auth-fixture.mjs';

const base = process.env.MOBILE_BASE_URL ?? 'http://127.0.0.1:3106';
const auth = process.env.MOBILE_AUTH !== 'false';
const output = process.env.MOBILE_OUTPUT ?? 'assets/validation/mobile';
const trip = auth ? JSON.parse(await readFile('.private/mobile-trip.json', 'utf8')).tripId : null;
await mkdir(output, { recursive: true });
const reports = [];
const sizes = [[320,568],[360,740],[390,844],[430,932],[768,1024],[844,390],[1024,768]];
const fit = async page => {
  const dimensions = await page.evaluate(() => ({ width: innerWidth, doc: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  assert.ok(dimensions.doc <= dimensions.width + 1 && dimensions.body <= dimensions.width + 1, `${page.url()} ${JSON.stringify(dimensions)}`);
};
async function keyboard(page, height) {
  await page.evaluate(value => {
    Object.defineProperty(window.visualViewport, 'height', { configurable: true, get: () => value });
    window.visualViewport.dispatchEvent(new Event('resize'));
  }, height);
  await expect.poll(() => page.evaluate(() => Math.round(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--visible-height'))))).toBe(height);
}
for (const [engine, browserType] of [['chromium', chromium], ['webkit', webkit]].filter(([name]) => !process.env.MOBILE_ENGINE || name === process.env.MOBILE_ENGINE)) {
 const browser = await browserType.launch({ headless: true, ...(engine === 'chromium' ? { channel: 'chrome' } : {}) });
 try {
  for (const [width,height] of sizes) {
   const context = await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
   if(auth) await context.addCookies([sessionCookie(testOwner)]);
   const page = await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base, {waitUntil:'networkidle'});await fit(page);
   if (width < 768 || (width < 1024 && height < 500)) {
    await expect(page.locator('.globe-arrival')).toHaveAttribute('data-ready','true');
    const hero=await page.locator('.hero-grid').boundingBox();
    assert.ok(hero.y+hero.height<=height+1,`${width}×${height}: hero fits one screen`);
    for(const selector of ['.hero-copy h1','.destination-picker summary','.globe-regions','.globe-bottom']) {
     const box=await page.locator(selector).boundingBox();
     assert.ok(box.y>=0&&box.y+box.height<=height+1,`${selector} outside phone viewport`);
    }
    const copy=await page.locator('.hero-copy').boundingBox(),picker=await page.locator('.destination-picker').boundingBox();
    assert.ok(copy.y+copy.height+4<=picker.y,`${width}×${height}: invitation overlaps chooser`);
    if(width===320||width===390||width===844)await page.screenshot({path:`${output}/${engine}-globe-${width}.png`});
   }
   if(width<768) {
    await page.getByLabel('메뉴 열기',{exact:true}).click();
    await expect(page.getByRole('navigation',{name:'모바일 주 메뉴'})).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.mobile-nav')).not.toHaveAttribute('open');
   }
   await page.locator('.destination-picker summary').click();
   if(width<1024) {
    await expect(page.getByRole('dialog',{name:'여행지 선택'})).toBeVisible();
    const panel = await page.getByRole('dialog').boundingBox();assert.ok(panel.y>=0&&panel.y+panel.height<=height+1);
    await expect(page.getByRole('textbox',{name:'도시 또는 나라 검색'})).toHaveCSS('font-size','16px');
    if(width===390) {
     await page.getByRole('textbox',{name:'도시 또는 나라 검색'}).focus();await keyboard(page,360);
     const shrunk=await page.getByRole('dialog').boundingBox();assert.ok(shrunk.y+shrunk.height<=361);
     await keyboard(page,height);
    }
   }
   await page.getByRole('textbox',{name:'도시 또는 나라 검색'}).fill('부에노스아이레스');
   await page.getByRole('button',{name:'부에노스아이레스 여행 선택',exact:true}).click();
   await expect(page.locator('.destination-picker summary')).toContainText('부에노스아이레스');
   await page.getByRole('button',{name:'부에노스아이레스 여행 둘러보기',exact:true}).click();
   await expect(page.getByRole('heading',{name:'말하면, 여행이 바뀌니까.',exact:true})).toBeVisible();await fit(page);
   if(width<768||(width<1024&&height<500)) {
    const controls=await page.locator('.conversation-toolbar').boundingBox(),card=await page.locator('.conversation-panel').boundingBox();
    assert.ok(card.y+card.height<=height+1,`${width}: itinerary card stays in viewport`);
    assert.ok(!(card.x<controls.x+controls.width&&card.x+card.width>controls.x&&card.y<controls.y+controls.height&&card.y+card.height>controls.y),`${width}: conversation overlaps toolbar`);
   }
   if(width===320||width===844) await page.screenshot({path:`${output}/${engine}-landing-${width}.png`});
   for(const path of ['/login','/pricing','/docs/mcp']) {
    await page.goto(base+path,{waitUntil:'networkidle'});await fit(page);
    if(width<768&&path==='/pricing') {await page.getByLabel('메뉴 열기',{exact:true}).click();await expect(page.getByRole('navigation',{name:'모바일 주 메뉴'})).toBeVisible();await page.keyboard.press('Escape');}
    if(width<768&&path==='/docs/mcp') await expect(page.getByRole('navigation',{name:'앱 메뉴'})).toBeVisible();
   }
   if(auth) {
    for(const path of ['/app',`/app/${trip}/resources`,`/app/${trip}/cost`,`/app/${trip}/settings`,'/app/settings/keys','/app/settings/import']) {await page.goto(base+path,{waitUntil:'networkidle'});await fit(page);}
    await page.goto(`${base}/app/${trip}`,{waitUntil:'networkidle'});await fit(page);
    if(width<1024) {
     // 지도만 보이는 화면. 오늘의 일정 오버레이만 떠 있고, 조작부는 빈 지도를 눌러야 나온다.
     const tabsNav=page.getByRole('navigation',{name:'여행 화면'});
     await expect(tabsNav).toBeHidden();
     await expect(page.getByRole('region',{name:'오늘의 일정'})).toBeVisible();
     // 마커·오버레이·버튼이 없는 지도 빈 곳을 찾아 누른다 (화면 크기마다 배치가 다르다).
     const tapMap=async()=>{ const spot=await page.evaluate(()=>{ const canvas=document.querySelector('.workspace-map canvas'); for(let y=.3;y<=.8;y+=.1) for(let x=.3;x<=.9;x+=.1){ const px=Math.round(innerWidth*x),py=Math.round(innerHeight*y); if(document.elementFromPoint(px,py)===canvas) return {x:px,y:py}; } return null; }); assert.ok(spot,'no free map spot'); await page.mouse.click(spot.x,spot.y); };
     const revealTabs=async()=>{ if(!await tabsNav.isVisible()) await tapMap(); await expect(tabsNav).toBeVisible(); };
     await revealTabs();
     const tabs=await page.locator('.workspace-tabs').boundingBox();assert.ok(tabs.y+tabs.height<=height+1);
     await tapMap();await expect(tabsNav).toBeHidden();
     await revealTabs();
     await expect(page.locator('.workspace-toolbar')).toBeHidden();
     await page.getByLabel('더보기',{exact:true}).click();
     const more=page.getByRole('navigation',{name:'여행 도구 메뉴'});
     await expect(more).toBeVisible();
     for(const name of ['예산','자료·맛집','여행 설정']) await expect(more.getByRole('link',{name})).toBeVisible();
     const menu=await more.boundingBox();assert.ok(menu.y>=0&&menu.y+menu.height<=height+1,`${width}×${height}: more menu inside viewport`);
     await page.keyboard.press('Escape');await expect(more).toBeHidden();
     await page.getByRole('button',{name:'일정',exact:true}).click();
     await page.getByRole('button',{name:'전체',exact:true}).click();
     await page.getByRole('button',{name:'울산역 (KTX) 수정',exact:true}).click();
     await expect(page.getByRole('heading',{name:'일정 수정',exact:true})).toBeInViewport();
     await page.getByRole('button',{name:'지도',exact:true}).click();
     await expect(page.getByRole('heading',{name:'일정 수정',exact:true})).toBeInViewport();
     await page.getByRole('button',{name:'닫기',exact:true}).click();
     await page.getByRole('button',{name:'지도',exact:true}).click();
     await expect.poll(async()=>Math.round((await page.locator('.workspace-map canvas').boundingBox()).height)).toBeGreaterThan(80);
     await expect(tabsNav).toBeHidden();await revealTabs();
     await page.getByRole('button',{name:'채팅',exact:true}).click();
     const input=page.getByRole('textbox',{name:'아이로에게 보낼 메시지'});
     await input.fill('가족과 함께 가는 여행 일정을 조금 여유롭게 정리해줘');
     await expect(input).toHaveCSS('font-size','16px');
     if(width===390) {
      await input.focus();await keyboard(page,360);
      await expect(page.locator('html')).toHaveAttribute('data-keyboard-open','true');
      const composer=await page.locator('.chat-composer').boundingBox();assert.ok(composer.y>=0&&composer.y+composer.height<=361);
      await page.screenshot({path:`${output}/${engine}-keyboard.png`});
      await page.getByRole('button',{name:'지도로',exact:true}).click();
      await expect(page.locator('.workspace-map canvas')).toBeVisible();
      await keyboard(page,height);
      await revealTabs();await page.getByRole('button',{name:'채팅',exact:true}).click();
      assert.equal(await input.inputValue(),'가족과 함께 가는 여행 일정을 조금 여유롭게 정리해줘','draft survives leaving the chat');
     }
     if(width===320||width===844)await page.screenshot({path:`${output}/${engine}-chat-${width}.png`});
     await fit(page);
    }
   }
   assert.deepEqual(errors,[],`${engine} ${width}: browser errors`);
   reports.push({engine,width,height,publicPages:4,accountPages:auth?7:0,search:true,keyboard:width===390,overflow:false});
   console.log(`✓ ${engine} ${width}×${height}: menus, search, pages${auth?', workspace and inputs':''}`);
   await context.close();
  }
 } finally {await browser.close();}
}
await writeFile(`${output}/checks.json`,JSON.stringify({base,checkedAt:new Date().toISOString(),reports},null,2));
