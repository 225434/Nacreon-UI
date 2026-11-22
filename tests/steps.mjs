import assert from 'node:assert/strict';
import { mkdtemp, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, firefox } from 'playwright';

const engine = process.argv[2] === 'firefox' ? firefox : chromium;
const browser = await engine.launch({ executablePath: engine.executablePath() });
const root = new URL('../', import.meta.url);
const temp = await mkdtemp(join(tmpdir(), 'ml-steps-'));
const file = join(temp, 'example.html');
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  context.on('page', page => {
    page.setDefaultTimeout(12000);
    page.on('pageerror', error => errors.push(error.message));
  });
  const page = await context.newPage();
  await page.goto(new URL('index.html#steps', root).href);
  const wizard = page.locator('#steps-specimen .steps-wizard');
  const steps = wizard.locator('ml-steps');
  const item = key => steps.locator('li[data-step="' + key + '"]');
  const current = () => steps.evaluate(el => el.current);
  const state = key => item(key).getAttribute('data-ml-step-state');
  const direction = () => steps.locator('ol').evaluate(el => getComputedStyle(el).gridAutoFlow);
  const rule = () => item('record').evaluate(el => {
    const css = getComputedStyle(el, '::after');
    return [css.width, css.height, css.backgroundColor];
  });
  const set = (name, value) => page.locator('input[name="' + name + '"][value="' + value + '"]').evaluate(input => input.click());
  const form = root => root.locator('ml-form[data-wizard-step]:not([hidden]) > form');
  const submit = root => form(root).locator('button[type="submit"]').click();
  const focusWithin = locator => locator.evaluate(el => el === el.getRootNode().activeElement);
  const name = wizard.locator('#steps-record-name');
  const site = wizard.locator('#steps-record-site');
  const frames = wizard.locator('#steps-sampling-frames');
  const notes = wizard.locator('#steps-sampling-notes');

  await wizard.waitFor();
  await set('motion', 'base');
  assert.equal(await page.locator('#catalog-current').textContent(), '步骤条');
  assert.equal(await current(), 'record');
  assert.equal(await direction(), 'column');
  assert.equal((await rule())[1], '2px');
  assert.equal(await item('review').locator('button').isDisabled(), true);
  assert.equal(await state('sampling'), 'pending');
  await set('steps-orientation', 'vertical');
  assert.equal(await direction(), 'row');
  assert.equal((await rule())[0], '2px');
  await set('steps-orientation', 'auto');
  const initialRule = (await rule())[2];

  await submit(wizard);
  const summary = form(wizard).locator('.ml-form-summary');
  await summary.waitFor();
  assert.equal(await focusWithin(summary), true);
  assert.equal(await state('record'), 'error');
  assert.equal(await current(), 'record');
  assert.equal(await steps.locator('[aria-current="step"]').count(), 1);
  await name.fill('封面选片');
  await site.selectOption('mountains');
  assert.equal(await state('record'), 'current');
  await submit(wizard);
  assert.equal(await current(), 'sampling');
  assert.equal(await focusWithin(form(wizard).locator('h3')), true);
  assert.equal(await state('record'), 'complete');
  assert.notEqual((await rule())[2], initialRule);
  assert.equal(await item('record').locator('button').isEnabled(), true);

  await frames.fill('500');
  await submit(wizard);
  assert.equal(await current(), 'sampling');
  assert.equal(await state('sampling'), 'error');
  assert.equal(await form(wizard).locator('.ml-form-error:visible').textContent(), '请输入不大于 240 的值。');
  await frames.fill('96');
  await notes.fill('复核接口照片。');
  await submit(wizard);
  assert.equal(await current(), 'review');
  const review = key => wizard.locator('[data-review="' + key + '"]');
  assert.equal(await review('site').textContent(), '山间湖泊');
  assert.equal(await review('frames').textContent(), '96 张');
  await item('record').locator('button').press('Enter');
  assert.equal(await current(), 'record');
  assert.equal(await name.inputValue(), '封面选片');
  assert.equal(await item('sampling').locator('button').isDisabled(), true);
  await name.fill('山间湖泊复核');
  assert.equal(await state('sampling'), 'pending');
  await submit(wizard);
  assert.equal(await frames.inputValue(), '96');
  assert.equal(await notes.inputValue(), '复核接口照片。');
  await submit(wizard);
  assert.equal(await review('recordName').textContent(), '山间湖泊复核');
  await form(wizard).getByRole('button', { name: '上一步' }).click();
  assert.equal(await current(), 'sampling');
  await submit(wizard);
  await name.evaluate(el => { el.value = ''; });
  await submit(wizard);
  assert.equal(await current(), 'record');
  assert.equal(await state('record'), 'error');
  assert.equal(await focusWithin(name), true);
  await name.fill('山间湖泊复核');
  await submit(wizard);
  await submit(wizard);
  await submit(wizard);
  assert.equal(await current(), '');
  assert.equal(await steps.locator('[aria-current="step"]').count(), 0);
  assert.equal(await steps.locator('[data-ml-step-state="complete"]').count(), 3);
  const done = wizard.locator('.steps-success');
  await done.waitFor();
  assert.match(await done.textContent(), /本地示例 · 山间湖泊复核 · 山间湖泊 · 96 张/);
  await done.getByRole('button', { name: '填写下一份' }).click();
  assert.equal(await current(), 'record');
  assert.equal(await name.inputValue(), '');
  assert.equal(await frames.inputValue(), '');
  assert.equal(await form(wizard).locator('.ml-form-error:visible').count(), 0);

  const flow = page.locator('#steps-examples ml-steps');
  assert.equal(await flow.locator('[aria-current="step"]').locator('..').getAttribute('data-ml-step-state'), 'error');
  await flow.getByRole('button', { name: /资料核对/ }).click();
  assert.equal(await flow.evaluate(el => el.current), 'checked');
  assert.match(await page.locator('#steps-flow-status').textContent(), /1 项附件待补充/);

  const colors = new Set();
  for (const theme of ['light', 'warm', 'dark']) {
    await set('theme', theme);
    colors.add(await steps.evaluate(el => getComputedStyle(el).getPropertyValue('--ml-color-surface').trim()));
    for (const material of ['base', 'low', 'medium', 'high']) {
      await set('material', material);
      for (const motion of ['base', 'low', 'medium', 'high']) {
        await set('motion', motion);
        assert.deepEqual(await steps.evaluate(el => {
          const css = getComputedStyle(el);
          return ['--ml-material-level', '--ml-motion-level'].map(prop => css.getPropertyValue(prop).trim());
        }), [material, motion]);
      }
    }
  }
  assert.equal(colors.size, 3);

  await page.setViewportSize({ width: 320, height: 840 });
  await steps.locator('..').locator('ml-steps[data-ml-steps-vertical]').waitFor();
  assert.equal(await direction(), 'row');
  const narrowRail = await rule();
  assert.equal(narrowRail[0], '2px');
  assert(parseFloat(narrowRail[1]) > 0);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await item('record').locator('.ml-step-marker').evaluate(el => getComputedStyle(el).animationName), 'none');
  await set('steps-orientation', 'horizontal');
  assert.equal(await direction(), 'column');
  await set('steps-orientation', 'vertical');
  await page.locator('#open-code').click();
  const snippet = await page.locator('#code-sample').textContent();
  assert.match(snippet, /orientation="vertical"/);
  assert.doesNotMatch(snippet, /class="ml-step-marker"/);
  await writeFile(file, '<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><base href="' + root.href + '">' + snippet);
  const copy = await context.newPage();
  await copy.setViewportSize({ width: 320, height: 840 });
  await copy.goto(pathToFileURL(file).href);
  const sample = copy.locator('#steps-wizard-sample');
  await sample.locator('#steps-record-name').fill('离线选片');
  await sample.locator('#steps-record-site').selectOption('coast');
  await submit(sample);
  await sample.locator('#steps-sampling-frames').fill('24');
  await submit(sample);
  await submit(sample);
  assert.match(await sample.locator('.steps-success').textContent(), /离线选片 · 海岸日出 · 24 张/);

  await copy.evaluate(() => {
    const guide = document.createElement('ml-steps');
    guide.id = 'standalone-steps';
    guide.innerHTML = '<ol aria-label="流程"><li data-step="draft"><span><span class="ml-step-label">草稿</span></span></li>' +
      '<li data-step="area"><a href="#area-info"><span class="ml-step-label">区域</span></a></li></ol>';
    guide.querySelector('a').href = new URL('#area-info', location.href).href;
    const target = document.createElement('p');
    target.id = 'area-info';
    target.textContent = '区域说明';
    document.body.append(guide, target);
  });
  const guide = copy.locator('#standalone-steps');
  await guide.getByRole('link', { name: /区域/ }).click();
  assert.equal(new URL(copy.url()).hash, '#area-info');
  await guide.evaluate(el => {
    el.current = 'area';
    el.querySelector('[data-step="draft"]').hidden = true;
  });
  assert.equal(await guide.locator('a[aria-current="step"] .ml-step-marker').textContent(), '1');
  assert.deepEqual(errors, []);
  console.log(engine.name() + ': verified step navigation, wizard validation and drafts, adaptive connectors, 48 appearances and offline flow');
} finally {
  await browser.close();
  await unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; });
  await rmdir(temp);
}
