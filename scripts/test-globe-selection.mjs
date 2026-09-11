import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit, expect } from '@playwright/test';

const base = process.env.LANDING_BASE_URL ?? 'http://127.0.0.1:3018';
const output = process.env.SELECTION_OUTPUT ?? 'assets/validation/invitation/selection';
await mkdir(output, { recursive: true });
const checks = [], errors = [];
const distance = (a, b) => Math.hypot(((b[0] - a[0] + 540) % 360 + 360) % 360 - 180, b[1] - a[1]);
for (const [engine, type, width, height] of [['chrome', chromium, 1440, 900], ['webkit', webkit, 1440, 900], ['chrome', chromium, 390, 844], ['webkit', webkit, 390, 844]]) {
  const browser = await type.launch(engine === 'chrome' ? { channel: 'chrome' } : {});
  try {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: width < 768, reducedMotion: 'no-preference' });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base, { waitUntil: 'networkidle' });
    await expect(page.locator('.globe-arrival')).toHaveAttribute('data-ready', 'true');
    const target = await page.evaluate(() => {
      const candidates = [...document.querySelectorAll('.globe-city-dot')].sort((a, b) => ['dubai', 'nairobi', 'taipei'].indexOf(b.dataset.cityId) - ['dubai', 'nairobi', 'taipei'].indexOf(a.dataset.cityId));
      for (const element of candidates) {
        const rect = element.getBoundingClientRect(), x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
        if (rect.width && x > 0 && x < innerWidth && y > 0 && y < innerHeight && document.elementFromPoint(x, y)?.closest('[data-city-id]') === element) return { id: element.dataset.cityId, x, y };
      }
      throw new Error('No visible unselected globe pin');
    });
    if (width >= 768) {
      await page.mouse.move(target.x, target.y);
      await page.waitForTimeout(120);
      assert.ok(await page.locator(`[data-city-id="${target.id}"]`).evaluate(element => element.matches(':hover')), 'Actual mouse hover pauses rotation before selection');
    }
    await page.evaluate(() => {
      const read = () => JSON.parse(document.querySelector('[data-camera]').dataset.camera).center;
      const state = window.__selection = { before: read(), frames: [], stop: false };
      const frame = time => { state.frames.push({ time, center: read() }); if (!state.stop) state.raf = requestAnimationFrame(frame); };
      state.raf = requestAnimationFrame(frame);
    });
    const rect = await page.locator(`[data-city-id="${target.id}"]`).boundingBox();
    if (width < 768) await page.touchscreen.tap(rect.x + rect.width / 2, rect.y + rect.height / 2);
    else await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await expect(page.locator('.hero-section')).toHaveAttribute('data-destination', target.id);
    await page.waitForTimeout(2450);
    const result = await page.evaluate(() => { const state = window.__selection; state.stop = true; cancelAnimationFrame(state.raf); return { before: state.before, frames: state.frames }; });
    await writeFile(`${output}/${engine}-${width}-frames.json`, JSON.stringify(result, null, 2));
    const total = distance(result.before, result.frames.at(-1).center);
    const moving = result.frames.filter(frame => { const amount = distance(result.before, frame.center) / total; return amount > .02 && amount < .95; });
    const steps = result.frames.map((frame, index) => distance(index ? result.frames[index - 1].center : result.before, frame.center));
    const largestStep = Math.max(...steps), travelTime = moving.at(-1)?.time - moving[0]?.time;
    assert.ok(total > 10, `${engine}/${width}: selected a different visible longitude`);
    assert.ok(moving.length >= 10 && travelTime > 700, `${engine}/${width}: selection passes through intermediate camera positions over time (${moving.length} frames, ${travelTime}ms)`);
    assert.ok(largestStep < total * .3, `${engine}/${width}: selection never teleports (${largestStep}/${total} degrees in one frame)`);
    checks.push({ engine, width, height, target: target.id, intermediateFrames: moving.length, travelTime, totalDegrees: total, largestFrameDegrees: largestStep, smooth: true });
    console.log(`✓ ${engine} ${width}px ${target.id}: ${moving.length} intermediate frames over ${Math.round(travelTime)}ms, largest move ${largestStep.toFixed(2)}°`);
  } finally { await browser.close(); }
}
assert.deepEqual(errors, []);
await writeFile(`${output}/checks.json`, JSON.stringify({ base, checks, errors }, null, 2));
