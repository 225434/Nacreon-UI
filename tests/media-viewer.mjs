import { launchBrowser } from './helpers/browser.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, firefox } from 'playwright';

const engine = process.argv[2] === 'firefox' ? firefox : chromium;
const browser = await launchBrowser(engine);
const root = new URL('../', import.meta.url);
const temp = await mkdtemp(join(tmpdir(), 'ml-media-viewer-'));
const file = join(temp, 'example.html');
const errors = [];

async function checkDarkGlass(surface) {
  const png = (await surface.screenshot({ animations: 'disabled' })).toString('base64');
  const result = await surface.evaluate(async (el, png) => {
    const image = new Image();
    image.src = 'data:image/png;base64,' + png;
    await image.decode();
    const w = image.width, h = image.height, scale = w / el.offsetWidth;
    const ctx = new OffscreenCanvas(w, h).getContext('2d');
    ctx.drawImage(image, 0, 0);
    const rgba = ctx.getImageData(0, 0, w, h).data;
    const pixels = new Uint32Array(rgba.buffer);
    const radius = parseFloat(getComputedStyle(el).borderTopRightRadius);
    function diagonalPeak(data, width, sx, sy, end, channels) {
      let peak = 0;
      for (let y = Math.round((radius + 2) * sy); y < Math.round((radius + end) * sy); y++) {
        const center = width - Math.round(y * sx / sy), reach = Math.round(6 * sx);
        for (let x = center - reach; x < center + reach - 1; x++) {
          const i = 4 * (y * width + x);
          for (let c = 0; c < channels; c++) peak = Math.max(peak, Math.abs(data[i + c] - data[i + c + 4]));
        }
      }
      return peak;
    }
    // Cross the visible corner above the expand icon and the matching R/G ray displacement in the native filter.
    const layer = el.querySelector('.ml-optical'), map = new Image();
    map.src = layer.querySelector('feImage').getAttribute('href');
    await map.decode();
    const mapCtx = new OffscreenCanvas(map.width, map.height).getContext('2d');
    mapCtx.drawImage(map, 0, 0);
    const mapData = mapCtx.getImageData(0, 0, map.width, map.height).data;
    const mapStep = diagonalPeak(mapData, map.width, map.width / layer.clientWidth, map.height / layer.clientHeight, 16, 2);
    const peakStep = diagonalPeak(rgba, w, scale, scale, 9.5, 3);
    let highlight = 0;
    for (let y = Math.round((radius + 2) * scale); y < Math.round((radius + 9.5) * scale); y++) {
      const center = w - y;
      const at = x => 4 * (y * w + x);
      highlight = Math.max(highlight, rgba[at(center - Math.round(24 * scale)) + 1] - rgba[at(center + Math.round(12 * scale)) + 1]);
    }
    // Count blank header pixels belonging to an uninterrupted run of 16 identical colours.
    const left = Math.floor(w * .20), right = Math.floor(w * .79);
    const top = Math.floor(h * .06), bottom = Math.floor(h * .135);
    let longRunPixels = 0;
    for (let y = top; y < bottom; y++) {
      let run = 0;
      for (let x = left; x < right; x++) {
        const i = y * w + x;
        run = x > left && pixels[i] === pixels[i - 1] ? run + 1 : 1;
        if (run === 16) longRunPixels += 16;
        if (run > 16) longRunPixels++;
      }
    }
    return { renderer: layer.dataset.mlRenderer, mapStep, peakStep, highlight,
      plateaus: longRunPixels / ((bottom - top) * (right - left)) };
  }, png);
  assert(result.peakStep <= 4, 'visible diagonal seam: ' + JSON.stringify(result));
  assert(result.mapStep <= 4, 'discontinuous native refraction: ' + JSON.stringify(result));
  if (result.renderer === 'webgl') {
    assert(result.highlight >= 8, 'the corner should retain its highlight');
    assert(result.plateaus < .14, 'long colour terraces in the dark header: ' + JSON.stringify(result));
  }
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  context.on('page', page => {
    page.setDefaultTimeout(12000);
    page.on('pageerror', error => errors.push(error.message));
  });
  const page = await context.newPage();
  await page.goto(new URL('index.html#media-viewer', root).href);
  const specimen = page.locator('#media-viewer-specimen');
  const viewer = specimen.locator('ml-media-viewer');
  const stage = viewer.locator('.ml-media-stage');
  const photo = stage.locator('img');
  const clip = stage.locator('video');
  const modal = viewer.locator('dialog');
  const button = action => viewer.locator('button[data-action="' + action + '"]');
  const value = () => viewer.evaluate(el => el.value);
  const set = (name, value) => page.locator('input[name="' + name + '"][value="' + value + '"]').evaluate(input => input.click());
  const imageReady = () => page.waitForFunction(() => {
    const image = document.querySelector('#media-viewer-specimen .ml-media-stage > img');
    return image?.complete && image.naturalWidth > 0;
  });
  const videoReady = () => page.waitForFunction(() => {
    const video = document.querySelector('#media-viewer-specimen .ml-media-stage > video');
    return video?.readyState >= 1 && Number.isFinite(video.duration);
  });
  const transform = () => photo.evaluate(el => {
    const matrix = new DOMMatrix(el.style.transform);
    return [matrix.a, matrix.e, matrix.f];
  });

  await imageReady();
  await set('theme', 'dark');
  await set('material', 'high');
  await set('light-source', 'fixed');
  const surface = viewer.locator(':scope > ml-media-surface');
  await surface.locator('.ml-optical:is([data-ml-renderer="webgl"], [data-ml-renderer="svg"])').waitFor({ state: 'attached' });
  await checkDarkGlass(surface);
  await set('light-source', 'pointer');
  await set('motion', 'base');
  assert.equal(await page.locator('#catalog-current').textContent(), '图片与视频预览器');
  assert.equal(await value(), 'lake');
  assert.match(await photo.getAttribute('alt'), /雪峰/);
  assert.equal(await viewer.getByRole('link').count(), 4);
  assert.equal(await button('previous').isDisabled(), true);
  await button('zoom-in').click();
  assert.equal((await transform())[0], 1.25);
  assert.equal(await button('fit').textContent(), '125%');
  const box = await stage.boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 36, y + 24, { steps: 3 });
  await page.mouse.up();
  assert((await transform())[1] > 20);
  assert((await transform())[2] > 12);
  await stage.press('ArrowLeft');
  assert.equal(await value(), 'lake');
  await stage.press('0');
  assert.deepEqual(await transform(), [1, 0, 0]);
  await stage.press('ArrowRight');
  await imageReady();
  assert.equal(await value(), 'coast');
  assert.equal(await viewer.getByRole('link', { name: '海岸峭壁' }).getAttribute('aria-current'), 'true');
  await stage.dblclick();
  assert.equal((await transform())[0], 2);
  const original = await photo.elementHandle();
  await button('enlarge').click();
  await viewer.locator('dialog:modal').waitFor();
  assert.equal(await modal.getByRole('button', { name: '关闭放大预览' }).count(), 1);
  assert(await original.evaluate(el => el.closest('dialog').open));
  await page.keyboard.press('Escape');
  await viewer.locator(':scope > ml-media-surface').waitFor();
  assert.equal(await viewer.evaluate(el => el.open), false);
  assert.equal(await button('enlarge').evaluate(el => document.activeElement === el), true);
  assert.equal((await transform())[0], 2);

  await viewer.getByRole('link', { name: '风景短片' }).click();
  await videoReady();
  assert.equal(await value(), 'slideshow');
  assert.equal(await viewer.locator('.ml-media-zoom').isVisible(), false);
  assert.deepEqual(await clip.evaluate(el => [el.controls, el.playsInline, el.videoWidth, Math.round(el.duration)]), [true, true, 1280, 12]);
  await clip.evaluate(el => { el.muted = true; return el.play(); });
  await page.waitForFunction(() => document.querySelector('#media-viewer-specimen video')?.currentTime > .15);
  await clip.evaluate(el => { el.pause(); el.currentTime = 7; });
  await page.waitForFunction(() => {
    const video = document.querySelector('#media-viewer-specimen video');
    return !video?.seeking && Math.abs(video?.currentTime - 7) < .1;
  });
  const previousVideo = await clip.elementHandle();
  await button('previous').click();
  await imageReady();
  assert.equal(await value(), 'dunes');
  assert.equal(await previousVideo.evaluate(el => el.paused && !el.hasAttribute('src')), true);
  assert.deepEqual(await transform(), [1, 0, 0]);

  const colors = new Set();
  for (const theme of ['light', 'warm', 'dark']) {
    await set('theme', theme);
    colors.add(await viewer.evaluate(el => getComputedStyle(el).getPropertyValue('--ml-color-surface').trim()));
    for (const material of ['base', 'low', 'medium', 'high']) {
      await set('material', material);
      for (const motion of ['base', 'low', 'medium', 'high']) {
        await set('motion', motion);
        assert.deepEqual(await viewer.evaluate(el => {
          const css = getComputedStyle(el);
          return ['--ml-material-level', '--ml-motion-level'].map(prop => css.getPropertyValue(prop).trim());
        }), [material, motion]);
      }
    }
  }
  assert.equal(colors.size, 3);
  await page.setViewportSize({ width: 320, height: 850 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await photo.evaluate(el => getComputedStyle(el).transitionDuration), '0s');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert(await viewer.locator(':scope > ul').evaluate(el => el.scrollWidth > el.clientWidth));
  await viewer.evaluate(el => el.select('slideshow'));
  await videoReady();
  await clip.evaluate(el => { el.muted = true; return el.play(); });
  const playingVideo = await clip.elementHandle();
  await page.evaluate(() => { location.hash = 'tree'; });
  await specimen.waitFor({ state: 'hidden' });
  assert.deepEqual(await playingVideo.evaluate(el => [el.paused, el.isConnected]), [true, false]);
  await page.evaluate(() => { location.hash = 'media-viewer'; });
  await specimen.waitFor();
  assert(await playingVideo.evaluate(el => el.isConnected && el.paused));

  await page.locator('#open-code').click();
  const snippet = await page.locator('#code-sample').textContent();
  assert.match(snippet, /<ml-media-viewer value="slideshow"/);
  assert.doesNotMatch(snippet, /class="ml-media-stage"/);
  await writeFile(file, '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><base href="' + root.href + '">' + snippet);
  const copy = await context.newPage();
  await copy.setViewportSize({ width: 320, height: 850 });
  await copy.goto(pathToFileURL(file).href);
  await copy.waitForFunction(() => document.querySelector('video')?.duration === 12);
  const exported = copy.locator('ml-media-viewer');
  await exported.getByRole('link', { name: '山间湖泊' }).click();
  await copy.waitForFunction(() => document.querySelector('.ml-media-stage img')?.naturalWidth > 0);
  await exported.evaluate(el => { el.selectedItem.href = './preview/assets/media/nonexistent-image.jpg'; });
  await exported.getByText('无法加载图片', { exact: true }).waitFor();
  await exported.evaluate(el => { el.selectedItem.href = './preview/assets/media/alpine-lake.jpg'; });
  await exported.locator('.ml-media-status').waitFor({ state: 'hidden' });

  if (engine === chromium) {
    const touch = await browser.newContext({ viewport: { width: 390, height: 850 }, hasTouch: true, reducedMotion: 'reduce' });
    const phone = await touch.newPage();
    await phone.goto(new URL('index.html#media-viewer', root).href);
    const frame = phone.locator('#media-viewer-specimen .ml-media-stage');
    await phone.waitForFunction(() => document.querySelector('#media-viewer-specimen .ml-media-stage img')?.naturalWidth > 0);
    const rect = await frame.boundingBox();
    const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
    const cdp = await touch.newCDPSession(phone);
    const gesture = (type, spread) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: spread ? [
      { x: cx - spread, y: cy, id: 1 }, { x: cx + spread, y: cy, id: 2 },
    ] : [] });
    await gesture('touchStart', 22);
    await gesture('touchMove', 39);
    await gesture('touchMove', 58);
    await gesture('touchEnd', 0);
    assert(await frame.locator('img').evaluate(el => new DOMMatrix(el.style.transform).a > 2));
    await touch.close();
  }
  assert.deepEqual(errors, []);
  console.log(engine.name() + ': verified media zoom, pan, large view, video playback and seeking, 48 appearances and offline code');
} finally {
  await browser.close();
  await unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; });
  await rmdir(temp);
}
