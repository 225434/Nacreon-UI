import { launchBrowser } from './helpers/browser.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, firefox } from 'playwright';

const engine = process.argv[2] === 'firefox' ? firefox : chromium;
const root = new URL('../', import.meta.url);
const temp = await mkdtemp(join(tmpdir(), 'ml-tooltip-'));
const file = join(temp, 'example.html');
const browser = await launchBrowser(engine);
const errors = [];
function track(page) {
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  return page;
}
const opened = (tip, value = true) => tip.evaluate((el, open) => el.open === open, value);
const waitOpen = (page, selector, value) => page.waitForFunction(([s, open]) => document.querySelector(s)?.open === open, [selector, value]);
const rect = el => el.boundingBox();
try {
  const page = track(await browser.newPage({ viewport: { width: 1280, height: 860 } }));
  await page.goto(new URL('index.html#tooltip', root).href);
  const sample = page.locator('#tooltip-specimen ml-tooltip'), trigger = sample.getByRole('button', { name: '照片信息' });
  await sample.getByRole('tooltip').waitFor();
  assert.equal(await page.locator('#catalog-current').textContent(), '工具提示');
  assert.equal(await trigger.getAttribute('aria-describedby'), await sample.getByRole('tooltip').getAttribute('id'));
  await page.keyboard.press('Escape');
  assert(await opened(sample, false));
  if (engine === chromium) {
    const accessibility = await page.context().newCDPSession(page);
    const tree = await accessibility.send('Accessibility.getFullAXTree');
    const control = tree.nodes.find(node => node.role?.value === 'button' && node.name?.value === '照片信息');
    assert.match(control.description.value, /1672 × 941/, 'accessible description during dismissal');
    await accessibility.detach();
  }
  const choose = (name, value) => page.locator('input[name="' + name + '"][value="' + value + '"]').evaluate(el => el.click());
  await choose('motion', 'base');
  for (const side of ['bottom', 'left', 'right', 'top']) {
    await choose('tooltip-placement', side);
    await page.waitForFunction(s => document.querySelector('#tooltip-specimen [role="tooltip"]').dataset.side === s, side);
  }
  await page.locator('#expand-stage').click();
  await trigger.click();
  assert(await opened(sample));
  assert(await sample.getByRole('tooltip').evaluate(el => el.matches(':popover-open') && el.closest('dialog').open));
  await page.locator('#tooltip-bookmark').evaluate(el => el.show());
  assert(await opened(sample), 'a background control cannot displace the hint inside the modal');
  await page.keyboard.press('Escape');
  assert(await opened(sample, false));
  assert(await page.locator('.stage-dialog').evaluate(el => el.open));
  await page.keyboard.press('Escape');
  await page.locator('.stage-dialog').waitFor({ state: 'hidden' });
  const bookmark = page.locator('#tooltip-bookmark button');
  await bookmark.click();
  assert.equal(await bookmark.getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('#tooltip-bookmark').getAttribute('text'), /移除/);
  await page.locator('#open-code').click();
  const snippet = await page.locator('#code-sample').textContent();
  assert.match(snippet, /tooltip\.js/);
  assert(!snippet.includes('ml-tooltip-panel'));
  await page.close();

  await writeFile(file, `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><base href="${root.href}">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      body { margin: 0; min-height: 120vh; }
      #clip { position: fixed; top: 45%; left: 45%; overflow: hidden; transform: translateZ(0); }
      button { min-height: 40px; }
      #scroll { position: fixed; top: 110px; left: 12px; height: 95px; width: 130px; overflow: auto; }
    </style>
    <div id="copy">${snippet}</div>
    <main id="scope" data-ml-theme="warm" data-ml-material="base" data-ml-motion="base">
      <button id="before">前一项</button><small id="existing">相册操作</small>
      <form id="clip"><ml-tooltip id="action" text="保存当前照片">
        <button id="save" aria-describedby="existing">保存</button></ml-tooltip></form>
      <div id="scroll"><div style="height:24px"></div><ml-tooltip id="scrolled" text="照片说明">
        <button type="button">说明</button></ml-tooltip><div style="height:280px"></div></div>
      <button id="after">下一项</button>
    </main>
    <script>let submits = 0; document.querySelector('form').onsubmit = e => { e.preventDefault(); submits++; };</script></html>`);
  const fixture = track(await browser.newPage({ viewport: { width: 700, height: 450 } }));
  await fixture.goto(pathToFileURL(file).href);
  const action = fixture.locator('#action'), save = fixture.locator('#save'), panel = action.locator('[role="tooltip"]');
  const id = await panel.getAttribute('id');
  assert.equal(await save.getAttribute('aria-describedby'), 'existing ' + id);
  assert.equal(await action.locator('[role="tooltip"]:visible').count(), 0);
  assert.equal(await panel.locator('button, a, [tabindex]').count(), 0);
  await fixture.locator('#before').focus();
  await fixture.locator('#copy button').hover();
  await fixture.keyboard.press('Tab');
  await fixture.waitForTimeout(410);
  assert(await opened(action));
  assert(await opened(fixture.locator('#copy ml-tooltip'), false), 'an earlier hover cannot displace keyboard focus');
  assert(await save.evaluate(el => el === document.activeElement));
  await fixture.keyboard.press('Escape');
  assert(await opened(action, false));
  assert(await save.evaluate(el => el === document.activeElement));
  await fixture.keyboard.press('Enter');
  assert.equal(await fixture.evaluate(() => submits), 1);
  await fixture.keyboard.press('Tab');
  await fixture.locator('#after').focus();
  await save.hover();
  await waitOpen(fixture, '#action', true);
  const anchor = await rect(save), bubble = await rect(panel);
  const x = anchor.x + anchor.width / 2;
  await fixture.mouse.move(x, (anchor.y + bubble.y + bubble.height) / 2);
  await fixture.waitForTimeout(200);
  assert(await opened(action), 'pointer bridge');
  await panel.hover();
  await fixture.waitForTimeout(200);
  assert(await opened(action), 'tooltip remains available for reading');
  await fixture.mouse.move(2, 2);
  await waitOpen(fixture, '#action', false);
  await fixture.locator('#before').focus();
  await fixture.keyboard.press('Tab');
  await save.hover();
  await fixture.mouse.move(2, 2);
  await fixture.waitForTimeout(200);
  assert(await opened(action), 'keyboard focus survives pointer departure');
  await fixture.keyboard.press('Escape');
  await fixture.locator('#after').focus();

  for (const [side, x, y, expected] of [
    ['top', 315, 200, 'top'], ['bottom', 315, 200, 'bottom'], ['left', 315, 200, 'left'], ['right', 315, 200, 'right'],
    ['top', 2, 1, 'bottom'], ['bottom', 2, 407, 'top'], ['left', 2, 180, 'right'], ['right', 650, 180, 'left'],
  ]) {
    await action.evaluate((el, [side, x, y]) => {
      el.hide();
      Object.assign(el.parentElement.style, { left: x + 'px', top: y + 'px' });
      el.setAttribute('placement', side);
      el.show();
    }, [side, x, y]);
    assert.equal(await panel.getAttribute('data-side'), expected);
    assert(await panel.evaluate(el => {
      const r = el.getBoundingClientRect();
      return r.left >= 7 && r.right <= innerWidth - 7 && r.top >= 7 && r.bottom <= innerHeight - 7
        && el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
    }), side + ' visible outside clipped parent');
  }
  await action.evaluate(el => el.setAttribute('text', '文'.repeat(90)));
  await fixture.setViewportSize({ width: 320, height: 350 });
  await waitOpen(fixture, '#action', false);
  await action.evaluate(el => {
    Object.assign(el.parentElement.style, { left: '135px', top: '140px' });
    el.show();
  });
  assert(await panel.evaluate(el => {
    const r = el.getBoundingClientRect();
    return r.left >= 7 && r.right <= innerWidth - 7 && r.height > 40 && el.scrollWidth <= el.clientWidth;
  }), 'wrapped at 320px');
  const scrollTip = fixture.locator('#scrolled');
  await scrollTip.evaluate(el => el.show());
  assert(await opened(action, false));
  const original = await rect(scrollTip.getByRole('tooltip'));
  await fixture.locator('#scroll').evaluate(el => el.scrollTop = 15);
  await fixture.waitForFunction(y => Math.abs(document.querySelector('#scrolled [role="tooltip"]').getBoundingClientRect().y - (y - 15)) < 2, original.y);
  await fixture.locator('#scroll').evaluate(el => el.scrollTop = 200);
  await waitOpen(fixture, '#scrolled', false);

  const appearances = await action.evaluate(async el => {
    const scope = el.closest('main');
    el.setAttribute('text', '保存当前照片');
    el.show();
    const surface = el.querySelector('.ml-tooltip-surface'), results = [];
    for (const theme of ['light', 'warm', 'dark']) {
      for (const material of ['base', 'low', 'medium', 'high']) {
        for (const motion of ['base', 'low', 'medium', 'high']) {
          Object.assign(scope.dataset, { mlTheme: theme, mlMaterial: material, mlMotion: motion });
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const css = getComputedStyle(surface), layer = surface.querySelector('.ml-optical');
          results.push({ theme, material, motion, open: el.open, follows: css.getPropertyValue('--ml-follow').trim(),
            level: css.getPropertyValue('--ml-material-level').trim(), ink: css.color, renderer: layer?.dataset.mlRenderer,
            lighting: layer?.dataset.mlLight, duration: getComputedStyle(el.querySelector('[role="tooltip"]')).transitionDuration });
        }
      }
    }
    return results;
  });
  assert.equal(appearances.length, 48);
  assert.equal(new Set(appearances.map(a => a.ink)).size, 3);
  for (const appearance of appearances) {
    const { material, motion, renderer, lighting, duration } = appearance;
    const detail = JSON.stringify(appearance);
    assert(appearance.open, detail);
    if (material === 'high') assert(['webgl', 'svg'].includes(renderer), detail);
    else assert.equal(lighting, material, detail);
    assert.equal(parseFloat(duration) === 0, motion === 'base', detail);
  }
  await fixture.locator('#scope').evaluate(el => el.dataset.mlMaterial = 'medium');
  await panel.hover();
  await panel.locator('.ml-optical[data-ml-light="medium"][data-ml-lit]').waitFor({ state: 'attached' });
  const lightX = () => panel.locator('.ml-optical').evaluate(el => el.style.getPropertyValue('--ml-light-x'));
  const firstLight = await lightX(), lightBox = await rect(panel);
  await fixture.mouse.move(lightBox.x + 5, lightBox.y + lightBox.height / 2);
  await fixture.waitForFunction(([id, x]) => document.getElementById(id).querySelector('.ml-optical')?.style.getPropertyValue('--ml-light-x') !== x, [id, firstLight]);
  await fixture.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await panel.evaluate(el => parseFloat(getComputedStyle(el).transitionDuration)), 0);
  assert.equal(await panel.evaluate(el => getComputedStyle(el).getPropertyValue('--ml-follow').trim()), '0');
  await fixture.emulateMedia({ forcedColors: 'active' });
  assert.equal(await panel.locator('.ml-tooltip-surface').evaluate(el => getComputedStyle(el).backdropFilter), 'none');

  await action.evaluate(el => {
    el.setAttribute('text', '<em>新说明</em>');
    el.querySelector('button').setAttribute('aria-describedby', 'existing updated');
  });
  assert.match(await save.getAttribute('aria-describedby'), new RegExp('existing updated ' + id));
  assert.equal(await panel.textContent(), '<em>新说明</em>');
  assert.equal(await panel.locator('em').count(), 0);
  await action.evaluate(el => el.setAttribute('text', '  '));
  assert(await opened(action, false));
  assert.equal(await save.getAttribute('aria-describedby'), 'existing updated');
  await action.evaluate(el => {
    el.setAttribute('text', '恢复说明');
    const clone = el.cloneNode(true);
    clone.id = 'cloned';
    clone.querySelector('button').removeAttribute('id');
    document.querySelector('#after').after(clone);
    window.previousTrigger = el.querySelector('button');
    el.replaceChildren(document.createElement('button'));
    el.querySelector('button').textContent = '新的按钮';
  });
  assert.equal(await fixture.evaluate(() => previousTrigger.getAttribute('aria-describedby')), 'existing updated');
  assert.equal(await action.locator('button').getAttribute('aria-describedby'), id);
  assert.notEqual(await fixture.locator('#cloned [role="tooltip"]').getAttribute('id'), id);
  assert(!((await fixture.locator('#cloned button').getAttribute('aria-describedby')).split(' ').includes(id)));
  await action.evaluate(el => { el.show(); el.setAttribute('disabled', ''); });
  assert(await opened(action, false));
  assert.equal(await action.locator('button').getAttribute('aria-describedby'), null);
  await action.evaluate(el => { el.removeAttribute('disabled'); el.show(); window.lastTrigger = el.querySelector('button'); el.remove(); });
  assert.equal(await fixture.evaluate(() => lastTrigger.hasAttribute('aria-describedby')), false);
  await fixture.close();

  const touch = track(await browser.newPage({ hasTouch: true, viewport: { width: 320, height: 600 } }));
  await touch.goto(pathToFileURL(file).href);
  const help = touch.locator('#copy ml-tooltip');
  await help.locator('button').tap();
  assert(await opened(help), 'help opens on first tap');
  await help.locator('button').tap();
  assert(await opened(help, false), 'help closes on second tap');
  await help.locator('button').tap();
  await touch.locator('#save').tap();
  assert(await opened(help, false));
  assert(await opened(touch.locator('#action'), false));
  assert.equal(await touch.evaluate(() => submits), 1, 'one ordinary tap submits once');
  await touch.close();
  assert.deepEqual(errors, []);
  console.log(engine.name() + ': Tooltip gallery, offline sample, keyboard, hover, touch, four directions, clipped containers, live controls and 48 appearances passed');
} finally {
  await browser.close();
  await unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; });
  await rmdir(temp);
}
