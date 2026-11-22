(() => {
  'use strict';

  if (customElements.get('ml-tag')) return;
  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];

  class MaterialTag extends GlassControl {
    static observedAttributes = ['kind', 'label', 'selected', 'disabled', 'remove-label'];
    #kind;
    #text;
    #action;

    get glassContent() { return this.#action ?? this.#text; }
    get label() { return this.getAttribute('label') ?? ''; }
    set label(text) { this.setAttribute('label', text); }
    get value() { return this.getAttribute('value') ?? this.label; }
    set value(value) { this.setAttribute('value', value); }
    get selected() { return this.hasAttribute('selected'); }
    set selected(value) { this.toggleAttribute('selected', Boolean(value)); }
    get disabled() { return this.hasAttribute('disabled'); }
    set disabled(value) { this.toggleAttribute('disabled', Boolean(value)); }

    connectedCallback() {
      // Apply properties set by a consumer before this custom element was upgraded.
      for (const key of ['label', 'value', 'selected', 'disabled']) {
        if (!Object.hasOwn(this, key)) continue;
        const value = this[key];
        delete this[key];
        this[key] = value;
      }
      this.#render();
      super.connectedCallback();
      this.addEventListener('click', this.#activate);
      this.addEventListener('keydown', this.#deleteKey);
    }

    disconnectedCallback() {
      this.removeEventListener('click', this.#activate);
      this.removeEventListener('keydown', this.#deleteKey);
      super.disconnectedCallback();
    }

    attributeChangedCallback() { if (this.isConnected) this.#render(); }

    #render() {
      const requested = this.getAttribute('kind');
      const kind = requested === 'filter' || requested === 'removable' ? requested : 'status';
      if (kind !== this.#kind) {
        const focused = this.#action && this.ownerDocument.activeElement === this.#action;
        this.#kind = kind;
        this.#text = this.ownerDocument.createElement('span');
        this.#text.className = 'ml-tag-text';
        this.#action = null;
        if (kind === 'status') {
          this.replaceChildren(this.#text);
        } else {
          this.#action = this.ownerDocument.createElement('button');
          this.#action.type = 'button';
          if (kind === 'filter') {
            this.#action.append(this.#text);
            this.replaceChildren(this.#action);
          } else {
            this.replaceChildren(this.#text, this.#action);
          }
          this.#action.disabled = this.disabled;
          if (focused) this.#action.focus({ preventScroll: true });
        }
      }
      if (this.#text.textContent !== this.label) this.#text.textContent = this.label;
      if (!this.#action) return;
      this.#action.disabled = this.disabled;
      if (kind === 'filter') this.#action.setAttribute('aria-pressed', String(this.selected));
      else this.#action.setAttribute('aria-label', this.getAttribute('remove-label') || '移除' + this.label);
    }

    #deleteKey = event => {
      if (this.#kind !== 'removable' || event.target !== this.#action || event.defaultPrevented ||
          event.ctrlKey || event.metaKey || event.altKey || !['Delete', 'Backspace'].includes(event.key)) return;
      event.preventDefault();
      if (!event.repeat) this.#action.click();
    };

    #activate = event => {
      if (!this.#action?.contains(event.target) || this.#action.matches(':disabled') || event.defaultPrevented) return;
      if (this.#kind === 'filter') {
        this.selected = !this.selected;
        this.dispatchEvent(new CustomEvent('ml-change', {
          bubbles: true, composed: true, detail: { kind: 'filter', value: this.value, selected: this.selected },
        }));
        return;
      }

      const allowed = this.dispatchEvent(new CustomEvent('ml-remove', {
        bubbles: true, composed: true, cancelable: true, detail: { kind: 'removable', value: this.value, label: this.label },
      }));
      if (!allowed || !this.parentElement) return;
      const group = this.parentElement;
      if (this.contains(this.ownerDocument.activeElement) && group.matches('.ml-tag-group')) {
        const buttons = [...group.querySelectorAll(':scope > ml-tag > button:enabled')]
          .filter(button => button.getClientRects().length && !button.closest('[inert]'));
        const i = buttons.indexOf(this.#action);
        const next = buttons[i + 1] ?? buttons[i - 1] ?? group;
        next.focus({ preventScroll: true });
      }
      this.remove();
    };
  }

  customElements.define('ml-tag', MaterialTag);
})();
