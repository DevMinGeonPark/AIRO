import { chromium, webkit, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { notePins, notePreview } from '../src/lib/place-note.ts';

assert.deepEqual(notePins('예약번호 12345678\nPIN: 0012#\n출입 비밀번호: *7890#\nDoor code = AB-123\nPIN: 0012#'), [
  { label: 'PIN', value: '0012#' }, { label: '출입 비밀번호', value: '*7890#' }, { label: 'Door code', value: 'AB-123' },
]);
assert.deepEqual(notePins('SPIN: 1234\n객실 301\nPIN 미정\n2026-09-21'), []);
assert.deepEqual(notePreview('\n 첫 안내\r\n\n둘째\n셋째\n넷째'), ['첫 안내', '둘째', '셋째']);

const dir = 'src/app/note-offline-check', out = '.private/validation/place-note', origin = 'http://127.0.0.1:3451';
const note = '체크인: 15:00\n짐 보관: 안내 데스크\n현관: 오른쪽 입구\n\n' + Array.from({ length: 18 }, (_, i) => `안내 ${i + 1}: 입구를 지나 오른쪽으로 이동해 주세요. 짐 보관은 안내 데스크에서 가능합니다.`).join('\n\n') + '\n\nPIN: 0012#\n\n마지막 안내: 체크아웃 11:00';
const stop = { id: 'note-test', trip_id: 'fixture', name: '테스트 숙소', lat: 41.9, lng: 12.4, day: 1, position: 0, time: '15:00', map_query: 'Hotel A&B #1', mode: 'ground', note };
const oldEnv = await readFile('next-env.d.ts'), oldTypes = await readFile('tsconfig.json');
await mkdir(dir); await mkdir(out, { recursive: true });
await writeFile(`${dir}/page.tsx`, `"use client";
import {useState} from 'react';
import {PlaceNote} from '@/components/place-note';
import {PlaceMapActions} from '@/components/place-map-actions';
import {DayAccommodationModal} from '@/components/day-accommodation-modal';
import {StopEditor} from '@/components/stop-editor';
import '@/components/trip-management.css';
export default function Page(){const [stay,setStay]=useState(false);const stop=${JSON.stringify(stop)};return <main className="trip-management" style={{maxWidth:520,padding:24}}><PlaceMapActions place={stop}/><PlaceNote name={stop.name} note={stop.note}/><button onClick={()=>setStay(true)}>숙소 정보</button>{stay&&<DayAccommodationModal day={1} stays={[stop]} attachments={{reservations:[],documents:[]}} onClose={()=>setStay(false)}/>}<StopEditor tripId="fixture" stop={stop} onSaved={async()=>{}} onClose={()=>{}}/></main>}`);
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '-p', '3451'], {
  env: { ...process.env, NEXT_DIST_DIR: '.next-note-check', NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_ANON_KEY: '', OPENAI_API_KEY: '', GOOGLE_MAPS_API_KEY: '', MCP_OAUTH_ENABLED: 'false', DEMO_DB_PATH: '/tmp/airo-note-unused.json' }, stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '', browser;
server.stdout.on('data', data => log += data); server.stderr.on('data', data => log += data);
const results = [];
try {
  const start = Date.now();
  while (!log.includes('Ready in')) { if (server.exitCode !== null || Date.now() - start > 60000) throw Error(log.slice(-3000)); await new Promise(resolve => setTimeout(resolve, 200)); }
  for (const [engine, width] of [[chromium, 1440], [chromium, 390], [webkit, 320]]) {
    browser = await engine.launch(engine === chromium ? { channel: 'chrome' } : {});
    const context = await browser.newContext({ viewport: { width, height: 780 }, serviceWorkers: 'block' });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.noteClipboard = '';
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async value => { window.noteClipboard = value; } } });
    });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      return url.origin !== origin || url.pathname.startsWith('/api/') ? route.abort() : route.continue();
    });
    await page.goto(`${origin}/note-offline-check`, { waitUntil: 'networkidle' });
    const href = await page.getByRole('link', { name: '길찾기', exact: true }).getAttribute('href');
    assert.deepEqual(Object.fromEntries(new URL(href).searchParams), { api: '1', destination: 'Hotel A&B #1', dir_action: 'navigate' });
    const trigger = page.getByRole('button', { name: '테스트 숙소 메모 펼치기', exact: true });
    await expect(trigger).toContainText('0012#'); // PIN remains visible even when it is near the end of the saved note.
    await trigger.click();
    const panel = page.locator('.place-note-dialog');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('strong')).toHaveText('0012#');
    await panel.getByRole('button', { name: 'PIN 복사' }).click();
    assert.equal(await page.evaluate(() => window.noteClipboard), '0012#');
    await expect(panel.getByRole('status')).toHaveText('PIN을 복사했어요.');
    const last = panel.getByText('마지막 안내: 체크아웃 11:00', { exact: true });
    await last.scrollIntoViewIfNeeded(); await expect(last).toBeInViewport();
    await expect(panel.getByRole('button', { name: '메모 닫기' })).toBeInViewport();
    assert.ok(await panel.locator('.place-note-body').evaluate(element => element.scrollWidth <= element.clientWidth + 1));
    await page.screenshot({ path: `${out}/note-end-${width}.png`, animations: 'disabled' });
    await page.keyboard.press('Escape'); await expect(panel).toHaveCount(0); await expect(trigger).toBeFocused();
    await trigger.click();
    await page.screenshot({ path: `${out}/note-pin-${width}.png`, animations: 'disabled' });
    await page.getByRole('button', { name: '메모 닫기', exact: true }).click();
    // A note panel opened from the accommodation dialog must close back to that dialog.
    await page.getByRole('button', { name: '숙소 정보', exact: true }).click();
    const stay = page.locator('.day-accommodation-dialog');
    await stay.getByRole('button', { name: '테스트 숙소 메모 펼치기' }).click();
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: '메모 닫기' }).click();
    await expect(stay).toBeVisible(); await stay.getByRole('button', { name: '숙소 정보 닫기' }).click();
    const editor = page.locator('textarea[name="note"]');
    await editor.fill('PIN: 0023#\n\n새 메모의 마지막 줄');
    assert.ok((await editor.boundingBox()).height >= 160);
    assert.equal(await editor.inputValue(), 'PIN: 0023#\n\n새 메모의 마지막 줄');
    assert.deepEqual(errors, []);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    results.push({ engine: engine.name(), width, passed: true });
    await browser.close(); browser = null;
  }
  await writeFile(`${out}/web-results.json`, JSON.stringify(results, null, 2)); console.log(JSON.stringify(results));
} finally {
  await browser?.close(); server.kill('SIGTERM');
  await new Promise(resolve => server.exitCode !== null ? resolve() : server.once('exit', resolve));
  await rm(dir, { recursive: true, force: true }); await writeFile('next-env.d.ts', oldEnv); await writeFile('tsconfig.json', oldTypes); await writeFile(`${out}/web-dev.log`, log);
}
