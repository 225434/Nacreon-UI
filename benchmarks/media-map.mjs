import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { launchBrowser } from '../tests/helpers/browser.mjs';
import { observeMapGeneration, readMapTiming } from './map-timing.mjs';

const { values } = parseArgs({ options: { 'baseline-gallery': { type: 'string' }, rounds: { type: 'string', default: '12' } } });
const rounds = Number(values.rounds);
if (!Number.isSafeInteger(rounds) || rounds < 1) throw new Error('--rounds must be a positive integer');
const galleries = { current: new URL('../index.html', import.meta.url) };
if (values['baseline-gallery']) galleries.baseline = pathToFileURL(resolve(values['baseline-gallery']));
const inputs = {};
for (const [variant, gallery] of Object.entries(galleries)) {
  inputs[variant] = createHash('sha256').update(await readFile(new URL('preview/components.js', gallery))).digest('hex');
}

const browser = await launchBrowser(chromium);
try {
  const viewport = { width: 1440, height: 1000 }, dpr = 1.25;
  const page = await browser.newPage({ viewport, deviceScaleFactor: dpr, offline: true, reducedMotion: 'no-preference' });
  const errors = [], samples = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(observeMapGeneration);
  await page.addInitScript(() => {
    for (const [key, value] of Object.entries({ theme: 'dark', material: 'high', motion: 'high', 'light-source': 'fixed' })) {
      localStorage.setItem('material-library.switch.' + key, value);
    }
  });
  // Round zero warms the browser. Every measured navigation still creates a fresh JS map cache.
  for (let round = 0; round <= rounds; round++) {
    const order = Object.keys(galleries);
    if (round % 2) order.reverse();
    for (const variant of order) {
      await page.goto(galleries[variant].href + '#media-viewer');
      const card = page.locator('#media-viewer-specimen ml-media-surface');
      await card.scrollIntoViewIfNeeded();
      await card.locator('img').evaluate(image => image.decode());
      await card.locator(':scope > .ml-optical[data-ml-renderer="webgl"]').waitFor({ state: 'attached' });
      const settings = await page.locator('html').evaluate(el => [el.dataset.mlTheme, el.dataset.mlMaterial, el.dataset.mlLightSource]);
      assert.deepEqual(settings, ['dark', 'high', 'fixed']);
      if (round) samples.push({ round, variant, ...await readMapTiming(card) });
    }
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ browser: browser.version(), viewport, dpr, theme: 'dark', light: 'fixed',
    rounds, warmupRounds: 1, inputs, samples }, null, 2));
} finally {
  await browser.close();
}
