(() => {
  'use strict';

  if (customElements.get('ml-button')) return;
  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  class MaterialButton extends GlassControl {}
  customElements.define('ml-button', MaterialButton);
})();
