import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, firefox } from 'playwright';
import { launchBrowser } from './helpers/browser.mjs';

const engine = process.argv[2] === 'firefox' ? firefox : chromium;
const root = new URL('../', import.meta.url);
const temp = await mkdtemp(join(tmpdir(), 'ml-catalog-'));
let browser;
const errors = [];
try {
  browser = await launchBrowser(engine);
  for (const name of ['navigation-panel', 'catalog']) {
    const dist = join(temp, 'dist', 'components', name);
    await mkdir(dist, { recursive: true });
    for (const ext of ['css', 'js']) {
      const file = name + '.' + ext;
      await copyFile(new URL('dist/components/' + name + '/' + file, root), join(dist, file));
    }
  }

  const context = await browser.newContext({ offline: true });
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  const gallery = await context.newPage();
  await gallery.goto(new URL('index.html#catalog', root).href);
  await gallery.waitForFunction(() => document.documentElement.dataset.component === 'navigation-panel');
  await gallery.goto(new URL('index.html#navigation-panel', root).href);
  const specimen = gallery.locator('#catalog-specimen');
  const directory = specimen.locator('ml-navigation-panel');
  const selectMode = mode => gallery.locator('input[name="catalog-kind"][value="' + mode + '"]').evaluate(el => el.click());
  const selectDensity = density => gallery.locator('input[name="catalog-density"][value="' + density + '"]').evaluate(el => el.click());
  const dimensions = panel => panel.evaluate(el => {
    const results = el.querySelector('.ml-catalog-results');
    return [el.offsetWidth, el.offsetHeight, results.clientHeight];
  });
  const copy = await context.newPage();
  assert.equal(await gallery.locator('#catalog-links a').count(), 45);
  async function readSample(page, panel) {
    const url = page.url(), historyLength = await page.evaluate(() => history.length);
    const home = await dimensions(panel);
    const compact = await panel.getAttribute('density') === 'compact';
    const checkLayout = async () => {
      if (!compact) {
        assert.deepEqual(await dimensions(panel), home);
        return;
      }
      const layout = await panel.evaluate(async el => {
        const surface = el.querySelector('.ml-catalog-panel');
        await Promise.allSettled(surface.getAnimations().map(animation => animation.finished));
        const content = surface.querySelector('.ml-catalog-results > :is(nav, .ml-catalog-empty):not([hidden])');
        return { width: el.offsetWidth, height: el.offsetHeight,
          bottomGap: el.getBoundingClientRect().bottom - content.getBoundingClientRect().bottom };
      });
      assert.equal(layout.width, home[0]);
      assert(layout.bottomGap >= 0 && layout.bottomGap < 12, 'compact bottom padding follows the last visible row');
      return layout.height;
    };
    const group = name => panel.getByRole('button', { name, exact: true });
    await checkLayout();
    await group('显示与文字').click();
    const childHeight = await checkLayout();
    if (compact) assert(childHeight < home[1]);
    assert.equal(await group('通知样式').count(), 0);
    await group('文字预览').press('ArrowRight');
    assert(await panel.getByRole('heading', { name: '文字预览', exact: true }).isVisible());
    await checkLayout();
    assert.equal(await panel.getByRole('navigation').getByRole('paragraph').count(), 3);
    const text = panel.getByText('清晨的光穿过树梢，落在翻开的书页上。', { exact: true });
    await text.click();
    assert.equal(await panel.locator('a[href]').count(), 0);
    assert.equal(page.url(), url);
    assert.equal(await page.evaluate(() => history.length), historyLength);
    await group('搜索展示文本').click();
    const search = panel.getByRole('searchbox');
    await search.fill('阅读提醒');
    await checkLayout();
    const match = panel.getByRole('navigation').getByRole('paragraph');
    assert.equal(await match.count(), 1);
    assert.equal(await match.locator('.ml-catalog-context').textContent(), '通知样式');
    assert(await panel.getByText('阅读提醒', { exact: true }).isVisible());
    await search.press('Enter');
    assert.equal(page.url(), url);
    if (compact) {
      await search.fill('无匹配的示例');
      await checkLayout();
    }
    await search.press('Escape');
    assert(await text.isVisible());
    await group('返回显示与文字').click();
    assert(await group('文字预览').evaluate(el => document.activeElement === el));
    await page.keyboard.press('Escape');
    assert(await group('显示与文字').evaluate(el => document.activeElement === el));
    await checkLayout();
    assert.deepEqual(await dimensions(panel), home);
    assert.equal(await page.evaluate(() => history.length), historyLength);
  }
  const normal = await dimensions(directory);
  await selectDensity('compact');
  const compact = await dimensions(directory);
  assert(compact[0] < normal[0] && compact[1] < normal[1], 'compact reduces both dimensions of the same navigation');
  assert(await directory.getByRole('navigation').getByRole('button').first().evaluate(el => el.offsetHeight >= 44));
  async function checkDirection(panel, orientation) {
    const steps = await panel.evaluate(async (el, orientation) => {
      el.dir = orientation;
      const viewport = el.querySelector('.ml-catalog-viewport');
      const live = viewport.firstElementChild;
      const surface = viewport.parentElement;
      const sample = async button => {
        button.click();
        const departing = viewport.lastElementChild;
        const animations = [live.getAnimations()[0], departing.getAnimations()[0], ...surface.getAnimations()];
        for (const animation of animations) animation.pause();
        const position = fraction => {
          for (const animation of animations) animation.currentTime = animation.effect.getTiming().duration * fraction;
          return [live, departing].map(layer => new DOMMatrixReadOnly(getComputedStyle(layer).transform).m41);
        };
        const start = position(0), firstHeight = surface.offsetHeight;
        const halfway = position(.5), middleHeight = surface.offsetHeight;
        const step = { start, halfway, firstHeight, middleHeight, width: viewport.clientWidth,
          inert: departing.inert && departing.getAttribute('aria-hidden') === 'true',
          navCount: viewport.querySelectorAll('nav').length };
        for (const animation of animations) animation.finish();
        await animations[0].finished;
        return step;
      };
      const forward = await sample(live.querySelector('.ml-catalog-group'));
      const back = await sample(el.querySelector('.ml-catalog-back'));
      el.removeAttribute('dir');
      return { forward, back, remaining: viewport.childElementCount };
    }, orientation);
    const sign = orientation === 'rtl' ? -1 : 1;
    assert(Math.abs(steps.forward.start[0]) >= steps.forward.width - 1);
    assert(steps.forward.halfway[0] * sign > 0 && steps.forward.halfway[0] * sign < steps.forward.start[0] * sign);
    assert(steps.forward.halfway[1] * sign < 0);
    assert(steps.back.start[0] * sign < 0 && steps.back.halfway[0] * sign > steps.back.start[0] * sign);
    assert(steps.back.halfway[1] * sign > 0);
    assert(steps.forward.middleHeight < steps.forward.firstHeight);
    assert(steps.back.middleHeight > steps.back.firstHeight);
    assert(steps.forward.inert && steps.back.inert && steps.forward.navCount === 1 && steps.back.navCount === 1);
    assert.equal(steps.remaining, 1);
  }
  await checkDirection(directory, 'ltr');
  await checkDirection(directory, 'rtl');
  await gallery.emulateMedia({ reducedMotion: 'reduce' });
  assert(await directory.evaluate(el => {
    el.querySelector('nav .ml-catalog-group').click();
    const viewport = el.querySelector('.ml-catalog-viewport');
    const immediate = viewport.childElementCount === 1 && !viewport.getAnimations({ subtree: true }).length;
    el.reset();
    return immediate;
  }));
  await gallery.emulateMedia({ reducedMotion: 'no-preference' });
  for (const mode of ['inline', 'dialog']) {
    await selectDensity(mode === 'dialog' ? 'normal' : 'compact');
    await selectMode(mode);
    if (mode === 'dialog') await specimen.getByRole('button', { name: '打开偏好设置' }).click();
    await readSample(gallery, directory);
    if (mode === 'dialog') await directory.getByRole('button', { name: '关闭导航面板' }).click();
    await gallery.locator('#open-code').click();
    const snippet = await gallery.locator('#code-sample').textContent();
    assert.match(snippet, /dist\/components\/navigation-panel\/navigation-panel\.js/);
    assert.equal(snippet.includes('density="compact"'), mode === 'inline');
    assert.doesNotMatch(snippet, /<a\s|location\.|hashchange|preview\/|ml-catalog-panel/);
    await gallery.locator('#close-code').click();
    const file = join(temp, mode + '.html');
    await writeFile(file, '<!doctype html><html lang="zh-CN"><meta charset="utf-8">' + snippet);
    await copy.goto(pathToFileURL(file).href);
    const panel = copy.locator('ml-navigation-panel');
    const opener = copy.getByRole('button', { name: '打开偏好设置' });
    if (mode === 'dialog') {
      await opener.press('Enter');
      assert(await panel.getByRole('searchbox').evaluate(el => el === document.activeElement));
    }
    await readSample(copy, panel);
    if (mode === 'dialog') {
      await copy.keyboard.press('Escape');
      await copy.getByRole('dialog').waitFor({ state: 'hidden' });
      assert.equal(await opener.getAttribute('aria-expanded'), 'false');
      assert(await opener.evaluate(el => el === document.activeElement));
    }
  }

  const fixture = join(temp, 'entries.html');
  await writeFile(fixture, '<!doctype html><html lang="zh-CN"><meta charset="utf-8">' +
    '<link rel="stylesheet" href="./dist/components/catalog/catalog.css"><script defer src="./dist/components/catalog/catalog.js"></script>' +
    '<ml-catalog id="one" label="素材目录"><nav aria-label="素材">' +
    '<section><h3>素材集</h3><a href="#alb" data-en="Albums" data-keywords="照片">相册</a></section>' +
    '<section><h3>记录</h3><a href="#notes" data-lead="摄影笔记">工作日志</a></section></nav></ml-catalog>' +
    '<div data-ml-theme="dark" style="max-width:300px"><ml-catalog id="two" label="我的目录"></ml-catalog></div>' +
    '<p id="alb">相册内容</p><p id="notes">日志内容</p>');
  await copy.goto(pathToFileURL(fixture).href);
  const one = copy.locator('#one'), two = copy.locator('#two');
  await two.evaluate(el => { el.innerHTML = '<nav aria-label="我的条目"></nav>'; });
  await two.getByText('暂无导航条目').waitFor();
  await two.evaluate(el => {
    const group = document.createElement('section');
    group.innerHTML = '<h3>附件</h3><a href="#notes" aria-current="page">文件清单</a>';
    el.querySelector('nav').append(group);
  });
  await two.getByRole('button', { name: '附件', exact: true }).click();
  await two.getByRole('link', { name: '文件清单' }).waitFor();
  assert.notEqual(await one.locator('nav').getAttribute('id'), await two.locator('nav').getAttribute('id'));
  assert.equal(await two.evaluate(el => getComputedStyle(el).colorScheme), 'dark');
  await two.evaluate(el => {
    const clone = el.cloneNode(true);
    clone.id = 'clone';
    el.after(clone);
  });
  const clone = copy.locator('#clone');
  assert.notEqual(await clone.locator('nav').getAttribute('id'), await two.locator('nav').getAttribute('id'));
  assert.equal(await clone.getByRole('searchbox').count(), 1);
  await clone.evaluate(el => { el.innerHTML = '<nav><section><h3>新分类</h3><a href="#alb">新增条目</a></section></nav>'; });
  await clone.getByRole('button', { name: '新分类', exact: true }).click();
  await clone.getByRole('link', { name: '新增条目' }).waitFor();
  assert.equal(await two.getByRole('link').count(), 1);
  await clone.evaluate(el => el.remove());
  const search = one.getByRole('searchbox');
  await search.fill('摄影笔记');
  assert.equal(await one.getByRole('link').getAttribute('href'), '#notes');
  assert.equal(await two.getByRole('link').count(), 1);
  await one.evaluate(el => {
    const link = document.createElement('a');
    link.href = '#notes';
    link.textContent = '摄影笔记';
    el.querySelector('section').append(link);
  });
  await copy.waitForFunction(() => document.getElementById('one').entries.length === 3);
  assert.equal(await one.getByRole('link').first().locator('.ml-catalog-name').textContent(), '摄影笔记');
  await one.getByRole('link', { name: /^摄影笔记/ }).evaluate(el => el.remove());
  await copy.waitForFunction(() => document.getElementById('one').entries.length === 2);
  await search.press('Enter');
  await copy.waitForURL(pathToFileURL(fixture).href + '#notes');
  await search.fill('无匹配的名称');
  await one.getByText('没有找到匹配项').waitFor();
  await one.locator('.ml-catalog-empty button').click();
  await one.getByRole('button', { name: '素材集', exact: true }).click();
  assert.equal(await one.getByRole('link').getAttribute('href'), '#alb');
  await copy.setViewportSize({ width: 1100, height: 780 });
  assert(await one.evaluate(el => el.offsetWidth < el.parentElement.clientWidth));
  assert(await two.evaluate(el => el.offsetWidth <= el.parentElement.clientWidth));
  await selectMode('inline');
  for (const width of [320, 390, 768, 1280]) {
    await gallery.setViewportSize({ width, height: width === 320 ? 460 : 760 });
    for (const density of ['normal', 'compact']) {
      await selectDensity(density);
      assert(await directory.evaluate(el => {
        const panel = el.getBoundingClientRect(), available = el.parentElement.getBoundingClientRect();
        return panel.left >= available.left - 1 && panel.right <= available.right + 1 && el.scrollWidth <= el.clientWidth + 1;
      }), density + ' fits inside the inline preview at ' + width + ' px');
    }
    await gallery.locator('#open-catalog').click();
    const dialog = gallery.locator('#component-catalog');
    const size = () => dialog.evaluate(el => {
      const results = el.querySelector('.ml-catalog-results');
      const rows = [...results.querySelectorAll('.ml-catalog-group, .ml-catalog-leaf')].filter(row => !row.closest('[hidden]'));
      return { w: el.offsetWidth, h: el.offsetHeight, overflow: el.scrollWidth - el.clientWidth,
        scroll: results.scrollHeight - results.clientHeight, cols: new Set(rows.map(row => row.offsetLeft)).size };
    });
    const home = await size();
    assert(home.overflow <= 1 && home.w <= width && home.cols === 1);
    assert.equal(await dialog.getByRole('navigation').getByRole('button').count(), 6);
    assert.equal(await dialog.getByRole('link').count(), 0);
    await dialog.getByRole('button', { name: '表单输入', exact: true }).click();
    const browse = await size();
    assert(browse.overflow <= 1 && browse.w <= width && browse.cols === 1);
    assert.deepEqual([browse.w, browse.h], [home.w, home.h]);
    assert.equal(await dialog.getByRole('link').count(), 11);
    assert(await dialog.getByRole('link').first().evaluate(el => el.offsetHeight >= 44));
    if (width === 320) assert(browse.scroll > 0, 'long lists scroll under the navigation bar');
    await dialog.getByRole('button', { name: '搜索全部组件和资源' }).click();
    const field = dialog.getByRole('searchbox');
    await field.fill('Navigation Panel');
    const single = await size();
    assert.deepEqual([single.w, single.h], [home.w, home.h]);
    assert(single.scroll <= 1);
    await field.fill('no-such-entry');
    const empty = await size();
    assert.deepEqual([empty.w, empty.h], [home.w, home.h]);
    assert(empty.scroll <= 1);
    await field.press('Escape');
    assert.equal(await dialog.getByRole('link').count(), 11);
    await dialog.getByRole('button', { name: '返回导航面板' }).click();
    assert.deepEqual(await size(), home);
    await gallery.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
  }
  const compactCatalog = gallery.locator('#component-catalog > ml-navigation-panel');
  await compactCatalog.evaluate(el => el.setAttribute('density', 'compact'));
  await gallery.locator('#open-catalog').click();
  await compactCatalog.getByRole('button', { name: '表单输入', exact: true }).click();
  const lastEntry = compactCatalog.getByRole('link').last();
  await lastEntry.scrollIntoViewIfNeeded();
  assert(await compactCatalog.locator('.ml-catalog-results').first().evaluate(el => el.scrollTop > 0 && el.scrollHeight > el.clientHeight));
  await compactCatalog.getByRole('button', { name: '关闭导航面板' }).click();
  await gallery.locator('#component-catalog').waitFor({ state: 'hidden' });
  await copy.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  assert.equal(await two.getByRole('link').evaluate(el => getComputedStyle(el).outlineColor), await two.evaluate(el => {
    const probe = document.createElement('span'); probe.style.color = 'Highlight'; el.append(probe);
    const color = getComputedStyle(probe).color; probe.remove(); return color;
  }));
  assert.deepEqual(errors, []);
  console.log(engine.name() + ': offline examples show text without routing; hierarchical browsing, global search, legacy links and responsive layouts passed.');
} finally {
  await browser?.close();
  await rm(temp, { recursive: true, force: true });
}
