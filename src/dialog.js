(() => {
  'use strict';

  if (customElements.get('ml-dialog')) return;
  const { GlassScene, GlassSurface, waveDuration } = globalThis[Symbol.for('material-lib.glass.v1')];
  const events = ['pointerdown', 'pointercancel', 'click', 'keydown', 'transitionrun', 'transitionend', 'transitioncancel'];

  function onBackdrop(event, dialog) {
    if (event.target !== dialog || !dialog.matches(':modal')) return false;
    const box = dialog.getBoundingClientRect();
    return event.clientX < box.left || event.clientX >= box.right
      || event.clientY < box.top || event.clientY >= box.bottom;
  }

  // Native modality keeps the page inert. Wrap the two keyboard boundaries too,
  // so a single-button alert stays focused when the user presses Tab.
  function wrapTab(event, dialog) {
    if (event.key !== 'Tab' || event.ctrlKey || event.altKey || event.metaKey || !dialog.matches(':modal')) return;
    if (event.target.closest('dialog') !== dialog || event.composedPath()[0] !== event.target) return;
    const candidates = dialog.querySelectorAll('button, input, select, textarea, a[href], area[href], summary, iframe, audio[controls], video[controls], [contenteditable], [tabindex]');
    const visible = [...candidates].filter(el =>
      (el.tabIndex >= 0 || (el.isContentEditable && !el.hasAttribute('tabindex'))) &&
      !el.matches(':disabled') && !el.closest('[inert]') && el.getClientRects().length &&
      getComputedStyle(el).visibility === 'visible');
    const stops = visible.filter(el => {
      if (el.type !== 'radio' || !el.name) return true;
      const group = visible.filter(other => other.type === 'radio' && other.name === el.name && other.form === el.form);
      return el === (group.find(radio => radio.checked) ?? group[0]);
    });
    const order = el => el.tabIndex > 0 ? el.tabIndex : Number.MAX_SAFE_INTEGER;
    stops.sort((a, b) => order(a) - order(b));
    const first = stops[0] ?? dialog;
    const last = stops.at(-1) ?? dialog;
    if (event.target === (event.shiftKey ? first : last) || event.target === dialog) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  }

  // Keep the native dialog in its original form and DOM tree. showModal() supplies
  // the top layer, inert background, initial focus and restoration on dismissal.
  class MaterialDialog extends HTMLElement {
    #native;
    #scene;
    #glass;
    #pulse;
    #outsidePress = false;
    #size = new ResizeObserver(() => this.#scene?.wake());
    #watch = new MutationObserver(() => { this.#bind(); this.#scene?.wake(); });

    get dialog() { return this.querySelector(':scope > dialog'); }
    get open() { return Boolean(this.dialog?.open); }
    get returnValue() { return this.dialog?.returnValue ?? ''; }

    showModal(trigger) {
      const dialog = this.#bind();
      if (!dialog || dialog.matches(':modal')) return;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
      // The browser preserves returnValue across openings, including an Escape dismissal.
      dialog.returnValue = '';
      dialog.showModal();
      this.#scene?.wake();
    }

    close(value = '') { this.dialog?.close(String(value)); }

    connectedCallback() {
      globalThis[Symbol.for('material-lib.motion-frames.v1')].watch(this.getRootNode());
      this.#scene = GlassScene.forDocument(this.ownerDocument);
      this.#scene.painters.add(this.#paint);
      this.#bind();
      this.#watch.observe(this, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] });
      for (const type of events) this.addEventListener(type, this);
      this.#scene.wake();
    }

    disconnectedCallback() {
      for (const type of events) this.removeEventListener(type, this);
      this.#watch.disconnect();
      this.#size.disconnect();
      this.#scene?.remove(this.#paint);
      this.#scene = null;
      this.#clear();
      this.#native = null;
    }

    #bind() {
      const dialog = this.dialog;
      if (this.#native === dialog) return dialog;
      this.#clear();
      this.#size.disconnect();
      this.#native = dialog;
      this.#outsidePress = false;
      if (dialog) {
        // Cloning a live specimen also copies its generated filter IDs.
        for (const copy of dialog.querySelectorAll(':scope > .ml-optical')) copy.remove();
        dialog.classList.remove('ml-refractive');
        dialog.style.removeProperty('--ml-bend');
        this.#size.observe(dialog);
      }
      return dialog;
    }

    #clear() {
      this.#glass?.remove();
      this.#glass = null;
      this.#pulse = null;
    }

    #paint = (pointer, now) => {
      const dialog = this.#native;
      if (!dialog) return;
      const style = getComputedStyle(dialog);
      const dynamic = style.getPropertyValue('--ml-follow').trim() === '1';
      const light = GlassSurface.lighting(style, this.#scene.media.matches);
      const tier = GlassSurface.lightingTier(style, light);
      if (!tier || !dialog.getClientRects().length) {
        if (this.#glass) this.#clear();
        return;
      }
      if (!dialog.open) {
        // The glass reflection fades with the closing dialog. Pointer feedback ends on dismissal.
        if (this.#glass && (tier !== 'high' || this.#glass.tier !== tier)) this.#clear();
        return;
      }
      this.#glass = GlassSurface.forTier(this.#glass, dialog, false, tier, light);
      if (tier !== 'high' || !dynamic || (this.#pulse && now - this.#pulse.start >= waveDuration)) this.#pulse = null;
      this.#glass.paint(pointer, this.#pulse, now);
      if (light.mode === 'pointer' && dialog.getAnimations().some(a => a.playState === 'running')) this.#scene.wake();
      return light.mode === 'pointer';
    };

    handleEvent(event) {
      const dialog = this.#native;
      if (!dialog || event.target.closest?.('ml-dialog') !== this) return;
      if (event.type.startsWith('transition')) {
        if (event.target === dialog) this.#scene?.wake();
        return;
      }
      if (!dialog.open || event.defaultPrevented) return;
      if (event.type === 'keydown') { wrapTab(event, dialog); return; }
      if (event.type === 'pointercancel') { this.#outsidePress = false; return; }
      if (event.type === 'pointerdown') {
        if (!event.isPrimary || event.button !== 0) return;
        this.#outsidePress = onBackdrop(event, dialog);
        const style = getComputedStyle(dialog);
        if (!this.#outsidePress && this.#glass?.tier === 'high' && style.getPropertyValue('--ml-follow').trim() === '1') {
          this.#pulse = { x: event.clientX, y: event.clientY, start: this.#scene.win.performance.now() };
          this.#scene.wake(waveDuration + 35);
        }
        return;
      }
      const outside = this.#outsidePress && onBackdrop(event, dialog);
      this.#outsidePress = false;
      const cancel = event.target.closest?.('button[data-ml-dialog-close]');
      if (cancel && !cancel.matches(':disabled')) {
        event.preventDefault();
        this.close(cancel.value || 'cancel');
      } else if (outside && this.hasAttribute('dismiss-on-backdrop')) {
        // Backdrop dismissal is opt-in. Give listeners the same veto as Escape,
        // including on subsequent attempts after a listener rejected the first.
        if (dialog.dispatchEvent(new Event('cancel', { cancelable: true }))) this.close('cancel');
      }
    }
  }

  customElements.define('ml-dialog', MaterialDialog);
})();
