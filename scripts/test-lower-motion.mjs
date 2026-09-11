import assert from 'node:assert/strict';
import {chromium,webkit,expect} from '@playwright/test';
import{mkdir,writeFile}from'node:fs/promises';
const base=process.env.LANDING_BASE_URL??'http://127.0.0.1:3018';const out=process.env.MOTION_OUTPUT??'assets/validation/lower/motion';await mkdir(out,{recursive:true});const checks=[];
for(const [name,engine,width] of [['chrome',chromium,1440],['webkit',webkit,390]]){
 const b=await engine.launch({headless:true,...(name==='chrome'?{channel:'chrome'}:{})});
 try{const p=await b.newPage({viewport:{width,height:900}});const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(base,{waitUntil:'networkidle'});await p.locator('.lower-integration').scrollIntoViewIfNeeded();
 await expect(p.locator('.lower-integration-flow')).toHaveAttribute('data-animate','true');
 for(const tool of ['Cursor','Codex CLI · IDE','ChatGPT 데스크톱','Claude Code']){await p.getByRole('tab',{name:tool,exact:true}).click();assert.equal(await p.locator('.lower-mcp-inserted').evaluate(e=>getComputedStyle(e).animationName),'lower-insert');await expect(p.locator('.lower-mcp-inserted')).toHaveCSS('opacity','1');await expect(p.locator('.lower-tool-reply')).toHaveCSS('opacity','1');}
 await p.getByRole('button',{name:'애니메이션 일시정지',exact:true}).click();await p.getByRole('tab',{name:'Codex CLI · IDE',exact:true}).click();await expect(p.locator('.lower-integration-flow')).toHaveAttribute('data-animate','false');await expect(p.locator('.lower-mcp-inserted')).toHaveCSS('opacity','1');
 await p.locator('.lower-mcp-cta a').click();await expect(p).toHaveURL(/\/docs\/mcp(?:#.*)?$/);await p.goBack({waitUntil:'networkidle'});await p.locator('.lower-conversation-end a').click();await expect(p).toHaveURL(/\/(login|app)/);await p.goto(base);await p.locator('.lower-finale a').click();await expect(p).toHaveURL(/\/(login|app)/);
 assert.deepEqual(errors,[]);checks.push({engine:name,width,tools:4,animation:true,globalPause:true,guideLink:true,startLinks:true});console.log(`✓ ${name}: MCP insertion animation, pause, actual guide and both start actions`);
 }finally{await b.close()}
}
await writeFile(`${out}/checks.json`,JSON.stringify({checks},null,2));
