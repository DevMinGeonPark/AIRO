import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

const base = process.env.LANDING_BASE_URL ?? 'http://127.0.0.1:3018';
const output = process.env.STARTUP_OUTPUT ?? 'assets/validation/globe-startup';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  for (const width of [1440, 375]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/maps/world-land.geojson', async route => { await gate; await route.continue(); });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.globe-mapcn canvas')).toBeAttached();
    await expect(page.locator('.globe-arrival')).toHaveAttribute('data-ready', 'false');
    assert.equal(await page.locator('.globe-fallback, .globe-sphere').count(), 0, 'No substitute globe should flash before the real map');
    await expect(page.locator('.globe-live')).toHaveCSS('opacity', '0');
    await expect(page.locator('.globe-live')).toHaveAttribute('inert', '');
    await page.screenshot({ path: `${output}/loading-${width}.png` });
    release();
    await expect(page.locator('.globe-arrival')).toHaveAttribute('data-ready', 'true', { timeout: 15000 });
    await expect(page.locator('.globe-mapcn')).toHaveAttribute('data-view', 'world');
    await expect(page.locator('[data-city-id]')).toHaveCount(53);
    await expect(page.locator('.globe-live')).not.toHaveAttribute('inert');
    await expect(page.locator('.globe-live')).toHaveCSS('opacity', '1');
    await page.screenshot({ path: `${output}/ready-${width}.png` });
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('.globe-arrival')).toHaveAttribute('data-ready', 'true', { timeout: 15000 });
    assert.equal(await page.locator('.globe-fallback, .globe-sphere').count(), 0);
    assert.deepEqual(errors, []);
    results.push({ width, delayedLoad: 'no placeholder / live map hidden until framed', reload: 'ready', cities: 53, errors });
    await page.close();
  }
  // The itinerary remains usable if the globe's data is still loading.
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/maps/world-land.geojson', async route => { await gate; await route.abort(); });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.globe-mapcn canvas')).toBeAttached();
  await page.getByRole('button', { name: '로마 여행 둘러보기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '말하면, 여행이 바뀌니까.', exact: true })).toBeVisible();
  release();
  await page.close();
  await writeFile(`${output}/checks.json`, JSON.stringify({ base, checkedAt: new Date().toISOString(), results, skipWhileLoading: true }, null, 2));
  console.log('globe startup ok: delayed desktop/mobile load, reload, 53 cities, itinerary while loading');
} finally { await browser.close(); }
