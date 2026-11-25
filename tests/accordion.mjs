import { launchBrowser } from './helpers/browser.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, firefox } from 'playwright';

const engine = process.argv[2] === 'firefox' ? firefox : chromium;
const browser = await launchBrowser(engine);
const temp = await mkdtemp(join(tmpdir(), 'ml-accordion-'));
const file = join(temp, 'example.html');
const root = new URL('../', import.meta.url);
const errors = [];
const states = accordion => accordion.locator(':scope > details').evaluateAll(items => items.map(item => item.open));
const focused = element => element.evaluate(el => el === el.getRootNode().activeElement);

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 880 }, reducedMotion: 'no-preference' });
  context.on('page', page => {
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
  });
  const page = await context.newPage();
  await page.goto(new URL('index.html#accordion', root).href);
  const sample = page.locator('#accordion-specimen ml-accordion');
  const header = index => sample.locator(':scope > details > summary').nth(index);
  const note = sample.getByRole('textbox', { name: '封面建议' });
  const change = (name, value) => page.locator('input[name="' + name + '"][value="' + value + '"]').evaluate(input => input.click());
  await sample.waitFor();
  assert.equal(await page.locator('#catalog-current').textContent(), '折叠面板');
  assert.deepEqual(await states(sample), [true, false, false]);
  await change('material', 'base');
  await change('motion', 'base');

  await header(0).press('ArrowDown');
  assert(await focused(header(1)));
  await page.keyboard.press('End');
  assert(await focused(header(2)));
  await page.keyboard.press('ArrowDown');
  assert(await focused(header(0)));
  await page.keyboard.press('ArrowUp');
  assert(await focused(header(2)));
  await page.keyboard.press('Home');
  assert(await focused(header(0)));
  await page.keyboard.press('Tab');
  assert(await focused(header(1)));
  await page.keyboard.press('Enter');
  assert.deepEqual(await states(sample), [false, true, false]);
  await page.keyboard.press('Tab');
  const original = sample.getByRole('link', { name: '打开完整尺寸的照片' });
  assert(await focused(original));
  const [photo] = await Promise.all([context.waitForEvent('page'), original.click()]);
  await photo.waitForURL(new URL('preview/assets/media/alpine-lake.jpg', root).href);
  assert.equal(await photo.locator('img').evaluate(img => img.decode().then(() => img.naturalWidth)), 1672);
  await photo.close();
  await header(1).press('Space');
  assert.deepEqual(await states(sample), [false, false, false]);
  await change('accordion-mode', 'multiple');
  await header(0).click();
  await header(2).click();
  assert.deepEqual(await states(sample), [true, false, true]);
  const text = '湖畔相册 <封面> & 备注\n保留原始构图';
  await note.fill(text);
  await change('accordion-mode', 'single');
  assert.deepEqual(await states(sample), [true, false, false]);
  assert(await focused(header(2)), 'closing a panel with focus returns to its title');
  await change('accordion-mode', 'multiple');
  await header(2).click();
  assert.equal(await note.inputValue(), text);

  await change('motion', 'medium');
  const folded = await sample.evaluate(async el => {
    const item = el.querySelector(':scope > details:last-child');
    const panel = item.querySelector('.ml-accordion-panel');
    panel.querySelector('textarea').focus();
    const full = item.offsetHeight;
    item.open = false;
    await Promise.resolve();
    const immediate = panel.inert && document.activeElement === item.firstElementChild;
    await new Promise(resolve => requestAnimationFrame(resolve));
    const fade = panel.getAnimations().find(animation => animation.transitionProperty === 'opacity');
    for (let frame = 0; frame < 12 && item.offsetHeight >= full; frame++) {
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    const between = item.offsetHeight < full && item.offsetHeight > item.firstElementChild.offsetHeight;
    item.open = true;
    await Promise.resolve();
    return { immediate, fade: Boolean(fade), between, available: !panel.inert };
  });
  assert.deepEqual(folded, { immediate: true, fade: true, between: true, available: true });
  // A second close during the entrance must settle closed and skip the fading controls.
  await header(2).press('Space');
  await page.keyboard.press('Tab');
  assert.equal(await focused(sample.locator('textarea')), false);
  await page.waitForFunction(() => {
    const item = document.querySelector('#accordion-specimen ml-accordion > details:last-child');
    return item.offsetHeight <= item.querySelector('summary').offsetHeight + 1 &&
      !item.querySelector('.ml-accordion-panel').inert;
  });
  await header(2).press('Enter');
  await page.locator('#expand-stage').click();
  assert(await sample.evaluate(el => el.closest('dialog')?.open));
  assert.equal(await note.inputValue(), text);
  await page.locator('#expand-stage').click();
  await page.locator('.stage-dialog').waitFor({ state: 'hidden' });
  assert.deepEqual(await states(sample), [true, false, true]);

  await page.locator('#open-code').click();
  const snippet = await page.locator('#code-sample').textContent();
  assert(!/ml-optical|ml-accordion-group-|<ml-icon/.test(snippet), 'exports authored markup and standalone icons');
  await writeFile(file, `<!doctype html><html lang="zh-CN"><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1"><base href="${root.href}">
    <body data-ml-motion="base" data-ml-material="base">
    <main id="example">${snippet}</main>
    <ml-accordion id="a" mode="single">
      <details open><summary>A1</summary><div class="ml-accordion-panel">
        <ml-accordion id="nested" mode="single"><details open><summary>N1</summary><p>One</p></details>
          <details><summary>N2</summary><p>Two</p></details></ml-accordion>
      </div></details>
      <details><summary>A2</summary><div class="ml-accordion-panel"><a href="#example">Back</a></div></details>
    </ml-accordion>
    <ml-accordion id="b" mode="single">
      <details open><summary>B1</summary><div class="ml-accordion-panel"><p>Text</p></div></details>
      <details><summary>B2</summary><div class="ml-accordion-panel"><p>Text</p></div></details>
    </ml-accordion>
  </body></html>`);
  await page.goto(pathToFileURL(file).href);
  const copy = page.locator('#example ml-accordion');
  assert.equal(await copy.getAttribute('mode'), 'multiple');
  assert.deepEqual(await states(copy), [true, false, true]);
  assert.equal(await copy.locator('textarea').inputValue(), text);
  assert.equal(await copy.locator('summary svg').count(), 3);
  const a = page.locator('#a'), b = page.locator('#b'), nested = page.locator('#nested');
  await nested.locator('summary').last().press('Space');
  assert.deepEqual(await states(nested), [false, true]);
  assert.deepEqual(await states(a), [true, false]);
  await a.locator(':scope > details').last().evaluate(el => { el.open = true; });
  assert.deepEqual(await states(a), [false, true]);
  assert.deepEqual(await states(b), [true, false]);
  await b.evaluate(el => {
    const item = document.createElement('details');
    item.open = true;
    item.innerHTML = '<summary>B3</summary><div class="ml-accordion-panel">New content</div>';
    el.append(item);
  });
  assert.deepEqual(await states(b), [true, false, false], 'insertion preserves single mode');
  await b.locator(':scope > details').last().evaluate(el => { el.open = true; });
  assert.deepEqual(await states(b), [false, false, true]);

  const combinations = await copy.evaluate(async group => {
    const scope = group.parentElement;
    const results = [];
    for (const theme of ['light', 'warm', 'dark']) {
      for (const material of ['base', 'low', 'medium', 'high']) {
        for (const motion of ['base', 'low', 'medium', 'high']) {
          Object.assign(scope.dataset, { mlTheme: theme, mlMaterial: material, mlMotion: motion });
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const style = getComputedStyle(group);
          const light = group.querySelector(':scope > .ml-optical');
          results.push({ theme, material, motion, color: style.color, backdrop: style.backgroundColor,
            renderer: light?.dataset.mlRenderer, grade: light?.dataset.mlLight,
            rounded: !light || getComputedStyle(light).borderRadius === style.borderRadius });
        }
      }
    }
    return results;
  });
  assert.equal(combinations.length, 48);
  assert.equal(new Set(combinations.map(value => value.color)).size, 3);
  assert.equal(new Set(combinations.filter(value => value.material === 'base').map(value => value.backdrop)).size, 3);
  for (const combination of combinations) {
    const { material, motion, grade, renderer, rounded } = combination;
    assert(rounded, 'the lighting layer follows the rounded component');
    if (material === 'high') assert(['webgl', 'svg'].includes(renderer), JSON.stringify(combination));
    else assert.equal(grade, material);
  }
  await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
  assert.equal(await copy.evaluate(el => getComputedStyle(el).backdropFilter), 'none');
  assert.equal(await copy.locator('.ml-accordion-panel').first().evaluate(el => parseFloat(getComputedStyle(el).transitionDuration)), 0);

  const touch = await browser.newPage({ hasTouch: true, viewport: { width: 320, height: 740 } });
  await touch.goto(new URL('index.html#accordion', root).href);
  const compact = touch.locator('#accordion-specimen ml-accordion');
  await compact.locator('summary').last().tap();
  assert.deepEqual(await states(compact), [false, false, true]);
  assert(await touch.evaluate(() => document.documentElement.scrollWidth === innerWidth));
  await touch.close();
  assert.deepEqual(errors, []);
  console.log(engine.name() + ': accordion keyboard and touch, focus during interrupted folds, independent groups, offline code and 48 appearances passed');
} finally {
  await browser.close();
  await unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; });
  await rmdir(temp);
}
