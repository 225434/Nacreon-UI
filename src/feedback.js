(() => {
  'use strict';

  if (customElements.get('ml-toast')) return;
  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  const defaultDuration = 4000;

  function toggleNotice(host, open, reason) {
    host.dispatchEvent(new CustomEvent('ml-toggle', { bubbles: true, detail: { open, reason } }));
  }

  function closeButton(doc, label) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'ml-feedback-close';
    button.setAttribute('aria-label', label);
    return button;
  }

  function restoreFocus(target) {
    if (target?.isConnected && typeof target.focus === 'function' &&
        !target.closest('[inert], :disabled') && target.getClientRects().length) {
      target.focus({ preventScroll: true });
    }
  }

  class ToastSurface extends GlassControl {
    get glassContent() { return this; }
  }
  customElements.define('ml-toast-surface', ToastSurface);

  class MaterialToast extends HTMLElement {
    static observedAttributes = ['inline', 'hidden'];
    #queue = [];
    #current = null;
    #layer;
    #surface;
    #text;
    #live;
    #doc;
    #timer = null;
    #announceTimer;
    #remaining = 0;
    #started = 0;
    #hovered = false;

    get open() { return this.#current !== null; }

    connectedCallback() {
      this.#doc = this.ownerDocument;
      if (!this.#layer) this.#mount();
      this.#place();
      this.#doc.addEventListener('visibilitychange', this.#visibility);
    }

    disconnectedCallback() {
      this.#doc.removeEventListener('visibilitychange', this.#visibility);
      this.#queue.length = 0;
      this.#hide(false);
    }

    attributeChangedCallback(name) {
      if (!this.isConnected || !this.#layer) return;
      if (name === 'inline') this.#place();
      if (this.hidden) this.clear();
    }

    #mount() {
      const doc = this.#doc;
      // Keep the live region mounted before its first announcement, independently of the popover.
      this.#live = doc.createElement('span');
      this.#live.className = 'ml-feedback-sr';
      this.#live.setAttribute('role', 'status');
      this.#live.setAttribute('aria-atomic', 'true');
      this.#layer = doc.createElement('div');
      this.#layer.className = 'ml-toast-layer';
      this.#layer.inert = true;
      this.#surface = doc.createElement('ml-toast-surface');
      this.#text = doc.createElement('span');
      this.#text.className = 'ml-toast-text';
      this.#text.setAttribute('aria-hidden', 'true');
      const close = closeButton(doc, '关闭轻提示');
      close.addEventListener('click', () => this.dismiss());
      this.#surface.append(this.#text, close);
      this.#layer.append(this.#surface);
      this.replaceChildren(this.#live, this.#layer);
      this.#surface.addEventListener('pointerenter', event => {
        if (event.pointerType !== 'touch') { this.#hovered = true; this.#pause(); }
      });
      this.#surface.addEventListener('pointerleave', () => { this.#hovered = false; this.#resume(); });
      this.#surface.addEventListener('focusin', () => this.#pause());
      this.#surface.addEventListener('focusout', () => queueMicrotask(() => this.#resume()));
      this.#surface.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
        event.preventDefault();
        this.dismiss('escape');
      });
    }

    #place() {
      if (typeof this.#layer.showPopover !== 'function') return;
      const mode = this.hasAttribute('inline') ? null : 'manual';
      if (this.#layer.popover !== mode) {
        if (this.#layer.matches(':popover-open')) this.#layer.hidePopover();
        this.#layer.popover = mode;
      }
      if (mode && this.open && !this.#layer.matches(':popover-open')) this.#layer.showPopover();
    }

    show(message, options = {}) {
      const text = String(message ?? '').trim();
      if (!this.isConnected || this.hidden || !text) return false;
      const ms = Number(options.duration ?? this.getAttribute('duration') ?? defaultDuration);
      this.#queue.push({ text, tone: options.tone ?? this.getAttribute('tone') ?? 'info',
        duration: Number.isFinite(ms) && ms >= 0 ? ms : defaultDuration,
        trigger: options.trigger ?? this.#doc.activeElement });
      this.#next();
      return true;
    }

    #next() {
      if (this.open || !this.#queue.length) return;
      const item = this.#current = this.#queue.shift();
      this.#remaining = item.duration;
      this.#text.textContent = item.text;
      this.#surface.setAttribute('tone', item.tone);
      this.#layer.inert = false;
      this.#layer.setAttribute('data-open', '');
      this.#place();
      this.#hovered = this.#doc.defaultView.matchMedia('(hover: hover)').matches && this.#surface.matches(':hover');
      this.#announceTimer = setTimeout(() => { this.#live.textContent = item.text; }, 0);
      this.#resume();
      toggleNotice(this, true, 'show');
    }

    #pause() {
      if (this.#timer === null) return;
      clearTimeout(this.#timer);
      this.#timer = null;
      this.#remaining = Math.max(0, this.#remaining - (performance.now() - this.#started));
    }

    #resume() {
      if (!this.open || !this.#current.duration || this.#timer !== null || this.#hovered ||
          this.#doc.hidden || this.#layer.contains(this.#doc.activeElement)) return;
      this.#started = performance.now();
      this.#timer = setTimeout(() => this.dismiss('timeout'), this.#remaining);
    }

    #visibility = () => { if (this.#doc.hidden) this.#pause(); else this.#resume(); };

    #hide(restore) {
      if (!this.open) return;
      const item = this.#current;
      const focused = this.#layer.contains(this.#doc.activeElement);
      this.#current = null;
      this.#pause();
      clearTimeout(this.#announceTimer);
      this.#live.textContent = '';
      this.#layer.inert = true;
      this.#layer.removeAttribute('data-open');
      if (this.#layer.hasAttribute('popover') && this.#layer.matches(':popover-open')) this.#layer.hidePopover();
      if (restore && focused) restoreFocus(item.trigger);
    }

    dismiss(reason = 'dismiss') {
      if (!this.open) return;
      this.#hide(true);
      toggleNotice(this, false, reason);
      this.#next();
    }

    clear() { this.#queue.length = 0; this.dismiss('clear'); }
  }
  customElements.define('ml-toast', MaterialToast);

  class MaterialBanner extends GlassControl {
    static observedAttributes = ['dismissible'];
    #close;
    #returnTo;
    #children = new MutationObserver(() => this.#sync());
    get glassContent() { return this; }

    connectedCallback() {
      for (const copy of this.querySelectorAll(':scope > .ml-feedback-close')) if (copy !== this.#close) copy.remove();
      super.connectedCallback();
      this.#children.observe(this, { childList: true });
      this.addEventListener('focusin', this.#rememberFocus);
      this.#sync();
    }

    disconnectedCallback() {
      this.#children.disconnect();
      this.removeEventListener('focusin', this.#rememberFocus);
      super.disconnectedCallback();
    }

    attributeChangedCallback() { if (this.isConnected) this.#sync(); }

    #sync() {
      const content = this.querySelector(':scope > .ml-banner-content');
      if (content && !content.hasAttribute('role') && !content.hasAttribute('aria-live') &&
          !this.hasAttribute('role') && !this.hasAttribute('aria-live')) content.setAttribute('role', 'status');
      if (!this.hasAttribute('dismissible')) { this.#close?.remove(); return; }
      if (!this.#close) {
        this.#close = closeButton(this.ownerDocument, '关闭消息横幅');
        this.#close.addEventListener('click', () => this.dismiss());
      }
      if (this.#close.parentElement !== this) this.append(this.#close);
    }

    #rememberFocus = event => {
      if (event.relatedTarget && !this.contains(event.relatedTarget)) this.#returnTo = event.relatedTarget;
    };

    show(trigger) {
      if (trigger) this.#returnTo = trigger;
      if (!this.hidden) return;
      this.hidden = false;
      toggleNotice(this, true, 'show');
    }

    dismiss() {
      if (this.hidden) return;
      const focused = this.contains(this.ownerDocument.activeElement);
      this.hidden = true;
      toggleNotice(this, false, 'dismiss');
      if (focused) restoreFocus(this.#returnTo);
    }
  }
  customElements.define('ml-banner', MaterialBanner);
})();
