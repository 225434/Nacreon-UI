import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { launchBrowser } from '../tests/helpers/browser.mjs';
import { files as tableFiles, workspace } from './table-workspace.mjs';

const { values } = parseArgs({ options: { 'baseline-dist': { type: 'string' }, rounds: { type: 'string', default: '4' },
  workload: { type: 'string', default: 'icons' }, 'diagnose-refraction': { type: 'boolean' } } });
const workload = values.workload;
if (!['icons', 'table'].includes(workload)) throw new Error('--workload must be icons or table');
const rounds = Number(values.rounds);
if (!Number.isSafeInteger(rounds) || rounds < 1) throw new Error('--rounds must be a positive integer');
const variants = { current: fileURLToPath(new URL('../dist', import.meta.url)) };
if (values['baseline-dist']) variants.baseline = resolve(values['baseline-dist']);
if (values['diagnose-refraction']) {
  if (workload !== 'table' || values['baseline-dist']) throw new Error('--diagnose-refraction compares two copies of the current table');
  variants.withoutTableDisplacement = variants.current;
}
const files = workload === 'table' ? tableFiles : ['components/button/button.css', 'components/button/button.js', 'design/icons.js'];
const inputs = {};
for (const [label, dir] of Object.entries(variants)) {
  const hash = createHash('sha256');
  for (const file of files) hash.update(await readFile(join(dir, file)));
  inputs[label] = hash.digest('hex');
}
const viewport = { width: 1200, height: 850 }, durationMs = 2000, offscreenIcons = workload === 'table' ? 0 : 96;
const temp = await mkdtemp(join(tmpdir(), 'nacreon-motion-rate-'));
const browser = await launchBrowser(chromium);
try {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1, offline: true, reducedMotion: 'no-preference' });
  const errors = [], samples = [];
  page.on('pageerror', error => errors.push(error.message));
  for (let round = 1; round <= rounds; round++) {
    const grades = round % 2 ? ['high', 'medium'] : ['medium', 'high'];
    for (const [i, grade] of grades.entries()) {
      const order = Object.keys(variants);
      if ((round + i) % 2) order.reverse();
      for (const variant of order) {
        const dir = variants[variant];
        const fixture = join(temp, variant + '-' + grade + '.html');
        const assets = files.map(file => {
          const url = pathToFileURL(join(dir, file)).href;
          return file.endsWith('.js') ? '<script defer src="' + url + '"></script>' : '<link rel="stylesheet" href="' + url + '">';
        }).join('');
        const html = workload === 'table' ? workspace(dir, 'dark', grade) :
          '<!doctype html><html data-ml-theme="dark" data-ml-material="high" data-ml-motion="' + grade + '">' + assets +
          '<style>body{margin:24px}#lens{width:240px}main ml-icon{display:inline-flex;margin:8px}</style>' +
          '<ml-button id="lens"><button>导出记录</button></ml-button><main data-ml-material="medium">' +
          '<ml-icon name="settings" size="32"></ml-icon>'.repeat(3) + '<div style="height:1250px"></div><section>' +
          '<ml-icon name="search" size="24"></ml-icon>'.repeat(offscreenIcons) + '</section></main></html>';
        if (round === 1) await writeFile(fixture, html);
        await page.goto(pathToFileURL(fixture).href);
        const surface = workload === 'table' ? 'ml-data-table' : '#lens';
        await page.locator(surface + ' .ml-optical[data-ml-renderer="webgl"]').waitFor({ state: 'attached' });
        if (variant === 'withoutTableDisplacement') {
          await page.locator(surface).evaluate(table => {
            const filter = getComputedStyle(table).backdropFilter;
            if (!filter.includes('url(')) throw new Error('table displacement missing');
            table.style.setProperty('backdrop-filter', filter.replace(/url\([^)]*\)\s*/, '').trim() || 'none', 'important');
          });
        }
        await page.mouse.move(75, 38);
        await page.waitForTimeout(300);
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Performance.enable');
        const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
        const idleInterval = await page.evaluate(() => new Promise(resolve => {
          const times = [];
          function tick(t) {
            times.push(t);
            if (times.length === 41) resolve(times.slice(1).map((v, i) => v - times[i]).sort((a, b) => a - b)[20]);
            else requestAnimationFrame(tick);
          }
          requestAnimationFrame(tick);
        }));
        const before = await metrics();
        const sample = await page.evaluate(({ duration, surface, idleInterval, workload }) => new Promise(resolve => {
          const renderer = window[Symbol.for('material-lib.glass-shader.v1')].forDocument(document);
          const draw = renderer.draw, lens = document.querySelector(surface);
          let draws = 0, outsideReads = 0;
          renderer.draw = function (...args) {
            if (lens.contains(args[0])) draws++;
            return draw.apply(this, args);
          };
          const icons = [...document.querySelectorAll('section ml-icon > svg')];
          for (const svg of icons) {
            const read = svg.getBoundingClientRect;
            svg.getBoundingClientRect = function () { outsideReads++; return read.call(this); };
          }
          const times = [];
          function frame(t) {
            if (times.length && t - times[0] >= duration) {
              renderer.draw = draw;
              for (const svg of icons) delete svg.getBoundingClientRect;
              const intervals = times.slice(1).map((value, i) => value - times[i]).concat(t - times.at(-1)).sort((a, b) => a - b);
              const elapsedMs = t - times[0];
              const missedSlots = intervals.reduce((sum, dt) => sum + Math.max(0, Math.round(dt / idleInterval) - 1), 0);
              resolve({ callbacks: times.length, elapsedMs, idleInterval, missedSlots, draws, callbackHz: times.length * 1000 / elapsedMs,
                glassUpdatesPerSecond: draws * 1000 / elapsedMs, frameP95Ms: intervals[Math.ceil(intervals.length * .95) - 1],
                frameP99Ms: intervals[Math.ceil(intervals.length * .99) - 1],
                outsideIcons: icons.length, outsideBoundsReads: outsideReads });
              return;
            }
            times.push(t);
            lens.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, isPrimary: true, pointerType: 'mouse',
              clientX: workload === 'table' ? 160 + (times.length * 3) % 580 : 40 + times.length % 170,
              clientY: workload === 'table' ? 140 : 38 }));
            requestAnimationFrame(frame);
          }
          requestAnimationFrame(frame);
        }), { duration: durationMs, surface, idleInterval, workload });
        const after = await metrics();
        await cdp.detach();
        assert.equal(sample.outsideIcons, offscreenIcons);
        assert(sample.draws > 0 && sample.callbacks > 0);
        samples.push({ round, variant, grade, ...sample, threadMsPerFrame: (after.ThreadTime - before.ThreadTime) * 1000 / sample.callbacks });
      }
    }
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ browser: browser.version(), workload, viewport, dpr: 1, durationMs, offscreenIcons, rounds,
    input: 'one synthetic pointermove per real requestAnimationFrame', inputs, samples }, null, 2));
} finally {
  await browser.close();
  await rm(temp, { recursive: true, force: true });
}
