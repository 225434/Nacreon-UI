import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const gallery = new URL('../index.html#materials', import.meta.url).href;
const browser = await chromium.launch({ executablePath: chromium.executablePath() });

// Recover the backdrop coordinate independently of glass tint and lighting. A black,
// white and linear ramp exposure at the same pixel leave only the transmission lookup.
async function interiorCoordinates(sample, layer, engine, settle) {
  const positions = [.35, .5, .65];
  if (engine === 'svg') return layer.evaluate(async (el, positions) => {
    const map = new Image();
    map.src = el.querySelector('feImage').getAttribute('href');
    await map.decode();
    const canvas = document.createElement('canvas');
    canvas.width = map.naturalWidth;
    canvas.height = map.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(map, 0, 0);
    const scale = Number(el.querySelector('feDisplacementMap').getAttribute('scale'));
    return positions.map(y => {
      const green = ctx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height * y), 1, 1).data[1];
      return y + (green / 255 - .5) * scale / el.clientHeight;
    });
  }, positions);

  const readings = [];
  for (const tone of ['black', 'white', 'ramp']) {
    await sample.evaluate((el, tone) => {
      const ctx = el.backdrop.getContext('2d'), backdrop = ctx.canvas.getBoundingClientRect();
      const surface = el.querySelector('.ml-optical').getBoundingClientRect();
      const top = (surface.top - backdrop.top) * ctx.canvas.height / backdrop.height;
      const height = surface.height * ctx.canvas.height / backdrop.height;
      const ramp = ctx.createLinearGradient(0, top, 0, top + height);
      ramp.addColorStop(0, 'black');
      ramp.addColorStop(1, 'white');
      ctx.fillStyle = tone === 'ramp' ? ramp : tone;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      el.refreshBackdrop();
    }, tone);
    await settle();
    readings.push(await layer.locator(':scope > canvas').evaluate((canvas, positions) => {
      const ctx = canvas.getContext('2d');
      return positions.map(y => ctx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height * y), 1, 1).data[1]);
    }, positions));
  }
  const [black, white, ramp] = readings;
  return ramp.map((value, i) => (value - black[i]) / (white[i] - black[i]));
}

async function exercise(page, engine) {
  await page.goto(gallery);
  const set = (name, value) => page.locator('.settings input[name="' + name + '"][value="' + value + '"]').evaluate(input => input.click());
  await set('material', 'high');
  await set('motion', 'high');
  await set('theme', 'light');
  const sample = page.locator('#material-specimen ml-material');
  const layer = sample.locator('.ml-optical');
  await page.waitForFunction(expected => document.querySelector('#material-specimen .ml-optical')?.dataset.mlRenderer === expected, engine);
  const canvas = layer.locator(':scope > canvas');
  const box = await layer.boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  async function lightAt(x, y = cy) {
    await page.mouse.move(x, y);
    await settle();
    return layer.evaluate(el => ['--ml-cast-x', '--ml-cast-y', '--ml-cast-opacity'].map(name => parseFloat(el.style.getPropertyValue(name))));
  }
  async function neutralBackdrop() {
    await sample.evaluate(el => {
      const ctx = el.backdrop.getContext('2d');
      ctx.fillStyle = '#686868';
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      el.refreshBackdrop();
    });
    await settle();
  }
  // Read the real shader output over one flat tone to isolate the lamp from the gallery stripes.
  function luminance(canvas) {
    const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
    const inset = Math.max(2, Math.round(h * .042));
    return [inset, w - inset - 1, Math.floor(w / 2)].map(x => {
      const {data} = ctx.getImageData(x - 1, Math.floor(h / 2) - 1, 3, 3);
      let total = 0;
      for (let i = 0; i < data.length; i += 4) total += .2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2];
      return total / 9;
    });
  }
  const left = box.x + box.height * .22, right = box.x + box.width - box.height * .22;
  await neutralBackdrop();
  const castLeft = await lightAt(left);
  if (engine === 'webgl') {
    const [lit, unlit] = await canvas.evaluate(luminance);
    assert(lit > unlit + 30, 'the curved left edge should catch a nearby light');
    await lightAt(right);
    const [opposite, near] = await canvas.evaluate(luminance);
    assert(near > opposite + 30, 'the reflection should change sides');
    await lightAt(page.viewportSize().width - 8);
    const [, far] = await canvas.evaluate(luminance);
    assert(near > far + 30, 'the same edge should dim as the light moves away');
    await lightAt(cx);
    const [, , lightFace] = await canvas.evaluate(luminance);
    await set('theme', 'dark');
    await neutralBackdrop();
    const [, , darkFace] = await canvas.evaluate(luminance);
    assert(darkFace < lightFace - 4 && darkFace < 124, 'dark mode should keep the centered reflection subdued');
  } else {
    const lip = layer.locator('svg > [stroke]');
    const gradient = layer.locator('radialGradient').first();
    const position = () => gradient.evaluate(el => Number(el.getAttribute('cx')));
    const initial = await position();
    const near = Number(await lip.getAttribute('opacity'));
    await lightAt(right);
    assert(await position() > initial + box.width / 2);
    await lightAt(page.viewportSize().width - 8);
    assert(Number(await lip.getAttribute('opacity')) < near * .4, 'the fallback rim should also fade with distance');
  }
  const castRight = await lightAt(right), castFar = await lightAt(page.viewportSize().width - 8);
  assert(castLeft[0] > 1 && castRight[0] < -1 && castFar[2] < castRight[2]);
  assert((await lightAt(cx, box.y - 8))[1] > 1);
  assert((await lightAt(cx, box.y + box.height + 8))[1] < -1);

  await set('motion', 'medium');
  assert.deepEqual(await lightAt(left), await lightAt(right));
  await set('motion', 'high');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.deepEqual(await lightAt(left), await lightAt(right));
  const coords = await interiorCoordinates(sample, layer, engine, settle);
  assert(coords[0] > .39 && coords[2] < .61, 'the interior should magnify the backdrop well away from the rim');
  assert(coords[0] + .025 < coords[1] && coords[1] + .025 < coords[2], 'the center should stay upright');
  assert(Math.abs(coords[1] - .5) < .025, 'the optical axis should stay centered');
  if (engine === 'webgl') {
    await sample.evaluate(el => { el.backdrop = null; });
    await settle();
    const opacity = await canvas.evaluate(c => c.getContext('2d').getImageData(c.width / 2, c.height / 2, 1, 1).data[3]);
    assert(opacity > 35 && opacity < 150, 'untextured glass should also have a translucent interior');
  }
  await page.emulateMedia({ forcedColors: 'active' });
  await layer.waitFor({ state: 'hidden' });
  return coords;
}

try {
  const coords = [];
  for (const engine of ['webgl', 'svg']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'no-preference' });
    if (engine === 'svg') await page.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
        return kind === 'webgl' ? null : getContext.call(this, kind, ...args);
      };
    });
    coords.push(await exercise(page, engine));
    await page.close();
  }
  assert(coords[0].every((value, i) => Math.abs(value - coords[1][i]) < .025), 'GPU and native refraction should match');
  console.log('Glass volume, refraction, lighting, shadows and motion preferences passed in WebGL and SVG.');
} finally {
  await browser.close();
}
