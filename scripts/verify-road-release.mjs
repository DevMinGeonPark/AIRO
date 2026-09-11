import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium, webkit, expect } from '@playwright/test';

const publicUrl = 'https://airo.dev-heptivision.com', preview = process.env.PREVIEW_URL ?? 'http://localhost:3016';
const build = process.env.NEXT_DIST_DIR ?? '.next-airo-swift';
const errors = [], checks = [];
for (const [engine, base, width, height, reducedMotion] of [[webkit, publicUrl, 390, 844, 'no-preference'], [chromium, publicUrl, 1440, 900, 'reduce'], [chromium, preview, 320, 568, 'reduce']]) {
  const browser = await engine.launch(engine === chromium ? { channel: 'chrome', headless: true } : { headless: true });
  try {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base, { waitUntil: 'networkidle' });
    await expect(page.locator('.globe-arrival')).toHaveAttribute('data-ready', 'true', { timeout: 15000 });
    assert.equal(await page.getByText('나의 AI 여행 파트너, 아이로', { exact: true }).count(), 0);
    const mask = await page.locator('.airo-mark').first().evaluate(el => getComputedStyle(el).maskImage);
    assert.ok(mask.includes('airo-mark-swift-gpt.webp'));
    if (width < 768) {
      const grid = await page.locator('.hero-grid').boundingBox();
      assert.ok(grid.height <= height + 1);
      const action = await page.locator('.globe-bottom').boundingBox();
      assert.ok(action.y + action.height <= height);
    }
    if (reducedMotion === 'no-preference') {
      const first = await page.locator('.hero-section').getAttribute('data-destination');
      await expect(page.locator('.hero-section')).not.toHaveAttribute('data-destination', first, { timeout: 12000 });
    }
    await page.screenshot({ path: `assets/validation/roads/release-globe-${width}.png` });
    await page.locator('.destination-picker summary').click();
    await page.getByRole('button', { name: '교토 여행 선택', exact: true }).click();
    await page.getByRole('button', { name: '교토 여행 둘러보기', exact: true }).click();
    await expect(page.locator('.hero-section')).toHaveAttribute('data-arrival', 'landed', { timeout: 8000 });
    await page.getByRole('tab', { name: 'Day 2', exact: true }).click();
    await expect(page.locator('.story-map')).toHaveAttribute('data-progress', '1.000', { timeout: 7000 });
    const path = await page.locator('.story-map .map-traveled-route[data-day="2"]').getAttribute('d');
    assert.ok(path.split('L').length > 50);
    await page.screenshot({ path: `assets/validation/roads/release-route-${width}.png` });
    const route = await page.request.post(`${base}/api/trips/55555555-5555-4555-8555-555555555555/routes`, { data: {} });
    assert.equal(route.status(), 401);
    checks.push({ base, width, height, oneScreen: width < 768, refinedLogo: true, roadVertices: path.split('L').length, anonymousRouteStatus: route.status(), autoDiscovery: reducedMotion === 'no-preference' });
    console.log(`✓ ${base} ${width}px: deployed logo, layout, real road route and protected API`);
  } finally { await browser.close(); }
}
assert.deepEqual(errors, []);
await writeFile('assets/validation/roads/release-checks.json', JSON.stringify({ checkedAt: new Date().toISOString(), build, buildId: (await readFile(`${build}/BUILD_ID`, 'utf8')).trim(), checks, errors }, null, 2));
