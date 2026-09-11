import {chromium} from '@playwright/test';
import{writeFile}from'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true});
const sources=[['kyro','https://kyro.team/'],['chartogne','https://chartogne-taillet.com/'],['linear','https://linear.app/'],['superlist','https://www.superlist.com/']];
const observations=[];
for(const[name,url]of sources){
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 try{
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});await page.waitForTimeout(5000);
  const start={name,url,title:await page.title(),height:await page.evaluate(()=>document.documentElement.scrollHeight),buttons:await page.getByRole('button').allTextContents()};
  await page.screenshot({path:`assets/fable-review/references/${name}-0.png`});
  for(const y of [900,1800,3000]){await page.mouse.wheel(0,y-(y===900?0:y===1800?900:1800));await page.waitForTimeout(1200);await page.screenshot({path:`assets/fable-review/references/${name}-${y}.png`});}
  await writeFile(`assets/fable-review/references/${name}-visible-text.txt`,await page.locator('body').innerText());
  observations.push(start);console.log(JSON.stringify(start));
 }catch(e){observations.push({name,url,error:e.message});console.log(name,e.message)}finally{await page.close()}
}
await writeFile('assets/fable-review/references/captures.json',JSON.stringify(observations,null,2)+'\n');await browser.close();
