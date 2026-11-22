(() => {
  'use strict';
  if (customElements.get('ml-toolbar')) return;
  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  const { items, available, focusByKey, modifiedLink, prepareItem, emit } = globalThis[Symbol.for('material-lib.navigation.v1')];
  const selector = 'button[data-action], a[href][data-action]';

  class MaterialToolbar extends GlassControl {
    static observedAttributes = ['orientation'];
    #current;
    #watch = new MutationObserver(records => {
      if (records.some(record => {
        const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
        if (target?.closest('svg, ml-icon, .ml-optical')) return false;
        return record.type === 'attributes' || target?.closest('.ml-tool-label') ||
          [...record.addedNodes, ...record.removedNodes].some(node => node.matches?.(selector + ', .ml-tool-label') || node.querySelector?.(selector));
      })) this.#sync();
    });
    get glassContent() { return this; }
    get orientation() { return this.getAttribute('orientation') === 'vertical' ? 'vertical' : 'horizontal'; }
    set orientation(value) { this.setAttribute('orientation', value); }
    attributeChangedCallback() { if (this.isConnected) this.setAttribute('aria-orientation', this.orientation); }
    connectedCallback() {
      super.connectedCallback();
      this.setAttribute('role', 'toolbar');
      this.setAttribute('aria-orientation', this.orientation);
      this.#sync();
      this.#watch.observe(this, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-action', 'href', 'disabled', 'aria-disabled', 'hidden', 'inert', 'aria-hidden'] });
      this.addEventListener('focusin', this.#focus);
      this.addEventListener('click', this.#click, true);
      this.addEventListener('keydown', this.#key);
    }
    disconnectedCallback() {
      this.#watch.disconnect();
      this.removeEventListener('focusin', this.#focus);
      this.removeEventListener('click', this.#click, true);
      this.removeEventListener('keydown', this.#key);
      super.disconnectedCallback();
    }
    #sync(preferred = this.#current) {
      const commands = items(this, selector);
      const enabled = commands.filter(el => available(el, this));
      this.#current = enabled.includes(preferred) ? preferred : enabled[0];
      for (const command of commands) {
        command.tabIndex = command === this.#current ? 0 : -1;
        prepareItem(command, '.ml-tool-label');
      }
      return enabled;
    }
    #focus = event => {
      if (event.target.matches(selector) && event.target.closest('ml-toolbar') === this) this.#sync(event.target);
    };
    #key = event => {
      if (event.target.closest('ml-toolbar') === this && !event.defaultPrevented) focusByKey(event, this.#sync(), this.orientation === 'vertical');
    };
    #click = event => {
      const item = event.target.closest?.(selector);
      if (!item || item.closest('ml-toolbar') !== this || event.defaultPrevented) return;
      if (!available(item, this)) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      if (modifiedLink(event, item)) return;
      this.#sync(item);
      let pressed = null;
      if (item.hasAttribute('aria-pressed')) {
        pressed = item.getAttribute('aria-pressed') !== 'true';
        item.setAttribute('aria-pressed', String(pressed));
      }
      emit(this, 'ml-toolbar-action', { action: item.dataset.action, item, pressed });
    };
  }
  customElements.define('ml-toolbar', MaterialToolbar);
})();
