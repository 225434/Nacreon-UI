(() => {
  'use strict';
  if (customElements.get('ml-empty-state')) return;

  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  const { GlassScene } = globalThis[Symbol.for('material-lib.glass.v1')];

  class EmptyState extends GlassControl {
    static observedAttributes = ['variant'];

    get glassContent() { return this.getAttribute('variant') === 'panel' ? this : null; }

    attributeChangedCallback(name, before, after) {
      if (before !== after && this.isConnected) GlassScene.forDocument(this.ownerDocument).wake();
    }
  }

  customElements.define('ml-empty-state', EmptyState);
})();
