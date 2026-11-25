import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './helpers/browser.mjs';

const root = new URL('../', import.meta.url);
const dir = await mkdtemp(join(tmpdir(), 'nacreon-slider-'));
const file = join(dir, 'range.html');
const head = '<!doctype html><html lang="zh-CN" data-ml-material="base"><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1"><base href="' + root.href + '">' +
  '<link rel="stylesheet" href="dist/components/slider/slider.css"><script defer src="dist/components/slider/slider.js"></script>';
const body = '<body style="padding:2rem;max-width:26rem"><form><fieldset><ml-slider ticks unit="×">' +
  '<label for="speed">回放速度</label><input id="speed" name="speed" type="range" min="0.5" max="2" step="0.25" value="1">' +
  '</ml-slider></fieldset></form></body></html>';

function position(host) {
  const input = host.control, track = host.querySelector('[data-ml-part="track"]');
  const rail = track.getBoundingClientRect(), thumb = track.querySelector('ml-value-surface').getBoundingClientRect();
  const fill = track.querySelector('[data-ml-part="fill"]').getBoundingClientRect();
  const min = input.min === '' ? 0 : Number(input.min), max = input.max === '' ? 100 : Number(input.max);
  const rtl = getComputedStyle(host).direction === 'rtl';
  const portion = (input.valueAsNumber - min) / (max - min);
  const expected = rtl ? rail.right - portion * rail.width : rail.left + portion * rail.width;
  return [Math.abs(thumb.x + thumb.width / 2 - expected), Math.abs((rtl ? fill.left : fill.right) - expected)];
}
function surfaceAlpha(thumb) {
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.fillStyle = getComputedStyle(thumb).backgroundColor;
  ctx.fillRect(0, 0, 1, 1);
  return ctx.getImageData(0, 0, 1, 1).data[3];
}
let browser;
try {
  await writeFile(file, head + body);
  browser = await launchBrowser(chromium);
  const page = await browser.newPage({ viewport: { width: 700, height: 420 }, offline: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(pathToFileURL(file).href);
  const field = page.getByRole('slider', { name: '回放速度' }), host = page.locator('ml-slider');
  const thumb = host.locator('ml-value-surface'), reading = host.locator('[data-ml-part="reading"]');
  const tick = host.locator('i[data-ml-current]');
  const scale = () => thumb.evaluate(el => parseFloat(getComputedStyle(el).scale) || 1);
  const rect = await field.boundingBox(), y = rect.y + rect.height / 2;
  const idle = await thumb.boundingBox();
  assert(idle.width > idle.height * 1.5 && rect.height >= 44, 'resting capsule and native hit area');
  for (const [grade, grip] of [['high', 1.08], ['medium', 1.04], ['low', 1], ['base', 1]]) {
    await host.evaluate((el, tier) => el.dataset.mlMotion = tier, grade);
    await page.mouse.move(rect.x + rect.width * .4, y);
    await page.mouse.down();
    await page.waitForFunction(expected => Math.abs((parseFloat(getComputedStyle(document.querySelector('ml-value-surface')).scale) || 1) - expected) < .005, grip);
    // Read each real pointer sample before the pause timer can clear it on a busy runner.
    await host.evaluate(el => {
      const track = el.querySelector('[data-ml-part="track"]'), knob = track.querySelector('ml-value-surface');
      window.dragSamples = [];
      const sample = () => {
        const current = getComputedStyle(knob).scale;
        const transition = knob.getAnimations().find(a => a.transitionProperty === 'scale');
        const target = transition?.effect.getKeyframes().at(-1).scale || current;
        window.dragSamples.push([Number(track.style.getPropertyValue('--ml-slider-speed')), parseFloat(target) || 1]);
      };
      el.addEventListener('pointermove', sample);
      el.addEventListener('pointerup', () => el.removeEventListener('pointermove', sample), { once: true });
    });
    for (const ratio of [.84, .26, .94]) {
      await page.mouse.move(rect.x + rect.width * ratio, y);
      assert((await host.evaluate(position)).every(error => error < .1), 'fill and thumb align immediately during drag');
      assert.equal(await reading.textContent(), await field.inputValue() + '×');
      assert.equal(await tick.count(), 1);
    }
    const samples = await page.evaluate(() => window.dragSamples);
    if (grade === 'high') assert(samples.some(([speed, width]) => speed > .3 && width > grip + .06), 'fast motion elongates the held thumb');
    else assert(samples.every(([speed, width]) => speed === 0 && Math.abs(width - grip) < .005), 'lower tiers skip velocity tracking');
    await page.waitForFunction(expected => {
      const track = document.querySelector('[data-ml-part="track"]');
      return !track.style.getPropertyValue('--ml-slider-speed') &&
        Math.abs((parseFloat(getComputedStyle(track.querySelector('ml-value-surface')).scale) || 1) - expected) < .003;
    }, grip);
    const value = await field.inputValue();
    await page.mouse.move(rect.x + rect.width * .94, rect.y + rect.height + 60);
    await page.mouse.up();
    await page.mouse.move(0, 0);
    await page.waitForFunction(() => (parseFloat(getComputedStyle(document.querySelector('ml-value-surface')).scale) || 1) === 1);
    assert.equal(await field.inputValue(), value);
    assert(!await host.evaluate(el => el.hasAttribute('data-ml-adjust')));
    assert((await host.evaluate(position)).every(error => error < .1));
  }
  await field.evaluate(el => { el.step = 'any'; el.parentElement.refresh(); });
  const rail = await host.locator('[data-ml-part="track"]').boundingBox();
  for (const direction of ['ltr', 'rtl']) {
    await host.evaluate((el, dir) => { el.dir = dir; el.value = 1.25; }, direction);
    await page.mouse.move(rail.x, y);
    await page.mouse.down();
    for (const ratio of [0, .12, .53, .91, 1]) {
      const x = rail.x + rail.width * ratio;
      await page.mouse.move(x, y);
      const box = await thumb.boundingBox();
      assert(Math.abs(box.x + box.width / 2 - x) < 1.1, 'visible and native thumb share the same travel');
    }
    await page.mouse.up();
  }
  await field.evaluate(el => { el.step = '0.25'; el.parentElement.refresh(); });
  await host.evaluate(el => { el.dataset.mlMotion = 'base'; el.dataset.mlLightSource = 'none'; });
  for (const tier of ['high', 'medium', 'low', 'base']) {
    await host.evaluate((el, material) => {
      el.dataset.mlMaterial = material;
      el.style.setProperty('--ml-material-transparency', '60%');
    }, tier);
    assert.equal(await thumb.evaluate(surfaceAlpha), 255);
    await page.mouse.move(rect.x + rect.width / 2, y);
    await page.mouse.down();
    const alpha = await thumb.evaluate(surfaceAlpha);
    if (tier === 'high' || tier === 'medium') assert(Math.abs(alpha - 102) <= 1, 'glass follows the shared transparency setting');
    else assert.equal(alpha, 255, 'mica retains a solid face');
    if (tier === 'high') {
      const lens = thumb.locator('.ml-optical:not([data-ml-light])');
      await lens.waitFor({ state: 'attached' });
      assert.equal(await lens.evaluate(el => getComputedStyle(el).opacity), '1');
      await host.evaluate(el => el.style.setProperty('--ml-material-transparency', '0%'));
      assert.equal(await thumb.evaluate(surfaceAlpha), 255);
    }
    await page.mouse.up();
    if (tier === 'high') assert.equal(await thumb.locator('.ml-optical').evaluate(el => getComputedStyle(el).opacity), '0');
  }
  await host.evaluate(el => { el.dir = 'rtl'; el.dataset.mlMotion = 'high'; el.value = 1; });
  await field.focus();
  await page.keyboard.down('ArrowLeft');
  assert.equal(await reading.textContent(), '1.25×');
  assert.equal(await tick.evaluate(el => el.style.insetInlineStart), '50%');
  assert(await host.evaluate(el => el.dataset.mlAdjust === 'key'));
  assert((await host.evaluate(position)).every(error => error < .1));
  await page.keyboard.up('ArrowLeft');
  assert(!await host.evaluate(el => el.hasAttribute('data-ml-adjust')));
  await page.keyboard.down('End');
  await page.locator('fieldset').evaluate(el => el.disabled = true);
  await page.waitForFunction(() => !document.querySelector('ml-slider').hasAttribute('data-ml-adjust'));
  await page.keyboard.up('End');
  await page.locator('fieldset').evaluate(el => el.disabled = false);
  await page.locator('form').evaluate(el => el.reset());
  await page.waitForFunction(() => document.querySelector('[data-ml-part="reading"]').textContent === '1×');
  assert.equal(await page.locator('form').evaluate(el => new FormData(el).get('speed')), '1');
  await field.evaluate(el => { el.removeAttribute('min'); el.max = '12'; el.step = '2'; el.defaultValue = '1'; el.value = '5'; el.parentElement.refresh(); });
  assert.equal(await host.locator('i').count(), 6);
  assert(Math.abs(parseFloat(await tick.evaluate(el => el.style.insetInlineStart)) - 500 / 12) < .001);
  await field.evaluate(el => { el.step = 'any'; el.value = '2.7'; el.parentElement.refresh(); });
  assert.equal(await host.locator('i').count(), 0);
  await field.evaluate(el => { el.step = '0.001'; el.parentElement.refresh(); });
  assert.equal(await host.locator('i').count(), 0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await field.focus();
  await page.keyboard.down('ArrowLeft');
  assert.equal(await scale(), 1);
  assert.equal(await thumb.evaluate(el => getComputedStyle(el).transitionDuration), '0s');
  assert.equal(await host.locator('[data-ml-part="track"]').evaluate(el => getComputedStyle(el, '::before').transitionDuration), '0s');
  await page.keyboard.up('ArrowLeft');
  await page.mouse.move(rect.x + rect.width * .2, y);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width * .8, y);
  assert.equal(await scale(), 1);
  assert.equal(await host.locator('[data-ml-part="track"]').evaluate(el => el.style.getPropertyValue('--ml-slider-speed')), '');
  await page.mouse.up();
  await page.keyboard.press('ArrowRight');
  await page.emulateMedia({ forcedColors: 'active' });
  assert.equal(await thumb.evaluate(el => getComputedStyle(el).outlineStyle), 'solid');

  const mobile = await browser.newPage({ viewport: { width: 390, height: 720 }, hasTouch: true, isMobile: true, offline: true });
  mobile.on('pageerror', e => errors.push(e.message));
  await mobile.goto(pathToFileURL(file).href);
  const range = mobile.getByRole('slider'), box = await range.boundingBox();
  const touch = await mobile.context().newCDPSession(mobile);
  const point = fraction => ({ x: box.x + box.width * fraction, y: box.y + box.height / 2 });
  for (const end of ['touchCancel', 'touchEnd']) {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(.3)] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(.8)] });
    await mobile.waitForFunction(() => parseFloat(getComputedStyle(document.querySelector('ml-value-surface')).scale) > 1.05);
    assert(Number(await range.inputValue()) >= 1.5);
    assert((await mobile.locator('ml-slider').evaluate(position)).every(error => error < .1));
    await touch.send('Input.dispatchTouchEvent', { type: end, touchPoints: [] });
    await mobile.waitForFunction(() => !document.querySelector('ml-slider').hasAttribute('data-ml-adjust') &&
      parseFloat(getComputedStyle(document.querySelector('ml-value-surface')).scale) === 1);
  }
  assert.deepEqual(errors, []);
  console.log('Slider capsule, velocity and pause, material transparency, native drag alignment, touch cancellation, four motion tiers, keyboard, RTL, reset, step grids and reduced motion passed.');
} finally {
  await browser?.close();
  await rm(dir, { recursive: true, force: true });
}
