(() => {
  'use strict';
  if (customElements.get('ml-menu')) return;

  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  const items = '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';
  const openMenus = new WeakMap();
  let nextId = 0;

  class MenuPanel extends GlassControl {
    get glassContent() {
      return this.hasAttribute('data-ml-menu-shown') ? this.querySelector(':scope > [role="menu"]') : null;
    }
  }

  class ActionMenu extends GlassControl {
    #id = 'ml-menu-' + ++nextId;
    #panel;
    #body;
    #button;
    #session;
    #frame = 0;
    #geometry = '';
    #prefix = '';
    #lastKey = 0;
    #markup = new MutationObserver(() => {
      this.#wire();
      if (!this.open) return;
      this.#prepareItems();
      const active = this.getRootNode().activeElement;
      if (!this.#body.contains(active) || !active.getClientRects().length || active.matches(':disabled')) this.#focusEdge(false);
    });

    get open() { return Boolean(this.#session); }
    get trigger() { return this.querySelector(':scope > button'); }

    connectedCallback() {
      super.connectedCallback();
      this.#wire();
      this.#markup.observe(this, { childList: true, subtree: true, attributes: true,
        attributeFilter: ['disabled', 'hidden', 'role', 'aria-hidden'] });
      this.addEventListener('click', this.#guardDisabled, true);
      this.addEventListener('click', this.#click);
      this.addEventListener('keydown', this.#key);
      this.addEventListener('pointermove', this.#point);
      this.addEventListener('beforetoggle', this.#nativeToggle, true);
    }

    disconnectedCallback() {
      this.close();
      this.#markup.disconnect();
      this.removeEventListener('click', this.#guardDisabled, true);
      this.removeEventListener('click', this.#click);
      this.removeEventListener('keydown', this.#key);
      this.removeEventListener('pointermove', this.#point);
      this.removeEventListener('beforetoggle', this.#nativeToggle, true);
      super.disconnectedCallback();
    }

    #wire() {
      const button = this.trigger;
      const panel = this.querySelector(':scope > ml-menu-panel');
      const body = panel?.querySelector(':scope > [role="menu"]');
      if (this.open && (this.#button !== button || this.#panel !== panel || this.#body !== body || button?.matches(':disabled'))) this.close();
      this.#button = button;
      this.#panel = panel;
      this.#body = body;
      if (!panel || !button || !body) return;
      if (!button.hasAttribute('type')) button.type = 'button';
      if (panel.getAttribute('popover') !== 'manual') panel.setAttribute('popover', 'manual');
      if (!this.open) panel.removeAttribute('data-ml-menu-shown');
      // Generated names are local to this instance, including a clone of a live menu.
      for (const [node, suffix] of [[button, 'trigger'], [body, 'items']]) {
        if (!node.id || node.hasAttribute('data-ml-menu-id')) {
          node.id = this.#id + '-' + suffix;
          node.setAttribute('data-ml-menu-id', '');
        }
      }
      button.setAttribute('aria-haspopup', 'menu');
      button.setAttribute('aria-controls', body.id);
      button.setAttribute('aria-expanded', String(this.open));
      if (!body.hasAttribute('aria-label') && (!body.hasAttribute('aria-labelledby') || body.hasAttribute('data-ml-menu-label'))) {
        body.setAttribute('aria-labelledby', button.id);
        body.setAttribute('data-ml-menu-label', '');
      }
      body.tabIndex = -1;
    }

    #prepareItems() {
      for (const item of this.#body.querySelectorAll(items)) {
        if (item.closest('[role="menu"]') !== this.#body) continue;
        item.tabIndex = -1;
        if (item.localName === 'button' && !item.hasAttribute('type')) item.type = 'button';
        if (item.getAttribute('role') !== 'menuitem' && !item.hasAttribute('aria-checked')) item.setAttribute('aria-checked', 'false');
      }
    }

    #rows() {
      return [...this.#body.querySelectorAll(items)].filter(item => item.closest('[role="menu"]') === this.#body &&
        !item.matches(':disabled') && !item.closest('[inert], [aria-hidden="true"]') && item.getClientRects().length);
    }

    show(last = false) {
      this.#wire();
      const button = this.#button, panel = this.#panel;
      if (this.open || !this.isConnected || !this.#body || !button || button.matches(':disabled, [aria-disabled="true"]') ||
          button.closest('[inert]') || !button.getClientRects().length) return;
      const doc = this.ownerDocument;
      openMenus.get(doc)?.close();
      openMenus.set(doc, this);
      this.#session = new AbortController();
      this.#prefix = '';
      this.#geometry = '';
      this.#prepareItems();
      button.setAttribute('aria-expanded', 'true');
      panel.setAttribute('data-ml-menu-shown', '');
      if (typeof panel.showPopover === 'function') {
        panel.showPopover();
        if (!panel.matches(':popover-open')) { this.close(); return; }
      }
      this.#track();
      if (!this.open) return;
      const opts = { capture: true, signal: this.#session.signal };
      // Each root sees a different target when the menu lives inside a closed shadow tree.
      for (let boundary = this; boundary; boundary = boundary.getRootNode().host) {
        const root = boundary.getRootNode(), inside = boundary;
        const dismiss = event => { if (!event.composedPath().includes(inside)) this.close(); };
        root.addEventListener('pointerdown', dismiss, opts);
        root.addEventListener('focusin', dismiss, opts);
      }
      this.#focusEdge(last);
    }

    close(restoreFocus = false) {
      if (!this.open) return;
      this.#release();
      if (typeof this.#panel.hidePopover === 'function' && this.#panel.matches(':popover-open')) this.#panel.hidePopover();
      if (restoreFocus && this.#button.isConnected) this.#button.focus({ preventScroll: true });
    }

    #release() {
      this.#session.abort();
      this.#session = null;
      openMenus.delete(this.ownerDocument);
      this.ownerDocument.defaultView.cancelAnimationFrame(this.#frame);
      this.#button.setAttribute('aria-expanded', 'false');
      this.#panel.removeAttribute('data-ml-menu-shown');
    }

    #nativeToggle = event => {
      if (event.target === this.#panel && event.newState === 'closed' && this.open) this.#release();
    };

    #focus(row) {
      (row || this.#body).focus({ preventScroll: true });
      if (!row) return;
      const r = row.getBoundingClientRect(), b = this.#body.getBoundingClientRect();
      if (r.top < b.top) this.#body.scrollTop -= b.top - r.top;
      else if (r.bottom > b.bottom) this.#body.scrollTop += r.bottom - b.bottom;
    }

    #focusEdge(last) { this.#focus(this.#rows().at(last ? -1 : 0)); }
    #item(target) {
      const row = target.closest?.(items);
      return this.open && row && row.closest('[role="menu"]') === this.#body ? row : null;
    }

    #guardDisabled = event => {
      const row = this.#item(event.target);
      if ((row && (row.matches(':disabled, [aria-disabled="true"]') || !row.getClientRects().length || row.closest('[inert], [aria-hidden="true"]'))) ||
          (this.#button?.contains(event.target) && this.#button.matches('[aria-disabled="true"]'))) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };

    #click = event => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (this.#button?.contains(event.target)) {
        event.preventDefault();
        if (this.open) this.close(true);
        else this.show();
        return;
      }
      const item = this.#item(event.target);
      if (!item) return;
      const role = item.getAttribute('role');
      let checked;
      if (role === 'menuitemcheckbox') checked = item.getAttribute('aria-checked') !== 'true';
      if (role === 'menuitemradio') {
        checked = true;
        const group = item.closest('[role="group"], [role="menu"]');
        for (const peer of group.querySelectorAll('[role="menuitemradio"]')) {
          if (peer !== item && peer.closest('[role="group"], [role="menu"]') === group) peer.setAttribute('aria-checked', 'false');
        }
      }
      if (checked !== undefined) item.setAttribute('aria-checked', String(checked));
      if (role !== 'menuitemcheckbox' || !this.hasAttribute('keep-open')) this.close(true);
      this.dispatchEvent(new CustomEvent('ml-menu-action', { bubbles: true, composed: true,
        detail: { action: item.dataset.action || '', item, checked } }));
    };

    #point = event => {
      if (event.pointerType !== 'mouse' || (!event.movementX && !event.movementY)) return;
      const row = this.#item(event.target);
      if (row && !row.matches(':disabled') && row !== this.getRootNode().activeElement) this.#focus(row);
    };

    #key = event => {
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.altKey || event.ctrlKey || event.metaKey) return;
      const key = event.key;
      if (!this.open) {
        if (event.target === this.#button && (key === 'ArrowUp' || key === 'ArrowDown')) {
          event.preventDefault(); this.show(key === 'ArrowUp');
        }
        return;
      }
      if (key === 'Tab') { this.close(true); return; }
      if (key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.close(true); return; }
      const row = this.#item(event.target);
      if (!row && event.target !== this.#body) return;
      if (key === 'Enter' || key === ' ') {
        event.preventDefault();
        if (!event.repeat) row?.click();
        return;
      }
      const rows = this.#rows();
      if (!rows.length) return;
      const index = rows.indexOf(row);
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) {
        event.preventDefault();
        const next = key === 'Home' ? 0 : key === 'End' ? rows.length - 1 : index + (key === 'ArrowDown' ? 1 : -1);
        this.#focus(rows[(next + rows.length) % rows.length]);
      } else if (key.length === 1) {
        event.preventDefault();
        const now = performance.now(), ch = key.normalize('NFKC').toLocaleLowerCase();
        this.#prefix = now - this.#lastKey > 650 ? ch : this.#prefix + ch;
        this.#lastKey = now;
        const single = [...this.#prefix].every(letter => letter === ch);
        const start = Math.max(0, index + (single ? 1 : 0));
        const match = rows.slice(start).concat(rows.slice(0, start)).find(item =>
          (item.getAttribute('aria-label') || item.textContent).trim().normalize('NFKC').toLocaleLowerCase().startsWith(single ? ch : this.#prefix));
        if (match) this.#focus(match);
      }
    };

    // Only an open menu tracks its anchor. Measure the scrollable content to choose
    // the side even when the available height has already constrained the panel.
    #track = () => {
      const panel = this.#panel, body = this.#body, doc = this.ownerDocument;
      const win = doc.defaultView, view = win.visualViewport, a = this.#button.getBoundingClientRect();
      const x = view?.offsetLeft ?? 0, y = view?.offsetTop ?? 0;
      const w = view?.width ?? doc.documentElement.clientWidth, h = view?.height ?? doc.documentElement.clientHeight;
      if (!a.width || !a.height || a.bottom <= y || a.top >= y + h || a.right <= x || a.left >= x + w ||
          this.#button.matches(':disabled, [aria-disabled="true"]') || this.closest('[inert]')) { this.close(); return; }
      const rtl = getComputedStyle(this).direction === 'rtl', end = this.getAttribute('align') === 'end';
      const geometry = [a.x, a.y, a.width, a.height, x, y, w, h, rtl, end, panel.offsetWidth, body.scrollHeight].join('/');
      if (geometry !== this.#geometry) {
        this.#geometry = geometry;
        const margin = 8, gap = 5;
        panel.style.setProperty('--ml-menu-viewport', Math.max(1, w - 2 * margin) + 'px');
        const width = panel.offsetWidth, natural = body.scrollHeight + panel.offsetHeight - body.clientHeight;
        const above = a.top - y - margin - gap, below = y + h - margin - a.bottom - gap;
        const up = below < natural && above > below;
        const space = Math.max(1, h - 2 * margin);
        const overlap = Math.max(above, below) < Math.min(56, space);
        const room = overlap ? space : Math.max(1, up ? above : below);
        const left = end !== rtl ? a.right - width : a.left;
        panel.dataset.side = up ? 'above' : 'below';
        panel.style.setProperty('--ml-menu-room', room + 'px');
        panel.style.left = Math.max(x + margin, Math.min(left, x + w - margin - width)) + 'px';
        const top = up ? a.top - gap - panel.offsetHeight : a.bottom + gap;
        panel.style.top = Math.max(y + margin, Math.min(top, y + h - margin - panel.offsetHeight)) + 'px';
      }
      this.#frame = win.requestAnimationFrame(this.#track);
    };
  }

  customElements.define('ml-menu-panel', MenuPanel);
  customElements.define('ml-menu', ActionMenu);
})();
