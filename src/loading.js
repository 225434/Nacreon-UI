(() => {
  'use strict';

  class Spinner extends HTMLElement {
    static observedAttributes = ['label'];

    connectedCallback() {
      globalThis[Symbol.for('material-lib.motion-frames.v1')].watch(this.getRootNode());
      if (!this.hasAttribute('role')) this.setAttribute('role', 'status');
      if (!this.querySelector(':scope > .ml-spinner-label')) {
        const parts = this.ownerDocument.createElement('template');
        parts.innerHTML = `<span class="ml-spinner-ring" aria-hidden="true"></span>
          <span class="ml-spinner-dots" aria-hidden="true"><i></i><i></i><i></i></span>
          <span class="ml-spinner-label"></span>`;
        this.append(parts.content);
      }
      this.#renderLabel();
    }

    attributeChangedCallback() { this.#renderLabel(); }

    #renderLabel() {
      const text = this.querySelector(':scope > .ml-spinner-label');
      if (!text) return;
      const label = this.getAttribute('label')?.trim() || '加载中';
      if (text.textContent !== label) text.textContent = label;
    }
  }
  if (!customElements.get('ml-spinner')) customElements.define('ml-spinner', Spinner);

  function count(element, name, fallback, limit) {
    const raw = element.getAttribute(name)?.trim();
    const value = Number(raw);
    return raw && Number.isFinite(value) ? Math.max(1, Math.min(limit, Math.trunc(value))) : fallback;
  }

  const line = width => '<span class="ml-skeleton-shape" style="--ml-skeleton-width:' + width + '%"></span>';
  const shape = type => '<span class="ml-skeleton-shape" data-shape="' + type + '"></span>';
  const row = (content, head = false) => '<div class="ml-skeleton-row"' + (head ? ' data-heading' : '') + '>' + content + '</div>';
  const cellLengths = [62, 82, 47, 68];
  const presets = {
    list(rows) {
      return Array.from({ length: rows }, (_, index) => row(shape('circle') +
        '<span class="ml-skeleton-lines">' + line(index % 2 ? 68 : 52) + line(index % 2 ? 39 : 33) + '</span>' + line(76))).join('');
    },
    card() {
      return shape('block') + '<div class="ml-skeleton-lines">' + line(56) + line(84) + '</div>';
    },
    table(rows, columns) {
      return Array.from({ length: rows + 1 }, (_, index) => row(
        Array.from({ length: columns }, (_, column) => line(index === 0 ? 54 : cellLengths[(index + column) % cellLengths.length])).join(''),
        index === 0,
      )).join('');
    },
  };

  class Skeleton extends HTMLElement {
    static observedAttributes = ['preset', 'rows', 'columns'];
    #view;

    connectedCallback() {
      globalThis[Symbol.for('material-lib.motion-frames.v1')].watch(this.getRootNode());
      this.setAttribute('aria-hidden', 'true');
      this.inert = true;
      this.#view = this.querySelector(':scope > .ml-skeleton-view');
      this.#render();
    }

    attributeChangedCallback(name, before, after) {
      if (before !== after && this.isConnected) this.#render();
    }

    #render() {
      const preset = this.getAttribute('preset');
      if (!Object.hasOwn(presets, preset)) {
        this.#view?.remove();
        return;
      }
      if (!this.#view) {
        this.#view = this.querySelector(':scope > .ml-skeleton-view') ?? this.ownerDocument.createElement('div');
        this.#view.className = 'ml-skeleton-view';
      }
      const rows = count(this, 'rows', 3, 20);
      const columns = count(this, 'columns', 3, 12);
      this.#view.dataset.preset = preset;
      if (preset === 'table') this.#view.style.setProperty('--ml-skeleton-columns', columns);
      else this.#view.style.removeProperty('--ml-skeleton-columns');
      this.#view.innerHTML = presets[preset](rows, columns);
      if (this.#view.parentElement !== this) this.append(this.#view);
    }
  }
  if (!customElements.get('ml-skeleton')) customElements.define('ml-skeleton', Skeleton);
})();
