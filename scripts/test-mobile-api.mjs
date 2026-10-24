// Isolated synthetic accounts, real PostgreSQL/PostgREST RLS, simulated Auth.
// No production environment, personal fixtures, AI calls or billable providers.
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHmac, createHash, timingSafeEqual, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const base = 'http://127.0.0.1:3156';
const authBase = 'http://127.0.0.1:3154';
const key = 'airo-mobile-fixture-secret-never-production-2026';
const owner = '55555555-5555-4555-8555-555555555555';
const other = '66666666-6666-4666-8666-666666666666';
const prefix = `airo-native-test-${process.pid}`;
const db = `${prefix}-db`, rest = `${prefix}-rest`;
const artifacts = '.backups/android-completion';
const nativeUi = process.argv.includes('--native-ui');
mkdirSync(artifacts, { recursive: true });
const created = [];
let app, fixture, log = '';
let nativeLogin, nativeExchanges = 0, nativeLogouts = 0;
async function androidJourney(edition) {
  if (!nativeUi) return;
  const sdk = process.env.ANDROID_HOME;
  assert(sdk, 'Set ANDROID_HOME and run a dedicated emulator for --native-ui');
  for (const port of [3154, 3156]) command(`${sdk}/platform-tools/adb`, ['reverse', `tcp:${port}`, `tcp:${port}`]);
  const child = spawn('./android/gradlew', ['-p', 'android', ':app:connectedCloudDebugAndroidTest', '--console=plain', '--no-daemon',
    '-Pandroid.testInstrumentationRunnerArguments.class=com.heptivision.airo.CloudJourneyTest',
    '-Pandroid.testInstrumentationRunnerArguments.fixtureBase=http://127.0.0.1:3156',
    `-Pandroid.testInstrumentationRunnerArguments.fixtureEdition=${edition}`], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output += chunk; });
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  writeFileSync(`${artifacts}/native-${edition}-journey.log`, output);
  assert.equal(code, 0, output.slice(-6000));
}
function command(cmd, args, input) {
  const result = spawnSync(cmd, args, { input, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  if (result.status !== 0) throw Error(`${cmd} ${args.slice(0, 3).join(' ')} failed: ${result.stderr}`);
  return result.stdout.trim();
}
function sql(query) { return command('docker', ['exec', '-i', db, 'psql', '-U', 'postgres', '-d', 'airo', '-v', 'ON_ERROR_STOP=1', '-Atq'], query); }
function token(id = owner, extra = {}) {
  const encode = x => Buffer.from(JSON.stringify(x)).toString('base64url');
  const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: id, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now()/1000) + 7200, ...extra })}`;
  return `${body}.${createHmac('sha256', key).update(body).digest('base64url')}`;
}
const cookie = id => `sb-127-auth-token=base64-${Buffer.from(JSON.stringify({ access_token: token(id), refresh_token: 'fixture', expires_at: Math.floor(Date.now()/1000)+7200, token_type: 'bearer', user: { id, email: 'fixture@example.test' } })).toString('base64url')}`;
async function waitFor(check, name, max = 180) {
  for (let n=0; n<max; n++) { try { if (await check()) return; } catch {} await delay(250); }
  throw Error(`Timed out: ${name}`);
}
async function request(path, { bearer = token(), headers = {}, method = 'GET', body } = {}) {
  const response = await fetch(base + path, { method, headers: { ...(bearer === null ? {} : { Authorization: `Bearer ${bearer}` }), 'Content-Type': 'application/json', ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), redirect: 'manual' });
  return { status: response.status, headers: response.headers, data: await response.json().catch(() => null) };
}
async function cleanup() {
  if (app && app.exitCode === null) { app.kill('SIGTERM'); await Promise.race([new Promise(r => app.once('exit', r)), delay(5000)]); }
  fixture?.closeAllConnections(); fixture?.close();
  for (const name of created.reverse()) spawnSync('docker', ['rm', '-f', name], { stdio: 'ignore' });
  spawnSync('docker', ['network', 'rm', prefix], { stdio: 'ignore' });
  writeFileSync(`${artifacts}/mobile-api-server.log`, log);
  // Next adds its test output directory to tsconfig; remove only our own entries.
  const config = JSON.parse(readFileSync('tsconfig.json', 'utf8'));
  config.include = config.include.filter(path => !path.startsWith('.next-native-fixture/') && !path.startsWith('.next-native-community/'));
  writeFileSync('tsconfig.json', JSON.stringify(config, null, 2) + '\n');
}
try {
  command('docker', ['network', 'create', prefix]);
  command('docker', ['run', '-d', '--name', db, '--network', prefix, '-e', 'POSTGRES_DB=airo', '-e', 'POSTGRES_PASSWORD=fixture-only', 'postgres:17-alpine']); created.push(db);
  // The image starts a temporary socket-only server before creating POSTGRES_DB.
  await waitFor(() => spawnSync('docker', ['exec', db, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'airo'], { stdio: 'ignore' }).status === 0, 'Postgres');
  sql(`create role anon nologin; create role authenticated nologin; create role supabase_auth_admin nologin;
create role authenticator noinherit login password 'fixture-only'; grant anon,authenticated to authenticator;
create schema auth; create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
grant usage on schema auth,public to anon,authenticated,supabase_auth_admin;
grant execute on function auth.uid(),auth.jwt() to anon,authenticated;
alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;`);
  for (const file of readdirSync('supabase/migrations').filter(x => x.endsWith('.sql')).sort()) sql(readFileSync(`supabase/migrations/${file}`, 'utf8'));
  sql(`insert into auth.users(id,email) values('${owner}','native-owner@example.test'),('${other}','native-other@example.test');`);
  command('docker', ['run', '-d', '--name', rest, '--network', prefix, '-p', '127.0.0.1:3155:3000', '-e', `PGRST_DB_URI=postgres://authenticator:fixture-only@${db}:5432/airo`, '-e', 'PGRST_DB_ANON_ROLE=anon', '-e', `PGRST_JWT_SECRET=${key}`, 'public.ecr.aws/supabase/postgrest:v16.1']); created.push(rest);
  await waitFor(async () => (await fetch('http://127.0.0.1:3155/')).ok, 'PostgREST');
  fixture = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, authBase);
      const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
      if (url.pathname === '/auth/v1/otp' && nativeUi) {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const body = JSON.parse(Buffer.concat(chunks));
        assert.equal(body.email, 'native-ui@example.test');
        assert.equal(body.code_challenge_method, 's256');
        const callback = new URL(url.searchParams.get('redirect_to'));
        assert.equal(callback.origin, 'null');
        assert.equal(callback.protocol, 'com.heptivision.airo:');
        callback.searchParams.set('code', 'synthetic-once');
        nativeLogin = { callback: callback.toString(), challenge: body.code_challenge };
        return json(200, {});
      }
      if (url.pathname === '/__fixture/callback' && nativeUi) return json(200, { callback: nativeLogin?.callback });
      if (url.pathname === '/auth/v1/token' && nativeUi) {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const body = JSON.parse(Buffer.concat(chunks));
        assert.equal(url.searchParams.get('grant_type'), 'pkce');
        assert.equal(body.auth_code, 'synthetic-once');
        assert.equal(createHash('sha256').update(body.code_verifier).digest('base64url'), nativeLogin.challenge);
        nativeExchanges++;
        nativeLogin = null;
        return json(200, { access_token: token(), refresh_token: 'synthetic-refresh', expires_in: 7200, user: { id: owner, email: 'native-ui@example.test' } });
      }
      if (url.pathname === '/auth/v1/logout' && nativeUi) { nativeLogouts++; return json(200, {}); }
      if (req.url.startsWith('/rest/v1/')) {
        const chunks = []; for await (const part of req) chunks.push(part);
        const headers = { ...req.headers }; delete headers.host; delete headers['content-length'];
        const response = await fetch(`http://127.0.0.1:3155/${req.url.slice(9)}`, { method: req.method, headers, body: ['GET','HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
        res.writeHead(response.status, Object.fromEntries([...response.headers].filter(([n]) => !['content-encoding','transfer-encoding'].includes(n))));
        return res.end(Buffer.from(await response.arrayBuffer()));
      }
      if (req.url !== '/auth/v1/user') throw Error('Unexpected Auth endpoint');
      const bearer = req.headers.authorization?.replace(/^Bearer /i, '') ?? '';
      const [head, body, signature] = bearer.split('.');
      const actual = Buffer.from(signature ?? '', 'base64url');
      const expected = createHmac('sha256', key).update(`${head}.${body}`).digest();
      const claims = JSON.parse(Buffer.from(body ?? '', 'base64url'));
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected) || claims.exp <= Date.now()/1000 || ![owner,other].includes(claims.sub)) throw Error('Invalid fixture token');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: claims.sub, email: 'fixture@example.test', aud: claims.aud, role: claims.role, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }));
    } catch { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ message: 'Invalid fixture session' })); }
  });
  await new Promise(resolve => fixture.listen(3154, '127.0.0.1', resolve));
  app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '-p', '3156'], { env: { ...process.env, NEXT_DIST_DIR: '.next-native-fixture', NEXT_PUBLIC_AIRO_EDITION: 'cloud', NEXT_PUBLIC_SUPABASE_URL: authBase, NEXT_PUBLIC_SUPABASE_ANON_KEY: token(owner, { role: 'anon' }), NEXT_PUBLIC_SITE_URL: base, AIRO_SITE_URL: base, SUPABASE_JWT_SECRET: key, OPENAI_API_KEY: '', GOOGLE_MAPS_API_KEY: '', DEMO_DB_PATH: `${artifacts}/unused-demo.json` }, stdio: ['ignore','pipe','pipe'] });
  for (const stream of [app.stdout, app.stderr]) stream.on('data', chunk => { log += chunk; });
  await waitFor(async () => (await fetch(`${base}/auth/mobile/config`)).ok, 'Next.js mobile config');
  const configuration = await request('/auth/mobile/config', { bearer: null });
  assert.equal(configuration.data.redirectUri, 'com.heptivision.airo://auth/callback');
  assert.equal(configuration.data.supabaseUrl, authBase);
  assert.equal((await request('/api/mobile/trips', { bearer: null })).status, 401);
  for (const bearer of ['invalid', token(owner, { exp: 1 }), token(owner, { role: 'anon' })]) {
    assert.equal((await request('/api/mobile/trips', { bearer, headers: { Cookie: cookie(owner) } })).status, 401, 'Bad bearer must never fall back to valid cookie');
  }
  assert.equal((await request('/api/mobile/trips', { headers: { Authorization: 'Basic invalid', Cookie: cookie(owner) } })).status, 401);
  const createdTrip = await request('/api/trips', { method: 'POST', body: { title: 'Synthetic native trip', start_date: '2026-10-01' } });
  assert.equal(createdTrip.status, 201, JSON.stringify(createdTrip));
  const id = createdTrip.data.trip.id;
  const summary = await request('/api/mobile/trips');
  assert.equal(summary.status, 200, JSON.stringify(summary));
  assert.equal(summary.data.trips[0].trip.id, id);
  assert.equal(summary.data.plan, 'free');
  assert.match(summary.headers.get('cache-control'), /no-store/);
  assert.equal((await request(`/api/trips/${id}`, { bearer: token(other), headers: { Cookie: cookie(owner) } })).status, 404, 'Bearer identity must win over a different cookie');
  assert.equal((await request(`/api/trips/${id}`, { bearer: token(), headers: { Cookie: cookie(other) } })).status, 200);
  assert.equal((await request(`/api/trips/${id}`, { bearer: null, headers: { Cookie: cookie(owner) } })).status, 200, 'Browser cookies still work');
  assert.equal((await request(`/api/trips/${id}`, { method: 'PATCH', body: { title: 'blocked' }, headers: { Origin: 'https://foreign.example', 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  const added = await request(`/api/trips/${id}`, { method: 'POST', body: { name: 'Synthetic stop', lat: 41.9, lng: 12.48, day: 1, mode: 'ground' } });
  assert.equal(added.status, 201, JSON.stringify(added));
  const stop = added.data.stop.id;
  assert.equal((await request(`/api/trips/${id}/stops/${stop}`, { method: 'PATCH', bearer: token(other), body: { note: 'intrusion' } })).status, 404);
  assert.equal((await request(`/api/trips/${id}/stops/${stop}`, { method: 'PATCH', body: { note: 'saved from native', day: 2 } })).status, 200);
  const detail = await request(`/api/trips/${id}`);
  assert.equal(detail.data.stops[0].note, 'saved from native');
  assert.equal(detail.data.stops[0].day, 2);
  const budget = await request(`/api/trips/${id}/budget`);
  assert.equal(budget.status, 200, JSON.stringify(budget));
  const savedBudget = await request(`/api/trips/${id}/budget`, { method: 'PUT', body: { ...budget.data, reserve: 15000 } });
  assert.equal(savedBudget.status, 200, JSON.stringify(savedBudget));
  assert.equal((await request(`/api/trips/${id}/budget`, { method: 'PUT', body: budget.data })).status, 409, 'Stale budget cannot overwrite saved values');
  assert.equal((await request('/api/mobile/places', { method: 'POST', body: { query: 'x', allowGoogle: true } })).status, 400);
  const place = { id: 'fixture-place', name: 'Synthetic café', lat: 41.9, lng: 12.48, day: 1, address: 'Fixture street', category: 'cafe' };
  assert.equal((await request(`/api/trips/${id}/places`, { method: 'POST', body: place })).status, 200);
  let resources = await request(`/api/mobile/trips/${id}/resources`);
  assert.equal(resources.status, 200, JSON.stringify(resources));
  assert.equal(resources.data.places[0].id, place.id);
  assert.deepEqual(resources.data.savedPlaceIds, [place.id]);
  assert.equal((await request(`/api/mobile/trips/${id}/resources`, { bearer: token(other) })).status, 404);
  assert.equal((await request(`/api/trips/${id}/saved`, { method: 'POST', bearer: token(other), body: { ids: [place.id], saved: false } })).status, 404);
  assert.equal((await request(`/api/trips/${id}/saved`, { method: 'POST', body: { ids: [place.id], saved: false } })).status, 200);
  resources = await request(`/api/mobile/trips/${id}/resources`);
  assert.deepEqual(resources.data.savedPlaceIds, []);
  const pdf = Buffer.from('%PDF-1.4\n% synthetic transport fixture\n%%EOF\n');
  const document = { name: 'Synthetic reservation.pdf', mime: 'application/pdf', base64: pdf.toString('base64'), sha256: createHash('sha256').update(pdf).digest('hex') };
  sql(`update public.trip_archives set data = jsonb_set(data, '{documents}', '${JSON.stringify([document]).replaceAll("'", "''")}'::jsonb) where trip_id = '${id}';`);
  resources = await request(`/api/mobile/trips/${id}/resources`);
  assert.equal(resources.data.documents[0].sha256, document.sha256);
  assert.equal('base64' in resources.data.documents[0], false, 'Do not return whole PDFs in list payloads');
  const downloaded = await fetch(`${base}/api/trips/${id}/documents/0`, { headers: { Authorization: `Bearer ${token()}` } });
  assert.equal(downloaded.status, 200);
  assert.equal(downloaded.headers.get('content-type'), 'application/pdf');
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), pdf);
  assert.equal((await request(`/api/trips/${id}/documents/0`, { bearer: token(other) })).status, 404);
  // Phone workflows reuse management RPCs: PDFs, explicit place links, reservations and history.
  const mobile = `/api/mobile/trips/${id}`;
  const uploadBody = { name: 'Boarding pass.pdf', base64: Buffer.from('%PDF-1.4\n% phone upload\n%%EOF\n').toString('base64'), stopIds: [stop] };
  assert.equal((await request(`${mobile}/documents`, { method: 'POST', bearer: null, body: uploadBody })).status, 401);
  assert.equal((await request(`${mobile}/documents`, { method: 'POST', bearer: token(other), body: uploadBody })).status, 404);
  assert.equal((await request(`${mobile}/documents`, { method: 'POST', body: { ...uploadBody, stopIds: ['foreign-stop'] } })).status, 400);
  assert.equal((await request(`${mobile}/documents`, { method: 'POST', body: { ...uploadBody, base64: Buffer.from('not a PDF').toString('base64') } })).status, 400);
  const browserOwner = { bearer: null, headers: { Cookie: cookie(owner), Origin: base, 'Sec-Fetch-Site': 'same-origin' } };
  const uploaded = await request(`${mobile}/documents`, { ...browserOwner, method: 'POST', body: uploadBody });
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded));
  const hash = uploaded.data.document.sha256;
  assert.deepEqual(uploaded.data.document.stopIds, [stop]);
  assert.equal('base64' in uploaded.data.document, false);
  await request(`${mobile}/documents`, { method: 'POST', body: uploadBody });
  resources = await request(`${mobile}/resources`);
  assert.equal(resources.data.documents.length, 2, 'Retrying the same PDF must not create a duplicate');
  assert.equal(resources.data.stops[0].id, stop);
  assert.equal(resources.data.trip.id, id);
  assert.deepEqual(resources.data.documents.find(d => d.sha256 === hash).stopIds, [stop]);
  assert.deepEqual((await request(`/api/trips/${id}`)).data.attachments.documents.find(d => d.sha256 === hash).stopIds, [stop], 'Web and phone must see the same attachment');
  const byHash = await fetch(`${base}/api/trips/${id}/documents/${hash}?view=1`, { headers: { Authorization: `Bearer ${token()}` } });
  assert.equal(byHash.status, 200);
  assert.match(byHash.headers.get('content-disposition'), /^inline/);
  assert.deepEqual(Buffer.from(await byHash.arrayBuffer()).toString('base64'), uploadBody.base64);
  assert.equal((await request(`/api/trips/${id}/documents/${hash}`, { bearer: token(other) })).status, 404);
  const linkBody = { sha256: hash, stopIds: [] };
  assert.equal((await request(`${mobile}/documents`, { method: 'PUT', body: linkBody })).status, 200);
  assert.deepEqual((await request(`${mobile}/resources`)).data.documents.find(d => d.sha256 === hash).stopIds, []);
  assert.equal((await request(`${mobile}/documents`, { method: 'PUT', body: { ...linkBody, stopIds: [stop] } })).status, 200);
  const reservation = { id: randomUUID(), name: 'Synthetic flight', stopId: stop, stopIds: [], bookingUrl: 'https://example.test/booking',
    documentSha256s: [hash], bookingStatus: 'confirmed', paymentStatus: 'paid', reference: 'FIXTURE', note: 'No payment is performed' };
  const beforeReservations = await request(`${mobile}/reservations`);
  assert.equal(beforeReservations.status, 200);
  const reservationSaved = await request(`${mobile}/reservations`, { ...browserOwner, method: 'PUT', body: { revision: beforeReservations.data.revision, reservation } });
  assert.equal(reservationSaved.status, 200, JSON.stringify(reservationSaved));
  assert.equal((await request(`${mobile}/reservations`, { method: 'PUT', body: { revision: beforeReservations.data.revision, reservation } })).status, 409);
  assert.equal((await request(`${mobile}/reservations`, { bearer: token(other) })).status, 404);
  assert.equal((await request(`${mobile}/reservations`, { method: 'PUT', body: { revision: reservationSaved.data.reservations.revision, reservation: { ...reservation, bookingUrl: 'javascript:alert(1)' } } })).status, 400);
  assert.deepEqual((await request(`${mobile}/resources`)).data.reservations.entries, [reservation]);
  assert.deepEqual((await request(`${mobile}/resources`, browserOwner)).data.reservations.entries, [reservation], 'Web cookies and app bearer read the same saved records');
  assert.equal((await request(`${mobile}/reservations`, { ...browserOwner, headers: { Cookie: cookie(other) } })).status, 404);
  assert.equal((await request(`${mobile}/documents`, { ...browserOwner, method:'POST', body:uploadBody, headers:{Cookie:cookie(owner),Origin:'https://foreign.example','Sec-Fetch-Site':'cross-site'} })).status,403);
  assert.deepEqual((await request(`/api/trips/${id}`)).data.attachments.reservations, [reservation]);
  const changes = await request(`${mobile}/changes?limit=2`);
  assert.equal(changes.status, 200, JSON.stringify(changes));
  assert.equal(changes.data.changes.length, 2);
  const changeId = changes.data.changes[0].id;
  const change = await request(`${mobile}/changes/${changeId}`);
  assert.equal(change.status, 200);
  assert.ok(change.data.changes.reservations);
  assert.equal((await request(`${mobile}/changes`, { bearer: token(other) })).status, 404);
  assert.equal((await request(`${mobile}/changes/${changeId}`, { bearer: token(other) })).status, 404);
  assert.equal((await request(`${mobile}/changes/${changeId}`, { method: 'POST', body: { expectedLatestChangeId: '1' } })).status, 409);
  assert.equal((await request(`${mobile}/changes/${changeId}`, { method: 'POST', body: { expectedLatestChangeId: changeId } })).status, 200);
  assert.deepEqual((await request(`${mobile}/reservations`)).data.entries, []);
  const historyExport = await request(`/api/trips/${id}/export`);
  assert.deepEqual(historyExport.data.data.documents.find(d => d.sha256 === hash).stopIds, [stop]);
  assert.equal(historyExport.data.data.documents.find(d => d.sha256 === hash).base64, uploadBody.base64);
  const linkedExpense = { id: randomUUID(), name: 'Linked booking', category: 'flight', day: 2, amount: 120, currency: 'EUR', exchangeRate: 1500, paid: true, reservationId: reservation.id };
  const linkedBudget = await request(`/api/trips/${id}/budget`, { method: 'PUT', body: { ...savedBudget.data, entries: [linkedExpense] } });
  assert.equal(linkedBudget.status, 200, JSON.stringify(linkedBudget));
  assert.deepEqual(linkedBudget.data.entries, [linkedExpense]);
  assert.equal((await request(`/api/trips/${id}/budget`)).data.entries[0].reservationId, reservation.id);
  assert.equal((await request(`/api/trips/${id}/budget`, { method: 'PUT', body: { ...linkedBudget.data, entries: [linkedExpense, { ...linkedExpense, id: randomUUID() }] } })).status, 400, 'A booking cannot create duplicate ledger entries');
  assert.equal((await request(`/api/trips/${id}/export`)).data.data.expenseBudget.entries[0].reservationId, reservation.id);
  const legacyExpense = { ...linkedExpense };
  delete legacyExpense.reservationId;
  const legacySaved = await request(`/api/trips/${id}/budget`, { method: 'PUT', body: { ...linkedBudget.data, entries: [{ ...legacyExpense, name: 'Edited by an older app' }] } });
  assert.equal(legacySaved.status, 200, JSON.stringify(legacySaved));
  assert.equal(legacySaved.data.entries[0].reservationId, reservation.id, 'Old apps preserve links they do not understand');
  assert.equal(legacySaved.data.entries[0].id, linkedExpense.id);
  const archive = { format: 'airo-trip', version: 1, source_key: 'native:synthetic-archive', exported_at: new Date().toISOString(), trip: { title: 'Imported fixture', start_date: null },
    stops: [{ source_id: 'first-stop', name: 'Imported stop', lat: 41.9, lng: 12.48, day: 0, position: 0 }],
    data: { documents: [document], originalTrip: { preserve: true }, sourceFiles: { document: document.sha256 } } };
  const imported = await request('/api/trips/import', { method: 'POST', body: archive });
  assert.equal(imported.status, 201, JSON.stringify(imported));
  assert.equal((await request('/api/trips/import', { method: 'POST', body: archive })).status, 200);
  const exported = await request(`/api/trips/${imported.data.tripId}/export`);
  assert.equal(exported.status, 200, JSON.stringify(exported));
  assert.deepEqual(exported.data.data.documents, archive.data.documents);
  assert.deepEqual(exported.data.data.originalTrip, archive.data.originalTrip);
  assert.deepEqual(exported.data.data.sourceFiles, archive.data.sourceFiles);
  assert.equal(exported.data.stops[0].day, 0);
  assert.equal((await request(`/api/trips/${imported.data.tripId}/export`, { bearer: token(other) })).status, 404);
  assert.equal((await request('/api/trips/import', { method: 'POST', body: { ...archive, data: { documents: [{ ...document, sha256: '0'.repeat(64) }] } } })).status, 400);
  await request(`/api/trips/${imported.data.tripId}`, { method: 'DELETE' });
  // One slot is shared by web cookie and native bearer, with the same optimistic revision.
  const choicePath = `/api/trips/${id}/choices`;
  const beforeChoices = (await request(`/api/trips/${id}`)).data.stops;
  const anchor = beforeChoices.find(s => s.id === stop);
  const choiceBody = { label: '점심', kind: 'meal', day: anchor.day, time: '12:00', afterStopId: stop, requestId: 'mobile-choice-fixture', candidates: [
    {id:'a',name:'선택 A',lng:130.39,lat:33.59}, {id:'b',name:'선택 B',lng:130.42,lat:33.6},
  ] };
  assert.equal((await request(choicePath,{method:'POST',bearer:null,body:choiceBody})).status,401);
  assert.equal((await request(choicePath,{method:'POST',bearer:token(other),body:choiceBody})).status,404);
  assert.equal((await request(choicePath,{method:'POST',headers:{Origin:'https://foreign.example'},body:choiceBody})).status,403);
  const choiceCreated=await request(choicePath,{...browserOwner,method:'POST',body:choiceBody});
  assert.equal(choiceCreated.status,201,JSON.stringify(choiceCreated));
  let choiceStop=choiceCreated.data.stop;
  assert.equal(choiceStop.choice.selectedId,null);
  assert.equal((await request(choicePath,{method:'POST',body:choiceBody})).data.stop.id,choiceStop.id);
  const sharedChoice=(await request(`/api/trips/${id}`)).data.stops.find(s=>s.id===choiceStop.id);
  assert.equal(sharedChoice.choice.candidates.length,2);
  const selectedChoice=await request(choicePath,{method:'PATCH',body:{action:'select',stopId:choiceStop.id,revision:choiceStop.choice.revision,candidateId:'b'}});
  assert.equal(selectedChoice.status,200,JSON.stringify(selectedChoice));assert.equal(selectedChoice.data.stop.name,'선택 B');
  assert.equal((await request(choicePath,{method:'PATCH',body:{action:'select',stopId:choiceStop.id,revision:choiceStop.choice.revision,candidateId:'a'}})).status,409);
  choiceStop=selectedChoice.data.stop;
  assert.equal((await request(choicePath,{method:'PATCH',body:{action:'select',stopId:choiceStop.id,revision:choiceStop.choice.revision,candidateId:'missing'}})).status,400);
  const resetChoice=await request(choicePath,{...browserOwner,method:'PATCH',body:{action:'select',stopId:choiceStop.id,revision:choiceStop.choice.revision,candidateId:null}});
  assert.equal(resetChoice.status,200,JSON.stringify(resetChoice));assert.equal(resetChoice.data.stop.choice.selectedId,null);
  const choiceProgress=(await request(`/api/trips/${id}/progress`)).data;
  assert.equal((await request(`/api/trips/${id}/progress`,{method:'PATCH',body:{action:'manual',revision:choiceProgress.revision,stopId:choiceStop.id,done:true}})).status,400);
  await request(`/api/trips/${id}/stops/${choiceStop.id}`,{method:'DELETE'});
  assert.equal((await request(`/api/trips/${id}`)).data.stops.length,beforeChoices.length);
  console.log('Choice APIs passed: web/native shared slot, idempotency, RLS/CSRF, selection/reset, stale revision and unresolved progress rejection');
  // Latest web features use the same native bearer identity and optimistic revisions.
  const progressPath = `/api/trips/${id}/progress`, prepPath = `/api/trips/${id}/predeparture`, imagesPath = `/api/trips/${id}/images`;
  for (const path of [progressPath, prepPath, imagesPath, `/api/trips/${id}?include=routes`]) {
    assert.equal((await request(path, { bearer: null })).status, 401);
    assert.equal((await request(path, { bearer: token(other) })).status, 404);
  }
  const progress = await request(progressPath);
  assert.equal(progress.status, 200, JSON.stringify(progress));
  const completed = await request(progressPath, { method: 'PATCH', body: { revision: progress.data.revision, action: 'manual', stopId: stop, done: true } });
  assert.equal(completed.status, 200, JSON.stringify(completed));
  assert.equal(completed.data.entries[0].done, true);
  assert.equal((await request(progressPath, { method: 'PATCH', body: { revision: progress.data.revision, action: 'manual', stopId: stop, done: false } })).status, 409);
  assert.equal((await request(progressPath, { method: 'PATCH', body: { revision: completed.data.revision, action: 'manual', stopId: 'foreign-stop', done: true } })).status, 404);
  assert.equal((await request(progressPath, { method: 'PATCH', headers: { Origin: 'https://foreign.example' }, body: { revision: completed.data.revision, action: 'manual', stopId: stop, done: false } })).status, 403);
  const preparation = await request(prepPath);
  assert.equal(preparation.status, 200);
  assert.equal(preparation.data.items.length, 8);
  const prepSaved = await request(prepPath, { method: 'PUT', body: { ...preparation.data, items: [...preparation.data.items, { id: randomUUID(), title: 'Native preparation', category: 'tasks', done: false }] } });
  assert.equal(prepSaved.status, 200, JSON.stringify(prepSaved));
  assert.equal((await request(prepPath, { method: 'PUT', body: preparation.data })).status, 409);
  const png = await (await import('sharp')).default({ create: { width: 32, height: 32, channels: 4, background: '#86a5ff' } }).png().toBuffer();
  const imageUploaded = await request(imagesPath, { method: 'POST', body: { name: 'Synthetic QR image', mime: 'image/png', base64: png.toString('base64'), sourceUrl: 'https://example.test/qr', capturedAt: new Date().toISOString() } });
  assert.equal(imageUploaded.status, 201, JSON.stringify(imageUploaded));
  const imageList = await request(imagesPath);
  assert.equal(imageList.data.images.length, 1);
  assert.equal('base64' in imageList.data.images[0], false);
  const imagePath = `${imagesPath}/${imageUploaded.data.image.sha256}`;
  assert.equal((await request(imagePath, { bearer: token(other) })).status, 404);
  const imageBytes = await fetch(base + imagePath, { headers: { Authorization: `Bearer ${token()}` } });
  assert.equal(imageBytes.status, 200);
  assert.deepEqual(Buffer.from(await imageBytes.arrayBuffer()), png);
  const savedRoads = { 'fixture-a->fixture-b': { coordinates: [[12.48,41.9], [12.481,41.901], [12.482,41.902]], distance: 280, duration: 210 } };
  sql(`update public.trip_archives set data = jsonb_set(data, '{routes}', '${JSON.stringify(savedRoads)}'::jsonb) where trip_id = '${id}';`);
  const routed = await request(`/api/trips/${id}?include=routes`);
  assert.equal(routed.status, 200, JSON.stringify(routed));
  assert.deepEqual(routed.data.roads, savedRoads);
  assert.equal('roads' in (await request(`/api/trips/${id}`)).data, false, 'The existing web response stays unchanged');
  assert.ok(!JSON.stringify(routed.data).includes(document.base64), 'Map reads must not load original PDF bytes');
  assert.ok(!JSON.stringify(routed.data).includes(png.toString('base64')), 'Map reads must not load image bytes');
  console.log('Native web parity APIs passed: saved road geometry, progress, preparation, images, bearer RLS, revision conflicts, CSRF');
  // Simulate the subscription worker protocol locally. No model is invoked.
  const deviceId = randomUUID(), deviceKey = 'a'.repeat(64), jobId = randomUUID();
  const worker = (op, data = {}) => request('/api/bridge/worker', { method: 'POST', bearer: deviceKey, body: { op, id: deviceId, data } });
  assert.equal((await request('/api/bridge/devices', { method: 'POST', body: { action: 'pair', id: deviceId, key: deviceKey, name: 'Synthetic subscription worker' } })).status, 200);
  assert.equal((await worker('heartbeat', { state: 'api_account' })).status, 200);
  const job = { id: jobId, tripId: id, deviceId, message: 'Change fixture stop note', context: { day: 2, stopId: stop, documents: [hash] } };
  assert.equal((await request('/api/bridge/jobs', { method: 'POST', body: job })).status, 409, 'API-account devices must not accept a subscription job');
  await worker('heartbeat', { state: 'ready' });
  assert.equal((await request('/api/bridge/devices', { bearer: token(other) })).data.devices.length, 0);
  assert.equal((await request('/api/bridge/jobs', { method: 'POST', body: job })).status, 200);
  assert.equal((await request('/api/bridge/jobs', { method: 'POST', body: job })).status, 200, 'Lost-response retries must be idempotent');
  assert.equal((await request('/api/bridge/jobs', { method: 'POST', body: { ...job, id: randomUUID(), context: { day: 1, stopId: stop, documents: [] } } })).status, 409);
  assert.equal((await request('/api/bridge/jobs', { method: 'POST', body: { ...job, id: randomUUID(), context: { stopId: 'foreign-stop', documents: [] } } })).status, 400);
  assert.equal((await request('/api/bridge/jobs', { method: 'POST', body: { ...job, id: randomUUID(), context: { documents: ['0'.repeat(64)] } } })).status, 400);
  const nextJob = (await worker('next')).data;
  assert.equal(nextJob.id, jobId);
  assert.ok(JSON.stringify(nextJob).includes(hash), 'Selected PDF metadata reaches the subscription worker');
  assert.ok(!JSON.stringify(nextJob).includes(uploadBody.base64), 'PDF bytes are not duplicated in every AI request');
  const call = { jobId, callKey: 'fixture-note', tool: 'moveStop', arguments: { stopId: stop, note: 'Changed by native subscription bridge' } };
  assert.equal((await worker('call', call)).data.state, 'pending');
  assert.equal((await request(`/api/bridge/jobs/${jobId}`)).data.pending, true);
  assert.equal((await request(`/api/bridge/jobs/${jobId}`, { bearer: token(other) })).status, 409);
  const tick = await request(`/api/bridge/jobs/${jobId}`, { method: 'POST', body: { action: 'tick' } });
  assert.equal(tick.data.changed, true, JSON.stringify(tick));
  const completedCall = await worker('call', call);
  assert.equal(completedCall.data.state, 'done');
  assert.equal(completedCall.data.result.success, true);
  assert.equal((await request(`/api/trips/${id}`)).data.stops[0].note, 'Changed by native subscription bridge');
  await worker('progress', { jobId, text: 'Synthetic response, no model called.' });
  assert.equal((await worker('complete', { jobId })).status, 200);
  assert.equal((await request(`/api/bridge/jobs/${jobId}`)).data.state, 'completed');
  const history = (await request(`/api/trips/${id}`)).data.messages;
  assert.equal(history.filter(message => message.role === 'user').length, 1);
  assert.equal(history.at(-1).content, 'Synthetic response, no model called.');
  assert.equal((await request('/api/bridge/devices', { method: 'POST', body: { action: 'revoke', id: deviceId } })).status, 200);
  assert.equal((await worker('heartbeat', { state: 'ready' })).status, 401);
  assert.equal((await request(`/api/trips/${id}`, { method: 'DELETE', bearer: token(other) })).status, 404);
  assert.equal((await request(`/api/trips/${id}/stops/${stop}`, { method: 'DELETE' })).status, 200);
  assert.equal((await request(`/api/trips/${id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await request(`/api/trips/${id}`)).status, 404);
  await androidJourney('cloud');
  if (nativeUi) { assert.equal(nativeExchanges, 1); assert.equal(nativeLogouts, 1); }
  // Start the same server code in Community mode with only the disposable DB.
  app.kill('SIGTERM'); await new Promise(resolve => app.once('exit', resolve));
  const communityOwner = '00000000-0000-4000-8000-000000000001';
  sql(`insert into auth.users(id,email) values('${communityOwner}','community@example.test'); insert into public.subscriptions(user_id,plan,status) values('${communityOwner}','pro','active') on conflict(user_id) do update set plan='pro',status='active';`);
  app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '-p', '3156'], { env: { ...process.env, NEXT_DIST_DIR: '.next-native-community', NEXT_PUBLIC_AIRO_EDITION: 'community', AIRO_POSTGREST_URL: 'http://127.0.0.1:3155', AIRO_JWT_SECRET: key, AIRO_OWNER_PASSWORD: 'native-fixture-password', AIRO_OWNER_EMAIL: 'community@example.test', AIRO_SITE_URL: base, NEXT_PUBLIC_SITE_URL: base, OPENAI_API_KEY: '', GOOGLE_MAPS_API_KEY: '' }, stdio: ['ignore','pipe','pipe'] });
  for (const stream of [app.stdout, app.stderr]) stream.on('data', chunk => { log += chunk; });
  await waitFor(async () => (await (await fetch(`${base}/auth/mobile/config`)).json()).edition === 'community', 'Community config');
  const communityConfig = await request('/auth/mobile/config', { bearer: null });
  assert.equal(communityConfig.data.supabaseAnonKey, undefined);
  assert.equal((await request('/auth/mobile/session', { bearer: null, method: 'POST', body: { action: 'login', password: 'wrong' } })).status, 401);
  const signedIn = await request('/auth/mobile/session', { bearer: null, method: 'POST', body: { action: 'login', password: 'native-fixture-password' } });
  assert.equal(signedIn.status, 200, JSON.stringify(signedIn));
  const localToken = signedIn.data.accessToken;
  assert.equal(signedIn.data.kind, 'community');
  assert.equal(signedIn.data.user.id, communityOwner);
  assert.equal((await request('/api/mobile/trips', { bearer: localToken })).data.plan, 'pro');
  assert.equal((await request('/api/mobile/trips', { bearer: localToken + '.extra' })).status, 401);
  assert.equal((await request('/api/mobile/trips', { bearer: 'invalid', headers: { Cookie: `airo_session=${localToken}` } })).status, 401);
  assert.equal((await request('/api/mobile/trips', { bearer: null, headers: { Cookie: `airo_session=${localToken}` } })).status, 200);
  const communityTrip = await request('/api/trips', { bearer: localToken, method: 'POST', body: { title: 'Community mobile trip', start_date: null } });
  assert.equal(communityTrip.status, 201, JSON.stringify(communityTrip));
  assert.equal((await request(`/api/trips/${communityTrip.data.trip.id}`, { bearer: localToken })).data.trip.user_id, communityOwner);
  const renewed = await request('/auth/mobile/session', { bearer: localToken, method: 'POST', body: { action: 'refresh' } });
  assert.equal(renewed.status, 200);
  assert.equal((await request('/auth/mobile/session', { bearer: 'invalid', method: 'POST', body: { action: 'refresh' } })).status, 401);
  assert.equal((await request('/auth/mobile/session', { bearer: null, method: 'POST', headers: { Origin: 'https://foreign.example' }, body: { action: 'login', password: 'native-fixture-password' } })).status, 403);
  await androidJourney('community');
  for (let n = 0; n < 5; n++) assert.equal((await request('/auth/mobile/session', { bearer: null, method: 'POST', body: { action: 'login', password: 'wrong' } })).status, 401);
  assert.equal((await request('/auth/mobile/session', { bearer: null, method: 'POST', body: { action: 'login', password: 'wrong' } })).status, 429);
  assert.equal((await request(`/api/trips/${communityTrip.data.trip.id}`, { bearer: localToken, method: 'DELETE' })).status, 200);
  const result = { passed: true, at: new Date().toISOString(), coverage: ['all repository SQL migrations','Bearer authentication','expired/malformed/anon rejection','no cookie fallback','browser compatibility','CSRF','RLS account isolation','trip CRUD','stop CRUD','budget revision conflict','mobile search input','place saving/bookmarks','resource isolation','original PDF download/hash','native upload/dedup/place relink/ownership','reservation revision and URL validation','history inspection/revert conflict','reservation-linked budget uniqueness','AI selection validation','import/export idempotency/source preservation','subscription bridge isolation/idempotency/tools/history/revocation','API-account rejection','Community login/refresh/password limiter/native CRUD'], actualOAuth: false, actualModel: false, paidCalls: 0 };
  if (nativeUi) result.coverage.push('Android Cloud PKCE/recreation/CRUD/PDF/reservation/history revert/logout', 'Android Community password login/CRUD/logout');
  writeFileSync(`${artifacts}/mobile-api-results.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (error) { console.error(log.slice(-5000)); throw error; }
finally { await cleanup(); }
