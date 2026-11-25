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
const temp = await mkdtemp(join(tmpdir(), 'ml-loading-test-'));
const file = join(temp, 'example.html');
const grades = ['base', 'low', 'medium', 'high'];

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  context.setDefaultTimeout(8000);
  const errors = [];
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  const page = await context.newPage();
  const route = name => page.goto(new URL('index.html#' + name, root).href);
  const select = (name, value) => page.locator('input[name="' + name + '"][value="' + value + '"]').evaluate(el => el.click());
  const frames = () => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  const animation = (locator, pseudo = null) => locator.evaluate((el, part) => getComputedStyle(el, part).animationName, pseudo);
  const focused = target => target.evaluate(el => el === document.activeElement);
  const snippet = async () => {
    await page.locator('#open-code').click();
    const code = await page.locator('#code-sample').textContent();
    await page.locator('#close-code').click();
    return code;
  };

  await route('switch');
  await page.locator('#open-catalog').click();
  await page.getByRole('dialog', { name: '导航面板' }).getByRole('searchbox').fill('骨架屏');
  await page.getByRole('dialog', { name: '导航面板' }).getByRole('searchbox').press('Enter');
  const stage = page.locator('#loading-specimen');
  const panel = stage.locator('ml-material');
  const body = stage.locator('#loading-preview-body');
  const spinner = stage.locator('ml-spinner');
  const skeleton = stage.locator('ml-skeleton');
  const firstShape = skeleton.locator('.ml-skeleton-shape').first();
  const ring = spinner.locator('.ml-spinner-ring');
  const dots = spinner.locator('.ml-spinner-dots');
  const toggle = page.locator('#loading-toggle');
  await stage.waitFor({ state: 'visible' });
  assert.match(await page.title(), /通用加载状态/);
  assert(await ring.isVisible());
  await select('spinner-variant', 'dots');
  assert(await dots.isVisible());
  assert.equal(await dots.locator('i').count(), 3);
  assert(!(await ring.isVisible()));
  await toggle.press('Enter');
  assert(await focused(toggle));
  assert.equal(await body.getAttribute('aria-busy'), 'false');
  assert.equal(await spinner.evaluate(el => el.getAnimations({ subtree: true }).length), 0);
  await select('spinner-variant', 'ring');
  assert.equal(await body.getAttribute('aria-busy'), 'true');
  await select('loading-kind', 'skeleton');

  const layer = panel.locator(':scope > .ml-optical');
  for (const theme of ['light', 'warm', 'dark']) {
    await select('theme', theme);
    for (const material of grades) {
      await select('material', material);
      for (const motion of grades) {
        await select('motion', motion);
        await frames();
        assert.equal(await animation(ring), motion === 'base' ? 'none' : motion === 'low' ? 'ml-loading-fade' : 'ml-loading-turn');
        assert.equal(await animation(firstShape), motion === 'low' ? 'ml-skeleton-breathe' : 'none');
        assert.equal(await animation(firstShape, '::after'), ['medium', 'high'].includes(motion) ? 'ml-skeleton-sweep' : 'none');
        assert.equal(await layer.count(), 1, [theme, material, motion].join('/'));
      }
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await animation(ring), 'none');
  assert.equal(await animation(firstShape, '::after'), 'none');
  await page.emulateMedia({ forcedColors: 'active' });
  await layer.waitFor({ state: 'detached' });
  assert.equal(await firstShape.evaluate(el => getComputedStyle(el).borderTopStyle), 'solid');
  await page.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'none' });

  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 960 });
    for (const preset of ['list', 'card', 'table']) {
      await select('skeleton-preset', preset);
      const height = (await body.boundingBox()).height;
      await toggle.press('Enter');
      assert(await focused(toggle));
      assert.equal(await body.getAttribute('aria-busy'), 'false');
      assert(!(await skeleton.isVisible()));
      assert(Math.abs((await body.boundingBox()).height - height) <= 1, 'height changed at ' + width + ' for ' + preset);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await toggle.press('Space');
      assert(await skeleton.isVisible());
    }
  }

  const sync = page.locator('#loading-sync-example');
  const list = page.locator('#loading-list-example');
  const refresh = list.getByRole('button', { name: '刷新列表' });
  await sync.getByRole('button', { name: '同步目录' }).press('Enter');
  assert(await sync.locator('ml-spinner').isVisible());
  assert.equal(await sync.getByRole('status').textContent(), '正在同步示例目录');
  await refresh.press('Enter');
  const listArea = list.locator('#loading-list-content');
  assert(await listArea.locator('ml-skeleton').isVisible());
  assert.equal(await listArea.getAttribute('aria-busy'), 'true');
  assert.equal(await refresh.getAttribute('aria-disabled'), 'true');
  await listArea.getByRole('list').waitFor({ state: 'visible' });
  assert.equal(await listArea.getAttribute('aria-busy'), 'false');
  assert.equal(await refresh.getAttribute('aria-disabled'), null);
  assert(await focused(refresh));
  assert(!(await sync.locator('ml-spinner').isVisible()));
  assert.equal(await sync.getByRole('status').textContent(), '已同步 12 份示例文件');

  const tableCode = await snippet();
  await select('loading-kind', 'spinner');
  await select('spinner-variant', 'dots');
  const spinnerCode = await snippet();
  const example = await context.newPage();
  const render = async code => {
    await writeFile(file, '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><base href="' + root.href + '">' + code);
    await example.goto(pathToFileURL(file).href);
  };

  await render(spinnerCode);
  const exportedSpinner = example.locator('ml-spinner');
  assert(await exportedSpinner.locator('.ml-spinner-dots').isVisible());
  assert.equal((await example.getByRole('status').textContent()).trim(), '正在读取素材记录');
  await exportedSpinner.evaluate(el => el.setAttribute('label', '正在重试'));
  assert.equal((await example.getByRole('status').textContent()).trim(), '正在重试');

  await render(tableCode);
  const exportedSkeleton = example.locator('ml-skeleton');
  assert.equal(await exportedSkeleton.getAttribute('preset'), 'table');
  assert.equal(await exportedSkeleton.getAttribute('aria-hidden'), 'true');
  assert.equal(await exportedSkeleton.getAttribute('inert'), '');
  await exportedSkeleton.evaluate(el => { el.setAttribute('rows', '5'); el.setAttribute('columns', '2'); });
  assert.equal(await exportedSkeleton.locator('.ml-skeleton-row').count(), 6);
  assert.equal(await exportedSkeleton.locator('.ml-skeleton-shape').count(), 12);
  await exportedSkeleton.evaluate(el => {
    el.removeAttribute('preset');
    el.innerHTML = '<span class="ml-skeleton-shape" data-shape="circle" style="--ml-skeleton-size:24px"></span>' +
      '<span class="ml-skeleton-shape" data-shape="block" style="--ml-skeleton-height:48px"></span>';
  });
  const shapes = exportedSkeleton.locator('.ml-skeleton-shape');
  assert.deepEqual(await shapes.evaluateAll(items => items.map(item => item.offsetHeight)), [24, 48]);
  assert.deepEqual(errors, []);
  console.log(engine.name() + ': verified loading states, 48 appearances, stable skeleton layout, reduced motion, and offline examples.');
} finally {
  await browser.close();
  await unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; });
  await rmdir(temp);
}
