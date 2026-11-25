(() => {
  'use strict';

  if (customElements.get('ml-switch')) return;

  function optionValue(option) {
    return option.dataset.value ?? option.getAttribute('value') ?? option.getAttribute('href') ?? '';
  }

  function available(option) {
    return !option.disabled && option.getAttribute('aria-disabled') !== 'true';
  }

  const interactionEvents = ['click', 'keydown', 'auxclick', 'contextmenu', 'pointerdown'];
  const transitionEvents = ['transitionrun', 'transitionend', 'transitioncancel'];
  const componentEvents = [...interactionEvents, ...transitionEvents];
  const { GlassSurface, GlassScene, waveDuration } = globalThis[Symbol.for('material-lib.glass.v1')];

  class MaterialSwitch extends HTMLElement {
    static observedAttributes = ['kind', 'label', 'checked', 'value', 'disabled'];

    #button;
    #selection;
    #bed;
    #lens;
    #glass = [];
    #pulse;
    #scene;
    #size = new ResizeObserver(() => this.#scene?.wake());
    #watchingAddress = false;
    #children = new MutationObserver(records => {
      const optionsChanged = records.some(record => record.type === 'childList'
        ? record.target === this
        : record.target.parentElement === this && record.target !== this.#button);
      if (optionsChanged) {
        this.#render();
        this.#readAddress();
      }
    });

    connectedCallback() {
      globalThis[Symbol.for('material-lib.motion-frames.v1')].watch(this.getRootNode());
      // A template cloned from a live component can contain another instance's SVG IDs.
      for (const child of this.querySelectorAll(':scope > :is(.ml-hit, .ml-selection, .ml-optical)')) {
        if (child !== this.#button && child !== this.#selection) child.remove();
      }
      if (this.classList.contains('ml-refractive')) {
        this.classList.remove('ml-refractive');
        this.style.removeProperty('--ml-bend');
      }
      this.#scene = GlassScene.forDocument(this.ownerDocument);
      this.#scene.painters.add(this.#paintGlass);
      this.#size.observe(this);
      for (const event of componentEvents) this.addEventListener(event, this);
      this.#children.observe(this, {
        childList: true, subtree: true, attributes: true,
        attributeFilter: ['href', 'data-value', 'value', 'disabled', 'aria-disabled'],
      });
      this.#render();
      this.#readAddress();
    }

    disconnectedCallback() {
      for (const event of componentEvents) this.removeEventListener(event, this);
      this.#scene?.remove(this.#paintGlass);
      this.#scene = null;
      this.#size.disconnect();
      this.#children.disconnect();
      this.#clearGlass();
      this.#watchAddress(false);
    }

    attributeChangedCallback(name, oldValue, newValue) {
      if (!this.isConnected || oldValue === newValue) return;
      this.#render();
      if (name === 'kind') this.#readAddress();
    }

    get checked() { return this.hasAttribute('checked'); }
    set checked(value) { this.toggleAttribute('checked', Boolean(value)); }
    get disabled() { return this.hasAttribute('disabled'); }
    set disabled(value) { this.toggleAttribute('disabled', Boolean(value)); }
    get kind() {
      const kind = this.getAttribute('kind');
      return kind === 'page' || kind === 'mode' ? kind : 'toggle';
    }
    get value() {
      if (this.kind === 'toggle') return this.checked ? 'on' : 'off';
      const selected = this.#selected(this.#options());
      return selected ? optionValue(selected) : '';
    }
    set value(value) {
      if (this.kind === 'toggle') this.checked = value === 'on';
      else this.setAttribute('value', value);
    }

    #options() {
      const selector = this.kind === 'page' ? ':scope > a[href]' : ':scope > button:not(.ml-hit)';
      return Array.from(this.querySelectorAll(selector));
    }

    #selected(options) {
      const wanted = this.getAttribute('value');
      return options.find(option => available(option) && optionValue(option) === wanted)
        ?? options.find(available);
    }

    #watchAddress(enable) {
      if (this.#watchingAddress === enable) return;
      this.#watchingAddress = enable;
      for (const event of ['hashchange', 'popstate', 'pageshow']) {
        if (enable) window.addEventListener(event, this);
        else window.removeEventListener(event, this);
      }
    }

    #readAddress() {
      if (this.kind !== 'page') return;
      const active = this.#options().find(link => available(link) && link.href === location.href);
      if (active) this.value = optionValue(active);
    }

    #clearGlass() {
      for (const surface of this.#glass) surface.remove();
      this.#glass = [];
      this.#pulse = null;
    }

    #mount(bed, lens) {
      if (bed !== this.#bed || lens !== this.#lens) this.#clearGlass();
      this.#bed = bed;
      this.#lens = lens;
      this.#scene?.wake();
    }

    #liquidMotion(style = getComputedStyle(this)) {
      return !this.disabled && style.getPropertyValue('--ml-optics').trim() === 'block'
        && style.getPropertyValue('--ml-follow').trim() === '1';
    }

    #paintGlass = (pointer, now) => {
      if (!this.#bed) return;
      const style = getComputedStyle(this);
      const enabled = !this.disabled && !this.closest('[inert], [aria-disabled="true"]');
      const dynamic = enabled && style.getPropertyValue('--ml-follow').trim() === '1';
      const light = GlassSurface.lighting(style, this.#scene.media.matches, enabled);
      const tier = GlassSurface.lightingTier(style, light);
      if (!tier) {
        if (this.#glass.length) this.#clearGlass();
        return;
      }
      if (!this.getClientRects().length) return;
      this.#glass[0] = GlassSurface.forTier(this.#glass[0], this.#bed, false, tier, light);
      this.#glass[1] = GlassSurface.forTier(this.#glass[1], this.#lens, true, tier, light);
      if (tier !== 'high' || !dynamic || (this.#pulse && now - this.#pulse.start >= waveDuration)) this.#pulse = null;
      for (const surface of this.#glass) surface.paint(pointer, this.#pulse, now);
      if (light.mode === 'pointer' && [this.#lens, this.#bed].some(element => element.getAnimations().some(
        animation => animation.transitionProperty && animation.playState === 'running'))) this.#scene.wake();
      return light.mode === 'pointer';
    };

    #disturb(x, y) {
      if (!this.#scene || !this.#liquidMotion()) return;
      this.#pulse = { x, y, start: this.#scene.win.performance.now() };
      this.#scene.wake(waveDuration + 35);
    }

    #disturbAtCenter(option) {
      const box = option.getBoundingClientRect();
      this.#disturb(box.left + box.width / 2, box.top + box.height / 2);
    }

    #render() {
      const kind = this.kind;
      this.#watchAddress(kind === 'page');
      const label = this.getAttribute('label') || this.getAttribute('aria-label') || '';
      this.setAttribute('aria-disabled', String(this.disabled));

      if (kind === 'toggle') {
        this.#selection?.remove();
        this.removeAttribute('data-ml-backward');
        this.removeAttribute('role');
        if (!this.#button) {
          this.#button = document.createElement('button');
          this.#button.className = 'ml-hit';
          this.#button.type = 'button';
          this.#button.setAttribute('role', 'switch');
          this.#button.innerHTML = '<span class="ml-track" aria-hidden="true"><span class="ml-mark"></span><span class="ml-thumb"></span></span>';
        }
        if (this.#button.parentElement !== this) this.append(this.#button);
        this.#button.setAttribute('aria-label', label || '开关');
        this.#button.setAttribute('aria-checked', String(this.checked));
        if (this.#button.disabled !== this.disabled) this.#button.disabled = this.disabled;
        this.#mount(this.#button.querySelector('.ml-track'), this.#button.querySelector('.ml-thumb'));
        return;
      }

      this.#button?.remove();
      if (!this.#selection) {
        this.#selection = document.createElement('span');
        this.#selection.className = 'ml-selection';
        this.#selection.setAttribute('aria-hidden', 'true');
      }
      if (this.#selection.parentElement !== this) this.prepend(this.#selection);
      this.#mount(this, this.#selection);
      this.setAttribute('role', kind === 'mode' ? 'radiogroup' : 'navigation');
      if (label) this.setAttribute('aria-label', label);
      const options = this.#options();
      const selected = this.#selected(options);
      const index = Math.max(0, options.indexOf(selected));
      const previousIndex = Number(this.style.getPropertyValue('--ml-index'));
      if (index !== previousIndex) this.toggleAttribute('data-ml-backward', index < previousIndex);
      this.toggleAttribute('data-ml-empty', !selected);
      this.style.setProperty('--ml-count', String(Math.max(1, options.length)));
      this.style.setProperty('--ml-index', String(index));

      for (const option of options) {
        const active = option === selected;
        if (kind === 'mode') {
          option.type = 'button';
          option.setAttribute('role', 'radio');
          option.setAttribute('aria-checked', String(active));
          option.tabIndex = active && !this.disabled ? 0 : -1;
        } else {
          if (active) option.setAttribute('aria-current', 'page');
          else option.removeAttribute('aria-current');
          option.tabIndex = !this.disabled && available(option) ? 0 : -1;
        }
      }
    }

    #notify() {
      this.dispatchEvent(new CustomEvent('ml-change', {
        bubbles: true,
        composed: true,
        detail: { kind: this.kind, value: this.value, checked: this.kind === 'toggle' ? this.checked : null },
      }));
    }

    #choose(option) {
      const before = this.value;
      this.value = optionValue(option);
      if (this.value !== before) this.#notify();
    }

    handleEvent(event) {
      if (transitionEvents.includes(event.type)) {
        if (event.target === this.#bed || event.target === this.#lens) this.#scene?.wake();
        return;
      }
      if (!interactionEvents.includes(event.type)) {
        this.#readAddress();
        return;
      }
      const target = event.target.closest?.('a, button');
      if (!target || target.parentElement !== this || event.defaultPrevented) return;
      if (event.type === 'pointerdown') {
        if (event.isPrimary && event.button === 0 && available(target)) this.#disturb(event.clientX, event.clientY);
        return;
      }
      if (this.disabled || !available(target)) {
        event.preventDefault();
        return;
      }
      if (event.type === 'auxclick' || event.type === 'contextmenu') return;
      if (event.type === 'click') {
        if (!event.detail) this.#disturbAtCenter(target);
        if (this.kind === 'toggle') {
          this.checked = !this.checked;
          this.#notify();
        } else if (this.kind === 'mode' || (event.button === 0 && !event.metaKey && !event.ctrlKey
          && !event.shiftKey && !event.altKey && (!target.target || target.target === '_self')
          && !target.hasAttribute('download'))) {
          this.#choose(target);
        }
        return;
      }

      if (this.kind !== 'mode') return;
      const options = this.#options().filter(available);
      const current = options.indexOf(target);
      const direction = getComputedStyle(this).direction === 'rtl' ? -1 : 1;
      let next;
      switch (event.key) {
        case 'Home': next = 0; break;
        case 'End': next = options.length - 1; break;
        case 'ArrowRight': next = current + direction; break;
        case 'ArrowLeft': next = current - direction; break;
        case 'ArrowDown': next = current + 1; break;
        case 'ArrowUp': next = current - 1; break;
        default: return;
      }
      event.preventDefault();
      const option = options[(next + options.length) % options.length];
      option.focus();
      this.#disturbAtCenter(option);
      this.#choose(option);
    }
  }

  customElements.define('ml-switch', MaterialSwitch);
})();
