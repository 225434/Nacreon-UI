(() => {
  'use strict';

  if (customElements.get('ml-input')) return;
  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  const fieldSelector = ':scope > input:not([type="hidden"]), :scope > textarea';
  let nextId = 0;

  class InputSurface extends GlassControl {
    get glassContent() { return this.parentElement?.querySelector(fieldSelector); }
  }
  customElements.define('ml-input-surface', InputSurface);

  function ensureId(node) {
    const tree = node.getRootNode();
    if (!node.id || tree.querySelectorAll('#' + CSS.escape(node.id)).length > 1) {
      let id;
      do { id = 'ml-input-' + ++nextId; } while (tree.getElementById(id));
      node.id = id;
    }
    return node.id;
  }

  // Keep descriptions supplied by the application when adding or removing a hint or error.
  function describe(field, ids) {
    const managed = (field.dataset.mlInputDescriptions || '').split(' ');
    const keep = (field.getAttribute('aria-describedby') || '').split(/\s+/).filter(id => id && !managed.includes(id));
    const add = ids.filter(id => id && !keep.includes(id));
    const next = keep.concat(add).join(' ');
    if (next && next !== field.getAttribute('aria-describedby')) field.setAttribute('aria-describedby', next);
    else if (!next) field.removeAttribute('aria-describedby');
    if (add.length) field.dataset.mlInputDescriptions = add.join(' ');
    else delete field.dataset.mlInputDescriptions;
  }

  function markInvalid(field, invalid) {
    if (invalid && !field.hasAttribute('data-ml-input-prior-invalid')) {
      field.dataset.mlInputPriorInvalid = field.getAttribute('aria-invalid') ?? '';
      field.setAttribute('aria-invalid', 'true');
    } else if (!invalid && field.hasAttribute('data-ml-input-prior-invalid')) {
      if (field.getAttribute('aria-invalid') === 'true') {
        if (field.dataset.mlInputPriorInvalid) field.setAttribute('aria-invalid', field.dataset.mlInputPriorInvalid);
        else field.removeAttribute('aria-invalid');
      }
      delete field.dataset.mlInputPriorInvalid;
    }
  }

  function maskPassword(field) {
    if (!field?.hasAttribute('data-ml-input-visible')) return;
    if (field.type === 'text') field.type = 'password';
    field.removeAttribute('data-ml-input-visible');
  }

  class MaterialInput extends HTMLElement {
    static observedAttributes = ['clearable', 'count', 'error-message', 'hidden'];
    #field;
    #surface;
    #action;
    #counter;
    #error;
    #hint;
    #events;
    #edited = false;
    #checked = false;
    #composing = false;
    #children = new MutationObserver(() => this.#bind());
    #attributes = new MutationObserver(records => {
      if (records.some(r => r.attributeName === 'id')) this.#bind();
      else this.refresh();
    });

    get control() { return this.querySelector(fieldSelector); }
    get value() { return this.control?.value ?? ''; }
    set value(value) {
      if (this.control) this.control.value = value ?? '';
      this.refresh();
    }

    connectedCallback() {
      this.#events = new AbortController();
      const options = { signal: this.#events.signal };
      this.addEventListener('input', this.#edit, options);
      this.addEventListener('change', this.#edit, options);
      this.addEventListener('compositionstart', this.#composition, options);
      this.addEventListener('compositionend', this.#composition, options);
      this.addEventListener('focusin', this.#focusIn, options);
      this.addEventListener('focusout', this.#focusOut, options);
      this.addEventListener('invalid', this.#invalid, { ...options, capture: true });
      this.addEventListener('mousedown', this.#mouseDown, options);
      this.addEventListener('click', this.#click, options);
      this.addEventListener('keydown', this.#key, options);
      this.getRootNode().addEventListener('reset', this.#reset, { ...options, capture: true });
      this.#children.observe(this, { childList: true });
      this.#bind();
    }

    disconnectedCallback() {
      this.#events.abort();
      this.#children.disconnect();
      this.#attributes.disconnect();
      this.#composing = false;
      maskPassword(this.#field);
    }

    attributeChangedCallback() { if (this.isConnected) this.refresh(); }

    #part(name, tag) {
      let node = this.querySelector(':scope > [data-ml-input-part="' + name + '"]');
      if (!node) {
        node = this.ownerDocument.createElement(tag);
        node.dataset.mlInputPart = name;
        this.append(node);
      }
      return node;
    }

    #bind() {
      this.#attributes.disconnect();
      const field = this.control;
      if (this.#field !== field) {
        if (this.#field) {
          maskPassword(this.#field);
          describe(this.#field, []);
          markInvalid(this.#field, false);
        }
        this.#edited = this.#checked = this.#composing = false;
        this.#field = field;
        maskPassword(field); // A clone always starts masked.
      }
      this.#surface = this.#part('surface', 'ml-input-surface');
      this.#surface.setAttribute('aria-hidden', 'true');
      this.#action = this.#part('action', 'button');
      this.#action.type = 'button';
      this.#counter = this.#part('counter', 'span');
      this.#error = this.#part('error', 'span');
      this.#error.setAttribute('aria-live', 'polite');
      this.#hint = this.querySelector(':scope > .ml-input-hint');
      if (!field) {
        for (const part of [this.#surface, this.#action, this.#counter, this.#error]) part.hidden = true;
        return;
      }
      this.#surface.hidden = false;
      const label = this.querySelector(':scope > label');
      if (!field.id && label?.htmlFor && !this.getRootNode().getElementById(label.htmlFor)) field.id = label.htmlFor;
      ensureId(field);
      if (label) label.htmlFor = field.id;
      if (this.#hint) ensureId(this.#hint);
      ensureId(this.#error);
      this.#action.setAttribute('aria-controls', field.id);
      this.#attributes.observe(field, { attributes: true, childList: true, characterData: true, subtree: true,
        attributeFilter: ['id', 'type', 'value', 'disabled', 'readonly', 'required', 'minlength', 'maxlength', 'pattern', 'min', 'max', 'step', 'aria-describedby', 'data-ml-form-managed'] });
      for (let fs = this.closest('fieldset'); fs; fs = fs.parentElement?.closest('fieldset')) {
        this.#attributes.observe(fs, { attributes: true, attributeFilter: ['disabled'] });
      }
      this.refresh();
    }

    refresh() {
      const field = this.#field;
      if (!field || !this.#action) return;
      const disabled = field.matches(':disabled');
      if (disabled || this.hidden || field.type !== 'text') maskPassword(field);
      const revealed = field.hasAttribute('data-ml-input-visible');
      const password = revealed || field.type === 'password';
      const search = field.type === 'search';
      const clearable = !password && (search || this.hasAttribute('clearable'));
      this.dataset.mlInputKind = password ? 'password' : field.type;
      this.toggleAttribute('data-ml-input-trailing', password || clearable);
      this.#action.hidden = disabled || (!password && (!clearable || field.readOnly || !field.value));
      this.#action.disabled = disabled;
      this.#action.dataset.icon = password ? (revealed ? 'eye-off' : 'eye') : 'close';
      const label = password ? '显示密码' : search ? '清空搜索' : '清空内容';
      this.#action.setAttribute('aria-label', label);
      this.#action.title = revealed ? '隐藏密码' : label;
      if (password) this.#action.setAttribute('aria-pressed', String(revealed));
      else this.#action.removeAttribute('aria-pressed');
      this.#counter.hidden = password || !this.hasAttribute('count');
      if (!this.#counter.hidden) this.#counter.textContent = field.value.length + (field.maxLength >= 0 ? ' / ' + field.maxLength : '');
      if (this.#composing) return;
      const invalid = !field.hasAttribute('data-ml-form-managed') && this.#checked && field.willValidate && !field.validity.valid;
      const message = invalid ? (field.validity.customError ? field.validationMessage : this.getAttribute('error-message') || field.validationMessage) : '';
      markInvalid(field, invalid);
      if (this.#error.textContent !== message) this.#error.textContent = message;
      this.#error.hidden = !message;
      describe(field, [this.#hint?.id, message && this.#error.id]);
    }

    validate() {
      if (!this.#field) return true;
      this.#checked = true;
      const valid = this.#field.checkValidity();
      this.refresh();
      return valid;
    }

    clear() {
      const field = this.#field;
      if (!field || !field.value || field.readOnly || field.matches(':disabled') || this.#composing) return false;
      field.value = '';
      field.focus({ preventScroll: true });
      field.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      return true;
    }

    #edit = event => {
      if (event.target !== this.#field) return;
      this.#edited = true;
      this.refresh();
    };
    #composition = event => {
      if (event.target !== this.#field) return;
      this.#composing = event.type === 'compositionstart';
      if (!this.#composing) this.refresh();
    };
    #focusIn = event => { if (event.target === this.#field) this.refresh(); };
    #focusOut = event => {
      if (this.contains(event.relatedTarget) || !this.#field || this.#composing) return;
      if (this.#edited || this.#field.value) this.#checked = true;
      this.refresh();
    };
    #invalid = event => {
      if (event.target !== this.#field || event.target.hasAttribute('data-ml-form-managed')) return;
      this.#checked = true;
      this.refresh();
    };
    #reset = event => {
      const field = this.#field;
      if (!field || event.target !== field.form) return;
      // Native values are restored by the reset event's default action.
      setTimeout(() => {
        if (event.defaultPrevented || !this.isConnected || this.#field !== field) return;
        this.#checked = this.#edited = this.#composing = false;
        maskPassword(field);
        this.refresh();
      }, 0);
    };
    #mouseDown = event => {
      if (event.target === this.#action && event.button === 0 && this.getRootNode().activeElement === this.#field) event.preventDefault();
    };
    #click = event => {
      if (event.target !== this.#action || event.defaultPrevented || this.#action.hidden) return;
      const field = this.#field;
      if (!field || field.matches(':disabled')) return;
      if (this.dataset.mlInputKind !== 'password') { this.clear(); return; }
      const start = field.selectionStart, end = field.selectionEnd, direction = field.selectionDirection, scroll = field.scrollLeft;
      const reveal = field.type === 'password';
      field.type = reveal ? 'text' : 'password';
      field.toggleAttribute('data-ml-input-visible', reveal);
      if (start !== null) field.setSelectionRange(start, end, direction);
      field.scrollLeft = scroll;
      this.refresh();
    };
    #key = event => {
      if (event.target === this.#field && event.key === 'Escape' && this.#field.type === 'search' &&
          !event.defaultPrevented && !event.isComposing && event.keyCode !== 229 && this.clear()) event.preventDefault();
    };
  }
  customElements.define('ml-input', MaterialInput);
})();
