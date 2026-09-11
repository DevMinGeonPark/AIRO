import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit, expect } from '@playwright/test';

const base = process.env.LANDING_BASE_URL ?? 'http://127.0.0.1:3018';
const out = process.env.ROUTE_OUTPUT ?? 'assets/validation/route-motion/motion';
await mkdir(out, { recursive: true });
const checks = [], errors = [];
const routeData = el => {
  let fiber = el[Object.keys(el).find(key => key.startsWith('__reactFiber'))];
  for (; fiber; fiber = fiber.return) for (let hook = fiber.memoizedState; hook; hook = hook.next) {
    const map = hook.memoizedState;
    if (map?.getStyle) return map.getStyle().sources['route-source-lower-itinerary']?.data?.geometry?.coordinates ?? [];
  }
  return [];
};
for (const [name, engine, width, reduced] of [
  ['chrome', chromium, 1440, false], ['webkit', webkit, 390, false],
  ['chrome', chromium, 320, true], ['webkit', webkit, 768, true],
]) {
  const browser = await engine.launch({ headless: true, ...(engine === chromium ? { channel: 'chrome' } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
    page.on('pageerror', e => errors.push(`${name}/${width}: ${e.message}`));
    await page.goto(base, { waitUntil: 'networkidle' });
    await expect(page.locator('.landing-nav .airo-logo')).toHaveCSS('width', width < 768 ? '92px' : '116px');
    await expect(page.locator('.lower-footer-submark .airo-mark')).toHaveCount(1);
    await expect(page.locator('.lower-footer-submark')).toHaveAccessibleName('아이로 AIRO 홈');
    assert.equal((await page.locator('.lower-footer-submark').boundingBox()).height, 44);
    assert.equal((await page.locator('.lower-footer-submark').innerText()).trim(), '');
    const baselines = [];
    for (let day = 0; day < 3; day++) {
      await page.getByRole('tablist', { name: '대화 예시 날짜 선택' }).getByRole('tab').nth(day).click();
      const rows = await page.locator('.lower-generated-stops li').evaluateAll(items => items.map(li => {
        const baseline = element => {
          const probe = document.createElement('i');
          probe.style.cssText = 'display:inline-block;width:0;height:0;padding:0;margin:0;vertical-align:baseline';
          element.prepend(probe);
          const y = probe.getBoundingClientRect().top; probe.remove(); return y;
        };
        return Math.abs(baseline(li.querySelector('time')) - baseline(li.querySelector('h4')));
      }));
      assert.ok(rows.every(delta => delta < .1), `Time/title baseline mismatch: ${rows}`);
      baselines.push(...rows);
    }
    await page.locator('.lower-conversation').screenshot({ path: `${out}/conversation-${name}-${width}.png`, style: '.landing-nav,.skip-link{visibility:hidden!important}' });
    await expect(page.locator('.lower-route-sketch')).toHaveCount(0);
    const section = page.locator('.lower-routes'), map = page.locator('.lower-map-canvas');
    await page.locator('.lower-map-surface').scrollIntoViewIfNeeded();
    const samples = [];
    if (!reduced) {
      await expect(section).toHaveAttribute('data-route-running', 'true');
      await expect.poll(async () => Number(await section.getAttribute('data-route-progress'))).toBeGreaterThan(.3);
      samples.push(await map.evaluate(routeData));
      await expect(page.locator('.lower-route-travel-dot')).toBeVisible();
      await page.waitForTimeout(900);
      samples.push(await map.evaluate(routeData));
      assert.ok(samples[1].length > samples[0].length, 'Actual road grows over time');
      assert.notDeepEqual(samples[1].at(-1), samples[0].at(-1));
      await page.evaluate(() => document.querySelector('.motion-toggle').click());
      await expect(section).toHaveAttribute('data-route-running', 'false');
      const held = await section.getAttribute('data-route-progress');
      await page.waitForTimeout(700);
      await expect(section).toHaveAttribute('data-route-progress', held);
      await page.evaluate(() => document.querySelector('.motion-toggle').click());
      await expect(section).toHaveAttribute('data-route-progress', '1.000', { timeout: 7000 });
      const complete = await map.evaluate(routeData);
      for (const sample of samples) assert.deepEqual(sample.slice(0, -1), complete.slice(0, sample.length - 1), 'Animated line follows existing road geometry');
      await expect(page.locator('.lower-route-travel-dot')).toHaveCount(0);
      await page.getByRole('button', { name: '경로 애니메이션 다시 보기' }).click();
      await page.locator('.lower-map-surface').scrollIntoViewIfNeeded();
      await expect.poll(async () => Number(await section.getAttribute('data-route-progress'))).toBeLessThan(.6);
      await page.locator('.lower-map-pin').nth(1).click();
      await expect(section).toHaveAttribute('data-route-progress', '1.000');
      await expect(page.locator('.lower-map-pin').nth(1)).toHaveAttribute('aria-pressed', 'true');
      await page.getByRole('button', { name: '경로 애니메이션 다시 보기' }).click();
      await page.locator('.lower-map-surface').scrollIntoViewIfNeeded();
      await expect(section).toHaveAttribute('data-route-running', 'true');
      await page.locator('.lower-integration').scrollIntoViewIfNeeded();
      await expect(section).toHaveAttribute('data-route-running', 'false');
      const offscreen = await section.getAttribute('data-route-progress');
      await page.waitForTimeout(700);
      await expect(section).toHaveAttribute('data-route-progress', offscreen);
    } else {
      await expect(section).toHaveAttribute('data-route-progress', '1.000');
      await expect(section).toHaveAttribute('data-route-running', 'false');
      await expect.poll(async () => (await map.evaluate(routeData)).length).toBeGreaterThan(10);
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (let day = 0; day < 3; day++) {
      await page.getByRole('tablist', { name: '지도 날짜 선택' }).getByRole('tab').nth(day).click();
      await expect(section).toHaveAttribute('data-route-progress', '1.000');
      await expect(page.locator('.lower-map-canvas')).toHaveAttribute('data-day', String(day + 1));
    }
    const outside = await section.locator('button,h2').evaluateAll(elements => elements.filter(el => {
      const b = el.getBoundingClientRect(); return b.left < -1 || b.right > innerWidth + 1;
    }).map(el => el.textContent));
    assert.deepEqual(outside, []);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await section.screenshot({ path: `${out}/route-${name}-${width}.png`, style: '.landing-nav,.skip-link{visibility:hidden!important}' });
    await page.locator('.lower-footer').screenshot({ path: `${out}/footer-${name}-${width}.png` });
    checks.push({ engine: name, width, reduced, baselineChecks: baselines.length, roadGrowth: samples.map(s => s.length), pauseAndReplay: !reduced, mapDayTabs: 3, smallerLogos: true, footerSubmark: true });
    console.log(`✓ ${name} ${width}: time alignment, ${reduced ? 'complete static road' : 'road drawing / moving point / pause / replay / manual selection'}, compact logos`);
  } finally { await browser.close(); }
}
assert.deepEqual(errors, []);
await writeFile(`${out}/checks.json`, JSON.stringify({ base, checks, errors }, null, 2));
