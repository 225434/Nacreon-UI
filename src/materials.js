(() => {
  'use strict';
  if (customElements.get('ml-material')) return;

  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  const { GlassScene } = globalThis[Symbol.for('material-lib.glass.v1')];
  const versions = new WeakMap();
  const levels = Object.freeze([
    { value: 'base', label: '关闭', name: '云母', note: '云母', description: '不透明底面带少量主题染色，背景细节隐去。',
      light: '轮廓微光', litDescription: '靠近指针的一段轮廓亮起，中央保持纯色。' },
    { value: 'low', label: '低', name: '增强云母', note: '增强云母', description: '不透明底面加强主题染色，边缘的明暗区分表面层级。',
      light: '局部柔光', litDescription: '指针在实色表面照出一小片柔光。' },
    { value: 'medium', label: '中', name: '磨砂玻璃', note: '磨砂玻璃', description: '半透明表面扩散底纹，背景轮廓变软。',
      light: '磨砂散射', litDescription: '光晕在磨砂层里散开，软阴影偏向背光侧。' },
    { value: 'high', label: '高', name: '实心流体玻璃', note: '实心流体玻璃', description: '凸面放大底纹，较厚的边缘透出更明显的主题色。',
      light: '玻璃聚光', litDescription: '迎光弧面锐亮，对侧聚出光斑，边缘泛出光谱色散。' },
  ].map(Object.freeze));

  class MaterialSurface extends GlassControl {
    #backdrop = null;
    #resize = new ResizeObserver(() => this.#wake());

    static get levels() { return levels; }
    get glassContent() { return this; }
    get glassBackdrop() { return this.#backdrop; }
    get glassBackdropVersion() { return versions.get(this.#backdrop) || 0; }
    get backdrop() { return this.#backdrop; }

    // Pressing anywhere on the sample sends a liquid rebound over its glass.
    // A press on its own control still uses the control's ripple instead.
    handleEvent(event) {
      const action = event.target.closest?.('button, select, input[type="checkbox"], input[type="radio"]');
      super.handleEvent(event);
      if (event.type !== 'pointerdown' || (action && action.parentElement === this)) return;
      if (!event.isPrimary || event.button !== 0 || event.defaultPrevented) return;
      this.pulse(event.clientX, event.clientY);
    }

    // Supply the visible, axis-aligned background canvas for texture refraction.
    set backdrop(canvas) {
      if (canvas != null && (canvas.localName !== 'canvas' || canvas.ownerDocument !== this.ownerDocument)) {
        throw new TypeError('backdrop must be a canvas in the same document');
      }
      this.#resize.disconnect();
      this.#backdrop = canvas || null;
      if (canvas && this.isConnected) this.#resize.observe(canvas);
      this.#wake();
    }

    refreshBackdrop() {
      if (this.#backdrop) versions.set(this.#backdrop, this.glassBackdropVersion + 1);
      this.#wake();
    }

    #wake() {
      if (this.isConnected) GlassScene.forDocument(this.ownerDocument).wake();
    }

    connectedCallback() {
      super.connectedCallback();
      if (Object.hasOwn(this, 'backdrop')) {
        const canvas = this.backdrop;
        delete this.backdrop;
        this.backdrop = canvas;
      } else if (this.#backdrop) this.#resize.observe(this.#backdrop);
    }

    disconnectedCallback() {
      this.#resize.disconnect();
      super.disconnectedCallback();
    }
  }

  customElements.define('ml-material', MaterialSurface);
})();
