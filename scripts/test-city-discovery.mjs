import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,webkit,expect} from '@playwright/test';
const base=process.env.LANDING_BASE_URL??'http://127.0.0.1:3018';const checks=[];
for(const [engine,type,width,height] of [['chrome',chromium,1440,900],['webkit',webkit,390,844]]){
 const browser=await type.launch({headless:true,...(engine==='chrome'?{channel:'chrome'}:{})});
 try{
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'no-preference'});await page.goto(base,{waitUntil:'networkidle'});await expect(page.locator('.globe-arrival')).toHaveAttribute('data-ready','true');
  const center=await page.locator('.globe-mapcn').getAttribute('data-center');
  await expect.poll(()=>page.locator('.hero-section').getAttribute('data-destination'),{timeout:12000}).not.toBe('rome');
  const city=await page.locator('.hero-section').getAttribute('data-destination');await expect(page.locator('.city-feature')).toHaveAttribute('data-city',city);await expect(page.locator('.globe-preview-card')).toHaveAttribute('data-city',city);
  assert.notEqual(await page.locator('.globe-mapcn').getAttribute('data-center'),center);
  assert.ok((await page.locator('.city-feature-photo').getAttribute('src')).includes(encodeURIComponent(`/travel/cities/${city}`)));
  await page.locator('.globe-utilities .motion-toggle').click();const paused=await page.locator('.hero-section').getAttribute('data-destination');await page.waitForTimeout(500);await expect(page.locator('.hero-section')).toHaveAttribute('data-destination',paused);
  checks.push({engine,city,automaticStorySync:true,rotation:true,pause:true});console.log(`✓ ${engine}: automatic ${city} spotlight updates both photographs and copy`);
 }finally{await browser.close();}
}
await mkdir('assets/validation/city-stories',{recursive:true});await writeFile('assets/validation/city-stories/discovery.json',JSON.stringify({checks},null,2));
