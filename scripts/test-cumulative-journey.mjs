import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,webkit,expect} from '@playwright/test';
const base=process.env.LANDING_BASE_URL??'http://127.0.0.1:3018';
const output=process.env.JOURNEY_OUTPUT??'assets/validation/city-stories/journey';
await mkdir(output,{recursive:true});const checks=[],errors=[];
for(const [engine,type,width,height,motion] of [['chrome',chromium,1440,900,'no-preference'],['webkit',webkit,390,844,'reduce'],['chrome',chromium,320,568,'reduce']]) {
 const browser=await type.launch({headless:true,...(engine==='chrome'?{channel:'chrome'}:{})});
 try {
  const page=await browser.newPage({viewport:{width,height},reducedMotion:motion});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'networkidle'});await expect(page.locator('.globe-arrival')).toHaveAttribute('data-ready','true');
  await page.locator('.destination-picker summary').click();await page.getByRole('textbox',{name:'도시 또는 나라 검색'}).fill('카이로');await page.getByRole('button',{name:'카이로 여행 선택',exact:true}).click();
  await page.getByRole('button',{name:'카이로 여행 둘러보기',exact:true}).click();
  await expect(page.locator('.journey-welcome')).toContainText('어디를 가시겠어요?',{timeout:15000});
  await page.evaluate(()=>window.__journeyCanvas=document.querySelector('.maplibregl-canvas'));
  await page.locator('.journey-destination-choice').first().click();await expect(page.locator('.conversation-demo')).toHaveAttribute('data-phase','ready',{timeout:8000});
  const camera=await page.locator('.globe-mapcn').getAttribute('data-camera');const added=[];
  for(const category of ['restaurant','cafe','dessert']) {
   const previousRoute=await page.locator('.dining-saved-route').count()?await page.locator('.dining-saved-route').getAttribute('d'):null;
   if(category === "cafe") { await page.locator(".conversation-compose input").fill("카페도 추가해줘"); await page.getByRole("button",{name:"메시지 보내기",exact:true}).click(); await expect(page.locator(".conversation-demo")).toHaveAttribute("data-category","cafe"); }
   else await page.locator(`.conversation-categories button[data-category="${category}"]`).click();
   if(previousRoute) assert.equal(await page.locator('.dining-saved-route').getAttribute('d'),previousRoute,'Browsing does not replace existing route');
   const choice=page.locator('.dining-choice:not([disabled])').first();const name=await choice.locator('strong').innerText();
   await choice.click();await page.getByRole('button',{name:'메시지 보내기',exact:true}).click();
   added.push(name);
   await expect(page.locator('.conversation-demo')).toHaveAttribute('data-saved-count',String(added.length));
   if(added.length>1) assert.ok(Number(await page.locator('.dining-saved-route').getAttribute('data-start-progress'))>0,'The moving light resumes at the previous saved stop');
   await expect(page.locator('.conversation-demo')).toHaveAttribute('data-phase','saved',{timeout:8000});
   for(const name of added) await expect(page.locator('.journey-current-stops')).toContainText(name);
   const names=await page.locator('.dining-saved-stops li[data-place-id]').allTextContents();assert.deepEqual(names.map(n=>n.replace(/\d+번째$/,'')),added);
   assert.equal(await page.locator('.globe-mapcn').getAttribute('data-camera'),camera);
  }
  const oldRoute=await page.locator('.dining-saved-route').getAttribute('d');
  await page.getByRole('button',{name:'목적지 변경',exact:true}).click();
  await expect(page.locator('.journey-welcome')).toContainText('추가한 장소는 그대로');
  assert.equal(await page.locator('.dining-saved-route').getAttribute('d'),oldRoute);
  await page.getByRole('button',{name:'변경 취소',exact:true}).click();assert.equal(await page.locator('.dining-saved-route').getAttribute('d'),oldRoute);
  await page.getByRole('button',{name:'목적지 변경',exact:true}).click();await page.locator('.journey-destination-choice').last().click();
  await expect(page.locator('.conversation-demo')).toHaveAttribute('data-phase','saved',{timeout:8000});
  assert.equal(await page.locator('.conversation-demo').getAttribute('data-saved-count'),'3');
  for(const name of added) await expect(page.locator('.dining-saved-stops')).toContainText(name);
  assert.notEqual(await page.locator('.dining-saved-route').getAttribute('d'),oldRoute);
  assert.equal(await page.locator('.globe-mapcn').getAttribute('data-camera'),camera);
  assert.ok(await page.evaluate(()=>window.__journeyCanvas===document.querySelector('.maplibregl-canvas')));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:`${output}/${engine}-${width}-three-stops.png`});
  await page.getByRole('button',{name:'대화 처음부터 보기',exact:true}).click();await expect(page.locator('.conversation-demo')).toHaveAttribute('data-saved-count','0');await expect(page.locator('.dining-saved-route')).toHaveCount(0);
  checks.push({engine,width,height,orderedStops:added,preservedOnDestinationChange:true,resumesAtPreviousStop:true,sameCamera:true});console.log(`✓ ${engine} ${width}: food → cafe → dessert, destination change/cancel, continuous animation, reset`);
 } finally {await browser.close();}
}
assert.deepEqual(errors,[]);await writeFile(`${output}/checks.json`,JSON.stringify({checks,errors},null,2));
