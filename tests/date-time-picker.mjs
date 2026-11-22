import assert from 'node:assert/strict';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, firefox } from 'playwright';

const engine = process.argv[2] === 'firefox' ? firefox : chromium;
const browser = await engine.launch({ executablePath: engine.executablePath() });
const temp = await mkdtemp(join(tmpdir(), 'ml-date-time-picker-'));
const file = join(temp, 'example.html');
const root = new URL('../', import.meta.url);
const errors = [];
const focused = locator => locator.evaluate(el => el === el.getRootNode().activeElement);
const opener = picker => picker.locator(':scope > [data-ml-part="open"]');
const datePanel = picker => picker.getByRole('dialog', { name: '选择日期', exact: true });
const timePanel = picker => picker.getByRole('dialog', { name: '选择时间', exact: true });
const day = (dialog, label) => dialog.getByRole('button', { name: new RegExp(label + '，') });
const hour = dialog => dialog.getByRole('listbox', { name: '小时', exact: true });
const minute = dialog => dialog.getByRole('listbox', { name: '分钟', exact: true });
const second = dialog => dialog.getByRole('listbox', { name: '秒', exact: true });
const reading = dialog => dialog.locator('.ml-time-reading').textContent();
const options = list => list.getByRole('option').allTextContents();

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 880 }, reducedMotion: 'no-preference' });
  context.on('page', page => {
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
  });
  const page = await context.newPage();
  const route = name => page.goto(new URL('index.html#' + name, root).href);
  const change = (name, value) => page.locator('input[name="' + name + '"][value="' + value + '"]').evaluate(input => input.click());
  const sample = name => page.locator('#value-specimen > ml-' + name);
  async function copyCode() {
    await page.locator('#open-code').click();
    const text = await page.locator('#code-sample').textContent();
    await page.locator('#close-code').click();
    return text;
  }
  async function record(picker) {
    await picker.evaluate(host => {
      host.pickedEvents = [];
      for (const name of ['input', 'change']) host.addEventListener(name, event => host.pickedEvents.push([name, event.target.value]));
    });
    return () => picker.evaluate(host => host.pickedEvents);
  }

  await route('date-picker');
  await change('material', 'base');
  await change('motion', 'base');
  const date = sample('date-picker'), dates = datePanel(date);
  const pickedDate = await record(date);
  assert.equal(await page.locator('#catalog-current').textContent(), '单日期选择器');
  await opener(date).press('Enter');
  assert(await focused(day(dates, '2030年11月20日')));
  await page.keyboard.press('ArrowRight');
  assert(await focused(day(dates, '2030年11月21日')));
  await page.keyboard.press('Enter');
  await dates.waitFor({ state: 'hidden' });
  assert.equal(await date.locator('input').inputValue(), '2030-11-21');
  assert(await focused(opener(date)));
  assert.deepEqual(await pickedDate(), [['input', '2030-11-21'], ['change', '2030-11-21']]);
  await date.evaluate(el => { el.value = '2032-02-29'; });
  await opener(date).click();
  assert(await focused(day(dates, '2032年2月29日')));
  await page.keyboard.press('Shift+PageUp');
  assert(await focused(day(dates, '2031年2月28日')));
  await page.keyboard.press('Escape');
  await dates.waitFor({ state: 'hidden' });
  assert.equal(await date.locator('input').inputValue(), '2032-02-29');
  await opener(date).click();
  await page.mouse.click(4, 4);
  await dates.waitFor({ state: 'hidden' });
  assert.equal(await date.locator('input').inputValue(), '2032-02-29');

  await change('value-kind', '1');
  await opener(date).click();
  assert(await dates.getByRole('button', { name: '今天' }).isDisabled());
  assert(await dates.getByRole('button', { name: '下个月' }).isDisabled());
  await dates.getByRole('button', { name: '清除' }).click();
  assert.equal(await date.locator('input').inputValue(), '');
  await change('value-state', 'disabled');
  assert(await opener(date).isDisabled());
  await change('value-state', 'enabled');
  await date.evaluate(el => { el.value = '2030-11-16'; });
  const dateCode = await copyCode();

  const booking = page.locator('#picker-booking-form');
  const bookingDate = booking.locator('ml-date-picker'), bookingTime = booking.locator('ml-time-picker');
  const bookingResult = booking.locator('output');
  await booking.getByRole('button', { name: '确认预约' }).click();
  assert(!(await bookingResult.isVisible()));
  await opener(bookingDate).click();
  assert.equal(await datePanel(bookingDate).getByRole('button', { name: '清除' }).count(), 0);
  await day(datePanel(bookingDate), '2030年11月11日').click();
  await opener(bookingTime).click();
  const slots = timePanel(bookingTime);
  await hour(slots).press('Home');
  await minute(slots).press('End');
  await slots.getByRole('button', { name: '确定' }).click();
  assert.deepEqual(await booking.evaluate(form => Object.fromEntries(new FormData(form))), { date: '2030-11-11', time: '09:30' });
  await booking.getByRole('button', { name: '确认预约' }).click();
  assert.equal(await bookingResult.textContent(), '已预约 2030-11-11 09:30');
  await booking.getByRole('button', { name: '重置' }).click();
  assert.deepEqual(await booking.evaluate(form => Object.fromEntries(new FormData(form))), { date: '', time: '' });
  assert(!(await bookingResult.isVisible()));

  await route('time-picker');
  const time = sample('time-picker'), times = timePanel(time);
  const pickedTime = await record(time);
  await opener(time).click();
  assert(await focused(hour(times)));
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab');
  assert(await focused(minute(times)));
  await page.keyboard.press('ArrowDown');
  assert.equal(await reading(times), '10:31');
  await times.getByRole('button', { name: '取消' }).click();
  assert.equal(await time.locator('input').inputValue(), '09:30');
  assert.deepEqual(await pickedTime(), []);
  await opener(time).click();
  await hour(times).press('ArrowDown');
  await hour(times).press('Enter');
  assert.equal(await time.locator('input').inputValue(), '10:30');
  assert.deepEqual(await pickedTime(), [['input', '10:30'], ['change', '10:30']]);
  await change('value-kind', '1');
  await opener(time).click();
  assert.deepEqual(await options(minute(times)), ['00', '15', '30', '45']);
  await hour(times).press('End');
  assert.equal(await reading(times), '18:00');
  assert.deepEqual(await options(minute(times)), ['00']);
  await times.getByRole('button', { name: '确定' }).click();
  const timeCode = await copyCode();

  const night = page.locator('#time-picker-examples article:last-child ml-time-picker'), nightPanel = timePanel(night);
  await opener(night).click();
  assert.deepEqual(await options(hour(nightPanel)), ['22', '23', '00', '01', '02']);
  await hour(nightPanel).press('ArrowDown');
  assert.equal(await reading(nightPanel), '00:45:30');
  assert.deepEqual(await options(second(nightPanel)), ['00', '30']);
  await second(nightPanel).press('Home');
  await second(nightPanel).press('Enter');
  assert.equal(await night.locator('input').inputValue(), '00:45');

  // The existing range still writes both endpoints only after the second choice.
  await route('date-range');
  const range = sample('date-range'), rangePanel = range.getByRole('dialog', { name: '选择日期范围' });
  await opener(range).click();
  await day(rangePanel, '2030年11月22日').click();
  assert.deepEqual(await range.evaluate(el => el.value), { start: '2030-11-20', end: '2030-12-03' });
  await rangePanel.getByRole('button', { name: '下个月' }).click();
  await day(rangePanel, '2030年12月1日').click();
  assert.deepEqual(await range.evaluate(el => el.value), { start: '2030-11-22', end: '2030-12-01' });
  await opener(range).click();
  await day(rangePanel, '2030年11月25日').click();
  await page.keyboard.press('Escape');
  assert.deepEqual(await range.evaluate(el => el.value), { start: '2030-11-22', end: '2030-12-01' });

  for (const [kind, snippet, expected] of [['date-picker', dateCode, '2030-11-16'], ['time-picker', timeCode, '18:00']]) {
    await writeFile(file, '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><base href="' + root.href + '">' +
      '<form><fieldset id="scope">' + snippet + '</fieldset><button type="reset">Reset</button></form></html>');
    await page.goto(pathToFileURL(file).href);
    const host = page.locator('ml-' + kind);
    const dialog = kind === 'date-picker' ? datePanel(host) : timePanel(host);
    assert.equal(await host.locator('input').inputValue(), expected);
    assert.match(await opener(host).evaluate(el => getComputedStyle(el, '::before').maskImage), /data:image\/svg/);
    await opener(host).click();
    await dialog.waitFor();
    const appearances = await host.evaluate(async el => {
      const scope = el.parentElement, panel = el.querySelector('dialog'), results = [];
      for (const theme of ['light', 'warm', 'dark']) {
        for (const material of ['base', 'low', 'medium', 'high']) {
          for (const motion of ['base', 'low', 'medium', 'high']) {
            Object.assign(scope.dataset, { mlTheme: theme, mlMaterial: material, mlMotion: motion });
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            const style = getComputedStyle(panel);
            const surface = panel.querySelector('ml-value-surface'), light = surface.querySelector('.ml-optical');
            results.push({ theme, material, motion, color: style.backgroundColor, duration: style.animationDuration,
              radius: !light || getComputedStyle(light).borderRadius === style.borderRadius,
              renderer: light?.dataset.mlRenderer, grade: light?.dataset.mlLight });
          }
        }
      }
      return results;
    });
    assert.equal(new Set(appearances.map(item => item.color)).size, 3);
    for (const { material, motion, radius, renderer, grade, duration } of appearances) {
      assert(radius);
      if (material === 'high') assert(['webgl', 'svg'].includes(renderer));
      else assert.equal(grade, motion === 'high' ? material : undefined);
      assert.equal(parseFloat(duration) === 0, motion === 'base');
    }
    await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
    assert.equal(await dialog.evaluate(el => getComputedStyle(el).animationName), 'none');
    await page.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'none' });
    await page.locator('#scope').evaluate(el => { el.disabled = true; });
    await dialog.waitFor({ state: 'hidden' });
    assert(await opener(host).isDisabled());
    await page.locator('#scope').evaluate(el => { el.disabled = false; });
    await host.evaluate(el => { el.field.readOnly = true; });
    assert(await opener(host).isDisabled());
    await host.evaluate(el => { el.field.readOnly = false; el.value = ''; });
    await page.getByRole('button', { name: 'Reset' }).click();
    assert.equal(await host.locator('input').inputValue(), expected);
    if (kind === 'date-picker') {
      const next = await host.evaluate(el => {
        Object.assign(el.field, { min: '2032-02-01', max: '2032-02-29', step: '2.5' });
        el.value = '2032-02-01';
        const native = el.field.cloneNode(false);
        native.stepUp();
        return native.value;
      });
      await opener(host).click();
      assert(await dialog.locator('[data-day]').evaluateAll(days => {
        const field = days[0].closest('ml-date-picker').field.cloneNode(false);
        return days.every(button => {
          field.valueAsNumber = Number(button.dataset.day) * 86400000;
          return button.disabled === !field.validity.valid;
        });
      }));
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Enter');
      assert.equal(await host.locator('input').inputValue(), next);
    } else {
      await host.evaluate(el => {
        Object.assign(el.field, { min: '09:00:00.25', max: '09:00:03', step: '0.5' });
        el.value = '09:00:00.25';
      });
      await opener(host).click();
      await second(dialog).press('ArrowDown');
      await second(dialog).press('Enter');
      assert.equal(await host.locator('input').inputValue(), '09:00:01.25');
    }
  }

  const touch = await browser.newPage({ hasTouch: true, viewport: { width: 320, height: 610 } });
  touch.on('pageerror', error => errors.push(error.message));
  for (const kind of ['date-picker', 'time-picker']) {
    await touch.goto(new URL('index.html#' + kind, root).href);
    const host = touch.locator('#value-specimen > ml-' + kind);
    await opener(host).tap();
    const panel = kind === 'date-picker' ? datePanel(host) : timePanel(host);
    assert(await panel.evaluate(el => el.scrollWidth <= el.clientWidth && el.getBoundingClientRect().width < innerWidth));
    if (kind === 'date-picker') {
      await day(panel, '2030年11月24日').tap();
      assert.equal(await host.locator('input').inputValue(), '2030-11-24');
    } else {
      await hour(panel).getByRole('option', { name: '08', exact: true }).tap();
      await panel.getByRole('button', { name: '确定' }).tap();
      assert.equal(await host.locator('input').inputValue(), '08:30');
    }
  }
  await touch.close();
  assert.deepEqual(errors, []);
  console.log(engine.name() + ': date and time keyboard, touch, native form, date range, offline examples and 48 appearances per picker passed');
} finally {
  await browser.close();
  await unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; });
  await rmdir(temp);
}
