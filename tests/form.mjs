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
const temp = await mkdtemp(join(tmpdir(), 'ml-form-test-'));
const path = join(temp, 'example.html');
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  const page = await context.newPage();
  await page.goto(new URL('index.html#form', root).href);
  const specimen = page.locator('#form-specimen');
  const panel = specimen.locator('ml-form');
  const form = panel.locator('form');
  const name = form.locator('#form-record-name');
  const area = form.locator('#form-record-area');
  const frames = form.locator('#form-record-frames');
  const summary = form.locator('.ml-form-summary');
  const trigger = form.locator('.ml-multi-trigger');
  const errorsIn = scope => scope.locator('.ml-form-error:not([hidden])');
  const layout = value => page.locator('input[name="form-layout"][value="' + value + '"]').evaluate(input => input.click());
  const columnCount = grid => grid.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  const grid = form.locator('.ml-form-grid');
  const prominent = scope => scope.locator('button[type="submit"]').first();

  await specimen.waitFor();
  assert.equal(await page.locator('#catalog-current').textContent(), '通用表单');
  assert.equal(await columnCount(grid), 2);
  assert.equal(await grid.locator('[data-span="full"]').evaluate(el => getComputedStyle(el).gridColumn), '1 / -1');
  await layout('horizontal');
  assert.equal(await columnCount(grid.locator('.ml-form-field').first()), 2);
  await layout('stacked');
  assert.equal(await columnCount(grid), 1);
  await layout('columns');
  assert.equal(await columnCount(grid), 2);

  await form.evaluate(el => {
    const count = { submits: 0 };
    el.addEventListener('submit', () => { count.submits++; });
    el.testCount = count;
    const frame = el.elements.frames;
    const detail = document.createElement('p');
    detail.id = 'extra-frame-hint';
    detail.hidden = true;
    frame.after(detail);
    frame.setAttribute('aria-describedby', 'extra-frame-hint');
    frame.setAttribute('aria-invalid', 'false');
    el.parentElement.refresh();
  });
  await name.focus();
  await frames.focus();
  assert.deepEqual(await errorsIn(form).allTextContents(), ['请填写此项。']);
  assert.equal(await summary.isVisible(), false);
  await prominent(form).click();
  await summary.waitFor();
  assert.equal(await summary.evaluate(el => el === document.activeElement), true);
  assert.equal(await summary.locator('strong').textContent(), '请检查 4 项');
  assert.equal(await errorsIn(form).count(), 4);
  assert.equal(await form.evaluate(el => el.testCount.submits), 0);
  assert.equal(await form.locator('[data-ml-input-part="error"]:visible, .ml-multi-error:visible').count(), 0);
  const descriptions = (await frames.getAttribute('aria-describedby')).split(' ');
  assert(descriptions.includes('extra-frame-hint'));
  assert(descriptions.some(id => id.startsWith('ml-form-text-')));

  await summary.getByRole('button', { name: '复核人员', exact: true }).focus();
  await page.keyboard.press('Enter');
  assert.equal(await trigger.evaluate(el => el === el.ownerDocument.activeElement), true);
  assert.equal(await trigger.getAttribute('aria-invalid'), 'true');
  assert.match(await trigger.getAttribute('aria-describedby'), /ml-form-text-/);
  await trigger.click();
  await page.getByRole('option', { name: '示例成员 A', exact: true }).click();
  await page.keyboard.press('Escape');
  assert.equal(await summary.locator('strong').textContent(), '请检查 3 项');

  await frames.fill('500');
  assert((await errorsIn(form).allTextContents()).includes('请输入不大于 240 的值。'));
  await frames.fill('1');
  assert.equal(await frames.getAttribute('aria-invalid'), 'false');
  const retained = (await frames.getAttribute('aria-describedby')).split(' ');
  assert(retained.includes('extra-frame-hint'));
  assert.equal(retained.length, 2);
  await name.fill('相册复核');
  await area.selectOption('coast');
  await summary.waitFor({ state: 'hidden' });
  await form.evaluate(el => {
    el.elements.recordName.setCustomValidity('记录名称已存在。');
    el.parentElement.reportValidity();
  });
  assert.equal(await name.evaluate(el => el === el.ownerDocument.activeElement), true);
  assert.deepEqual(await errorsIn(form).allTextContents(), ['记录名称已存在。']);
  await form.evaluate(el => {
    el.elements.recordName.setCustomValidity('');
    el.parentElement.refresh();
  });
  await page.locator('#form-tools button').click();
  await prominent(form).click();
  assert.match(await form.locator('.ml-form-result').textContent(), /封面选片 · 山间湖泊 · 96 张 · 2 人复核/);
  assert.deepEqual(await form.evaluate(el => new FormData(el).getAll('reviewers')), ['member-a', 'member-b']);
  await form.locator('button[type="reset"]').click();
  assert.equal(await name.inputValue(), '');
  assert.equal(await form.locator('.ml-form-result').textContent(), '');
  assert.equal(await errorsIn(form).count(), 0);
  assert.equal(await summary.isVisible(), false);

  const attachment = page.locator('#form-examples form');
  await attachment.locator('input[type="file"]').focus();
  await prominent(attachment).focus();
  assert.equal(await errorsIn(attachment).count(), 0);
  await prominent(attachment).click();
  await errorsIn(attachment).waitFor();
  assert.equal(await errorsIn(attachment).textContent(), '请选择文件。');
  assert.equal(await attachment.locator('.ml-file-message').textContent(), '');
  await attachment.locator('input[type="file"]').setInputFiles({
    name: '素材数据.csv', mimeType: 'text/csv', buffer: Buffer.from('time,frame\n10:05,96'),
  });
  await prominent(attachment).click();
  assert.match(await attachment.locator('.ml-form-result').textContent(), /素材数据\.csv/);
  assert.equal(await errorsIn(attachment).count(), 0);

  await page.setViewportSize({ width: 320, height: 900 });
  assert.equal(await columnCount(grid), 1);
  await layout('horizontal');
  assert.equal(await columnCount(grid.locator('.ml-form-field').first()), 1);
  await prominent(form).click();
  await summary.waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator('#open-code').click();
  const snippet = await page.locator('#code-sample').textContent();
  assert.match(snippet, /layout="horizontal"/);
  assert.doesNotMatch(snippet, /class="ml-form-summary"/);
  await writeFile(path, '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><base href="' + root.href + '">' + snippet);
  const copy = await context.newPage();
  await copy.goto(pathToFileURL(path).href);
  const copied = copy.locator('#record-form-sample form');
  await prominent(copied).click();
  await copied.locator('.ml-form-summary').waitFor();
  assert.equal(await errorsIn(copied).count(), 4);

  await copy.evaluate(() => {
    const wrapper = document.createElement('ml-form');
    wrapper.innerHTML = `<form aria-label="独立表单">
      <fieldset class="ml-form-field"><legend class="ml-form-label">格式</legend>
        <label><input type="radio" name="format" value="pdf" required>PDF</label>
        <label><input type="radio" name="format" value="csv" required>CSV</label>
      </fieldset>
      <div class="ml-form-field"><input name="email" type="email" aria-label="邮箱" required></div>
      <button type="submit" id="draft" formnovalidate>存草稿</button>
      <button type="submit" id="send">提交</button>
    </form>`;
    document.body.append(wrapper);
    wrapper.form.addEventListener('submit', event => {
      event.preventDefault();
      wrapper.dataset.submittedBy = event.submitter.id;
    });
  });
  const standalone = copy.getByRole('form', { name: '独立表单' });
  await standalone.locator('#draft').click();
  assert.equal(await standalone.locator('.ml-form-summary').isVisible(), false);
  assert.equal(await standalone.evaluate(el => el.parentElement.dataset.submittedBy), 'draft');
  await standalone.locator('#send').click();
  assert.deepEqual(await errorsIn(standalone).allTextContents(), ['请选择一项。', '请填写此项。']);
  assert.equal(await standalone.locator('.ml-form-summary li').count(), 2);
  await standalone.locator('input[value="pdf"]').check();
  await standalone.locator('input[type="email"]').fill('invalid@');
  assert.deepEqual(await errorsIn(standalone).allTextContents(), ['请输入有效的电子邮箱地址。']);
  await standalone.locator('input[type="email"]').fill('test@example.com');
  await standalone.locator('#send').click();
  assert.equal(await standalone.evaluate(el => el.parentElement.dataset.submittedBy), 'send');
  assert.equal(await errorsIn(standalone).count(), 0);
  const email = standalone.locator('input[type="email"]');
  await email.fill('');
  await email.press('Enter');
  const standaloneSummary = standalone.locator('.ml-form-summary');
  assert.equal(await standaloneSummary.evaluate(el => el === document.activeElement), false);
  await copied.locator('#form-record-name').press('Enter');
  assert.equal(await copied.locator('.ml-form-summary').evaluate(el => el === document.activeElement), true);
  await email.focus();
  assert.equal(await standalone.evaluate(el => el.checkValidity()), false);
  assert.equal(await email.evaluate(el => el === document.activeElement), true);
  await copy.evaluate(() => {
    const section = document.createElement('section');
    section.id = 'external-fields';
    section.innerHTML = '<ml-form><form id="first-owner"></form></ml-form><ml-form><form id="next-owner"></form></ml-form>' +
      '<fieldset class="ml-form-field"><legend>交接备注</legend><input name="note" form="first-owner" required></fieldset>' +
      '<button type="submit" form="first-owner">保存外部字段</button>';
    document.body.append(section);
    section.addEventListener('submit', event => event.preventDefault());
  });
  const external = copy.locator('#external-fields');
  const field = external.locator('input');
  const firstForm = external.locator('ml-form').first(), nextForm = external.locator('ml-form').last();
  assert.equal(await firstForm.evaluate(el => el.reportValidity()), false);
  assert(await field.evaluate(el => el === document.activeElement));
  await external.getByRole('button', { name: '保存外部字段' }).click();
  assert(await firstForm.locator('.ml-form-summary').evaluate(el => el === document.activeElement));
  await field.fill('复核完成');
  await firstForm.locator('.ml-form-summary').waitFor({ state: 'hidden' });
  await field.evaluate(el => { el.setAttribute('form', 'next-owner'); el.value = ''; });
  assert.equal(await firstForm.evaluate(el => el.reportValidity()), true);
  assert.equal(await nextForm.evaluate(el => el.reportValidity()), false);
  await field.evaluate(el => { el.closest('fieldset').disabled = true; });
  await nextForm.locator('.ml-form-summary').waitFor({ state: 'hidden' });
  await field.evaluate(el => { el.closest('fieldset').disabled = false; });
  await nextForm.locator('.ml-form-summary').waitFor();
  await nextForm.evaluate(el => el.form.reset());
  await nextForm.locator('.ml-form-summary').waitFor({ state: 'hidden' });
  await field.evaluate(el => { el.removeAttribute('form'); });
  await copy.waitForFunction(() => !document.querySelector('#external-fields input').hasAttribute('data-ml-form-managed'));
  assert.equal(await external.locator('.ml-form-error').count(), 0);
  await firstForm.evaluate(el => {
    const section = el.parentElement;
    el.remove();
    el.reportValidity();
    section.prepend(el);
    section.querySelector('input').setAttribute('form', el.form.id);
  });
  await firstForm.locator('.ml-form-summary').waitFor();
  await field.evaluate(el => { el.removeAttribute('required'); });
  await firstForm.locator('.ml-form-summary').waitFor({ state: 'hidden' });
  assert.deepEqual(errors, []);
  console.log(engine.name() + ' form layout, validation, keyboard navigation, native submission, and offline export passed');
} finally {
  await browser.close();
  await unlink(path).catch(error => { if (error.code !== 'ENOENT') throw error; });
  await rmdir(temp);
}
