import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit, expect } from '@playwright/test';
const base=process.env.LANDING_BASE_URL ?? 'http://127.0.0.1:3018';
const output=process.env.CHOICE_OUTPUT ?? 'assets/validation/choice/flow';
await mkdir(output,{recursive:true});
const checks=[],errors=[];
for(const [engine,type,width,height,moving] of [['chrome',chromium,1440,900,true],['webkit',webkit,390,844,true],['chrome',chromium,320,568,false],['webkit',webkit,844,390,false]]) {
 if (process.env.CHOICE_WIDTH && width !== Number(process.env.CHOICE_WIDTH)) continue;
 const browser=await type.launch(engine==='chrome'?{channel:'chrome'}:{});
 try {for(const city of ['카이로','리마']) {
  const page=await browser.newPage({viewport:{width,height},hasTouch:width<900,reducedMotion:moving&&city==='카이로'?'no-preference':'reduce'});
  page.on('pageerror',e=>errors.push(`${engine}/${width}/${city}: ${e.message}`));
  await page.goto(base,{waitUntil:'networkidle'});
  await page.locator('.destination-picker summary').click();await page.getByRole('button',{name:`${city} 여행 선택`,exact:true}).click();
  await page.getByRole('button',{name:`${city} 여행 둘러보기`,exact:true}).click();
  await expect(page.locator('.hero-section')).toHaveAttribute('data-arrival','landed',{timeout:12000});
  await expect(page.locator('.conversation-demo')).toHaveAttribute('data-phase','choosing');
  await expect(page.locator('.journey-destination-choice')).toHaveCount(2);
  await expect(page.locator('.dining-direct-route, .dining-food-pin, .conversation-categories')).toHaveCount(0);
  await expect(page.locator('.journey-welcome')).toContainText('어디를 가시겠어요?');
  assert.equal(await page.locator('.conversation-user').count(),0,'No prewritten user request before the visitor chooses');
  await page.waitForTimeout(900);
  await page.evaluate(()=>{window.__choiceMap=document.querySelector('.maplibregl-canvas');window.__choiceCamera=document.querySelector('[data-camera]').dataset.camera;window.scrollTo({top:innerHeight*.65,behavior:'instant'});});
  await page.waitForTimeout(150);
  await expect(page.locator('.conversation-demo')).toHaveAttribute('data-phase','choosing');
  const startScroll=await page.evaluate(()=>scrollY);
  if(process.env.CHOICE_TRACE) await page.evaluate(()=>{
   window.__scrollTrace=[];let old='';
   const tick=()=>{const c=document.querySelector('.conversation-demo'),s={y:scrollY,phase:c?.dataset.phase,category:c?.dataset.category,target:document.querySelector('.dining-map')?.dataset.target,focus:document.activeElement?.getAttribute('aria-label')??document.activeElement?.className,log:document.querySelector('.conversation-messages')?.scrollTop};const key=JSON.stringify(s);if(key!==old){window.__scrollTrace.push(s);old=key;}requestAnimationFrame(tick);};requestAnimationFrame(tick);
  });
  await page.screenshot({path:`${output}/${engine}-${width}-${city}-question.png`});
  const targets=await page.locator('.journey-destination-choice strong').allTextContents();
  const paths=[];
  for(let target=0;target<2;target++) {
   if(target) await page.getByRole('button',{name:'대화 처음부터 보기',exact:true}).click();
   if(target===0&&moving&&city==='카이로') {
    await page.evaluate(()=>{window.__routeFrames=[];window.__routeStop=false;const tick=t=>{const line=document.querySelector('.dining-direct-route');window.__routeFrames.push({time:t,phase:document.querySelector('.conversation-demo').dataset.phase,progress:line?Number(line.dataset.progress):null,categories:document.querySelectorAll('.conversation-categories').length,pins:document.querySelectorAll('.dining-food-pin').length});if(!window.__routeStop)window.__routeRaf=requestAnimationFrame(tick);};window.__routeRaf=requestAnimationFrame(tick);});
   }
   if(target===0&&width===320) await page.getByRole('button',{name:`${targets[target]} 지도에서 목적지 선택`,exact:true}).click();
   else {await page.getByRole('button',{name:`${targets[target]} 목적지 선택`,exact:true}).focus();await page.keyboard.press('Enter');}
   await expect(page.locator('.conversation-demo')).toHaveAttribute('data-phase','ready',{timeout:7000});
   await expect.poll(() => page.locator('.journey-quick-replies button').evaluateAll(buttons => {
    const log=document.querySelector('.conversation-messages').getBoundingClientRect();
    return buttons.length===4 && buttons.every(button=>{const r=button.getBoundingClientRect();return r.top>=log.top-1&&r.bottom<=log.bottom+1;});
   })).toBe(true);
   paths.push(await page.locator('.dining-direct-route').getAttribute('d'));
   if(target===0&&moving&&city==='카이로') {
    const frames=await page.evaluate(()=>{window.__routeStop=true;cancelAnimationFrame(window.__routeRaf);return window.__routeFrames;});
    await writeFile(`${output}/${engine}-${width}-route-frames.json`,JSON.stringify(frames,null,2));
    const intermediate=frames.filter(f=>f.progress>.02&&f.progress<.98);
    assert.ok(intermediate.length>15,'Road visibly draws through intermediate points');
    assert.ok(intermediate.at(-1).time-intermediate[0].time>800,'Road trace lasts long enough to follow');
    assert.ok(frames.filter(f=>f.phase==='routing').every(f=>f.categories===0&&f.pins===0),'Places appear only after the road finishes drawing');
   }
   await expect(page.locator('.dining-direct-route')).toHaveAttribute('data-progress','1.000');
   assert.ok(paths.at(-1).split('L').length>3,'Destination uses actual road bends');
   await page.screenshot({path:`${output}/${engine}-${width}-${city}-${target}-road.png`});
   await page.emulateMedia({reducedMotion:'reduce'});
   for(const category of ['restaurant','cafe','bar','dessert']) {
    await page.locator(`.conversation-categories button[data-category="${category}"]`).click();
    await expect(page.locator('.dining-choice')).toHaveCount(3);
    await expect(page.locator('.dining-food-pin')).toHaveCount(3);
    await page.locator('.dining-choice:not([disabled])').first().click();
    await page.getByRole('button',{name:'메시지 보내기',exact:true}).click();
    await expect(page.locator('.conversation-demo')).toHaveAttribute('data-phase','saved');
    const detour=await page.locator('.dining-saved-route').getAttribute('d');
    assert.notEqual(detour,paths.at(-1),'Saving a stop changes the real road route');
    await expect(page.locator('.dining-saved-stops')).toContainText(targets[target]);
   }
   // Already-saved venues remain in the itinerary and cannot be added twice.
   const savedCount=await page.locator('.conversation-demo').getAttribute('data-saved-count');
   await page.locator('.conversation-categories button[data-category="dessert"]').click();
   await expect(page.locator('.dining-choice[data-added="true"]').first()).toBeDisabled();
   assert.equal(await page.locator('.conversation-demo').getAttribute('data-saved-count'),savedCount);
   assert.ok(await page.evaluate(()=>window.__choiceMap===document.querySelector('.maplibregl-canvas')&&window.__choiceCamera===document.querySelector('[data-camera]').dataset.camera));
   const endScroll=await page.evaluate(()=>scrollY);
   if(process.env.CHOICE_TRACE && Math.abs(endScroll-startScroll)>=1) console.log(JSON.stringify(await page.evaluate(()=>window.__scrollTrace),null,2));
   assert.ok(Math.abs(endScroll-startScroll)<1,`${engine}/${width}/${city}/${target}: choices do not change page scroll (${startScroll} → ${endScroll})`);
  }
  assert.notEqual(paths[0],paths[1],'Selecting a different destination draws a different road');
  await page.getByRole('button',{name:'대화 처음부터 보기',exact:true}).click();
  await expect(page.locator('.conversation-demo')).toHaveAttribute('data-phase','choosing');
  assert.equal(await page.locator('.dining-direct-route, .dining-saved-route').count(),0);
  // A reset in the middle of a route must cancel its pending completion.
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.locator('.journey-destination-choice').first().click();await page.waitForTimeout(250);
  await page.getByRole('button',{name:'대화 처음부터 보기',exact:true}).click();await page.waitForTimeout(2500);
  await expect(page.locator('.conversation-demo')).toHaveAttribute('data-phase','choosing');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.getByRole('button',{name:'지구본으로',exact:true}).click();await page.getByRole('button',{name:`${city} 여행 둘러보기`,exact:true}).click();
  await expect(page.locator('.conversation-demo')).toHaveAttribute('data-phase','choosing');
  checks.push({engine,width,height,city,targets,categorySaveFlows:8,firstQuestion:true,waitsForChoice:true,roadAnimation:moving&&city==='카이로',sameMap:true,sameCamera:true,noScrollJump:true,resetCancelsRoute:true});
  console.log(`✓ ${engine} ${width}px ${city}: question → two targets → road → four categories, reset and same live map`);
  await page.close();
 }} finally {await browser.close();}
}
assert.deepEqual(errors,[]);
await writeFile(`${output}/checks.json`,JSON.stringify({base,checks,errors},null,2));
