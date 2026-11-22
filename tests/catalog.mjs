import assert from 'node:assert/strict';
import { chromium, firefox } from 'playwright';

const engine = process.argv[2] === 'firefox' ? firefox : chromium;
const browser = await engine.launch({ executablePath: engine.executablePath() });
const gallery = new URL('../index.html#media-viewer', import.meta.url).href;
const errors = [];
try {
  for (const [width, height, touch] of [[1280, 860, false], [320, 680, true]]) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: touch });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(gallery);
    const trigger = page.getByRole('button', { name: '组件目录', exact: true });
    const dialog = page.getByRole('dialog', { name: '组件目录' });
    const categories = dialog.getByRole('group', { name: '目录分类' });
    const search = dialog.getByRole('searchbox');
    const results = dialog.getByRole('navigation').getByRole('link');
    const focused = el => el.evaluate(node => node === document.activeElement);
    const currentVisible = () => dialog.locator('a[aria-current="page"]').evaluate(link => {
      const r = link.getBoundingClientRect(), view = link.closest('.catalog-scroll').getBoundingClientRect();
      return r.top >= view.top - 1 && r.bottom <= view.bottom + 1;
    });
    await trigger.click();
    assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
    assert(await currentVisible(), 'opening reveals the current entry at ' + width);
    assert.equal(await categories.getByRole('button', { pressed: true }).getAttribute('aria-controls'), 'catalog-links');
    assert.equal(await dialog.getByRole('heading', { name: '内容展示' }).count(), 1);
    assert.equal(await results.count(), 7);
    assert.equal(await dialog.getByRole('link', { name: '折叠面板', exact: true }).count(), 1);
    assert.equal(await categories.getByRole('button').count(), 6);
    for (const theme of ['light', 'warm', 'dark']) {
      await page.evaluate(theme => document.documentElement.dataset.mlTheme = theme, theme);
      assert(await currentVisible());
      assert(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    }
    await categories.getByRole('button', { name: '设计资源' }).click();
    assert.equal(await results.count(), 7);
    await categories.getByRole('button', { name: '设计资源' }).press('Home');
    assert.equal(await results.count(), 4);
    await search.fill('表单');
    assert.equal(await results.first().getAttribute('href'), '#form');
    await search.fill('ｍｅｄｉａ　ｖｉｅｗｅｒ');
    assert.equal(await results.first().getAttribute('href'), '#media-viewer');
    await search.press('ArrowDown');
    assert(await focused(results.first()));
    await search.fill('no-matching-component');
    assert.equal(await results.count(), 0);
    assert(await dialog.getByText('没有找到匹配项').isVisible());
    await dialog.locator('#catalog-reset').click();
    assert(await focused(search));
    assert.equal(await results.count(), 4);
    await search.press('Escape');
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
    assert(await currentVisible());
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
  assert.deepEqual(errors, []);
  console.log(engine.name() + ': catalog categories, cross-category search, active route, keyboard, history, compact layout and code preview passed');
} finally {
  await browser.close();
}
