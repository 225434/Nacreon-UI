import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { launchBrowser } from '../tests/helpers/browser.mjs';
import { workspace } from './table-workspace.mjs';

const { values } = parseArgs({ options: { input: { type: 'string', default: 'scroll' } } });
assert(['scroll', 'pointer'].includes(values.input));
const pointer = values.input === 'pointer';
const dist = fileURLToPath(new URL('../dist', import.meta.url));
const temp = await mkdtemp(join(tmpdir(), 'nacreon-scroll-material-'));
const file = join(temp, 'table.html');
const browser = await launchBrowser(chromium);
const frame = page => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
const referenceCSS = 'ml-data-table.ml-refractive{--ml-table-window:initial!important}';

async function screenshot(page) {
  await frame(page);
  await page.waitForTimeout(65);
  return page.screenshot({ animations: 'disabled' });
}

// Move a real PointerEvent by less than the renderer's 0.1 CSS pixel light-position precision.
// The active input path stays live while both captures keep exactly the same visible lamp pose.
async function holdPointer(rows) {
  await rows.evaluate(el => {
    const box = el.getBoundingClientRect(), x = Math.round(box.left + box.width / 2), y = Math.round(box.top + box.height / 2);
    let step = 0;
    function move() {
      el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, isPrimary: true, pointerType: 'mouse',
        clientX: x + (++step % 2 ? .001 : .003), clientY: y }));
      window.materialPointer = requestAnimationFrame(move);
    }
    move();
  });
}

async function difference(page, a, b) {
  return page.evaluate(async images => {
    const bounds = document.querySelector('#rows').getBoundingClientRect(), dpr = devicePixelRatio;
    const x = Math.ceil(bounds.left * dpr), y = Math.ceil(bounds.top * dpr);
    const width = Math.floor(bounds.right * dpr) - x, height = Math.floor(bounds.bottom * dpr) - y;
    const data = await Promise.all(images.map(async encoded => {
      const bitmap = await createImageBitmap(await (await fetch('data:image/png;base64,' + encoded)).blob());
      const context = new OffscreenCanvas(width, height).getContext('2d');
      context.drawImage(bitmap, x, y, width, height, 0, 0, width, height);
      bitmap.close();
      return context.getImageData(0, 0, width, height).data;
    }));
    let different = 0, maxChannelDelta = 0, absoluteSum = 0;
    for (let i = 0; i < data[0].length; i += 4) {
      let peak = 0;
      for (let c = 0; c < 3; c++) {
        const delta = Math.abs(data[0][i + c] - data[1][i + c]);
        peak = Math.max(peak, delta);
        absoluteSum += delta;
      }
      if (peak) different++;
      maxChannelDelta = Math.max(maxChannelDelta, peak);
    }
    return { pixels: width * height, different, maxChannelDelta, absoluteSum };
  }, [a.toString('base64'), b.toString('base64')]);
}

try {
  await writeFile(file, workspace(dist, 'dark', 'high'));
  const samples = [], errors = [];
  for (const dpr of [1.25, 1.5, 1.75, 2]) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 850 }, deviceScaleFactor: dpr, reducedMotion: 'no-preference' });
    page.on('pageerror', error => errors.push(error.message));
    for (const background of ['dark', 'contrast']) {
      await page.goto(pathToFileURL(file).href);
      await page.addStyleTag({ content: 'main{max-width:867.5px}#rows{height:271.5px}' });
      if (background === 'contrast') await page.addStyleTag({ content:
        'body{background:repeating-conic-gradient(from 10deg,#fd5 0% 25%,#247 0% 50%) 0/28px 34px}' +
        'ml-data-table.ml-refractive{background:rgba(255,255,255,.06)!important}ml-data-table th{background:transparent!important}' });
      await page.mouse.move(4, 4);
      await page.evaluate(source => { document.documentElement.dataset.mlLightSource = source; }, pointer ? 'pointer' : 'fixed');
      await page.locator('ml-data-table > [data-ml-renderer="webgl"]').waitFor({ state: 'attached' });
      const rows = page.locator('#rows'), table = page.locator('ml-data-table');
      for (const position of [1, 5107, 9151, 10301, 19772, 20000, 25411, 31291, 35411, 100000]) {
        const scrollTop = await rows.evaluate((el, y) => { el.scrollTop = y; return el.scrollTop; }, position);
        await page.waitForTimeout(120);
        if (pointer) await holdPointer(rows);
        else await rows.evaluate(el => el.dispatchEvent(new Event('scroll')));
        await page.waitForFunction(() => getComputedStyle(document.querySelector('ml-data-table')).backdropFilter.includes('-viewport'));
        const mapY = await table.evaluate(el => Number(el.querySelector('filter[id$="-viewport"] feImage').getAttribute('y')));
        const rule = await page.addStyleTag({ content: referenceCSS });
        const full = await screenshot(page);
        await rule.evaluate(el => el.remove());
        const moving = await screenshot(page);
        assert(await table.evaluate(el => getComputedStyle(el).backdropFilter.includes('-viewport')));
        const check = await page.addStyleTag({ content: referenceCSS });
        const fullAgain = await screenshot(page);
        await check.evaluate(el => el.remove());
        if (pointer) {
          await page.evaluate(() => cancelAnimationFrame(window.materialPointer));
          await page.waitForTimeout(150);
        } else await rows.evaluate(el => el.dispatchEvent(new Event('scrollend')));
        await frame(page);
        const restored = await table.evaluate(el => getComputedStyle(el).backdropFilter.includes('-viewport') ? 'prefix' : 'full');
        assert.equal(restored, mapY ? 'full' : 'prefix');
        const result = { dpr, background, scrollTop, mapY, restored,
          movingVsFull: await difference(page, full, moving), fullVsFull: await difference(page, full, fullAgain) };
        if (pointer) {
          const rest = await screenshot(page);
          const complete = await page.addStyleTag({ content: referenceCSS });
          result.restVsFull = await difference(page, rest, await screenshot(page));
          await complete.evaluate(el => el.remove());
          assert.equal(await rows.evaluate(el => el.scrollTop), scrollTop);
        }
        samples.push(result);
      }
    }
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ browser: browser.version(), theme: 'dark', light: pointer ? 'pointer' : 'fixed', input: values.input, rows: 1000,
    viewport: [1200, 850], tableWidthCssPx: 867.5, scrollportHeightCssPx: 271.5,
    region: 'all physical pixels strictly inside the scrollport bounds, with foreground rows and text', samples }, null, 2));
} finally {
  await browser.close();
  await rm(temp, { recursive: true, force: true });
}
