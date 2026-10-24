import {chromium,webkit,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';

const dir='src/app/location-offline-check',out='.private/deployment/current-location-20260919',origin='http://127.0.0.1:3448';
const trip={id:'00000000-0000-4000-8000-000000000998',user_id:'fixture',title:'현재 위치 확인',start_date:'2026-10-01',created_at:'2026-09-19T00:00:00Z'};
const stops=[{id:'rome',name:'로마 일정',position:0,lng:12.476,lat:41.899,day:1,trip_id:trip.id,time:null,note:null,map_query:null,mode:'ground'}];
const oldEnv=await readFile('next-env.d.ts'),oldTypes=await readFile('tsconfig.json');await mkdir(dir);await mkdir(out,{recursive:true});
await writeFile(`${dir}/page.tsx`,`import {notFound} from 'next/navigation';import {TripWorkspace} from '@/components/trip-workspace';export default function Page(){if(process.env.NODE_ENV!=='development'||process.env.LOCATION_OFFLINE_PREVIEW!=='1')notFound();return <TripWorkspace trip={${JSON.stringify(trip)}} initialStops={${JSON.stringify(stops)}} initialMessages={[]}/>}`);
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','-p','3448'],{env:{...process.env,NEXT_DIST_DIR:'.next-location-check',LOCATION_OFFLINE_PREVIEW:'1',NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_ANON_KEY:'',OPENAI_API_KEY:'',GOOGLE_MAPS_API_KEY:'',MCP_OAUTH_ENABLED:'false',DEMO_DB_PATH:'/tmp/airo-location-unused.json'},stdio:['ignore','pipe','pipe']});
let log='',browser;server.stdout.on('data',d=>log+=d);server.stderr.on('data',d=>log+=d);const results=[];
try {
  const start=Date.now();while(!log.includes('Ready in')){if(server.exitCode!==null||Date.now()-start>60000)throw Error(log.slice(-3000));await new Promise(r=>setTimeout(r,200));}
  for(const [engine,width] of [[chromium,1440],[chromium,390],[webkit,320]]) {
    browser=await engine.launch(engine===chromium?{channel:'chrome'}:{});
    const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'}),page=await context.newPage();const errors=[],writes=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{
      window.locationTest={calls:0,pending:[]};
      Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(success,error,options){window.locationTest.calls++;window.locationTest.pending.push({success,error,options});}}});
    });
    await context.route('**/*',route=>{
      const request=route.request(),url=new URL(request.url()),p=url.pathname;
      const json=body=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
      if(url.hostname==='basemaps.cartocdn.com')return json({version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#101113'}}]});
      if(url.origin!==origin)return route.abort();
      if(!p.startsWith('/api/'))return route.continue();
      if(request.method()!=='GET')writes.push(p);
      if(p.endsWith('/progress'))return json({revision:0,timeZone:'Asia/Tokyo',rules:[],entries:[]});
      if(p===`/api/trips/${trip.id}`)return json({trip,stops,messages:[]});
      if(p.endsWith('/devices'))return json({devices:[]});
      return json({items:[],images:[]});
    });
    await page.goto(`${origin}/location-offline-check`,{waitUntil:'networkidle'});
    const button=page.getByRole('button',{name:'현재 위치',exact:true}),marker=page.getByRole('img',{name:'현재 위치 표시'});
    await expect(button).toBeInViewport();assert.equal(await page.evaluate(()=>window.locationTest.calls),0);
    await button.click();await expect(button).toBeDisabled();await expect(page.getByRole('status').filter({hasText:'현재 위치 확인 중'})).toBeVisible();
    await page.evaluate(()=>window.locationTest.pending.shift().error({code:1}));await expect(page.locator('.current-location-control').getByRole('alert')).toContainText('위치 권한');await expect(button).toBeEnabled();
    await button.click();await page.evaluate(()=>window.locationTest.pending.shift().error({code:3}));await expect(page.locator('.current-location-control').getByRole('alert')).toContainText('시간이 걸려요');
    await button.click();await page.evaluate(()=>window.locationTest.pending.shift().success({coords:{latitude:33.59,longitude:130.40,accuracy:8}}));
    await expect(marker).toBeInViewport();await expect(button).toBeEnabled();
    await expect.poll(async()=>{const dot=await marker.boundingBox(),map=await page.locator('.workspace-map').boundingBox();return Math.abs(dot.x+dot.width/2-(map.x+map.width/2));}).toBeLessThan(3);
    await page.screenshot({path:`${out}/location-${width}.png`,fullPage:true});
    // Repeated fixes move the camera again; stale callbacks after a background transition cannot move it.
    await button.click();await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));window.locationTest.pending.shift().success({coords:{latitude:50,longitude:20,accuracy:10}});Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
    await expect(button).toBeEnabled();await expect(marker).toHaveCount(0);
    await button.click();await page.evaluate(()=>window.locationTest.pending.shift().success({coords:{latitude:33.59,longitude:130.40,accuracy:8}}));await expect(marker).toBeInViewport();
    assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    results.push({engine:engine.name(),width,passed:true,serverWrites:writes.length});await browser.close();browser=null;
  }
  await writeFile(`${out}/web-ui.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results));
} finally {await browser?.close();server.kill('SIGTERM');await rm(dir,{recursive:true,force:true});await writeFile('next-env.d.ts',oldEnv);await writeFile('tsconfig.json',oldTypes);await writeFile(`${out}/web-dev.log`,log);}
