function createIconMaterial(art, motion) {
  const palettes = {
    light: { light: '#f4faff', shade: '#23384f', pane: .20, lens: .27, alloy: .49 },
    warm: { light: '#fff0d6', shade: '#493628', pane: .23, lens: .30, alloy: .51 },
    dark: { light: '#e0f5ff', shade: '#152235', pane: .26, lens: .34, alloy: .53 },
  };
  const finishes = new Map();
  const faceSelector = '[fill^="var(--ml-icon-"]';
  function faceOf(shape) { return shape.getAttribute('fill').slice('var(--ml-icon-'.length).split(',')[0]; }
  for (const [name, symbol] of art) {
    finishes.set(name, new Set([...symbol.querySelectorAll(faceSelector)].map(faceOf)));
  }
  function label(name) {
    const faces = finishes.get(name);
    if (faces?.has('lens')) return '光学玻璃';
    if (faces?.has('alloy')) return '抛光棱面';
    return faces?.has('pane') ? '半透明玻璃面' : '玻璃描边';
  }

  const prefix = 'ml-icon-glass-' + Math.random().toString(36).slice(2, 10) + '-';
  let serial = 0;
  function node(parent, tag, attributes) {
    const element = parent.ownerDocument.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    parent.append(element);
    return element;
  }
  // Illuminate the existing ink. Compositing atop SourceGraphic preserves stroke coverage and transparency.
  function inkLight(svg, drawing, tier, theme, reference) {
    const id = prefix + ++serial;
    const defs = node(svg, 'defs', { 'data-ml-icon-light': tier, 'aria-hidden': 'true' });
    const filter = node(defs, 'filter', { id, filterUnits: 'userSpaceOnUse',
      x: '-16%', y: '-16%', width: '132%', height: '132%', 'color-interpolation-filters': 'sRGB' });
    const diffuse = node(filter, 'feDiffuseLighting', { in: 'SourceAlpha', surfaceScale: 0, 'lighting-color': 'white' });
    const lamp = node(diffuse, 'fePointLight', {});
    node(filter, 'feColorMatrix', { values: '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.8 0 0 0 -.8', result: 'intensity' });
    const tint = theme === 'warm' ? '#ebbe88' : theme === 'dark' ? '#a9d2f4' : '#93bde3';
    const [heightFactor, opacity] = { base: [.34, .37], low: [.54, .43], medium: [.85, .51] }[tier];
    node(filter, 'feFlood', { 'flood-color': tint, 'flood-opacity': opacity });
    node(filter, 'feComposite', { in2: 'intensity', operator: 'in' });
    node(filter, 'feComposite', { in2: 'SourceGraphic', operator: 'atop' });
    const original = drawing.getAttribute('filter');
    const applied = (original && original !== 'none' ? original + ' ' : '') + 'url(#' + id + ')';
    if (reference) defs.setAttribute('data-ml-icon-reference', original ?? '');
    drawing.setAttribute('filter', applied);
    let previous;
    return {
      light(x, y, width = 24, height = 24, left = 0, top = 0) {
        const position = [left + x * width, top + y * height, Math.min(width, height) * heightFactor];
        const key = position.join(' ');
        if (key === previous) return;
        previous = key;
        lamp.setAttribute('x', position[0]);
        lamp.setAttribute('y', position[1]);
        lamp.setAttribute('z', position[2]);
      },
      remove() {
        if (drawing.getAttribute('filter') === applied) {
          if (original === null) drawing.removeAttribute('filter');
          else drawing.setAttribute('filter', original);
        }
        defs.remove();
      },
    };
  }
  function surface(svg, drawing, name, theme, reference = false) {
    const colors = Object.hasOwn(palettes, theme) ? palettes[theme] : palettes.light;
    const id = prefix + ++serial;
    const url = key => 'url(#' + id + '-' + key + ')';
    const defs = svg.ownerDocument.createElementNS(ns, 'defs');
    defs.setAttribute('data-ml-icon-glass', '');
    defs.setAttribute('aria-hidden', 'true');
    const axes = [], lenses = [];
    const faces = finishes.get(name);
    const saved = new Map();
    const hadStyle = drawing.hasAttribute('style');
    const paints = new Map();
    function setAttribute(key, value) {
      saved.set(key, { previous: drawing.getAttribute(key), applied: value });
      drawing.setAttribute(key, value);
    }
    function gradient(kind, stops, radial = false) {
      const paint = node(defs, radial ? 'radialGradient' : 'linearGradient', { id: id + '-' + kind });
      if (radial) { paint.setAttribute('r', '.91'); lenses.push(paint); }
      else axes.push(paint);
      for (const [offset, color, opacity = 1] of stops) {
        node(paint, 'stop', { offset, 'stop-color': color, 'stop-opacity': opacity });
      }
    }
    // Gradients live with the glyph, so each instance inherits its own CSS color.
    const ink = 'currentColor', glint = colors.light;
    if (!reference) {
      gradient('ink', [[0, ink], [.36, ink], [.46, ink, .76], [.55, ink], [.86, ink], [1, ink, .90]]);
      // A horizontal or vertical stroke has an empty object bounding box. Use the 24-unit glyph space.
      axes[0].setAttribute('gradientUnits', 'userSpaceOnUse');
      if (faces.has('pane')) gradient('pane', [[0, ink, colors.pane * 1.7], [.29, glint, .42],
        [.47, ink, colors.pane * .55], [.73, ink, colors.pane], [1, ink, colors.pane * 1.75]]);
      if (faces.has('lens')) gradient('lens', [[0, glint, .96], [.10, glint, .72], [.29, ink, colors.lens],
        [.57, ink, colors.lens * .40], [.81, ink, colors.lens], [1, ink, .66]], true);
      if (faces.has('alloy')) gradient('alloy', [[0, ink, .72], [.27, ink, colors.alloy], [.43, glint, .80],
        [.54, ink, .24], [.78, ink, colors.alloy], [1, ink, .74]]);
      setAttribute('stroke', url('ink') + ' currentColor');
    }
    // External <use> trees inherit solid tints. Their bevel is computed from the rendered symbol.
    for (const face of faces) {
      const key = '--ml-icon-' + face;
      paints.set(key, [drawing.style.getPropertyValue(key), drawing.style.getPropertyPriority(key)]);
      drawing.style.setProperty(key, reference
        ? 'color-mix(in srgb, currentColor ' + Math.round(colors[face] * 100) + '%, transparent)' : url(face));
    }
    const filter = node(defs, 'filter', { id: id + '-edge', filterUnits: 'userSpaceOnUse',
      x: '-16%', y: '-16%', width: '132%', height: '132%', 'color-interpolation-filters': 'sRGB' });
    const blur = node(filter, 'feGaussianBlur', { in: 'SourceAlpha', result: 'height' });
    const back = node(filter, 'feOffset', { in: 'height', result: 'behind' });
    node(filter, 'feComposite', { in: 'SourceAlpha', in2: 'behind', operator: 'out', result: 'lip' });
    node(filter, 'feFlood', { 'flood-color': glint, 'flood-opacity': '.68', result: 'frost' });
    node(filter, 'feComposite', { in: 'frost', in2: 'lip', operator: 'in', result: 'rim' });
    const front = node(filter, 'feOffset', { in: 'height', result: 'ahead' });
    node(filter, 'feComposite', { in: 'SourceAlpha', in2: 'ahead', operator: 'out', result: 'backEdge' });
    node(filter, 'feFlood', { 'flood-color': colors.shade, 'flood-opacity': '.58', result: 'shadow' });
    node(filter, 'feComposite', { in: 'shadow', in2: 'backEdge', operator: 'in', result: 'depth' });
    const shine = node(filter, 'feSpecularLighting', { in: 'height', specularConstant: '.63',
      specularExponent: '16', 'lighting-color': glint, result: 'reflection' });
    const lamp = node(shine, 'fePointLight', {});
    node(filter, 'feComposite', { in: 'reflection', in2: 'SourceAlpha', operator: 'in', result: 'gloss' });
    const merge = node(filter, 'feMerge', {});
    for (const input of ['SourceGraphic', 'depth', 'rim', 'gloss']) node(merge, 'feMergeNode', { in: input });
    const existing = drawing.getAttribute('filter');
    if (reference) defs.setAttribute('data-ml-icon-reference', existing ?? '');
    setAttribute('filter', (existing && existing !== 'none' ? existing + ' ' : '') + url('edge'));

    let previous;
    // x and y locate the lamp in the glyph's viewport. Raw symbols can also use a pixel-sized viewport.
    function light(x, y, width = 24, height = 24, left = 0, top = 0) {
      const key = [x, y, width, height, left, top].join(' ');
      if (key === previous) return;
      previous = key;
      const unit = Math.min(width, height) / 24;
      const dx = .5 - x, dy = .5 - y;
      const vx = .26 + .62 * dx, vy = .48 + .42 * dy;
      const span = .55 / Math.hypot(vx, vy);
      for (const axis of axes) {
        const scale = axis.getAttribute('gradientUnits') === 'userSpaceOnUse' ? 24 : 1;
        for (const [attr, value] of [['x1', .5 - vx * span], ['y1', .5 - vy * span],
          ['x2', .5 + vx * span], ['y2', .5 + vy * span]]) {
          axis.setAttribute(attr, value * scale);
        }
      }
      for (const lens of lenses) {
        lens.setAttribute('cx', .38 + (x - .25) * .34);
        lens.setAttribute('cy', .31 + (y - .16) * .34);
        lens.setAttribute('fx', .29 + (x - .25) * .42);
        lens.setAttribute('fy', .22 + (y - .16) * .42);
      }
      blur.setAttribute('stdDeviation', .38 * unit);
      back.setAttribute('dx', dx * 1.12 * unit); back.setAttribute('dy', dy * 1.12 * unit);
      front.setAttribute('dx', -dx * .91 * unit); front.setAttribute('dy', -dy * .91 * unit);
      shine.setAttribute('surfaceScale', 1.35 * unit);
      lamp.setAttribute('x', left + x * width); lamp.setAttribute('y', top + y * height);
      lamp.setAttribute('z', 13 * unit);
    }
    function remove() {
      for (const [key, [value, priority]] of paints) {
        if (value) drawing.style.setProperty(key, value, priority);
        else drawing.style.removeProperty(key);
      }
      if (!hadStyle && !drawing.style.length) drawing.removeAttribute('style');
      for (const [attr, { previous, applied }] of saved) {
        if (drawing.getAttribute(attr) !== applied) continue;
        if (previous === null) drawing.removeAttribute(attr);
        else drawing.setAttribute(attr, previous);
      }
      defs.remove();
    }
    light(.21, .12);
    svg.append(defs);
    return { light, remove, url };
  }

  function forExport(svg, name, options) {
    if (options.material !== 'high') {
      svg.querySelectorAll('[data-ml-glass-face]').forEach(shape => shape.remove());
      svg.querySelectorAll(faceSelector).forEach(shape => shape.removeAttribute('fill'));
      return svg;
    }
    const drawing = node(svg, 'g', {});
    drawing.append(...[...svg.children].filter(child => child !== drawing));
    const glass = surface(svg, drawing, name, options.theme);
    // Write actual SVG paints into the exported paths so the file is independent of the component.
    for (const shape of drawing.querySelectorAll(faceSelector)) {
      shape.setAttribute('fill', glass.url(faceOf(shape)));
      shape.removeAttribute('data-ml-glass-face');
    }
    drawing.removeAttribute('style');
    svg.lastElementChild.removeAttribute('data-ml-icon-glass');
    return svg;
  }

  const contexts = new WeakMap(), entries = new WeakMap(), watched = new WeakSet(), shadowOf = new WeakMap();
  const { GlassScene } = globalThis[Symbol.for('material-lib.glass.v1')];
  function context(doc) {
    let ctx = contexts.get(doc);
    if (ctx) return ctx;
    const scene = GlassScene.forDocument(doc);
    const forced = doc.defaultView.matchMedia('(forced-colors: active)');
    ctx = { scene, forced, items: new Set(), dirty: true };
    ctx.wake = () => { ctx.dirty = true; scene.wake(); };
    ctx.resize = new ResizeObserver(() => scene.wake());
    ctx.paint = pointer => {
      const refresh = ctx.dirty;
      ctx.dirty = false;
      let follows = false;
      for (const item of ctx.items) {
        if (refresh || item.dirty) {
          item.dirty = false;
          let level, theme;
          for (let node = item.owner; node; node = iconParent(node)) {
            if (node.assignedSlot) watch(node.assignedSlot.getRootNode());
            level ??= node.getAttribute('data-ml-material');
            theme ??= node.getAttribute('data-ml-theme');
          }
          if (!level) {
            const style = getComputedStyle(item.owner);
            level = style.getPropertyValue('--ml-material-level').trim()
              || (style.getPropertyValue('--ml-optics').trim() === 'block' ? 'high' : 'base');
          }
          item.follows = !forced.matches && motion.allowed(item.owner);
          const tier = !forced.matches && (level === 'high' || (item.follows && ['base', 'low', 'medium'].includes(level))) ? level : null;
          if (item.glass && (tier !== item.tier || theme !== item.theme)) {
            item.glass.remove(); item.glass = null;
          }
          item.tier = tier;
          item.theme = theme;
        }
        if (!item.tier) continue;
        const box = item.svg.getBoundingClientRect();
        if (!box.width || !box.height) continue;
        follows ||= item.follows;
        let x = .21, y = .12;
        if (item.tier !== 'high') {
          if (!pointer || Math.hypot(Math.max(box.left - pointer.x, 0, pointer.x - box.right),
            Math.max(box.top - pointer.y, 0, pointer.y - box.bottom)) > Math.max(box.width, box.height) * 2) {
            if (item.glass) { item.glass.remove(); item.glass = null; }
            continue;
          }
          item.glass ??= inkLight(item.svg, item.drawing, item.tier, item.theme, item.reference);
          x = (pointer.x - box.left) / box.width;
          y = (pointer.y - box.top) / box.height;
        } else {
          item.glass ??= surface(item.svg, item.drawing, item.name, item.theme, item.reference);
        }
        if (item.tier === 'high' && item.follows && pointer) {
          const px = (pointer.x - box.left) / box.width, py = (pointer.y - box.top) / box.height;
          const distance = Math.hypot((px - .5) * box.width, (py - .5) * box.height);
          const reach = Math.max(85, Math.max(box.width, box.height) * 2.6);
          const near = Math.max(0, Math.min(1, 1.5 - distance / reach));
          x += (Math.max(-.25, Math.min(1.25, px)) - x) * near;
          y += (Math.max(-.25, Math.min(1.25, py)) - y) * near;
        }
        if (item.reference) {
          const use = item.drawing, vb = item.svg.viewBox.baseVal;
          item.glass.light(+x.toFixed(3), +y.toFixed(3), use.width.baseVal.value || vb?.width || item.svg.width.baseVal.value || box.width,
            use.height.baseVal.value || vb?.height || item.svg.height.baseVal.value || box.height, use.x.baseVal.value, use.y.baseVal.value);
        } else item.glass.light(+x.toFixed(3), +y.toFixed(3));
      }
      return follows;
    };
    scene.painters.add(ctx.paint);
    forced.addEventListener('change', ctx.wake);
    scene.media.addEventListener('change', ctx.wake);
    doc.addEventListener('visibilitychange', ctx.wake);
    contexts.set(doc, ctx);
    return ctx;
  }
  function detach(owner) {
    const item = entries.get(owner);
    if (!item) return;
    const { ctx } = item;
    item.glass?.remove();
    ctx.resize.unobserve(item.svg);
    ctx.items.delete(item);
    entries.delete(owner);
    if (!ctx.items.size) {
      ctx.scene.remove(ctx.paint);
      ctx.forced.removeEventListener('change', ctx.wake);
      ctx.scene.media.removeEventListener('change', ctx.wake);
      ctx.scene.doc.removeEventListener('visibilitychange', ctx.wake);
      ctx.resize.disconnect();
      contexts.delete(ctx.scene.doc);
    }
  }
  function attach(owner, svg, drawing, name) {
    const previous = entries.get(owner);
    if (previous?.name === name && previous?.drawing === drawing) return;
    detach(owner);
    if (!art.has(name) || !owner.isConnected) return;
    const ctx = context(owner.ownerDocument);
    const item = { ctx, owner, svg, drawing, name, reference: owner === drawing, dirty: true };
    entries.set(owner, item);
    ctx.items.add(item);
    ctx.resize.observe(svg);
    ctx.scene.wake();
  }
  const useSelector = 'svg > use:only-of-type';
  function clearCopiedSurface(use) {
    // A cloned <use> can arrive with the source instance's paint server and IDs.
    const svg = use.ownerSVGElement;
    for (const defs of svg?.querySelectorAll(':scope > defs[data-ml-icon-reference]') ?? []) {
      const ref = 'url(#' + defs.querySelector('filter')?.id + ')';
      if (!use.getAttribute('filter')?.includes(ref)) continue;
      const previous = defs.getAttribute('data-ml-icon-reference');
      if (previous) use.setAttribute('filter', previous);
      else use.removeAttribute('filter');
      if (defs.hasAttribute('data-ml-icon-glass')) {
        for (const face of ['pane', 'lens', 'alloy']) use.style.removeProperty('--ml-icon-' + face);
        if (!use.style.length) use.removeAttribute('style');
      }
      defs.remove();
    }
  }
  function scan(element, added) {
    if (!element.querySelectorAll) return;
    const visit = use => {
      if (added && !entries.has(use)) clearCopiedSurface(use);
      if (added && use.matches(useSelector)) attach(use, use.ownerSVGElement, use, symbolName(use));
      else detach(use);
    };
    if (element.localName === 'use') visit(element);
    element.querySelectorAll('svg > use').forEach(visit);
    if (element.namespaceURI === ns) return;
    function visitShadow(host) {
      const shadow = host.shadowRoot ?? shadowOf.get(host);
      if (!shadow) return;
      if (added && !watched.has(shadow)) watch(shadow);
      else scan(shadow, added);
    }
    if (element.nodeType === 1) visitShadow(element);
    for (const host of element.querySelectorAll('*')) if (host.namespaceURI !== ns) visitShadow(host);
  }
  function watch(root) {
    if (watched.has(root)) return;
    watched.add(root);
    if (root.host) shadowOf.set(root.host, root);
    const doc = root.ownerDocument ?? root;
    const wake = () => contexts.get(doc)?.wake();
    const observer = new MutationObserver(records => {
      let changed = false;
      for (const record of records) {
        if (record.type === 'childList') {
          if (record.target.localName === 'style' || [...record.addedNodes, ...record.removedNodes]
            .some(el => el.localName === 'style' || el.localName === 'link')) changed = true;
          for (const el of record.removedNodes) scan(el, false);
          for (const el of record.addedNodes) {
            scan(el, true);
            if (el.localName === 'symbol' || el.querySelector?.('symbol')) scan(root, true);
          }
          if (record.target.localName === 'svg' && [...record.addedNodes, ...record.removedNodes].some(n => n.localName === 'use')) {
            record.target.querySelectorAll(':scope > use').forEach(use => scan(use, true));
          }
        } else if (record.attributeName === 'href' && record.target.localName === 'use') scan(record.target, true);
        else changed = true;
      }
      if (changed) wake();
    });
    observer.observe(root, { subtree: true, childList: true, attributes: true,
      attributeFilter: ['data-ml-material', 'data-ml-motion', 'data-ml-theme', 'disabled', 'aria-disabled', 'aria-busy', 'hidden', 'inert', 'slot', 'name', 'href'] });
    root.addEventListener('slotchange', wake, true);
    root.addEventListener('load', event => { if (event.target.localName === 'link') wake(); }, true);
    scan(root, true);
  }
  watch(document);
  return { label, watch, attach, detach, forExport };
}
