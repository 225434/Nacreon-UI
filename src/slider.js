(() => {
  'use strict';
  if (customElements.get('ml-slider')) return;
  const { ValueField, part, describeUnit } = globalThis[Symbol.for('material-lib.value-controls.v1')];
  const { GlassScene } = globalThis[Symbol.for('material-lib.glass.v1')];
  const adjustmentKeys = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);
  const interactionEvents = ['pointerdown', 'pointerup', 'pointercancel', 'lostpointercapture', 'keydown', 'keyup', 'focusout'];
  function limit(attribute, fallback) {
    return attribute.trim() && Number.isFinite(Number(attribute)) ? Number(attribute) : fallback;
  }
  class Slider extends ValueField {
    static observedAttributes = ['unit', 'ticks'];
    #pressedKey = null;
    #pointerId = null;
    #activeInput = null;
    #drag = null;
    #tick = null;
    get control() { return this.querySelector(':scope > input[type="range"]'); }
    get value() { return this.control?.valueAsNumber; }
    set value(number) {
      if (this.control) { this.control.value = String(number); this.refresh(); }
    }
    connectedCallback() {
      super.connectedCallback();
      this.#release();
      for (const type of interactionEvents) this.addEventListener(type, this.#onInteraction);
    }
    disconnectedCallback() {
      for (const type of interactionEvents) this.removeEventListener(type, this.#onInteraction);
      this.#release();
      super.disconnectedCallback();
    }
    #onInteraction = event => {
      const input = event.target;
      switch (event.type) {
        case 'pointerdown':
          if (this.#pointerId !== null || event.defaultPrevented || !event.isPrimary || event.button !== 0 || input !== this.control || !input.matches(':enabled')) return;
          this.#pressedKey = null;
          this.#pointerId = event.pointerId;
          this.#activeInput = input;
          this.dataset.mlAdjust = 'pointer';
          this.#startDrag(event);
          // Capture on the native input itself so dragging and its form events remain native.
          if (event.isTrusted) input.setPointerCapture(event.pointerId);
          break;
        case 'pointerup':
        case 'pointercancel':
        case 'lostpointercapture':
          if (event.pointerId === this.#pointerId) this.#release();
          break;
        case 'keydown':
          if (this.#pointerId !== null || event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey ||
              event.isComposing || !adjustmentKeys.has(event.key) || input !== this.control || !input.matches(':enabled')) return;
          this.#pressedKey = event.key;
          this.#activeInput = input;
          this.dataset.mlAdjust = 'key';
          break;
        case 'keyup':
          if (event.key === this.#pressedKey) this.#release();
          break;
        case 'focusout':
          if (input === this.#activeInput) this.#release();
          break;
      }
    };
    #startDrag(event) {
      const win = this.ownerDocument.defaultView;
      if (win.matchMedia('(prefers-reduced-motion: reduce), (forced-colors: active)').matches ||
          !(parseFloat(win.getComputedStyle(this).getPropertyValue('--ml-slider-stretch')) > 0)) return;
      const track = this.querySelector(':scope > [data-ml-part="track"]');
      if (!track) return;
      const { left, right } = track.getBoundingClientRect();
      if (right <= left) return;
      this.#drag = { track, left, right, x: Math.max(left, Math.min(right, event.clientX)), time: event.timeStamp, timer: 0 };
      this.addEventListener('pointermove', this.#onDragMove, { passive: true });
    }
    #onDragMove = event => {
      if (event.pointerId !== this.#pointerId) return;
      const drag = this.#drag;
      const x = Math.max(drag.left, Math.min(drag.right, event.clientX));
      if (x === drag.x) return;
      // Only the contour follows speed. The native range owns the position and all value events.
      const elapsed = Math.max(8, event.timeStamp - drag.time);
      const speed = Math.min(1, Math.abs(x - drag.x) / elapsed / 1.2);
      drag.x = x;
      drag.time = event.timeStamp;
      drag.track.style.setProperty('--ml-slider-speed', speed.toFixed(2));
      clearTimeout(drag.timer);
      drag.timer = setTimeout(() => drag.track.style.removeProperty('--ml-slider-speed'), 75);
    };
    #release() {
      if (this.#drag) {
        this.removeEventListener('pointermove', this.#onDragMove);
        clearTimeout(this.#drag.timer);
        this.#drag.track.style.removeProperty('--ml-slider-speed');
        this.#drag = null;
      }
      this.#pressedKey = null;
      this.#pointerId = null;
      this.#activeInput = null;
      this.removeAttribute('data-ml-adjust');
    }
    refresh() {
      const input = this.control;
      this.toggleAttribute('data-ml-ready', !!input);
      if (this.#activeInput && (input !== this.#activeInput || !input.matches(':enabled'))) this.#release();
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
        // A form reset or value assignment can move a stationary, lit thumb.
        GlassScene.forDocument(this.ownerDocument).wake();
      }
      part(track, 'fill');
      part(track, 'thumb', 'ml-value-surface');
      const ticks = part(track, 'ticks');
      const increment = limit(input.step, 1);
      const step = input.step.toLowerCase() === 'any' ? 0 : increment > 0 ? increment : 1;
      // HTML bases the step grid on min, then the value attribute, then zero.
      const base = limit(input.min, limit(input.getAttribute('value') || '', 0));
      const first = step > 0 ? Math.ceil((min - base) / step - 1e-9) : 0;
      const tickKey = [min, max, step, base, this.hasAttribute('ticks')].join('/');
      if (ticks.dataset.scale !== tickKey) {
        ticks.dataset.scale = tickKey;
        ticks.replaceChildren();
        this.#tick = null;
        const intervals = step > 0 ? Math.floor((max - base) / step + 1e-9) - first : 0;
        if (this.hasAttribute('ticks') && intervals >= 1 && intervals <= 24 && max > min) {
          for (let i = 0; i <= intervals; i++) {
            const mark = this.ownerDocument.createElement('i');
            const value = base + (first + i) * step;
            mark.style.insetInlineStart = Math.max(0, Math.min(100, 100 * (value - min) / (max - min))) + '%';
            ticks.append(mark);
          }
        }
      }
      const tick = ticks.childElementCount
        ? ticks.children[Math.round((input.valueAsNumber - base) / step) - first] : null;
      if (this.#tick !== tick) {
        this.#tick?.removeAttribute('data-ml-current');
        tick?.setAttribute('data-ml-current', '');
        this.#tick = tick;
      }
      const ends = part(this, 'ends');
      ends.setAttribute('aria-hidden', 'true');
      part(ends, 'minimum').textContent = min + unit;
      part(ends, 'maximum').textContent = max + unit;
    }
  }
  customElements.define('ml-slider', Slider);
})();
