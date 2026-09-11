import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium, webkit, expect } from '@playwright/test';
const output = process.env.RELEASE_OUTPUT ?? 'assets/validation/city-stories/release';
await mkdir(output, { recursive: true });
const checks = [], errors = [];
const build = process.env.NEXT_DIST_DIR ?? '.next-airo-city-stories';
for (const [type, base, width, height, theme] of [
  [chromium, 'https://airo.dev-heptivision.com', 1920, 1080, 'dark'],
  [webkit, 'https://airo.dev-heptivision.com', 390, 844, 'dark'],
  [chromium, 'http://localhost:3016', 320, 568, 'light'],
]) {
  const browser = await type.launch({ headless: true, ...(type === chromium ? { channel: 'chrome' } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(value => localStorage.setItem('theme', value), theme);
    await page.goto(base, { waitUntil: 'networkidle' });
    await expect(page.locator('.globe-arrival')).toHaveAttribute('data-ready', 'true');
    await expect(page.getByRole('heading', { name: '마음 가는 대로, AIRO.', exact: true })).toBeVisible();
    await expect(page.locator('.editorial-wordmark')).toBeVisible();
    const layout = await page.evaluate(() => {
      const rect = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
      return { logoBounds: rect('.landing-nav .airo-logo'), header: rect('.landing-nav'), title: rect('.hero-copy h1'), bottom: rect('.globe-bottom'), primary: getComputedStyle(document.querySelector('.hero-section')).getPropertyValue('--primary').trim().toUpperCase(), logo: getComputedStyle(document.querySelector('.landing-nav .airo-logo')).maskImage, logoColor: getComputedStyle(document.querySelector('.landing-nav .airo-logo')).color, background: getComputedStyle(document.querySelector('.globe-arrival')).backgroundColor };
    });
    assert.ok(layout.header.bottom < layout.title.top && layout.bottom.bottom <= height);
    assert.ok(Math.abs(layout.title.left - layout.logoBounds.left) < .1 && Math.abs(layout.bottom.left - layout.logoBounds.left) < .1, 'First-screen content aligns with the logo');
    assert.equal(layout.primary, '#86A5FF');
    assert.equal(layout.logoColor, 'rgb(134, 165, 255)');
    assert.equal(layout.background, 'rgb(10, 10, 10)');
    assert.ok(layout.logo.includes('airo-logo-swift-gpt.webp'));
    await expect(page.locator('.editorial-description')).toHaveText('계획은 가볍게, 여행은 깊게.');
    for (const [asset, file] of [
      ['/maps/outing-scenarios.json', 'public/maps/outing-scenarios.json'],
      ['/maps/target-scenarios.json', 'public/maps/target-scenarios.json'],
      ['/brand/airo-logo-swift-gpt.webp', 'public/brand/airo-logo-swift-gpt.webp'],
      ['/brand/airo-mark-swift-gpt.webp', 'public/brand/airo-mark-swift-gpt.webp'],
      ['/fonts/airo-editorial-italic.woff2', 'public/fonts/airo-editorial-italic.woff2'],
      ['/fonts/airo-korean-editorial-cities.woff2', 'public/fonts/airo-korean-editorial-cities.woff2'],
      ['/travel/cities/lima.jpg', 'public/travel/cities/lima.jpg'],
      ['/travel/cities/hong-kong.jpg', 'public/travel/cities/hong-kong.jpg'],
      ['/travel/rome-alley.jpg', 'public/travel/rome-alley.jpg'],
      ['/travel/rome-skyline.jpg', 'public/travel/rome-skyline.jpg'],
      ['/icon.svg', 'src/app/icon.svg'], ['/favicon.ico', 'src/app/favicon.ico'], ['/apple-icon.png', 'src/app/apple-icon.png'],
    ]) {
      const response = await page.request.get(base + asset);
      assert.equal(response.status(), 200);
      const digest = buffer => createHash('sha256').update(buffer).digest('hex');
      assert.equal(digest(await response.body()), digest(await readFile(file)));
    }
    if (build.startsWith('.next-airo-lower') || build === '.next-airo-route-motion' || build === '.next-airo-footer') {
      if (build === '.next-airo-route-motion' || build === '.next-airo-footer') {
        assert.equal(layout.logoBounds.width, width < 768 ? 92 : 116);
        await expect(page.locator('.lower-footer-submark .airo-mark')).toHaveCount(1);
        await expect(page.locator('.lower-footer-submark')).toHaveText('');
        await expect(page.locator('.lower-route-sketch-line')).toHaveCount(build === '.next-airo-footer' ? 0 : 1);
        await expect(page.locator('.lower-routes')).toHaveAttribute('data-route-progress', '1.000');
      }
      await expect(page.locator('.landing-lower')).toHaveAttribute('data-destination', 'rome');
      await expect(page.locator('.lower-trip-banner h3')).toHaveText('로마의 오후');
      for (const asset of ['/fonts/airo-lower-serif.woff2', '/fonts/airo-lower-details-serif.ttf', '/travel/rome/cafe.jpg', '/travel/rome/colosseum.jpg', '/examples/airo-reservation-sample.pdf']) {
        const response = await page.request.get(base + asset); assert.equal(response.status(), 200);
        assert.equal(createHash('sha256').update(await response.body()).digest('hex'), createHash('sha256').update(await readFile('public' + asset)).digest('hex'));
      }
      await page.locator('.lower-routes').scrollIntoViewIfNeeded();
      await page.getByRole('tablist', { name: '지도 날짜 선택' }).getByRole('tab').nth(1).click();
      await expect(page.locator('.lower-map-canvas')).toHaveAttribute('data-day', '2');
      await page.locator('.lower-route-stops button').nth(1).click();
      await expect(page.locator('.lower-place-card h4')).toHaveText('트레비 분수');
      await page.locator('.lower-materials').scrollIntoViewIfNeeded();
      await expect.poll(() => page.locator('.lower-saved-photo img').evaluate(i => i.complete && i.naturalWidth > 0)).toBe(true);
      await page.getByRole('tab', { name: 'Codex CLI · IDE', exact: true }).click();
      await expect(page.locator('.lower-tool-chat')).toContainText('Codex');
      await page.locator('.lower-integration').screenshot({ path: `${output}/lower-${width}-${theme}.png`, style: '.landing-nav,.skip-link{visibility:hidden!important}' });
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    await page.screenshot({ path: `${output}/globe-${width}-${theme}.png` });
    await page.evaluate(() => { window.__releaseCanvas = document.querySelector('.maplibregl-canvas'); });
    await page.locator('.destination-picker summary').click();
    await page.getByRole('button', { name: '리마 여행 선택', exact: true }).click();
    await expect(page.locator('.city-preview-title')).toHaveText('리마');
    await expect(page.locator('.city-preview-image')).toHaveCount(1);
    await expect(page.locator('.city-feature')).toHaveAttribute('data-city', 'lima');
    await expect(page.locator('.nav-start')).toHaveCount(0);
    await page.getByRole('button', { name: '리마 여행 둘러보기', exact: true }).click();
    await expect(page.locator('.conversation-map-layer')).toHaveAttribute('aria-hidden', 'false');
    assert.ok(await page.evaluate(() => window.__releaseCanvas === document.querySelector('.maplibregl-canvas') && window.__releaseCanvas.isConnected));
    assert.equal(await page.locator('.hero-section image').count(), 0);
    const arrivalCamera = await page.locator('.globe-mapcn').getAttribute('data-camera');
    await expect(page.locator('.journey-welcome')).toContainText('어디를 가시겠어요?');
    await expect(page.locator('.dining-direct-route')).toHaveCount(0);
    await page.locator('.journey-destination-choice').first().click();
    await expect(page.locator('.conversation-demo')).toHaveAttribute('data-phase', 'ready');
    await page.getByRole('button', { name: '가는 길 식당 보기', exact: true }).click();
    await expect(page.locator('.dining-choice')).toHaveCount(3);
    await expect(page.locator('.dining-map')).toHaveAttribute('data-route', 'direct');
    const before = await page.locator('.dining-direct-route').getAttribute('d');
    await page.getByRole('button', { name: '메시지 보내기', exact: true }).click();
    await expect(page.locator('.conversation-demo')).toHaveAttribute('data-step', '4');
    await expect(page.locator('.dining-saved-stops')).toContainText('코르다노');
    const route = await page.locator('.dining-saved-route').getAttribute('d');
    assert.notEqual(route, before);
    assert.ok(route.split('L').length > 10);
    for (const category of ['cafe', 'bar', 'dessert']) {
      await page.locator(`.conversation-categories button[data-category="${category}"]`).click();
      await expect(page.locator('.dining-choice')).toHaveCount(3);
      await page.locator('.dining-choice:not([disabled])').first().click();
      await page.getByRole('button', { name: '메시지 보내기', exact: true }).click();
      await expect(page.locator('.conversation-demo')).toHaveAttribute('data-step', '4');
      await expect(page.locator('.conversation-demo')).toHaveAttribute('data-category', category);
    }
    await expect(page.locator('.conversation-demo')).toHaveAttribute('data-saved-count', '4');
    await expect(page.locator('.journey-current-stops')).toContainText('코르다노');
    assert.equal(await page.locator('.globe-mapcn').getAttribute('data-camera'), arrivalCamera);
    await page.waitForTimeout(1600);
    await page.screenshot({ path: `${output}/conversation-${width}-${theme}.png` });
    for (const path of ['/login', '/pricing', '/docs/mcp']) {
      await page.goto(base + path, { waitUntil: 'networkidle' });
      await expect(page.locator('.airo-logo').first()).toHaveCSS('color', theme === 'dark' ? 'rgb(134, 165, 255)' : 'rgb(51, 92, 204)');
    }
    checks.push({ base, width, height, theme, layout, roadVertices: route.split('L').length });
    console.log(`✓ ${base} ${width}px ${theme}: deployed logo, same live map/camera, destination choices and changed road`);
  } finally { await browser.close(); }
}
assert.deepEqual(errors, []);
await writeFile(`${output}/checks.json`, JSON.stringify({ checkedAt: new Date().toISOString(), build, buildId: (await readFile(`${build}/BUILD_ID`, 'utf8')).trim(), checks, errors }, null, 2));
