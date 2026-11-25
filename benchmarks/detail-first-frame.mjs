import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { launchBrowser } from '../tests/helpers/browser.mjs';

const { values } = parseArgs({ options: {
  'baseline-dist': { type: 'string' }, rounds: { type: 'string', default: '6' },
} });
const rounds = Number(values.rounds);
assert(Number.isSafeInteger(rounds) && rounds > 0);
const variants = { current: fileURLToPath(new URL('../dist', import.meta.url)) };
if (values['baseline-dist']) variants.baseline = resolve(values['baseline-dist']);
const photo = new URL('../preview/assets/media/alpine-lake.jpg', import.meta.url).href;
const files = ['design/global.css', ...['data-table', 'media-viewer'].flatMap(name =>
  ['css', 'js'].map(ext => 'components/' + name + '/' + name + '.' + ext))];

function details(dist, both) {
  const assets = files.map(file => {
    const url = pathToFileURL(join(dist, file)).href;
    return file.endsWith('.css') ? '<link rel="stylesheet" href="' + url + '">' : '<script defer src="' + url + '"></script>';
  }).join('');
  const rows = Array.from({ length: 1000 }, (_, i) => '<tr><td>' + (i + 1) + '</td><td>山间湖泊</td></tr>').join('');
  const table = '<div class="rows"><ml-data-table><table><thead><tr><th>编号</th><th>素材</th></tr></thead><tbody>' + rows + '</tbody></table></ml-data-table></div>';
  const media = '<ml-media-viewer><ul><li><a data-media="image" href="' + photo + '">山间湖泊</a></li></ul></ml-media-viewer>';
  return '<!doctype html><html lang="zh-CN" data-ml-theme="dark" data-ml-material="high" data-ml-motion="high" data-ml-light-source="fixed">' +
    '<meta charset="utf-8">' + assets + '<style>body{margin:24px}main[hidden]{display:none}main .panes{display:flex;gap:16px}' +
    '.rows{width:570px;height:360px;overflow:auto}ml-media-viewer{width:520px}.ml-media-stage{height:294px}#ready{position:absolute;left:440px;top:50px}</style>' +
    '<button id="open">查看记录</button><main id="detail" hidden><h1 elementtiming="detail-title">素材详情</h1><div class="panes">' +
    (both ? table : '') + media + '</div></main></html>';
}

async function installInstrumentation(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await document.querySelector('ml-media-surface img').decode();
    if (!PerformanceObserver.supportedEntryTypes.includes('element')) throw Error('Element Timing unavailable');
    const seen = window.detailTiming = { times: {}, callbacks: [] };
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (entry.identifier.startsWith('detail-')) seen.times[entry.identifier] = entry.renderTime || entry.startTime;
      }
    });
    observer.observe({ type: 'element', buffered: true });
    document.querySelector('#open').addEventListener('click', () => {
      seen.click = performance.now();
      const detail = document.querySelector('#detail');
      detail.hidden = false;
      let decoding = false;
      function probe() {
        seen.callbacks.push(performance.now());
        const surfaces = [...detail.querySelectorAll('ml-data-table,ml-media-surface')];
        const maps = surfaces.map(el => el.querySelector(':scope > .ml-optical[data-ml-renderer="webgl"] filter[id$="-bend"] feImage[href]'));
        if (!decoding && maps.every(Boolean)) {
          decoding = true;
          Promise.all(maps.map(async map => {
            const image = new Image(); image.src = map.getAttribute('href'); await image.decode();
            return [image.width, image.height];
          })).then(dimensions => {
            seen.dimensions = dimensions;
            const ready = document.createElement('span');
            ready.id = 'ready'; ready.setAttribute('elementtiming', 'detail-ready');
            ready.textContent = '素材已就绪'; detail.append(ready);
          });
        }
        if (performance.now() - seen.click < 260 || !seen.times['detail-ready']) requestAnimationFrame(probe);
      }
      seen.callbacks.push(seen.click);
      requestAnimationFrame(probe);
    }, { once: true });
  });
}

const dir = await mkdtemp(join(tmpdir(), 'nacreon-detail-frame-'));
const browser = await launchBrowser(chromium);
try {
  const sources = {}, errors = [], samples = [];
  for (const [label, dist] of Object.entries(variants)) {
    const hash = createHash('sha256');
    for (const file of files) hash.update(await readFile(join(dist, file)));
    sources[label] = hash.digest('hex');
    for (const both of [true, false]) await writeFile(join(dir, label + both + '.html'), details(dist, both));
  }
  for (let round = 0; round <= rounds; round++) {
    for (const both of round % 2 ? [true, false] : [false, true]) {
      const order = Object.keys(variants);
      if ((round + Number(both)) % 2) order.reverse();
      for (const variant of order) {
        const page = await browser.newPage({ viewport: { width: 1200, height: 850 }, deviceScaleFactor: 1.25, offline: true, reducedMotion: 'no-preference' });
        page.on('pageerror', e => errors.push(e.message));
        try {
          await page.goto(pathToFileURL(join(dir, variant + both + '.html')).href);
          await installInstrumentation(page);
          await page.locator('#open').click();
          await page.waitForFunction(() => detailTiming.times['detail-title'] && detailTiming.times['detail-ready'] &&
            performance.now() > detailTiming.click + 300, undefined, { timeout: 8000 });
          const sample = await page.evaluate(() => {
            const { times, click, callbacks, dimensions } = detailTiming;
            return { titlePresentedMs: times['detail-title'] - click, readyPresentedMs: times['detail-ready'] - click,
              maximumCallbackGapMs: Math.max(...callbacks.slice(1).map((t, i) => t - callbacks[i])), dimensions };
          });
          assert.equal(sample.dimensions.length, both ? 2 : 1);
          assert(sample.titlePresentedMs >= 0 && sample.readyPresentedMs >= 0);
          if (round) samples.push({ round, variant, scenario: both ? 'table and photo' : 'photo', ...sample });
        } finally { await page.close(); }
      }
    }
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ browser: browser.version(), dpr: 1.25, viewport: [1200, 850], rounds, sources,
    method: 'Trusted click reveals a preloaded details page. Element Timing reports presentation of its title and of a marker inserted when all native glass maps have decoded. Fresh context and map cache for each trial; round zero excluded.', samples }, null, 2));
} finally {
  await browser.close();
  await rm(dir, { recursive: true, force: true });
}
