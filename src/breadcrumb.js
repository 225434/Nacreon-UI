(() => {
  'use strict';
  if (customElements.get('ml-breadcrumb')) return;

  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  const { placePopup } = globalThis[Symbol.for('material-lib.select-picker.v1')];
  let nextId = 0;

  class BreadcrumbPanel extends GlassControl {
    get glassContent() { return this.matches(':popover-open') ? this.querySelector(':scope > ol') : null; }
  }
  customElements.define('ml-breadcrumb-panel', BreadcrumbPanel);

  class Breadcrumb extends GlassControl {
    #trail;
    #overflow;
    #button;
    #panel;
    #links;
    #events;
    #frame = 0;
    #geometry;
    #sizes = new ResizeObserver(() => this.refresh());
    #markup = new MutationObserver(records => {
      if (records.some(record => !(record.target.parentElement ?? record.target).closest?.('.ml-optical') &&
        (record.type !== 'childList' || [...record.addedNodes, ...record.removedNodes].some(node => !node.matches?.('.ml-optical'))))) this.refresh();
    });

    get glassContent() { return this.querySelector(':scope > nav'); }
    get open() { return this.#panel?.matches(':popover-open') ?? false; }

    connectedCallback() {
      super.connectedCallback();
      this.#events = new AbortController();
      this.ownerDocument.fonts?.addEventListener('loadingdone', this.#fontChange, { signal: this.#events.signal });
      this.refresh();
      if (this.#overflow) this.#sizes.observe(this.#trail);
    }

    disconnectedCallback() {
      this.close();
      this.#events.abort();
      this.#sizes.disconnect();
      this.#markup.disconnect();
      super.disconnectedCallback();
    }

    #fontChange = () => this.refresh();

    #mount(trail) {
      this.close();
      this.#panel?.removeEventListener('toggle', this.#toggle);
      this.#panel?.removeEventListener('click', this.#linkClick);
      this.#sizes.disconnect();
      this.#trail = trail;
      this.#overflow = this.#button = this.#panel = this.#links = null;
      if (!trail) return;
      trail.setAttribute('role', 'list');
      if (typeof this.showPopover !== 'function') return;
      const root = this.getRootNode();
      const overflow = trail.querySelector(':scope > .ml-breadcrumb-overflow') ?? this.ownerDocument.createElement('li');
      overflow.className = 'ml-breadcrumb-overflow';
      if (!overflow.firstElementChild) {
        overflow.hidden = true;
        overflow.innerHTML = `<button type="button" aria-label="更多层级" aria-expanded="false"></button>
          <ml-breadcrumb-panel popover="auto"><ol role="list" aria-label="折叠的上级页面"></ol></ml-breadcrumb-panel>`;
        trail.append(overflow);
      }
      this.#overflow = overflow;
      this.#button = overflow.querySelector('button');
      this.#panel = overflow.querySelector('ml-breadcrumb-panel');
      this.#links = this.#panel.querySelector('ol');
      let id;
      do { id = 'ml-breadcrumb-path-' + ++nextId; } while (root.getElementById(id));
      this.#panel.id = id;
      this.#button.setAttribute('popovertarget', id);
      this.#button.setAttribute('aria-controls', id);
      this.#panel.addEventListener('toggle', this.#toggle);
      this.#panel.addEventListener('click', this.#linkClick);
      this.#sizes.observe(trail);
    }

    #items() {
      return [...this.#trail.children].flatMap(item => item === this.#overflow ? [...this.#links.children] : [item])
        .filter(item => item.localName === 'li');
    }

    #widths(items) {
      // Measure the full labels in the trail style without changing focus or the open popover.
      const doc = this.ownerDocument;
      const probe = doc.createElement('div');
      probe.className = 'ml-breadcrumb-measure';
      probe.setAttribute('aria-hidden', 'true');
      probe.inert = true;
      const list = doc.createElement('ol');
      const more = this.#overflow.cloneNode(false);
      more.hidden = false;
      more.append(this.#button.cloneNode(true));
      for (const item of items) {
        const copy = item.cloneNode(true);
        copy.removeAttribute('id');
        for (const child of copy.querySelectorAll('[id]')) child.removeAttribute('id');
        list.append(copy);
      }
      list.append(more);
      probe.append(list);
      this.glassContent.append(probe);
      const widths = [...list.children].map(item => item.getBoundingClientRect().width);
      probe.remove();
      return widths;
    }

    refresh() {
      if (!this.isConnected) return;
      this.#markup.disconnect();
      try {
        const trail = this.querySelector(':scope > nav > ol');
        if (trail !== this.#trail || (this.#overflow && this.#overflow.parentElement !== trail)) this.#mount(trail);
        this.toggleAttribute('data-ml-breadcrumb-ready', Boolean(this.#overflow));
        if (!this.#overflow || !trail.clientWidth) return;
        const items = this.#items();
        const visible = items.filter(item => !item.hidden);
        const lastFolded = this.#folded(visible, trail.clientWidth).at(-1);
        const folded = lastFolded ? items.slice(items.indexOf(visible[0]) + 1, items.indexOf(lastFolded) + 1) : [];
        this.#layout(items, visible[0], folded);
      } finally {
        this.#markup.observe(this, { subtree: true, childList: true, characterData: true, attributes: true,
          attributeFilter: ['hidden', 'aria-current', 'href', 'dir', 'data-home'] });
      }
    }

    #folded(items, capacity) {
      if (items.length < 3) return [];
      const widths = this.#widths(items);
      const trigger = widths.pop();
      if (widths.reduce((sum, width) => sum + width, 0) <= capacity + .5) return [];
      let firstKept = items.length - 1;
      let spare = capacity - widths[0] - trigger - widths[firstKept];
      while (firstKept > 2 && spare >= widths[firstKept - 1]) spare -= widths[--firstKept];
      return items.slice(1, firstKept);
    }

    #layout(items, root, folded) {
      const same = folded.length === this.#links.children.length && folded.every((item, index) => this.#links.children[index] === item);
      this.#geometry = '';
      if (same && this.#overflow.hidden === !folded.length && (!folded.length || this.#overflow.previousElementSibling === root)) return;
      const active = this.getRootNode().activeElement;
      const onTrail = this.#trail.contains(active);
      const activeItem = onTrail && active.closest('li');
      this.close();
      const inline = items.filter(item => !folded.includes(item));
      inline.splice(inline.indexOf(root) + 1, 0, this.#overflow);
      let next = null;
      for (const item of inline.toReversed()) {
        if (item.parentElement !== this.#trail || item.nextElementSibling !== next) this.#trail.insertBefore(item, next);
        next = item;
      }
      this.#links.replaceChildren(...folded);
      this.#overflow.hidden = !folded.length;
      if (!onTrail) return;
      if (folded.includes(activeItem)) this.#button.focus({ preventScroll: true });
      else if (active === this.#button && !folded.length) {
        inline.findLast(item => item !== this.#overflow && !item.hidden && item.querySelector('a[href]'))
          ?.querySelector('a[href]').focus({ preventScroll: true });
      } else if (active !== this.getRootNode().activeElement) active.focus({ preventScroll: true });
    }

    #linkClick = event => {
      if (event.target.closest('a[href]')) this.close();
    };

    #toggle = event => {
      if (event.target !== this.#panel) return;
      const win = this.ownerDocument.defaultView;
      win.cancelAnimationFrame(this.#frame);
      this.#button.setAttribute('aria-expanded', String(this.open));
      this.#geometry = '';
      if (this.open) this.#position();
      else this.#panel.removeAttribute('data-side');
    };

    #position = () => {
      if (!this.open || !this.isConnected) return;
      this.#geometry = placePopup(this, this.#button, this.#panel, this.#geometry);
      if (!this.#geometry) { this.close(); return; }
      this.#frame = this.ownerDocument.defaultView.requestAnimationFrame(this.#position);
    };

    close() {
      if (this.open) this.#panel.hidePopover();
      this.ownerDocument.defaultView?.cancelAnimationFrame(this.#frame);
      this.#button?.setAttribute('aria-expanded', 'false');
      this.#panel?.removeAttribute('data-side');
    }
  }
  customElements.define('ml-breadcrumb', Breadcrumb);
})();
