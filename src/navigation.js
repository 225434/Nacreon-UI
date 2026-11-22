(() => {
  'use strict';
  const key = Symbol.for('material-lib.navigation.v1');
  if (globalThis[key]) return;
  const generatedTitles = new WeakMap();

  function items(host, selector) {
    return [...host.querySelectorAll(selector)].filter(item => item.closest(host.localName) === host);
  }
  function available(item, boundary) {
    if (item.matches(':disabled, [aria-disabled="true"]')) return false;
    for (let node = item; node && node !== boundary; node = node.parentElement) {
      if (node.matches('[hidden], [inert], [aria-hidden="true"]')) return false;
    }
    return true;
  }
  function focusByKey(event, choices, vertical) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const position = choices.indexOf(event.target);
    if (position < 0) return;
    let index;
    if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = choices.length - 1;
    else {
      const arrows = vertical ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight'];
      let step = arrows.indexOf(event.key);
      if (step < 0) return;
      step = step === 0 ? -1 : 1;
      if (!vertical && getComputedStyle(event.currentTarget).direction === 'rtl') step *= -1;
      index = (position + step + choices.length) % choices.length;
    }
    event.preventDefault();
    choices[index].focus();
  }
  function modifiedLink(event, item) {
    return item.localName === 'a' && (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey);
  }
  function prepareItem(item, labelSelector) {
    if (item.localName === 'button' && !item.hasAttribute('type')) item.type = 'button';
    if (item.title && item.title !== generatedTitles.get(item)) return;
    const label = item.querySelector(labelSelector)?.textContent.trim() || '';
    if (item.title !== label) {
      if (label) item.title = label;
      else item.removeAttribute('title');
    }
    generatedTitles.set(item, label);
  }
  function emit(host, name, detail) {
    host.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }));
  }
  globalThis[key] = { items, available, focusByKey, modifiedLink, prepareItem, emit };
})();
