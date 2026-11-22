(() => {
  'use strict';

  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  const grouped = 'ml-list-group > :is(ul, ol) > li > ml-list-item';

  if (!customElements.get('ml-list-group')) {
    customElements.define('ml-list-group', class extends GlassControl {
      get glassContent() { return this.querySelector(':scope > :is(ul, ol):not([hidden])'); }
    });
  }

  if (!customElements.get('ml-list-item')) {
    customElements.define('ml-list-item', class extends GlassControl {
      #standalone = false;

      connectedCallback() {
        // Grouped rows share their list's lens, even when a row moves between lists.
        this.#standalone = !this.matches(grouped);
        if (this.#standalone) {
          super.connectedCallback();
        } else {
          // A copied standalone row can carry a refractive lens or a CSS pointer light.
          for (const layer of this.querySelectorAll(':scope > .ml-optical')) layer.remove();
          this.classList.remove('ml-refractive');
          this.style.removeProperty('--ml-bend');
        }
      }

      disconnectedCallback() {
        if (this.#standalone) super.disconnectedCallback();
      }

      get glassContent() {
        return this.querySelector(':scope > .ml-list-row, :scope > details > summary.ml-list-row');
      }
    });
  }
})();
