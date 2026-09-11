import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium, webkit, expect } from '@playwright/test';
import { decodePolyline } from '../src/lib/polyline.ts';

const base = process.env.LANDING_BASE_URL ?? 'http://127.0.0.1:3018';
const output = process.env.OUTING_OUTPUT ?? 'assets/validation/outing';
const data = JSON.parse(await readFile('public/maps/outing-scenarios.json', 'utf8'));
const cities = [{ id: 'kyoto', name: '교토' }, ...JSON.parse(await readFile('src/lib/landing-destinations.json', 'utf8'))];
const categories = { restaurant: '식당', cafe: '카페', bar: '술집', dessert: '디저트' };
const errors = [], checks = [], layoutIssues = [];
let allCityCategorySaveFlows = 0;
await mkdir(output, { recursive: true });
const distance = (a, b) => Math.hypot((a[0] - b[0]) * Math.cos(a[1] * Math.PI / 180), a[1] - b[1]) * 111000;
const partial = process.env.OUTING_DATA_PARTIAL === 'true';
const testedCities = partial ? cities.filter(city => data.cities[city.id]) : cities;
if (!partial) assert.deepEqual(Object.keys(data.cities).sort(), cities.map(city => city.id).sort());
else assert.ok(['kyoto', 'lima'].every(id => data.cities[id]), 'Partial smoke requires Kyoto and Lima');
let roadRoutes = 0;
for (const city of testedCities) {
  const scenario = data.cities[city.id];
  const validateRoute = (route, place) => {
    const message = `${city.id}/${place?.id ?? 'direct'}`;
    assert.equal(route.legs.length, place ? 2 : 1, message);
    assert.ok(route.distanceKm > 0 && route.durationSeconds > 0, message);
    const legs = route.legs.map(decodePolyline);
    assert.ok(legs.flat().length >= 3, `${message}: road has real intermediate geometry`);
    assert.ok(legs.flat().every(point => point.every(Number.isFinite)), message);
    assert.ok(distance(legs[0][0], scenario.origin.coordinate) < 300, `${message}: starts at origin`);
    assert.ok(distance(legs.at(-1).at(-1), scenario.destination.coordinate) < 300, `${message}: reaches destination`);
    if (place) {
      assert.deepEqual(legs[0].at(-1), legs[1][0], `${message}: legs meet without a synthetic connection`);
      assert.ok(distance(legs[0].at(-1), place.coordinate) < 300, `${message}: visits the named place`);
    }
    roadRoutes++;
  };
  validateRoute(scenario.route);
  for (const category of Object.keys(categories)) {
    const places = scenario.categories[category];
    assert.equal(places.length, 3, `${city.id}/${category}: three choices`);
    assert.equal(new Set(places.map(place => place.id)).size, 3);
    for (const place of places) {
      assert.ok(place.name && place.originalName, `${city.id}/${category}: named place`);
      assert.match(place.source, /^https:\/\/www\.openstreetmap\.org\/(node|way|relation)\/\d+$/);
      assert.equal(place.id, place.source.split('/').slice(-2).join('-'));
      if (category !== 'restaurant') assert.equal(place.category, category, `${city.id}/${category}: explicit category provenance`);
      validateRoute(place.route, place);
    }
  }
}
console.log(`✓ ${testedCities.length} cities × four categories × three sourced places; ${roadRoutes} connected walking routes`);
if (process.env.OUTING_DATA_ONLY === 'true') {
  await writeFile(`${output}/data-checks.json`, JSON.stringify({ partial, cities: testedCities.length, categories, roadRoutes }, null, 2));
  process.exit(0);
}

async function selectDestination(page, city) {
  await page.locator('.destination-picker summary').click();
  await page.getByRole('button', { name: `${city.name} 여행 선택`, exact: true }).click();
  await page.getByRole('button', { name: `${city.name} 여행 둘러보기`, exact: true }).click();
}
async function revealConversation(page) {
  await expect(page.locator('.hero-section')).toHaveAttribute('data-arrival', 'landed', { timeout: 10000 });
  await expect(page.locator('.conversation-map-layer')).toHaveAttribute('aria-hidden', 'false');
}
async function enter(page, city) {
  await selectDestination(page, city);
  await revealConversation(page);
  await expect(page.locator('.conversation-panel')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.conversation-map-layer')).toHaveAttribute('aria-hidden', 'false');
}
async function scrollStory(page, progress) {
  await page.evaluate(progress => {
    const grid = document.querySelector('.hero-grid');
    const section = document.querySelector('.hero-section');
    window.scrollTo({ top: section.getBoundingClientRect().top + scrollY + grid.offsetHeight * 2.5 * progress, behavior: 'instant' });
  }, progress);
  await expect.poll(async () => Math.abs(Number(await page.locator('.hero-section').getAttribute('data-story-progress')) - progress)).toBeLessThan(.015);
}
async function category(page, key) {
  await page.locator(`.conversation-categories button[data-category="${key}"]`).click();
  await expect(page.locator('.conversation-demo')).toHaveAttribute('data-category', key);
  await expect(page.locator('.dining-choice')).toHaveCount(3);
}
async function requestCategory(page, key) {
  await page.locator('.conversation-compose input').fill(`가는 길에 ${categories[key]} 추천해줘.`);
  await page.getByRole('button', { name: '메시지 보내기', exact: true }).click();
  await expect(page.locator('.conversation-demo')).toHaveAttribute('data-category', key);
  await expect(page.locator('.dining-choice')).toHaveCount(3);
}
async function save(page, city, key, index = 1) {
  await page.locator('.dining-choice').nth(index).click();
  await page.locator('.conversation-compose input').fill(`${index + 1}번 가게를 일정에 추가해줘.`);
  await page.getByRole('button', { name: '메시지 보내기', exact: true }).click();
  const place = data.cities[city].categories[key][index];
  await expect(page.locator('.conversation-demo')).toHaveAttribute('data-step', '4');
  await expect(page.locator('.dining-map')).toHaveAttribute('data-route', place.id);
  await expect(page.locator('.dining-saved-stops')).toContainText(place.name);
  await expect(page.locator('.dining-map-canvas')).toHaveAttribute('aria-label', new RegExp(place.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const path = await page.locator('.dining-saved-route').getAttribute('d');
  assert.ok((path.match(/L/g) ?? []).length >= 2, 'Saved route uses road geometry');
  assert.equal(await page.locator('.dining-saved-route').getAttribute('vector-effect'), null);
  return { id: place.id, path };
}
for (const [engine, type] of [['chrome', chromium], ['webkit', webkit]]) {
  const browser = await type.launch(engine === 'chrome' ? { channel: 'chrome' } : {});
  try {
    const narrative = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
    narrative.on('pageerror', error => { const failure = { context: `narrative/${engine}`, message: error.message, stack: error.stack }; errors.push(failure); console.log(failure); });
    await narrative.goto(base, { waitUntil: 'networkidle' });
    await selectDestination(narrative, { id: 'lima', name: '리마' });
    await expect(narrative.locator('.hero-section')).toHaveAttribute('data-arrival', 'landed', { timeout: 10000 });
    await expect(narrative.locator('.dining-map-canvas')).toHaveCount(1);
    await narrative.evaluate(() => { window.__outingMap = document.querySelector('.dining-map-canvas'); });
    await scrollStory(narrative, .10);
    const intermediate = await narrative.locator('.hero-copy').evaluate(element => Number(getComputedStyle(element).opacity));
    assert.ok(intermediate < .02, 'Intro remains hidden on the arrived live map');
    await scrollStory(narrative, .40);
    await expect(narrative.locator('.conversation-demo')).toHaveAttribute('data-step', '2');
    await expect(narrative.locator('.dining-food-pin')).toHaveCount(3);
    await expect(narrative.locator('.dining-saved-route')).toHaveCount(0);
    const chat = await narrative.locator('.conversation-messages').boundingBox();
    await narrative.mouse.move(chat.x + chat.width / 2, chat.y + chat.height / 2);
    await narrative.mouse.wheel(0, 250);
    await expect.poll(async () => Number(await narrative.locator('.hero-section').getAttribute('data-story-progress'))).toBeGreaterThan(.43);
    await narrative.waitForTimeout(1600);
    await scrollStory(narrative, .70);
    await expect(narrative.locator('.conversation-demo')).toHaveAttribute('data-step', '3');
    await scrollStory(narrative, .85);
    await expect(narrative.locator('.conversation-demo')).toHaveAttribute('data-step', '4');
    await expect(narrative.locator('.dining-map')).toHaveAttribute('data-route', data.cities.lima.categories.restaurant[0].id);
    assert.ok(await narrative.evaluate(() => window.__outingMap === document.querySelector('.dining-map-canvas')), 'Same map DOM persists through the scroll conversation');
    await narrative.screenshot({ path: `${output}/scroll-saved-${engine}.png` });
    await scrollStory(narrative, 0);
    await expect(narrative.locator('.conversation-map-layer')).toHaveAttribute('aria-hidden', 'false');
    await expect(narrative.locator('.hero-copy')).toHaveAttribute('aria-hidden', 'true');
    await expect(narrative.locator('.dining-saved-route')).toHaveCount(0);
    assert.ok(await narrative.evaluate(() => window.__outingMap === document.querySelector('.dining-map-canvas')), 'Returning upward retains geographic scene');
    checks.push({ engine, scrollNarrative: true, headlineStaysHidden: intermediate < .02, sameMapDOM: true, scrollReversesStory: true });
    await narrative.close();
    for (const [width, height, theme] of [[320,568,'dark'],[390,844,'light'],[844,390,'dark'],[1440,900,'dark']]) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce', hasTouch: width < 1024 });
      page.on('pageerror', error => { const failure = { context: `viewport/${engine}/${width}`, message: error.message, stack: error.stack }; errors.push(failure); console.log(failure); });
      await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
      await page.goto(base, { waitUntil: 'networkidle' });
      await enter(page, { id: 'lima', name: '리마' });
      // Re-click the current category after its initial autoscroll settled.
      await page.waitForTimeout(180);
      let prior = null;
      for (const key of Object.keys(categories)) {
        if (prior && width === 1440) await requestCategory(page, key);
        else await category(page, key);
        const names = await page.locator('.dining-choice strong').allTextContents();
        assert.deepEqual(names, data.cities.lima.categories[key].map(place => place.name));
        await expect(page.locator('.dining-map')).toHaveAttribute('data-route', prior?.id ?? 'direct');
        await expect(page.locator('.dining-food-pin')).toHaveCount(3);
        await page.waitForTimeout(120);
        if (width < 768) await expect.poll(() => page.evaluate(() => {
          const box = document.querySelector('.conversation-messages').getBoundingClientRect();
          return [...document.querySelectorAll('.dining-choice')].every(el => { const rect = el.getBoundingClientRect(); return rect.top >= box.top - 1 && rect.bottom <= box.bottom + 1; });
        }), { message: `${engine}/${width}/${key}: three complete candidates visible` }).toBe(true).catch(async error => {
          await page.screenshot({ path: `${output}/fit-failure-${engine}-${width}-${key}.png` });
          console.log(await page.evaluate(() => ({ log: document.querySelector('.conversation-messages').getBoundingClientRect().toJSON(), scroll: document.querySelector('.conversation-messages').scrollTop, choices: [...document.querySelectorAll('.dining-choice')].map(e => e.getBoundingClientRect().toJSON()), fonts: document.fonts.status })));
          throw error;
        });
        const layout = await page.evaluate(() => {
          const rect = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
          return { logo: rect('.landing-nav .airo-logo'), panel: rect('.conversation-panel'), map: rect('.dining-map-window'), log: rect('.conversation-messages'), composer: rect('.conversation-compose'), choices: [...document.querySelectorAll('.dining-choice')].map(el => el.getBoundingClientRect().toJSON()), pins: [...document.querySelectorAll('.dining-food-pin')].map(el => el.getBoundingClientRect().toJSON()), overflow: document.documentElement.scrollWidth > innerWidth };
        });
        assert.ok(!layout.overflow && layout.panel.bottom <= height + 1);
        assert.ok(Math.abs(layout.panel.left - layout.logo.left) < .1);
        assert.ok(layout.composer.top >= 0 && layout.composer.bottom <= height + 1);
        for (const choice of layout.choices) {
          assert.ok(choice.left >= layout.panel.left - 1 && choice.right <= layout.panel.right + 1, `${engine}/${width}/${key}: choice fits panel`);
          if (width < 768) assert.ok(choice.top >= layout.log.top - 1 && choice.bottom <= layout.log.bottom + 1, `${engine}/${width}/${key}: all three choices fully visible in chat`);
        }
        for (const pin of layout.pins) assert.ok(pin.left >= layout.map.left - 1 && pin.right <= layout.map.right + 1 && pin.top >= layout.map.top - 1 && pin.bottom <= layout.map.bottom + 1, `${engine}/${width}/${key}: pin fits map`);
        for (let a = 0; a < layout.pins.length; a++) for (let b = a + 1; b < layout.pins.length; b++) {
          const first = layout.pins[a], second = layout.pins[b];
          const overlap = (first.width + second.width) / 2 - Math.hypot((first.left + first.right - second.left - second.right) / 2, (first.top + first.bottom - second.top - second.bottom) / 2);
          if (overlap > .5) layoutIssues.push({ engine, width, category: key, message: 'Candidate pin circles overlap', first, second, overlap });
        }
        await page.locator('.dining-choice').nth(1).click();
        await expect(page.locator('.dining-map')).toHaveAttribute('data-route', prior?.id ?? 'direct');
        if (prior) assert.equal(await page.locator('.dining-saved-route').getAttribute('d'), prior.path, 'Exploration preserves saved road geometry');
        await page.screenshot({ path: `${output}/choices-${engine}-${width}-${key}.png` });
        if (width === 390 && key === 'cafe') {
          await page.locator('.conversation-compose input').focus();
          await page.evaluate(() => { Object.defineProperty(visualViewport, 'height', { configurable: true, get: () => 360 }); visualViewport.dispatchEvent(new Event('resize')); });
          await page.waitForTimeout(100);
          const composer = await page.locator('.conversation-compose').boundingBox();
          assert.ok(composer.y >= 0 && composer.y + composer.height <= 361, 'Composer remains above keyboard');
          await page.screenshot({ path: `${output}/keyboard-${engine}.png` });
          await page.evaluate(h => { Object.defineProperty(visualViewport, 'height', { configurable: true, get: () => h }); visualViewport.dispatchEvent(new Event('resize')); }, height);
        }
        prior = await save(page, 'lima', key);
        await page.screenshot({ path: `${output}/saved-${engine}-${width}-${key}.png` });
        checks.push({ engine, width, height, theme, category: key, selectionDoesNotSave: true, chatUpdatesNamedStopAndRoad: true, layout });
      }
      await page.getByRole('button', { name: '대화 처음부터 보기', exact: true }).click();
      await expect(page.locator('.conversation-demo')).toHaveAttribute('data-step', '1');
      await expect(page.locator('.dining-saved-route')).toHaveCount(0);
      await category(page, 'cafe');
      await page.locator('.conversation-compose input').fill('아무데나 아무 가게');
      await page.getByRole('button', { name: '메시지 보내기', exact: true }).click();
      await expect(page.locator('.conversation-compose').getByRole('alert')).toBeVisible();
      await expect(page.locator('.dining-map')).toHaveAttribute('data-route', 'direct');
      await save(page, 'lima', 'cafe', 2);
      await writeFile(`${output}/progress-checks.json`, JSON.stringify({ base, partial, cities: testedCities.length, roadRoutes, checks, errors }, null, 2));
      console.log(`✓ ${engine} ${width}×${height} ${theme}: all categories, preview/save separation, replay/error recovery`);
      await page.close();
    }
  } finally { await browser.close(); }
}
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  page.on('pageerror', error => { const failure = { context: 'all-cities', message: error.message, stack: error.stack }; errors.push(failure); console.log(failure); });
  await page.goto(base, { waitUntil: 'networkidle' });
  for (const city of process.env.OUTING_SMOKE === 'true' ? testedCities.filter(city => ['lima', 'kyoto', 'amsterdam'].includes(city.id)) : testedCities) {
    await enter(page, city);
    for (const key of Object.keys(categories)) {
      await category(page, key);
      assert.deepEqual(await page.locator('.dining-choice strong').allTextContents(), data.cities[city.id].categories[key].map(place => place.name));
      await save(page, city.id, key, 0);
      allCityCategorySaveFlows++;
    }
    await page.getByRole('button', { name: '지구본으로', exact: true }).click();
    if (allCityCategorySaveFlows % 20 === 0) console.log(`✓ ${allCityCategorySaveFlows} city/category saves verified`);
  }
  await page.close();
  const retry = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  retry.on('pageerror', error => { const failure = { context: 'retry', message: error.message, stack: error.stack }; errors.push(failure); console.log(failure); });
  let failedRequests = 0, allowRetry = false;
  await retry.route('**/maps/outing-scenarios.json*', route => {
    failedRequests++;
    if (!allowRetry) return route.fulfill({ status: 503, body: 'Temporary failure' });
    return route.continue();
  });
  await retry.goto(base, { waitUntil: 'networkidle' });
  await selectDestination(retry, { id: 'lima', name: '리마' });
  await revealConversation(retry);
  await expect(retry.getByRole('button', { name: '다시 불러오기', exact: true })).toBeVisible();
  allowRetry = true;
  await retry.getByRole('button', { name: '다시 불러오기', exact: true }).click();
  await expect(retry.locator('.conversation-panel')).toBeVisible();
  await expect.poll(async () => JSON.parse(await retry.locator('.globe-mapcn').getAttribute('data-camera')).zoom).toBeGreaterThan(8);
  await category(retry, 'bar');
  await save(retry, 'lima', 'bar', 2);
  assert.ok(failedRequests >= 2, 'Retry performs a fresh data request');
  await retry.close();
} finally { await browser.close(); }
await writeFile(`${output}/checks.json`, JSON.stringify({ base, partial, cities: testedCities.length, categories, roadRoutes, checks, layoutIssues, allCityCategorySaveFlows, errors }, null, 2));
assert.deepEqual(errors, []);
assert.deepEqual(layoutIssues, [], 'Candidate pins must not overlap');
console.log(`✓ All ${allCityCategorySaveFlows} city/category chat saves update the matching named pin and road`);
