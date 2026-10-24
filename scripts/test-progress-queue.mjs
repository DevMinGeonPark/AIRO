import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){try{return next(specifier,context);}catch(error){if(error.code==='ERR_MODULE_NOT_FOUND'&&specifier.startsWith('.')&&context.parentURL?.includes('/src/'))return next(`${specifier}.ts`,context);throw error;}}});
globalThis.fetch=()=>{throw new Error('No network in progress checks');};
const {ProgressWriteQueue,projectProgress}=await import('../src/lib/progress-queue.ts');
const {emptyItineraryProgress,progressEntry}=await import('../src/lib/itinerary-progress.ts');
const {remainingItinerary,remainingRoadPair,dayProgressRules}=await import('../src/lib/remaining-itinerary.ts');
const now=Date.parse('2026-10-01T03:00:00Z');
const stops=['A','B','C'].map((id,index)=>({id,source_id:`source-${id}`,name:id,time:'10:00',day:1,mode:'ground',lat:33.59+index/100,lng:130.4}));
const schedule={stops,startDate:'2026-10-01'};
const mixedTimes=[stops[0],{...stops[1],time:null}];
assert.deepEqual(dayProgressRules(mixedTimes,null,'either').map(action=>action.rule.mode),['either','location']);
assert.equal(dayProgressRules(mixedTimes,null,'time').length,1);
assert.equal(dayProgressRules(mixedTimes,null,'manual').length,2);
const manual=(id,done)=>({action:'manual',stopId:`source-${id}`,done});
const done=(value,id)=>progressEntry(value,stops.find(stop=>stop.id===id))?.done??false;
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function setup(intercept=async()=>{}) {
  let server=emptyItineraryProgress(),writes=[],inflight=0,maximum=0,state,idle=()=>{};
  const queue=new ProgressWriteQueue({now:()=>now,schedule:()=>schedule,read:async()=>structuredClone(server),write:async(action,revision)=>{
    maximum=Math.max(maximum,++inflight);writes.push(action);
    try {
      await intercept({action,revision,get:()=>server,set:value=>server=value});
      if(revision!==server.revision)throw Object.assign(new Error('conflict'),{status:409});
      server={...projectProgress(server,action,schedule,now),revision:server.revision+1};
      return structuredClone(server);
    }finally{inflight--;}
  },changed:(value,busy,error)=>state={value,busy,error},idle:()=>idle()});
  return {queue,get state(){return state;},get server(){return server;},get writes(){return writes;},get maximum(){return maximum;},setIdle:value=>idle=value};
}
{
  const hold=gate();let first=true;
  const t=setup(async()=>{if(first){first=false;await hold.promise;}});await t.queue.refresh();
  const a=t.queue.submit([manual('A',true)]),b=t.queue.submit([manual('B',true)]);
  assert.equal(done(t.state.value,'A'),true);assert.equal(done(t.state.value,'B'),true);assert.equal(t.server.entries.length,0);
  const bOff=t.queue.submit([manual('B',false)]),aOff=t.queue.submit([manual('A',false)]);
  assert.equal(done(t.state.value,'A'),false);assert.equal(done(t.state.value,'B'),false);
  hold.resolve();assert.deepEqual(await Promise.all([a,b,bOff,aOff]),[true,true,true,true]);
  assert.deepEqual(t.writes,[manual('A',true),manual('B',false),manual('A',false)]);assert.equal(t.maximum,1);assert.equal(t.state.busy,false);
}
{
  let conflict=true;
  const t=setup(async({get,set})=>{if(conflict){conflict=false;set({...projectProgress(get(),manual('C',true),schedule,now),revision:1});throw Object.assign(new Error('conflict'),{status:409});}});
  await t.queue.refresh();assert.equal(await t.queue.submit([manual('A',true)]),true);
  assert.equal(done(t.server,'A'),true);assert.equal(done(t.server,'C'),true);assert.equal(t.writes.length,2);assert.equal(t.maximum,1);
}
{
  const hold=gate();const t=setup(async({action})=>{if(action.stopId==='source-A'){await hold.promise;throw new Error('failed A');}});
  await t.queue.refresh();const a=t.queue.submit([manual('A',true)]),b=t.queue.submit([manual('B',true)]);
  hold.resolve();assert.deepEqual(await Promise.all([a,b]),[false,true]);
  assert.equal(done(t.state.value,'A'),false);assert.equal(done(t.state.value,'B'),true);assert.equal(t.state.error,'failed A');
}
{
  const t=setup(async({action,get,set})=>{set({...projectProgress(get(),action,schedule,now),revision:get().revision+1});throw new Error('response lost');});
  await t.queue.refresh();assert.equal(await t.queue.submit([manual('A',true)]),true);assert.equal(done(t.state.value,'A'),true);assert.equal(t.state.error,'');
}
{
  const t=setup();await t.queue.refresh();let fired=false;
  t.setIdle(()=>{if(!fired){fired=true;void t.queue.submit([manual('B',true)]);}});
  await t.queue.submit([manual('A',true)]);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(t.maximum,1);assert.equal(done(t.server,'B'),true);assert.equal(t.state.busy,false);
}
{
  let conflicts=0;const t=setup(async({get,set})=>{conflicts++;set({...get(),revision:get().revision+1});throw Object.assign(new Error('conflict'),{status:409});});
  await t.queue.refresh();assert.equal(await t.queue.submit([manual('A',true)]),false);assert.equal(conflicts,3);assert.equal(done(t.state.value,'A'),false);
}
{
  const t=setup();await t.queue.refresh();await t.queue.submit(stops.map(stop=>({action:'rule',rule:{stopId:stop.source_id,mode:'time',radiusMeters:150}})));
  await t.queue.submit([manual('B',false)]);await t.queue.submit([{action:'automatic'}]);
  assert.equal(done(t.server,'A'),true);assert.equal(done(t.server,'B'),false);assert.equal(done(t.server,'C'),true);
  const remaining=remainingItinerary(stops,t.server);assert.deepEqual(remaining.map(stop=>stop.id),['B']);
}
{
  const middle=projectProgress(emptyItineraryProgress(),manual('B',true),schedule,now);
  assert.deepEqual(remainingItinerary(stops,middle).map(stop=>stop.id),['A','C']);
  assert.deepEqual(remainingRoadPair(stops,'A','C'),{from:stops[0],to:stops[2]});
  for(const ids of [['C','A'],['A','A'],['foreign','C']])assert.equal(remainingRoadPair(stops,...ids),null);
  const flight=stops.map(stop=>({...stop,mode:stop.id==='B'?'flight':'ground'}));
  assert.equal(remainingRoadPair(flight,'A','C'),null);assert.equal(remainingItinerary(flight,middle)[1].mode,'flight');
  const all=stops.reduce((value,stop)=>projectProgress(value,manual(stop.id,true),schedule,now),emptyItineraryProgress());assert.deepEqual(remainingItinerary(stops,all),[]);
}
console.log('Progress queue: optimistic rapid toggles, coalescing, one writer, rebase, bounded conflicts, response loss, isolated rollback, time/manual priority and remaining road/flight paths passed.');
