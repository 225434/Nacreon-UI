(() => {
  'use strict';
  if (customElements.get('ml-steps')) return;

  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];

  class Steps extends GlassControl {
    static observedAttributes = ['current', 'finished', 'orientation'];
    #items = [];
    #active;
    #sizes = new ResizeObserver(() => this.#layout());
    #changes = new MutationObserver(records => {
      if (records.some(({ target, type, addedNodes, removedNodes }) =>
        target === this ? type === 'childList' && [...addedNodes, ...removedNodes].some(node => node.localName === 'ol')
          : !target.closest('.ml-optical'))) this.refresh();
    });

    get glassContent() { return this.querySelector(':scope > ol'); }
    get current() { return this.#active?.dataset.step ?? ''; }
    set current(value) {
      if (value == null || value === '') this.removeAttribute('current');
      else this.setAttribute('current', String(value));
    }

    connectedCallback() {
      super.connectedCallback();
      this.addEventListener('click', this.#request);
      this.refresh();
      this.#sizes.observe(this);
      this.#changes.observe(this, { subtree: true, childList: true, attributes: true,
        attributeFilter: ['data-step', 'data-complete', 'data-error', 'hidden'] });
    }

    disconnectedCallback() {
      this.removeEventListener('click', this.#request);
      this.#sizes.disconnect();
      this.#changes.disconnect();
      super.disconnectedCallback();
    }

    attributeChangedCallback(name, before, after) {
      if (!this.isConnected || before === after) return;
      if (name === 'orientation') this.#layout();
      else this.refresh();
    }

    refresh() {
      const list = this.glassContent;
      const entries = [...(list?.querySelectorAll(':scope > li[data-step]') ?? [])];
      this.#items = entries.filter(item => !item.hidden);
      const key = this.getAttribute('current');
      this.#active = this.hasAttribute('finished') ? null : this.#items.find(item => item.dataset.step === key) ?? this.#items[0];
      if (list && list.getAttribute('role') !== 'list') list.setAttribute('role', 'list');
      let number = 0;
      for (const item of entries) {
        const control = item.querySelector(':scope > :is(button, a, span, div)');
        if (!control) continue;
        const active = item === this.#active;
        if (active) {
          if (control.getAttribute('aria-current') !== 'step') control.setAttribute('aria-current', 'step');
        } else if (control.getAttribute('aria-current') === 'step') control.removeAttribute('aria-current');
        if (item.hidden) continue;
        if (control.localName === 'button' && !control.hasAttribute('type')) control.type = 'button';
        const status = item.hasAttribute('data-error') ? 'error'
          : active ? 'current' : item.hasAttribute('data-complete') ? 'complete' : 'pending';
        item.dataset.mlStepState = status;
        this.#decorate(control, ++number, status);
      }
      this.#layout();
    }

    #decorate(control, number, status) {
      let marker = control.querySelector(':scope > .ml-step-marker');
      let description = control.querySelector(':scope > .ml-step-status');
      if (!marker) {
        marker = this.ownerDocument.createElement('span');
        marker.className = 'ml-step-marker';
        marker.setAttribute('aria-hidden', 'true');
        control.prepend(marker);
      }
      if (!description) {
        description = this.ownerDocument.createElement('span');
        description.className = 'ml-step-status';
        control.append(description);
      }
      const label = { complete: '，已完成', error: '，有错误', pending: '，待开始', current: '' }[status];
      if (marker.textContent !== String(number)) marker.textContent = String(number);
      if (description.textContent !== label) description.textContent = label;
    }

    #layout() {
      const list = this.glassContent;
      if (!list) return;
      const mode = this.getAttribute('orientation');
      const width = list.clientWidth;
      const minWidth = Math.max(27, this.#items.length * 7) * parseFloat(getComputedStyle(this).fontSize);
      const vertical = mode === 'vertical' || (mode !== 'horizontal' && width > 0 && width < minWidth);
      this.toggleAttribute('data-ml-steps-vertical', vertical);
    }

    #request = event => {
      if (event.defaultPrevented) return;
      const button = event.target.closest('button');
      const item = button?.parentElement;
      if (!this.#items.includes(item) || button.matches(':disabled, [aria-disabled="true"]') || item === this.#active) return;
      this.dispatchEvent(new CustomEvent('ml-step-request', {
        bubbles: true, composed: true, detail: { step: item.dataset.step, from: this.current },
      }));
    };
  }
  customElements.define('ml-steps', Steps);
})();
