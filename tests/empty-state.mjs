import assert from 'node:assert/strict';
import { mkdtemp, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, firefox } from 'playwright';

const engine = process.argv[2] === 'firefox' ? firefox : chromium;
const browser = await engine.launch({ executablePath: engine.executablePath() });
const root = new URL('../', import.meta.url);
const temp = await mkdtemp(join(tmpdir(), 'ml-empty-test-'));
const file = join(temp, 'example.html');
const grades = ['base', 'low', 'medium', 'high'];

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 980 } });
  context.setDefaultTimeout(8000);
  const errors = [];
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  const page = await context.newPage();
  let example;
  const route = name => page.goto(new URL('index.html#' + name, root).href);
  const choose = (name, value) => page.locator('input[name="' + name + '"][value="' + value + '"]').evaluate(el => el.click());
  const focused = target => target.evaluate(el => el === document.activeElement);
  const frames = (target = page) => target.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  const snippet = async () => {
    await page.locator('#open-code').click();
    const code = await page.locator('#code-sample').textContent();
    await page.locator('#close-code').click();
    return code;
  };
  const render = async markup => {
    example ??= await context.newPage();
    await writeFile(file, '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><base href="' + root.href + '">' + markup);
    await example.goto(pathToFileURL(file).href);
  };

  await route('switch');
  await page.locator('#open-catalog').click();
  await page.locator('#catalog-query').fill('无搜索结果');
  await page.locator('#catalog-query').press('Enter');
  const sample = page.locator('#empty-state-specimen ml-empty-state');
  const contents = sample.locator('.ml-empty-content');
  const layer = sample.locator(':scope > .ml-optical');
  const result = page.locator('#empty-state-specimen [data-empty-result]');
  await sample.waitFor({ state: 'visible' });
  assert.match(await page.title(), /通用空状态/);

  const glyphs = [];
  for (const kind of ['empty', 'search', 'error', 'restricted']) {
    await choose('empty-kind', kind);
    glyphs.push(await sample.locator('.ml-empty-icon').evaluate(el => getComputedStyle(el, '::before').maskImage));
    assert(await sample.getByRole('heading').isVisible());
    if (kind === 'restricted') {
      assert.equal(await sample.getByRole('button').count(), 0);
      continue;
    }
    const action = sample.getByRole('button');
    await action.press('Enter');
    assert(await result.isVisible());
    assert(await focused(result.getByRole('heading')));
    await result.getByRole('button', { name: '重置示例' }).press('Space');
    assert(await focused(action));
  }
  assert.equal(new Set(glyphs).size, 4);
  assert(glyphs.every(glyph => glyph.includes('image/svg+xml')));

  await choose('empty-kind', 'search');
  for (const theme of ['light', 'warm', 'dark']) {
    await choose('theme', theme);
    for (const material of grades) {
      await choose('material', material);
      for (const motion of grades) {
        await choose('motion', motion);
        await frames();
        const expected = material === 'high' ? 'glass' : motion === 'high' ? material : '';
        assert.equal(await layer.count(), Number(!!expected), [theme, material, motion].join('/'));
        if (expected) {
          const paint = await layer.evaluate(el => ({
            kind: el.dataset.mlLight || 'glass',
            radius: getComputedStyle(el).borderRadius,
            host: getComputedStyle(el.parentElement).borderRadius,
          }));
          assert.equal(paint.kind, expected);
          assert.equal(paint.radius, paint.host);
          assert.notEqual(paint.radius, '0px');
        }
        const duration = await contents.evaluate(el => parseFloat(getComputedStyle(el).animationDuration));
        assert.equal(duration === 0, motion === 'base');
      }
    }
  }

  await choose('material', 'low');
  const box = await sample.boundingBox();
  await page.mouse.move(box.x + 24, box.y + 24);
  await sample.locator(':scope > [data-ml-light="low"][data-ml-lit]').waitFor({ state: 'attached' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await layer.waitFor({ state: 'detached' });
  assert.equal(await contents.evaluate(el => getComputedStyle(el).animationName), 'none');
  await choose('material', 'high');
  await layer.waitFor({ state: 'attached' });
  await page.emulateMedia({ forcedColors: 'active' });
  await layer.waitFor({ state: 'detached' });
  await page.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'none' });
  await layer.waitFor({ state: 'attached' });

  await choose('empty-layout', 'inline');
  await layer.waitFor({ state: 'detached' });
  await render(await snippet());
  const exported = example.locator('ml-empty-state');
  assert.equal(await exported.getAttribute('kind'), 'search');
  assert.equal(await exported.getAttribute('density'), 'compact');
  assert.equal(await example.locator('[data-ml-theme-surface]').getAttribute('data-ml-theme'), 'dark');
  await exported.getByRole('button').press('Enter');
  assert(await example.getByRole('heading', { name: '山间湖泊' }).isVisible());
  await example.getByRole('button', { name: '重置示例' }).press('Space');
  await exported.evaluate(el => { el.style.inlineSize = '220px'; });
  const icon = exported.locator('.ml-empty-icon');
  const title = exported.getByRole('heading');
  assert((await title.boundingBox()).y > (await icon.boundingBox()).y);
  await exported.evaluate(el => { el.style.inlineSize = '360px'; });
  assert((await title.boundingBox()).x > (await icon.boundingBox()).x);

  await page.setViewportSize({ width: 320, height: 900 });
  await route('empty-state-examples');
  const filter = page.locator('#empty-filter-example');
  const query = filter.getByRole('searchbox');
  const searchEmpty = filter.locator('ml-empty-state');
  assert(await searchEmpty.isVisible());
  await searchEmpty.getByRole('button', { name: '清除查询' }).press('Enter');
  assert(await focused(query));
  assert.equal(await query.inputValue(), '');
  assert.equal(await filter.locator('tbody tr:visible').count(), 2);
  assert(!(await searchEmpty.isVisible()));
  await query.fill('山间');
  assert.equal(await filter.locator('tbody tr:visible').count(), 1);
  await query.fill('无');
  await searchEmpty.waitFor({ state: 'visible' });
  const saved = page.locator('#empty-saved-example');
  const save = saved.getByRole('button', { name: '收藏示例记录' });
  const remove = saved.getByRole('button', { name: '取消收藏' });
  await save.press('Enter');
  assert(await saved.getByRole('list').isVisible());
  assert(await focused(remove));
  await remove.press('Space');
  assert(!(await saved.getByRole('list').isVisible()));
  assert(await focused(save));
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

  await route('data-table');
  await choose('records-state', 'empty');
  assert(await page.locator('#data-table-specimen ml-empty-state').isVisible());
  await render(await snippet());
  await example.locator('ml-empty-state').waitFor({ state: 'visible' });
  assert.equal(await example.locator('ml-pagination').getAttribute('total'), '0');

  // An existing table can keep its old text or switch to a custom state after connecting.
  await render('<link rel="stylesheet" href="dist/components/data-table/data-table.css"><script defer src="dist/components/data-table/data-table.js"></script>' +
    '<ml-data-table empty-text="没有记录"><table><tbody></tbody></table></ml-data-table>');
  const table = example.locator('ml-data-table');
  const fallback = table.getByRole('status');
  assert.equal(await fallback.textContent(), '没有记录');
  await table.evaluate(el => el.append(el.ownerDocument.createElement('ml-empty-state')));
  const custom = table.locator('ml-empty-state');
  assert(await custom.evaluate(el => !el.hidden));
  assert.equal(await table.locator('.ml-table-empty').getAttribute('hidden'), '');
  await table.locator('tbody').evaluate(body => { body.insertRow().insertCell().textContent = '山野'; });
  assert.equal(await custom.getAttribute('hidden'), '');
  await table.locator('tbody').evaluate(body => body.replaceChildren());
  assert.equal(await custom.getAttribute('hidden'), null);
  await custom.evaluate(el => el.remove());
  assert(await fallback.isVisible());
  assert.deepEqual(errors, []);
  console.log(engine.name() + ': verified empty-state actions, 48 appearances, compact layouts, offline code and table fallback.');
} finally {
  await browser.close();
  await unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; });
  await rmdir(temp);
}
