(() => {
  'use strict';
  if (customElements.get('ml-accordion')) return;

  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  const supportsGroups = 'name' in HTMLDetailsElement.prototype;
  const names = new WeakMap();
  let sequence = 0;

  class MaterialAccordion extends GlassControl {
    static observedAttributes = ['mode'];
    #group = 'ml-accordion-group-' + ++sequence;
    #items = new Set();
    #closing = new Map();
    #changes = new MutationObserver(records => {
      if (records.some(record => record.type === 'childList' && record.target === this &&
        [...record.addedNodes, ...record.removedNodes].some(node => node.localName === 'details'))) {
        this.#syncGroup();
      }
      const changed = records.filter(record => record.type === 'attributes' && this.#items.has(record.target))
        .map(record => record.target);
      if (!supportsGroups && this.#single) {
        this.#keepOne(changed.findLast(item => item.open));
      }
      for (const item of new Set(changed)) this.#syncPanel(item);
    });

    get #single() { return this.getAttribute('mode') === 'single'; }
    get glassContent() { return this.querySelector(':scope > details:not([hidden])') && this; }

    connectedCallback() {
      super.connectedCallback();
      this.#changes.observe(this, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
      this.#syncGroup();
      this.addEventListener('keydown', this.#onKey);
    }

    disconnectedCallback() {
      this.removeEventListener('keydown', this.#onKey);
      this.#changes.disconnect();
      for (const panel of this.#closing.keys()) this.#endClose(panel);
      for (const item of this.#items) if (item.parentElement !== this) this.#restoreName(item);
      super.disconnectedCallback();
    }

    attributeChangedCallback(name, before, after) {
      if (this.isConnected && before !== after) this.#syncGroup();
    }

    #syncGroup() {
      const items = new Set(this.querySelectorAll(':scope > details'));
      for (const item of this.#items) if (!items.has(item)) this.#restoreName(item);
      this.#items = items;
      if (this.#single) this.#keepOne([...items].find(item => item.open));
      for (const item of items) {
        const original = names.get(item) ?? { name: item.getAttribute('name') };
        original.owner = this;
        names.set(item, original);
        if (this.#single) {
          if (item.getAttribute('name') !== this.#group) item.setAttribute('name', this.#group);
        } else item.removeAttribute('name');
      }
    }

    #restoreName(item) {
      const original = names.get(item);
      if (original?.owner !== this) return;
      if (original.name === null) item.removeAttribute('name');
      else item.setAttribute('name', original.name);
      names.delete(item);
    }

    #keepOne(open) {
      if (!open) return;
      for (const item of this.#items) if (item !== open && item.open) item.open = false;
    }

    #syncPanel(item) {
      const summary = item.querySelector(':scope > summary:first-child');
      const panel = item.querySelector(':scope > summary + .ml-accordion-panel:last-child');
      if (!summary || !panel) return;
      if (item.open) {
        this.#endClose(panel);
        return;
      }
      if (panel.contains(this.getRootNode().activeElement)) summary.focus({ preventScroll: true });
      // Native details hides the panel once the exit finishes. Until then, skip its controls.
      const fade = panel.getAnimations().find(animation => animation.transitionProperty === 'opacity');
      if (!fade || (panel.inert && !this.#closing.has(panel))) return;
      panel.inert = true;
      this.#closing.set(panel, fade);
      const settle = () => { if (this.#closing.get(panel) === fade) this.#endClose(panel); };
      fade.finished.then(settle, settle);
    }

    #endClose(panel) {
      if (this.#closing.delete(panel)) panel.inert = false;
    }

    #onKey = event => {
      const keys = ['ArrowUp', 'ArrowDown', 'Home', 'End'];
      const from = event.target;
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
          !keys.includes(event.key) || !from.matches('summary:first-child') || from.parentElement.parentElement !== this) return;
      const headers = Array.from(this.querySelectorAll(':scope > details > summary:first-child'))
        .filter(summary => !summary.closest('[inert]') && summary.getClientRects().length);
      const index = headers.indexOf(from);
      if (index === -1) return;
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? headers.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + headers.length) % headers.length;
      event.preventDefault();
      headers[next].focus();
    };
  }
  customElements.define('ml-accordion', MaterialAccordion);
})();
