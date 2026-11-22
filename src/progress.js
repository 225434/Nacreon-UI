(() => {
  'use strict';

  if (customElements.get('ml-progress')) return;
  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  class ProgressTrack extends GlassControl {
    get glassContent() { return this; }
  }
  customElements.define('ml-progress-track', ProgressTrack);

  // A rounded number near an endpoint must still distinguish a partial task from 0 or 100%.
  function percentage(position) {
    const rounded = Math.round(position * 100);
    if (rounded === 0 && position > 0) return '<1%';
    if (rounded === 100 && position < 1) return '>99%';
    return rounded + '%';
  }

  class MaterialProgress extends HTMLElement {
    #view;
    #label;
    #status;
    #number;
    #track;
    #changes = new MutationObserver(records => {
      if (records.some(record => record.target === this ||
          (record.type === 'attributes' && record.target === this.progress))) this.#render();
    });

    get progress() { return this.querySelector(':scope > progress'); }

    connectedCallback() {
      // A clone can already contain another instance's decorative rail.
      for (const copy of this.querySelectorAll(':scope > .ml-progress-view')) {
        if (copy !== this.#view) copy.remove();
      }
      this.#changes.observe(this, { subtree: true, childList: true, attributes: true,
        attributeFilter: ['value', 'max', 'aria-label', 'state'] });
      this.#render();
    }

    disconnectedCallback() { this.#changes.disconnect(); }

    #mount() {
      this.#view = this.ownerDocument.createElement('span');
      this.#view.className = 'ml-progress-view';
      this.#view.innerHTML = `<span class="ml-progress-head">
        <span class="ml-progress-label" aria-hidden="true"></span>
        <span class="ml-progress-reading"><span class="ml-progress-status" role="status"></span><strong class="ml-progress-number" aria-hidden="true"></strong></span>
      </span><ml-progress-track aria-hidden="true"><span class="ml-progress-fill"></span><span class="ml-progress-activity"></span></ml-progress-track>`;
      this.#label = this.#view.querySelector('.ml-progress-label');
      this.#status = this.#view.querySelector('.ml-progress-status');
      this.#number = this.#view.querySelector('.ml-progress-number');
      this.#track = this.#view.querySelector('ml-progress-track');
    }

    #render() {
      // The native element owns naming, max, clamping and the distinction between 0 and missing value.
      const native = this.progress;
      this.toggleAttribute('data-ml-progress-ready', Boolean(native));
      if (!native) { this.#view?.remove(); return; }
      if (!this.#view) this.#mount();
      const position = native.position;
      const requested = this.getAttribute('state');
      const state = requested === 'paused' || requested === 'error' ? requested
        : position === 1 ? 'complete' : position < 0 ? 'waiting' : 'active';
      this.#view.dataset.state = state;
      this.#view.toggleAttribute('data-indeterminate', position < 0);
      this.#view.toggleAttribute('data-at-start', position === 0);
      this.#label.textContent = native.getAttribute('aria-label') ?? '';
      const status = { paused: '已暂停', error: '失败', complete: '已完成', waiting: '进行中' }[state] ?? '';
      if (this.#status.textContent !== status) this.#status.textContent = status;
      this.#number.textContent = position < 0 ? '' : percentage(position);
      this.#track.style.setProperty('--ml-progress-level', Math.max(0, position * 100) + '%');
      if (this.#view.parentElement !== this) this.append(this.#view);
    }
  }
  customElements.define('ml-progress', MaterialProgress);
})();
