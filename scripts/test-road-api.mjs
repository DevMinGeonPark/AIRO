import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { startAuthFixture, token, sessionCookie, testOwner, testOther, secret } from './test-auth-fixture.mjs';

const base = 'http://127.0.0.1:3106', tripId = '55555555-5555-4555-8555-555555555555';
const ids = [1, 2, 3, 4].map(n => `66666666-6666-4666-8666-66666666666${n}`);
const points = [[135.7926827, 35.0116224], [135.7946821, 35.0215812], [135.7984287, 35.0269122], [139.7798, 35.5494]];
const sql = `insert into auth.users(id,email) values('${testOwner}','owner@example.test'),('${testOther}','other@example.test') on conflict do nothing; delete from public.trips where id='${tripId}'; insert into public.trips(id,user_id,title) values('${tripId}','${testOwner}','도로 경로 검증'); ${points.map(([lng,lat],i)=>`insert into public.stops(id,trip_id,name,lng,lat,day,position,mode) values('${ids[i]}','${tripId}','${['난젠지','철학의 길','은각사','항공 테스트'][i]}',${lng},${lat},${i===3?2:1},${i},'${i===3?'flight':'ground'}');`).join('')} notify pgrst, 'reload schema';`;
const setup = spawnSync('docker', ['exec', '-i', 'airo-route-validation-db', 'psql', '-U', 'postgres', '-d', 'airo_test', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8' });
assert.equal(setup.status, 0, setup.stderr);
const fixture = startAuthFixture();
const app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', '3106'], { env: { ...process.env, NEXT_DIST_DIR: '.next-route-fixture', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:3104', NEXT_PUBLIC_SUPABASE_ANON_KEY: token(testOwner, 'anon'), NEXT_PUBLIC_SITE_URL: base, SUPABASE_JWT_SECRET: secret, OPENAI_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; for (const stream of [app.stdout, app.stderr]) stream.on('data', chunk => { log += chunk; });
const cookie = id => { const c = sessionCookie(id); return `${c.name}=${c.value}`; };
const request = async (fromId, toId, owner = testOwner) => {
  const response = await fetch(`${base}/api/trips/${tripId}/routes`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(owner ? { Cookie: cookie(owner) } : {}) }, body: JSON.stringify({ fromId, toId }) });
  return { status: response.status, data: await response.json() };
};
let browser;
try {
  for (let i = 0; i < 150; i++) { try { if ((await fetch(base + '/login')).ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 200)); }
  assert.equal((await request(ids[0], ids[1], null)).status, 401);
  assert.equal((await request(ids[0], ids[1], testOther)).status, 404);
  assert.equal((await request(ids[0], ids[2])).status, 400);
  assert.equal((await request(ids[2], ids[3])).status, 400);
  const routed = await request(ids[0], ids[1]);
  assert.equal(routed.status, 200, JSON.stringify(routed.data));
  assert.ok(routed.data.coordinates.length > 20);
  assert.ok(routed.data.distance > 1000 && routed.data.distance < 3000);
  const started = Date.now();
  const cached = await request(ids[0], ids[1]);
  assert.deepEqual(cached.data, routed.data);
  assert.ok(Date.now() - started < 1200, 'Cached geometry should not call the upstream queue');
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.addCookies([sessionCookie(testOwner)]);
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/app/${tripId}`, { waitUntil: 'networkidle' });
  await expect(page.locator('.workspace-map')).toHaveAttribute('data-road-routes', '2', { timeout: 30000 });
  await expect(page.locator('.workspace-map')).toHaveAttribute('data-route-status', 'idle');
  await mkdir('assets/validation/roads', { recursive: true });
  await page.screenshot({ path: 'assets/validation/roads/workspace-mobile.png' });
  await page.route('**/api/trips/*/routes', route => route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'Fixture: route unavailable' }) }));
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('.workspace-map')).toHaveAttribute('data-route-status', 'unavailable');
  await expect(page.locator('.workspace-map')).toHaveAttribute('data-road-routes', '0');
  await expect(page.getByRole('button', { name: '다시 시도', exact: true })).toBeVisible();
  await page.unroute('**/api/trips/*/routes');
  await page.getByRole('button', { name: '다시 시도', exact: true }).click();
  await expect(page.locator('.workspace-map')).toHaveAttribute('data-road-routes', '2', { timeout: 30000 });
  assert.deepEqual(errors, []);
  await writeFile('assets/validation/roads/api-checks.json', JSON.stringify({ authenticated: true, isolation: true, adjacentOnly: true, flightExcluded: true, routeVertices: routed.data.coordinates.length, distance: routed.data.distance, cached: true, mobileRoutes: 2, unavailableAndRetry: true }, null, 2));
  console.log('✓ road API: authentication, RLS ownership, adjacent ground legs, real pedestrian geometry, caching, mobile error/retry');
} catch (error) { console.error(log.slice(-2000)); throw error; }
finally { await browser?.close(); app.kill('SIGTERM'); fixture.closeAllConnections(); fixture.close(); }
