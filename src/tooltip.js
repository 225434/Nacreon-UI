(() => {
  'use strict';
  if (customElements.get('ml-tooltip')) return;

  const { GlassScene, GlassSurface } = globalThis[Symbol.for('material-lib.glass.v1')];
  const active = new WeakMap();
  const pending = new WeakMap();
  const controls = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [tabindex], [contenteditable="true"]';
  const sides = { top: ['bottom', 'right', 'left'], bottom: ['top', 'right', 'left'],
    left: ['right', 'top', 'bottom'], right: ['left', 'top', 'bottom'] };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  let sequence = 0;

  function viewportOf(doc) {
    const view = doc.defaultView.visualViewport;
    return { x: view?.offsetLeft ?? 0, y: view?.offsetTop ?? 0,
      width: view?.width ?? doc.documentElement.clientWidth, height: view?.height ?? doc.documentElement.clientHeight };
  }
  function inView(rect, { x, y, width, height }) {
    return rect.width > 0 && rect.height > 0 && rect.right > x && rect.left < x + width && rect.bottom > y && rect.top < y + height;
  }

  function describe(trigger, id, enabled) {
    if (!trigger) return;
    const ids = (trigger.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    if (ids.includes(id) === enabled) return;
    const next = enabled ? [...ids, id] : ids.filter(token => token !== id);
    if (next.length) trigger.setAttribute('aria-describedby', next.join(' '));
    else trigger.removeAttribute('aria-describedby');
  }

  class MaterialTooltip extends HTMLElement {
    static observedAttributes = ['text', 'placement', 'disabled'];
    #panel;
    #surface;
    #message;
    #trigger;
    #events;
    #session;
    #reasons = new Set();
    #dismissed = false;
    #timer;
    #frame = 0;
    #scene;
    #glass;
    #changes = new MutationObserver(records => {
      if (records.some(({ target }) => !this.#panel.contains(target))) this.#bind();
    });
    #sizes = new ResizeObserver(() => this.#queuePosition());
    #visibility = new IntersectionObserver(entries => {
      const entry = entries.at(-1);
      if (entry.target === this.#trigger && !entry.isIntersecting) this.hide();
    });

    get open() { return Boolean(this.#session); }

    connectedCallback() {
      globalThis[Symbol.for('material-lib.motion-frames.v1')].watch(this.getRootNode());
      const doc = this.ownerDocument;
      // cloneNode can copy a live specimen, including its generated description.
      for (const copy of this.querySelectorAll(':scope > .ml-tooltip-panel')) {
        describe(this.querySelector(controls), copy.id, false);
        copy.remove();
      }
      this.removeAttribute('data-ml-tooltip-open');
      this.#panel = doc.createElement('span');
      this.#panel.className = 'ml-tooltip-panel';
      do { this.#panel.id = 'ml-tooltip-' + ++sequence; } while (this.getRootNode().getElementById(this.#panel.id));
      this.#panel.setAttribute('role', 'tooltip');
      if (typeof this.#panel.showPopover === 'function') this.#panel.popover = 'manual';
      this.#surface = doc.createElement('span');
      this.#surface.className = 'ml-tooltip-surface';
      this.#message = doc.createTextNode('');
      this.#surface.append(this.#message);
      this.#panel.append(this.#surface);
      this.append(this.#panel);
      this.#bind();
      this.#changes.observe(this, { childList: true, subtree: true, attributes: true,
        attributeFilter: ['aria-describedby', 'disabled', 'hidden', 'inert', 'href', 'tabindex', 'type'] });
    }

    disconnectedCallback() {
      this.#changes.disconnect();
      this.#unbind();
      this.#panel.remove();
      this.#panel = null;
    }

    attributeChangedCallback(name, before, after) {
      if (!this.#panel || before === after) return;
      if (name !== 'placement') this.#bind();
      this.#queuePosition();
    }

    #unbind() {
      this.hide();
      this.#events?.abort();
      describe(this.#trigger, this.#panel.id, false);
      this.#trigger = null;
      this.#reasons.clear();
      this.#dismissed = false;
    }

    #bind() {
      if (this.#panel.parentNode !== this) this.append(this.#panel);
      const trigger = this.querySelector(controls);
      if (trigger !== this.#trigger) {
        this.#unbind();
        this.#trigger = trigger;
        if (trigger) this.#listen(trigger);
      }
      const text = (this.getAttribute('text') || '').trim();
      if (this.#message.data !== text) {
        this.#message.data = text;
        // The referenced text also needs to be available while a closed popover fades out.
        this.#panel.setAttribute('aria-label', text);
      }
      const enabled = Boolean(text) && !this.hasAttribute('disabled');
      describe(trigger, this.#panel.id, enabled);
      if (!enabled || trigger?.matches(':disabled') || trigger?.closest('[hidden], [inert]')) this.hide();
    }

    #listen(trigger) {
      this.#events = new AbortController();
      const options = { signal: this.#events.signal };
      for (const [element, reason] of [[trigger, 'trigger'], [this.#panel, 'panel']]) {
        element.addEventListener('pointerenter', event => {
          if (event.pointerType !== 'touch') this.#enter(reason, reason === 'trigger' ? 350 : 0);
        }, options);
        element.addEventListener('pointerleave', event => {
          if (event.pointerType !== 'touch') this.#leave(reason);
        }, options);
      }
      trigger.addEventListener('focus', () => {
        if (trigger.matches(':focus-visible')) this.#enter('focus', 0);
      }, options);
      trigger.addEventListener('blur', () => {
        this.#reasons.delete('tap');
        this.#leave('focus');
      }, options);
      trigger.addEventListener('click', () => {
        if (this.hasAttribute('toggle-on-click') && !this.open) {
          this.#reasons.add('tap');
          this.show();
        } else this.hide();
      }, options);
      this.#panel.addEventListener('beforetoggle', event => {
        if (event.newState === 'closed') this.#release();
      }, options);
    }

    #cancelTimer() {
      clearTimeout(this.#timer);
      if (pending.get(this.ownerDocument) === this) pending.delete(this.ownerDocument);
    }

    #enter(reason, delay) {
      this.#reasons.add(reason);
      this.#cancelTimer();
      if (this.#dismissed) return;
      if (!delay) this.show();
      else if (!this.open) {
        pending.get(this.ownerDocument)?.#cancelTimer();
        pending.set(this.ownerDocument, this);
        this.#timer = setTimeout(() => this.show(), delay);
      }
    }

    #leave(reason) {
      this.#reasons.delete(reason);
      if (this.#reasons.size) return;
      this.#dismissed = false;
      this.#cancelTimer();
      if (this.open) this.#timer = setTimeout(() => this.hide(), 120);
    }

    show() {
      this.#cancelTimer();
      const trigger = this.#trigger;
      if (!this.isConnected || !trigger || !this.#message.data ||
          this.hasAttribute('disabled') || trigger.matches(':disabled') || trigger.closest('[inert], [hidden]')) return;
      const doc = this.ownerDocument, win = doc.defaultView;
      const modal = doc.activeElement?.closest('dialog:modal');
      const anchor = trigger.getBoundingClientRect(), view = viewportOf(doc);
      if ((modal && !modal.contains(this)) || !inView(anchor, view)) return;
      // A pending hover on another control must not replace a newer focus or tap.
      pending.get(doc)?.#cancelTimer();
      if (this.open) return;
      active.get(doc)?.hide();
      active.set(doc, this);
      this.#dismissed = false;
      this.#session = new AbortController();
      const options = { signal: this.#session.signal };
      this.setAttribute('data-ml-tooltip-open', '');
      if (this.#panel.hasAttribute('popover')) this.#panel.showPopover();
      this.#position(anchor, view);
      if (!this.open) return;
      doc.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented) return;
        const modal = event.target.closest?.('dialog:modal');
        if (!modal || modal.contains(this)) {
          event.preventDefault();
          event.stopPropagation();
        }
        this.hide();
      }, { ...options, capture: true });
      doc.addEventListener('pointerdown', event => {
        if (!event.composedPath().includes(this)) this.hide();
      }, { ...options, capture: true });
      doc.addEventListener('focusin', event => {
        const dialog = event.target.closest?.('dialog:modal');
        if ((dialog && !dialog.contains(this)) || (this.#reasons.has('tap') && !event.composedPath().includes(this))) this.hide();
      }, options);
      doc.addEventListener('scroll', this.#queuePosition, { ...options, capture: true, passive: true });
      win.addEventListener('resize', this.#queuePosition, options);
      win.visualViewport?.addEventListener('resize', this.#queuePosition, options);
      win.visualViewport?.addEventListener('scroll', this.#queuePosition, options);
      this.#visibility.observe(trigger);
      this.#sizes.observe(trigger);
      this.#sizes.observe(this.#surface);
      this.#scene = GlassScene.forDocument(doc);
      this.#scene.painters.add(this.#paint);
      this.#scene.wake();
      this.dispatchEvent(new CustomEvent('ml-toggle', { bubbles: true, detail: { open: true } }));
    }

    hide() {
      this.#cancelTimer();
      this.#reasons.delete('tap');
      this.#reasons.delete('panel');
      this.#dismissed = this.#reasons.size > 0;
      if (!this.open) return;
      if (this.#panel.hasAttribute('popover') && this.#panel.matches(':popover-open')) this.#panel.hidePopover();
      this.#release();
    }

    #release() {
      if (!this.open) return;
      this.#session.abort();
      this.#session = null;
      this.removeAttribute('data-ml-tooltip-open');
      if (active.get(this.ownerDocument) === this) active.delete(this.ownerDocument);
      this.#sizes.disconnect();
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
        this.#position();
        this.#scene?.wake();
      });
    };

    #position(a = this.#trigger.getBoundingClientRect(), view = viewportOf(this.ownerDocument)) {
      const { x, y, width, height } = view, panel = this.#panel;
      if (!inView(a, view)) {
        this.hide();
        return;
      }
      const margin = 8, gap = 8;
      panel.style.setProperty('--ml-tooltip-view-width', Math.max(1, width - 2 * margin) + 'px');
      const w = panel.offsetWidth;
      const h = this.#surface.scrollHeight + this.#surface.offsetHeight - this.#surface.clientHeight;
      const room = { top: a.top - y - margin - gap, bottom: y + height - a.bottom - margin - gap,
        left: a.left - x - margin - gap, right: x + width - a.right - margin - gap };
      const preferred = this.getAttribute('placement');
      const first = Object.hasOwn(sides, preferred) ? preferred : 'top';
      const vertical = side => side === 'top' || side === 'bottom';
      const side = [first, ...sides[first]].find(s => room[s] >= (vertical(s) ? h : w))
        ?? (room.top >= room.bottom ? 'top' : 'bottom');
      panel.dataset.side = side;
      panel.style.setProperty('--ml-tooltip-view-height', Math.max(1, vertical(side) ? room[side] : height - 2 * margin) + 'px');
      const actualHeight = panel.offsetHeight, cx = a.left + a.width / 2, cy = a.top + a.height / 2;
      const left = clamp(side === 'left' ? a.left - gap - w : side === 'right' ? a.right + gap : cx - w / 2, x + margin, x + width - margin - w);
      const top = clamp(side === 'top' ? a.top - gap - actualHeight : side === 'bottom' ? a.bottom + gap : cy - actualHeight / 2, y + margin, y + height - margin - actualHeight);
      panel.style.left = left + 'px';
      panel.style.top = top + 'px';
      const tip = vertical(side) ? clamp(cx - left, 9, w - 9) : clamp(cy - top, 9, actualHeight - 9);
      panel.style.setProperty('--ml-tooltip-tip', tip + 'px');
    }

    #paint = (pointer, now) => {
      const style = getComputedStyle(this.#surface);
      const light = GlassSurface.lighting(style, this.#scene.media.matches);
      const follows = light.mode === 'pointer';
      const tier = GlassSurface.lightingTier(style, light);
      if (!tier) {
        this.#glass?.remove();
        this.#glass = null;
        return;
      }
      this.#glass = GlassSurface.forTier(this.#glass, this.#surface, true, tier, light);
      this.#glass.paint(pointer, null, now);
      if (follows && this.#panel.getAnimations().some(animation => animation.playState === 'running')) this.#scene.wake();
      return follows;
    };
  }
  customElements.define('ml-tooltip', MaterialTooltip);
})();
