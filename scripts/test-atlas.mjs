import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

const base = process.env.LANDING_BASE_URL ?? 'http://localhost:3016';
const output = process.env.ATLAS_OUTPUT ?? 'assets/validation/atlas';
await mkdir(output, { recursive: true });
const cities = [{ id: 'kyoto', name: '교토', region: 'asia', stops: [] }, ...JSON.parse(await readFile('src/lib/landing-destinations.json', 'utf8'))];
const regions = [ ['asia', '아시아',105,25], ['europe','유럽',12,45], ['africa','아프리카',20,0], ['north-america','북미',-103,32], ['south-america','남미',-65,-20], ['oceania','오세아니아',160,-18] ];
assert.ok(cities.length >= 50);
for (const [region] of regions) assert.ok(cities.filter(c => c.region === region).length >= 4, `${region}: at least four destinations`);
for (const city of cities.slice(1)) {
  assert.equal(city.stops.length, 3);
  const stops = city.stops.flat();
  assert.equal(stops.length,9); assert.equal(new Set(stops.map(stop=>stop[0])).size,9);
  for(const [name,lng,lat] of stops) assert.ok(name && Number.isFinite(lng) && Math.abs(lng)<=180 && Number.isFinite(lat) && Math.abs(lat)<85);
}
const checks=[],errors=[];
const record=(name,details)=>{checks.push({name,details});console.log(`✓ ${name}`);};
const browser=await chromium.launch({channel:'chrome',headless:true});
const watch=p=>{p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});p.on('response',r=>{if(r.status()>=400&&r.url().startsWith(base))errors.push(`${r.status()} ${r.url()}`)})};
const luminance=color=>{
 const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});
 return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
};
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
try {
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});watch(page);
 await page.goto(base,{waitUntil:'networkidle'});
 await expect(page.locator('.globe-arrival')).toHaveAttribute('data-ready','true',{timeout:15000});
 await expect(page.locator('[data-city-id]')).toHaveCount(cities.length);
 await expect(page.locator('.destination-picker-caption')).toContainText(`${cities.length}개 도시`);
 await expect.poll(async()=>Number(await page.locator('.globe-mapcn').getAttribute('data-visible-labels'))).toBeGreaterThan(5);
 await page.screenshot({path:`${output}/world-desktop.png`});
 record(`${cities.length} geographically placed cities across six inhabited continents`);
 const picker=page.locator('.destination-picker');
 await picker.locator('summary').click();
 const filter=page.getByRole('group',{name:'여행지 대륙 필터'});
 for(const [id,name] of regions){
  await filter.getByRole('button',{name,exact:true}).click();
  await expect(page.getByRole('group',{name:'여행 예시 목록'}).getByRole('button')).toHaveCount(cities.filter(c=>c.region===id).length);
 }
 await filter.getByRole('button',{name:'전체',exact:true}).click();
 const input=page.getByRole('textbox',{name:'도시 또는 나라 검색'});
 for(const [query,name] of [['cAiRo','카이로'],['bogota','보고타'],['new york','뉴욕'],['레이캬비크','레이캬비크']]){
  await input.fill(query);await expect(page.getByRole('group',{name:'여행 예시 목록'}).getByRole('button')).toHaveCount(1);
  await expect(page.getByRole('button',{name:`${name} 여행 선택`,exact:true})).toBeVisible();
 }
 await input.fill('zzznomatch');await expect(page.locator('.destination-empty')).toBeVisible();
 await page.getByRole('button',{name:'전체 도시 보기',exact:true}).click();
 await expect(page.getByRole('group',{name:'여행 예시 목록'}).getByRole('button')).toHaveCount(cities.length);
 await page.screenshot({path:`${output}/search-desktop.png`});
 await page.keyboard.press('Escape');await expect(picker.locator('summary')).toBeFocused();
 record('Country/region filters, Korean/English/accent-insensitive search, empty-state reset and keyboard close');
 for(const [id,name,lng,lat] of regions){
  await page.getByRole('group',{name:'지구본 대륙 탐색'}).getByRole('button',{name,exact:true}).click();
  const map=page.locator('.globe-mapcn');await expect(map).toHaveAttribute('data-view',id);
  await expect.poll(async()=>Number(await map.getAttribute('data-visible-labels'))).toBeGreaterThan(2);
  await expect.poll(async()=>{
   const center=(await map.getAttribute('data-center')).split(',').map(Number);
   return Math.max(Math.abs(center[0]-lng),Math.abs(center[1]-lat));
  },{message:`${name}: actual globe camera center`}).toBeLessThan(.01);
  const labels=page.locator('.globe-city-dot[data-label-visible=true] .globe-city-name');
  const boxes=await labels.evaluateAll(es=>es.map(e=>e.getBoundingClientRect().toJSON()));
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
   const a=boxes[i],b=boxes[j];assert.ok(!(a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y),`${name}: city labels overlap`);
  }
  await page.screenshot({path:`${output}/continent-${id}.png`});
 }
 record('Each continent reframes the actual globe with multiple readable, non-overlapping city labels');
 // Select a city directly from a dot on the African hemisphere.
 await page.getByRole('group',{name:'지구본 대륙 탐색'}).getByRole('button',{name:'아프리카',exact:true}).click();
 await page.getByRole('button',{name:'케이프타운 지구본 핀 선택',exact:true}).click();
 await expect(page.locator('.hero-section')).toHaveAttribute('data-destination','cape-town');
 await expect(picker.locator('summary')).toContainText('케이프타운');
 record('Globe city dots select real destination previews');
 await page.close();

 for(const theme of ['dark','light']){
  const p=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});watch(p);
  await p.addInitScript(t=>localStorage.setItem('theme',t),theme);await p.goto(base,{waitUntil:'networkidle'});
  const heading=await p.locator('.headline-accent').evaluate(e=>getComputedStyle(e).color);
  const globeBg=await p.locator('.globe-arrival').evaluate(e=>getComputedStyle(e).backgroundColor);
  assert.ok(contrast(heading,globeBg)>=4.5,`${theme}: opening headline contrast`);
  await p.getByRole('button',{name:'교토 여행 둘러보기',exact:true}).click();
  const ratios=[];
  for(let day=1;day<=3;day++){
   await p.getByRole('tab',{name:`Day ${day}`,exact:true}).click();
   const colors=await p.locator('.story-map .geo-pin[data-current-day=true]').first().evaluate(e=>({fill:getComputedStyle(e.querySelector('.geo-pin-shape')).fill,text:getComputedStyle(e.querySelector('.geo-pin-body text')).fill,tag:e.querySelector('.geo-pin-shape').tagName}));
   assert.equal(colors.tag,'circle');ratios.push(contrast(colors.fill,colors.text));assert.ok(ratios.at(-1)>=4.5,`${theme}: day ${day} marker number contrast`);
   const marker=p.locator('.story-map .geo-pin[data-current-day=true]').first();await marker.hover();
   const hovered=await marker.evaluate(e=>({fill:getComputedStyle(e.querySelector('.geo-pin-shape')).fill,text:getComputedStyle(e.querySelector('.geo-pin-body text')).fill}));
   assert.ok(contrast(hovered.fill,hovered.text)>=4.5,`${theme}: day ${day} hovered marker number contrast`);
  }
  const button=await p.locator('.hero-actions .journey-button').evaluate(e=>({bg:getComputedStyle(e).backgroundColor,fg:getComputedStyle(e).color}));
  assert.ok(contrast(button.bg,button.fg)>=4.5,`${theme}: primary button contrast`);
  const accent=await p.locator('.hero-actions .journey-button').evaluate(e=>getComputedStyle(e).backgroundColor);
  assert.notEqual(accent,'rgb(242, 107, 33)');
  await p.screenshot({path:`${output}/itinerary-${theme}.png`});
  record(`${theme}: blue primary actions, circular markers and readable text contrast`,{button:contrast(button.bg,button.fg),marker:ratios});
  await p.close();
 }
 for(const width of [320,375,768,1920]){
  const p=await browser.newPage({viewport:{width,height:width<768?812:1080},reducedMotion:'reduce'});watch(p);await p.goto(base,{waitUntil:'networkidle'});
  await expect(p.locator('.globe-arrival')).toHaveAttribute('data-ready','true',{timeout:15000});
  await p.locator('.destination-picker summary').click();await p.getByRole('textbox',{name:'도시 또는 나라 검색'}).fill('아르헨티나');
  await expect(p.getByRole('button',{name:'부에노스아이레스 여행 선택',exact:true})).toBeVisible();
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await p.screenshot({path:`${output}/search-${width}.png`});await p.keyboard.press('Escape');
  const summary=await p.locator('.destination-picker summary').boundingBox();
  const pin=await p.locator('.globe-pin-label').boundingBox();
  assert.ok(!(summary.x<pin.x+pin.width&&summary.x+summary.width>pin.x&&summary.y<pin.y+pin.height&&summary.y+summary.height>pin.y),`${width}: selected city card must not cover the chooser`);
  await p.screenshot({path:`${output}/world-${width}.png`});await p.close();
  record(`${width}px: usable search, separated controls and no horizontal overflow`);
 }
 for(const width of [375,1440]){
  const p=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});watch(p);await p.goto(base,{waitUntil:'networkidle'});
  for(const name of ['쿠알라룸푸르','샌프란시스코']){
   await p.locator('.destination-picker summary').click();await p.getByRole('button',{name:`${name} 여행 선택`,exact:true}).click();
   await p.getByRole('button',{name:`${name} 여행 둘러보기`,exact:true}).click();await p.getByRole('tab',{name:'Day 3',exact:true}).click();
   await p.getByRole('button',{name:'지도 조작 켜기',exact:true}).click();const map=p.locator('.story-map');
   for(let i=0;i<3;i++){
    await map.locator('.geo-pin[data-current-day=true]').nth(i).click();await expect(map).toHaveAttribute('data-stop',String(i+1));
    await p.getByRole('button',{name:'전체 경로 보기',exact:true}).click();
   }
   await p.screenshot({path:`${output}/nearby-${name}-${width}.png`});await p.getByRole('button',{name:'지구본으로',exact:true}).click();
  }
  await p.close();record(`${width}px: nearby landmark markers remain independently clickable`);
 }
 assert.deepEqual(errors,[]);
 await writeFile(`${output}/atlas-checks.json`,JSON.stringify({base,checkedAt:new Date().toISOString(),destinations:cities.length,checks,errors},null,2));
}finally{await browser.close();}
