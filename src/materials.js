(() => {
  'use strict';
  if (customElements.get('ml-material')) return;

  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  const { GlassScene } = globalThis[Symbol.for('material-lib.glass.v1')];
  const versions = new WeakMap();
  const levels = Object.freeze([
    { value: 'base', label: '基础', name: '纯色表面', note: '关闭材质', description: '实色覆盖底纹，仅保留轮廓。',
      light: '轮廓微光', litDescription: '靠近指针的一段轮廓亮起，中央保持纯色。' },
    { value: 'low', label: '低', name: '柔光表面', note: '柔光表面', description: '顶缘提亮，浅阴影托起表面。',
      light: '局部柔光', litDescription: '指针在实色表面照出一小片柔光。' },
    { value: 'medium', label: '中', name: '磨砂玻璃', note: '磨砂半透', description: '半透明表面柔化后方线条。',
      light: '磨砂散射', litDescription: '光晕在磨砂层里散开，软阴影偏向背光侧。' },
    { value: 'high', label: '高', name: '实心流体玻璃', note: '实心流体玻璃', description: '凸面放大底纹，光线透过带色的玻璃内部。',
      light: '玻璃聚光', litDescription: '迎光弧面亮起，对侧透出一道聚光。' },
  ].map(Object.freeze));

  class MaterialSurface extends GlassControl {
    #backdrop = null;
    #resize = new ResizeObserver(() => this.#wake());

    static get levels() { return levels; }
    get glassContent() { return this; }
    get glassBackdrop() { return this.#backdrop; }
    get glassBackdropVersion() { return versions.get(this.#backdrop) || 0; }
    get backdrop() { return this.#backdrop; }

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
