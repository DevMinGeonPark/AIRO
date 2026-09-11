import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit, expect } from '@playwright/test';

const base = process.env.LANDING_BASE_URL ?? 'http://127.0.0.1:3018';
const output = process.env.HANDOFF_OUTPUT ?? 'assets/validation/camera-handoff';
await mkdir(output, { recursive: true });
const checks = [], errors = [], resizeChecks = [];

for (const [engine, browserType] of [['chrome', chromium], ['webkit', webkit]]) {
  const browser = await browserType.launch(engine === 'chrome' ? { channel: 'chrome' } : {});
  try {
    for (const [width, height] of [[320, 568], [390, 844], [1440, 900]]) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'no-preference', hasTouch: width < 768 });
      page.on('pageerror', error => { const failure = { engine, width, message: error.message, stack: error.stack }; errors.push(failure); console.log(failure); });
      try {
        await page.goto(base, { waitUntil: 'networkidle' });
        await expect(page.locator('.globe-arrival')).toHaveAttribute('data-ready', 'true', { timeout: 15000 });
        await page.locator('.destination-picker summary').click();
        await page.getByRole('button', { name: '리마 여행 선택', exact: true }).click();
        await page.waitForTimeout(1000);
        await expect(page.locator('.maplibregl-canvas')).toHaveCount(1);
        await page.evaluate(() => {
          const canvas = document.querySelector('.maplibregl-canvas');
          const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
          if (!context) throw new Error('Flight must start on a real WebGL map');
          const state = { canvas, context, frames: [], removed: 0, stop: false, startScroll: scrollY, contextLost: false };
          window.__cameraHandoff = state;
          canvas.addEventListener('webglcontextlost', () => { state.contextLost = true; });
          state.observer = new MutationObserver(records => {
            for (const record of records) for (const node of record.removedNodes) if (node === canvas || (node instanceof Element && node.contains(canvas))) state.removed++;
          });
          state.observer.observe(document.querySelector('.hero-section'), { childList: true, subtree: true });
          const tick = time => {
            const hero = document.querySelector('.hero-section');
            const holder = document.querySelector('[data-camera]');
            const panel = document.querySelector('.conversation-panel');
            const copy = document.querySelector('.hero-copy');
            let camera = null;
            try { camera = JSON.parse(holder?.getAttribute('data-camera') ?? 'null'); } catch { /* Report missing/invalid telemetry below. */ }
            let panelOpacity = panel ? 1 : 0;
            for (let element = panel; element; element = element.parentElement) panelOpacity *= Number(getComputedStyle(element).opacity);
            let mapOpacity = 1, mapVisible = true;
            for (let element = canvas; element; element = element.parentElement) {
              const style = getComputedStyle(element);
              mapOpacity *= Number(style.opacity);
              if (style.display === 'none' || style.visibility === 'hidden') mapVisible = false;
            }
            state.frames.push({ time, mapOpacity, mapVisible, phase: hero?.getAttribute('data-arrival'), camera, scroll: scrollY, canvasSame: document.querySelector('.maplibregl-canvas') === canvas, connected: canvas.isConnected, opacity: panelOpacity, headlineOpacity: copy ? Number(getComputedStyle(copy).opacity) : 0, imageBasemaps: document.querySelectorAll('.hero-section image.map-base-light, .hero-section image.map-base-dark, .hero-section img[src$="-base.svg"], .hero-section img[src$="-dark.svg"]').length });
            if (!state.stop) state.raf = requestAnimationFrame(tick);
          };
          state.raf = requestAnimationFrame(tick);
        });
        await page.getByRole('button', { name: '리마 여행 둘러보기', exact: true }).click();
        await expect(page.locator('.hero-section')).toHaveAttribute('data-arrival', 'flying', { timeout: 5000 });
        await page.screenshot({ path: `${output}/${engine}-${width}-flying.png` });
        await expect(page.locator('.hero-section')).toHaveAttribute('data-arrival', 'landed', { timeout: 12000 });
        await page.screenshot({ path: `${output}/${engine}-${width}-arrival.png` });
        await expect(page.locator('.conversation-panel')).toBeVisible();
        await expect.poll(() => page.locator('.conversation-panel').evaluate(element => { let opacity = 1; for (let node = element; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity); return opacity; })).toBeGreaterThan(.98);
        await page.waitForTimeout(1000);
        const result = await page.evaluate(() => {
          const state = window.__cameraHandoff;
          state.stop = true;
          cancelAnimationFrame(state.raf);
          state.observer.disconnect();
          const canvas = document.querySelector('.maplibregl-canvas');
          return { arrivalCamera: JSON.parse(document.querySelector('[data-arrival-camera]')?.getAttribute('data-arrival-camera') ?? 'null'), frames: state.frames, removed: state.removed, contextLost: state.contextLost || state.context.isContextLost(), canvasSame: canvas === state.canvas, contextSame: canvas?.getContext('webgl2') === state.context || canvas?.getContext('webgl') === state.context, startScroll: state.startScroll, finalScroll: scrollY };
        });
        await writeFile(`${output}/${engine}-${width}-frames.json`, JSON.stringify(result, null, 2));
        assert.equal(result.removed, 0, `${engine}/${width}: original canvas never detached during arrival`);
        assert.ok(result.canvasSame && result.contextSame && !result.contextLost, `${engine}/${width}: original live WebGL canvas/context retained`);
        assert.ok(result.frames.every(frame => frame.canvasSame && frame.connected), `${engine}/${width}: no frame replaces the original canvas`);
        assert.ok(result.frames.every(frame => frame.imageBasemaps === 0), `${engine}/${width}: conversation never swaps to a static SVG/image basemap`);
        assert.ok(result.frames.every(frame => Math.abs(frame.scroll - result.startScroll) < 1), `${engine}/${width}: flight arrival never jumps or resets page scroll`);
        const flight = result.frames.filter(frame => frame.phase === 'flying');
        const landed = result.frames.filter(frame => frame.phase === 'landed');
        assert.ok(flight.length > 10 && landed.length > 10, 'Recorded the actual moving flight and post-arrival fade');
        assert.ok(landed.every(frame => frame.camera), 'Map exposes verifiable camera telemetry throughout arrival');
        assert.ok(result.arrivalCamera, 'Camera recorded at the completed flight before conversation activation');
        const arrivalCamera = result.arrivalCamera;
        const lastFlightCamera = flight.at(-1).camera;
        assert.ok(lastFlightCamera, 'Camera telemetry captures the last flight frame');
        assert.ok(Math.abs(lastFlightCamera.zoom - arrivalCamera.zoom) < .08, `${engine}/${width}: flight endpoint does not snap to another zoom`);
        for (let coordinate = 0; coordinate < 2; coordinate++) assert.ok(Math.abs(lastFlightCamera.center[coordinate] - arrivalCamera.center[coordinate]) < .002, `${engine}/${width}: no geographic jump at the arrival boundary`);
        const flightZooms = flight.flatMap(frame => frame.camera ? [frame.camera.zoom] : []);
        assert.ok(Math.max(...flightZooms) - Math.min(...flightZooms) > 2, 'The existing globe camera actually descends into the city');
        for (const frame of landed) {
          assert.ok(frame.mapVisible && frame.mapOpacity > .98, `${engine}/${width}: original WebGL canvas remains visibly present after arrival`);
          for (const key of ['zoom', 'pitch', 'bearing']) assert.ok(Math.abs(frame.camera[key] - arrivalCamera[key]) < .015, `${engine}/${width}: ${key} does not jump when chat appears`);
          for (let coordinate = 0; coordinate < 2; coordinate++) assert.ok(Math.abs(frame.camera.center[coordinate] - arrivalCamera.center[coordinate]) < .00002, `${engine}/${width}: geographic center does not reset after arrival`);
          assert.ok(frame.headlineOpacity < .02, `${engine}/${width}: initial headline stays hidden after flight`);
        }
        assert.ok(landed.some(frame => frame.opacity > .05 && frame.opacity < .95), `${engine}/${width}: conversation fades onto the same camera instead of popping in`);
        assert.ok(landed.at(-1).opacity > .98, 'Conversation finishes appearing without another scroll');
        await page.screenshot({ path: `${output}/${engine}-${width}-chat.png` });
        checks.push({ engine, width, height, frameCount: result.frames.length, arrivalCamera, originalCanvasRetained: true, originalWebGLContextRetained: true, stableArrivalCamera: true, noBasemapReplacement: true, noScrollJump: true, headlineStaysHidden: true, conversationFadesIn: true });
        console.log(`✓ ${engine} ${width}×${height}: same WebGL canvas and arrival camera through chat fade`);
        if (width === 320) {
          await page.locator('.journey-destination-choice').first().click();
          await expect(page.locator('.conversation-demo')).toHaveAttribute('data-phase', 'ready');
          await page.locator('.conversation-categories button[data-category="cafe"]').click();
          await expect(page.locator('.dining-food-pin')).toHaveCount(3);
          await page.setViewportSize({ width: 844, height: 390 });
          await expect.poll(() => page.locator('.maplibregl-canvas').evaluate(canvas => Math.round(canvas.getBoundingClientRect().width))).toBe(844);
          await expect.poll(() => page.locator('.dining-food-pin').evaluateAll(pins => pins.every(pin => {
            const box = pin.getBoundingClientRect();
            return [box.left, box.top, box.right, box.bottom].every(Number.isFinite) && box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight;
          }))).toBe(true);
          await page.waitForTimeout(200);
          const resized = await page.evaluate(() => {
            const canvas = document.querySelector('.maplibregl-canvas'), original = window.__cameraHandoff;
            return { canvasSame: canvas === original.canvas, contextSame: canvas.getContext('webgl2') === original.context || canvas.getContext('webgl') === original.context, contextLost: original.context.isContextLost(), camera: JSON.parse(document.querySelector('[data-camera]').getAttribute('data-camera')), pins: [...document.querySelectorAll('.dining-food-pin')].map(pin => pin.getBoundingClientRect().toJSON()), map: document.querySelector('.dining-map-window').getBoundingClientRect().toJSON(), path: document.querySelector('.dining-direct-route')?.getAttribute('d') };
          });
          assert.ok(resized.canvasSame && resized.contextSame && !resized.contextLost, 'Orientation change retains the same live map');
          assert.ok([...resized.camera.center, resized.camera.zoom, resized.camera.pitch, resized.camera.bearing].every(Number.isFinite), 'Resized camera remains finite');
          assert.ok(resized.path && !/NaN|Infinity/.test(resized.path), 'Road projection remains finite after orientation change');
          for (const pin of resized.pins) assert.ok(pin.left >= resized.map.left - 1 && pin.top >= resized.map.top - 1 && pin.right <= resized.map.right + 1 && pin.bottom <= resized.map.bottom + 1, 'Cafe pins fit the landscape map window');
          await page.screenshot({ path: `${output}/${engine}-320-to-844-cafe.png` });
          resizeChecks.push({ engine, from: [320,568], to: [844,390], ...resized });
          console.log(`✓ ${engine} 320→844: same map survives orientation change with three cafe pins`);
        }
      } catch (error) {
        await page.screenshot({ path: `${output}/failure-${engine}-${width}.png` }).catch(() => {});
        throw error;
      } finally { await page.close(); }
    }
  } finally { await browser.close(); }
}
await writeFile(`${output}/checks.json`, JSON.stringify({ base, checks, resizeChecks, errors }, null, 2));
assert.deepEqual(errors, []);
console.log('✓ All six real flight-to-conversation handoffs retain the same live map and camera');
