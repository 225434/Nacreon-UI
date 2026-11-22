(() => {
  'use strict';
  if (customElements.get('ml-slider')) return;
  const { ValueField, part, describeUnit } = globalThis[Symbol.for('material-lib.value-controls.v1')];
  const { GlassScene } = globalThis[Symbol.for('material-lib.glass.v1')];
  function limit(attribute, fallback) {
    return attribute.trim() && Number.isFinite(Number(attribute)) ? Number(attribute) : fallback;
  }
  class Slider extends ValueField {
    static observedAttributes = ['unit', 'ticks'];
    get control() { return this.querySelector(':scope > input[type="range"]'); }
    get value() { return this.control?.valueAsNumber; }
    set value(number) {
      if (this.control) { this.control.value = String(number); this.refresh(); }
    }
    refresh() {
      const input = this.control;
      this.toggleAttribute('data-ml-ready', !!input);
      if (!input) return;
      const min = limit(input.min, 0), max = limit(input.max, 100);
      const ratio = max > min ? Math.max(0, Math.min(1, (input.valueAsNumber - min) / (max - min))) : 0;
      const unit = this.getAttribute('unit') || '';
      describeUnit(this, input, unit);
      const reading = part(this, 'reading');
      reading.setAttribute('aria-hidden', 'true');
      reading.textContent = input.value + unit;
      const track = part(this, 'track');
      track.setAttribute('aria-hidden', 'true');
      const position = ratio * 100 + '%';
      if (track.style.getPropertyValue('--ml-position') !== position) {
        track.style.setProperty('--ml-position', position);
        GlassScene.forDocument(this.ownerDocument).wake();
      }
      part(track, 'fill');
      part(track, 'thumb', 'ml-value-surface');
      const ticks = part(track, 'ticks');
      const step = input.step === 'any' ? 0 : limit(input.step, 1);
      const tickKey = [min, max, step, this.hasAttribute('ticks')].join('/');
      if (ticks.dataset.scale !== tickKey) {
        ticks.dataset.scale = tickKey;
        ticks.replaceChildren();
        const count = Math.floor((max - min) / step + 1e-9);
        if (this.hasAttribute('ticks') && step > 0 && count >= 1 && count <= 24) {
          for (let i = 0; i <= count; i++) {
            const mark = this.ownerDocument.createElement('i');
            mark.style.insetInlineStart = Math.min(100, 100 * i * step / (max - min)) + '%';
            ticks.append(mark);
          }
        }
      }
      const ends = part(this, 'ends');
      ends.setAttribute('aria-hidden', 'true');
      part(ends, 'minimum').textContent = min + unit;
      part(ends, 'maximum').textContent = max + unit;
    }
  }
  customElements.define('ml-slider', Slider);
})();
