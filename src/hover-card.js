(() => {
  'use strict';

  if (customElements.get('ml-hover-card')) return;
  const { GlassScene, GlassSurface } = globalThis[Symbol.for('material-lib.glass.v1')];
  const activeCards = new WeakMap();
  let nextId = 0;

  function ensureId(element, kind) {
    const prefix = 'ml-hover-' + kind + '-';
    if (!element.id || element.id.startsWith(prefix)) element.id = prefix + ++nextId;
    return element.id;
  }

  class MaterialHoverCard extends HTMLElement {
    #trigger;
    #panel;
    #surface;
    #events;
    #openEvents;
    #timer;
    #frame = 0;
    #over = false;
    #returning = false;
    #pressedOpen;
    #size = new ResizeObserver(() => this.#queuePosition());
    #visibility = new IntersectionObserver(entries => {
      const last = entries.at(-1);
      if (this.open && last.target === this.#trigger && !last.isIntersecting) this.hide();
    });
    #children = new MutationObserver(() => this.#bind());
    #scene;
    #glass;

    get open() { return Boolean(this.#openEvents); }

    connectedCallback() {
      globalThis[Symbol.for('material-lib.motion-frames.v1')].watch(this.getRootNode());
      this.#children.observe(this, { childList: true });
      this.#bind();
    }

    disconnectedCallback() {
      this.#children.disconnect();
      this.#unbind();
    }

    #bind() {
      const trigger = this.querySelector(':scope > button');
      const panel = this.querySelector(':scope > .ml-hover-panel');
      if (trigger === this.#trigger && panel === this.#panel) return;
      this.#unbind();
      if (!trigger || !panel) return;
      this.#trigger = trigger;
      this.#panel = panel;
      this.#surface = panel.querySelector(':scope > .ml-hover-surface');
      if (!this.#surface) {
        this.#surface = this.ownerDocument.createElement('div');
        this.#surface.className = 'ml-hover-surface';
        this.#surface.append(...panel.childNodes);
        panel.append(this.#surface);
      }
      for (const layer of this.#surface.querySelectorAll(':scope > .ml-optical')) layer.remove();
      this.#surface.classList.remove('ml-refractive');
      this.#surface.style.removeProperty('--ml-bend');
      if (!trigger.hasAttribute('type')) trigger.type = 'button';
      trigger.setAttribute('aria-controls', ensureId(panel, 'panel'));
      trigger.setAttribute('aria-expanded', 'false');
      if (!panel.hasAttribute('aria-label') && (!panel.hasAttribute('aria-labelledby') || panel.getAttribute('aria-labelledby').startsWith('ml-hover-trigger-'))) {
        panel.setAttribute('aria-labelledby', ensureId(trigger, 'trigger'));
      }
      if (typeof panel.showPopover === 'function') panel.popover = 'manual';
      else panel.removeAttribute('popover');
      this.setAttribute('data-ml-hover-ready', '');
      this.#events = new AbortController();
      const options = { signal: this.#events.signal };
      this.addEventListener('pointerenter', this.#enter, options);
      this.addEventListener('pointerleave', this.#leave, options);
      this.addEventListener('focusin', this.#focusIn, options);
      this.addEventListener('focusout', this.#focusOut, options);
      trigger.addEventListener('pointerdown', () => { this.#pressedOpen = this.open; }, options);
      trigger.addEventListener('click', event => {
        if (event.defaultPrevented) return;
        const wasOpen = event.detail > 0 ? this.#pressedOpen ?? this.open : this.open;
        this.#pressedOpen = undefined;
        if (wasOpen) this.hide(); else this.show();
      }, options);
      panel.addEventListener('beforetoggle', event => {
        if (event.newState === 'closed') this.#release();
      }, options);
    }

    #unbind() {
      this.hide();
      this.#events?.abort();
      this.#trigger?.removeAttribute('aria-controls');
      this.#trigger?.removeAttribute('aria-expanded');
      this.#panel?.removeAttribute('popover');
      this.removeAttribute('data-ml-hover-ready');
      this.removeAttribute('data-ml-hover-open');
      this.#trigger = this.#panel = this.#surface = null;
      this.#over = false;
      this.#pressedOpen = undefined;
    }

    #enter = event => {
      if (event.pointerType === 'touch') return;
      this.#over = true;
      clearTimeout(this.#timer);
      if (!this.open) this.#timer = setTimeout(() => {
        const other = activeCards.get(this.ownerDocument);
        if (!other || !other.#panel.matches(':focus-within')) this.show();
      }, 160);
    };

    #leave = event => {
      if (event.pointerType === 'touch') return;
      this.#over = false;
      this.#scheduleClose();
    };

    #focusIn = () => {
      clearTimeout(this.#timer);
      if (!this.#returning) this.show();
    };

    #focusOut = event => {
      if (!this.contains(event.relatedTarget)) this.#scheduleClose();
    };

    #scheduleClose() {
      clearTimeout(this.#timer);
      if (this.open) this.#timer = setTimeout(() => {
        if (!this.#over && !this.matches(':focus-within')) this.hide();
      }, 160);
    }

    show() {
      clearTimeout(this.#timer);
      if (!this.isConnected) return;
      this.#bind();
      if (this.open || !this.#trigger?.getClientRects().length ||
          this.#trigger.matches(':disabled') || this.closest('[inert]')) return;
      const doc = this.ownerDocument, win = doc.defaultView;
      activeCards.get(doc)?.hide();
      activeCards.set(doc, this);
      this.#openEvents = new AbortController();
      this.setAttribute('data-ml-hover-open', '');
      this.#trigger.setAttribute('aria-expanded', 'true');
      if (this.#panel.hasAttribute('popover')) this.#panel.showPopover({ source: this.#trigger });
      this.#position();
      if (!this.open) return;
      this.#surface.scrollTop = 0;
      const options = { signal: this.#openEvents.signal };
      doc.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
        const modal = event.target.closest?.('dialog:modal');
        if (modal && !modal.contains(this)) { this.hide(); return; }
        event.preventDefault();
        this.hide(this.#panel.matches(':focus-within'));
      }, options);
      doc.addEventListener('pointerdown', event => {
        if (!event.composedPath().includes(this)) this.hide();
      }, { ...options, capture: true });
      const scrollOptions = { ...options, capture: true, passive: true };
      doc.addEventListener('scroll', this.#queuePosition, scrollOptions);
      win.addEventListener('resize', this.#queuePosition, options);
      win.visualViewport?.addEventListener('scroll', this.#queuePosition, options);
      win.visualViewport?.addEventListener('resize', this.#queuePosition, options);
      this.#size.observe(this.#trigger);
      this.#size.observe(this.#surface);
      if (this.#panel.hasAttribute('popover')) this.#visibility.observe(this.#trigger);
      this.#scene = GlassScene.forDocument(doc);
      this.#scene.painters.add(this.#paint);
      this.#scene.wake();
      this.dispatchEvent(new CustomEvent('ml-toggle', { bubbles: true, detail: { open: true } }));
    }

    hide(restoreFocus = false) {
      clearTimeout(this.#timer);
      if (!this.open) return;
      this.#returning = true;
      if (this.#panel.hasAttribute('popover') && this.#panel.matches(':popover-open')) this.#panel.hidePopover();
      this.#release();
      if (restoreFocus && this.#trigger?.isConnected) this.#trigger.focus({ preventScroll: true });
      this.#returning = false;
    }

    #release() {
      if (!this.open) return;
      this.#openEvents.abort();
      this.#openEvents = null;
      if (activeCards.get(this.ownerDocument) === this) activeCards.delete(this.ownerDocument);
      this.removeAttribute('data-ml-hover-open');
      this.#trigger.setAttribute('aria-expanded', 'false');
      this.#size.disconnect();
      this.#visibility.disconnect();
      this.ownerDocument.defaultView.cancelAnimationFrame(this.#frame);
      this.#frame = 0;
      this.#scene?.remove(this.#paint);
      this.#scene = null;
      this.#glass?.remove();
      this.#glass = null;
      this.dispatchEvent(new CustomEvent('ml-toggle', { bubbles: true, detail: { open: false } }));
    }

    #queuePosition = () => {
      if (this.open && !this.#frame) this.#frame = this.ownerDocument.defaultView.requestAnimationFrame(() => {
        this.#frame = 0;
        if (this.open) { this.#position(); this.#scene?.wake(); }
      });
    };

    #position() {
      const panel = this.#panel;
      if (!panel.hasAttribute('popover')) return;
      const anchor = this.#trigger.getBoundingClientRect();
      const doc = this.ownerDocument, viewport = doc.defaultView.visualViewport;
      const x = viewport?.offsetLeft ?? 0, y = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? doc.documentElement.clientWidth;
      const height = viewport?.height ?? doc.documentElement.clientHeight;
      if (!anchor.width || !anchor.height || this.#trigger.matches(':disabled') ||
          anchor.bottom <= y || anchor.top >= y + height || anchor.right <= x || anchor.left >= x + width) {
        this.hide(); return;
      }
      const margin = 8;
      panel.style.setProperty('--ml-hover-space-x', Math.max(1, width - 2 * margin) + 'px');
      // Measure the full reading height without expanding the scroll area and
      // losing its current scroll position when the user is reading a long card.
      const naturalHeight = this.#surface.scrollHeight + panel.offsetHeight - this.#surface.clientHeight;
      const desiredHeight = Math.min(naturalHeight, parseFloat(getComputedStyle(panel).maxHeight) || Infinity);
      const above = anchor.top - y - margin, below = y + height - margin - anchor.bottom;
      const preferAbove = this.getAttribute('placement') === 'above';
      const up = preferAbove ? above >= desiredHeight || above > below : below < desiredHeight && above > below;
      panel.dataset.side = up ? 'above' : 'below';
      panel.style.setProperty('--ml-hover-space-y', Math.max(1, up ? above : below) + 'px');
      const center = anchor.left + anchor.width / 2;
      const left = Math.max(x + margin, Math.min(center - panel.offsetWidth / 2, x + width - margin - panel.offsetWidth));
      panel.style.left = left + 'px';
      panel.style.top = Math.max(y + margin, up ? anchor.top - panel.offsetHeight : anchor.bottom) + 'px';
      panel.style.setProperty('--ml-hover-tip-x', Math.max(16, Math.min(panel.offsetWidth - 16, center - left)) + 'px');
    }

    #paint = (pointer, now) => {
      if (this.#trigger.matches(':disabled')) { this.hide(); return; }
      const style = getComputedStyle(this.#surface);
      const light = GlassSurface.lighting(style, this.#scene.media.matches);
      const follows = light.mode === 'pointer';
      const tier = GlassSurface.lightingTier(style, light);
      if (!tier) {
        this.#glass?.remove(); this.#glass = null; return;
      }
      this.#glass = GlassSurface.forTier(this.#glass, this.#surface, false, tier, light);
      this.#glass.paint(pointer, null, now);
      if (follows && this.#panel.getAnimations().some(animation => animation.playState === 'running')) this.#scene.wake();
      return follows;
    };
  }
  customElements.define('ml-hover-card', MaterialHoverCard);
})();
