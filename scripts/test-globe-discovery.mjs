import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit, expect } from '@playwright/test';

const base = process.env.LANDING_BASE_URL ?? 'http://127.0.0.1:3018';
const output = process.env.DISCOVERY_OUTPUT ?? 'assets/validation/globe-impact';
await mkdir(output, { recursive: true });
const checks = [], errors = [];
for (const [engine, width] of [['chrome', 1440], ['webkit', 390]]) {
  const browser = await (engine === 'chrome' ? chromium : webkit).launch(engine === 'chrome' ? { channel: 'chrome', headless: true } : { headless: true });
  try {
    const page = await browser.newPage({ viewport: { width, height: 900 }, isMobile: width < 768, hasTouch: width < 768, reducedMotion: 'no-preference' });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base, { waitUntil: 'networkidle' });
    const globe = page.locator('.globe-arrival'), map = page.locator('.globe-mapcn');
    await expect(globe).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('.hero-eyebrow')).toHaveCount(0);
    const destination = () => globe.getAttribute('data-destination');
    const center = async () => (await map.getAttribute('data-center')).split(',').map(Number);
    const first = await destination(), initialCenter = await center();
    await expect.poll(destination, { timeout: 10000 }).not.toBe(first);
    const second = await destination(), secondCenter = await center();
    assert.ok(Math.abs(secondCenter[1] - initialCenter[1]) < .01, 'Spotlights keep the globe latitude');
    assert.ok(secondCenter[0] < initialCenter[0], 'The globe continues rotating in the same direction');
    await expect(page.locator('.destination-picker summary')).toContainText(await page.locator('.globe-pin-label strong').innerText());
    const card = await page.locator('.globe-pin-label').boundingBox();
    const chooser = await page.locator('.destination-picker').boundingBox();
    assert.ok(card.x >= 0 && card.x + card.width <= width && (width >= 768 || card.y >= chooser.y + chooser.height), 'Automatic card stays within the globe area');
    await page.screenshot({ path: `${output}/discovery-${engine}-${width}.png` });
    await expect.poll(destination, { timeout: 10000 }).not.toBe(second);
    const third = await destination();
    assert.notEqual(third, first, 'Recently shown cities do not immediately repeat when fresh choices exist');

    if (width >= 768) {
      // A continuously moving card has no two identical frames for hover()'s
      // stability gate. Move the real pointer onto it, then verify the hover.
      const target = await page.locator('.globe-pin-label').boundingBox();
      await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2);
      await expect(page.locator('.globe-destination:hover')).toHaveCount(1);
      await page.waitForTimeout(250);
      const held = await destination(), heldCenter = await center();
      await page.waitForTimeout(5500);
      assert.equal(await destination(), held, 'Hover holds the active city');
      assert.deepEqual(await center(), heldCenter, 'Hover holds globe rotation');
      await page.mouse.move(2, 2);
    }

    await page.locator('.destination-picker summary').click();
    const searching = await destination();
    await page.waitForTimeout(6200);
    assert.equal(await destination(), searching, 'Search suspends automatic choices');
    await page.getByRole('textbox', { name: '도시 또는 나라 검색' }).fill('도쿄');
    await page.getByRole('button', { name: '도쿄 여행 선택', exact: true }).click();
    await page.mouse.move(2, 2);
    await expect(globe).toHaveAttribute('data-destination', 'tokyo');
    await page.waitForTimeout(6300);
    assert.equal(await destination(), 'tokyo', 'Manual choice is held for at least six seconds');
    await expect.poll(destination, { timeout: 13000 }).not.toBe('tokyo');

    await page.locator('.globe-utilities .motion-toggle').click();
    await expect(page.locator('.globe-utilities .motion-toggle')).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(250); // Let the final render settle after pausing.
    const paused = await destination(), pausedCenter = await center();
    await page.waitForTimeout(6000);
    assert.equal(await destination(), paused, 'Pause stops automatic choices');
    assert.deepEqual(await center(), pausedCenter, 'Pause stops globe rotation');
    await page.screenshot({ path: `${output}/paused-${engine}-${width}.png` });
    await page.close();

    const reduced = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await reduced.goto(base, { waitUntil: 'networkidle' });
    await expect(reduced.locator('.globe-arrival')).toHaveAttribute('data-ready', 'true');
    await reduced.waitForTimeout(6000);
    await expect(reduced.locator('.globe-arrival')).toHaveAttribute('data-destination', 'kyoto');
    await expect(reduced.locator('.landing')).toHaveAttribute('data-motion', 'reduced');
    await reduced.close();
    checks.push({ engine, width, choices: [first, second, third], cameraContinuity: true, searchPause: true, manualHoldAndResume: true, pause: true, reducedMotion: true });
    console.log(`✓ ${engine} ${width}px: random visible cities, continuous globe, search/manual/pause/reduced motion`);
  } finally { await browser.close(); }
}
assert.deepEqual(errors, []);
await writeFile(`${output}/discovery-checks.json`, JSON.stringify({ base, checkedAt: new Date().toISOString(), checks, errors }, null, 2));
