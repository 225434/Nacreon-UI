import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { launchBrowser } from '../tests/helpers/browser.mjs';
import { files, workspace } from './table-workspace.mjs';

const { values } = parseArgs({ options: { 'baseline-dist': { type: 'string' },
  rounds: { type: 'string', default: '4' }, dpr: { type: 'string', default: '1' },
  position: { type: 'string', default: 'top' } } });
const rounds = Number(values.rounds), dpr = Number(values.dpr);
assert(Number.isSafeInteger(rounds) && rounds > 0 && Number.isFinite(dpr) && dpr > 0);
const startFraction = { top: 0, quarter: .25, middle: .5, bottom: 1 };
assert(Object.hasOwn(startFraction, values.position));
const variants = { current: fileURLToPath(new URL('../dist/', import.meta.url)) };
if (values['baseline-dist']) variants.baseline = resolve(values['baseline-dist']);
const viewport = { width: 1200, height: 850 }, duration = 2000;
const sources = {}, samples = [], temp = await mkdtemp(join(tmpdir(), 'nacreon-presentation-'));
const browser = await launchBrowser(chromium);

async function trace(page, cdp, operation) {
  const events = [];
  const collect = ({ value }) => {
    for (const event of value) if (['Display::FrameDisplayed', 'table-motion-start', 'table-motion-end'].includes(event.name)) events.push(event);
  };
  cdp.on('Tracing.dataCollected', collect);
  const scroll = page.locator('#rows');
  const initial = await scroll.evaluate((el, fraction) => {
    const maximum = el.scrollHeight - el.clientHeight;
    el.scrollTop = Math.floor(maximum * fraction);
    return el.scrollTop;
  }, startFraction[values.position]);
  const box = await scroll.boundingBox();
  const x = Math.round(box.x + box.width / 2), y = Math.round(box.y + box.height / 2);
  await page.mouse.move(x, y);
  await page.waitForTimeout(300);
  await cdp.send('Tracing.start', { categories: 'benchmark,blink.user_timing,disabled-by-default-display.framedisplayed',
    transferMode: 'ReportEvents' });
  let inputs;
  try {
    if (operation === 'pointer') {
      inputs = await page.evaluate(({ x, y, duration }) => new Promise(done => {
        const target = document.elementFromPoint(x, y);
        let first, count = 0;
        function frame(t) {
          if (first === undefined) { first = t; performance.mark('table-motion-start'); }
          if (t - first >= duration) { performance.mark('table-motion-end'); done(count); return; }
          target.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, isPrimary: true, pointerType: 'mouse',
            clientX: x + 160 * Math.sin((t - first) / 170), clientY: y + 35 * Math.sin((t - first) / 210) }));
          count++;
          requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      }), { x, y, duration });
    } else {
      await scroll.evaluate(el => {
        window.tableScrollInputs = 0;
        window.tableWindowedEvents = 0;
        const table = el.querySelector('ml-data-table');
        el.onscroll = () => {
          if (!window.tableScrollInputs++) performance.mark('table-motion-start');
          if (table.style.getPropertyValue('--ml-table-window')) window.tableWindowedEvents++;
          performance.mark('table-motion-end');
        };
      });
      await cdp.send('Input.synthesizeScrollGesture', { x, y, yDistance: values.position === 'bottom' ? 4800 : -4800,
        speed: 2400, gestureSourceType: 'mouse', preventFling: true });
      await page.waitForTimeout(120);
      inputs = await scroll.evaluate((el, initial) => {
        el.onscroll = null;
        return { events: window.tableScrollInputs, windowedEvents: window.tableWindowedEvents, distance: el.scrollTop - initial };
      }, initial);
      assert(Math.abs(inputs.distance) >= 4700 && inputs.events > 15, JSON.stringify(inputs));
    }
    await page.waitForTimeout(110);
  } finally {
    const ended = new Promise(ok => cdp.once('Tracing.tracingComplete', ok));
    await cdp.send('Tracing.end');
    await ended;
    cdp.off('Tracing.dataCollected', collect);
  }
  const start = events.find(e => e.name === 'table-motion-start')?.ts;
  const end = Math.max(...events.filter(e => e.name === 'table-motion-end').map(e => e.ts));
  assert(end > start, 'missing trace interval');
  const feedback = events.filter(e => e.name === 'Display::FrameDisplayed' && e.ph === 'I' && e.ts >= start && e.ts < end);
  // Several swaps can receive the same presentation timestamp. Count that instant once.
  const frames = [...new Set(feedback.map(e => e.ts - start))].sort((a, b) => a - b);
  assert(frames.length > 20, JSON.stringify({ operation, start, end, inputs, feedback: feedback.length, instants: frames.length }));
  const intervals = frames.slice(1).map((t, i) => (t - frames[i]) / 1000).sort((a, b) => a - b);
  const percentile = q => intervals[Math.ceil(q * intervals.length) - 1];
  return { inputs, elapsedMs: (end - start) / 1000, feedbackEvents: feedback.length, presentedFrames: frames.length,
    presentedFPS: frames.length * 1e6 / (end - start), intervalP95Ms: percentile(.95), intervalP99Ms: percentile(.99),
    presentationOffsetsUs: frames };
}

try {
  const page = await browser.newPage({ viewport, deviceScaleFactor: dpr, reducedMotion: 'no-preference', offline: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const cdp = await page.context().newCDPSession(page);
  for (const [name, dir] of Object.entries(variants)) {
    const hash = createHash('sha256');
    for (const file of files) hash.update(await readFile(join(dir, file)));
    sources[name] = hash.digest('hex');
    for (const grade of ['high', 'medium']) await writeFile(join(temp, name + '-' + grade + '.html'), workspace(dir, 'dark', grade));
  }
  for (let round = 1; round <= rounds; round++) {
    const grades = round % 2 ? ['high', 'medium'] : ['medium', 'high'];
    for (const grade of grades) {
      const order = Object.keys(variants);
      if ((round + Number(grade === 'medium')) % 2) order.reverse();
      for (const variant of order) {
        await page.goto(pathToFileURL(join(temp, variant + '-' + grade + '.html')).href);
        await page.locator('ml-data-table > [data-ml-renderer="webgl"]').waitFor({ state: 'attached' });
        for (const operation of round % 2 ? ['pointer', 'scroll'] : ['scroll', 'pointer']) {
          const sample = await trace(page, cdp, operation);
          samples.push({ round, grade, variant, operation, ...sample });
        }
      }
    }
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ browser: browser.version(), viewport, dpr, rounds, sources, position: values.position, theme: 'dark', rows: 1000,
    presentationEvent: 'Display::FrameDisplayed', pointer: 'one synthetic pointermove per real rAF for 2 s',
    scroll: 'CDP mouse scroll gesture of 4800 CSS pixels at 2400 CSS pixels/s', samples }, null, 2));
} finally {
  await browser.close();
  await rm(temp, { recursive: true, force: true });
}
