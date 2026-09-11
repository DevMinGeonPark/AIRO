import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium,webkit,expect} from '@playwright/test';
const base=process.env.LANDING_BASE_URL??'http://127.0.0.1:3018';
const output=process.env.STORIES_OUTPUT??'assets/validation/city-stories/cities';
const data=JSON.parse(await readFile('src/lib/landing-editorial.json','utf8'));
const cities=[{id:'kyoto',name:'교토',en:'KYOTO'},...JSON.parse(await readFile('src/lib/landing-destinations.json','utf8'))];
assert.equal(Object.keys(data).length,53);
assert.equal(new Set(Object.values(data).map(d=>d.image)).size,53);
const hashes=await Promise.all(Object.values(data).map(async d=>createHash('sha256').update(await readFile('public'+d.image)).digest('hex')));assert.equal(new Set(hashes).size,53,'Every city has a different photograph');
await mkdir(output,{recursive:true});const checks=[],errors=[];
for(const [engine,type,width,height] of [['chrome',chromium,1570,1000],['webkit',webkit,390,844],['chrome',chromium,320,568],['webkit',webkit,768,1024]]) {
 const browser=await type.launch({headless:true,...(engine==='chrome'?{channel:'chrome'}:{})});
 try {
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'networkidle'});await expect(page.locator('.globe-arrival')).toHaveAttribute('data-ready','true');
  await expect(page.locator('.landing-nav').getByRole('link',{name:'시작하기',exact:true})).toHaveCount(0);await expect(page.locator('.nav-start')).toHaveCount(0);
  const picker=await page.locator('.destination-picker').boundingBox();assert.ok(picker.y<(width>=768?108:337),'Chooser is raised');
  for(const city of cities) {
   await page.locator('.destination-picker summary').click();await page.getByRole('textbox',{name:'도시 또는 나라 검색'}).fill(city.name);await page.getByRole('button',{name:city.name+' 여행 선택',exact:true}).click();
   const story=data[city.id];await expect(page.locator('.city-feature')).toHaveAttribute('data-city',city.id);await expect(page.locator('.globe-preview-card')).toHaveAttribute('data-city',city.id);
   await expect(page.locator('.city-feature-copy > strong')).toHaveText(story.featureTitle);await expect(page.locator('.city-feature-description')).toHaveText(story.featureDescription);await expect(page.locator('.city-feature-kicker')).toContainText(city.en);
   await expect(page.locator('.city-preview-title')).toHaveText(city.name);await expect(page.locator('.city-preview-description')).toHaveText(story.description.join(''));
   const loaded=await page.locator('.city-feature-photo,.city-preview-image img').evaluateAll(async imgs=>{await Promise.all(imgs.filter(i=>i.getBoundingClientRect().height>0).map(i=>i.decode()));return imgs.filter(i=>i.getBoundingClientRect().height>0).every(i=>i.complete&&i.naturalWidth>0);});assert.ok(loaded);
   assert.ok(await page.locator('.city-preview-title').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Long city name fits: '+city.id);
   const urls=await page.locator('.city-feature-photo,.city-preview-image img').evaluateAll(imgs=>imgs.map(i=>decodeURIComponent(i.currentSrc||i.src)));
   assert.ok(urls[0].includes(story.featureImage)&&urls[1].includes(story.image));
   const layout=await page.evaluate(()=>{const r=s=>document.querySelector(s).getBoundingClientRect().toJSON();return {copy:r('.hero-copy'),picker:r('.destination-picker'),card:r('.globe-preview-card'),regions:r('.globe-regions'),title:r('.city-preview-title'),overflow:document.documentElement.scrollWidth>innerWidth};});
   assert.ok(!layout.overflow&&layout.card.left>=0&&layout.card.right<=width&&layout.card.bottom<=layout.regions.top+1,city.id+' card stays inside globe');
   if(width<768)assert.ok(layout.copy.bottom+4<=layout.picker.top,city.id+' story and chooser are separated');
   if(['kyoto','paris','cairo','hong-kong','bali','buenos-aires','rio-de-janeiro'].includes(city.id))await page.screenshot({path:`${output}/${engine}-${width}-${city.id}.png`});
   checks.push({engine,width,height,city:city.id,photo:story.image,feature:story.featureTitle});
  }
  if(width<768){await page.getByRole('button',{name:'메뉴 열기',exact:true}).count();await page.getByLabel('메뉴 열기',{exact:true}).click();await expect(page.getByRole('navigation',{name:'모바일 주 메뉴'})).toBeVisible();}
  console.log(`✓ ${engine}: all 53 city photographs, captions, feature text, card fit and header removal`);
 } finally {await browser.close();}
}
assert.deepEqual(errors,[]);await writeFile(`${output}/checks.json`,JSON.stringify({checks,errors,uniquePhotos:53},null,2));
