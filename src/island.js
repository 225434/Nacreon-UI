(() => {
  'use strict';

  if (customElements.get('ml-island')) return;
  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  const directions = ['left', 'right', 'up', 'down'];
  let nextPanelId = 0;

  class IslandSurface extends GlassControl {
    get glassContent() { return this; }
  }
  customElements.define('ml-island-surface', IslandSurface);

  function setPixels(style, property, value) {
    const px = Math.round(value * 100) / 100 + 'px';
    if (style.getPropertyValue(property) !== px) style.setProperty(property, px);
  }

  function clamp(value, min, max) { return Math.max(min, Math.min(value, max)); }

  // Respect scrolling/clipping ancestors as well as an explicitly bounded preview or toolbar.
  function boundaries(host) {
    const result = [];
    for (let node = host.parentElement; node && node !== host.ownerDocument.documentElement; node = node.parentElement) {
      const css = getComputedStyle(node);
      const bound = node.hasAttribute('data-ml-island-bounds');
      const x = bound || css.overflowX !== 'visible';
      const y = bound || css.overflowY !== 'visible';
      if (x || y) result.push({ node, x, y });
    }
    return result;
  }

  function availableRect(doc, bounds) {
    const viewport = doc.defaultView.visualViewport;
    const left = viewport?.offsetLeft ?? 0;
    const top = viewport?.offsetTop ?? 0;
    const area = { left, top, right: left + (viewport?.width ?? doc.documentElement.clientWidth),
      bottom: top + (viewport?.height ?? doc.documentElement.clientHeight) };
    for (const { node, x, y } of bounds) {
      const rect = node.getBoundingClientRect();
      const sx = node.offsetWidth ? rect.width / node.offsetWidth : 1;
      const sy = node.offsetHeight ? rect.height / node.offsetHeight : 1;
      const innerLeft = rect.left + node.clientLeft * sx, innerTop = rect.top + node.clientTop * sy;
      if (x) {
        area.left = Math.max(area.left, innerLeft);
        area.right = Math.min(area.right, innerLeft + node.clientWidth * sx);
      }
      if (y) {
        area.top = Math.max(area.top, innerTop);
        area.bottom = Math.min(area.bottom, innerTop + node.clientHeight * sy);
      }
    }
    return area;
  }

  class MaterialIsland extends HTMLElement {
    static observedAttributes = ['direction', 'open'];
    #trigger;
    #panel;
    #surface;
    #bounds = [];
    #watch;
    #frame = 0;
    #clipFrame = 0;
    #size = new ResizeObserver(() => {
      if (this.open) this.#clipPanel();
      this.#schedule();
    });
    #children = new MutationObserver(() => this.#bind());

    get direction() {
      const value = this.getAttribute('direction');
      return directions.includes(value) ? value : 'down';
    }
    set direction(value) { this.setAttribute('direction', value); }
    get open() { return this.hasAttribute('open'); }
    set open(value) { this.toggleAttribute('open', Boolean(value)); }
    show() { this.open = true; }
    hide() { this.open = false; }

    connectedCallback() {
      this.addEventListener('click', this.#click);
      this.addEventListener('keydown', this.#key);
      this.#children.observe(this, { childList: true });
      this.#bind();
    }

    disconnectedCallback() {
      this.removeEventListener('click', this.#click);
      this.removeEventListener('keydown', this.#key);
      this.#children.disconnect();
      this.#size.disconnect();
      this.#stopWatching();
      this.#trigger = this.#panel = null;
    }

    #bind() {
      const trigger = this.querySelector(':scope > button');
      const panel = this.querySelector(':scope > .ml-island-panel');
      let surface = this.querySelector(':scope > ml-island-surface');
      if (!surface) {
        surface = this.ownerDocument.createElement('ml-island-surface');
        surface.setAttribute('aria-hidden', 'true');
        this.prepend(surface);
      }
      if (trigger === this.#trigger && panel === this.#panel && surface === this.#surface) return;
      this.#size.disconnect();
      this.#stopWatching();
      this.#trigger = trigger;
      this.#panel = panel;
      this.#surface = surface;
      if (!trigger || !panel) {
        trigger?.removeAttribute('aria-controls');
        trigger?.removeAttribute('aria-expanded');
        if (panel) panel.hidden = true;
        return;
      }
      if (!trigger.hasAttribute('type')) trigger.type = 'button';
      const tree = this.getRootNode();
      if (!panel.id || tree.querySelectorAll('#' + CSS.escape(panel.id)).length > 1) {
        let id;
        do { id = 'ml-island-panel-' + ++nextPanelId; } while (tree.getElementById(id));
        panel.id = id;
      }
      trigger.setAttribute('aria-controls', panel.id);
      this.#size.observe(trigger);
      this.#size.observe(panel);
      this.#sync();
    }

    attributeChangedCallback(name, before, after) {
      if (before === after || !this.isConnected || !this.#trigger || !this.#panel) return;
      if (name === 'direction') {
        if (this.open) {
          // Start the new direction at the original button, even halfway through an old morph.
          this.#surface.setAttribute('data-ml-compact', '');
          this.#layout();
          void this.#surface.offsetWidth;
          this.#surface.removeAttribute('data-ml-compact');
          this.#clipPanel();
        }
        return;
      }
      this.#sync();
      if ((before === null) !== (after === null)) this.dispatchEvent(new CustomEvent('ml-toggle', {
        bubbles: true, detail: { open: this.open, direction: this.direction }
      }));
    }

    #click = event => {
      if (this.#panel && !event.defaultPrevented && this.#trigger?.contains(event.target) && !this.#trigger.disabled) this.open = !this.open;
    };
    #key = event => {
      if (this.open && event.key === 'Escape' && !event.defaultPrevented && !event.isComposing &&
          event.target.closest('ml-island') === this) {
        event.preventDefault();
        this.hide();
      }
    };

    #sync() {
      const tree = this.getRootNode();
      if (!this.open && this.#panel.contains(tree.activeElement)) this.#trigger.focus({ preventScroll: true });
      this.#trigger.setAttribute('aria-expanded', String(this.open));
      this.#panel.hidden = !this.open;
      if (!this.open) { this.#stopWatching(); return; }
      if (!this.#watch) {
        this.#bounds = boundaries(this);
        for (const { node } of this.#bounds) this.#size.observe(node);
        this.#watch = new AbortController();
        const win = this.ownerDocument.defaultView;
        const options = { signal: this.#watch.signal, passive: true, capture: true };
        win.addEventListener('resize', this.#schedule, options);
        win.addEventListener('scroll', this.#schedule, options);
        win.visualViewport?.addEventListener('resize', this.#schedule, options);
        win.visualViewport?.addEventListener('scroll', this.#schedule, options);
      }
      this.#layout();
    }

    #stopWatching() {
      this.#watch?.abort();
      this.#watch = null;
      for (const { node } of this.#bounds) this.#size.unobserve(node);
      this.#bounds = [];
      if (this.#frame) cancelAnimationFrame(this.#frame);
      this.#frame = 0;
      if (this.#clipFrame) cancelAnimationFrame(this.#clipFrame);
      this.#clipFrame = 0;
      this.#panel?.style.removeProperty('--ml-island-clip');
    }
    #schedule = () => {
      if (this.open && this.isConnected && !this.#frame) this.#frame = requestAnimationFrame(() => {
        this.#frame = 0;
        this.#layout();
      });
    };

    // During a morph the text already has its final layout. Reveal only what fits inside the moving skin.
    #clipPanel = () => {
      if (this.#clipFrame) cancelAnimationFrame(this.#clipFrame);
      this.#clipFrame = 0;
      const panel = this.#panel;
      if (!panel || !this.open) return;
      const moving = this.#surface.getAnimations().some(a =>
        ['left', 'top', 'width', 'height'].includes(a.transitionProperty) && a.playState === 'running');
      const skin = this.#surface.getBoundingClientRect(), content = panel.getBoundingClientRect();
      if (!content.width || !content.height) return;
      const sx = panel.offsetWidth / content.width, sy = panel.offsetHeight / content.height;
      const edges = [(skin.top - content.top) * sy, (content.right - skin.right) * sx,
        (content.bottom - skin.bottom) * sy, (skin.left - content.left) * sx];
      if (edges.some(value => value > 1)) {
        panel.style.setProperty('--ml-island-clip', 'inset(' + edges.map(v => Math.max(0, v).toFixed(2) + 'px').join(' ') + ')');
      } else panel.style.removeProperty('--ml-island-clip');
      if (moving) this.#clipFrame = requestAnimationFrame(this.#clipPanel);
    };

    #layout() {
      if (!this.open || !this.#trigger || !this.#panel) return;
      const anchor = this.#trigger.getBoundingClientRect();
      if (!anchor.width || !anchor.height) return;
      const area = availableRect(this.ownerDocument, this.#bounds);
      if (area.right <= area.left || area.bottom <= area.top ||
          anchor.right <= area.left || anchor.left >= area.right || anchor.bottom <= area.top || anchor.top >= area.bottom) return;
      const css = getComputedStyle(this.#trigger);
      const w = parseFloat(css.width), h = parseFloat(css.height);
      const sx = w / anchor.width, sy = h / anchor.height;
      const left = (area.left - anchor.left) * sx, right = (area.right - anchor.left) * sx;
      const top = (area.top - anchor.top) * sy, bottom = (area.bottom - anchor.top) * sy;
      const dir = this.direction, horizontal = dir === 'left' || dir === 'right';
      const sideSpace = dir === 'left' ? -left : right - w;
      // Switch to wrapped rows when a side column would only fit a few characters.
      const line = parseFloat(css.fontSize);
      const side = horizontal && sideSpace >= 6 * line;
      const above = -top, below = bottom - h;
      let up = dir === 'up';
      if (!side && (up ? above : below) < 3 * line && (up ? below : above) > (up ? above : below)) up = !up;
      const availableWidth = right - left;
      const stackedWidth = horizontal ? clamp(w + sideSpace, Math.min(availableWidth, 11 * line), availableWidth) : availableWidth;
      const panel = this.#panel;
      panel.dataset.layout = side ? dir : (up ? 'up' : 'down');
      setPixels(panel.style, '--ml-room-w', Math.max(1, side ? sideSpace : stackedWidth));
      setPixels(panel.style, '--ml-room-h', Math.max(1, side ? bottom - top : (up ? above : below)));

      // Measure the real, wrapped content. Only the background morphs; the trigger stays in normal flow.
      const pw = panel.offsetWidth, ph = panel.offsetHeight;
      const width = side ? w + pw : Math.max(w, pw);
      const height = side ? Math.max(h, ph) : h + ph;
      const preferredX = dir === 'left' ? w - width : dir === 'right' ? 0 : (w - width) / 2;
      const x = clamp(preferredX, left, right - width);
      const y = side ? clamp((h - height) / 2, top, bottom - height) : up ? h - height : 0;
      setPixels(panel.style, 'left', side ? (dir === 'left' ? x : w) : x + (width - pw) / 2);
      setPixels(panel.style, 'top', side ? y + (height - ph) / 2 : up ? -ph : h);
      const skin = this.#surface.style;
      setPixels(skin, '--ml-open-x', x);
      setPixels(skin, '--ml-open-y', y);
      setPixels(skin, '--ml-open-w', width);
      setPixels(skin, '--ml-open-h', height);
      this.#clipPanel();
    }
  }
  customElements.define('ml-island', MaterialIsland);
})();
