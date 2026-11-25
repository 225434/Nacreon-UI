import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { launchBrowser } from '../tests/helpers/browser.mjs';
import { observeMapGeneration, readMapTiming } from './map-timing.mjs';
import { workspace, files } from './table-workspace.mjs';

const { values: options } = parseArgs({ options: {
  'baseline-dist': { type: 'string' }, rounds: { type: 'string', default: '6' }, 'compare-pixels': { type: 'boolean' },
  theme: { type: 'string', default: 'warm' }, 'measure-maps': { type: 'boolean' },
} });
const rounds = Number(options.rounds);
if (!Number.isSafeInteger(rounds) || rounds < 1) throw new Error('--rounds must be a positive integer');
const theme = options.theme;
if (!['light', 'warm', 'dark'].includes(theme)) throw new Error('--theme must be light, warm or dark');
if (options['compare-pixels'] && !options['baseline-dist']) throw new Error('--compare-pixels requires --baseline-dist');
const sources = ['pointer', 'fixed', 'none'];
const operations = ['idle', 'pointer', 'scroll'];
const steps = 75;
const variants = { current: fileURLToPath(new URL('../dist', import.meta.url)) };
if (options['baseline-dist']) variants.baseline = resolve(options['baseline-dist']);
const sha256 = data => createHash('sha256').update(data).digest('hex');

const waitFrames = (page, count) => page.evaluate(n => new Promise(resolve => {
  function tick() { if (--n === 0) resolve(); else requestAnimationFrame(tick); }
  requestAnimationFrame(tick);
}), count);

async function screenshotDigest(page) {
  const png = (await page.screenshot({ animations: 'disabled' })).toString('base64');
  return page.evaluate(async png => {
    const image = new Image();
    image.src = 'data:image/png;base64,' + png;
    await image.decode();
    const canvas = new OffscreenCanvas(image.naturalWidth, image.naturalHeight);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  }, png);
}

async function settledScreenshot(page, key) {
  const map = page.locator('ml-data-table > .ml-optical filter[id$="-bend"] feImage[href]');
  await map.waitFor({ state: 'attached' });
  await map.evaluate(async el => { const image = new Image(); image.src = el.getAttribute('href'); await image.decode(); });
  await waitFrames(page, 2);
  await page.waitForFunction(() => document.fonts.status === 'loaded'
    && !document.getAnimations().some(animation => animation.pending || animation.playState === 'running')
    && !window[Symbol.for('material-lib.glass.v1')].GlassScene.forDocument(document).frame);
  let previous = await screenshotDigest(page);
  for (let attempt = 0; attempt < 5; attempt++) {
    await waitFrames(page, 3);
    const current = await screenshotDigest(page);
    if (current === previous) return current;
    previous = current;
  }
  throw new Error('screenshot did not settle for ' + key);
}

async function comparePixels(browser, dir) {
  const expected = new Map();
  let matched = 0;
  for (const variant of ['baseline', 'current']) for (const engine of ['webgl', 'svg']) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 850 }, deviceScaleFactor: 1, offline: true, reducedMotion: 'no-preference' });
    try {
      if (engine === 'svg') await page.addInitScript(() => {
        const getContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...args) {
          return type === 'webgl' || type === 'experimental-webgl' ? null : getContext.call(this, type, ...args);
        };
      });
      const url = pathToFileURL(join(dir, variant + '.html')).href;
      for (const backdrop of ['original', 'pattern']) {
        for (const [position, scroll] of [['top', 0], ['middle', 20000], ['bottom', 100000]]) {
          for (const [source, spot, x, y] of [
            ['pointer', 'control', 220, 140], ['pointer', 'table', 700, 340], ['fixed', 'table', 700, 340], ['none', 'table', 700, 340],
          ]) {
            // Loading each pose from rest avoids carrying hovered rows across scroll positions.
            await page.mouse.move(1, 1);
            await page.goto(url);
            if (backdrop === 'pattern') await page.addStyleTag({ content:
              'body{background:repeating-conic-gradient(from 10deg,#fd5 0% 25%,#247 0% 50%) 0/28px 34px}' +
              'ml-data-table.ml-refractive{background:rgba(255,255,255,.06)!important}ml-data-table th{background:transparent!important}' });
            await page.evaluate(({ source, scroll }) => {
              document.documentElement.dataset.mlLightSource = source;
              document.getElementById('rows').scrollTop = scroll;
            }, { source, scroll });
            await page.waitForFunction(engine => document.querySelectorAll('.ml-optical[data-ml-renderer="' + engine + '"]').length === 4, engine);
            await page.mouse.move(x, y);
            const key = [engine, backdrop, position, source, spot].join('/');
            const digest = await settledScreenshot(page, key);
            if (variant === 'baseline') expected.set(key, digest);
            else {
              assert.equal(digest, expected.get(key), 'rendered pixels changed for ' + key);
              matched++;
            }
          }
        }
      }
    } finally {
      await page.close();
    }
  }
  return matched;
}

async function sample(page, cdp, operation) {
  await page.evaluate(() => { document.getElementById('rows').scrollTop = 0; });
  await page.mouse.move(160, 140);
  await waitFrames(page, 8);
  const metrics = async () => Object.fromEntries(
    (await cdp.send('Performance.getMetrics')).metrics.map(({ name, value }) => [name, value]));
  await page.evaluate(() => {
    window.frameTimes = [];
    window.moveCount = 0;
    function tick(t) { window.frameTimes.push(t); window.benchFrame = requestAnimationFrame(tick); }
    window.benchFrame = requestAnimationFrame(tick);
  });
  const before = await metrics();
  if (operation === 'pointer') {
    await page.mouse.move(740, 140, { steps });
    await waitFrames(page, 2);
  } else {
    await page.evaluate(({ operation, steps }) => new Promise(resolve => {
      const rows = document.getElementById('rows');
      let i = 0;
      function tick() {
        if (i === steps) { resolve(); return; }
        i++;
        if (operation === 'scroll') rows.scrollTop = i * 9;
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }), { operation, steps });
  }
  const after = await metrics();
  const { times, moves } = await page.evaluate(() => {
    cancelAnimationFrame(window.benchFrame);
    return { times: window.frameTimes, moves: window.moveCount };
  });
  assert.equal(moves, operation === 'pointer' ? steps : 0);
  const intervals = times.slice(1).map((t, i) => t - times[i]).sort((a, b) => a - b);
  assert(intervals.length > 0);
  const deltaMs = name => (after[name] - before[name]) * 1000;
  const perFrame = name => +(deltaMs(name) / intervals.length).toFixed(3);
  return { frames: intervals.length, moves, taskMs: +deltaMs('TaskDuration').toFixed(3),
    taskMsPerFrame: perFrame('TaskDuration'), styleMsPerFrame: perFrame('RecalcStyleDuration'),
    scriptMsPerFrame: perFrame('ScriptDuration'),
    threadMsPerFrame: 'ThreadTime' in after ? perFrame('ThreadTime') : null,
    frameP95Ms: +intervals[Math.ceil(intervals.length * .95) - 1].toFixed(2) };
}

const temp = await mkdtemp(join(tmpdir(), 'nacreon-light-benchmark-'));
let browser;
try {
  const inputs = {};
  for (const [label, dist] of Object.entries(variants)) {
    const hashes = await Promise.all(files.map(async file => sha256(await readFile(join(dist, file))) + '  ' + file + '\n'));
    inputs[label] = sha256(hashes.join(''));
    await writeFile(join(temp, label + '.html'), workspace(dist, theme));
  }
  browser = await launchBrowser(chromium);
  const page = await browser.newPage({ viewport: { width: 1200, height: 850 }, deviceScaleFactor: 1, offline: true, reducedMotion: 'no-preference' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  if (options['measure-maps']) await page.addInitScript(observeMapGeneration);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const samples = [], normalMapSamples = [];
  let renderer;
  for (let round = 0; round < rounds; round++) {
    for (let s = 0; s < sources.length; s++) {
      const source = sources[(s + round) % sources.length];
      const order = Object.keys(variants);
      if ((round + s) % 2 === 0) order.reverse();
      for (const variant of order) {
        await page.goto(pathToFileURL(join(temp, variant + '.html')).href);
        await page.evaluate(source => {
          document.documentElement.dataset.mlLightSource = source;
          window.moveCount = 0;
          document.addEventListener('pointermove', event => { if (event.isTrusted) window.moveCount++; }, { passive: true });
        }, source);
        await waitFrames(page, 24);
        assert.equal(await page.locator('tbody tr').count(), 1000);
        const layers = await page.locator('.ml-optical').evaluateAll(nodes => nodes.map(n => n.dataset.mlRenderer));
        assert.deepEqual(layers, ['webgl', 'webgl', 'webgl', 'webgl'], 'benchmark requires the high-material WebGL path');
        if (options['measure-maps']) {
          normalMapSamples.push({ round: round + 1, variant, source, ...await readMapTiming(page.locator('ml-data-table')) });
        }
        renderer ??= await page.evaluate(() => {
          const gl = window[Symbol.for('material-lib.glass-shader.v1')].forDocument(document).gl;
          const ext = gl.getExtension('WEBGL_debug_renderer_info');
          return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unreported';
        });
        for (const operation of operations) samples.push({ round: round + 1, variant, source, operation, ...await sample(page, cdp, operation) });
      }
    }
  }
  assert.deepEqual(errors, []);
  const report = { browser: browser.version(), renderer, viewport: [1200, 850], dpr: 1, theme, steps, rounds, inputs, samples };
  if (options['measure-maps']) report.normalMapSamples = normalMapSamples;
  if (options['compare-pixels']) {
    await page.close();
    report.matchingScreenshotPairs = await comparePixels(browser, temp);
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  await rm(temp, { recursive: true, force: true });
}
