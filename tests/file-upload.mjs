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
const temp = await mkdtemp(join(tmpdir(), 'ml-upload-test-'));
const file = join(temp, 'sample.html');
const grades = ['base', 'low', 'medium', 'high'];
const fixture = (name, mimeType) => ({ name, mimeType, buffer: Buffer.from('test file') });

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  context.setDefaultTimeout(8000);
  const errors = [];
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  const page = await context.newPage();
  const route = name => page.goto(new URL('index.html#' + name, root).href);
  const choose = (name, value) => page.locator('input[name="' + name + '"][value="' + value + '"]').evaluate(el => el.click());
  const names = field => field.evaluate(el => el.files.map(file => file.name));
  const nativeNames = field => field.evaluate(el => [...el.input.files].map(file => file.name));
  const focused = locator => locator.evaluate(el => el === el.ownerDocument.activeElement);
  const frames = () => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  const drop = (zone, files) => zone.evaluate((el, batch) => {
    const dataTransfer = new DataTransfer();
    for (const [name, type, size = 2] of batch) dataTransfer.items.add(new File([new Uint8Array(size)], name, { type, lastModified: 17 }));
    const trigger = type => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer }));
    trigger('dragenter');
    trigger('dragover');
    const owner = el.closest('ml-file-upload');
    const lit = owner.hasAttribute('data-ml-file-drag');
    const prevented = !trigger('drop');
    return { lit, prevented, clear: !owner.hasAttribute('data-ml-file-drag') };
  }, files);

  await route('switch');
  await page.locator('#open-catalog').click();
  await page.getByRole('dialog', { name: '导航面板' }).getByRole('searchbox').fill('拖放上传');
  await page.getByRole('dialog', { name: '导航面板' }).getByRole('searchbox').press('Enter');
  const field = page.locator('#file-upload-specimen ml-file-upload');
  const zone = field.locator('ml-file-drop');
  const native = field.locator('input[type="file"]');
  const message = field.locator('.ml-file-message');
  await zone.waitFor({ state: 'visible' });
  const chooserWait = page.waitForEvent('filechooser');
  await zone.locator('label').click();
  const chooser = await chooserWait;
  assert(chooser.isMultiple());
  await chooser.setFiles(fixture('现场.png', 'image/png'));
  assert.deepEqual(await names(field), ['现场.png']);
  assert.deepEqual(await nativeNames(field), ['现场.png']);

  const drag = await drop(zone, [
    ['报告.PDF', 'application/pdf'], ['跳过.txt', 'text/plain'], ['超大.jpg', 'image/jpeg', 10485761],
    ['校核.csv', 'text/csv'], ['接口.jpg', 'image/jpeg'], ['超出.png', 'image/png'],
  ]);
  assert.deepEqual(drag, { lit: true, prevented: true, clear: true });
  assert.deepEqual(await names(field), ['现场.png', '报告.PDF', '校核.csv', '接口.jpg']);
  assert.deepEqual(await nativeNames(field), await names(field));
  assert.match(await message.textContent(), /类型不符合要求.*大小限制.*数量限制/);
  await drop(zone, [['校核.csv', 'text/csv']]);
  assert.match(await message.textContent(), /校核\.csv.*已添加/);
  await field.getByRole('button', { name: '移除校核.csv' }).press('Enter');
  assert.deepEqual(await names(field), ['现场.png', '报告.PDF', '接口.jpg']);
  assert(await focused(field.getByRole('button', { name: '移除接口.jpg' })));
  await native.evaluate(el => { el.disabled = true; });
  assert.deepEqual(await drop(zone, [['禁用期间.png', 'image/png']]), { lit: false, prevented: true, clear: true });
  assert.equal((await names(field)).length, 3);
  await native.evaluate(el => { el.disabled = false; });

  const layer = zone.locator(':scope > .ml-optical');
  for (const theme of ['light', 'warm', 'dark']) {
    await choose('theme', theme);
    for (const material of grades) {
      await choose('material', material);
      for (const motion of grades) {
        await choose('motion', motion);
        await frames();
        assert.equal(await layer.count(), 1, [theme, material, motion].join('/'));
        assert(await layer.evaluate(el => getComputedStyle(el).borderRadius === getComputedStyle(el.parentElement).borderRadius));
      }
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
  await layer.waitFor({ state: 'detached' });
  assert.equal(await zone.evaluate(el => getComputedStyle(el).transitionDuration), '0s');
  await page.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'none' });

  await field.evaluate(el => {
    window.fileRuns = new Map();
    el.upload = (file, { signal, onProgress }) => new Promise((resolve, reject) => {
      const history = window.fileRuns.get(file.name) || [];
      history.push({ signal, onProgress, resolve, reject });
      window.fileRuns.set(file.name, history);
    });
  });
  await field.getByRole('button', { name: '模拟上传' }).press('Enter');
  const first = field.locator('.ml-file-row').nth(0);
  const second = field.locator('.ml-file-row').nth(1);
  await page.evaluate(() => window.fileRuns.get('现场.png')[0].onProgress(5, 10));
  assert.equal(await first.getByRole('progressbar').getAttribute('value'), '50');
  await first.getByRole('button', { name: '取消上传现场.png' }).press('Enter');
  assert.equal(await first.getAttribute('data-state'), 'canceled');
  assert(await page.evaluate(() => window.fileRuns.get('现场.png')[0].signal.aborted));
  await first.getByRole('button', { name: '重试现场.png' }).press('Enter');
  await page.evaluate(() => {
    const firstRun = window.fileRuns.get('现场.png')[0];
    firstRun.onProgress(10, 10);
    firstRun.resolve();
    window.fileRuns.get('报告.PDF')[0].reject(new Error('new attempt required'));
    window.fileRuns.get('接口.jpg')[0].resolve();
  });
  assert.equal(await first.getAttribute('data-state'), 'uploading');
  assert.equal(await first.getByRole('progressbar').getAttribute('value'), null);
  assert.equal(await second.getAttribute('data-state'), 'error');
  await second.getByRole('button', { name: '重试报告.PDF' }).press('Enter');
  await page.evaluate(() => {
    window.fileRuns.get('现场.png')[1].resolve();
    window.fileRuns.get('报告.PDF')[1].resolve();
  });
  assert.equal(await field.locator('.ml-file-row[data-state="complete"]').count(), 3);

  await choose('file-upload-kind', 'compact');
  await page.setViewportSize({ width: 320, height: 900 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const beforeExpand = await names(field);
  await page.locator('#expand-stage').click();
  await page.keyboard.press('Escape');
  assert.deepEqual(await names(field), beforeExpand);

  const form = page.locator('#file-attachment-form');
  const attachments = form.locator('ml-file-upload');
  const submit = form.getByRole('button', { name: '查看提交文件' });
  await submit.click();
  assert.equal(await attachments.locator('.ml-file-message').textContent(), '请先选择文件。');
  assert(await focused(attachments.locator('input[type="file"]')));
  await drop(attachments.locator('ml-file-drop'), [['日报.csv', 'text/csv'], ['附件.pdf', 'application/pdf']]);
  assert.deepEqual(await form.evaluate(el => new FormData(el).getAll('attachments').map(f => f.name)), ['日报.csv', '附件.pdf']);
  await submit.click();
  assert.equal(await form.locator('#file-attachment-result').textContent(), '表单文件 日报.csv、附件.pdf');
  await form.getByRole('button', { name: '重置' }).click();
  assert.deepEqual(await names(attachments), []);

  const single = page.locator('#file-single-photo');
  await page.locator('#file-photo-sample').click();
  await page.locator('#file-photo-sample').click();
  assert.deepEqual(await names(single), ['岸边特写.png']);
  await drop(single.locator('ml-file-drop'), [['不可用.txt', 'text/plain']]);
  assert.deepEqual(await nativeNames(single), ['岸边特写.png']);

  await page.locator('#open-code').click();
  const code = await page.locator('#code-sample').textContent();
  await writeFile(file, '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><base href="' + root.href + '">' + code);
  const example = await context.newPage();
  await example.goto(pathToFileURL(file).href);
  const exported = example.locator('ml-file-upload');
  assert.equal(await exported.getAttribute('compact'), '');
  await exported.locator('input[type="file"]').setInputFiles(fixture('离线.csv', 'text/csv'));
  await exported.getByRole('button', { name: '模拟上传' }).press('Enter');
  await exported.locator('.ml-file-row[data-state="complete"]').waitFor();
  const dynamic = await example.evaluate(async () => {
    const form = document.createElement('form');
    const host = document.createElement('ml-file-upload');
    document.body.append(form);
    form.append(host);
    const input = document.createElement('input');
    input.type = 'file'; input.name = 'attachment';
    input.setAttribute('aria-describedby', 'existing-hint');
    host.append(input);
    await Promise.resolve();
    const late = host.querySelector('label')?.control === input;
    const changes = [];
    host.addEventListener('ml-files-change', event => changes.push(event.detail.files.map(file => file.name)));
    host.addFiles([new File(['old'], 'old.txt')]);
    let finish, signal, progress, selectionAtAbort, abortedAtChange;
    host.upload = (_, options) => new Promise(resolve => {
      finish = resolve; signal = options.signal; progress = options.onProgress;
      signal.addEventListener('abort', () => { selectionAtAbort = host.entries.map(entry => entry.file.name); });
    });
    const pending = host.start();
    host.addEventListener('ml-files-change', () => { abortedAtChange = signal.aborted; }, { once: true });
    const next = input.cloneNode();
    const transfer = new DataTransfer(); transfer.items.add(new File(['new'], 'new.txt'));
    next.files = transfer.files;
    input.replaceWith(next);
    progress(1, 1); finish();
    await Promise.resolve();
    const rebound = host.querySelector('label')?.control === next;
    await pending;
    const selected = [host.files[0]?.name, host.entries[0]?.state, new FormData(form).get('attachment')?.name];
    const priorDescription = input.getAttribute('aria-describedby');
    next.remove(); await Promise.resolve();
    const removed = !host.querySelector('.ml-file-view') && !host.hasAttribute('data-ml-file-ready') && !host.entries.length;
    host.remove(); form.append(host); host.append(input); await Promise.resolve();
    const views = host.querySelectorAll('.ml-file-view').length;
    form.remove();
    return { late, rebound, abortedAtChange, selectionAtAbort, selected, priorDescription, removed, views, changes };
  });
  assert.deepEqual(dynamic, { late: true, rebound: true, abortedAtChange: true, selectionAtAbort: ['new.txt'], selected: ['new.txt', 'ready', 'new.txt'],
    priorDescription: 'existing-hint', removed: true, views: 1, changes: [['old.txt'], ['new.txt'], [], ['old.txt']] });
  await example.addInitScript(() => { delete window.DataTransfer; });
  await example.reload();
  assert(await exported.locator('input[type="file"]').evaluate(el => el.getBoundingClientRect().width > 10));
  assert.equal(await exported.locator('ml-file-drop').count(), 0);
  assert.deepEqual(errors, []);
  console.log(engine.name() + ': verified file chooser, drop, constraints, native forms, cancellation and retry, 48 appearances and offline code.');
} finally {
  await browser.close();
  await unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; });
  await rmdir(temp);
}
