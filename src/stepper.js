(() => {
  'use strict';
  if (customElements.get('ml-stepper')) return;
  const { ValueField, part, ensureId, describeUnit, signal } = globalThis[Symbol.for('material-lib.value-controls.v1')];

  // Let the browser resolve decimal precision, off-grid values and the native step base.
  function nextValue(input, direction) {
    const probe = input.cloneNode(false);
    probe.value = input.value;
    if (input.step === 'any') {
      const min = input.min === '' ? -Infinity : Number(input.min);
      const max = input.max === '' ? Infinity : Number(input.max);
      if (min > max) return input.value;
      const base = Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : 0;
      const next = Math.max(Number.isFinite(min) ? min : -Infinity, Math.min(Number.isFinite(max) ? max : Infinity, base + direction));
      if (input.value !== '' && (next - base) * direction <= 0) return input.value;
      probe.valueAsNumber = Number(next.toPrecision(15));
    } else if (direction > 0) probe.stepUp();
    else probe.stepDown();
    return probe.value;
  }
  class Stepper extends ValueField {
    get control() { return this.querySelector(':scope > input[type="number"]'); }
    get value() { return this.control?.valueAsNumber; }
    set value(number) {
      if (this.control) { this.control.value = number == null ? '' : String(number); this.refresh(); }
    }
    connectedCallback() { super.connectedCallback(); this.addEventListener('click', this.#click); }
    disconnectedCallback() { this.removeEventListener('click', this.#click); super.disconnectedCallback(); }
    #click = event => {
      const button = event.target.closest('button[data-ml-part]');
      const input = this.control;
      if (button?.parentElement !== this || !input || input.matches(':disabled, [readonly]') || button.disabled) return;
      const value = nextValue(input, button.dataset.mlPart === 'plus' ? 1 : -1);
      if (value !== input.value) {
        const focused = button.matches(':focus');
        input.value = value;
        signal(input);
        if (focused && button.disabled) input.focus({ preventScroll: true });
      }
    };
    refresh() {
      const input = this.control;
      this.toggleAttribute('data-ml-ready', !!input);
      if (!input) return;
      part(this, 'surface', 'ml-value-surface');
      const unit = part(this, 'reading');
      unit.textContent = this.getAttribute('unit') || '';
      unit.hidden = !unit.textContent;
      describeUnit(this, input, unit.textContent);
      const label = input.getAttribute('aria-label') || input.labels?.[0]?.textContent.trim() || '数值';
      for (const [direction, name, verb] of [[-1, 'minus', '减少'], [1, 'plus', '增加']]) {
        const button = part(this, name, 'button');
        button.setAttribute('aria-label', verb + label);
        button.setAttribute('aria-controls', ensureId(input));
        button.disabled = input.matches(':disabled, [readonly]') || nextValue(input, direction) === input.value;
      }
    }
  }
  customElements.define('ml-stepper', Stepper);
})();
