import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, firefox } from 'playwright';
import { launchBrowser } from './helpers/browser.mjs';

const engine = process.argv[2] === 'firefox' ? firefox : chromium;
const dir = await mkdtemp(join(tmpdir(), 'nacreon-bundle-'));
const root = new URL('../', import.meta.url);
const names = ['button', 'input', 'select', 'data-table', 'dialog'];
const build = components => execFileSync(process.execPath, [fileURLToPath(new URL('build.mjs', root)),
  '--components', components, '--name', 'workspace', '--out-dir', dir], { stdio: 'pipe' });
const css = url => '<link rel="stylesheet" href="' + url + '">';
const js = url => '<script defer src="' + url + '"></script>';
const pair = base => css(base + '.css') + js(base + '.js');
const direct = names.map(name => pair(new URL('dist/components/' + name + '/' + name, root).href));
const bundle = pair(pathToFileURL(join(dir, 'workspace')).href);
const body = '<ml-button><button id="open">编辑</button></ml-button><ml-input><input aria-label="名称"></ml-input>' +
  '<ml-select><select aria-label="区域"><option>A</option><option>B</option></select></ml-select>' +
  '<ml-data-table selectable><table><thead><tr><th data-key="n" data-sort="number">数量</th></tr></thead>' +
  '<tbody><tr data-key="b"><td>2</td></tr><tr data-key="a"><td>1</td></tr></tbody></table>' +
  '<ml-pagination page-size="1"></ml-pagination></ml-data-table><ml-dialog><dialog><button>确定</button></dialog></ml-dialog>';

let browser;
try {
  assert.throws(() => build('button,unknown'), /Unknown component/);
  build(names.join(','));
  const output = ext => readFile(join(dir, 'workspace.' + ext), 'utf8');
  const generated = await Promise.all(['css', 'js'].map(output));
  build(names.concat('button').join(','));
  assert.deepEqual(await Promise.all(['css', 'js'].map(output)), generated);
  assert.equal(generated[1].split("customElements.define('ml-pagination'").length - 1, 1);
  browser = await launchBrowser(engine);
  let expected;
  for (const tags of [direct.join(''), bundle, direct[0] + bundle, bundle + direct[3]]) {
    const file = join(dir, 'page.html');
    await writeFile(file, '<!doctype html><html lang="zh-CN"><meta charset="utf-8">' + tags +
      '<style>ml-button { --ml-button-radius: 13px }</style><body>' + body);
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(file).href);
    const styles = await page.evaluate(() => {
      const targets = ['ml-button', 'ml-input input', 'ml-select select', 'ml-data-table table', 'ml-pagination', 'ml-dialog dialog'];
      const result = [];
      for (const theme of ['light', 'warm', 'dark']) for (const material of ['base', 'low', 'medium', 'high']) {
        for (const motion of ['base', 'low', 'medium', 'high']) {
          Object.assign(document.documentElement.dataset, { mlTheme: theme, mlMaterial: material, mlMotion: motion });
          result.push(targets.map(selector => {
            const s = getComputedStyle(document.querySelector(selector));
            return [s.color, s.backgroundColor, s.borderRadius, s.fontSize, s.display, s.getPropertyValue('--ml-follow')];
          }));
        }
      }
      return result;
    });
    expected ??= styles;
    assert.deepEqual(styles, expected);
    assert.equal(styles[0][0][2], '13px');
    await page.getByRole('textbox', { name: '名称' }).fill('现场');
    assert.equal(await page.locator('ml-input').evaluate(el => el.value), '现场');
    await page.locator('ml-select').evaluate(el => el.showPicker());
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    assert.equal(await page.locator('select').first().inputValue(), 'B');
    await page.getByRole('button', { name: '数量' }).click();
    const table = page.locator('ml-data-table');
    assert.equal(await table.evaluate(el => el.visibleRows[0].dataset.key), 'a');
    await table.locator('tr[data-key="a"] input').check();
    await table.locator('ml-pagination').evaluate(el => { el.page = 2; });
    assert.deepEqual(await table.evaluate(el => [el.visibleRows[0].dataset.key, el.selectedRows[0].dataset.key]), ['b', 'a']);
    await page.locator('ml-dialog').evaluate(el => el.showModal(document.querySelector('#open')));
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'open');
    assert.deepEqual(errors, []);
    await page.close();
  }
  const directories = await readdir(new URL('dist/components/', root), { withFileTypes: true });
  const all = directories.filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  build(all.join(','));
  const registry = async tags => {
    const file = join(dir, 'registry.html');
    await writeFile(file, '<!doctype html><meta charset="utf-8">' + tags);
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.registered = [];
      const define = customElements.define.bind(customElements);
      customElements.define = (name, ...args) => { define(name, ...args); window.registered.push(name); };
    });
    await page.goto(pathToFileURL(file).href);
    const registered = await page.evaluate(() => window.registered.sort());
    assert.deepEqual(errors, []);
    await page.close();
    return registered;
  };
  const separate = await registry(all.map(name => pair(new URL('dist/components/' + name + '/' + name, root).href)).join(''));
  assert(separate.includes('ml-file-upload') && separate.includes('ml-date-picker'));
  assert.deepEqual(await registry(bundle), separate);
} finally {
  await browser?.close();
  await rm(dir, { recursive: true, force: true });
}
