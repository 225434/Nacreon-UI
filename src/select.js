(() => {
  'use strict';

  if (customElements.get('ml-select')) return;
  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  const { GlassScene, GlassSurface } = globalThis[Symbol.for('material-lib.glass.v1')];
  let nextId = 0;
  const { normalize, renderOptions, revealOption, placePopup } = globalThis[Symbol.for('material-lib.select-picker.v1')];

  // The actual select stays visible and owns its label, value, validation and form.
  // Only the open picker is supplied here. Native programmatic writes therefore
  // also update the closed field without a synthetic event or a second model.
  class MaterialSelect extends GlassControl {
    #panel;
    #list;
    #search;
    #empty;
    #native;
    #rows = [];
    #active;
    #selected = -1;
    #geometry = '';
    #prefix = '';
    #lastKey = 0;
    #startedOpen = false;
    #frame = 0;
    #scene;
    #surface;
    #aria;
    #options = new MutationObserver(() => { if (this.open) this.#render(); });

    get select() { return this.querySelector(':scope > select'); }
    get glassContent() {
      const select = this.select;
      return select && !select.multiple && select.size <= 1 ? select : null;
    }
    get open() { return Boolean(this.#native); }

    connectedCallback() {
      this.removeAttribute('data-ml-select-open');
      // A clone of a live field must not retain a second picker with the same IDs.
      for (const copy of this.querySelectorAll(':scope > .ml-select-popup')) {
        if (this.select?.getAttribute('aria-controls') === copy.querySelector('[role="listbox"]')?.id) {
          for (const attr of ['aria-controls', 'aria-expanded', 'aria-activedescendant']) this.select.removeAttribute(attr);
        }
        copy.remove();
      }
      super.connectedCallback();
      this.addEventListener('pointerdown', this.#pointerDown);
      this.addEventListener('mousedown', this.#mouseDown);
      this.addEventListener('click', this.#click);
      this.addEventListener('keydown', this.#keyDown);
      this.addEventListener('focusout', this.#focusOut);
    }

    disconnectedCallback() {
      this.removeEventListener('pointerdown', this.#pointerDown);
      this.removeEventListener('mousedown', this.#mouseDown);
      this.removeEventListener('click', this.#click);
      this.removeEventListener('keydown', this.#keyDown);
      this.removeEventListener('focusout', this.#focusOut);
      this.close();
      this.#panel?.remove();
      this.#panel = null;
      super.disconnectedCallback();
    }

    #canOpen(select) {
      return select && !select.multiple && select.size <= 1 && !select.matches(':disabled') &&
        !select.closest('[inert]') && typeof this.showPopover === 'function';
    }

    #makePanel() {
      const doc = this.ownerDocument;
      const panel = doc.createElement('div');
      panel.className = 'ml-select-popup';
      panel.popover = 'auto';
      const searchBox = doc.createElement('div');
      searchBox.className = 'ml-select-search';
      this.#search = doc.createElement('input');
      this.#search.type = 'text';
      this.#search.autocomplete = 'off';
      this.#search.spellcheck = false;
      this.#search.setAttribute('role', 'combobox');
      this.#search.setAttribute('aria-autocomplete', 'list');
      this.#search.setAttribute('aria-expanded', 'true');
      searchBox.append(this.#search);
      this.#list = doc.createElement('div');
      this.#list.className = 'ml-select-list';
      this.#list.id = 'ml-select-options-' + ++nextId;
      this.#list.setAttribute('role', 'listbox');
      this.#list.tabIndex = -1;
      this.#search.setAttribute('aria-controls', this.#list.id);
      this.#empty = doc.createElement('div');
      this.#empty.className = 'ml-select-empty';
      this.#empty.setAttribute('role', 'status');
      panel.append(searchBox, this.#list, this.#empty);
      panel.addEventListener('beforetoggle', event => { if (event.newState === 'closed') this.#release(); });
      this.#search.addEventListener('input', event => {
        event.stopPropagation();
        this.#render();
      });
      this.#search.addEventListener('change', event => event.stopPropagation());
      this.#list.addEventListener('pointermove', event => {
        if (event.pointerType === 'touch') return;
        const row = event.target.closest('[role="option"]');
        if (row && row.getAttribute('aria-disabled') !== 'true') this.#activate(row, false);
      });
      this.append(panel);
      this.#panel = panel;
    }

    showPicker() {
      const select = this.select;
      if (this.open || !this.isConnected || !this.#canOpen(select) || !select.getClientRects().length) return;
      if (!this.#panel) this.#makePanel();
      const search = this.hasAttribute('searchable');
      this.#search.parentElement.hidden = !search;
      this.#search.value = '';
      this.#search.placeholder = this.getAttribute('search-label') || '搜索选项';
      this.#search.setAttribute('aria-label', this.#search.placeholder);
      if (select.hasAttribute('aria-labelledby')) this.#list.setAttribute('aria-labelledby', select.getAttribute('aria-labelledby'));
      else this.#list.removeAttribute('aria-labelledby');
      this.#list.setAttribute('aria-label', select.getAttribute('aria-label') || select.labels?.[0]?.textContent.trim() || '选项');
      select.focus({ preventScroll: true });
      this.#native = select;
      this.#aria = ['aria-expanded', 'aria-controls', 'aria-activedescendant'].map(name => [name, select.getAttribute(name)]);
      select.setAttribute('aria-expanded', 'true');
      select.setAttribute('aria-controls', this.#list.id);
      this.toggleAttribute('data-ml-select-open', true);
      this.#prefix = '';
      this.#geometry = '';
      this.#render();
      this.#panel.showPopover();
      this.#position(true);
      if (!this.open) return;
      // Focus the visible options so assistive technology follows the active row.
      // Some platforms always expose the native select as collapsed here.
      (search ? this.#search : this.#list).focus({ preventScroll: true });
      this.#reveal();
      this.#options.observe(select, { childList: true, subtree: true, characterData: true, attributes: true,
        attributeFilter: ['label', 'value', 'selected', 'disabled', 'hidden', 'multiple', 'size'] });
      this.#scene = GlassScene.forDocument(this.ownerDocument);
      this.#scene.painters.add(this.#paintMenu);
      this.#scene.wake();
      this.#frame = this.ownerDocument.defaultView.requestAnimationFrame(this.#track);
    }

    close(restoreFocus = false) {
      const select = this.#native;
      if (!select) return;
      if (this.#panel.matches(':popover-open')) this.#panel.hidePopover();
      this.#release();
      if (restoreFocus && select.isConnected) select.focus({ preventScroll: true });
    }

    #release() {
      if (!this.#native) return;
      for (const [name, original] of this.#aria) {
        if (original === null) this.#native.removeAttribute(name);
        else this.#native.setAttribute(name, original);
      }
      this.#native = null;
      this.removeAttribute('data-ml-select-open');
      this.#options.disconnect();
      this.ownerDocument.defaultView.cancelAnimationFrame(this.#frame);
      this.#scene?.remove(this.#paintMenu);
      this.#scene = null;
      this.#surface?.remove();
      this.#surface = null;
      this.#active = null;
      this.#rows = [];
    }

    #render() {
      const select = this.#native;
      const previous = this.#active && this.#active.option;
      const query = normalize(this.#search.value);
      this.#rows = renderOptions(select, this.#list, (option, group) =>
        !query || normalize(option.label + ' ' + (group?.label ?? '')).includes(query));
      this.#selected = select.selectedIndex;
      this.#empty.hidden = this.#rows.length > 0;
      this.#empty.textContent = this.#rows.length ? '' : query ? (this.getAttribute('empty-label') || '没有匹配的选项') : '暂无选项';
      const enabled = this.#enabled();
      const next = enabled.find(item => item.option === previous) ?? enabled.find(item => item.option.selected) ?? enabled[0];
      this.#activate(next?.row, false);
      if (this.#panel.matches(':popover-open')) { this.#position(true); this.#reveal(); }
    }

    #enabled() { return this.#rows.filter(item => !item.option.matches(':disabled')); }

    #activate(row, scroll = true) {
      this.#active?.row.removeAttribute('data-active');
      this.#active = this.#rows.find(item => item.row === row);
      const focus = this.#search.parentElement.hidden ? this.#list : this.#search;
      if (!this.#active) { focus.removeAttribute('aria-activedescendant'); return; }
      row.setAttribute('data-active', '');
      focus.setAttribute('aria-activedescendant', row.id);
      if (scroll) this.#reveal();
    }

    #reveal() {
      if (this.#active) revealOption(this.#active.row, this.#list);
    }

    #commit(option) {
      const select = this.#native;
      if (!select || !option || select.matches(':disabled') || option.matches(':disabled') || option.closest('select') !== select) return;
      const changed = select.selectedIndex !== option.index;
      select.selectedIndex = option.index;
      this.close(true);
      if (changed) {
        select.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    #pointerDown = event => {
      this.#startedOpen = event.target === this.select && this.open;
    };

    #mouseDown = event => {
      if (event.button !== 0) return;
      if (event.target === this.select && this.#canOpen(event.target)) {
        event.preventDefault();
        event.target.focus({ preventScroll: true });
      } else if (this.open && event.target.closest('[role="option"], .ml-select-heading')) event.preventDefault();
    };

    #click = event => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.target === this.select && this.#canOpen(event.target)) {
        event.preventDefault();
        if (this.open || (event.detail > 0 && this.#startedOpen)) this.close(true);
        else this.showPicker();
        this.#startedOpen = false;
      } else if (this.open && this.#list.contains(event.target)) {
        event.preventDefault();
        const row = event.target.closest('[role="option"]');
        this.#commit(this.#rows.find(item => item.row === row)?.option);
      }
    };

    #focusOut = event => {
      if (this.open && event.relatedTarget && !this.contains(event.relatedTarget)) this.close();
    };

    #keyDown = event => {
      const select = this.select;
      const search = event.target === this.#search;
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229 ||
          (event.target !== select && event.target !== this.#list && !search) || !this.#canOpen(select)) return;
      const key = event.key;
      if (this.open && key === 'Tab') { this.close(event.target !== select); return; }
      if (this.open && (key === 'Escape' || (key === 'ArrowUp' && event.altKey))) {
        event.preventDefault(); event.stopPropagation(); this.close(true); return;
      }
      if (event.ctrlKey || event.metaKey || (event.altKey && key !== 'ArrowDown')) return;
      const arrow = key === 'ArrowDown' || key === 'ArrowUp';
      const edge = !search && (key === 'Home' || key === 'End');
      const confirm = key === 'Enter' || (!search && key === ' ');
      const typed = !search && key.length === 1 && key !== ' ';
      if (!arrow && !edge && !confirm && !typed) return;
      event.preventDefault();
      const wasOpen = this.open;
      if (!wasOpen) this.showPicker();
      if (!this.open) return;
      if (confirm) { if (wasOpen && this.#active) this.#commit(this.#active.option); return; }
      const rows = this.#enabled();
      if (typed && !this.#search.parentElement.hidden) {
        this.#search.value += key;
        this.#render();
      } else if (typed) {
        const now = performance.now();
        this.#prefix = now - this.#lastKey > 650 ? normalize(key) : this.#prefix + normalize(key);
        this.#lastKey = now;
        const repeated = [...this.#prefix].every(ch => ch === this.#prefix[0]);
        const start = rows.indexOf(this.#active) + (repeated ? 1 : 0);
        const sequence = rows.slice(start).concat(rows.slice(0, start));
        const hit = sequence.find(item => normalize(item.option.label).startsWith(repeated ? this.#prefix[0] : this.#prefix));
        if (hit) this.#activate(hit.row);
      } else if (edge) {
        this.#activate((key === 'Home' ? rows[0] : rows.at(-1))?.row);
      } else if (wasOpen && !event.altKey && rows.length) {
        const index = rows.indexOf(this.#active) + (key === 'ArrowDown' ? 1 : -1);
        this.#activate(rows[Math.max(0, Math.min(rows.length - 1, index))].row);
      }
    };

    #position(force = false) {
      this.#geometry = placePopup(this, this.#native, this.#panel, this.#geometry, force);
      if (this.#geometry === null) this.close();
    }

    // Track the anchor only while open, including scrolling, transformed parents,
    // soft keyboard resizing and native value writes that do not emit change.
    #track = () => {
      if (!this.open) return;
      if (this.#native !== this.select || !this.#canOpen(this.#native)) { this.close(); return; }
      if (this.#selected !== this.#native.selectedIndex) { this.#active = null; this.#render(); }
      if (!this.open) return;
      this.#position();
      if (this.open) this.#frame = this.ownerDocument.defaultView.requestAnimationFrame(this.#track);
    };

    #paintMenu = (pointer, now) => {
      if (!this.open) return;
      const style = getComputedStyle(this.#panel);
      const dynamic = style.getPropertyValue('--ml-follow').trim() === '1';
      const tier = GlassSurface.lightingTier(style, dynamic);
      if (!tier) {
        this.#surface?.remove(); this.#surface = null; return;
      }
      this.#surface = GlassSurface.forTier(this.#surface, this.#panel, false, tier);
      this.#surface.paint(dynamic ? pointer : null, null, now);
      if (dynamic && this.#panel.getAnimations().some(a => a.playState === 'running')) this.#scene.wake();
      return dynamic;
    };
  }

  customElements.define('ml-select', MaterialSelect);
})();
