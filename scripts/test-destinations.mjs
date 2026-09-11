import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { decodePolyline } from '../src/lib/polyline.ts';

const base = process.env.LANDING_BASE_URL ?? 'http://localhost:3016';
const output = process.env.LANDING_OUTPUT_DIR ?? 'assets/validation/atlas/destinations';
await mkdir(output, { recursive: true });
const examples = JSON.parse(await readFile('src/lib/landing-destinations.json', 'utf8'));
const routes = JSON.parse(await readFile('src/lib/landing-routes.json', 'utf8')).cities;
const cities = [{ id: 'kyoto', name: '교토', stops: [
  [['난젠지',135.7926827,35.0116224],['철학의 길',135.7946821,35.0215812],['은각사',135.7984287,35.0269122]],
  [['니시키 시장',135.7647092,35.0050295],['폰토초 골목',135.7712126,35.0042456],['겐닌지',135.7746022,35.0001782]],
  [['도게츠교',135.6777631,35.0128677],['텐류지',135.6746179,35.0161665],['대나무 숲',135.6730827,35.0176471]],
] }, ...examples];
assert.ok(examples.length + 1 >= 50, 'At least fifty working destinations');
assert.equal(new Set(cities.map(c => c.id)).size, cities.length);
const shardTotal = Number(process.env.DESTINATION_SHARDS ?? 1);
const shardIndex = Number(process.env.DESTINATION_SHARD ?? 0);
assert.ok(Number.isInteger(shardTotal) && shardTotal > 0 && Number.isInteger(shardIndex) && shardIndex >= 0 && shardIndex < shardTotal);
const testedCities = cities.filter((_, index) => index % shardTotal === shardIndex);
const errors = [], checks = [];
const record = name => { checks.push(name); console.log(`✓ ${name}`); };
const pathPoints = path => {
  const numbers = path.match(/-?[\d.]+/g).map(Number);
  return numbers.reduce((points, value, index) => {
    if (index % 2 === 0) points.push([value, numbers[index + 1]]);
    return points;
  }, []);
};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const watch = page => {
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) errors.push(`${r.status()} ${r.url()}`); });
};
const choose = async (page, city) => {
  await page.locator('.destination-picker summary').click();
  await expect(page.getByRole('group', { name: '여행 예시 목록' }).getByRole('button')).toHaveCount(cities.length);
  await page.getByRole('button', { name: `${city.name} 여행 선택`, exact: true }).click();
  await expect(page.locator('.hero-section')).toHaveAttribute('data-destination', city.id);
  await expect(page.locator('.destination-picker summary')).toBeFocused();
};
const enter = async (page, city) => {
  await page.getByRole('button', { name: `${city.name} 여행 둘러보기`, exact: true }).click();
  await expect(page.locator('.hero-section')).toHaveAttribute('data-arrival', 'landed', { timeout: 8000 });
  await expect(page.getByRole('tab', { name: 'Day 1', exact: true })).toBeFocused();
};
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  watch(page);
  await page.goto(base, { waitUntil: 'networkidle' });
  for (const city of testedCities) {
    await choose(page, city);
    await enter(page, city);
    const map = page.locator('.story-map');
    await expect(map).toHaveAttribute('data-destination', city.id);
    await expect(map.locator('.map-base-dark')).toHaveAttribute('href', `/maps/${city.id}-dark.svg`);
    const basemap = await (await page.request.get(`${base}/maps/${city.id}-dark.svg`)).text();
    const viewBox = basemap.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
    const imageFrame = await map.locator('.map-base-dark').evaluate(el => ['x', 'y', 'width', 'height'].map(key => Number(el.getAttribute(key))));
    imageFrame.forEach((value, index) => assert.ok(Math.abs(value - viewBox[index]) < .000001, `${city.id}: basemap viewport alignment`));
    const streets = basemap.match(/<g id="routed-streets".*?<path d="([^"]+)"/)[1].split(/(?=M)/).map(pathPoints);
    for (let day = 0; day < 3; day++) {
      await page.getByRole('tab', { name: `Day ${day + 1}`, exact: true }).click();
      await expect(map).toHaveAttribute('data-progress', '1.000');
      await expect(map.locator('.map-current-place')).toHaveText(city.stops[day][2][0]);
      const label = await map.locator('.map-coordinate').innerText();
      // The traveler finishes on the accessible road, while landmark pins keep
      // their original POI coordinates (which may be inside a building or park).
      const end = decodePolyline(routes[city.id][day].legs.at(-1)).at(-1);
      const shown = label.match(/[\d.]+/g).map(Number);
      assert.ok(Math.abs(shown[1] - Math.abs(end[0])) <= .000006, label);
      assert.ok(Math.abs(shown[0] - Math.abs(end[1])) <= .000006, label);
      assert.ok(label.includes(end[0] < 0 ? 'W' : 'E'));
      assert.ok(label.includes(end[1] < 0 ? 'S' : 'N'));
      const roadPoints = [...streets[day * 2], ...streets[day * 2 + 1]].filter((point, index, all) => index === 0 || point[0] !== all[index - 1][0] || point[1] !== all[index - 1][1]);
      const drawn = pathPoints(await map.locator(`.map-traveled-route[data-day="${day + 1}"]`).getAttribute('d'));
      assert.equal(drawn.length, roadPoints.length, `${city.id}: preserve every road turn`);
      drawn.forEach((point, index) => {
        assert.ok(Math.hypot(point[0] - roadPoints[index][0], point[1] - roadPoints[index][1]) < .015, `${city.id}: route must sit on the basemap road`);
        assert.ok(point[0] >= viewBox[0] && point[0] <= viewBox[0] + viewBox[2] && point[1] >= viewBox[1] && point[1] <= viewBox[1] + viewBox[3], `${city.id}: real detours remain inside the basemap`);
      });
      for (const [name] of city.stops[day]) await expect(map.getByRole('button', { name: new RegExp(`${name}로 지도 이동$`) })).toBeVisible();
      if (city.id !== 'kyoto') for (const [name] of city.stops[day]) await expect(page.locator('.hero-reply')).toContainText(name);
      // All three day routes must fit on screen, even geographically wide Jeju.
      const pins = await map.locator('.geo-pin[data-current-day=true]').evaluateAll(elements => elements.map(el => {
        const pin = el.getBoundingClientRect(), root = el.closest('.geographic-map').getBoundingClientRect();
        return { x: pin.x - root.x, y: pin.y - root.y, width: root.width, height: root.height };
      }));
      for (const pin of pins) assert.ok(pin.x >= 0 && pin.y >= 0 && pin.x < pin.width && pin.y < pin.height, `${city.id} day ${day + 1}: ${JSON.stringify(pin)}`);
    }
    await page.getByRole('button', { name: '지도 조작 켜기', exact: true }).click();
    await map.getByRole('button', { name: `2${city.stops[2][1][0]}로 지도 이동`, exact: true }).click();
    await expect(map.locator('.map-current-place')).toHaveText(city.stops[2][1][0]);
    await expect(page.locator('.hero-card-place')).toContainText(city.stops[2][1][0]);
    await map.locator('.journey-map').focus();
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
    await expect(map).toHaveAttribute('data-has-pin', 'true');
    await expect(map.locator('.map-added-note')).toContainText(city.stops[2][1][1] < 0 ? 'W' : 'E');
    await page.getByRole('button', { name: '새 핀 지우기', exact: true }).click();
    await expect(map).toHaveAttribute('data-has-pin', 'false');
    await expect(page.locator('.thread-user').first()).toContainText(city.name);
    await expect(page.locator('.itinerary-head')).toContainText(city.name);
    await expect(page.locator('.mcp-request')).toContainText(city.name);
    await expect(page.locator('.mcp-window-trip')).toContainText(city.stops[1][1][0]);
    await expect(page.locator('.mcp-reply')).toContainText(city.stops[1][1][0]);
    for (const suffix of ['base.svg', 'dark.svg', 'detail.geojson']) {
      const response = await page.request.get(`${base}/maps/${city.id}-${suffix}`);
      assert.equal(response.status(), 200);
      const body = await response.text();
      assert.ok(body.length > 1000);
      if (suffix === 'detail.geojson') assert.ok(JSON.parse(body).features.length > 100);
    }
    for (let day = 0; day < 3; day++) {
      await page.locator('.day-list button').nth(day).click();
      await expect(page.locator('.feature-map .geographic-map')).toHaveAttribute('data-day', String(day + 1));
      await expect(page.locator('.feature-map .geographic-map')).toHaveAttribute('data-destination', city.id);
      for (const [name] of city.stops[day]) await expect(page.locator('.route-itinerary')).toContainText(name);
    }
    await page.getByRole('button', { name: '지구본으로', exact: true }).click();
    await expect(page.locator('.hero-section')).toHaveAttribute('data-arrival', 'globe');
    assert.equal(await page.evaluate(() => scrollY), 0);
    record(`${city.name}: 3 days / 9 real places, coordinates, map assets, manual map, conversation, features and MCP`);
  }
  await page.close();

  const animated = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  watch(animated); await animated.goto(base, { waitUntil: 'networkidle' });
  for (const city of testedCities) {
    const id = city.id;
    await choose(animated, city);
    await expect(animated.locator('.globe-arrival')).toHaveAttribute('data-ready', 'true');
    await animated.waitForTimeout(1100);
    await animated.locator('.globe-destination').click();
    await expect(animated.locator('.hero-section')).toHaveAttribute('data-arrival', 'flying');
    const progress = animated.getByRole('progressbar');
    await expect.poll(async () => Number(await progress.getAttribute('aria-valuenow'))).toBeGreaterThan(10);
    const first = Number(await progress.getAttribute('aria-valuenow'));
    await expect.poll(async () => Number(await progress.getAttribute('aria-valuenow'))).toBeGreaterThan(first + 8);
    await expect(animated.locator('.globe-flight-status')).toContainText(`${city.name}로 내려가는 중`);
    // Read telemetry in one browser task; a screenshot or a slow polling
    // interval can outlast the final fraction of this short flight.
    const finalFlight = await animated.waitForFunction(() => {
      const value = Number(document.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow'));
      return value > 80 && document.querySelector('.globe-mapcn')?.dataset.center;
    });
    const [flightLng, flightLat] = (await finalFlight.jsonValue()).split(',').map(Number);
    const lngs = city.stops[0].map(stop => stop[1]), lats = city.stops[0].map(stop => stop[2]);
    assert.ok(flightLng >= Math.min(...lngs) - .1 && flightLng <= Math.max(...lngs) + .1, `${city.name}: actual flight longitude ${flightLng}`);
    assert.ok(flightLat >= Math.min(...lats) - .1 && flightLat <= Math.max(...lats) + .1, `${city.name}: actual flight latitude ${flightLat}`);
    if (city === testedCities[0]) await animated.screenshot({ path: `${output}/${id}-descent.png` });
    await expect(animated.locator('.hero-section')).toHaveAttribute('data-arrival', 'landed', { timeout: 7000 });
    await expect(animated.locator('.story-map')).toHaveAttribute('data-progress', '1.000', { timeout: 7000 });
    await expect(animated.locator('.story-map .map-current-place')).toHaveText(city.stops[0][2][0]);
    await animated.getByRole('tab', { name: 'Day 3', exact: true }).click();
    await expect(animated.locator('.hero-section')).toHaveAttribute('data-day', '3');
    await animated.evaluate(() => window.scrollTo(0, 2650));
    await expect(animated.locator('.hero-section')).toHaveAttribute('data-phase', 'overview');
    await animated.waitForTimeout(1500);
    await expect(animated.locator('.hero-summary')).toContainText(`${city.name}`);
    await expect(animated.locator('.story-map .geo-pin:visible')).toHaveCount(9);
    const summary = await animated.locator('.hero-summary').boundingBox();
    for (const pin of await animated.locator('.story-map .geo-pin').all()) {
      const box = await pin.boundingBox();
      assert.ok(box.y + box.height < summary.y, `${city.name}: overview place must sit above the summary`);
    }
    await animated.screenshot({ path: `${output}/${id}-overview.png` });
    await animated.getByRole('button', { name: '지구본으로', exact: true }).click();
    record(`${city.name}: animated descent, live progress, route playback, scroll overview and return`);
  }
  // A visitor can explicitly skip or pause a flight, then start another city.
  await choose(animated, cities.find(c => c.id === 'tokyo'));
  await animated.getByRole('button', { name: '도쿄 여행 둘러보기', exact: true }).click();
  await animated.keyboard.press('Escape');
  await expect(animated.locator('.hero-section')).toHaveAttribute('data-arrival', 'landed');
  await animated.getByRole('button', { name: '지구본으로', exact: true }).click();
  await choose(animated, cities.find(c => c.id === 'busan'));
  await animated.getByRole('button', { name: '부산 여행 둘러보기', exact: true }).click();
  await animated.getByRole('button', { name: '애니메이션 일시정지', exact: true }).click();
  await expect(animated.locator('.hero-section')).toHaveAttribute('data-arrival', 'landed');
  record('Escape and motion pause finish flights without trapping the visitor');
  await animated.close();

  for (const width of [320, 375, 768, 1920]) {
    const mobile = await browser.newPage({ viewport: { width, height: width < 768 ? 812 : 1080 }, reducedMotion: 'reduce' });
    watch(mobile); await mobile.goto(base, { waitUntil: 'networkidle' });
    await mobile.locator('.destination-picker summary').click();
    await mobile.screenshot({ path: `${output}/menu-${width}.png` });
    await mobile.getByRole('button', { name: '시드니 여행 선택', exact: true }).click();
    await enter(mobile, cities.find(c => c.id === 'sydney'));
    await mobile.getByRole('tab', { name: 'Day 3', exact: true }).click();
    await expect(mobile.locator('.story-map .map-coordinate')).toContainText('S');
    await mobile.screenshot({ path: `${output}/sydney-${width}.png` });
    assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await mobile.close(); record(`${width}px: destination selection, southern hemisphere map and no overflow`);
  }
  // Simulate unsupported WebGL; the accessible chooser and direct itinerary remain available.
  const fallback = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await fallback.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) { return String(type).includes('webgl') ? null : original.call(this, type, ...args); };
  });
  await fallback.goto(base, { waitUntil: 'networkidle' });
  await choose(fallback, cities.find(c => c.id === 'london'));
  await enter(fallback, cities.find(c => c.id === 'london'));
  await expect(fallback.locator('.story-map')).toHaveAttribute('data-destination', 'london');
  await fallback.close(); record('Without WebGL: city chooser and direct itinerary work');
  assert.deepEqual(errors, []);
  record('No runtime errors, console errors or missing local assets');
  await writeFile(`${output}/checks.json`, JSON.stringify({ base, checkedAt: new Date().toISOString(), destinations: cities.length, places: cities.length * 9, testedDestinations: testedCities.map(city => city.id), shardIndex, shardTotal, checks, errors }, null, 2));
} finally { await browser.close(); }
