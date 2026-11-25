import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './helpers/browser.mjs';

const dist = fileURLToPath(new URL('../dist', import.meta.url));
const temp = await mkdtemp(join(tmpdir(), 'nacreon-map-workers-'));
const file = join(temp, 'maps.html');
const browser = await launchBrowser(chromium);
const mapSelector = 'filter[id$="-bend"] feImage';
const url = name => pathToFileURL(join(dist, name)).href;
const errors = [];

async function open(mode, cores = 4) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 750 }, offline: true });
  if (mode === 'controlled' && cores === 4) await page.clock.install();
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(({ mode, cores }) => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => cores });
    const state = window.jobs = { created: 0, stopped: 0, posted: [], replies: [], send: [] };
    if (mode === 'sync') { window.Worker = undefined; return; }
    window.Worker = class extends Worker {
      constructor(...args) {
        state.created++;
        if (mode === 'blocked') throw new DOMException('Worker disabled in fixture', 'SecurityError');
        super(...args);
        this.addEventListener('message', () => state.replies.push(this.key));
      }
      postMessage(data, ...args) {
        if (data.type !== 'nacreon-normal-map') return super.postMessage(data, ...args);
        const index = state.posted.push(data.shape.key) - 1;
        this.key = data.shape.key;
        if (mode === 'error') {
          setTimeout(() => this.dispatchEvent(new ErrorEvent('error', { cancelable: true })), 0);
        } else {
          state.send[index] = () => super.postMessage(data, ...args);
        }
      }
      terminate() { state.stopped++; super.terminate(); }
    };
  }, { mode, cores });
  await page.goto(pathToFileURL(file).href);
  return page;
}

async function mount(page, shapes) {
  await page.evaluate(shapes => {
    for (const [id, width] of shapes) {
      const el = document.createElement('ml-media-surface');
      el.id = id; el.style.width = width + 'px';
      el.innerHTML = '<div class="ml-media-stage"></div>';
      document.body.append(el);
    }
  }, shapes);
  await page.waitForFunction(shapes => shapes.every(([id]) =>
    document.getElementById(id).querySelector('[data-ml-renderer="webgl"]')), shapes);
}

async function pixels(page, ids) {
  return Promise.all(ids.map(async id => {
    const map = page.locator('#' + id + ' ' + mapSelector + '[href]');
    await map.waitFor({ state: 'attached' });
    return map.evaluate(async el => {
      const image = new Image(); image.src = el.getAttribute('href'); await image.decode();
      const { naturalWidth: w, naturalHeight: h } = image;
      const context = new OffscreenCanvas(w, h).getContext('2d');
      context.drawImage(image, 0, 0);
      const hash = await crypto.subtle.digest('SHA-256', context.getImageData(0, 0, w, h).data);
      return [w, h, [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('')];
    });
  }));
}

try {
  await writeFile(file, '<!doctype html><html data-ml-material="high" data-ml-theme="dark" data-ml-motion="high" data-ml-light-source="fixed">' +
    '<meta charset="utf-8"><link rel="stylesheet" href="' + url('design/global.css') + '">' +
    '<link rel="stylesheet" href="' + url('components/media-viewer/media-viewer.css') + '">' +
    '<script defer src="' + url('components/media-viewer/media-viewer.js') + '"></script>' +
    '<style>ml-media-surface{position:fixed;top:12px;left:12px;height:420px;border-radius:12px 24px 13px 31px}</style><body></body></html>');
  const originals = [['first', 520], ['second', 520], ['third', 620], ['queued', 710]];
  const finals = [['first', 800], ['second', 520], ['third', 620]], ids = finals.map(pair => pair[0]);
  const ref = await open('sync');
  await mount(ref, finals);
  const expected = await pixels(ref, ids);
  assert.equal(new Set(expected.map(result => result[2])).size, 3);
  await ref.close();

  const page = await open('controlled');
  await mount(page, originals);
  assert.deepEqual(await page.evaluate(() => [jobs.created, jobs.posted.length]), [2, 2]);
  const detached = await page.locator('#queued').elementHandle();
  await page.evaluate(() => {
    document.getElementById('queued').remove();
    document.getElementById('first').style.width = '800px';
  });
  // Allow the real ResizeObserver and shared scene to subscribe to the new size.
  await page.evaluate(() => new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(ok)))));
  await page.evaluate(() => jobs.send[0]());
  await page.waitForFunction(() => jobs.posted.length === 3);
  assert.deepEqual(await pixels(page, ['second']), [expected[1]]);
  assert.equal(await page.locator('#first ' + mapSelector).getAttribute('href'), null);
  assert.equal(await page.locator('#first filter[id$="-bend"] feDisplacementMap').getAttribute('scale'), '0');
  assert.equal(await detached.evaluate(el => el.querySelector('.ml-optical')), null);
  await page.evaluate(() => { jobs.send[1](); jobs.send[2](); });
  assert.deepEqual(await pixels(page, ids), expected);
  assert.deepEqual(await page.evaluate(() => [jobs.created, jobs.posted.length, jobs.replies.length]), [2, 3, 3]);
  await mount(page, [['cached', 520]]);
  assert.deepEqual(await pixels(page, ['cached']), [expected[1]]);
  assert.equal(await page.evaluate(() => jobs.posted.length), 3);
  await page.locator('#cached').evaluate(el => { el.style.width = '710px'; });
  await page.waitForFunction(() => jobs.posted.length === 4);
  assert.equal(await page.locator('#cached ' + mapSelector).getAttribute('href'), null);
  assert.equal(await page.locator('#cached filter[id$="-bend"] feDisplacementMap').getAttribute('scale'), '0');
  await page.locator('#cached').evaluate(el => el.remove());
  await page.evaluate(() => jobs.send[3]());
  await page.waitForFunction(() => jobs.replies.length === 4);
  await page.waitForFunction(() => !window[Symbol.for('material-lib.glass.v1')].GlassScene.forDocument(document).frame);
  await page.clock.fastForward(31000);
  assert.deepEqual(await page.evaluate(() => [jobs.created, jobs.stopped]), [2, 2]);
  await mount(page, [['reopened', 900]]);
  assert.deepEqual(await page.evaluate(() => [jobs.created, jobs.posted.length]), [3, 5]);
  await page.evaluate(() => jobs.send[4]());
  await pixels(page, ['reopened']);
  await page.close();

  const lowCore = await open('controlled', 2);
  await mount(lowCore, finals.slice(0, 2));
  assert.deepEqual(await lowCore.evaluate(() => [jobs.created, jobs.posted.length]), [1, 1]);
  await lowCore.evaluate(() => jobs.send[0]());
  await lowCore.waitForFunction(() => jobs.posted.length === 2);
  await lowCore.evaluate(() => jobs.send[1]());
  assert.deepEqual(await pixels(lowCore, ids.slice(0, 2)), expected.slice(0, 2));
  assert.equal(await lowCore.evaluate(() => jobs.created), 1);
  await lowCore.close();

  for (const mode of ['blocked', 'error']) {
    const fallback = await open(mode);
    await mount(fallback, finals);
    assert.deepEqual(await pixels(fallback, ids), expected);
    assert(await fallback.evaluate(() => jobs.created >= 1 && jobs.created <= 2));
    if (mode === 'error') assert(await fallback.evaluate(() => jobs.created === jobs.stopped));
    await fallback.close();
  }
  assert.deepEqual(errors, []);
  console.log('Verified shared and cached requests, worker limits, resize and detach, synchronous fallback, and decoded RGBA equality.');
} finally {
  await browser.close();
  await rm(temp, { recursive: true, force: true });
}
