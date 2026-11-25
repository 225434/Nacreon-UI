import { launchBrowser } from './helpers/browser.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, firefox } from 'playwright';

const engine = process.argv[2] === 'firefox' ? firefox : chromium;
const browser = await launchBrowser(engine);
const root = new URL('../', import.meta.url);
const temp = await mkdtemp(join(tmpdir(), 'ml-foundation-test-'));
const file = join(temp, 'example.html');
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1200, height: 960 }, reducedMotion: 'no-preference' });
  context.on('page', p => p.on('pageerror', e => errors.push(e.message)));
  const page = await context.newPage(), example = await context.newPage();
  const route = name => page.goto(new URL('index.html#' + name, root).href);
  const set = (name, value) => page.locator('input[name="' + name + '"][value="' + value + '"]').evaluate(el => el.click());
  const css = (locator, prop) => locator.evaluate((el, key) => getComputedStyle(el).getPropertyValue(key).trim(), prop);
  async function snippet() {
    await page.locator('#open-code').click();
    const text = await page.locator('#code-sample').textContent();
    await page.locator('#close-code').click();
    return text;
  }
  async function render(html) {
    const base = '<base href="' + root.href + '">';
    const document = html.startsWith('<!doctype') ? html.replace('<head>', '<head>' + base)
      : '<!doctype html><html lang="zh-CN"><meta charset="utf-8">' + base + html + '</html>';
    await writeFile(file, document);
    await example.goto(pathToFileURL(file).href);
    return example;
  }

  await route('switch');
  const links = page.locator('#component-catalog section').filter({ has: page.getByRole('heading', { name: '设计资源', includeHidden: true }) }).locator('a');
  assert.equal(await links.count(), 7);
  await page.locator('#open-catalog').click();
  await page.getByRole('dialog', { name: '导航面板' }).getByRole('searchbox').fill('字体栈');
  await page.getByRole('dialog', { name: '导航面板' }).getByRole('searchbox').press('Enter');
  await page.locator('#typography-specimen').waitFor({ state: 'visible' });
  assert.equal(await page.locator('input[name="type-role"]').count(), 8);
  await set('type-role', 'title');
  const title = page.locator('#type-live');
  const titleMetrics = () => title.evaluate(el => {
    const style = getComputedStyle(el);
    return [Number((parseFloat(style.lineHeight) / parseFloat(style.fontSize)).toFixed(2)), parseFloat(style.letterSpacing) || 0];
  });
  assert.deepEqual(await titleMetrics(), [1.32, 0]);
  await title.evaluate(el => { el.lang = 'en'; });
  const [latinLeading, latinTracking] = await titleMetrics();
  assert(latinLeading < 1.32 && latinTracking < 0);
  await title.evaluate(el => el.removeAttribute('lang'));
  await set('type-role', 'code');
  assert.match(await css(page.locator('#type-live'), 'font-family'), /mono|Consolas/i);
  await set('type-role', 'metric');
  assert.match(await css(page.locator('#type-live'), 'font-variant-numeric'), /tabular-nums/);
  await set('type-family', 'serif');
  await page.locator('#type-text').fill('山野 < A & B > 128.64');
  await render(await snippet());
  assert.equal(await example.locator('[data-ml-type="metric"]').textContent(), '山野 < A & B > 128.64');
  assert.match(await css(example.locator('[data-ml-type="metric"]'), 'font-family'), /Georgia/);
  assert.equal(await css(example.locator('[data-ml-type="metric"]'), 'font-size'), await css(page.locator('#type-live'), 'font-size'));
  await set('type-role', 'body');
  await example.addStyleTag({ content: ':root { font-size: 24px; }' });
  await example.locator('[data-ml-type]').evaluate(el => el.dataset.mlType = 'body');
  assert.equal(await css(example.locator('[data-ml-type]'), 'font-size'), '24px');
  await page.locator('#type-text').fill('');
  assert.equal(await page.locator('#type-live').textContent(), await page.locator('#type-text').getAttribute('placeholder'));

  await route('tokens-examples');
  const rows = page.locator('#token-list .token-row'), search = page.locator('#token-search');
  const keys = await rows.locator('code:first-of-type').allTextContents();
  assert.equal(keys.length, new Set(keys).size);
  assert(keys.length >= 70);
  for (const key of ['space-4', 'radius-md', 'shadow-raised', 'font-mono', 'leading-title', 'tracking-title', 'control-height',
    'control-padding-inline', 'row-padding-block', 'row-padding-block-compact', 'color-action', 'color-focus', 'color-control-border',
    'color-on-action', 'color-selection', 'color-surface-inset', 'color-surface-raised', 'material-fill-opacity', 'material-content-opacity', 'travel']) assert(keys.includes('--ml-' + key));
  assert.equal(await css(page.locator('#token-demo'), 'gap'), '16px');
  await search.fill('surface');
  assert.equal(await page.locator('#token-ref').textContent(), 'var(--ml-color-surface)');
  const surfaceValues = [];
  for (const theme of ['light', 'warm', 'dark']) {
    await set('theme', theme);
    const value = await page.locator('#token-value').textContent();
    assert.equal(value, await css(page.locator('html'), '--ml-color-surface'));
    surfaceValues.push(value);
  }
  assert.equal(new Set(surfaceValues).size, 3);
  function luminance(hex) {
    assert.match(hex, /^#[0-9a-f]{6}$/i);
    const [r, g, b] = hex.slice(1).match(/../g).map(channel => {
      const srgb = Number.parseInt(channel, 16) / 255;
      return srgb <= .04045 ? srgb / 12.92 : ((srgb + .055) / 1.055) ** 2.4;
    });
    return .2126 * r + .7152 * g + .0722 * b;
  }
  for (const theme of ['light', 'warm', 'dark']) {
    await set('theme', theme);
    const palette = await page.locator('html').evaluate(el => {
      const style = getComputedStyle(el);
      return Object.fromEntries([...style].filter(key => key.startsWith('--ml-color-')).map(key => [key.slice(11), style.getPropertyValue(key).trim()]));
    });
    assert.equal(Object.keys(palette).length, 31);
    const contrast = (ink, paper) => {
      const a = luminance(palette[ink]), b = luminance(palette[paper]);
      return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    };
    for (const paper of ['background', 'surface', 'surface-raised', 'surface-inset', 'selection']) {
      for (const ink of ['text', 'text-secondary', 'text-tertiary']) assert(contrast(ink, paper) >= 4.5, [theme, ink, paper].join('/'));
    }
    for (const paper of ['background', 'surface', 'surface-raised']) {
      for (const ink of ['focus', 'control-border']) assert(contrast(ink, paper) >= 3, [theme, ink, paper].join('/'));
    }
    assert(contrast('on-action', 'action') >= 4.5, theme + ' primary action');
  }
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.testCopy = text; } } });
  });
  await page.locator('#copy-token').click();
  assert.equal(await page.evaluate(() => window.testCopy), 'var(--ml-color-surface)');
  await render(await snippet());
  assert.equal(await css(example.locator('.token-demo'), 'background-color'), await css(page.locator('#token-demo'), 'background-color'));
  await search.fill('--ml-material-fill-opacity');
  for (const [grade, expected] of [['base', '100%'], ['low', '100%'], ['medium', '40%'], ['high', '40%']]) {
    await set('material', grade);
    assert.equal(await page.locator('#token-value').textContent(), expected);
  }
  await search.fill('位移时长');
  for (const [grade, expected] of [['base', '0s'], ['low', '0s'], ['medium', '200ms'], ['high', '420ms']]) {
    await set('motion', grade);
    assert.equal(await page.locator('#token-value').textContent(), expected);
  }
  await page.locator('#token-play').click();
  await page.waitForFunction(() => {
    const track = document.getElementById('token-demo'), dot = track.firstElementChild;
    return dot.getBoundingClientRect().left > track.getBoundingClientRect().left + track.clientWidth / 2;
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => document.getElementById('token-value').textContent === '0s');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await search.fill('');
  await page.locator('#token-group').selectOption('shape');
  assert.equal(await rows.count(), 8);
  await search.fill('missing-token');
  assert.equal(await rows.count(), 0);
  assert(await page.locator('#token-empty').isVisible());
  assert(await page.locator('#open-code').isDisabled());
  await search.fill('胶囊圆角');
  assert.equal(await rows.count(), 1);
  assert(await page.locator('#open-code').isEnabled());

  await route('materials');
  await set('material-surface', 'content');
  const reading = page.locator('#material-specimen ml-material');
  const alpha = locator => locator.evaluate(el => {
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
    ctx.fillStyle = getComputedStyle(el).backgroundColor;
    ctx.fillRect(0, 0, 1, 1);
    return ctx.getImageData(0, 0, 1, 1).data[3];
  });
  for (const [level, opacity] of [['high', .91], ['medium', .91], ['low', 1], ['base', 1]]) {
    await set('material', level);
    assert(Math.abs(await alpha(reading) - opacity * 255) <= 1, level + ' reading surface');
  }
  await set('material', 'high');
  await render(await snippet());
  assert.equal(await example.locator('ml-material').getAttribute('surface'), 'content');
  assert.equal(await alpha(example.locator('ml-material')), await alpha(reading));
  await set('material-surface', 'lens');
  assert.equal(await reading.getAttribute('surface'), null);
  assert(Math.abs(await alpha(reading) - .4 * 255) <= 1);
  const transparency = page.locator('#material-transparency');
  const adjust = (locator, value) => locator.evaluate((el, n) => { el.value = n; el.dispatchEvent(new Event('input', { bubbles: true })); }, String(value));
  for (const value of [0, 35, 100]) {
    await adjust(transparency, value);
    for (const level of ['high', 'medium', 'low', 'base']) {
      await set('material', level);
      const glass = level === 'high' || level === 'medium';
      assert.equal(await transparency.isVisible(), glass);
      assert(Math.abs(await alpha(reading) - (glass ? 1 - value / 100 : 1) * 255) <= 1, [level, value].join('/'));
    }
  }
  await set('material', 'medium');
  await set('light-source', 'fixed');
  await adjust(transparency, 35);
  await adjust(page.locator('#light-intensity'), 64);
  await page.reload();
  assert.equal(await transparency.inputValue(), '35');
  assert.equal(await page.locator('#light-intensity').inputValue(), '64');
  assert.equal(await page.locator('html').getAttribute('data-ml-light-source'), 'fixed');
  await render(await snippet());
  const exportedSurface = example.locator('ml-material');
  assert.equal(await css(exportedSurface, '--ml-light-source'), 'fixed');
  assert.equal(Number(await css(exportedSurface, '--ml-light-intensity')), .64);
  assert(Math.abs(await alpha(exportedSurface) - .65 * 255) <= 1);
  await page.locator('#reset-appearance').click();
  assert.equal(await transparency.inputValue(), '60');
  assert.equal(await page.locator('#light-intensity').inputValue(), '100');
  assert.equal(await page.locator('html').getAttribute('data-ml-light-source'), 'pointer');

  const controls = ['button', 'input', 'select', 'form'].map(name =>
    '<link rel="stylesheet" href="dist/components/' + name + '/' + name + '.css">' +
    '<script defer src="dist/components/' + name + '/' + name + '.js"></script>').join('');
  await render(controls + '<script defer src="dist/design/icons.js"></script><main data-ml-material="high">' +
    '<ml-button><button>保存</button></ml-button><ml-input><input aria-label="记录"></ml-input>' +
    '<ml-select><select aria-label="类别"><option>公开</option></select></ml-select>' +
    '<ml-form><form><label class="ml-form-field">名称<input></label></form></ml-form>' +
    '<ml-icon name="search" size="16"></ml-icon></main>');
  const fieldSizes = () => example.locator('ml-button > button, ml-input > input, ml-select, ml-select > select, .ml-form-field > input')
    .evaluateAll(els => els.map(el => el.getBoundingClientRect().height));
  assert.deepEqual(await fieldSizes(), [44, 44, 44, 44, 44]);
  await example.locator('main').evaluate(el => el.style.setProperty('--ml-control-height', '56px'));
  assert.deepEqual(await fieldSizes(), [56, 56, 56, 56, 56]);
  await example.locator('ml-select').evaluate(el => el.style.setProperty('--ml-select-height', '50px'));
  assert.deepEqual(await fieldSizes(), [56, 56, 50, 50, 56]);
  assert(Math.abs(await alpha(example.locator('ml-form')) - .91 * 255) <= 1);
  const strokes = await example.locator('ml-icon').evaluate(el => {
    const widths = [16, 20, 24, 48].map(size => Number(customElements.get('ml-icon').createSVG('search', { size, material: 'base' }).getAttribute('stroke-width')));
    const mask = decodeURIComponent(getComputedStyle(document.documentElement).getPropertyValue('--ml-input-icon-search'));
    return [Number(el.querySelector(':scope > svg').getAttribute('stroke-width')), ...widths, Number(mask.match(/stroke-width="([\d.]+)"/)[1])];
  });
  assert.deepEqual(strokes, [2, 2, 1.875, 1.75, 1.75, 2]);

  await route('themes');
  await set('theme-preset', 'warm');
  assert.equal(await page.locator('html').getAttribute('data-ml-theme'), 'warm');
  await page.reload();
  assert.equal(await page.locator('html').getAttribute('data-ml-theme'), 'warm');
  await set('theme-scope', 'local');
  await set('theme-preset', 'dark');
  const sample = page.locator('#themes-specimen');
  assert.equal(await css(sample, 'color-scheme'), 'dark');
  assert.equal(await css(page.locator('html'), 'color-scheme'), 'light');
  await set('theme', 'light');
  assert.equal(await sample.getAttribute('data-ml-theme'), 'dark');
  assert.equal(await css(sample.locator('ml-switch'), '--ml-color-action'), await css(sample, '--ml-color-blue'));
  await sample.getByRole('switch').click();
  await render(await snippet());
  assert.equal(await example.locator('html').getAttribute('data-ml-theme'), 'light');
  assert.equal(await css(example.locator('section'), 'background-color'), await css(sample, 'background-color'));
  assert.equal(await css(example.locator('article'), 'background-color'), await css(sample.locator('.theme-record'), 'background-color'));
  assert.equal(await css(example.locator('p:has([data-ml-type="metric"])'), 'background-color'), await css(sample.locator('.theme-measure'), 'background-color'));
  assert.equal(await example.getByRole('switch').getAttribute('aria-checked'), 'false');
  await example.getByRole('switch').click();
  assert.equal(await example.getByRole('switch').getAttribute('aria-checked'), 'true');
  await set('theme-scope', 'page');
  assert.equal(await sample.getAttribute('data-ml-theme'), null);
  assert.equal(await css(sample, '--ml-color-surface'), await css(page.locator('html'), '--ml-color-surface'));

  await render('<link rel="stylesheet" href="dist/design/tokens.css"><main data-ml-theme="dark" data-ml-motion="low" data-ml-material="medium">Sample</main>');
  const values = await example.locator('main').evaluate((el, keys) => keys.map(key => getComputedStyle(el).getPropertyValue(key).trim()), keys);
  assert(values.every(Boolean), keys.filter((_, i) => !values[i]).join(', '));
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 850 });
    for (const section of ['typography', 'tokens', 'themes']) {
      await route(section);
      if (section === 'typography') await page.locator('#type-text').fill('A'.repeat(180));
      if (section === 'tokens') {
        await page.locator('#token-group').selectOption('');
        await search.fill('--ml-font-sans');
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), section + ' at ' + width);
    }
  }
  await route('button');
  assert.equal(await page.locator('[data-resource]:visible').count(), 0);

  // A component on a host page and the same component in a fully themed document.
  await render('<style>body {font-family:serif} :root {--ml-font-sans:Arial; --ml-size-label:19px; --ml-size-title:33px; --ml-radius-pill:21px; --ml-focus-width:4px; --ml-focus-offset:6px}</style>' +
    '<link rel="stylesheet" href="dist/components/button/button.css"><script defer src="dist/components/button/button.js"></script>' +
    '<p id="host">宿主文字</p><p data-ml-type="title">报告</p><ml-button><button>保存</button></ml-button>' +
    '<section data-ml-font="mono"><ml-button style="--ml-button-font:17px"><button>复制编号</button></ml-button></section>');
  const button = example.getByRole('button', { name: '保存' });
  assert.equal(await css(example.locator('#host'), 'font-family'), 'serif');
  assert.equal(await css(button, 'font-family'), 'Arial');
  assert.equal(await css(button, 'font-size'), '19px');
  assert.equal(await css(example.locator('ml-button').first(), 'border-top-left-radius'), '21px');
  assert.equal(await css(example.locator('[data-ml-type="title"]'), 'font-size'), '33px');
  const localButton = example.getByRole('button', { name: '复制编号' });
  assert.match(await css(localButton, 'font-family'), /mono|Consolas/i);
  assert.equal(await css(localButton, 'font-size'), '17px');
  await example.keyboard.press('Tab');
  assert(await button.evaluate(el => el.matches(':focus-visible')));
  assert.equal(await css(button, 'outline-width'), '4px');
  assert.equal(await css(button, 'outline-offset'), '6px');

  await render('<link rel="stylesheet" href="dist/design/global.css"><link rel="stylesheet" href="dist/components/tag/tag.css">' +
    '<h1>工作区</h1><textarea>记录</textarea><small>备注</small><code>DEMO-104</code>' +
    '<section data-ml-theme="dark" data-ml-theme-surface style="--ml-space-2:13px; --ml-shadow-raised:0 2px 7px blue">' +
    '<div class="ml-tag-group"><ml-tag>进行中</ml-tag></div><i id="shadow"></i></section>');
  await example.locator('html').evaluate(el => {
    el.dataset.mlTheme = 'warm';
    el.dataset.mlMaterial = 'medium';
    el.style.cssText = '--ml-font-sans:Arial; --ml-size-body:18px; --ml-size-caption:15px; --ml-size-title:35px';
  });
  assert.equal(await css(example.locator('h1'), 'font-size'), '35px');
  assert.equal(await css(example.locator('textarea'), 'font-size'), '18px');
  assert.equal(await css(example.locator('textarea'), 'font-family'), 'Arial');
  assert.equal(await css(example.locator('small'), 'font-size'), '15px');
  assert.match(await css(example.locator('code'), 'font-family'), /mono|Consolas/i);
  assert.notEqual(await css(example.locator('body'), 'background-color'), await css(example.locator('section'), 'background-color'));
  assert.equal(await css(example.locator('section'), 'color-scheme'), 'dark');
  assert.equal(await css(example.locator('.ml-tag-group'), 'gap'), '13px');
  await example.locator('#shadow').evaluate(el => el.style.boxShadow = 'var(--ml-shadow-raised)');
  assert.equal(await css(example.locator('ml-tag'), 'box-shadow'), await css(example.locator('#shadow'), 'box-shadow'));
  assert.match(await css(example.locator('ml-tag'), '--ml-tag-mark'), /data:image\/svg/);

  await page.setViewportSize({ width: 320, height: 850 });
  await set('theme', 'dark');
  await set('motion', 'base');
  await set('material', 'base');
  await page.addStyleTag({ content: ':root { --ml-size-display:32px }' });
  const routes = await page.locator('#catalog-links a').evaluateAll(items => items.map(link => link.hash.slice(1)));
  for (const name of routes) {
    await route(name);
    await page.waitForFunction(s => document.documentElement.dataset.component === s, name);
    assert.equal(await css(page.locator('#component-title'), 'font-size'), '32px', name);
    assert.equal(await css(page.locator('html'), 'color-scheme'), 'dark', name);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name);
    if (name === 'hover-card' || name === 'dialog') {
      await render(await snippet());
      assert(await example.locator('svg path, svg circle').count() > 0, 'Offline glyph in ' + name);
      assert.equal(await example.locator('ml-icon, use[href^="#i-"]').count(), 0, name);
    }
  }
  assert.deepEqual(errors, []);
  console.log(engine.name() + ': verified ' + routes.length + ' gallery pages, seven design resources, ' + keys.length + ' live tokens, standalone components and document defaults.');
} finally {
  await browser.close();
  await unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; });
  await rmdir(temp);
}
