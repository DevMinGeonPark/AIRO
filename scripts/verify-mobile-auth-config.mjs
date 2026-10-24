import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

// No user sign-in, email delivery, token exchange, or model requests.
// Each Google authorization is immediately cancelled without visiting Google.
const origin = new URL(process.env.AIRO_VERIFY_URL ?? 'https://airo.dev-heptivision.com').origin;
const output = new URL('../.backups/android-completion/mobile-auth-preflight.json', import.meta.url);
const nativeCallback = 'com.heptivision.airo://auth/callback';
const report = { origin, checkedAt: new Date().toISOString(), checks: [], actualUserLogin: false, emailSent: false, modelCalls: 0 };
const failures = [];

async function request(url, options = {}) {
  return fetch(url, {
    ...options,
    redirect: 'manual',
    headers: { 'User-Agent': 'okhttp/4.12.0', ...options.headers },
    signal: AbortSignal.timeout(15_000),
  });
}

async function check(name, run) {
  try {
    const details = await run();
    report.checks.push({ name, passed: true, ...details });
  } catch (error) {
    // Assertions contain only public configuration, status codes, or this probe's own state.
    failures.push(name);
    report.checks.push({ name, passed: false, error: error.message });
  }
}

let config;
await check('public mobile configuration', async () => {
  const response = await request(`${origin}/auth/mobile/config`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control') ?? '', /no-store/);
  config = await response.json();
  assert.equal(config.edition, 'cloud');
  assert.equal(config.redirectUri, nativeCallback);
  assert.ok(config.supabaseAnonKey);
  assert.equal(new URL(config.supabaseUrl).protocol, 'https:');
  return { edition: config.edition, redirectUri: config.redirectUri };
});

if (config?.supabaseUrl && config?.supabaseAnonKey) {
  const authOrigin = new URL(config.supabaseUrl).origin;
  await check('Google and email providers', async () => {
    const response = await request(`${authOrigin}/auth/v1/settings`, { headers: { apikey: config.supabaseAnonKey } });
    assert.equal(response.status, 200);
    const settings = await response.json();
    assert.equal(settings.external?.google, true, 'Google provider must be enabled');
    assert.equal(settings.external?.email, true, 'Email provider must be enabled');
    assert.equal(settings.disable_signup, false, 'Sign-up must remain available');
    return { googleEnabled: true, emailEnabled: true, signUpEnabled: true };
  });

  async function cancelledAuthorization(redirectTo) {
    const url = new URL('/auth/v1/authorize', authOrigin);
    url.search = new URLSearchParams({
      provider: 'google', redirect_to: redirectTo,
      code_challenge: createHash('sha256').update(randomBytes(32).toString('base64url')).digest('base64url'),
      code_challenge_method: 's256',
    }).toString();
    const response = await request(url);
    assert.equal(response.status, 302);
    const providerUrl = new URL(response.headers.get('location'));
    assert.equal(providerUrl.hostname, 'accounts.google.com');
    const state = providerUrl.searchParams.get('state');
    assert.ok(state, 'Provider state must be present');
    const callback = new URL('/auth/v1/callback', authOrigin);
    callback.search = new URLSearchParams({ state, error: 'access_denied', error_description: 'AIRO configuration check cancelled' }).toString();
    const cookies = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    const cancelled = await request(callback, { headers: cookies ? { Cookie: cookies } : {} });
    assert.equal(cancelled.status, 302);
    const target = new URL(cancelled.headers.get('location'));
    const errors = new URLSearchParams(target.hash.slice(1));
    assert.equal(target.searchParams.get('error') ?? errors.get('error'), 'access_denied');
    return target;
  }

  await check('native callback and state preserved', async () => {
    const state = randomBytes(32).toString('base64url');
    const target = await cancelledAuthorization(`${nativeCallback}?native_state=${state}`);
    assert.equal(`${target.protocol}//${target.host}${target.pathname}`, nativeCallback, 'Native login must return to the app');
    assert.equal(target.searchParams.get('native_state'), state);
    return { returnBase: nativeCallback, nativeStatePreserved: true };
  });
  await check('existing web callback preserved', async () => {
    const callback = `${origin}/auth/callback`;
    const target = await cancelledAuthorization(callback);
    assert.equal(`${target.origin}${target.pathname}`, callback);
    return { returnBase: callback };
  });
  await check('unregistered callback rejected', async () => {
    const target = await cancelledAuthorization('https://airo-unregistered.invalid/auth/callback');
    assert.equal(target.origin, origin);
    return { returnOrigin: target.origin };
  });
}

for (const path of ['/api/mobile/trips', '/api/mobile/places?q=Rome']) {
  await check(`anonymous ${path.split('?')[0]}`, async () => {
    const response = await request(`${origin}${path}`);
    assert.equal(response.status, 401);
    assert.match(response.headers.get('content-type') ?? '', /application\/json/);
    return { status: response.status };
  });
}

report.passed = failures.length === 0 && report.checks.length === 7;
await mkdir(new URL('.', output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
