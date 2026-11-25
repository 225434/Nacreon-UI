(() => {
  'use strict';
  const key = Symbol.for('material-lib.picker-field.v1');
  if (globalThis[key]) return;
  const { ValueField, part, ensureId, signal } = globalThis[Symbol.for('material-lib.value-controls.v1')];
  const { GlassScene } = globalThis[Symbol.for('material-lib.glass.v1')];

  function outside(event, panel) {
    if (event.target !== panel) return false;
    const box = panel.getBoundingClientRect();
    return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
  }

  // The light-DOM field owns form value and validity. A dialog only proposes a value.
  class PickerField extends ValueField {
    #panel;
    #trigger;

    get field() {
      const selector = 'input[type="' + this.inputType + '"]';
      return this.querySelector(':scope > ' + selector + ', :scope > label ' + selector);
    }
    get value() { return this.field?.value ?? ''; }
    set value(value) {
      const field = this.field;
      if (field) { field.value = value ?? ''; this.refresh(); }
    }
    get open() { return this.#panel?.open ?? false; }
    connectedCallback() {
      if (!this.#panel) this.querySelector(':scope > dialog[data-ml-part="picker"]')?.remove();
      super.connectedCallback();
      this.addEventListener('click', this.#activate);
    }
    disconnectedCallback() {
      this.removeEventListener('click', this.#activate);
      this.closePicker(false);
      super.disconnectedCallback();
    }

    refresh() {
      const field = this.field;
      this.toggleAttribute('data-ml-ready', Boolean(field));
      if (!field) { this.closePicker(false); return; }
      part(this, 'surface', 'ml-value-surface');
      const trigger = this.#trigger = part(this, 'open', 'button');
      trigger.setAttribute('aria-label', '打开' + this.pickerLabel + '选择器');
      trigger.setAttribute('aria-haspopup', 'dialog');
      trigger.setAttribute('aria-expanded', String(this.open));
      if (this.#panel) trigger.setAttribute('aria-controls', this.#panel.id);
      else trigger.removeAttribute('aria-controls');
      trigger.disabled = field.matches(':disabled, [readonly]') || !this.readLimits(field);
      if (!this.open) return;
      if (trigger.disabled) this.closePicker(false);
      else this.updatePicker(this.#panel);
    }

    #activate = event => {
      if (!event.defaultPrevented && event.target.closest('button') === this.#trigger) this.openPicker();
    };

    #mount() {
      const panel = this.#panel = part(this, 'picker', 'dialog');
      panel.classList.add('ml-picker-panel');
      panel.setAttribute('aria-label', '选择' + this.pickerLabel);
      this.#trigger.setAttribute('aria-controls', ensureId(panel));
      this.buildPicker(panel);
      part(panel, 'sheet', 'ml-value-surface');
      let pressedOutside = false;
      panel.addEventListener('pointerdown', event => { pressedOutside = outside(event, panel); });
      panel.addEventListener('click', event => {
        if ((pressedOutside && outside(event, panel)) || event.target.closest('[data-ml-picker-cancel]')) this.closePicker();
        pressedOutside = false;
      });
      panel.addEventListener('close', () => {
        if (!panel.open) this.#trigger?.setAttribute('aria-expanded', 'false');
      });
    }

    openPicker() {
      if (!this.isConnected || !this.getClientRects().length || this.closest('[inert]') || this.open) return;
      this.refresh();
      if (!this.field || this.#trigger.disabled) return;
      if (!this.#panel) this.#mount();
      this.updatePicker(this.#panel, true);
      this.#trigger.focus({ preventScroll: true });
      this.#panel.showModal();
      this.#trigger.setAttribute('aria-expanded', 'true');
      this.focusPicker(this.#panel);
      const entrance = this.#panel.getAnimations().find(animation => animation.animationName === 'ml-picker-in');
      if (entrance && getComputedStyle(this).getPropertyValue('--ml-light-source').trim() === 'pointer') {
        GlassScene.forDocument(this.ownerDocument).wake(entrance.effect.getComputedTiming().endTime);
      }
    }
    closePicker(restoreFocus = true) {
      if (!this.open) return;
      this.#panel.close();
      this.#trigger.setAttribute('aria-expanded', 'false');
      if (restoreFocus && !this.#trigger.matches(':disabled')) this.#trigger.focus({ preventScroll: true });
    }

    choose(value) {
      const field = this.field;
      if (!this.open || !field || field.matches(':disabled, [readonly]')) return;
      // Check the proposed value with the same native constraints before writing it.
      const probe = field.cloneNode(false);
      probe.value = value;
      if (probe.value !== value || !probe.validity.valid) return;
      const changed = field.value !== value;
      field.value = value;
      this.closePicker();
      if (changed) signal(field);
    }
  }
  globalThis[key] = { PickerField };
})();
