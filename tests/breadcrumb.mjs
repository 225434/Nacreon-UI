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
const temp = await mkdtemp(join(tmpdir(), 'ml-breadcrumb-'));
const file = join(temp, 'example.html');
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 940 } });
  context.on('page', page => {
    page.setDefaultTimeout(12000);
    page.on('pageerror', error => errors.push(error.message));
  });
  const page = await context.newPage();
  await page.goto(new URL('index.html#breadcrumb', root).href);
  const specimen = page.locator('#breadcrumb-specimen');
  const crumb = specimen.locator('ml-breadcrumb');
  const trail = crumb.getByRole('navigation', { name: '当前位置' });
  const more = trail.getByRole('button', { name: '更多层级' });
  const panel = crumb.locator('ml-breadcrumb-panel');
  const opened = name => panel.locator('ol').getByRole('link', { name, exact: true });
  const current = trail.locator('[aria-current="page"]');
  const title = specimen.locator('h3');
  const width = value => page.locator('input[name="breadcrumb-width"][value="' + value + '"]').evaluate(input => input.click());
  const set = (name, value) => page.locator('input[name="' + name + '"][value="' + value + '"]').evaluate(input => input.click());
  const labels = scope => scope.locator('a[href]').allTextContents();
  const focused = item => item.evaluate(el => el === el.getRootNode().activeElement);

  await specimen.waitFor();
  assert.equal(await page.locator('#catalog-current').textContent(), '面包屑导航');
  assert.equal(await current.textContent(), '拍摄照片');
  assert.deepEqual(await labels(trail), ['素材档案', '主题目录', '风景合集', '专题相册', '湖泊精选']);
  assert.equal(await more.count(), 0);
  await trail.getByRole('link', { name: '风景合集', exact: true }).evaluate(link => {
    link.addEventListener('click', () => { window.originalLinkClicked = true; });
  });

  await width('compact');
  await more.waitFor();
  assert(await more.evaluate(el => el.getBoundingClientRect().width) >= 38);
  assert.deepEqual(await trail.locator(':scope > ol > li > a').allTextContents(), ['素材档案']);
  assert.equal(await panel.isVisible(), false);
  await more.focus();
  await page.keyboard.press('Enter');
  await crumb.locator('ml-breadcrumb-panel:popover-open[data-side]').waitFor();
  assert.equal(await more.getAttribute('aria-expanded'), 'true');
  assert.deepEqual(await labels(panel), ['主题目录', '风景合集', '专题相册', '湖泊精选']);
  await page.keyboard.press('Tab');
  assert.equal(await focused(opened('主题目录')), true);
  await page.keyboard.press('Escape');
  await panel.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.querySelector('#breadcrumb-specimen .ml-breadcrumb-overflow button')?.getAttribute('aria-expanded') === 'false');
  assert.equal(await focused(more), true);

  await more.click();
  await opened('风景合集').click();
  assert.equal(await page.evaluate(() => window.originalLinkClicked), true);
  assert.equal(await current.textContent(), '风景合集');
  assert.equal(await title.textContent(), '风景合集');
  assert.equal(await focused(title), true);
  assert.equal(new URL(page.url()).hash, '#breadcrumb');
  await specimen.getByRole('link', { name: '进入专题相册' }).click();
  assert.equal(await current.textContent(), '专题相册');
  await page.locator('#breadcrumb-tools button').click();
  assert.equal(await current.textContent(), '拍摄照片');

  await more.click();
  await opened('湖泊精选').focus();
  await width('wide');
  await more.waitFor({ state: 'hidden' });
  assert.equal(await focused(trail.getByRole('link', { name: '湖泊精选' })), true);
  assert.deepEqual(await labels(trail), ['素材档案', '主题目录', '风景合集', '专题相册', '湖泊精选']);

  const colors = new Set();
  for (const theme of ['light', 'warm', 'dark']) {
    await set('theme', theme);
    colors.add(await crumb.evaluate(el => getComputedStyle(el).getPropertyValue('--ml-color-surface').trim()));
    for (const material of ['base', 'low', 'medium', 'high']) {
      await set('material', material);
      for (const motion of ['base', 'low', 'medium', 'high']) {
        await set('motion', motion);
        assert.deepEqual(await crumb.evaluate(el => {
          const style = getComputedStyle(el);
          return ['--ml-material-level', '--ml-motion-level'].map(property => style.getPropertyValue(property).trim());
        }), [material, motion]);
      }
    }
  }
  assert.equal(colors.size, 3);

  await page.setViewportSize({ width: 320, height: 840 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await more.click();
  await crumb.locator('ml-breadcrumb-panel:popover-open[data-side]').waitFor();
  assert.equal(await panel.evaluate(el => getComputedStyle(el).animationName), 'none');
  assert(await panel.evaluate(el => {
    const rect = el.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight;
  }));
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await title.click({ position: { x: 1, y: 1 } });
  await panel.waitFor({ state: 'hidden' });

  await width('compact');
  await page.locator('#open-code').click();
  const snippet = await page.locator('#code-sample').textContent();
  assert.match(snippet, /aria-current="page"/);
  assert.doesNotMatch(snippet, /class="ml-breadcrumb-overflow"/);
  await writeFile(file, '<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><base href="' + root.href + '">' + snippet);
  const copy = await context.newPage();
  await copy.setViewportSize({ width: 320, height: 340 });
  await copy.goto(pathToFileURL(file).href);
  await copy.addStyleTag({ content: 'ml-breadcrumb { position: fixed; inset-inline-start: 8px; bottom: 8px; }' });
  await copy.getByRole('button', { name: '更多层级' }).click();
  await copy.locator('ml-breadcrumb-panel:popover-open[data-side="above"]').waitFor();
  await copy.getByRole('link', { name: '专题相册' }).click();
  assert.equal(new URL(copy.url()).hash, '#breadcrumb-demo-collections-overview');
  await copy.locator('ml-breadcrumb-panel').waitFor({ state: 'hidden' });

  const fallback = await context.newPage();
  await fallback.setViewportSize({ width: 320, height: 600 });
  await fallback.addInitScript(() => { HTMLElement.prototype.showPopover = undefined; });
  await fallback.goto(pathToFileURL(file).href);
  assert.equal(await fallback.getByRole('button', { name: '更多层级' }).count(), 0);
  assert.equal(await fallback.getByRole('navigation').getByRole('link').count(), 5);
  assert(await fallback.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

  assert.deepEqual(errors, []);
  console.log(engine.name() + ': verified breadcrumb navigation, adaptive folding, keyboard focus, 48 appearances, and offline fallback');
} finally {
  await browser.close();
  await unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; });
  await rmdir(temp);
}
