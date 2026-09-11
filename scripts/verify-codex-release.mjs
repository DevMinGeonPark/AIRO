import {chromium,webkit,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base=process.env.AIRO_VERIFY_URL??'https://airo.dev-heptivision.com';
const output=new URL('../assets/validation/workspace/',import.meta.url);await mkdir(output,{recursive:true});
const checks=[];
for(const [engine,width] of [[chromium,1440],[chromium,390],[webkit,320]]){
 const browser=await engine.launch(engine===chromium?{channel:'chrome'}:{});
 try{
  const page=await browser.newPage({viewport:{width,height:844},...(new URL(base).hostname==='127.0.0.1'?{extraHTTPHeaders:{'x-forwarded-host':'airo.dev-heptivision.com'}}:{})}),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  await page.goto(`${base}/docs/codex`,{waitUntil:'networkidle'});
  await expect(page.getByRole('heading',{name:'내 Codex로, 여기서 여행 만들기.'})).toBeVisible();
  await expect(page.getByRole('link',{name:'내 AI 연결 →',exact:true})).toHaveAttribute('href','/app/settings/ai');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:new URL(`codex-guide-${engine.name()}-${width}.png`,output).pathname,fullPage:true});
  const id='00000000-0000-4000-8000-000000000999',secret='b'.repeat(64);
  await page.goto(`${base}/connect/codex?device=${id}&name=Fixture#key=${secret}`,{waitUntil:'networkidle'});
  await page.waitForURL(url=>url.pathname==='/login');
  assert.equal(new URL(page.url()).searchParams.get('next'),`/app/settings/ai?pair=${id}`);
  const sameOrigin=new URL(page.url()).origin===base;
  if(sameOrigin) assert.equal(JSON.parse(await page.evaluate(id=>sessionStorage.getItem(`airo.pair.${id}`),id)).key,secret);
  else assert.equal(new URL(base).hostname,'127.0.0.1','only a local preview may redirect to the canonical login origin');
  assert.ok(!requests.some(url=>url.includes(secret)),'pairing secret never appears in a network URL');
  await expect(page.getByRole('link',{name:'Google로 계속하기',exact:true})).toBeVisible();
  assert.deepEqual(errors,[]);checks.push({engine:engine.name(),width,guide:true,pairingLoginReturn:true,pairingStorageVerified:sameOrigin,fragmentNotSent:true,pageErrors:errors});
 }finally{await browser.close();}
}
for(const path of ['/api/bridge/devices','/api/bridge/jobs']){
 const r=await fetch(base+path,{method:path.endsWith('jobs')?'POST':'GET'});assert.equal(r.status,401);
}
const worker=await fetch(base+'/api/bridge/worker',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${'c'.repeat(64)}`},body:JSON.stringify({op:'next',id:'00000000-0000-4000-8000-000000000999',data:{}})});assert.equal(worker.status,401);
const installer=await fetch(base+'/docs/codex/install');assert.equal(installer.status,200);assert.ok((await installer.text()).includes('codex plugin add airo@airo'));
const runtime=JSON.parse(await readFile(new URL('../plugins/airo/assets/runtime.json',import.meta.url),'utf8'));
const archive=await fetch(base+'/downloads/airo-codex-0.2.0-darwin-arm64.tar.gz');assert.equal(archive.status,200);
const actual=createHash('sha256').update(Buffer.from(await archive.arrayBuffer())).digest('hex');
const pinned=runtime.platforms['darwin-arm64'].bridgeSha256;assert.equal(actual,pinned);
await writeFile(new URL('codex-release-checks.json',output),JSON.stringify({base,checks,unauthenticatedApis:401,invalidDevice:401,installer:true,packageChecksum:true,checkedAt:new Date().toISOString()},null,2));
console.log('Codex release checks passed:',base,checks.length,'browser configurations; private endpoints; pairing; package checksum.');
