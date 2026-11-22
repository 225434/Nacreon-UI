(() => {
  'use strict';
  if (customElements.get('ml-tabs')) return;

  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  const { available, focusByKey, emit } = globalThis[Symbol.for('material-lib.navigation.v1')];
  const listSelector = '[data-ml-tablist]';
  const panelSelector = '[data-panel]';
  const tabSelector = 'button[data-tab]';
  const sideWidth = 480;
  let nextId = 0;

  function ensureId(element, prefix) {
    const root = element.getRootNode();
    if (element.id && !/\s/.test(element.id) && root.querySelectorAll('#' + CSS.escape(element.id)).length === 1) return element.id;
    let id;
    do { id = 'ml-' + prefix + '-' + ++nextId; } while (root.getElementById(id));
    element.id = id;
    return id;
  }

  // Reveal a tab within its own scroll container without moving the page.
  function reveal(list, tab, vertical) {
    const frame = list.getBoundingClientRect();
    if (!frame.width || !frame.height) return;
    const rect = tab.getBoundingClientRect();
    const start = vertical ? rect.top - frame.top - list.clientTop : rect.left - frame.left - list.clientLeft;
    const end = start + (vertical ? rect.height - list.clientHeight : rect.width - list.clientWidth);
    const distance = start < 0 ? start : Math.max(0, end);
    if (distance) {
      if (vertical) list.scrollTop += distance;
      else list.scrollLeft += distance;
    }
  }

  class Tabs extends GlassControl {
    static observedAttributes = ['value', 'orientation', 'activation'];
    #list;
    #marker;
    #panels = [];
    #pairs = new Map();
    #current;
    #currentPanel;
    #connected = false;
    #sizes = new ResizeObserver(() => this.#layout(true));
    #changes = new MutationObserver(records => {
      const changed = records.some(({ target, type, attributeName }) => {
        if (type === 'childList') return target === this || target === this.#list;
        if (target.parentElement === this.#list && target.matches('button')) return true;
        return target.parentElement === this && ['data-ml-tablist', 'data-panel', 'id'].includes(attributeName);
      });
      if (changed) this.refresh();
    });

    get glassContent() { return this; }
    get value() { return this.#current?.dataset.tab ?? ''; }
    set value(value) {
      if (value == null) this.removeAttribute('value');
      else this.setAttribute('value', value);
    }
    get panel() { return this.#currentPanel ?? null; }
    get orientation() { return this.hasAttribute('data-ml-vertical') ? 'vertical' : 'horizontal'; }

    connectedCallback() {
      super.connectedCallback();
      this.#connected = true;
      this.addEventListener('click', this.#click);
      this.addEventListener('focusin', this.#focus);
      this.addEventListener('focusout', this.#blur);
      this.refresh();
      this.#changes.observe(this, { subtree: true, childList: true, attributes: true,
        attributeFilter: ['data-ml-tablist', 'data-tab', 'data-panel', 'id', 'disabled', 'hidden', 'inert', 'aria-hidden', 'aria-disabled'] });
    }

    disconnectedCallback() {
      this.#connected = false;
      this.removeEventListener('click', this.#click);
      this.removeEventListener('focusin', this.#focus);
      this.removeEventListener('focusout', this.#blur);
      this.#list?.removeEventListener('keydown', this.#key);
      this.#list = null;
      this.#sizes.disconnect();
      this.#changes.disconnect();
      super.disconnectedCallback();
    }

    attributeChangedCallback(name, before, after) {
      if (!this.#connected || before === after) return;
      if (name === 'orientation') this.#layout();
      else this.#render();
    }

    refresh() {
      if (!this.#connected) return;
      const list = this.querySelector(':scope > ' + listSelector);
      if (list !== this.#list) {
        this.#list?.removeEventListener('keydown', this.#key);
        this.#list = list;
        this.#marker = list?.querySelector(':scope > .ml-tabs-marker');
        if (list) {
          list.setAttribute('role', 'tablist');
          list.tabIndex = -1;
          if (!this.#marker) {
            this.#marker = this.ownerDocument.createElement('span');
            this.#marker.className = 'ml-tabs-marker';
            this.#marker.setAttribute('aria-hidden', 'true');
            list.prepend(this.#marker);
          }
          list.addEventListener('keydown', this.#key);
        }
      }

      this.#panels = [...this.querySelectorAll(':scope > ' + panelSelector)];
      const byKey = new Map();
      for (const panel of this.#panels) {
        if (panel.dataset.panel && !byKey.has(panel.dataset.panel)) byKey.set(panel.dataset.panel, panel);
      }
      const claimed = new Set();
      this.#pairs.clear();
      this.#sizes.disconnect();
      this.#sizes.observe(this);
      if (list) this.#sizes.observe(list);
      for (const tab of list?.querySelectorAll(':scope > ' + tabSelector) ?? []) {
        const panel = byKey.get(tab.dataset.tab);
        const linked = panel && !claimed.has(panel);
        tab.toggleAttribute('data-ml-tab-orphan', !linked);
        if (!linked) {
          tab.tabIndex = -1;
          tab.removeAttribute('aria-controls');
          tab.removeAttribute('aria-selected');
          continue;
        }
        tab.type = 'button';
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-controls', ensureId(panel, 'tabpanel'));
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-labelledby', ensureId(tab, 'tab'));
        if (!panel.hasAttribute('tabindex')) panel.tabIndex = 0;
        claimed.add(panel);
        this.#pairs.set(tab, panel);
        this.#sizes.observe(tab);
      }
      this.#render();
    }

    select(value) {
      const tab = this.#choices().find(item => item.dataset.tab === String(value));
      if (!tab) return false;
      this.#activate(tab);
      return true;
    }

    #choices() { return [...this.#pairs.keys()].filter(tab => available(tab, this.#list)); }

    #stops(target) {
      for (const tab of this.#pairs.keys()) tab.tabIndex = tab === target ? 0 : -1;
    }

    #render() {
      const choices = this.#choices();
      const requested = this.getAttribute('value');
      const next = choices.find(tab => tab.dataset.tab === requested) ?? choices[0];
      const panel = this.#pairs.get(next);
      const focus = this.getRootNode().activeElement;
      const focusedTab = choices.includes(focus) ? focus : null;
      const focusWillHide = this.#currentPanel && this.#currentPanel !== panel && this.#currentPanel.contains(focus);
      const moveTabFocus = focus?.matches(tabSelector) && focus.parentElement === this.#list &&
        (!focusedTab || this.getAttribute('activation') !== 'manual');
      this.#current = next;
      this.#currentPanel = panel;
      for (const tab of this.#pairs.keys()) tab.setAttribute('aria-selected', String(tab === next));
      this.#stops(moveTabFocus ? next : focusedTab ?? next);
      this.#layout();
      if (next && (focusWillHide || (moveTabFocus && next !== focusedTab))) next.focus({ preventScroll: true });
      for (const page of this.#panels) page.toggleAttribute('hidden', page !== panel);
      if (next && !focusedTab) reveal(this.#list, next, this.orientation === 'vertical');
    }

    #layout(fromResize = false) {
      const vertical = this.getAttribute('orientation') === 'vertical' && this.clientWidth >= sideWidth;
      const changed = this.hasAttribute('data-ml-vertical') !== vertical;
      this.toggleAttribute('data-ml-vertical', vertical);
      if (!this.#list) return;
      this.#list.setAttribute('aria-orientation', this.orientation);
      const tab = this.#current;
      const visible = tab?.offsetWidth > 0 && tab.offsetHeight > 0;
      this.#marker.toggleAttribute('hidden', !visible);
      if (visible) {
        const { offsetLeft, offsetTop, offsetWidth, offsetHeight } = tab;
        const style = this.#marker.style;
        style.setProperty('--ml-tab-x', offsetLeft + 'px');
        style.setProperty('--ml-tab-y', offsetTop + 'px');
        style.setProperty('--ml-tab-w', offsetWidth + 'px');
        style.setProperty('--ml-tab-h', offsetHeight + 'px');
        if (changed || fromResize) {
          const focus = this.getRootNode().activeElement;
          const inList = this.#pairs.has(focus) && available(focus, this.#list);
          reveal(this.#list, inList ? focus : tab, vertical);
        }
      }
    }

    #activate(tab) {
      const previousValue = this.value;
      this.value = tab.dataset.tab;
      if (this.value !== previousValue) emit(this, 'ml-tab-change', { value: this.value, previousValue, tab, panel: this.panel });
    }

    #click = event => {
      const tab = event.target.closest?.(tabSelector);
      if (tab?.parentElement !== this.#list || event.defaultPrevented) return;
      if (!this.#pairs.has(tab) || !available(tab, this.#list)) {
        event.preventDefault();
        return;
      }
      this.#activate(tab);
    };

    #focus = event => {
      const tab = event.target;
      if (!this.#pairs.has(tab) || !available(tab, this.#list)) return;
      this.#stops(tab);
      reveal(this.#list, tab, this.orientation === 'vertical');
      if (this.getAttribute('activation') !== 'manual' && tab !== this.#current) this.#activate(tab);
    };

    #blur = event => {
      if (this.#pairs.has(event.target) && !this.#pairs.has(event.relatedTarget)) this.#stops(this.#current);
    };

    #key = event => {
      if (event.defaultPrevented || event.isComposing) return;
      focusByKey(event, this.#choices(), this.orientation === 'vertical');
    };
  }

  customElements.define('ml-tabs', Tabs);
})();
