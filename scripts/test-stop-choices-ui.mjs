import {chromium,webkit,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const trip={id:'00000000-0000-4000-8000-000000000999',user_id:'fixture',title:'선택형 식사',start_date:'2026-10-01',created_at:'2026-09-19T00:00:00Z'};
const place=(id,name,position,lng)=>({id,name,position,lng,lat:33.59,day:1,trip_id:trip.id,time:'12:00',note:null,map_query:null,mode:'ground'});
const choice={label:'점심',kind:'meal',revision:1,selectedId:null,candidates:[{id:'A',name:'간소나가하마야 (테스트)',lng:130.389,lat:33.592,note:null,map_query:null,mode:'ground'},{id:'B',name:'하카타 겐키 잇파이 (테스트)',lng:130.409,lat:33.601,note:null,map_query:null,mode:'ground'}]};
const original=[place('hotel','UNPLAN Fukuoka (테스트)',0,130.375),{...place('meal','점심',1,130.389),choice},place('park','다음 일정 (테스트)',2,130.415)];
const dir='src/app/choice-offline-check',out='.private/deployment/stop-choices-20260919';
const oldEnv=await readFile('next-env.d.ts','utf8'),oldTypes=await readFile('tsconfig.json','utf8');await mkdir(dir);await mkdir(out,{recursive:true});
await writeFile(`${dir}/page.tsx`,`import {notFound} from 'next/navigation';import {TripWorkspace} from '@/components/trip-workspace';export default function Page(){if(process.env.NODE_ENV!=='development'||process.env.CHOICE_OFFLINE_PREVIEW!=='1')notFound();return <TripWorkspace trip={${JSON.stringify(trip)}} initialStops={${JSON.stringify(original)}} initialMessages={[]}/>}`);
const origin='http://127.0.0.1:3447';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','-p','3447'],{env:{...process.env,NEXT_DIST_DIR:'.next-choice-check',CHOICE_OFFLINE_PREVIEW:'1',NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_ANON_KEY:'',OPENAI_API_KEY:'',GOOGLE_MAPS_API_KEY:'',MCP_OAUTH_ENABLED:'false',DEMO_DB_PATH:'/tmp/airo-choice-unused.json'},stdio:['ignore','pipe','pipe']});
let log='',browser;server.stdout.on('data',d=>log+=d);server.stderr.on('data',d=>log+=d);
const results=[];
try {
  const start=Date.now();while(!log.includes('Ready in')){if(server.exitCode!==null||Date.now()-start>60000)throw Error(log.slice(-3000));await new Promise(r=>setTimeout(r,200));}
  for(const [engine,width] of [[chromium,1440],[chromium,390],[webkit,320]]){
    let stops=structuredClone(original),fail=false,delay=0,writes=0;
    browser=await engine.launch(engine===chromium?{channel:'chrome'}:{});
    const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'}),page=await context.newPage();
    await page.clock.install({time:new Date('2026-10-01T03:00:00Z')});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await context.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url()),p=url.pathname;
      const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
      if(url.hostname==='basemaps.cartocdn.com')return json({version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#101113'}}]});
      if(url.origin!==origin)return route.abort();
      if(!p.startsWith('/api/'))return route.continue();
      if(p.endsWith('/choices')){
        writes++;const value=request.postDataJSON();if(delay)await new Promise(r=>setTimeout(r,delay));
        if(fail)return json({error:'다른 곳에서 후보가 변경됐어요.'},409);
        assert.equal(value.revision,stops[1].choice.revision);const candidate=choice.candidates.find(c=>c.id===value.candidateId);
        stops[1]={...stops[1],...(candidate??original[1]),id:'meal',choice:{...stops[1].choice,revision:stops[1].choice.revision+1,selectedId:value.candidateId}};
        return json({ok:true,stop:stops[1]});
      }
      if(p.endsWith('/routes')){
        const value=request.postDataJSON(),a=stops.find(s=>s.id===value.fromId),b=stops.find(s=>s.id===value.toId);
        const from=value.fromCandidateId?choice.candidates.find(c=>c.id===value.fromCandidateId):a,to=value.toCandidateId?choice.candidates.find(c=>c.id===value.toCandidateId):b;
        assert.ok(from&&to);return json({coordinates:[[from.lng,from.lat],[from.lng,to.lat],[to.lng,to.lat]],distance:1000,duration:600});
      }
      if(p.endsWith('/progress'))return json({revision:0,timeZone:'Asia/Tokyo',rules:[],entries:[]});
      if(p===`/api/trips/${trip.id}`)return json({trip,stops,messages:[]});
      if(p.endsWith('/devices'))return json({devices:[]});
      return json({items:[],images:[]});
    });
    await page.goto(`${origin}/choice-offline-check`,{waitUntil:'networkidle'});
    const map=page.locator('[data-road-routes]');await expect(map).toHaveAttribute('data-road-routes','0');
    if(width>=1024)await page.getByRole('button',{name:/점심 · 2곳 중 선택/}).first().click();
    else await page.locator('.day-overlay').getByRole('button',{name:/점심 · 2곳 중 선택/}).click();
    const panel=page.getByRole('region',{name:'점심 후보'});await expect(panel).toBeVisible();
    await expect(panel.getByRole('button',{name:/간소나가하마야/})).toBeVisible();
    delay=500;await panel.getByRole('button',{name:/하카타 겐키 잇파이/}).click();
    await expect(panel).toHaveAttribute('aria-busy','true');await expect(map).toHaveAttribute('data-road-routes','0');
    await expect(map).toHaveAttribute('data-road-routes','2');await expect(panel).toContainText('경로 확정');delay=0;
    assert.equal(stops.length,3);assert.equal(stops[1].id,'meal');assert.equal(stops[1].position,1);assert.equal(stops[1].time,'12:00');
    await page.screenshot({path:`${out}/choice-selected-${width}.png`,fullPage:true});
    fail=true;await panel.getByRole('button',{name:/간소나가하마야/}).click();await expect(panel.getByRole('alert')).toContainText('후보가 변경');assert.equal(stops[1].choice.selectedId,'B');
    await expect(map).toHaveAttribute('data-road-routes','2');fail=false;
    await panel.getByRole('button',{name:'선택 해제 · 다시 고르기'}).click();await expect(map).toHaveAttribute('data-road-routes','0');
    await page.screenshot({path:`${out}/choice-pending-${width}.png`,fullPage:true});
    assert.equal(stops[1].choice.selectedId,null);assert.equal(writes,3);assert.deepEqual(errors,[]);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    results.push({engine:engine.name(),width,passed:true});await browser.close();browser=null;
  }
  await writeFile(`${out}/choice-ui.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser?.close();server.kill('SIGTERM');await rm(dir,{recursive:true,force:true});await writeFile('next-env.d.ts',oldEnv);await writeFile('tsconfig.json',oldTypes);await writeFile(`${out}/choice-dev.log`,log);}
