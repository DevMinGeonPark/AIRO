import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium, webkit, expect } from '@playwright/test';
import { decodePolyline } from '../src/lib/polyline.ts';

const base = process.env.LANDING_BASE_URL ?? 'http://127.0.0.1:3018';
const output = process.env.DINING_OUTPUT ?? 'assets/validation/conversation';
await mkdir(output, { recursive: true });
const data = JSON.parse(await readFile('public/maps/dining-scenarios.json', 'utf8'));
const cities = [{ id: 'kyoto', name: '교토' }, ...JSON.parse(await readFile('src/lib/landing-destinations.json', 'utf8'))];
assert.equal(Object.keys(data.cities).length, cities.length);
const errors = [], checks = [];
const near = (a, b) => Math.hypot((a[0] - b[0]) * Math.cos(a[1] * Math.PI / 180), a[1] - b[1]) * 111000;
for (const city of cities) {
  const scenario = data.cities[city.id];
  assert.equal(scenario.restaurants.length, 3);
  assert.equal(new Set(scenario.restaurants.map(place => place.id)).size, 3);
  for (const [index, route] of [scenario.route, ...scenario.restaurants.map(place => place.route)].entries()) {
    assert.equal(route.legs.length, index ? 2 : 1);
    assert.ok(route.distanceKm > 0 && route.durationSeconds > 0);
    const legs = route.legs.map(decodePolyline);
    assert.ok(legs.flat().length >= 3);
    assert.ok(near(legs[0][0], scenario.origin.coordinate) < 300, `${city.id}: road begins near origin`);
    assert.ok(near(legs.at(-1).at(-1), scenario.destination.coordinate) < 300, `${city.id}: road reaches destination`);
    if (index) {
      assert.deepEqual(legs[0].at(-1), legs[1][0], `${city.id}: road legs join without a fabricated segment`);
      assert.ok(near(legs[0].at(-1), scenario.restaurants[index - 1].coordinate) < 300, `${city.id}: road visits restaurant`);
    }
  }
}
console.log(`✓ ${cities.length} cities: three named restaurants, four connected road routes each`);

async function enter(page, city) {
  await page.locator('.destination-picker summary').click();
  await page.getByRole('button', { name: `${city.name} 여행 선택`, exact: true }).click();
  await page.getByRole('button', { name: `${city.name} 여행 둘러보기`, exact: true }).click();
  await expect(page.locator('.conversation-panel')).toBeVisible({ timeout: 10000 });
}
for (const [engine, type] of [['chrome', chromium], ['webkit', webkit]]) {
  const browser = await type.launch(engine === 'chrome' ? { channel: 'chrome' } : {});
  try {
    for (const [width, height] of [[320,568],[390,844],[768,1024],[844,390],[1440,900],[1920,1080]]) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce', hasTouch: width < 1024 });
      page.on('pageerror', error => errors.push(error.message));
      if (width === 768) await page.addInitScript(() => localStorage.setItem('theme', 'light'));
      await page.goto(base, { waitUntil: 'networkidle' });
      await enter(page, { id: 'lima', name: '리마' });
      await expect(page.locator('.conversation-demo')).toHaveAttribute('data-step', '0');
      await expect(page.locator('.conversation-user').first()).toContainText('산프란시스코수도원까지 가고 싶어');
      await page.getByRole('button', { name: '가는 길 식당 보기', exact: true }).click();
      await expect(page.locator('.dining-food-pin')).toHaveCount(3);
      await page.waitForTimeout(120);
      const layout = await page.evaluate(() => {
        const rect = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
        return { logo: rect('.landing-nav .airo-logo'), panel: rect('.conversation-panel'), toolbar: rect('.conversation-toolbar'), map: rect('.dining-map-window'), log: rect('.conversation-messages'), choices: [...document.querySelectorAll('.dining-choice')].map(el => el.getBoundingClientRect().toJSON()), pins: [...document.querySelectorAll('.dining-food-pin')].map(el => el.getBoundingClientRect().toJSON()), overflow: document.documentElement.scrollWidth > innerWidth };
      });
      assert.ok(!layout.overflow && layout.panel.bottom <= height + 1);
      assert.ok(Math.abs(layout.panel.left - layout.logo.left) < .1);
      assert.ok(layout.toolbar.bottom <= layout.panel.top);
      if (width < 768) for (const choice of layout.choices) assert.ok(choice.top >= layout.log.top - 1 && choice.bottom <= layout.log.bottom + 1, `${engine} ${width}: three restaurant choices visible inside chat`);
      for (const pin of layout.pins) assert.ok(pin.left >= layout.map.left - 1 && pin.right <= layout.map.right + 1 && pin.top >= layout.map.top - 1 && pin.bottom <= layout.map.bottom + 1, `${engine} ${width}: candidate pin fits map`);
      await page.screenshot({ path: `${output}/checked-choices-${engine}-${width}.png` });
      await page.locator('.dining-choice').nth(1).click();
      await expect(page.locator('.dining-map')).toHaveAttribute('data-route', 'direct');
      await expect(page.locator('.dining-saved-route')).toHaveCount(0);
      const input = page.getByRole('textbox', { name: '식당을 일정에 추가하는 메시지' });
      await input.fill('2번 가게를 일정에 추가해줘.');
      if (width === 390) {
        await page.evaluate(() => { Object.defineProperty(visualViewport, 'height', { configurable: true, get: () => 360 }); visualViewport.dispatchEvent(new Event('resize')); });
        await page.waitForTimeout(100);
        const composer = await page.locator('.conversation-compose').boundingBox();
        assert.ok(composer.y >= 0 && composer.y + composer.height <= 361, 'Composer stays above keyboard');
        await page.screenshot({ path: `${output}/keyboard-${engine}.png` });
        await page.evaluate(h => { Object.defineProperty(visualViewport, 'height', { configurable: true, get: () => h }); visualViewport.dispatchEvent(new Event('resize')); }, height);
      }
      await page.getByRole('button', { name: '메시지 보내기', exact: true }).click();
      await expect(page.locator('.conversation-demo')).toHaveAttribute('data-step', '4');
      await expect(page.locator('.dining-map')).toHaveAttribute('data-route', data.cities.lima.restaurants[1].id);
      await expect(page.locator('.dining-saved-stops')).toContainText(data.cities.lima.restaurants[1].name);
      const route = await page.locator('.dining-saved-route').getAttribute('d');
      assert.notEqual(route, await page.locator('.dining-direct-route').getAttribute('d'));
      assert.equal(await page.locator('.dining-saved-route').getAttribute('vector-effect'), null, 'Normalized path reveal must not truncate on scaled maps');
      await page.waitForTimeout(150);
      await page.screenshot({ path: `${output}/checked-saved-${engine}-${width}.png` });
      await page.getByRole('button', { name: '다른 식당 고르기', exact: true }).click();
      await page.locator('.dining-choice').first().click();
      await expect(page.locator('.dining-map')).toHaveAttribute('data-route', data.cities.lima.restaurants[1].id);
      await page.getByRole('button', { name: '메시지 보내기', exact: true }).click();
      await expect(page.locator('.dining-map')).toHaveAttribute('data-route', data.cities.lima.restaurants[0].id);
      await page.getByRole('button', { name: '대화 처음부터 보기', exact: true }).click();
      await expect(page.locator('.conversation-demo')).toHaveAttribute('data-step', '0');
      await expect(page.locator('.dining-saved-route')).toHaveCount(0);
      checks.push({ engine, width, height, layout, selectionBeforeSave: true, chatChangesRoute: true, replacesRestaurant: true, replay: true });
      console.log(`✓ ${engine} ${width}×${height}: choices → next message → saved pin and changed road`);
      await page.close();
    }
  } finally { await browser.close(); }
}
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base, { waitUntil: 'networkidle' });
  for (const city of cities) {
    await enter(page, city);
    await page.getByRole('button', { name: '가는 길 식당 보기', exact: true }).click();
    await expect(page.locator('.dining-choice')).toHaveCount(3);
    await page.getByRole('button', { name: '메시지 보내기', exact: true }).click();
    await expect(page.locator('.dining-map')).toHaveAttribute('data-route', data.cities[city.id].restaurants[0].id);
    await expect(page.locator('.dining-saved-stops')).toContainText(data.cities[city.id].destination.name);
    await page.getByRole('button', { name: '지구본으로', exact: true }).click();
  }
  await page.close();
  const auto = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
  auto.on('pageerror', error => errors.push(error.message));
  await auto.goto(base, { waitUntil: 'networkidle' });
  await enter(auto, { id: 'lima', name: '리마' });
  await auto.mouse.move(1, 1);
  await expect(auto.locator('.conversation-demo')).toHaveAttribute('data-step', '2', { timeout: 6000 });
  await expect(auto.locator('.conversation-demo')).toHaveAttribute('data-step', '4', { timeout: 12000 });
  await expect(auto.locator('.conversation-result .conversation-user')).toContainText('코르다노를 일정에 추가해줘');
  await auto.screenshot({ path: `${output}/automatic-lima.png` });
  await auto.close();
} finally { await browser.close(); }
assert.deepEqual(errors, []);
await writeFile(`${output}/checks.json`, JSON.stringify({ base, cities: cities.length, roadRoutes: cities.length * 4, checks, automaticConversation: true, errors }, null, 2));
console.log(`✓ All ${cities.length} cities and the automatic Lima conversation work`);
