import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { runCodexJob } from '../plugins/airo/scripts/app-server.mjs';
const db=new PGlite();
const owner=randomUUID(),other=randomUUID(),device=randomUUID(),second=randomUUID(),key='a'.repeat(64);
const rpc=async(op,id=null,data={},token=null)=>(await db.query('select public.ai_bridge($1,$2,$3,$4) result',[op,id,token,JSON.stringify(data)])).rows[0].result;
async function actor(id,extra={}){await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(id?{sub:id,role:'authenticated',...extra}:{})]);await db.exec(id?'set role authenticated':'set role anon');}
try {
  await db.exec(`create role anon;create role authenticated;create role service_role;create role supabase_auth_admin;create schema auth;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    grant usage on schema auth,public to anon,authenticated,supabase_auth_admin;
    grant execute on function auth.uid(),auth.jwt() to authenticated,anon;
    alter default privileges in schema public grant all on tables to authenticated;`);
  for(const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()) await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8').replace('create extension if not exists "pgcrypto";',''));
  await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)',[owner,'owner@test.invalid',other,'other@test.invalid']);
  await actor(null);await assert.rejects(rpc('devices'),/로그인/);await assert.rejects(db.query('select * from public.ai_devices'),/permission/);
  await actor(owner,{client_id:randomUUID()});await assert.rejects(rpc('pair',device,{name:'PC'},key),/로그인/);
  await actor(owner);await rpc('pair',device,{name:'PC'},key);await rpc('pair',device,{name:'PC'},key);
  const devices=await rpc('devices');assert.equal(devices.length,1);assert.equal(devices[0].state,'starting');assert.ok(!JSON.stringify(devices).includes(key));
  const trip=(await db.query("select public.create_trip_once('연결 검증',null,'bridge-fixture') result")).rows[0].result.trip.id;
  const job=randomUUID(),payload={message:'첫 장소의 시간을 바꿔줘',tools:[],snapshot:'fixture',history:[]};
  await assert.rejects(rpc('enqueue',job,{tripId:trip,deviceId:device,payload}),/연결/);
  await actor(other);await assert.rejects(rpc('pair',device,{name:'hijack'},key),/새 연결/);assert.equal((await rpc('devices')).length,0);
  await rpc('pair',second,{name:'other-PC'},'b'.repeat(64));
  await actor(null);await assert.rejects(rpc('worker_heartbeat',device,{state:'ready'},'b'.repeat(64)),/DEVICE_UNAUTHORIZED/);
  await rpc('worker_heartbeat',device,{state:'ready'},key);
  await actor(owner);await rpc('enqueue',job,{tripId:trip,deviceId:device,payload});await rpc('enqueue',job,{tripId:trip,deviceId:device,payload});
  assert.equal((await db.query('select count(*)::int n from public.messages where trip_id=$1',[trip])).rows[0].n,1);
  await assert.rejects(rpc('enqueue',randomUUID(),{tripId:trip,deviceId:device,payload}),/진행 중/);
  await actor(other);await assert.rejects(rpc('status',job),/찾을/);
  await actor(null);assert.equal(await rpc('worker_next',second,{},'b'.repeat(64)),null);
  assert.equal((await rpc('worker_next',device,{},key)).id,job);assert.equal(await rpc('worker_next',device,{},key),null);
  const callData={jobId:job,callKey:'tool-1',tool:'moveStop',arguments:{stopId:'fixture',time:'11:00'}};
  await rpc('worker_call',device,callData,key);await rpc('worker_call',device,callData,key);
  await assert.rejects(rpc('worker_call',device,{...callData,tool:'removeStop'},key),/mismatch/);
  await assert.rejects(rpc('worker_complete',device,{jobId:job},key),/pending/);
  await actor(owner);const call=await rpc('take_call',job);assert.equal(call.tripId,trip);assert.equal(await rpc('take_call',job),null,'a second web tab cannot execute a claimed tool');
  await rpc('finish_call',job,{callId:call.id,result:{success:true,data:{ok:true}}});
  await actor(null);assert.equal((await rpc('worker_call',device,callData,key)).result.success,true);
  await rpc('worker_progress',device,{jobId:job,text:'시간을 변경했어요.'},key);await rpc('worker_complete',device,{jobId:job},key);
  await assert.rejects(rpc('worker_complete',device,{jobId:job},key),/JOB_STOPPED/);
  await actor(owner);assert.equal((await rpc('status',job)).state,'completed');
  assert.equal((await db.query('select count(*)::int n from public.messages where trip_id=$1',[trip])).rows[0].n,2);
  const cancelJob=randomUUID();await rpc('enqueue',cancelJob,{tripId:trip,deviceId:device,payload});await rpc('revoke',device);
  assert.equal((await rpc('status',cancelJob)).state,'cancelled');assert.equal(await rpc('take_call',cancelJob),null);
  await actor(null);await assert.rejects(rpc('worker_next',device,{},key),/DEVICE_UNAUTHORIZED/);
  console.log('Bridge database: account isolation, pairing, hashed credentials, offline guard, queue/reply idempotency, exclusive tools, revocation passed.');
} finally {await db.close();}

// Drive the actual bridge state machine with a deterministic protocol peer.
const events=[],fixture={id:randomUUID(),payload:{message:'시간 수정',instructions:'fixture',snapshot:'fixture',history:[],tools:[{name:'moveStop',description:'move',inputSchema:{type:'object',properties:{}}}]}};
const peer={notify:()=>{},request:()=>{},call:async(method,params)=>{
  if(method==='thread/start'){assert.equal(params.sandbox,'read-only');assert.equal(params.approvalPolicy,'untrusted');assert.equal(params.dynamicTools[0].type,'function');return {thread:{id:'t'}};}
  if(method==='turn/start') {setTimeout(async()=>{
    assert.equal((await peer.request({method:'item/commandExecution/requestApproval'})).decision,'decline');
    assert.equal((await peer.request({method:'item/tool/call',params:{threadId:'t',tool:'deleteTrip',arguments:{},callId:'bad'}})).success,false);
    const result=await peer.request({method:'item/tool/call',params:{threadId:'t',tool:'moveStop',arguments:{stopId:'A'},callId:'good'}});
    assert.equal(result.success,true);peer.notify({method:'item/agentMessage/delta',params:{threadId:'t',delta:'수정했어요.'}});
    peer.notify({method:'turn/completed',params:{threadId:'t',turn:{id:'turn',status:'completed',error:null}}});
  },5);return {turn:{id:'turn'}};}
}};
await runCodexJob(peer,fixture,async(op,data)=>{events.push({op,data});return op==='call'?{state:'done',result:{success:true,data:{ok:true}}}:{ok:true};},'/fixture',{timeoutMs:5000});
assert.deepEqual(events.map(e=>e.op),['call','progress','complete']);assert.equal(events[1].data.text,'수정했어요.');
console.log('Codex protocol: streamed response, dynamic tool round trip, local-command rejection and account-tool rejection passed.');
