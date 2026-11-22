(() => {
  'use strict';

  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  for (const name of ['ml-info-pill', 'ml-info-card', 'ml-card']) {
    if (customElements.get(name)) continue;
    // The host provides the surface. Focus and activation belong to its native content.
    customElements.define(name, class extends GlassControl {
      get glassContent() { return this; }
    });
  }
})();
