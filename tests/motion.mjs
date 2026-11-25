import { launchBrowser } from './helpers/browser.mjs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await launchBrowser(chromium);
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, reducedMotion: 'no-preference' });
  await page.goto(new URL('../index.html#motion', import.meta.url).href);

  // Seek the actual animations to the same instant. Base and low jump, medium approaches,
  // and high passes the endpoint before settling. The comparison uses an identical layout.
  const positions = await page.locator('.motion-card').evaluateAll(cards => cards.map(card => {
    const item = card.querySelector('.ml-motion-item'), track = item.parentElement;
    const start = item.getBoundingClientRect().left;
    MaterialMotion.move(item, () => track.setAttribute('data-ml-end', ''));
    const animation = item.getAnimations()[0];
    if (animation) {
      animation.pause();
      animation.currentTime = animation.effect.getTiming().duration * .52;
    }
    const at = item.getBoundingClientRect().left;
    MaterialMotion.finish(item);
    return (at - start) / (item.getBoundingClientRect().left - start);
  }));
  assert.equal(positions.length, 4);
  assert(Math.abs(positions[0] - 1) < .01 && Math.abs(positions[1] - 1) < .01);
  assert(positions[2] > 0 && positions[2] < 1);
  assert(positions[3] > 1);

  await page.locator('#motion-kinds label').filter({ hasText: '出入场' }).click();
  const notice = page.locator('#motion-live-notice');
  const interrupted = await notice.evaluate(element => {
    const trigger = document.querySelector('#motion-play');
    const inside = document.createElement('button');
    element.append(inside);
    inside.focus();
    MaterialMotion.reveal(element, false, trigger);
    const exit = element.getAnimations()[0];
    exit.pause();
    exit.currentTime = exit.effect.getTiming().duration / 2;
    const closingOpacity = Number(getComputedStyle(element).opacity);
    const focusReturned = document.activeElement === trigger && element.inert;
    MaterialMotion.reveal(element, true, trigger);
    const enter = element.getAnimations()[0];
    enter.pause();
    enter.currentTime = 0;
    return { focusReturned, openingOpacity: Number(getComputedStyle(element).opacity), closingOpacity };
  });
  assert(interrupted.focusReturned);
  assert(Math.abs(interrupted.closingOpacity - interrupted.openingOpacity) < .01);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => !document.getElementById('motion-live-notice').getAnimations().length);
  assert(await notice.evaluate(el => !el.hidden && !el.inert && MaterialMotion.timing(el, 'enter').duration === 0));
  assert.equal(await page.locator('#motion-play').getAttribute('aria-expanded'), 'true');
  console.log('Motion tiers, interrupted disclosure and reduced motion passed.');
} finally {
  await browser.close();
}
