import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium, firefox } from 'playwright';

const engine = process.argv[2] === 'firefox' ? firefox : chromium;
const browser = await engine.launch({ executablePath: engine.executablePath() });
const root = new URL('../', import.meta.url);
const grades = ['base', 'low', 'medium', 'high'];
const frames = page => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
const select = (page, axis, value) => page.locator('input[name="' + axis + '"][value="' + value + '"]').evaluate(el => el.click());

// Inspect the unmasked GPU output or the SVG fill at all four corners and the center.
async function checkPaint(layer, rounded, message, expectedRenderer) {
  await layer.locator(':scope > svg > path[d]').first().waitFor({ state: 'attached' });
  const result = await layer.evaluate(el => {
    const w = el.clientWidth, h = el.clientHeight;
    const points = [[2, 2], [w - 2, 2], [w - 2, h - 2], [2, h - 2], [w / 2, h / 2]];
    const renderer = el.dataset.mlRenderer;
    if (renderer === 'webgl') {
      const canvas = el.querySelector('canvas'), ctx = canvas.getContext('2d');
      return { renderer, alpha: points.map(([x, y]) => ctx.getImageData(Math.floor(x * canvas.width / w), Math.floor(y * canvas.height / h), 1, 1).data[3]) };
    }
    const face = el.querySelector(':scope > svg > path');
    return { renderer, alpha: points.map(([x, y]) => face.isPointInFill(new DOMPoint(x, y)) ? 255 : 0) };
  });
  if (expectedRenderer) assert.equal(result.renderer, expectedRenderer, message);
  for (const [i, alpha] of result.alpha.entries()) {
    assert(rounded[i] ? alpha === 0 : alpha > 8, message + ' ' + JSON.stringify(result));
  }
}

async function listGallery(page) {
  await page.goto(new URL('index.html#list', root).href);
  await page.addStyleTag({ content: ':root { --ml-radius-lg: 20px }' });
  for (const kind of ['group', 'item']) {
    await select(page, 'list-kind', kind);
    const host = kind === 'group' ? page.locator('#list-specimen ml-list-group').first() : page.locator('#list-specimen > ml-list-item:visible');
    const body = host.locator(kind === 'group' ? ':scope > ul' : ':scope > .ml-list-row');
    await body.scrollIntoViewIfNeeded();
    const box = await body.boundingBox();
    await page.mouse.move(box.x + 12, box.y + 12);
    for (const theme of ['light', 'warm', 'dark']) {
      await select(page, 'theme', theme);
      for (const material of grades) {
        await select(page, 'material', material);
        for (const motion of grades) {
          await select(page, 'motion', motion);
          await frames(page);
          const state = await body.evaluate(el => {
            const host = el.parentElement, lens = host.querySelector(':scope > .ml-optical');
            const box = el.getBoundingClientRect(), light = lens?.getBoundingClientRect();
            return {
              surface: getComputedStyle(host, '::before').borderRadius, content: getComputedStyle(el).borderRadius,
              lens: lens && getComputedStyle(lens).borderRadius,
              fits: light && ['x', 'y', 'width', 'height'].every(key => Math.abs(box[key] - light[key]) <= 1),
              rowLenses: el.querySelectorAll('li > ml-list-item > .ml-optical').length,
            };
          });
          const label = [kind, theme, material, motion].join('/');
          assert.equal(state.surface, '20px', label);
          assert.equal(state.content, state.surface, label);
          assert.equal(state.rowLenses, 0, label);
          assert.equal(state.lens, material === 'high' || motion === 'high' ? state.surface : null, label);
          if (state.lens) assert(state.fits, label);
        }
      }
    }
    await checkPaint(host.locator(':scope > .ml-optical'), [true, true, true, true], kind);
  }
  await select(page, 'list-row-kind', 'detail');
  await select(page, 'list-density', 'compact');
  await page.setViewportSize({ width: 320, height: 800 });
  const summary = page.locator('#list-specimen > ml-list-item:visible summary');
  await summary.focus();
  await summary.press('Enter');
  assert(await summary.evaluate(el => el.parentElement.open && getComputedStyle(el).outlineStyle === 'solid'));
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
}

async function standalone(page) {
  await page.setContent('<body data-ml-material="high" data-ml-motion="base"><main>' +
    '<ml-list-item><button class="ml-list-row">记录</button></ml-list-item>' +
    '<ml-list-group><h2>记录</h2><ol><li></li></ol><p class="ml-list-note">备注</p></ml-list-group></main>');
  await page.addStyleTag({ path: fileURLToPath(new URL('dist/components/list/list.css', root)) });
  await page.addScriptTag({ path: fileURLToPath(new URL('dist/components/list/list.js', root)) });
  const item = page.locator('main > ml-list-item'), lens = item.locator(':scope > .ml-optical');
  await checkPaint(lens, [true, true, true, true], 'standalone');
  await page.addStyleTag({ path: fileURLToPath(new URL('dist/components/button/button.css', root)) });
  await checkPaint(lens, [true, true, true, true], 'later standalone CSS');
  await page.locator('main').evaluate(el => el.style.setProperty('--ml-list-radius', 'calc(1% + 12px) 0 24px 0 / 20px 0 50% 0'));
  await frames(page);
  await checkPaint(lens, [true, false, true, false], 'updated scoped token');
  await page.locator('body').evaluate(el => { el.dataset.mlMaterial = 'low'; el.dataset.mlMotion = 'high'; });
  await item.locator(':scope > [data-ml-light="low"]').waitFor({ state: 'attached' });
  await item.evaluate(el => document.querySelector('li').append(el.cloneNode(true)));
  await frames(page);
  assert.equal(await page.locator('ml-list-group > .ml-optical').count(), 1);
  assert.equal(await page.locator('li > ml-list-item > .ml-optical').count(), 0);
  await page.locator('li > ml-list-item').evaluate(el => el.closest('main').append(el));
  await frames(page);
  assert.equal(await page.locator('main > ml-list-item > [data-ml-light="low"]').count(), 2);
}

async function joinedSurfaces(page, renderer) {
  await page.goto(new URL('index.html#data-table', root).href);
  await select(page, 'material', 'high');
  await select(page, 'motion', 'base');
  const footer = page.locator('#data-table-specimen ml-data-table > ml-pagination');
  await footer.scrollIntoViewIfNeeded();
  await frames(page);
  await checkPaint(footer.locator(':scope > .ml-optical'), [false, false, true, true], 'table footer', renderer);
  await page.goto(new URL('index.html#drawer', root).href);
  const drawer = page.locator('#drawer-specimen ml-drawer');
  await drawer.evaluate(el => el.showModal());
  const layer = drawer.locator('dialog > .ml-optical');
  for (const [placement, dir, rounded] of [
    ['end', 'ltr', [true, false, false, true]], ['start', 'ltr', [false, true, true, false]],
    ['start', 'rtl', [true, false, false, true]], ['bottom', 'rtl', [true, true, false, false]],
  ]) {
    await drawer.evaluate((el, [placement, dir]) => { el.placement = placement; el.dir = dir; }, [placement, dir]);
    await frames(page);
    await checkPaint(layer, rounded, 'drawer ' + placement + '/' + dir, renderer);
  }
  await page.keyboard.press('Escape');
  assert.equal(await drawer.evaluate(el => el.open), false);
}

try {
  const context = await browser.newContext({ viewport: { width: 1260, height: 900 } });
  const errors = [];
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  await listGallery(await context.newPage());
  await standalone(await context.newPage());
  await joinedSurfaces(await context.newPage(), engine === chromium ? 'webgl' : undefined);
  const fallback = await context.newPage();
  await fallback.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (name, ...args) {
      return name === 'webgl' ? null : getContext.call(this, name, ...args);
    };
  });
  await joinedSurfaces(fallback, 'svg');
  await fallback.goto(new URL('index.html#list', root).href);
  await select(fallback, 'list-kind', 'group');
  const group = fallback.locator('#list-specimen ml-list-group').first();
  await group.scrollIntoViewIfNeeded();
  await frames(fallback);
  const layer = group.locator(':scope > .ml-optical');
  await checkPaint(layer, [true, true, true, true], 'list fallback', 'svg');
  await select(fallback, 'motion', 'high');
  await select(fallback, 'material', 'low');
  await group.locator(':scope > [data-ml-light="low"]').waitFor({ state: 'attached' });
  await fallback.emulateMedia({ reducedMotion: 'reduce' });
  await layer.waitFor({ state: 'detached' });
  await fallback.emulateMedia({ forcedColors: 'active' });
  await select(fallback, 'material', 'high');
  await frames(fallback);
  assert.equal(await layer.count(), 0);
  assert.deepEqual(errors, []);
  console.log(engine.name() + ': verified 48 appearances for each list layout, standalone CSS order, live corner overrides, table footers and docked drawers.');
} finally {
  await browser.close();
}
