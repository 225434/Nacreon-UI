import { launchBrowser } from './helpers/browser.mjs';
import assert from 'node:assert/strict';
import { chromium, firefox } from 'playwright';

const engine = process.argv[2] === 'firefox' ? firefox : chromium;
const browser = await launchBrowser(engine);
const gallery = new URL('../index.html#media-viewer', import.meta.url).href;
const errors = [];
try {
  for (const [width, height, touch] of [[1280, 860, false], [320, 680, true]]) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: touch });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(gallery);
    const trigger = page.getByRole('button', { name: '导航面板', exact: true });
    const dialog = page.getByRole('dialog', { name: '导航面板' });
    const category = name => dialog.getByRole('button', { name, exact: true });
    const search = dialog.getByRole('searchbox');
    const results = dialog.getByRole('navigation').getByRole('link');
    const focused = el => el.evaluate(node => node === document.activeElement);
    await trigger.click();
    assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
    assert.equal(await results.count(), 0);
    assert.equal(await dialog.getByRole('navigation').getByRole('button').count(), 6);
    const content = category('内容展示');
    assert.equal(await content.getAttribute('aria-controls'), 'catalog-links');
    await content.press('Enter');
    assert(await dialog.getByRole('heading', { name: '内容展示' }).isVisible());
    assert.equal(await results.count(), 7);
    assert(await dialog.getByRole('link', { name: '折叠面板', exact: true }).isVisible());
    for (const theme of ['light', 'warm', 'dark']) {
      await page.evaluate(theme => document.documentElement.dataset.mlTheme = theme, theme);
      assert(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    }
    await category('返回导航面板').click();
    assert(await focused(content));
    await category('设计资源').press('ArrowRight');
    assert.equal(await results.count(), 7);
    await results.first().press('ArrowLeft');
    assert(await focused(category('设计资源')));
    await category('基础控件').click();
    assert.equal(await results.count(), 4);
    await category('搜索全部组件和资源').click();
    await search.fill('表单');
    assert.equal(await results.first().getAttribute('href'), '#form');
    await search.fill('ｍｅｄｉａ　ｖｉｅｗｅｒ');
    assert.equal(await results.first().getAttribute('href'), '#media-viewer');
    await search.press('ArrowDown');
    assert(await focused(results.first()));
    await search.fill('no-matching-component');
    assert.equal(await results.count(), 0);
    assert(await dialog.getByText('没有找到匹配项').isVisible());
    await dialog.getByRole('button', { name: '清除搜索' }).last().click();
    assert(await focused(search));
    assert.equal(await results.count(), 4);
    await search.press('Escape');
    assert(await focused(category('搜索全部组件和资源')));
    await page.keyboard.press('Escape');
    assert(await focused(category('基础控件')));
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert(await focused(trigger));
    await trigger.press('Enter');
    assert(await focused(search));
    await search.fill('slider');
    await search.press('Enter');
    await page.waitForFunction(() => document.documentElement.dataset.component === 'slider');
    assert(await focused(page.locator('#component-title')));
    assert(!/预览器/.test((await page.locator('#shortcut').getAttribute('title')) ?? ''));
    await page.goBack();
    await page.waitForFunction(() => document.documentElement.dataset.component === 'media-viewer');
    await trigger.click();
    assert.equal(await results.count(), 0);
    await category('内容展示').click();
    await dialog.locator('a[aria-current="page"]').click();
    assert(await focused(page.locator('#component-title')), 'reselecting the current route');
    await page.locator('#open-code').click();
    assert.equal(await page.locator('#code-dialog p').count(), 0);
    assert(await page.locator('#copy-code').evaluate(button => {
      const r = button.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= innerHeight;
    }), 'copy stays visible with a long example');
    await page.locator('#close-code').click();
    await page.evaluate(() => { location.hash = 'button'; });
    await page.waitForFunction(() => document.documentElement.dataset.component === 'button');
    await page.locator('#open-code').click();
    await page.goBack();
    await page.locator('#code-dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('html').getAttribute('data-component'), 'media-viewer');
    await page.goForward();
    await page.waitForFunction(() => document.documentElement.dataset.component === 'button');
    await page.locator('#expand-stage').click();
    await page.goBack();
    await page.locator('.stage-dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#expand-stage').getAttribute('aria-pressed'), 'false');
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(new URL('../index.html#switch', import.meta.url).href);
  const route = async name => {
    await page.evaluate(next => { location.hash = next; }, name);
    await page.waitForFunction(next => document.documentElement.dataset.component === next, name);
  };
  const mounted = () => page.evaluate(() => [
    [...document.querySelectorAll('*')].filter(node => node.localName.startsWith('ml-')).length,
    globalThis[Symbol.for('material-lib.glass.v1')].GlassScene.forDocument(document).painters.size,
  ]);
  const key = page.locator('#shortcut kbd'), hint = page.locator('#shortcut span');
  const expand = page.locator('#expand-stage');
  assert.equal(await page.locator('#form-record-name').count(), 0);
  assert.equal(await hint.textContent(), '轻点切换状态');
  assert.equal(await key.isVisible(), false);
  await expand.tap();
  assert.equal(await expand.getAttribute('aria-pressed'), 'true');
  assert.equal(await key.isVisible(), false);
  await page.keyboard.press('Tab');
  assert.equal(await key.isVisible(), true);
  assert.equal(await key.textContent(), 'Space');
  await page.keyboard.press('Escape');
  await page.locator('.stage-dialog').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.activeElement === document.getElementById('expand-stage'));
  await page.locator('#stage-title').tap();
  assert.equal(await key.isVisible(), false);

  const toggle = page.locator('.hero-toggle');
  await toggle.getByRole('switch').tap();
  assert.equal(await toggle.evaluate(el => el.checked), false);
  const switchCounts = await mounted();
  await route('form');
  const title = page.locator('#form-record-name');
  await title.fill('保留巡检记录');
  const original = await title.elementHandle();
  const formCounts = await mounted();
  for (let i = 0; i < 20; i++) {
    await route('switch');
    assert.equal(await original.evaluate(el => el.isConnected), false);
    assert.equal(await toggle.evaluate(el => el.checked), false);
    assert.deepEqual(await mounted(), switchCounts);
    await route('form');
    assert(await original.evaluate(el => el === document.getElementById('form-record-name')));
    assert.equal(await title.inputValue(), '保留巡检记录');
    assert.deepEqual(await mounted(), formCounts);
  }

  await route('file-upload');
  const uploader = page.locator('#file-upload-specimen ml-file-upload');
  const active = await uploader.elementHandle();
  await active.evaluate(el => {
    el.upload = (_file, { signal }) => new Promise(resolve => {
      window.finishDemoUpload = resolve;
      window.demoUploadSignal = signal;
    });
    el.addFiles([new File(['name,value'], '记录.csv', { type: 'text/csv' })]);
    void el.start();
  });
  await route('switch');
  assert(await active.evaluate(el => el.isConnected && el.entries[0].state === 'uploading' && !window.demoUploadSignal.aborted));
  await page.evaluate(() => window.finishDemoUpload());
  await uploader.waitFor({ state: 'detached' });
  await route('file-upload');
  assert.deepEqual(await active.evaluate(el => [el.isConnected, el.entries[0].state, el.files[0].name]), [true, 'complete', '记录.csv']);
  await page.close();
  assert.deepEqual(errors, []);
  console.log(engine.name() + ': catalog, history, touch hints, 20 round trips with stable subscriptions, retained form state and background upload passed');
} finally {
  await browser.close();
}
