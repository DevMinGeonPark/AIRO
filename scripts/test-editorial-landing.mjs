import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit, expect } from '@playwright/test';
const base = process.env.LANDING_BASE_URL ?? 'http://127.0.0.1:3018';
const output = process.env.EDITORIAL_OUTPUT ?? 'assets/validation/editorial/layout';
await mkdir(output, { recursive: true });
const checks = [], errors = [];
for (const [engine, type] of [['chrome', chromium], ['webkit', webkit]]) {
 const browser = await type.launch({headless:true,...(engine==='chrome'?{channel:'chrome'}:{})});
 try {
  for (const [width,height] of [[1570,1000],[1440,900],[1440,640],[768,1024],[390,844],[360,740],[320,568],[844,390]]) {
   const page = await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
   page.on('pageerror', e => errors.push({engine,width,message:e.message}));
   await page.goto(base,{waitUntil:'networkidle'});
   await expect(page.locator('.globe-arrival')).toHaveAttribute('data-ready','true');
   await expect(page.getByRole('heading',{name:'마음 가는 대로, AIRO.',exact:true})).toBeVisible();
   await expect(page.locator('.editorial-start')).toHaveAttribute('href','/app');
   await expect(page.locator('.editorial-description')).toHaveText('계획은 가볍게, 여행은 깊게.');
   await expect(page.locator('.globe-preview-card .city-preview-title')).toHaveText('로마');
   await expect(page.locator('.city-preview-kicker')).toHaveText('ROME, ITALY');
   await expect(page.locator('.city-preview-description')).toHaveText('유적 사이를 걷고,광장에서 쉬다.');
   await page.evaluate(()=>document.fonts.ready);
   const layout = await page.evaluate(()=> {
    const rect = s=>document.querySelector(s).getBoundingClientRect().toJSON();
    const font = getComputedStyle(document.querySelector('.editorial-wordmark em'));
    return {logo:rect('.landing-nav .airo-logo'),copy:rect('.hero-copy'),title:rect('.hero-copy h1'),picker:rect('.destination-picker'),card:rect('.globe-preview-card'),regions:rect('.globe-regions'),feature:rect('.city-feature'),font:font.fontFamily,fontStyle:font.fontStyle,fontLoaded:document.fonts.check('italic 100px "AIRO Editorial"'),overflow:document.documentElement.scrollWidth>innerWidth,photos:[...document.querySelectorAll('.hero-copy img,.city-preview-image img')].filter(i=>i.getBoundingClientRect().height>0).every(i=>i.complete&&i.naturalWidth>0)};
   });
   assert.ok(!layout.overflow && layout.photos && layout.fontLoaded && layout.fontStyle==='italic', JSON.stringify(layout));
   assert.ok(Math.abs(layout.title.left-layout.logo.left)<.1,'Heading uses the existing logo guide');
   const overlaps=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
   assert.ok(layout.card.left>=0&&layout.card.right<=width&&layout.card.bottom<=height&&!overlaps(layout.card,layout.regions)&&!overlaps(layout.card,layout.picker),'Selected card keeps chooser and filters clear: '+JSON.stringify(layout));
   if(width<768||(width<1024&&height<500)) assert.ok(layout.copy.bottom+4<=layout.picker.top,'Mobile copy and city chooser must not overlap');
   await page.screenshot({path:`${output}/${engine}-${width}-${height}.png`});
   checks.push({engine,width,height,layout});
   console.log(`✓ ${engine} ${width}×${height}: font, Rome photos, guide and unobstructed controls`);
   await page.close();
  }
 } finally {await browser.close();}
}
assert.deepEqual(errors,[]);
await writeFile(`${output}/checks.json`,JSON.stringify({base,checks,errors},null,2));
