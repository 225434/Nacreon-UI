import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './helpers/browser.mjs';

const browser = await launchBrowser(chromium);
const dist = new URL('../dist/', import.meta.url);
const files = ['components/button/button', 'components/loading/loading', 'components/progress/progress', 'design/motion'];
const addFrames = page => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
async function mount(page, html) {
  await page.setContent('<!doctype html><html data-ml-material="high" data-ml-motion="medium"><main></main></html>');
  for (const name of files) {
    await page.addStyleTag({ path: fileURLToPath(new URL(name + '.css', dist)) });
    await page.addScriptTag({ path: fileURLToPath(new URL(name + '.js', dist)) });
  }
  await page.locator('main').evaluate((el, markup) => { el.innerHTML = markup; }, html);
  await addFrames(page);
}

// Advance real component painters through chosen display timestamps, counting submissions
// at the renderer boundary. The real-refresh benchmark separately includes actual GPU draws.
async function glassCadence(page, engine = 'webgl') {
  const counts = await page.evaluate(engine => {
    const scene = window[Symbol.for('material-lib.glass.v1')].GlassScene.forDocument(document);
    const renderer = window[Symbol.for('material-lib.glass-shader.v1')].forDocument(document);
    const original = renderer.draw, request = window.requestAnimationFrame, cancel = window.cancelAnimationFrame;
    cancel.call(window, scene.frame);
    scene.frame = 0;
    const queue = new Map();
    let id = 0, stats, base = 10000;
    window.requestAnimationFrame = callback => { queue.set(++id, callback); return id; };
    window.cancelAnimationFrame = n => queue.delete(n);
    renderer.draw = output => { stats[output.closest('ml-button').id]++; return true; };
    const restore = [];
    for (const layer of document.querySelectorAll('ml-button > .ml-optical')) {
      if (engine === 'webgl') continue;
      const id = layer.parentElement.id;
      const node = engine === 'svg' ? layer.querySelector('radialGradient') : layer;
      const method = engine === 'svg' ? 'setAttribute' : 'getBoundingClientRect';
      const original = node[method];
      node[method] = function (...args) {
        if (engine === 'css' || args[0] === 'cx') stats[id]++;
        return original.apply(this, args);
      };
      restore.push(() => { delete node[method]; });
    }
    const results = [];
    function tick(time) {
      const batch = [...queue.values()];
      queue.clear();
      for (const paint of batch) paint(time);
    }
    try {
      for (const hz of engine === 'webgl' ? [60, 90, 120, 144, 165, 240] : [120, 240]) {
        stats = { high: 0, medium: 0 };
        for (let frame = 0; frame < hz; frame++) {
          scene.pointer = { x: 25 + frame / 2, y: 20 };
          scene.wake();
          tick(base + frame * 1000 / hz);
        }
        const period = { ...stats };
        // Two arrivals in one budget slot followed by silence must deliver the latest input.
        for (const [offset, x] of [[1000, 200], [1001, 208]]) {
          scene.pointer = { x, y: 21 };
          scene.wake();
          tick(base + offset);
        }
        const beforeTail = stats.medium;
        tick(base + 1014);
        results.push({ hz, ...period, tail: stats.medium - beforeTail, idle: queue.size });
        base += 3000;
      }
    } finally {
      window.requestAnimationFrame = request;
      window.cancelAnimationFrame = cancel;
      renderer.draw = original;
      for (const undo of restore) undo();
      scene.frame = 0;
      scene.wake();
    }
    return results;
  }, engine);
  for (const sample of counts) {
    assert.equal(sample.high, sample.hz, JSON.stringify(sample));
    assert.equal(sample.medium, Math.min(90, sample.hz), JSON.stringify(sample));
    assert.equal(sample.tail, 1, 'last input ' + JSON.stringify(sample));
    assert.equal(sample.idle, 0, 'idle ' + JSON.stringify(sample));
  }
  return counts;
}

try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, reducedMotion: 'no-preference' });
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  const pair = '<ml-button id="high" data-ml-motion="high"><button>High</button></ml-button>' +
    '<ml-button id="medium"><button>Medium</button></ml-button>';
  await mount(page, pair);
  await page.waitForFunction(() => document.querySelectorAll('ml-button > [data-ml-renderer="webgl"]').length === 2);
  const counts = await glassCadence(page);
  const native = await page.evaluate(() => {
    window.isMediumRate = a => a && ('frameRate' in a ? a.frameRate === 90 : /^(steps|linear)\(/.test(a.effect.getTiming().easing));
    return 'frameRate' in Animation.prototype;
  });

  await page.locator('main').evaluate(main => main.insertAdjacentHTML('beforeend',
    '<ml-spinner id="ring"></ml-spinner><ml-spinner id="fast" data-ml-motion="high"></ml-spinner>' +
    '<div id="app" style="opacity:.2;transition:opacity 400ms ease-in">Host content</div>' +
    '<ml-progress id="progress"><progress value="15" max="100"></progress></ml-progress>'));
  await page.waitForFunction(() => window.isMediumRate(document.querySelector('#ring .ml-spinner-ring')?.getAnimations()[0]));
  const ringStates = await page.evaluate(() => {
    const sample = id => {
      const ring = document.querySelector('#' + id + ' .ml-spinner-ring');
      const animation = ring.getAnimations()[0];
      animation.pause();
      const values = new Set();
      for (let i = 0; i < 240; i++) {
        animation.currentTime = i * 1000 / 240;
        values.add(getComputedStyle(ring).rotate);
      }
      animation.play();
      return values.size;
    };
    return [sample('ring'), sample('fast')];
  });
  if (!native) assert(ringStates[0] >= 89 && ringStates[0] <= 90, JSON.stringify(ringStates));
  assert.equal(ringStates[1], 240);
  // Switch an already running CSS animation across an inherited boundary, then back.
  await page.locator('html').evaluate(el => { el.dataset.mlMotion = 'high'; });
  await page.waitForFunction(() => document.querySelector('#ring .ml-spinner-ring').getAnimations()[0].effect.getTiming().easing === 'linear');
  await page.locator('html').evaluate(el => { el.dataset.mlMotion = 'medium'; });
  await page.waitForFunction(() => window.isMediumRate(document.querySelector('#ring .ml-spinner-ring').getAnimations()[0]));

  const transition = await page.evaluate(async () => {
    const button = document.getElementById('medium'), app = document.getElementById('app');
    button.style.setProperty('--ml-travel', '400ms');
    const reference = getComputedStyle(button).getPropertyValue('--ml-ease').trim();
    void button.offsetWidth;
    button.style.translate = '100px'; app.style.opacity = '.8';
    const animation = button.getAnimations().find(a => a.transitionProperty === 'translate');
    animation.pause();
    await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
    const original = new KeyframeEffect(null, [], { duration: 400, easing: reference, fill: 'both' });
    const clock = new Animation(original, null);
    const readings = [100.1, 104.2, 108.2].map(ms => {
      animation.currentTime = ms;
      return parseFloat(getComputedStyle(button).translate);
    });
    clock.currentTime = 100;
    const expected = 100 * original.getComputedTiming().progress;
    const host = app.getAnimations()[0].effect.getTiming().easing;
    animation.currentTime = 400;
    const endpoint = parseFloat(getComputedStyle(button).translate);
    animation.cancel();
    return { readings, expected, endpoint, host, rate: animation.frameRate };
  });
  if (native) assert.equal(transition.rate, 90);
  else assert(transition.readings.every(n => Math.abs(n - transition.expected) < .02), JSON.stringify(transition));
  assert.equal(transition.endpoint, 100);
  assert.equal(transition.host, 'ease-in');

  const longTransition = await page.evaluate(async () => {
    const button = document.getElementById('medium');
    button.style.translate = 'none';
    button.style.setProperty('--ml-travel', '0s');
    void button.offsetWidth;
    button.style.setProperty('--ml-travel', '10s');
    const reference = getComputedStyle(button).getPropertyValue('--ml-ease').trim();
    button.style.translate = '100px';
    const animation = button.getAnimations().find(a => a.transitionProperty === 'translate');
    animation.pause();
    const tick = () => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
    await tick();
    const referenceEffect = new KeyframeEffect(null, [], { duration: 10000, easing: reference, fill: 'both' });
    const clock = new Animation(referenceEffect, null);
    function expectedAt(t) {
      clock.currentTime = t;
      return 100 * referenceEffect.getComputedTiming().progress;
    }
    animation.currentTime = 1009;
    const held = parseFloat(getComputedStyle(button).translate), sampled = animation.effect.getTiming().easing;
    button.dataset.mlMotion = 'high';
    await tick();
    const continuous = parseFloat(getComputedStyle(button).translate);
    const restored = animation.effect.getKeyframes()[0].easing;
    animation.currentTime = 10000;
    const endpoint = parseFloat(getComputedStyle(button).translate);
    animation.cancel();
    delete button.dataset.mlMotion;
    return { held, sampled, continuous, restored, endpoint, expectedHeld: expectedAt(1000), expectedContinuous: expectedAt(1009) };
  });
  if (!native) {
    assert.equal(longTransition.sampled, 'steps(900)');
    assert(Math.abs(longTransition.held - longTransition.expectedHeld) < .02, JSON.stringify(longTransition));
  }
  assert(Math.abs(longTransition.continuous - longTransition.expectedContinuous) < .02, JSON.stringify(longTransition));
  assert.equal(longTransition.restored, 'linear');
  assert.equal(longTransition.endpoint, 100);

  await page.locator('#progress > progress').evaluate(el => { el.value = 90; });
  await page.waitForFunction(() => document.querySelector('#progress .ml-progress-fill')?.getAnimations()
    .some(a => a.transitionProperty === 'width' && window.isMediumRate(a)));

  const manual = await page.evaluate(() => {
    const el = document.createElement('div'); document.querySelector('main').append(el);
    MaterialMotion.press(el);
    const animation = el.getAnimations()[0]; animation.pause();
    const result = { duration: animation.effect.getTiming().duration, overall: animation.effect.getTiming().easing,
      segment: animation.effect.getKeyframes()[0].easing };
    MaterialMotion.finish(el);
    return result;
  });
  assert.deepEqual(manual, { duration: 200, overall: native ? 'linear' : 'steps(18)', segment: 'ease-out' });
  // CSS animation events do not cross a shadow root. A standalone spinner registers its own root.
  await page.evaluate(() => {
    const host = document.querySelector('main').appendChild(document.createElement('div'));
    host.id = 'nested';
    const root = host.attachShadow({ mode: 'open' });
    const skin = [...document.querySelectorAll('style')].find(style => style.textContent.includes('@keyframes ml-loading-turn'));
    root.append(skin.cloneNode(true));
    root.append(document.createElement('ml-spinner'));
  });
  const shadowRing = page.locator('#nested .ml-spinner-ring');
  await page.waitForFunction(() => window.isMediumRate(document.getElementById('nested').shadowRoot.querySelector('.ml-spinner-ring').getAnimations()[0]));
  await page.locator('#nested').evaluate(el => { el.dataset.mlMotion = 'high'; });
  await addFrames(page);
  assert.equal(await shadowRing.evaluate(el => el.getAnimations()[0].effect.getTiming().easing), 'linear');
  await page.locator('#medium > button').evaluate(button => button.setAttribute('aria-busy', 'true'));
  await page.waitForFunction(() => document.querySelector('#medium > button').getAnimations({ subtree: true })
    .some(a => a.effect.pseudoElement === '::before' && window.isMediumRate(a)));

  // A standalone component must register its shadow root even when all glass lighting is off.
  const switchCSS = await page.addStyleTag({ path: fileURLToPath(new URL('components/switch/switch.css', dist)) });
  await page.addScriptTag({ path: fileURLToPath(new URL('components/switch/switch.js', dist)) });
  await switchCSS.evaluate(style => {
    const host = document.querySelector('main').appendChild(document.createElement('div'));
    host.id = 'unlit'; host.dataset.mlMaterial = 'base'; host.dataset.mlMotion = 'medium';
    host.style.setProperty('--ml-light-source', 'none');
    const root = host.attachShadow({ mode: 'open' });
    root.append(style.cloneNode(true), document.createElement('ml-switch'));
  });
  await addFrames(page);
  await page.locator('#unlit ml-switch').evaluate(el => { el.checked = true; });
  await addFrames(page);
  assert(await page.locator('#unlit .ml-thumb').evaluate(el => el.getAnimations().some(a => window.isMediumRate(a))),
    'a standalone unlit switch must pace its thumb transition in its shadow root');

  await page.addScriptTag({ path: fileURLToPath(new URL('design/icons.js', dist)) });
  await page.locator('main').evaluate(main => {
    main.insertAdjacentHTML('beforeend', '<section id="clip" data-ml-motion="high" data-ml-material="base" ' +
      'style="position:fixed;left:20px;bottom:20px;height:80px;width:90px;overflow:auto">' +
      '<div style="height:700px"></div><ml-icon name="search" size="40"></ml-icon></section>');
  });
  const icon = page.locator('#clip ml-icon');
  await icon.locator(':scope > svg').waitFor({ state: 'attached' });
  await addFrames(page);
  const clip = await page.locator('#clip').boundingBox();
  await icon.locator(':scope > svg').evaluate(svg => {
    const bounds = svg.getBoundingClientRect;
    window.outsideReads = 0;
    svg.getBoundingClientRect = function () { window.outsideReads++; return bounds.call(this); };
  });
  await page.mouse.move(clip.x + 20, clip.y + 55, { steps: 8 });
  await addFrames(page);
  assert.equal(await page.evaluate(() => window.outsideReads), 0, 'moving the light should skip clipped icons');
  await page.locator('#clip').evaluate(el => { el.scrollTop = el.scrollHeight; });
  await icon.locator('defs[data-ml-icon-light="base"]').waitFor({ state: 'attached' });
  assert(await page.evaluate(() => window.outsideReads > 0), 'a newly visible icon must pick up the stationary pointer');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await addFrames(page);
  assert.equal(await page.locator('#ring .ml-spinner-ring').evaluate(el => el.getAnimations().length), 0);
  await page.close();
  const fallback = await browser.newPage({ reducedMotion: 'no-preference' });
  fallback.on('pageerror', err => errors.push(err.message));
  await fallback.evaluate(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (name, ...args) {
      return name.includes('webgl') ? null : get.call(this, name, ...args);
    };
  });
  await mount(fallback, pair);
  await fallback.waitForFunction(() => document.querySelectorAll('ml-button > [data-ml-renderer="svg"]').length === 2);
  await glassCadence(fallback, 'svg');
  await fallback.locator('html').evaluate(el => { el.dataset.mlMaterial = 'medium'; });
  await fallback.waitForFunction(() => document.querySelectorAll('ml-button > [data-ml-light="medium"]').length === 2);
  await glassCadence(fallback, 'css');
  assert.deepEqual(errors, []);
  console.log('Display-clock simulation ' + JSON.stringify(counts) + ', native CSS states at 240 samples/s ' + JSON.stringify(ringStates));
} finally {
  await browser.close();
}
