import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit, expect } from '@playwright/test';

const base = process.env.LANDING_BASE_URL ?? 'http://127.0.0.1:3018';
const output = process.env.STABILITY_OUTPUT ?? 'assets/validation/globe-stability';
await mkdir(output, { recursive: true });
const results = [], errors = [];
for (const [engine, type] of [['chrome', chromium], ['webkit', webkit]]) {
  const browser = await type.launch({ headless: true, ...(engine === 'chrome' ? { channel: 'chrome' } : {}) });
  try {
    for (const [width, height] of [[1440,900], [1440,640], [768,1024], [320,568], [390,844], [844,390]]) {
      const compact = width < 768 || (width <= 1023 && height <= 500);
      const page = await browser.newPage({ viewport: { width, height }, isMobile: compact, hasTouch: compact, reducedMotion: 'no-preference' });
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base, { waitUntil: 'networkidle' });
      await expect(page.locator('.globe-arrival')).toHaveAttribute('data-ready', 'true');
      await page.waitForTimeout(800);
      const layout = await page.evaluate(() => {
        const box = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
        return { nav: box('.landing-nav'), logo: box('.landing-nav .airo-logo'), start: box('.nav-start'), title: box('.hero-copy h1'), picker: box('.destination-picker'), hero: box('.hero-grid'), bottom: box('.globe-bottom'), font: getComputedStyle(document.querySelector('.nav-link')).fontSize, overflow: document.documentElement.scrollWidth > innerWidth, background: getComputedStyle(document.querySelector('.globe-arrival')).backgroundColor, primary: getComputedStyle(document.querySelector('.hero-section')).getPropertyValue('--primary').trim() };
      });
      assert.ok(layout.nav.bottom + 4 <= layout.title.top, `${engine} ${width}×${height}: header overlaps headline`);
      assert.ok(layout.logo.right < layout.start.left, `${engine} ${width}: logo overlaps start button`);
      assert.ok(layout.hero.bottom <= height + 1 && layout.bottom.bottom <= height, `${width}×${height}: hero/buttons cropped`);
      assert.ok(!layout.overflow, `${width}: horizontal overflow`);
      if (compact) assert.ok(layout.title.bottom <= layout.picker.top, `${width}: title overlaps picker`);
      if (width >= 768) assert.ok(parseFloat(layout.font) >= 15, 'Desktop menu size');
      assert.equal(layout.background, 'rgb(10, 10, 10)');
      assert.equal(layout.primary.toUpperCase(), '#86A5FF');
      assert.ok(!(await page.locator('body').innerText()).includes('계획은 가볍게'));
      const samples = await page.evaluate(() => new Promise(resolve => {
        const samples = [], started = performance.now();
        let id, changedAt = started - 1000;
        const sample = now => {
          const map = document.querySelector('.globe-mapcn'), selected = map.querySelector('.globe-destination');
          if (id !== selected.dataset.cityId) { id = selected.dataset.cityId; changedAt = now; }
          if (now - changedAt > 500 && selected.dataset.facing === 'true') {
            const card = selected.querySelector('.globe-pin-label').getBoundingClientRect(), pin = selected.querySelector('.globe-pin').getBoundingClientRect();
            const w = innerWidth, h = innerHeight, landscape = w > h && w <= 1023 && h <= 500;
            const compact = w < 768 || landscape;
            const bounds = !compact ? { left: w * .42, right: w - 24, top: 235, bottom: h - 170 } : landscape ? { left: w * .4, right: w - 20, top: 78, bottom: h - 24 } : { left: document.querySelector('.destination-picker').getBoundingClientRect().left, right: document.querySelector('.destination-picker').getBoundingClientRect().right, top: document.querySelector('.destination-picker').getBoundingClientRect().bottom + 12, bottom: document.querySelector('.globe-regions').getBoundingClientRect().top - 10 };
            const x = pin.x + pin.width / 2, y = pin.y + pin.height / 2;
            const expectedX = Math.max(bounds.left, Math.min(x - card.width - 26, bounds.right - card.width));
            const expectedY = Math.max(bounds.top + 8, Math.min(y - card.height / 2, bounds.bottom - card.height - 8));
            samples.push({ t: now - started, id, x: card.x, y: card.y, pinX: x, pinY: y, error: Math.max(Math.abs(card.x - expectedX), Math.abs(card.y - expectedY)), center: map.dataset.center });
          }
          if (now - started < 2800) requestAnimationFrame(sample); else resolve(samples);
        };
        requestAnimationFrame(sample);
      }));
      assert.ok(samples.length > 20, `${engine} ${width}: enough animated frames`);
      assert.notEqual(samples[0].center, samples.at(-1).center, 'The globe actually rotates during the measurement');
      const maxDrift = Math.max(...samples.map(sample => sample.error));
      assert.ok(maxDrift < .25, `${engine} ${width}×${height}: selected card detaches/jitters ${maxDrift.toFixed(3)}px`);
      await page.screenshot({ path: `${output}/after-${engine}-${width}-${height}.png` });
      // A fixed header must also retain its size after scrolling.
      await page.evaluate(() => window.scrollTo(0, 600));
      await expect(page.locator('.landing-nav')).toHaveAttribute('data-scrolled', 'true');
      assert.equal(Math.round((await page.locator('.landing-nav').boundingBox()).height), Math.round(layout.nav.height));
      results.push({ engine, width, height, layout, maxDrift, samples });
      console.log(JSON.stringify({ engine, width, height, headerBottom: layout.nav.bottom, titleTop: layout.title.top, maxDrift }));
      await page.close();
    }
  } finally { await browser.close(); }
}
assert.deepEqual(errors, []);
await writeFile(`${output}/checks.json`, JSON.stringify({ base, checkedAt: new Date().toISOString(), results, errors }, null, 2));
