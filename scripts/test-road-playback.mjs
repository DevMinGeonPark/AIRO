import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

const base = process.env.LANDING_BASE_URL ?? 'http://127.0.0.1:3018';
const browser = await chromium.launch({ channel: 'chrome', headless: true }), checks = [];
await mkdir('assets/validation/roads', { recursive: true });
try {
  for (const [id, name, day, width, height] of [['kyoto', '교토', 2, 390, 844], ['paris', '파리', 1, 1440, 900], ['vienna', '빈', 3, 1440, 900]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.locator('.destination-picker summary').click();
    await page.getByRole('button', { name: `${name} 여행 선택`, exact: true }).click();
    await page.getByRole('button', { name: `${name} 여행 둘러보기`, exact: true }).click();
    await expect(page.locator('.hero-section')).toHaveAttribute('data-arrival', 'landed', { timeout: 8000 });
    await page.getByRole('tab', { name: `Day ${day}`, exact: true }).click();
    await page.getByRole('button', { name: '지도 조작 켜기', exact: true }).click();
    const samples = await page.locator('.story-map').evaluate(async (map) => {
      map.querySelector('[aria-label="경로 따라가기"]').click();
      const path = map.querySelector(`.map-traveled-route[data-day="${map.dataset.day}"]`);
      const numbers = path.getAttribute('d').match(/-?[\d.]+/g).map(Number);
      const vertices = numbers.reduce((all, n, i) => { if (i % 2 === 0) all.push(new DOMPoint(n, numbers[i + 1])); return all; }, []);
      const result = [], start = performance.now();
      while (performance.now() - start < 1600) {
        await new Promise(requestAnimationFrame);
        const matrix = path.getScreenCTM(), points = vertices.map(point => point.matrixTransform(matrix));
        const dot = new DOMPoint().matrixTransform(map.querySelector('.map-traveler').getScreenCTM());
        const distances = points.slice(1).map((b, i) => {
          const a = points[i], dx = b.x - a.x, dy = b.y - a.y;
          const t = Math.max(0, Math.min(1, ((dot.x - a.x) * dx + (dot.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
          return Math.hypot(dot.x - a.x - dx * t, dot.y - a.y - dy * t);
        });
        result.push({ progress: Number(map.dataset.progress), distance: Math.min(...distances) });
      }
      return result;
    });
    assert.ok(new Set(samples.filter(s => s.progress > 0 && s.progress < 1).map(s => s.progress)).size >= 10, `${name}: traveler must move`);
    const maxDistancePx = Math.max(...samples.map(s => s.distance));
    assert.ok(maxDistancePx < .25, `${name}: traveler left the road by ${maxDistancePx}px`);
    await page.screenshot({ path: `assets/validation/roads/${id}-${width}.png` });
    checks.push({ city: id, day, width, samples: samples.length, maxDistancePx });
    console.log(`✓ ${name}: moving traveler remains on every road turn (${maxDistancePx.toFixed(3)}px maximum error)`);
    await page.close();
  }
  await writeFile('assets/validation/roads/playback-checks.json', JSON.stringify({ base, checks }, null, 2));
} finally { await browser.close(); }
