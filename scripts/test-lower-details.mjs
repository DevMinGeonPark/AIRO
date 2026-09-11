import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit, expect } from '@playwright/test';

const base = process.env.LANDING_BASE_URL ?? 'http://127.0.0.1:3018';
const out = 'assets/validation/lower-details/details';
await mkdir(out, { recursive: true });
const checks = [], errors = [];
const toolCases = [
  ['ChatGPT 데스크톱', 'chatgpt-desktop', 'learn.chatgpt.com'],
  ['Claude Code', 'claude-code', 'code.claude.com'],
  ['Cursor', 'cursor', 'cursor.com'],
  ['Codex CLI · IDE', 'codex', 'learn.chatgpt.com'],
];
const titles = ['로마의 오후', '고대 로마를 걷다', '강 건너의 오후'];
const firstStops = ['판테온', '콜로세움', '산탄젤로성'];
for (const [name, engine, width, reduced] of [
  ['chrome', chromium, 1440, false], ['webkit', webkit, 390, false],
  ['chrome', chromium, 320, true], ['webkit', webkit, 768, true],
]) {
  const browser = await engine.launch({ headless: true, ...(engine === chromium ? { channel: 'chrome' } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
    page.on('pageerror', e => errors.push(`${name}/${width}: ${e.message}`));
    page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) errors.push(`${r.status()} ${r.url()}`); });
    await page.goto(base, { waitUntil: 'networkidle' });
    const panel = page.locator('.lower-conversation-panel');
    const tabs = page.getByRole('tablist', { name: '대화 예시 날짜 선택' }).getByRole('tab');
    const snapshots = [];
    for (let day = 0; day < 3; day++) {
      await tabs.nth(day).click();
      await expect(page.locator('.lower-trip-banner h3')).toHaveText(titles[day]);
      await expect(page.locator('.lower-generated-stops h4').first()).toHaveText(firstStops[day]);
      await expect(panel).toHaveAttribute('data-story', String(day + 1));
      await expect(page.locator('.lower-trip-banner img[data-active=true]')).toHaveCount(1);
      await expect(page.locator('.lower-generated-stops .lower-stop-number')).toHaveCount(0);
      snapshots.push({ title: titles[day], request: await page.locator('.lower-chat-user').innerText(), image: await page.locator('.lower-trip-banner img[data-active=true]').getAttribute('src') });
      await page.waitForTimeout(350);
      await panel.screenshot({ path: `${out}/conversation-${name}-${width}-${day + 1}.png`, style: '.landing-nav,.skip-link{visibility:hidden!important}' });
    }
    assert.equal(new Set(snapshots.map(s => s.request)).size, 3);
    assert.equal(new Set(snapshots.map(s => s.image)).size, 3);
    await tabs.first().click();
    const releaseFocus = async () => { await page.evaluate(() => document.activeElement?.blur()); await page.mouse.move(1, 1); };
    await releaseFocus();
    await panel.scrollIntoViewIfNeeded();
    if (!reduced) {
      await expect(panel).toHaveAttribute('data-autoplay', 'playing');
      for (const day of [1, 2]) {
        await expect(panel).toHaveAttribute('data-story', String(day + 1), { timeout: 8500 });
        await expect(page.locator('.lower-trip-banner h3')).toHaveText(titles[day]);
        await expect(page.locator('.lower-generated-stops h4').first()).toHaveText(firstStops[day]);
      }
      await page.getByRole('button', { name: '여행 예시 자동 넘김 일시정지' }).click();
      await releaseFocus();
      const held = await panel.getAttribute('data-story');
      await expect(panel).toHaveAttribute('data-autoplay', 'paused');
      await page.waitForTimeout(6300);
      await expect(panel).toHaveAttribute('data-story', held);
      await page.getByRole('button', { name: '여행 예시 자동 넘김 재생' }).click();
      await releaseFocus();
      await expect(panel).toHaveAttribute('data-autoplay', 'playing');
      await expect(panel).not.toHaveAttribute('data-story', held, { timeout: 8500 });
      await page.locator('.lower-integration').scrollIntoViewIfNeeded();
      const offscreen = await panel.getAttribute('data-story');
      await expect(panel).toHaveAttribute('data-autoplay', 'paused');
      await page.waitForTimeout(6300);
      await expect(panel).toHaveAttribute('data-story', offscreen);
    } else {
      await expect(page.locator('.lower-conversation-autoplay')).toBeDisabled();
      await expect(panel).toHaveAttribute('data-autoplay', 'paused');
      await page.waitForTimeout(6300);
      await expect(panel).toHaveAttribute('data-story', '1');
    }
    await page.getByRole('button', { name: '조금 더 여유롭게 바꾸는 예시 보기' }).click();
    assert.deepEqual(await page.locator('.lower-generated-stops time').allTextContents(), ['10:00', '11:30', '13:30']);
    await page.getByRole('button', { name: '처음 예시 일정 다시 보기' }).click();

    let alignmentChecks = 0;
    for (const city of ['로마', '이스탄불', '리우데자네이루']) {
      if (city !== '로마') {
        await page.locator('.destination-picker summary').click();
        await page.getByRole('textbox', { name: '도시 또는 나라 검색' }).fill(city);
        await page.getByRole('button', { name: `${city} 여행 선택`, exact: true }).click();
      }
      for (let day = 0; day < 3; day++) {
        await page.getByRole('tablist', { name: '지도 날짜 선택' }).getByRole('tab').nth(day).click();
        const offsets = await page.locator('.lower-route-stops button').evaluateAll(buttons => buttons.map(button => {
          const marker = button.querySelector('.lower-stop-number'), title = button.querySelector('h4');
          const m = marker.getBoundingClientRect(), t = title.getBoundingClientRect();
          return Math.abs(m.top + m.height / 2 - t.top - parseFloat(getComputedStyle(title).lineHeight) / 2);
        }));
        assert.ok(offsets.every(value => value < 1), `Route marker/title alignment ${city}/${day}/${width}: ${offsets}`);
        alignmentChecks += offsets.length;
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      }
    }
    await page.locator('.lower-routes').screenshot({ path: `${out}/route-${name}-${width}.png`, style: '.landing-nav,.skip-link{visibility:hidden!important}' });
    for (const [label, id, domain] of toolCases) {
      await page.getByRole('tab', { name: label, exact: true }).click();
      await expect(page.locator('.lower-tool-preview-panel')).toHaveAttribute('data-tool', id);
      assert.equal(new URL(await page.locator('.lower-tool-context a').getAttribute('href')).hostname, domain);
      await expect(page.locator('.lower-mcp-cta a')).toHaveAttribute('href', `/docs/mcp#${id}`);
    }
    await page.locator('.lower-integration').screenshot({ path: `${out}/tools-${name}-${width}.png`, style: '.landing-nav,.skip-link{visibility:hidden!important}' });
    await page.locator('.lower-mcp-cta a').click();
    await expect(page).toHaveURL(/\/docs\/mcp#codex$/);
    for (const [, id] of toolCases) await expect(page.locator(`#${id}`)).toHaveCount(1);
    await expect(page.locator('#chatgpt-web')).toContainText('현재 직접 연결 미지원');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Guide has no mobile overflow');
    checks.push({ engine: name, width, reduced, stories: snapshots, realSixSecondAutoplay: !reduced, manualControls: true, localPause: !reduced, offscreenPause: !reduced, alignmentChecks, tools: 4, guideAnchors: true });
    console.log(`✓ ${name} ${width}: ${reduced ? 'reduced motion + manual' : '6-second auto + pause/resume'}; 3 stories, ${alignmentChecks} marker alignments, tool guides`);
  } finally { await browser.close(); }
}
assert.deepEqual(errors, []);
await writeFile(`${out}/checks.json`, JSON.stringify({ base, checks, errors }, null, 2));
