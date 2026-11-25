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
const temp = await mkdtemp(join(tmpdir(), 'ml-tabs-test-'));
const file = join(temp, 'example.html');
const grades = ['base', 'low', 'medium', 'high'];

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  context.setDefaultTimeout(8000);
  const errors = [];
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  const page = await context.newPage();
  const route = name => page.goto(new URL('index.html#' + name, root).href);
  const choose = (name, value) => page.locator('input[name="' + name + '"][value="' + value + '"]').evaluate(el => el.click());
  const active = tabs => tabs.evaluate(el => el.value);
  const focused = el => el.evaluate(node => node === document.activeElement);
  const frames = () => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));

  await route('switch');
  await page.locator('#open-catalog').click();
  await page.getByRole('dialog', { name: '导航面板' }).getByRole('searchbox').fill('选项卡');
  await page.getByRole('dialog', { name: '导航面板' }).getByRole('searchbox').press('Enter');
  const tabs = page.locator('#tabs-specimen > ml-tabs');
  const bar = tabs.getByRole('tablist', { name: '素材记录' });
  const overview = bar.getByRole('tab', { name: '概览' });
  const samples = bar.getByRole('tab', { name: '照片分布' });
  const notes = bar.getByRole('tab', { name: '交接备注' });
  const disabled = bar.getByRole('tab', { name: '报告导出' });
  const note = tabs.getByRole('textbox', { name: '下次选片事项' });
  const shown = tabs.getByRole('tabpanel');
  await tabs.waitFor({ state: 'visible' });
  assert.equal(await active(tabs), 'overview');
  assert.equal(await shown.getAttribute('aria-labelledby'), await overview.getAttribute('id'));
  assert.equal(await overview.getAttribute('aria-controls'), await shown.getAttribute('id'));
  assert(await disabled.isDisabled());

  await tabs.evaluate(el => {
    window.changes = [];
    el.addEventListener('ml-tab-change', event => {
      const { previousValue, value, tab, panel } = event.detail;
      window.changes.push([previousValue, value, tab.dataset.tab, panel.dataset.panel]);
    });
  });
  await overview.press('ArrowRight');
  assert(await focused(samples));
  assert.equal(await active(tabs), 'samples');
  assert.deepEqual(await page.evaluate(() => window.changes), [['overview', 'samples', 'samples', 'samples']]);
  await samples.press('End');
  assert(await focused(notes));
  assert.equal(await active(tabs), 'notes');
  await notes.press('ArrowRight');
  assert(await focused(overview));
  assert.equal(await active(tabs), 'overview');

  await choose('tabs-activation', 'manual');
  await overview.press('ArrowRight');
  assert(await focused(samples));
  assert.equal(await active(tabs), 'overview');
  await page.keyboard.press('Tab');
  assert(await focused(shown));
  await page.keyboard.press('Shift+Tab');
  assert(await focused(overview));
  await overview.press('End');
  await page.keyboard.press('Space');
  assert.equal(await active(tabs), 'notes');
  const memo = '\n湖泊 <A & B> 已完成复核';
  await note.fill(memo);
  await tabs.evaluate(el => el.select('overview'));
  assert(await focused(overview));
  await notes.click();
  assert.equal(await note.inputValue(), memo);

  await choose('tabs-layout', 'vertical');
  await choose('tabs-variant', 'pill');
  assert.equal(await bar.getAttribute('aria-orientation'), 'vertical');
  await notes.press('ArrowUp');
  assert(await focused(samples));
  assert.equal(await active(tabs), 'notes');
  await page.keyboard.press('Enter');
  assert.equal(await active(tabs), 'samples');
  await choose('tabs-variant', 'line');

  const layer = tabs.locator(':scope > .ml-optical');
  const marker = bar.locator('.ml-tabs-marker');
  for (const theme of ['light', 'warm', 'dark']) {
    await choose('theme', theme);
    for (const material of grades) {
      await choose('material', material);
      for (const motion of grades) {
        await choose('motion', motion);
        await frames();
        assert.equal(await layer.count(), 1, [theme, material, motion].join('/'));
        assert(await layer.evaluate(el => getComputedStyle(el).borderRadius === getComputedStyle(el.parentElement).borderRadius));
        const seconds = await marker.evaluate(el => parseFloat(getComputedStyle(el).transitionDuration));
        assert.equal(seconds > 0, motion === 'medium' || motion === 'high');
      }
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await shown.evaluate(el => getComputedStyle(el).animationName), 'none');
  assert.equal(await marker.evaluate(el => parseFloat(getComputedStyle(el).transitionDuration)), 0);
  await page.emulateMedia({ forcedColors: 'active' });
  await layer.waitFor({ state: 'detached' });
  assert.equal(await samples.evaluate(el => getComputedStyle(el).textDecorationLine), 'underline');
  await page.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'none' });

  await page.setViewportSize({ width: 320, height: 920 });
  await page.waitForFunction(() => document.querySelector('#tabs-specimen [data-ml-tablist]').getAttribute('aria-orientation') === 'horizontal');
  await samples.press('ArrowRight');
  assert(await focused(notes));
  assert.equal(await active(tabs), 'samples');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const archive = page.locator('#tabs-examples ml-tabs');
  const photos = archive.getByRole('tab', { name: '拍摄照片' });
  const reports = archive.getByRole('tab', { name: '归档报告' });
  await photos.press('End');
  assert(await focused(reports));
  assert.equal(await active(archive), 'photos');
  assert(await archive.getByRole('tablist').evaluate(el => el.scrollLeft > 0));
  await page.keyboard.press('Enter');
  assert.equal(await active(archive), 'reports');
  await page.setViewportSize({ width: 1280, height: 920 });
  await page.locator('#open-code').focus();
  await page.setViewportSize({ width: 320, height: 920 });
  await page.waitForFunction(() => document.querySelector('#tabs-examples [data-ml-tablist]').scrollLeft > 0);
  await archive.evaluate(el => { el.querySelector('[data-ml-tablist]').dir = 'rtl'; });
  await reports.press('Home');
  assert(await focused(photos));
  await photos.press('ArrowRight');
  assert(await focused(reports));

  await notes.click();
  await page.locator('#open-code').click();
  const code = await page.locator('#code-sample').textContent();
  assert(!code.includes('<ml-icon'));
  const example = await context.newPage();
  await writeFile(file, '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><base href="' + root.href + '">' + code);
  await example.goto(pathToFileURL(file).href);
  const exported = example.locator('ml-tabs').last();
  assert.equal(await active(exported), 'notes');
  assert.equal(await exported.getByRole('textbox').inputValue(), memo);
  assert.equal(await exported.getByRole('tablist').getAttribute('aria-orientation'), 'vertical');
  await exported.evaluate(el => el.before(el.cloneNode(true)));
  assert(await example.locator('ml-tabs').evaluateAll(groups => {
    const allIds = groups.flatMap(group => [...group.querySelectorAll('[role="tab"][id], [role="tabpanel"][id]')].map(el => el.id));
    return new Set(allIds).size === allIds.length && groups.every(group =>
      [...group.querySelectorAll('[role="tab"]')].every(tab => {
        const panel = document.getElementById(tab.getAttribute('aria-controls'));
        return panel?.parentElement === group && panel.getAttribute('aria-labelledby') === tab.id;
      }));
  }));

  await exported.evaluate(el => {
    const tab = el.querySelector('[data-tab="notes"]');
    tab.focus();
    tab.setAttribute('aria-disabled', 'true');
    el.querySelector('[data-panel="samples"]').remove();
  });
  assert.equal(await active(exported), 'overview');
  assert(await focused(exported.getByRole('tab', { name: '概览' })));
  assert.equal(await exported.getByRole('tab', { name: '照片分布' }).count(), 0);
  assert(await exported.getByRole('tab', { name: '交接备注' }).isDisabled());
  await exported.evaluate(el => {
    const panel = document.createElement('section');
    panel.dataset.panel = 'samples';
    panel.textContent = '新选片记录';
    el.append(panel);
  });
  assert(await exported.evaluate(el => el.select('samples')));
  assert.equal(await exported.getByRole('tabpanel').textContent(), '新选片记录');
  await exported.evaluate(el => { for (const button of el.querySelectorAll('button[data-tab]')) button.disabled = true; });
  assert.equal(await active(exported), '');
  assert.equal(await exported.getByRole('tabpanel').count(), 0);
  assert.deepEqual(errors, []);
  console.log(engine.name() + ': verified tab roles, focus, responsive orientation, 48 appearances, live changes and offline code.');
} finally {
  await browser.close();
  await unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; });
  await rmdir(temp);
}
