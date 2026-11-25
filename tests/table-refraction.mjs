import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './helpers/browser.mjs';
import { workspace } from '../benchmarks/table-workspace.mjs';

const dist = fileURLToPath(new URL('../dist', import.meta.url));
const temp = await mkdtemp(join(tmpdir(), 'nacreon-refraction-test-'));
const file = join(temp, 'table.html');
const browser = await launchBrowser(chromium);
const nextFrames = page => page.evaluate(() => new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok))));
const usingWindow = el => getComputedStyle(el).backdropFilter.includes('-viewport');

async function settledPixels(page, pose) {
  const read = async () => createHash('sha256').update(await page.screenshot({ animations: 'disabled' })).digest('hex');
  await nextFrames(page);
  await page.waitForFunction(() => document.fonts.status === 'loaded'
    && !document.getAnimations().some(animation => animation.pending || animation.playState === 'running')
    && !window[Symbol.for('material-lib.glass.v1')].GlassScene.forDocument(document).frame);
  let previous = await read();
  for (let i = 0; i < 5; i++) {
    await nextFrames(page);
    const current = await read();
    if (previous === current) return current;
    previous = current;
  }
  throw new Error('table pixels did not settle at ' + pose);
}

async function compareWithFull(page, pose) {
  // The same full filter can settle on different Chrome raster tiles. Keep the
  // reference captures from this pose and require an exact whole-page match.
  const shots = [new Set(), new Set()];
  const rules = [':root{}', 'ml-data-table.ml-refractive{--ml-table-window:initial!important}'];
  for (let pass = 0; pass < 4; pass++) {
    for (const mode of pass % 2 ? [1, 0] : [0, 1]) {
      const rule = await page.addStyleTag({ content: rules[mode] });
      try {
        const hash = await settledPixels(page, pose);
        if (shots[1 - mode].has(hash)) return;
        shots[mode].add(hash);
      } finally {
        await rule.evaluate(el => el.remove());
      }
    }
  }
  assert.fail('refracted pixels at ' + pose + ' ' + JSON.stringify(shots.map(set => [...set])));
}

async function liveBackdrop(page, rows, table) {
  const top = await rows.evaluate(el => el.scrollTop);
  await page.evaluate(() => {
    const background = document.createElement('canvas');
    background.id = 'live-backdrop'; background.width = 2; background.height = 2;
    background.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none';
    document.body.prepend(background);
    document.querySelector('main').style.position = 'relative';
    document.documentElement.dataset.mlLightSource = 'pointer';
    const el = document.querySelector('#rows'), b = el.getBoundingClientRect();
    let phase = 0;
    function move() {
      el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse', isPrimary: true,
        clientX: b.left + 100 + 40 * Math.sin(++phase / 3), clientY: b.top + 35 }));
      window.livePointer = requestAnimationFrame(move);
    }
    move();
  });
  async function paintAndSample(color) {
    await page.locator('#live-backdrop').evaluate((el, color) => {
      const ctx = el.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, 2, 2);
    }, color);
    await nextFrames(page);
    const b = await rows.boundingBox();
    const shot = await page.screenshot({ clip: { x: Math.round(b.x + b.width * .67), y: Math.round(b.y + b.height * .52),
      width: 12, height: 12 }, animations: 'disabled' });
    return page.evaluate(async encoded => {
      const bitmap = await createImageBitmap(await (await fetch('data:image/png;base64,' + encoded)).blob());
      const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d'); ctx.drawImage(bitmap, 0, 0);
      const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data; bitmap.close();
      let delta = 0;
      for (let i = 0; i < data.length; i += 4) delta += data[i] - data[i + 2];
      return delta / (data.length / 4);
    }, shot.toString('base64'));
  }
  await page.waitForFunction(() => getComputedStyle(document.querySelector('ml-data-table')).backdropFilter.includes('-viewport'));
  assert(Number(await table.locator('filter[id$="-viewport"] feImage').getAttribute('y')) > 0);
  const red = await paintAndSample('#ee1528'), blue = await paintAndSample('#1528ee');
  assert(red > blue + 40, JSON.stringify({ red, blue }));
  assert(await table.evaluate(usingWindow));
  for (const [grade, reduced, light] of [['medium', false, 'pointer'], ['low', false, 'pointer'],
    ['high', true, 'pointer'], ['high', false, 'fixed'], ['high', false, 'none'], ['high', false, 'pointer']]) {
    await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    await table.evaluate((el, [grade, light]) => {
      el.dataset.mlMotion = grade; document.documentElement.dataset.mlLightSource = light;
    }, [grade, light]);
    await page.waitForTimeout(150);
    assert.equal(await table.evaluate(usingWindow), !reduced && grade !== 'low' && light === 'pointer', [grade, reduced, light].join(' '));
  }
  await page.evaluate(() => cancelAnimationFrame(window.livePointer));
  await page.waitForFunction(() => !getComputedStyle(document.querySelector('ml-data-table')).backdropFilter.includes('-viewport'));
  const stillBlue = await paintAndSample('#1528ee'), stillRed = await paintAndSample('#ee1528');
  assert(stillRed > stillBlue + 40, JSON.stringify({ stillRed, stillBlue }));
  assert.equal(await rows.evaluate(el => el.scrollTop), top);
  await compareWithFull(page, 'stationary pointer, live canvas');
  await page.evaluate(() => {
    document.querySelector('#live-backdrop').remove();
    document.querySelector('main').style.removeProperty('position');
    delete document.querySelector('ml-data-table').dataset.mlMotion;
    document.documentElement.dataset.mlLightSource = 'fixed';
  });
}

try {
  await writeFile(file, workspace(dist, 'dark', 'high'));
  let matches = 0, fullFilters = 0;
  for (const dpr of [1, 1.25, 1.5, 2]) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 850 }, deviceScaleFactor: dpr, reducedMotion: 'no-preference' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(file).href);
    const table = page.locator('ml-data-table'), rows = page.locator('#rows');
    await page.addStyleTag({ content: 'main{max-width:867.5px}#rows{height:271.5px}' +
      'body{background:repeating-conic-gradient(from 10deg,#fd5 0% 25%,#247 0% 50%) 0/28px 34px}' +
      'ml-data-table.ml-refractive{background:rgba(255,255,255,.06)!important}ml-data-table th{background:transparent!important}' });
    await page.mouse.move(4, 4);
    await page.evaluate(() => { document.documentElement.dataset.mlLightSource = 'fixed'; });
    await page.waitForFunction(() => getComputedStyle(document.querySelector('ml-data-table')).backdropFilter.includes('-viewport'));
    const initial = await table.evaluate(async el => {
      async function dimensions(selector) {
        const im = new Image(); im.src = el.querySelector(selector).getAttribute('href'); await im.decode();
        return [im.naturalWidth, im.naturalHeight];
      }
      return [await dimensions('filter[id$="-bend"] feImage'), await dimensions('filter[id$="-viewport"] feImage')];
    });
    assert.equal(initial[0][0], initial[1][0]);
    assert(initial[1][1] <= initial[0][1] / 2, JSON.stringify(initial));
    const quarter = await table.evaluate(el => el.getBoundingClientRect().height / 4);
    const port = await rows.evaluate(el => el.getBoundingClientRect().height);
    const switchAt = Math.floor(quarter - 2 * port);
    for (const y of [0, 1, 5107, 9151, 13633, switchAt - 2, switchAt + 2, 20000, 100000, 2711]) {
      await rows.evaluate((el, y) => { el.scrollTop = y; }, y);
      await page.waitForTimeout(120);
      const windowed = await table.evaluate(usingWindow);
      assert.equal(windowed, dpr === 1 || y < switchAt, 'filter at DPR ' + dpr + ', scroll ' + y);
      if (!windowed) {
        assert(await table.evaluate(el => getComputedStyle(el).backdropFilter.includes(el.querySelector('filter[id$="-bend"]').id)),
          'the original filter must be active when the visible area and guard extend past the last prefix');
        fullFilters++;
        continue;
      }
      if (dpr !== 1) {
        const [origin, fullHeight, height] = await table.evaluate(el => {
          const map = el.querySelector('filter[id$="-viewport"] feImage');
          return [Number(map.getAttribute('y')), el.getBoundingClientRect().height, Number(map.getAttribute('height'))];
        });
        assert.equal(origin, 0);
        assert([4, 8].includes(fullHeight / height), 'a scaled prefix must preserve the original texture scale');
      }
      const pose = 'DPR ' + dpr + ', scroll ' + y;
      await compareWithFull(page, pose);
      matches++;
    }
    if (dpr !== 1) {
      await rows.evaluate(el => { el.scrollTop = 20000; });
      await page.waitForTimeout(150);
      for (const grade of ['high', 'medium', 'low']) {
        await table.evaluate((el, value) => { el.dataset.mlMotion = value; }, grade);
        await rows.evaluate(el => el.dispatchEvent(new Event('scroll')));
        await nextFrames(page);
        if (grade !== 'low') await page.waitForFunction(() => getComputedStyle(document.querySelector('ml-data-table')).backdropFilter.includes('-viewport'));
        assert.equal(await table.evaluate(usingWindow), grade !== 'low', 'active scroller at ' + grade);
        if (grade !== 'low') {
          assert(await table.evaluate(el => Number(el.querySelector('filter[id$="-viewport"] feImage').getAttribute('y')) > 0),
            'a moving deep scrollport uses a strip at the visible rows');
        }
        await rows.evaluate(el => el.dispatchEvent(new Event('scrollend')));
        await nextFrames(page);
        assert.equal(await table.evaluate(usingWindow), false, 'restored native grid after scrollend');
      }
      await table.evaluate(el => { delete el.dataset.mlMotion; });
      if (dpr === 1.25) {
        await page.locator('header').evaluate(el => el.dispatchEvent(new Event('scroll')));
        await nextFrames(page);
        assert.equal(await table.evaluate(usingWindow), false, 'a sibling scroller must not move the table filter');
        await rows.evaluate(el => {
          document.dispatchEvent(new Event('scroll'));
          el.dispatchEvent(new Event('scroll'));
          el.dispatchEvent(new Event('scrollend'));
        });
        await page.waitForFunction(() => getComputedStyle(document.querySelector('ml-data-table')).backdropFilter.includes('-viewport'));
        await page.evaluate(() => document.dispatchEvent(new Event('scrollend')));
        await nextFrames(page);
        assert.equal(await table.evaluate(usingWindow), false, 'all owning scrollers have stopped');
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await rows.evaluate(el => el.dispatchEvent(new Event('scroll')));
        await nextFrames(page);
        assert.equal(await table.evaluate(usingWindow), false, 'reduced motion retains the native grid');
        await rows.evaluate(el => el.dispatchEvent(new Event('scrollend')));
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        const initialTop = await rows.evaluate(el => {
          const table = el.querySelector('ml-data-table');
          const gesture = window.tableGesture = { windowed: false, ended: false };
          el.onscroll = () => { if (table.style.getPropertyValue('--ml-table-window')) gesture.windowed = true; };
          el.onscrollend = () => { gesture.ended = true; };
          return el.scrollTop;
        });
        const bounds = await rows.boundingBox(), cdp = await page.context().newCDPSession(page);
        await cdp.send('Input.synthesizeScrollGesture', {
          x: Math.round(bounds.x + bounds.width / 2), y: Math.round(bounds.y + bounds.height / 2),
          yDistance: -950, speed: 2000, gestureSourceType: 'mouse', preventFling: true,
        });
        await cdp.detach();
        await page.waitForFunction(() => window.tableGesture.ended && window.tableGesture.windowed
          && !document.querySelector('ml-data-table').style.getPropertyValue('--ml-table-window'), undefined, { timeout: 5000 });
        assert(await rows.evaluate(el => {
          el.onscroll = el.onscrollend = null;
          delete window.tableGesture;
          return el.scrollTop;
        }) >= initialTop + 900, 'native gesture scrolled the table and restored its full filter');
        await liveBackdrop(page, rows, table);
      }
    }
    await rows.evaluate(el => { el.scrollTop = 0; el.style.transform = 'rotate(.3deg)'; });
    await nextFrames(page);
    assert.equal(await table.evaluate(usingWindow), false, 'transformed scrollport');
    await rows.evaluate(el => { el.style.transform = ''; });
    await page.waitForFunction(() => getComputedStyle(document.querySelector('ml-data-table')).backdropFilter.includes('-viewport'));
    await page.emulateMedia({ media: 'print' });
    assert.equal(await table.evaluate(usingWindow), false, 'print uses the complete surface');
    await page.emulateMedia({ media: 'screen' });
    await table.evaluate(el => { el.dataset.mlMaterial = 'base'; });
    await nextFrames(page);
    assert.equal(await table.locator('filter[id$="-viewport"]').count(), 0);
    await table.evaluate(el => {
      delete el.dataset.mlMaterial;
      const body = el.table.tBodies[0];
      body.replaceChildren(...[...body.rows].slice(0, 3));
    });
    await nextFrames(page);
    assert.equal(await table.evaluate(usingWindow), false, 'short table');
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Verified ' + matches + ' complete-viewport pixel pairs at four DPRs, ' + fullFilters + ' full-filter fallbacks, and live canvas changes under moving and stationary light.');
} finally {
  await browser.close();
  await rm(temp, { recursive: true, force: true });
}
