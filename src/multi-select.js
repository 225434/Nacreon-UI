(() => {
  'use strict';
  if (customElements.get('ml-multi-select')) return;

  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  const { normalize, renderOptions, revealOption, placePopup } = globalThis[Symbol.for('material-lib.select-picker.v1')];
  let nextId = 0;

  class MultiPicker extends GlassControl {
    get glassContent() { return this.matches(':popover-open') ? this : null; }
  }
  customElements.define('ml-multi-picker', MultiPicker);

  class MultiSelect extends GlassControl {
    #native;
    #field;
    #trigger;
    #chips;
    #chipOptions = new WeakMap();
    #description;
    #error;
    #panel;
    #search;
    #list;
    #empty;
    #count;
    #clear;
    #rows = [];
    #active;
    #shown = false;
    #wasOpen = false;
    #geometry;
    #frame = 0;
    #invalid = false;
    #events;
    #changes = new MutationObserver(records => {
      if (records.some(record => record.target === this || this.#native?.contains(record.target))) this.refresh();
    });

    get select() { return this.querySelector(':scope > select[multiple]'); }
    get glassContent() { return this.#trigger; }
    get open() { return this.#shown; }
    focus(options) { (this.#trigger ?? this.select)?.focus(options); }
    get values() { return Array.from(this.select?.selectedOptions ?? [], option => option.value); }
    set values(values) {
      const keys = new Set(typeof values === 'string' ? [values] : Array.from(values ?? [], String));
      for (const option of this.select?.options ?? []) option.selected = keys.has(option.value);
      this.refresh();
    }

    connectedCallback() {
      for (const child of this.querySelectorAll(':scope > :is(.ml-multi-field, .ml-multi-error, ml-multi-picker)')) child.remove();
      this.removeAttribute('data-ml-multi-ready');
      this.removeAttribute('data-ml-multi-open');
      this.removeAttribute('data-ml-multi-invalid');
      super.connectedCallback();
      this.#events = new AbortController();
      const signal = this.#events.signal;
      this.addEventListener('click', this.#click, { signal });
      this.addEventListener('pointerdown', event => {
        this.#wasOpen = event.target === this.#trigger && this.open;
      }, { signal });
      this.addEventListener('mousedown', event => {
        if (event.button === 0 && this.#list?.contains(event.target)) event.preventDefault();
      }, { signal });
      this.addEventListener('keydown', this.#keys, { signal });
      this.addEventListener('input', this.#nativeChange, { capture: true, signal });
      this.addEventListener('change', this.#nativeChange, { signal });
      this.addEventListener('invalid', this.#validate, { capture: true, signal });
      this.addEventListener('focusout', this.#focusOut, { signal });
      const root = this.getRootNode();
      root.addEventListener('click', this.#labelClick, { signal });
      root.addEventListener('reset', this.#reset, { capture: true, signal });
      this.refresh();
      this.#changes.observe(this, { childList: true, subtree: true, characterData: true, attributes: true,
        attributeFilter: ['multiple', 'disabled', 'required', 'hidden', 'aria-label', 'aria-labelledby', 'aria-describedby', 'aria-invalid', 'data-ml-form-managed',
          'label', 'selected', 'value', 'data-keywords', 'placeholder', 'search-label', 'max-tags'] });
    }

    disconnectedCallback() {
      this.#events.abort();
      this.#changes.disconnect();
      this.close();
      this.#unmount();
      super.disconnectedCallback();
    }

    #mount() {
      const doc = this.ownerDocument, tree = this.getRootNode();
      let id;
      do { id = 'ml-multi-' + ++nextId; } while (['panel', 'options', 'summary', 'error'].some(part => tree.getElementById(id + '-' + part)));
      this.#field = doc.createElement('div');
      this.#field.className = 'ml-multi-field';
      this.#field.innerHTML = `<button type="button" class="ml-multi-trigger" aria-haspopup="dialog" aria-expanded="false">
        <span class="ml-multi-arrow" aria-hidden="true"></span></button>
        <div class="ml-multi-chips"></div><span class="ml-multi-sr"></span>`;
      this.#trigger = this.#field.querySelector('button');
      this.#trigger.setAttribute('aria-controls', id + '-panel');
      this.#chips = this.#field.querySelector('.ml-multi-chips');
      this.#description = this.#field.querySelector('.ml-multi-sr');
      this.#description.id = id + '-summary';
      this.#error = doc.createElement('p');
      this.#error.id = id + '-error';
      this.#error.className = 'ml-multi-error';
      this.#error.setAttribute('role', 'alert');
      this.#error.hidden = true;
      this.#panel = doc.createElement('ml-multi-picker');
      this.#panel.id = id + '-panel';
      this.#panel.popover = 'auto';
      this.#panel.setAttribute('role', 'dialog');
      this.#panel.innerHTML = `<div class="ml-select-search"><input type="search" autocomplete="off" spellcheck="false"></div>
        <div class="ml-select-list" role="listbox" aria-label="可选项" aria-multiselectable="true" tabindex="0"></div>
        <p class="ml-select-empty" role="status" hidden></p>
        <div class="ml-multi-actions"><span class="ml-multi-count" role="status"></span>
          <button type="button" data-ml-clear>清空</button><button type="button" data-ml-done>完成</button></div>`;
      this.#search = this.#panel.querySelector('input');
      this.#list = this.#panel.querySelector('[role="listbox"]');
      this.#list.id = id + '-options';
      this.#search.setAttribute('aria-controls', this.#list.id);
      this.#empty = this.#panel.querySelector('.ml-select-empty');
      this.#count = this.#panel.querySelector('.ml-multi-count');
      this.#clear = this.#panel.querySelector('[data-ml-clear]');
      this.#panel.addEventListener('beforetoggle', event => { if (event.newState === 'closed') this.#release(); });
      this.#search.addEventListener('input', event => {
        event.stopPropagation();
        this.#active = null;
        this.#renderOptions();
      });
      this.#search.addEventListener('change', event => event.stopPropagation());
      this.append(this.#field, this.#error, this.#panel);
      this.toggleAttribute('data-ml-multi-ready', true);
    }

    #unmount() {
      this.#field?.remove();
      this.#error?.remove();
      this.#panel?.remove();
      this.#native = this.#trigger = this.#field = this.#error = this.#panel = null;
      this.#chips = this.#description = this.#search = this.#list = this.#empty = this.#count = this.#clear = null;
      this.#rows = [];
      this.#active = null;
      this.#invalid = false;
      this.removeAttribute('data-ml-multi-ready');
      this.removeAttribute('data-ml-multi-invalid');
    }

    refresh() {
      if (!this.isConnected || typeof this.showPopover !== 'function') return;
      const native = this.select;
      if (this.#native !== native) {
        this.close();
        this.#unmount();
        if (!native) return;
        this.#native = native;
        this.#mount();
      }
      if (!native) return;
      const namedBy = native.getAttribute('aria-labelledby');
      const name = native.getAttribute('aria-label') || native.labels?.[0]?.textContent.trim() || '选择多项';
      for (const control of [this.#trigger, this.#panel]) {
        if (namedBy) control.setAttribute('aria-labelledby', namedBy);
        else control.removeAttribute('aria-labelledby');
        control.setAttribute('aria-label', name);
      }
      this.#trigger.disabled = native.disabled;
      const searchHint = this.getAttribute('search-label') || '搜索名称、分组或关键词';
      this.#search.placeholder = searchHint;
      this.#search.setAttribute('aria-label', searchHint);
      this.#syncSelection();
      if (this.open) {
        if (this.#enabled()) this.#renderOptions();
        else this.close();
      }
    }

    #syncSelection() {
      const native = this.#native;
      const selected = [...native.selectedOptions];
      const root = this.getRootNode(), doc = this.ownerDocument;
      const controls = [...this.#chips.querySelectorAll('button')];
      const focused = controls.indexOf(root.activeElement);
      const maxTags = Number.parseInt(this.getAttribute('max-tags'), 10);
      const limit = maxTags >= 0 ? maxTags : 3;
      const summary = selected.length ? '已选 ' + selected.length + ' 项' : this.getAttribute('placeholder') || '请选择';
      const display = doc.createDocumentFragment();
      for (const option of selected.slice(0, limit)) {
        const chip = doc.createElement('span');
        chip.className = 'ml-multi-chip';
        chip.title = option.label;
        const label = doc.createElement('span');
        label.textContent = option.label;
        const remove = doc.createElement('button');
        remove.type = 'button';
        this.#chipOptions.set(remove, option);
        remove.setAttribute('aria-label', '移除' + option.label);
        remove.disabled = native.disabled || option.matches(':disabled');
        chip.append(label, remove);
        display.append(chip);
      }
      if (!selected.length || selected.length > limit) {
        const more = doc.createElement('span');
        more.className = selected.length ? 'ml-multi-more' : 'ml-multi-placeholder';
        more.textContent = limit > 0 && selected.length ? '+' + (selected.length - limit) : summary;
        more.setAttribute('aria-hidden', 'true');
        display.append(more);
      }
      this.#chips.replaceChildren(display);
      if (focused >= 0) {
        const next = [...this.#chips.querySelectorAll('button:not(:disabled)')];
        (next[Math.min(focused, next.length - 1)] ?? this.#trigger).focus({ preventScroll: true });
      }
      this.#description.textContent = (native.required ? '本项必选。' : '') + summary;
      const count = '已选 ' + selected.length + ' 项';
      if (this.#count.textContent !== count) this.#count.textContent = count;
      this.#clear.disabled = !selected.some(option => !option.matches(':disabled'));
      for (const { option, row } of this.#rows) row.setAttribute('aria-selected', String(option.selected));
      const invalid = !native.hasAttribute('data-ml-form-managed') && this.#invalid && !native.validity.valid;
      this.#invalid = invalid;
      const marked = invalid || native.getAttribute('aria-invalid') === 'true';
      this.toggleAttribute('data-ml-multi-invalid', marked);
      if (marked) this.#trigger.setAttribute('aria-invalid', 'true');
      else this.#trigger.removeAttribute('aria-invalid');
      this.#error.hidden = !invalid;
      const error = invalid ? (native.validity.customError ? native.validationMessage : '请至少选择一项。') : '';
      if (this.#error.textContent !== error) this.#error.textContent = error;
      this.#trigger.setAttribute('aria-describedby', [native.getAttribute('aria-describedby'), this.#description.id,
        invalid && this.#error.id].filter(Boolean).join(' '));
    }

    #enabled() {
      return this.#native && this.#native === this.select && !this.#native.matches(':disabled') && !this.closest('[inert]');
    }

    showPicker() {
      if (this.open || !this.#enabled() || !this.#field.getClientRects().length) return;
      this.refresh();
      this.#search.value = '';
      this.#active = null;
      this.#geometry = '';
      this.#renderOptions();
      this.#panel.showPopover();
      if (!this.#panel.matches(':popover-open')) return;
      this.#shown = true;
      this.#trigger.setAttribute('aria-expanded', 'true');
      this.toggleAttribute('data-ml-multi-open', true);
      this.#position(true);
      if (!this.open) return;
      this.#search.focus({ preventScroll: true });
      if (this.#active) revealOption(this.#active.row, this.#list);
      this.#frame = this.ownerDocument.defaultView.requestAnimationFrame(this.#track);
    }

    close(restoreFocus = false) {
      if (!this.open) return;
      if (this.#panel.matches(':popover-open')) this.#panel.hidePopover();
      this.#release();
      if (restoreFocus) this.#trigger?.focus({ preventScroll: true });
    }

    #release() {
      if (!this.open) return;
      this.#shown = false;
      this.removeAttribute('data-ml-multi-open');
      this.#trigger.setAttribute('aria-expanded', 'false');
      this.ownerDocument.defaultView.cancelAnimationFrame(this.#frame);
    }

    #position(force = false) {
      this.#geometry = placePopup(this, this.#field, this.#panel, this.#geometry, force);
      if (this.#geometry === null) this.close();
    }
    #track = () => {
      if (!this.open) return;
      if (!this.#enabled()) { this.close(); return; }
      this.#position();
      if (this.open) this.#frame = this.ownerDocument.defaultView.requestAnimationFrame(this.#track);
    };

    #choices() { return this.#rows.filter(({ option }) => !option.matches(':disabled')); }

    #renderOptions() {
      const query = normalize(this.#search.value).split(/\s+/).filter(Boolean);
      const previous = this.#active?.option;
      this.#rows = renderOptions(this.#native, this.#list, (option, group) => {
        const terms = normalize([option.label, option.value, group?.label, option.dataset.keywords].filter(Boolean).join(' '));
        return query.every(word => terms.includes(word));
      });
      this.#list.hidden = this.#rows.length === 0;
      this.#empty.hidden = !this.#list.hidden;
      const message = this.#list.hidden ? query.length ? '没有匹配的选项' : '暂无选项' : '';
      if (message !== this.#empty.textContent) this.#empty.textContent = message;
      const choices = this.#choices();
      this.#activate(choices.find(item => item.option === previous) ?? choices[0], false);
      if (this.open) {
        this.#position(true);
        if (this.#active) revealOption(this.#active.row, this.#list);
      }
    }

    #activate(item, scroll = true) {
      this.#active?.row.removeAttribute('data-active');
      this.#active = item;
      if (!item) { this.#list.removeAttribute('aria-activedescendant'); return; }
      item.row.setAttribute('data-active', '');
      this.#list.setAttribute('aria-activedescendant', item.row.id);
      if (scroll) revealOption(item.row, this.#list);
    }

    #toggle(option) {
      if (!this.#enabled() || !option || option.matches(':disabled') || option.closest('select') !== this.#native) return;
      option.selected = !option.selected;
      this.#notify();
    }
    #notify() {
      const native = this.#native;
      native.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      native.dispatchEvent(new Event('change', { bubbles: true }));
      if (this.open) this.#position(true);
    }

    #nativeChange = event => { if (event.target === this.#native) this.#syncSelection(); };
    #validate = event => {
      if (event.target !== this.#native || event.target.hasAttribute('data-ml-form-managed')) return;
      event.preventDefault();
      this.#invalid = true;
      this.#syncSelection();
      if (!this.open) this.#trigger.focus();
    };
    #reset = event => {
      if (event.target !== this.#native?.form) return;
      queueMicrotask(() => {
        if (event.defaultPrevented) return;
        this.close(this.open);
        this.#invalid = false;
        this.refresh();
      });
    };
    #labelClick = event => {
      if (event.defaultPrevented || event.button !== 0 || !this.#enabled() || this.contains(event.target)) return;
      if (event.target.closest?.('label')?.control !== this.#native) return;
      event.preventDefault();
      this.#trigger.focus({ preventScroll: true });
      this.showPicker();
    };
    #focusOut = event => {
      if (this.open && event.relatedTarget && this.#panel.contains(event.target) && !this.#panel.contains(event.relatedTarget)) this.close();
    };
    #click = event => {
      if (event.defaultPrevented || event.button !== 0 || !this.#enabled()) return;
      const target = event.target;
      if (target === this.#trigger) {
        if (this.open || (event.detail > 0 && this.#wasOpen)) this.close(true);
        else this.showPicker();
        this.#wasOpen = false;
      } else if (this.#chipOptions.has(target)) {
        this.#toggle(this.#chipOptions.get(target));
      } else if (this.open && target.hasAttribute('data-ml-done')) {
        this.close(true);
      } else if (this.open && target === this.#clear && !target.disabled) {
        for (const option of [...this.#native.selectedOptions]) if (!option.matches(':disabled')) option.selected = false;
        this.#search.focus({ preventScroll: true });
        this.#notify();
      } else if (this.open && this.#list.contains(target)) {
        const row = target.closest('[role="option"]');
        const item = this.#choices().find(entry => entry.row === row);
        if (item) { this.#activate(item); this.#toggle(item.option); }
      }
    };

    #keys = event => {
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || !this.#enabled()) return;
      const target = event.target, key = event.key;
      if (this.open && key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); this.close(true); return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const arrow = key === 'ArrowDown' || key === 'ArrowUp';
      if (target === this.#trigger && arrow) {
        event.preventDefault(); this.showPicker(); return;
      }
      if (!this.open || (target !== this.#search && target !== this.#list)) return;
      const options = this.#choices();
      if (key === 'Enter' || (key === ' ' && target === this.#list)) {
        event.preventDefault();
        this.#toggle(this.#active?.option);
      } else if (arrow && target === this.#search) {
        if (!options.length) return;
        event.preventDefault();
        this.#list.focus({ preventScroll: true });
        this.#activate(key === 'ArrowUp' ? options.at(-1) : this.#active ?? options[0]);
      } else if (target === this.#list && (arrow || key === 'Home' || key === 'End')) {
        event.preventDefault();
        const index = options.indexOf(this.#active) + (key === 'ArrowDown' ? 1 : -1);
        this.#activate(key === 'Home' ? options[0] : key === 'End' ? options.at(-1) : options[Math.max(0, Math.min(options.length - 1, index))]);
      }
    };
  }

  customElements.define('ml-multi-select', MultiSelect);
})();
