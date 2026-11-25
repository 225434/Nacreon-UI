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
const temp = await mkdtemp(join(tmpdir(), 'ml-tree-'));
const file = join(temp, 'example.html');
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  context.on('page', page => {
    page.setDefaultTimeout(12000);
    page.on('pageerror', error => errors.push(error.message));
  });
  const page = await context.newPage();
  await page.goto(new URL('index.html#tree', root).href);
  const specimen = page.locator('#tree-specimen');
  const tree = specimen.locator('ml-tree');
  const node = key => tree.locator('li[data-node="' + key + '"]');
  const label = key => node(key).locator(':scope > .ml-tree-row > .ml-tree-label');
  const toggle = key => node(key).locator(':scope > .ml-tree-row > .ml-tree-toggle');
  const value = () => tree.evaluate(el => el.value);
  const active = () => tree.evaluate(el => el.getRootNode().activeElement?.dataset.node);
  const expanded = key => node(key).getAttribute('aria-expanded');
  const visible = () => tree.getByRole('treeitem').count();
  const set = (name, value) => page.locator('input[name="' + name + '"][value="' + value + '"]').evaluate(input => input.click());

  await specimen.waitFor();
  await set('motion', 'base');
  assert.equal(await page.locator('#catalog-current').textContent(), '树形导航');
  assert.equal(await tree.getByRole('tree', { name: '素材档案目录' }).count(), 1);
  assert.equal(await tree.getByRole('treeitem', { name: '素材档案', exact: true }).count(), 1);
  assert.equal(await visible(), 8);
  assert.equal(await value(), 'demo-101');
  assert.equal(await node('demo-101').getAttribute('aria-level'), '4');
  assert.equal(await expanded('demo-101'), null);
  assert.equal(await node('demo-101').getAttribute('tabindex'), '0');
  assert.equal(await tree.locator('[tabindex="0"]').count(), 1);
  await tree.evaluate(el => {
    el.testEvents = [];
    el.addEventListener('ml-tree-change', event => el.testEvents.push(['select', event.detail.value, event.detail.previousValue]));
    el.addEventListener('ml-tree-toggle', event => el.testEvents.push(['toggle', event.detail.value, event.detail.expanded]));
  });

  await toggle('mountains').click();
  assert.equal(await expanded('mountains'), 'false');
  assert.equal(await expanded('lake-album'), 'true');
  assert.equal(await value(), 'demo-101');
  assert.equal(await node('demo-101').isVisible(), false);
  await toggle('mountains').click();
  assert.equal(await node('demo-101').isVisible(), true);
  await label('photos').click();
  assert.equal(await value(), 'photos');
  assert.equal(await specimen.locator('[data-tree-name]').textContent(), '拍摄照片');
  assert.equal(await specimen.locator('[data-tree-path]').textContent(), '素材档案 / 山野相册 / 湖泊相册 ALB-01');
  assert.deepEqual(await tree.evaluate(el => el.testEvents.slice(0, 3)), [
    ['toggle', 'mountains', false], ['toggle', 'mountains', true], ['select', 'photos', 'demo-101'],
  ]);

  await tree.evaluate(el => el.setExpanded('lake-album', false));
  assert.equal(await active(), 'lake-album');
  assert.equal(await value(), 'photos');
  assert.equal(await tree.locator('[tabindex="0"]').count(), 1);
  await page.keyboard.press('ArrowRight');
  assert.equal(await expanded('lake-album'), 'true');
  assert.equal(await active(), 'lake-album');
  await page.keyboard.press('ArrowRight');
  assert.equal(await active(), 'demo-101');
  assert.equal(await value(), 'photos');
  await page.keyboard.press('Space');
  assert.equal(await value(), 'demo-101');
  await page.keyboard.press('ArrowDown');
  assert.equal(await active(), 'photos');
  await page.keyboard.press('ArrowUp');
  assert.equal(await active(), 'demo-101');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await active(), 'lake-album');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await expanded('lake-album'), 'false');
  await page.keyboard.press('Enter');
  assert.equal(await value(), 'lake-album');
  assert.equal(await expanded('lake-album'), 'false');
  await page.keyboard.press('Home');
  assert.equal(await active(), 'albums');
  await page.keyboard.press('End');
  assert.equal(await active(), 'manuals');
  await page.keyboard.press('Home');
  await node('albums').dispatchEvent('keydown', { key: '整', bubbles: true });
  assert.equal(await active(), 'manuals');
  assert.equal(await value(), 'lake-album');

  await page.locator('#tree-tools [data-tree-open]').click();
  assert.equal(await visible(), 11);
  await page.locator('#tree-tools [data-tree-close]').click();
  assert.equal(await visible(), 2);
  assert.equal(await value(), 'lake-album');
  assert.equal(await node('albums').getAttribute('tabindex'), '0');
  assert.equal(await tree.evaluate(el => el.select('demo-101')), true);
  assert.equal(await expanded('albums'), 'true');
  assert.equal(await expanded('mountains'), 'true');
  assert.equal(await expanded('lake-album'), 'true');
  assert.equal(await node('demo-101').getAttribute('tabindex'), '0');
  await tree.evaluate(el => el.focus());
  assert.equal(await active(), 'demo-101');

  const colors = new Set();
  for (const theme of ['light', 'warm', 'dark']) {
    await set('theme', theme);
    colors.add(await tree.evaluate(el => getComputedStyle(el).getPropertyValue('--ml-color-surface').trim()));
    for (const material of ['base', 'low', 'medium', 'high']) {
      await set('material', material);
      for (const motion of ['base', 'low', 'medium', 'high']) {
        await set('motion', motion);
        assert.deepEqual(await tree.evaluate(el => {
          const style = getComputedStyle(el);
          return ['--ml-material-level', '--ml-motion-level'].map(property => style.getPropertyValue(property).trim());
        }), [material, motion]);
      }
    }
  }
  assert.equal(colors.size, 3);
  await page.setViewportSize({ width: 320, height: 840 });
  assert.equal(await specimen.locator('.tree-workspace').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), 1);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await node('mountains').locator(':scope > ul').evaluate(el => getComputedStyle(el).animationName), 'none');
  await page.locator('#open-code').click();
  const snippet = await page.locator('#code-sample').textContent();
  assert.match(snippet, /<ml-tree value="demo-101">/);
  assert.doesNotMatch(snippet, /class="ml-tree-toggle"/);
  await writeFile(file, '<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><base href="' + root.href + '">' + snippet);
  const copy = await context.newPage();
  await copy.setViewportSize({ width: 320, height: 840 });
  await copy.goto(pathToFileURL(file).href);
  await copy.getByRole('treeitem', { name: '素材记录 DEMO-101', exact: true }).waitFor();
  await copy.locator('li[data-node="photos"] .ml-tree-label').click();
  assert.equal(await copy.locator('[data-tree-name]').textContent(), '拍摄照片');

  await copy.evaluate(() => {
    const example = document.createElement('ml-tree');
    example.id = 'async-tree';
    example.value = 'late';
    example.innerHTML = `<ul aria-label="目录">
      <li data-node="disabled" aria-disabled="true">
        <div class="ml-tree-row"><span class="ml-tree-label">禁用分支</span></div>
        <ul><li data-node="disabled-item"><div class="ml-tree-row"><span class="ml-tree-label">禁用节点</span></div></li></ul>
      </li>
      <li data-node="parent"><div class="ml-tree-row"><span class="ml-tree-label">父节点</span></div><ul></ul></li>
    </ul>`;
    document.body.append(example);
    example.querySelector('[data-node="parent"] > ul').innerHTML =
      '<li data-node="late"><div class="ml-tree-row"><span class="ml-tree-label">新增节点</span></div></li>';
  });
  const dynamic = copy.locator('#async-tree');
  await dynamic.getByRole('treeitem', { name: '新增节点' }).waitFor();
  assert.equal(await dynamic.evaluate(el => el.value), 'late');
  assert.equal(await dynamic.evaluate(el => el.select('disabled-item')), false);
  assert.equal(await dynamic.evaluate(el => el.setExpanded('disabled', true)), false);
  assert.equal(await dynamic.locator('[tabindex="0"]').count(), 1);
  assert.deepEqual(errors, []);
  console.log(engine.name() + ': verified tree selection, focus and expansion, dynamic nodes, 48 appearances and offline code');
} finally {
  await browser.close();
  await unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; });
  await rmdir(temp);
}
