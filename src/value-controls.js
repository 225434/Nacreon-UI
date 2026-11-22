(() => {
  'use strict';
  const key = Symbol.for('material-lib.value-controls.v1');
  if (globalThis[key]) return;
  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  class ValueSurface extends GlassControl {
    get glassContent() { return this.closest('ml-slider, ml-stepper, ml-date-range, ml-date-picker, ml-time-picker')?.querySelector('input'); }
  }
  customElements.define('ml-value-surface', ValueSurface);

  function part(parent, name, tag = 'span') {
    let element = parent.querySelector(':scope > [data-ml-part="' + name + '"]');
    if (!element) {
      element = parent.ownerDocument.createElement(tag);
      element.dataset.mlPart = name;
      if (tag === 'ml-value-surface') element.setAttribute('aria-hidden', 'true');
      if (tag === 'button') element.type = 'button';
      parent.append(element);
    }
    return element;
  }

  let nextId = 0;
  function ensureId(element) {
    if (!element.id) {
      let id;
      do { id = 'ml-field-' + ++nextId; } while (element.getRootNode().getElementById?.(id));
      element.id = id;
    }
    return element.id;
  }

  // Find the distance between representable values on a decimal step grid.
  // For example, a 1.5 ms step yields three whole milliseconds.
  function stepStride(raw, fallback, scalePower = 0) {
    if (raw.toLowerCase() === 'any') return 1;
    const value = parseFloat(raw);
    if (!Number.isFinite(value) || value <= 0) return fallback;
    const [coefficient, exponent = '0'] = String(value).split('e');
    const [whole, fraction = ''] = coefficient.split('.');
    const power = Number(exponent) + scalePower - fraction.length;
    if (power >= 0) return Math.min(Number.MAX_SAFE_INTEGER, Math.round(value * 10 ** scalePower));
    const numerator = BigInt(whole + fraction);
    let a = numerator, b = 10n ** BigInt(-power);
    while (b) [a, b] = [b, a % b];
    return Math.min(Number.MAX_SAFE_INTEGER, Number(numerator / a));
  }

  function describeUnit(host, input, unit) {
    const hint = part(host, 'unit-description');
    hint.hidden = true;
    const id = ensureId(hint);
    const other = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(token => token && token !== id);
    if (unit) { hint.textContent = '单位 ' + unit.trim(); other.push(id); }
    if (other.length) input.setAttribute('aria-describedby', other.join(' '));
    else input.removeAttribute('aria-describedby');
  }

  // The author-owned native fields keep their labels, validation and form association.
  class ValueField extends HTMLElement {
    static observedAttributes = ['unit'];
    #inputsChanged = new MutationObserver(records => {
      if (records.some(record => record.type === 'attributes' ? record.target.matches('input, fieldset')
        : [...record.addedNodes, ...record.removedNodes].some(node =>
          node.nodeType === 1 && (node.matches('input, label') || node.querySelector('input, label'))))) this.refresh();
    });
    #sync = event => { if (event.target.matches('input')) this.refresh(); };
    #eventRoot;
    #reset = event => {
      if (![...this.querySelectorAll('input')].some(input => input.form === event.target)) return;
      // A trusted reset-button click can run microtasks before the browser restores the inputs.
      setTimeout(() => {
        if (this.isConnected && !event.defaultPrevented) {
          this.closePicker?.();
          this.refresh();
        }
      }, 0);
    };
    connectedCallback() {
      this.addEventListener('input', this.#sync);
      this.addEventListener('change', this.#sync);
      this.#eventRoot = this.getRootNode();
      this.#eventRoot.addEventListener('reset', this.#reset, true);
      this.#inputsChanged.observe(this, { subtree: true, childList: true, attributes: true,
        attributeFilter: ['min', 'max', 'step', 'value', 'disabled', 'readonly', 'type', 'required', 'aria-label', 'id'] });
      for (let p = this.parentElement; p; p = p.parentElement) {
        if (p.localName === 'fieldset') this.#inputsChanged.observe(p, { attributes: true, attributeFilter: ['disabled'] });
      }
      this.refresh();
    }
    disconnectedCallback() {
      this.removeEventListener('input', this.#sync);
      this.removeEventListener('change', this.#sync);
      this.#eventRoot?.removeEventListener('reset', this.#reset, true);
      this.#inputsChanged.disconnect();
    }
    attributeChangedCallback() { if (this.isConnected) this.refresh(); }
  }
  function signal(input) {
    for (const type of ['input', 'change']) input.dispatchEvent(new Event(type, { bubbles: true, composed: true }));
  }
  globalThis[key] = { ValueField, part, ensureId, describeUnit, signal, stepStride };
})();
