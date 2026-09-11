import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.LANDING_BASE_URL??'http://localhost:3017';const dir='assets/fable-review/paper';await mkdir(dir,{recursive:true});
const b=await chromium.launch({channel:'chrome',headless:true});const states=[];
async function open(w,h,reduced=false){const p=await b.newPage({viewport:{width:w,height:h},reducedMotion:reduced?'reduce':'no-preference'});await p.goto(base,{waitUntil:'networkidle'});const notice=p.getByRole('button',{name:'안내 닫기'});if(await notice.isVisible())await notice.click();await p.waitForTimeout(4300);return p}
async function shot(p,name){await p.screenshot({path:`${dir}/${name}.png`});states.push({name,...await p.evaluate(()=>({scroll:window.scrollY,width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,day:document.querySelector('.hero-section').dataset.day,phase:document.querySelector('.hero-section').dataset.phase,coordinate:document.querySelector('.story-map .map-coordinate').textContent,scale:document.querySelector('.story-map').dataset.cameraScale}))});}
const p=await open(1440,900);for(const [name,y]of[['hero-day1',0],['hero-day2',1080],['hero-day3',1836],['hero-overview',2650]]){await p.evaluate(y=>window.scrollTo(0,y),y);await p.waitForTimeout(4300);await shot(p,name)}
for(const [name,selector]of[['feature-1','.feature-01'],['feature-2','.feature-02'],['feature-3','.feature-03'],['mcp','.mcp-card'],['cta','.closing-journey']]){
 await p.locator(selector).evaluate(el=>window.scrollTo(0,window.scrollY+el.getBoundingClientRect().bottom-innerHeight+50));await p.waitForTimeout(1000);
 await p.locator(selector).evaluate(el=>window.scrollTo(0,window.scrollY+el.getBoundingClientRect().top-75));await p.waitForTimeout(4300);
 await p.locator(selector).screenshot({path:`${dir}/${name}.png`});
}
await p.close();
for(const[w,h]of[[375,812],[768,1024]]){const q=await open(w,h);await shot(q,`hero-${w}-day1`);if(w===375){await q.getByRole('tab',{name:'Day 3',exact:true}).click();await q.waitForTimeout(4300);await shot(q,'hero-375-day3');await q.evaluate(()=>window.scrollTo(0,98));await shot(q,'hero-375-card');for(const[name,sel]of[['feature-2','.feature-02'],['feature-3','.feature-03'],['mcp','.mcp-diagram']]){await q.locator(sel).evaluate(el=>window.scrollTo(0,scrollY+el.getBoundingClientRect().top-80));await q.waitForTimeout(4000);await q.locator(sel).screenshot({path:`${dir}/${name}-375.png`})}}await q.close()}
const r=await open(1440,900,true);await shot(r,'hero-reduced');await r.locator('.mcp-diagram').scrollIntoViewIfNeeded();await r.locator('.mcp-diagram').screenshot({path:`${dir}/mcp-reduced.png`});await r.close();await b.close();await writeFile(`${dir}/states.json`,JSON.stringify(states,null,2));console.log(JSON.stringify(states,null,2));
