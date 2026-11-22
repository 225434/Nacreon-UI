(() => {
  'use strict';
  if (customElements.get('ml-icon')) return;

  const ns = 'http://www.w3.org/2000/svg';
  const template = document.createElement('template');
  template.innerHTML = /* ICON_SHEET */ '';
  const art = new Map();
  const catalog = [];
  for (const group of template.content.querySelectorAll('defs[data-category]')) {
    for (const symbol of group.querySelectorAll('symbol')) {
      const name = symbol.id.slice(2);
      art.set(name, symbol);
      catalog.push(Object.freeze({ name, label: symbol.dataset.label, category: group.dataset.category,
        categoryLabel: group.dataset.label, keywords: symbol.dataset.keywords }));
    }
  }
  Object.freeze(catalog);
  const weights = new Map([['light', '1.35'], ['regular', '1.75'], ['bold', '2.35']]);
  function iconParent(node) { return node.assignedSlot ?? node.parentElement ?? node.getRootNode().host; }
  function symbolName(use) {
    const ref = use.getAttribute('href') ?? use.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ?? '';
    const match = /^(?:[^#]*\/)?icons\.svg(?:\?[^#]*)?#i-([\w-]+)$/.exec(ref);
    if (match) return match[1];
    if (!ref.startsWith('#i-')) return;
    const symbol = use.getRootNode().getElementById?.(ref.slice(1));
    if (symbol?.localName === 'symbol' && symbol.parentElement?.hasAttribute('data-category')) return ref.slice(3);
  }
  /* ICON_MOTION */
  /* ICON_MATERIAL */
  const motion = createIconMotion(art);
  const material = createIconMaterial(art, motion);

  class MaterialIcon extends HTMLElement {
    static get observedAttributes() { return ['name', 'size', 'weight', 'label']; }
    static get catalog() { return catalog; }
    static materialLabel(name) { return material.label(name); }

    static createSVG(name, options = {}, doc = document) {
      const svg = MaterialIcon.#glyph(name, options, doc);
      return svg && material.forExport(svg, name, options);
    }
    static #glyph(name, options, doc) {
      const symbol = art.get(name);
      if (!symbol) return null;
      const pixels = Number(options.size);
      const size = Number.isFinite(pixels) && pixels > 0 ? String(pixels) : '1em';
      const svg = doc.createElementNS(ns, 'svg');
      svg.setAttribute('viewBox', symbol.getAttribute('viewBox'));
      svg.setAttribute('width', size);
      svg.setAttribute('height', size);
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', weights.get(options.weight) ?? weights.get('regular'));
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      svg.setAttribute('focusable', 'false');
      if (options.label?.trim()) {
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', options.label.trim());
      } else {
        svg.setAttribute('aria-hidden', 'true');
      }
      for (const shape of symbol.children) svg.append(doc.importNode(shape, true));
      return svg;
    }

    connectedCallback() {
      motion.listen(this.getRootNode());
      material.watch(this.getRootNode());
      this.#render();
    }
    disconnectedCallback() { motion.stop(this); material.detach(this); }
    attributeChangedCallback(name, previous, value) {
      if (previous !== value && this.isConnected) this.#render();
    }
    playMotion() { return motion.play(this, true); }
    #render() {
      motion.stop(this);
      material.detach(this);
      const name = this.getAttribute('name');
      const svg = MaterialIcon.#glyph(name, {
        size: this.getAttribute('size'), weight: this.getAttribute('weight'), label: this.getAttribute('label'),
      }, this.ownerDocument);
      if (svg) {
        motion.prepare(svg, name);
        svg.style.verticalAlign = '-.125em';
        this.replaceChildren(svg);
        material.attach(this, svg, svg.firstElementChild, name);
      } else {
        this.replaceChildren();
      }
    }
  }
  customElements.define('ml-icon', MaterialIcon);
})();
