(() => {
  'use strict';
  if (customElements.get('ml-sidebar')) return;
  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  const { items, available, focusByKey, modifiedLink, prepareItem, emit } = globalThis[Symbol.for('material-lib.navigation.v1')];
  const selector = 'button[data-value], a[href][data-value]';
  let serial = 0;

  class MaterialSidebar extends GlassControl {
    static observedAttributes = ['value', 'collapsed', 'layout', 'label'];
    #nav;
    #toggle;
    #caption;
    #current;
    #narrow = false;
    #expanded = false;
    #reflecting = false;
    #container;
    #resize = new ResizeObserver(() => this.#layout());
    #watch = new MutationObserver(records => {
      const changed = records.some(record => {
        if (record.target === this) return [...record.addedNodes, ...record.removedNodes].some(node => node.localName === 'nav');
        const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
        return this.#nav?.contains(target) && !target.closest('svg, ml-icon');
      });
      if (changed) this.#sync();
    });
    get glassContent() { return this; }
    get value() { return this.getAttribute('value') ?? ''; }
    set value(value) { this.setAttribute('value', value ?? ''); }
    get collapsed() { return this.hasAttribute('collapsed'); }
    set collapsed(flag) { this.toggleAttribute('collapsed', Boolean(flag)); }
    get narrow() { return this.#narrow; }
    get expanded() { return this.#narrow ? this.#expanded : !this.collapsed; }
    connectedCallback() {
      super.connectedCallback();
      this.#toggle = this.querySelector(':scope > .ml-side-toggle');
      if (!this.#toggle) {
        this.#toggle = this.ownerDocument.createElement('button');
        this.#toggle.type = 'button';
        this.#toggle.className = 'ml-side-toggle';
        this.#toggle.innerHTML = '<span class="ml-side-symbol" aria-hidden="true"></span><span class="ml-side-caption"></span><span class="ml-side-chevron" aria-hidden="true"></span>';
        this.prepend(this.#toggle);
      }
      this.#caption = this.#toggle.querySelector('.ml-side-caption');
      this.#container = this.parentElement?.closest('[data-ml-sidebar-layout]');
      if (this.#container) this.#resize.observe(this.#container);
      this.ownerDocument.defaultView.addEventListener('resize', this.#layout);
      this.ownerDocument.addEventListener('pointerdown', this.#outside, true);
      this.addEventListener('keydown', this.#key);
      this.addEventListener('click', this.#click, true);
      this.#sync();
      this.#layout();
      this.#watch.observe(this, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['data-value', 'href', 'disabled', 'aria-disabled', 'hidden', 'inert', 'aria-hidden', 'aria-label'] });
    }
    disconnectedCallback() {
      this.#watch.disconnect();
      this.#resize.disconnect();
      this.ownerDocument.defaultView.removeEventListener('resize', this.#layout);
      this.ownerDocument.removeEventListener('pointerdown', this.#outside, true);
      this.removeEventListener('keydown', this.#key);
      this.removeEventListener('click', this.#click, true);
      this.#expanded = false;
      super.disconnectedCallback();
    }
    attributeChangedCallback(name, old, value) {
      if (!this.isConnected || !this.#toggle || this.#reflecting || old === value) return;
      if (name === 'layout') this.#layout();
      else this.#sync();
    }
    toggleNavigation() {
      if (this.#narrow) this.#expanded = !this.#expanded;
      else this.collapsed = !this.collapsed;
      this.#render();
      this.#notify();
    }
    closeNavigation(restoreFocus = false) {
      if (!this.#narrow || !this.#expanded) return;
      this.#expanded = false;
      if (restoreFocus) this.#toggle.focus({ preventScroll: true });
      this.#render();
      this.#notify();
    }
    #notify() { emit(this, 'ml-sidebar-toggle', { narrow: this.#narrow, collapsed: this.collapsed, expanded: this.expanded }); }
    #layout = () => {
      const layout = this.getAttribute('layout');
      const width = this.#container?.getBoundingClientRect().width ?? this.ownerDocument.documentElement.clientWidth;
      const narrow = layout === 'disclosure' || (layout !== 'inline' && width > 0 && width <= 560);
      if (this.#narrow !== narrow) {
        if (narrow && this.#nav?.contains(this.ownerDocument.activeElement)) this.#toggle.focus({ preventScroll: true });
        this.#narrow = narrow;
        this.#expanded = false;
      }
      this.#render();
    };
    #choices() { return this.#nav ? items(this, selector).filter(item => this.#nav.contains(item) && available(item, this.#nav)) : []; }
    #sync() {
      const nav = this.querySelector(':scope > nav');
      if (nav && nav !== this.#nav) {
        if (!nav.id || this.ownerDocument.getElementById(nav.id) !== nav) {
          let id;
          do { id = 'ml-side-nav-' + (++serial); } while (this.ownerDocument.getElementById(id));
          nav.id = id;
        }
        this.#toggle.setAttribute('aria-controls', nav.id);
      }
      this.#nav = nav;
      if (!nav) { this.#render(); return; }
      const choices = this.#choices();
      const selected = choices.find(el => el.dataset.value === this.value) ??
        choices.find(el => el.getAttribute('aria-current') === 'page') ?? choices[0];
      const previousValue = this.#current;
      this.#current = selected?.dataset.value ?? '';
      if (choices.length || previousValue) {
        this.#reflecting = true;
        if (this.value !== this.#current) this.value = this.#current;
        this.#reflecting = false;
      }
      for (const item of items(this, selector)) {
        if (item === selected) item.setAttribute('aria-current', 'page');
        else item.removeAttribute('aria-current');
        prepareItem(item, '.ml-side-label');
      }
      this.#render(selected);
      if (previousValue !== undefined && previousValue !== this.#current) {
        emit(this, 'ml-sidebar-change', { value: this.#current, previousValue, item: selected ?? null });
      }
    }
    #render(selected = this.#nav?.querySelector('[aria-current="page"]')) {
      if (!this.#toggle) return;
      this.toggleAttribute('data-ml-narrow', this.#narrow);
      const expanded = this.expanded;
      const label = this.getAttribute('label') || this.#nav?.getAttribute('aria-label') || '导航';
      const current = selected?.querySelector('.ml-side-label')?.textContent.trim() || selected?.getAttribute('aria-label') || selected?.textContent.trim();
      const caption = this.#narrow ? current || label : label;
      if (this.#caption.textContent !== caption) this.#caption.textContent = caption;
      const action = (expanded ? '收起' : '展开') + label + (this.#narrow && current ? '，当前为' + current : '');
      this.#toggle.title = action;
      this.#toggle.setAttribute('aria-label', action);
      this.#toggle.setAttribute('aria-expanded', String(expanded));
      if (this.#nav) this.#nav.toggleAttribute('hidden', this.#narrow && !expanded);
    }
    #key = event => {
      if (event.target.closest('ml-sidebar') !== this || event.defaultPrevented) return;
      if (event.key === 'Escape' && this.#narrow && this.#expanded) {
        event.preventDefault(); event.stopPropagation(); this.closeNavigation(true);
      } else focusByKey(event, this.#choices(), true);
    };
    #click = event => {
      if (event.target.closest?.('ml-sidebar') !== this || event.defaultPrevented) return;
      if (this.#toggle.contains(event.target)) { this.toggleNavigation(); return; }
      const item = event.target.closest?.(selector);
      if (!item || !this.#nav?.contains(item)) return;
      if (!available(item, this.#nav)) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      if (modifiedLink(event, item)) return;
      this.value = item.dataset.value;
      this.closeNavigation(true);
    };
    #outside = event => { if (!event.composedPath().includes(this)) this.closeNavigation(); };
  }
  customElements.define('ml-sidebar', MaterialSidebar);
})();
