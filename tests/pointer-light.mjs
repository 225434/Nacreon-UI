import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = new URL('../', import.meta.url);
const browser = await chromium.launch({ executablePath: chromium.executablePath() });
const grades = ['base', 'low', 'medium', 'high'];
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function point(page, locator, x = .5, y = .5) {
  const box = await locator.boundingBox();
  await page.mouse.move(box.x + box.width * x, box.y + box.height * y);
  await settle(page);
}

// Compare actual painted pixels with the same surface under a distant lamp.
function changes(page, shots) {
  return page.evaluate(async images => {
    const pixels = await Promise.all(images.map(async data => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + data;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, img.width, img.height);
    }));
    const [rest, ...exposures] = pixels;
    return exposures.map((lit, i) => {
      function delta(x, y) {
        const offset = 4 * (x + y * rest.width);
        return Math.max(...[0, 1, 2].map(c => Math.abs(rest.data[offset + c] - lit.data[offset + c])));
      }
      function at(x, y) {
        return delta(Math.floor(rest.width * (i ? 1 - x : x)), Math.floor(rest.height * y));
      }
      let border = 0;
      for (let x = 0; x < rest.width * .4; x++) {
        for (let y = 0; y < rest.height; y++) {
          border = Math.max(border, delta(i ? rest.width - 1 - x : x, y));
        }
      }
      return { near: at(.17, .41), spread: at(.51, .28), far: at(.83, .41), border };
    });
  }, shots.map(image => image.toString('base64')));
}

async function gallery(page) {
  await page.goto(new URL('index.html#materials', root).href);
  const sample = page.locator('#material-specimen ml-material');
  const layer = sample.locator(':scope > .ml-optical');
  const set = (name, value) => page.locator('.settings input[name="' + name + '"][value="' + value + '"]').evaluate(el => el.click());
  for (const theme of ['light', 'warm', 'dark']) {
    await set('theme', theme);
    for (const material of grades) {
      await set('material', material);
      for (const motion of grades) {
        await set('motion', motion);
        await settle(page);
        if (material === 'high') {
          assert(await sample.evaluate(el => el.matches('.ml-refractive')));
          assert.equal(await layer.getAttribute('data-ml-light'), null);
        } else if (motion !== 'high') {
          assert.equal(await layer.count(), 0);
        } else {
          assert.equal(await layer.getAttribute('data-ml-light'), material);
          assert.equal(await layer.locator('canvas, svg').count(), 0);
          await page.mouse.move(8, 8);
          await settle(page);
          assert.equal(await layer.getAttribute('data-ml-lit'), null);
          const shots = [await sample.screenshot()], casts = [];
          for (const side of [.17, .83]) {
            await point(page, sample, side, .41);
            assert.equal(await layer.getAttribute('data-ml-lit'), '');
            casts.push(await layer.evaluate(el => parseFloat(el.style.getPropertyValue('--ml-light-cast-x'))));
            shots.push(await sample.screenshot());
          }
          for (const result of await changes(page, shots)) {
            assert(result.border > 10, JSON.stringify({ theme, material, result }));
            assert(result.far <= 2);
            assert(material === 'base' ? result.near === 0 : result.near > 6);
            assert(material === 'medium' ? result.spread > 4 : result.spread === 0);
          }
          if (material === 'medium') assert(casts[0] > 0 && casts[1] < 0);
        }
      }
    }
  }
  const card = page.locator('.material-card[data-ml-material="low"]');
  await card.click();
  await settle(page);
  assert.equal(await layer.getAttribute('data-ml-light'), 'low');
  await point(page, card.locator('ml-material'));
  assert.equal(await card.locator('[data-ml-lit]').count(), 1);
  assert.match(await page.locator('#motion-note').innerText(), /局部柔光/);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await settle(page);
  assert.equal(await page.locator('[data-ml-light]').count(), 0);
  assert.match(await page.locator('#motion-note').innerText(), /减少动态/);
  await page.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'active' });
  await settle(page);
  assert.equal(await page.locator('[data-ml-light]').count(), 0);
  assert.match(await page.locator('#motion-note').innerText(), /系统对比色/);
}

async function standalone(page) {
  await page.setContent(`<body data-ml-theme="warm" data-ml-material="medium" data-ml-motion="high">
    <ml-button><button>Apply</button></ml-button><ml-switch label="Toggle"></ml-switch>
    <ml-select><select><option>First</option><option>Second</option></select></ml-select>
    <ml-hover-card><button>Info</button><section class="ml-hover-panel">Details</section></ml-hover-card>
    <ml-dialog><dialog><button data-ml-dialog-close>Done</button></dialog></ml-dialog>
    <div data-ml-material="base"><ml-material id="nested">Nested</ml-material>
    <ml-icon name="settings" size="40" style="color:teal"></ml-icon></div>
    <svg width="0" height="0" aria-hidden="true"><defs data-category="actions">
      <filter id="user-ink"><feColorMatrix type="saturate" values=".85"/></filter>
      <symbol id="i-settings" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></symbol>
    </defs></svg>
    <svg id="reference" width="40" height="40" viewBox="0 0 24 24"><use href="#i-settings" filter="url(#user-ink)"/></svg>
    <ml-material id="still" data-ml-motion="low">Static</ml-material></body>`);
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    window.glRequests = 0;
    HTMLCanvasElement.prototype.getContext = function(kind, ...args) {
      if (kind.includes('webgl')) { window.glRequests++; return null; }
      return original.call(this, kind, ...args);
    };
  });
  for (const name of ['materials', 'button', 'switch', 'select', 'hover-card', 'dialog', 'icons']) {
    const directory = name === 'materials' || name === 'icons' ? 'dist/design/' : 'dist/components/' + name + '/';
    if (name !== 'icons') await page.addStyleTag({ path: fileURLToPath(new URL(directory + name + '.css', root)) });
    await page.addScriptTag({ path: fileURLToPath(new URL(directory + name + '.js', root)) });
  }
  const button = page.locator('ml-button'), toggle = page.locator('ml-switch');
  await point(page, button, .94);
  assert.equal(await button.locator('[data-ml-lit]').count(), 1);
  assert(await toggle.locator('[data-ml-lit]').count() > 0, 'the light should also reach the adjacent switch');
  assert.equal(await page.locator('#still > .ml-optical').count(), 0);
  assert.equal(await page.locator('#nested > [data-ml-light="base"]').count(), 1);
  await button.locator('button').focus();
  for (const flag of ['disabled', 'aria-busy', 'aria-disabled', 'inert']) {
    await button.locator('button').evaluate((el, name) => el.setAttribute(name, 'true'), flag);
    await settle(page);
    assert.equal(await button.locator('.ml-optical').count(), 0);
    await button.locator('button').evaluate((el, name) => el.removeAttribute(name), flag);
    await settle(page);
  }
  await toggle.getByRole('switch').click();
  assert.equal(await toggle.getByRole('switch').getAttribute('aria-checked'), 'true');
  await page.locator('select').focus();
  await page.keyboard.press('ArrowDown');
  const menu = page.locator('.ml-select-popup');
  await point(page, menu);
  assert.equal(await menu.locator('> [data-ml-light="medium"][data-ml-lit]').count(), 1);
  await page.keyboard.press('Escape');
  const hover = page.locator('ml-hover-card');
  await hover.getByRole('button').focus();
  await hover.locator('.ml-hover-surface').waitFor({ state: 'visible' });
  await point(page, hover.locator('.ml-hover-surface'));
  assert.equal(await hover.locator('.ml-hover-surface > [data-ml-lit]').count(), 1);
  await page.keyboard.press('Escape');
  await page.locator('ml-dialog').evaluate(el => el.showModal(document.querySelector('ml-button button')));
  const dialog = page.locator('dialog');
  await point(page, dialog);
  assert.equal(await dialog.locator('> [data-ml-light="medium"][data-ml-lit]').count(), 1);
  await dialog.getByRole('button').click();
  assert(await button.locator('button').evaluate(el => el === document.activeElement));

  const icon = page.locator('ml-icon');
  await point(page, icon);
  assert.equal(await icon.locator('defs[data-ml-icon-light="base"]').count(), 1);
  assert.equal(await icon.locator('defs[data-ml-icon-glass]').count(), 0);
  assert.equal(await icon.evaluate(el => getComputedStyle(el).color), 'rgb(0, 128, 128)');
  await page.mouse.move(850, 560);
  await settle(page);
  assert.equal(await icon.locator('defs[data-ml-icon-light]').count(), 0);
  assert.equal(await icon.locator('g[filter]').count(), 0);
  const reference = page.locator('#reference');
  await point(page, reference);
  assert.equal(await reference.locator('defs[data-ml-icon-light="medium"]').count(), 1);
  assert.match(await reference.locator('use').getAttribute('filter'), /^url\(#user-ink\) url\(/);
  await reference.evaluate(el => el.dataset.mlMotion = 'low');
  await settle(page);
  assert.equal(await reference.locator('use').getAttribute('filter'), 'url(#user-ink)');

  await point(page, button);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await settle(page);
  assert.equal(await page.locator('[data-ml-lit]').count(), 0);
  for (const type of ['pointerdown', 'pointerup']) {
    await button.evaluate((el, type) => {
      const box = el.getBoundingClientRect();
      el.dispatchEvent(new PointerEvent(type, { bubbles: true, isPrimary: true, pointerType: 'touch',
        buttons: type === 'pointerdown' ? 1 : 0, clientX: box.left + 8, clientY: box.top + 8 }));
    }, type);
    await settle(page);
    assert.equal(await button.locator('[data-ml-lit]').count(), type === 'pointerdown' ? 1 : 0);
  }
  await button.evaluate(el => document.body.prepend(el));
  await point(page, button);
  assert.equal(await button.locator('> .ml-optical').count(), 1);
  assert.equal(await page.evaluate(() => window.glRequests), 0);
  await page.waitForFunction(() => !window[Symbol.for('material-lib.glass.v1')].GlassScene.forDocument(document).frame);
}

try {
  const errors = [];
  for (const test of [gallery, standalone]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 950 }, reducedMotion: 'no-preference' });
    page.on('pageerror', e => errors.push(e.message));
    await test(page);
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log('Pointer lighting passed across three themes, the 4 × 4 appearance matrix and standalone controls.');
} finally {
  await browser.close();
}
