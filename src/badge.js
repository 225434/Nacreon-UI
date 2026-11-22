(() => {
  'use strict';

  if (customElements.get('ml-badge')) return;
  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  const kinds = ['indicator', 'count', 'notification', 'status', 'tag'];
  const states = { online: '在线', busy: '同步中', warning: '需注意', error: '异常', offline: '离线' };
  const tones = { neutral: '草稿', info: '进行中', warning: '待复核', success: '已完成', danger: '需处理' };

  function integer(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(Math.floor(number), Number.MAX_SAFE_INTEGER)) : 0;
  }

  // Only the lamp or number carries glass. Its adjacent label remains ordinary text.
  class BadgeFace extends GlassControl {
    get glassContent() { return this; }
  }
  customElements.define('ml-badge-face', BadgeFace);

  class MaterialBadge extends HTMLElement {
    static observedAttributes = ['kind', 'state', 'tone', 'label', 'value', 'max', 'dot'];
    #kind;
    #part;
    #text;
    #digits;

    get kind() { const kind = this.getAttribute('kind'); return kinds.includes(kind) ? kind : 'indicator'; }
    set kind(value) { this.setAttribute('kind', value); }
    get state() { const state = this.getAttribute('state'); return Object.hasOwn(states, state) ? state : 'offline'; }
    set state(value) { this.setAttribute('state', value); }
    get tone() { const tone = this.getAttribute('tone'); return Object.hasOwn(tones, tone) ? tone : 'neutral'; }
    set tone(value) { this.setAttribute('tone', value); }
    get label() {
      const text = this.getAttribute('label');
      if (text) return text;
      if (this.kind === 'indicator') return states[this.state];
      return this.kind === 'status' ? tones[this.tone] : '';
    }
    set label(value) { this.setAttribute('label', value ?? ''); }
    get value() { return integer(this.getAttribute('value')); }
    set value(value) {
      if (value == null) this.removeAttribute('value');
      else this.setAttribute('value', String(integer(value)));
    }
    get max() { return integer(this.getAttribute('max')) || 99; }
    set max(value) { this.setAttribute('max', String(integer(value) || 99)); }
    get dot() { return this.hasAttribute('dot'); }
    set dot(value) { this.toggleAttribute('dot', Boolean(value)); }

    connectedCallback() {
      for (const key of MaterialBadge.observedAttributes) {
        if (!Object.hasOwn(this, key)) continue;
        const value = this[key];
        delete this[key];
        this[key] = value;
      }
      this.#render();
    }

    attributeChangedCallback(name, before, after) {
      if (this.isConnected && before !== after) this.#render(true);
    }

    #mount(kind) {
      const doc = this.ownerDocument;
      this.#kind = kind;
      this.#text = this.#digits = null;
      if (kind === 'status' || kind === 'tag') {
        this.#part = doc.createElement('ml-tag');
        if (kind === 'tag') this.#part.className = 'ml-badge-tag';
        this.replaceChildren(this.#part);
        return;
      }
      this.#part = doc.createElement('ml-badge-face');
      this.#part.className = 'ml-badge-' + kind;
      this.#part.setAttribute('aria-hidden', 'true');
      if (kind !== 'indicator') {
        this.#digits = doc.createElement('span');
        this.#digits.className = 'ml-badge-digits';
        this.#part.append(this.#digits);
      }
      this.#text = doc.createElement('span');
      this.#text.className = kind === 'indicator' ? 'ml-badge-label' : 'ml-badge-sr';
      this.replaceChildren(this.#part, this.#text);
    }

    #render(animate = false) {
      const kind = this.kind;
      if (kind !== this.#kind || this.#part.parentElement !== this) this.#mount(kind);
      const notification = kind === 'notification';
      const hasCount = this.hasAttribute('value');
      const empty = notification && hasCount && this.value === 0;
      this.toggleAttribute('data-ml-badge-empty', empty);
      if (kind === 'status' || kind === 'tag') {
        this.#part.setAttribute('tone', this.tone);
        this.#part.label = this.label;
      } else if (kind === 'indicator') {
        this.#part.dataset.state = this.state;
        this.#text.textContent = this.label;
      } else {
        const dot = notification && (this.dot || !hasCount);
        this.#part.toggleAttribute('data-dot', dot);
        const digits = this.value > this.max ? this.max + '+' : String(this.value);
        this.#digits.textContent = dot ? '' : digits;
        const exact = notification ? (hasCount ? this.value + ' 条未读' : '有新通知') : String(this.value);
        this.#text.textContent = this.label ? this.label + '，' + exact : exact;
      }
      if (animate && !empty) {
        // Restart the inherited CSS motion even after a rapid series of updates.
        // CSS removes this animation for the base level and reduced motion.
        const arrival = this.getAnimations().find(item => item.animationName === 'ml-badge-arrive');
        if (arrival) { arrival.currentTime = 0; arrival.play(); }
      }
    }
  }

  customElements.define('ml-badge', MaterialBadge);
})();
