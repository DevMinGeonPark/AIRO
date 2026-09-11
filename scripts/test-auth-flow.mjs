import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit, expect } from '@playwright/test';
import assert from 'node:assert/strict';
const cwd=fileURLToPath(new URL('..',import.meta.url)),origin='http://127.0.0.1:3431';
const out=cwd+'/assets/validation/auth-login';await mkdir(out,{recursive:true});
const testEnv={...process.env,NODE_ENV:'production',NEXT_DIST_DIR:'.next-airo-auth-check',NEXT_PUBLIC_SITE_URL:origin,NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:3432',NEXT_PUBLIC_SUPABASE_ANON_KEY:'fixture_auth_key',OPENAI_API_KEY:''};
const previousNextEnv=await readFile(cwd+'/next-env.d.ts','utf8');
async function restoreGeneratedTypes(){
 const config=JSON.parse(await readFile(cwd+'/tsconfig.json','utf8'));
 config.include=config.include.filter(path=>!path.startsWith('.next-airo-auth-check/'));
 await writeFile(cwd+'/tsconfig.json',JSON.stringify(config,null,2)+'\n');
 const current=await readFile(cwd+'/next-env.d.ts','utf8');
 if(current.includes('.next-airo-auth-check'))await writeFile(cwd+'/next-env.d.ts',previousNextEnv);
}
try{
 await new Promise((resolve,reject)=>{
  const build=spawn(process.execPath,['node_modules/next/dist/bin/next','build'],{cwd,env:testEnv,stdio:['ignore','pipe','pipe']});let output='';
  build.stdout.on('data',data=>output+=data);build.stderr.on('data',data=>output+=data);build.on('error',reject);
  build.on('exit',code=>code===0?resolve():reject(Error('Auth fixture build failed: '+output)));
 });
}finally{await restoreGeneratedTypes();}
let googleEnabled=true;const requests=[];
const user={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',email:'fixture@example.test',created_at:new Date().toISOString(),app_metadata:{provider:'google',providers:['google']},user_metadata:{}};
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt=b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:user.id,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000),email:user.email})+'.fixture-signature';
const auth=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1:3432');let body='';for await(const chunk of req)body+=chunk;const data=body?JSON.parse(body):{};requests.push({path:url.pathname,query:Object.fromEntries(url.searchParams),data});
 res.setHeader('Content-Type','application/json');
 if(url.pathname==='/auth/v1/settings')return res.end(JSON.stringify({external:{google:googleEnabled,email:true}}));
 if(url.pathname==='/auth/v1/otp')return res.end('{}');
 if(url.pathname==='/auth/v1/authorize'){assert.equal(url.searchParams.get('redirect_to'),origin+'/auth/callback');assert.equal(url.searchParams.get('provider'),'google');assert.ok(url.searchParams.get('code_challenge'));res.writeHead(303,{Location:origin+'/auth/callback?code=google-fixture-code'});return res.end();}
 if(url.pathname==='/auth/v1/token'){
  if(data.auth_code==='expired-fixture-code'){res.writeHead(400);return res.end(JSON.stringify({error:'invalid_grant',msg:'Code expired',code:'flow_state_expired'}));}
  assert.ok(data.code_verifier);return res.end(JSON.stringify({access_token:jwt,refresh_token:'fixture-refresh-token',token_type:'bearer',expires_in:3600,user}));
 }
 if(url.pathname==='/auth/v1/user')return res.end(JSON.stringify(user));
 res.writeHead(404);res.end('{}');
});
await new Promise(r=>auth.listen(3432,'127.0.0.1',r));
const proc=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3431'],{cwd,env:testEnv,stdio:['ignore','pipe','pipe']});
let logs='';proc.stdout.on('data',d=>logs+=d);proc.stderr.on('data',d=>logs+=d);
const checks=[];
try {
 for(let i=0;i<80;i++){if(proc.exitCode!==null)throw Error('Auth test server failed to start: '+logs);if(logs.includes('Ready'))break;await new Promise(r=>setTimeout(r,200));}
 if(!logs.includes('Ready'))throw Error('Auth test server did not become ready');
 for(const [name,engine,width] of [['chrome',chromium,1440],['chrome',chromium,390],['webkit',webkit,320]]){
  const browser=await engine.launch({headless:true,...(name==='chrome'?{channel:'chrome'}:{})});
  try{
   const ctx=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce'});const errors=[],external=[];
   await ctx.route('**/*',route=>{const u=new URL(route.request().url());if(!['127.0.0.1','localhost'].includes(u.hostname)){external.push(u.origin);return route.abort();}if(u.pathname==='/app/settings/keys'||u.pathname==='/app/connect')return route.fulfill({status:200,contentType:'text/html',body:'<main>Authenticated destination fixture</main>'});return route.continue();});
   const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
   const next='/app/connect?authorization_id=fixture-consent';
   await page.goto(origin+'/login?next='+encodeURIComponent(next));
   await page.getByRole('link',{name:'Google로 계속하기',exact:true}).click();
   await expect(page).toHaveURL(origin+next);
   const cookies=await ctx.cookies();assert.ok(cookies.some(c=>c.name.includes('auth-token')));assert.ok(!cookies.some(c=>c.name==='airo-login-next'));
   await ctx.clearCookies();
   await page.goto(origin+'/login?next=%2Fapp%2Fsettings%2Fkeys');
   await page.getByRole('textbox',{name:'이메일 주소'}).fill('fixture@example.test');
   await page.getByRole('button',{name:'메일로 로그인 링크 받기'}).click();
   await expect(page.getByRole('status')).toContainText('메일함');
   const otp=requests.filter(r=>r.path==='/auth/v1/otp').at(-1);assert.equal(otp.query.redirect_to,origin+'/auth/callback');assert.ok(otp.data.code_challenge);
   const nextCookie=(await ctx.cookies()).find(c=>c.name==='airo-login-next');assert.ok(nextCookie?.httpOnly);assert.equal(decodeURIComponent(nextCookie.value),'/app/settings/keys');
   await page.goto(origin+'/auth/callback?code=email-fixture-code');await expect(page).toHaveURL(origin+'/app/settings/keys');
   await ctx.clearCookies();
   await page.goto(origin+'/login?next='+encodeURIComponent(next));await page.getByRole('textbox',{name:'이메일 주소'}).fill('fixture@example.test');await page.getByRole('button',{name:'메일로 로그인 링크 받기'}).click();await expect(page.getByRole('status')).toContainText('메일함');
   await page.goto(origin+'/auth/callback?code=expired-fixture-code');await expect(page.locator('p[role=alert]')).toContainText('만료');assert.equal(new URL(page.url()).searchParams.get('next'),next);
   googleEnabled=false;await page.goto(origin+'/login');await expect(page.getByRole('button',{name:'Google로 계속하기'})).toBeDisabled();await expect(page.getByText('Google 로그인을 준비하고 있어요.',{exact:false})).toBeVisible();
   await page.screenshot({path:out+`/google-pending-${name}-${width}.png`,fullPage:true});
   googleEnabled=true;await page.reload();await expect(page.getByRole('link',{name:'Google로 계속하기'})).toBeVisible();
   await page.screenshot({path:out+`/google-enabled-${name}-${width}.png`,fullPage:true});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.goto(origin+'/login?error=__proto__');await expect(page.locator('p[role=alert]')).toContainText('인증');
   await page.setExtraHTTPHeaders({'x-forwarded-host':'127.0.0.1:3431'});
   await page.goto('http://localhost:3431/login?next=%2Fapp%2Fsettings%2Fkeys');await expect(page).toHaveURL(origin+'/login?next=%2Fapp%2Fsettings%2Fkeys');await page.setExtraHTTPHeaders({});
   const reject=await ctx.request.post(origin+'/auth/email',{headers:{Origin:'https://untrusted.example'},data:{email:'fixture@example.test',next:'/app'}});assert.equal(reject.status(),403);
   const canonical=await ctx.request.get('http://localhost:3431/login?next=%2Fapp%2Fsettings%2Fkeys',{maxRedirects:0});assert.equal(canonical.status(),307);assert.equal(canonical.headers().location,origin+'/login?next=%2Fapp%2Fsettings%2Fkeys');
   const redirect=await ctx.request.get(origin+'/auth/google?next=https%3A%2F%2Fevil.example',{maxRedirects:0});assert.equal(redirect.status(),303);assert.ok(redirect.headers()['set-cookie'].includes('airo-login-next=%2Fapp'));
   assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
   checks.push({name,width,googleFlow:true,emailFlow:true,exactCallback:true,nextCookie:true,expiredRetry:true,providerEnableWithoutBuild:true,canonicalRedirect:true,externalRedirectRejected:true,csrfRejected:true,overflow:false,actualEmailsSent:0});console.log(JSON.stringify(checks.at(-1)));
  }finally{await browser.close();}
 }
 await writeFile(out+'/checks.json',JSON.stringify(checks,null,2));
}finally{proc.kill('SIGTERM');auth.close();await writeFile(out+'/fixture.log',logs);}
