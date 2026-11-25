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
const temp = await mkdtemp(join(tmpdir(), 'ml-multi-test-'));
const file = join(temp, 'sample.html');
const grades = ['base', 'low', 'medium', 'high'];

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  context.setDefaultTimeout(8000);
  const errors = [];
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  const page = await context.newPage();
  const route = name => page.goto(new URL('index.html#' + name, root).href);
  const choose = (name, value) => page.locator('input[name="' + name + '"][value="' + value + '"]').evaluate(el => el.click());
  const values = field => field.evaluate(el => el.values);
  const focused = locator => locator.evaluate(el => el === el.ownerDocument.activeElement);
  const frames = () => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));

  await route('switch');
  await page.locator('#open-catalog').click();
  await page.getByRole('dialog', { name: '导航面板' }).getByRole('searchbox').fill('搜索多选');
  await page.getByRole('dialog', { name: '导航面板' }).getByRole('searchbox').press('Enter');
  const field = page.locator('#multi-select-specimen ml-multi-select');
  const trigger = field.getByRole('button', { name: '主题相册', exact: true });
  const panel = field.locator('ml-multi-picker');
  const search = panel.getByRole('searchbox');
  const list = panel.getByRole('listbox');
  await trigger.waitFor({ state: 'visible' });
  assert.deepEqual(await values(field), ['A-01', 'B-01']);

  await trigger.press('ArrowDown');
  assert(await focused(search));
  assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
  assert.equal(await list.getAttribute('aria-multiselectable'), 'true');
  await search.fill('山野 Ａ０２');
  assert.deepEqual(await list.getByRole('option').allTextContents(), ['山林晨雾']);
  await search.press('Enter');
  assert.deepEqual(await values(field), ['A-01', 'A-02', 'B-01']);
  assert.equal(await list.getByRole('option').getAttribute('aria-selected'), 'true');
  await search.fill('无此相册');
  assert(await panel.getByText('没有匹配的选项').isVisible());
  await search.press('Enter');
  assert.deepEqual(await values(field), ['A-01', 'A-02', 'B-01']);
  await search.fill('');
  await search.press('ArrowDown');
  assert(await focused(list));
  await list.press('End');
  assert.equal(await list.locator('[data-active]').textContent(), '城市夜色');
  assert.equal(await list.getByRole('option', { name: '已停用相册' }).getAttribute('aria-disabled'), 'true');
  await list.press('Space');
  assert(await field.getByText('+1', { exact: true }).isVisible());
  await list.press('Escape');
  assert(await focused(trigger));
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
  await field.getByRole('button', { name: '移除山林晨雾' }).press('Enter');
  assert.deepEqual(await values(field), ['A-01', 'B-01', 'C-01']);
  assert(await focused(field.getByRole('button', { name: '移除海岸峭壁' })));

  await trigger.click();
  await trigger.click();
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
  await page.locator('label[for="multi-preview-sites"]').click();
  assert(await focused(search));
  const surface = field.locator(':scope > .ml-optical');
  const popupLight = panel.locator(':scope > .ml-optical');
  for (const theme of ['light', 'warm', 'dark']) {
    await choose('theme', theme);
    for (const material of grades) {
      await choose('material', material);
      for (const motion of grades) {
        await choose('motion', motion);
        await frames();
        assert.equal(await surface.count(), 1, [theme, material, motion].join('/'));
        assert.equal(await popupLight.count(), 1, [theme, material, motion].join('/'));
        assert(await popupLight.evaluate(el => getComputedStyle(el).borderRadius === getComputedStyle(el.parentElement).borderRadius));
      }
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
  await popupLight.waitFor({ state: 'detached' });
  assert.equal(await panel.evaluate(el => getComputedStyle(el).transform), 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'none' });
  await search.press('Escape');
  await choose('multi-select-state', 'disabled');
  assert(await trigger.isDisabled());
  await choose('multi-select-state', 'enabled');

  await choose('motion', 'base');
  await page.setViewportSize({ width: 320, height: 425 });
  await field.evaluate(el => {
    window.scrollBy(0, el.getBoundingClientRect().bottom - innerHeight + 42);
  });
  await trigger.press('Enter');
  assert.equal(await panel.getAttribute('data-side'), 'above');
  const bounds = await panel.boundingBox();
  assert(bounds.x >= 0 && bounds.x + bounds.width <= 320);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await search.press('Escape');

  const form = page.locator('#multi-select-form');
  const submission = form.getByRole('button', { name: '查看提交值' });
  const formField = form.locator('ml-multi-select');
  const formTrigger = formField.locator('.ml-multi-trigger');
  await submission.click();
  assert(await formField.getByRole('alert').isVisible());
  assert(await focused(formTrigger));
  await formTrigger.press('Enter');
  await form.getByRole('option', { name: '山野' }).click();
  await form.getByRole('option', { name: '海岸' }).click();
  await form.getByRole('button', { name: '完成' }).click();
  assert(await focused(formTrigger));
  await submission.click();
  assert.equal(await form.locator('#multi-report-output').textContent(), '提交值 mountains、coast');
  await form.getByRole('button', { name: '重置' }).click();
  assert.deepEqual(await values(formField), []);

  const columns = page.locator('#multi-columns');
  await columns.locator('.ml-multi-trigger').click();
  await columns.getByRole('button', { name: '清空' }).click();
  assert.deepEqual(await values(columns), ['site']);
  assert.deepEqual(await page.locator('#multi-column-table').getByRole('columnheader').allTextContents(), ['相册']);
  await columns.getByRole('button', { name: '完成' }).click();

  await page.locator('#open-code').click();
  const code = await page.locator('#code-sample').textContent();
  await page.locator('#close-code').click();

  // The original searchable single select still commits one option and closes.
  await route('select');
  await choose('select-kind', 'search');
  const single = page.locator('#select-specimen > ml-select');
  await single.locator('select').press('ArrowDown');
  const originalSearch = single.locator('.ml-select-search input');
  await originalSearch.waitFor({ state: 'visible' });
  const original = single.locator('[role="option"]:not([aria-disabled="true"], [aria-selected="true"])').first();
  const label = (await original.textContent()).trim();
  await original.click();
  assert.equal(await single.evaluate(el => el.open), false);
  assert.equal(await single.locator('select').evaluate(el => el.selectedOptions[0].label), label);

  await writeFile(file, '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><base href="' + root.href + '">' + code);
  const example = await context.newPage();
  await example.goto(pathToFileURL(file).href);
  const exported = example.locator('ml-multi-select');
  assert.deepEqual(await values(exported), ['A-01', 'B-01', 'C-01']);
  await exported.evaluate(el => { el.values = ['A-03', 'B-02']; });
  assert.deepEqual(await values(exported), ['A-03', 'B-02']);
  await exported.locator('.ml-multi-trigger').press('Enter');
  assert.equal(await exported.getByRole('option', { name: '雪山倒影' }).getAttribute('aria-selected'), 'true');
  await example.addInitScript(() => { delete HTMLElement.prototype.showPopover; });
  await example.reload();
  assert(await exported.locator('select[multiple]').isVisible());
  assert.equal(await exported.locator('.ml-multi-trigger').count(), 0);
  assert.deepEqual(errors, []);
  console.log(engine.name() + ': verified multi-select search, keyboard, native forms, 48 appearances, fallback and single-select regression.');
} finally {
  await browser.close();
  await unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; });
  await rmdir(temp);
}
