(() => {
  'use strict';

  const key = Symbol.for('material-lib.glass-control.v1');
  if (globalThis[key]?.version >= 6) return;
  const { GlassScene, GlassSurface, waveDuration } = globalThis[Symbol.for('material-lib.glass.v1')];
  const events = ['pointerdown', 'click', 'transitionrun', 'transitionend', 'transitioncancel'];

  // Optical treatment for a compact surface. Its content owns semantics and focus.
  class GlassControl extends HTMLElement {
    static get version() { return 6; }
    #scene;
    #glass;
    #pulse;
    #size = new ResizeObserver(() => this.#scene?.wake());
    #children = new MutationObserver(() => this.#scene?.wake());

    get glassContent() { return this.querySelector(':scope > button'); }

    connectedCallback() {
      for (const copy of this.querySelectorAll(':scope > .ml-optical')) copy.remove();
      this.classList.remove('ml-refractive');
      this.style.removeProperty('--ml-bend');
      this.#scene = GlassScene.forDocument(this.ownerDocument);
      this.#scene.painters.add(this.#paint);
      this.#size.observe(this);
      this.#children.observe(this, { childList: true });
      for (const event of events) this.addEventListener(event, this);
      this.#scene.wake();
    }

    disconnectedCallback() {
      for (const event of events) this.removeEventListener(event, this);
      this.#size.disconnect();
      this.#children.disconnect();
      this.#scene.remove(this.#paint);
      this.#scene = null;
      this.#clear();
    }

    #clear() {
      this.#glass?.remove();
      this.#glass = null;
      this.#pulse = null;
    }

    #canMove(content, style) {
      return style.getPropertyValue('--ml-follow').trim() === '1'
        && !content.matches(':disabled, [disabled]')
        && !content.closest('[inert], [aria-disabled="true"], [aria-busy="true"]');
    }

    #paint = (pointer, now) => {
      const content = this.glassContent;
      const style = getComputedStyle(this);
      const dynamic = content && this.#canMove(content, style);
      const tier = content && GlassSurface.lightingTier(style, dynamic);
      if (!tier) {
        if (this.#glass) this.#clear();
        return;
      }
      if (!this.getClientRects().length) return;
      this.#glass = GlassSurface.forTier(this.#glass, this, true, tier);
      if (tier !== 'high' || !dynamic || (this.#pulse && now - this.#pulse.start >= waveDuration)) this.#pulse = null;
      this.#glass.paint(dynamic ? pointer : null, this.#pulse, now, this.glassBackdrop, this.glassBackdropVersion);
      if (dynamic && this.getAnimations().some(a => a.transitionProperty && a.playState === 'running')) this.#scene.wake();
      return dynamic;
    };

    handleEvent(event) {
      if (event.type.startsWith('transition')) {
        if (event.target === this) this.#scene.wake();
        return;
      }
      const action = event.target.closest?.('button, select, input[type="checkbox"], input[type="radio"]');
      if (action?.parentElement !== this || event.defaultPrevented) return;
      const style = getComputedStyle(this);
      if (style.getPropertyValue('--ml-optics').trim() !== 'block' || !this.#canMove(action, style)) return;
      let x = event.clientX, y = event.clientY;
      if (event.type === 'pointerdown') {
        if (!event.isPrimary || event.button !== 0) return;
      } else {
        if (event.detail !== 0) return;
        const rect = action.getBoundingClientRect();
        x = rect.left + rect.width / 2;
        y = rect.top + rect.height / 2;
      }
      this.#pulse = { x, y, start: this.#scene.win.performance.now() };
      this.#scene.wake(waveDuration + 35);
    }
  }

  globalThis[key] = GlassControl;
})();
