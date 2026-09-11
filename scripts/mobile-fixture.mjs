// Local-only browser fixture. Never points at the production database.
import { spawn, spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { startAuthFixture, token, sessionCookie, testOwner, testOther, secret } from './test-auth-fixture.mjs';
const setup=spawnSync('docker',['exec','-i','airo-migration-test','psql','-U','postgres','-d','airo_test','-v','ON_ERROR_STOP=1'],{input:`insert into auth.users(id,email) values('${testOwner}','owner@example.test'),('${testOther}','other@example.test') on conflict do nothing; notify pgrst, 'reload schema';`,encoding:'utf8'});
if(setup.status!==0) throw Error(setup.stderr);
const fixture=startAuthFixture();
const app=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','-p','3106'],{env:{...process.env,NEXT_DIST_DIR:'.next-mobile-fixture',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:3104',NEXT_PUBLIC_SUPABASE_ANON_KEY:token(testOwner,'anon'),NEXT_PUBLIC_SITE_URL:'http://127.0.0.1:3106',SUPABASE_JWT_SECRET:secret,OPENAI_API_KEY:''},stdio:['ignore','inherit','inherit']});
const stop=()=>{app.kill('SIGTERM');fixture.closeAllConnections();fixture.close();};
process.on('SIGTERM',stop);process.on('SIGINT',stop);

try {
 for(let n=0;n<100;n++) {
  try {if((await fetch('http://127.0.0.1:3106/login')).ok)break;} catch {}
  await new Promise(resolve=>setTimeout(resolve,200));
 }
 const archive=JSON.parse(await readFile('.private/exports/personal-trip.json','utf8'));
 archive.source_key='mobile:validation';archive.trip.title='가족과 함께 떠나는 아주 긴 여행 이름으로 확인하는 일본 여행 일정';
 const cookie=sessionCookie(testOwner);
 const response=await fetch('http://127.0.0.1:3106/api/trips/import',{method:'POST',headers:{Cookie:`${cookie.name}=${cookie.value}`,'Content-Type':'application/json'},body:JSON.stringify(archive)});
 const result=await response.json();if(!response.ok||!result.tripId)throw Error('Mobile fixture import failed');
 await writeFile('.private/mobile-trip.json',JSON.stringify({tripId:result.tripId}),{mode:0o600});
 console.log('Mobile fixture ready at http://127.0.0.1:3106');
} catch(error) {stop();throw error;}
