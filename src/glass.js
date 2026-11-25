(() => {
  'use strict';

  const key = Symbol.for('material-lib.glass.v1');
  if (globalThis[key]?.version >= 15) return;
  const previousScene = globalThis[key]?.GlassScene;
  const motionFrames = globalThis[Symbol.for('material-lib.motion-frames.v1')];
  const { optics } = globalThis[Symbol.for('material-lib.glass-shader.v1')];

  const waveDuration = 620;
  const lightReturnDuration = 240;
  const defaultLight = Object.freeze({ mode: 'pointer', strength: 1 });
  let nextGlassId = 0;
  const mapStores = new WeakMap();

  // Physical corners in clockwise order. CSS scales all radii together when adjacent arcs overlap.
  function fitCorners(x, y, width, height) {
    const fit = (side, sum) => sum > 0 ? side / sum : 1;
    const scale = Math.min(1, fit(width, x[0] + x[1]), fit(width, x[3] + x[2]),
      fit(height, y[0] + y[3]), fit(height, y[1] + y[2]));
    return { x: x.map((r, i) => y[i] > 0 ? r * scale : 0), y: y.map((r, i) => x[i] > 0 ? r * scale : 0) };
  }

  function usedCorners(layer, values, width, height) {
    const x = [], y = [];
    let measure;
    for (const value of values) {
      const simple = /^(\d*\.?\d+)(px|%)(?: (\d*\.?\d+)(px|%))?$/.exec(value);
      if (simple) {
        x.push(Number(simple[1]) * (simple[2] === '%' ? width / 100 : 1));
        y.push(Number(simple[3] ?? simple[1]) * ((simple[4] ?? simple[2]) === '%' ? height / 100 : 1));
      } else {
        // Let layout resolve mixed expressions such as calc(10% + 2px) against each axis.
        if (!measure) {
          measure = layer.ownerDocument.createElement('span');
          measure.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;margin:0;border:0;padding:0;min-width:0;min-height:0;max-width:none;max-height:none';
          layer.append(measure);
        }
        let depth = 0, split = 0;
        for (; split < value.length; split++) {
          if (value[split] === '(') depth++;
          else if (value[split] === ')') depth--;
          else if (value[split] === ' ' && !depth) break;
        }
        measure.style.width = value.slice(0, split);
        measure.style.height = value.slice(split).trim() || measure.style.width;
        const used = layer.ownerDocument.defaultView.getComputedStyle(measure);
        x.push(parseFloat(used.width)); y.push(parseFloat(used.height));
      }
    }
    measure?.remove();
    return fitCorners(x, y, width, height);
  }

  function outlinePath(width, height, corners, inset = 0) {
    const start = Math.min(inset, width / 2, height / 2), right = width - start, bottom = height - start;
    const inner = r => Math.max(0, r - start);
    const {x, y} = start ? fitCorners(corners.x.map(inner), corners.y.map(inner), right - start, bottom - start) : corners;
    const arc = (i, endX, endY) => `A${x[i]} ${y[i]} 0 0 1 ${endX} ${endY}`;
    return [`M${start + x[0]} ${start}`,
      `H${right - x[1]}`, arc(1, right, start + y[1]),
      `V${bottom - y[2]}`, arc(2, right - x[2], bottom),
      `H${start + x[3]}`, arc(3, start, bottom - y[3]),
      `V${start + y[0]}`, arc(0, start + x[0], start), 'Z'].join(' ');
  }

  // Start with the rectangle, then cut its four quarter ellipses. This also handles
  // a single large corner extending past the center. The shader uses the same contours.
  function outlineAt(dx, dy, halfW, halfH, corners, out, bevel = 0) {
    const qx = Math.abs(dx) - halfW, qy = Math.abs(dy) - halfH;
    const ox = Math.max(qx, 0), oy = Math.max(qy, 0), outside = Math.hypot(ox, oy);
    const boxDistance = Math.max(qx, qy);
    out.distance = outside + Math.min(boxDistance, 0);
    out.nx = Math.sign(dx) * (outside ? ox / outside : Number(qx > qy));
    out.ny = Math.sign(dy) * (outside ? oy / outside : Number(qy >= qx));
    for (let i = 0; i < 4; i++) {
      const sx = i === 1 || i === 2 ? 1 : -1, sy = i < 2 ? -1 : 1;
      const rx = corners.x[i], ry = corners.y[i];
      const a = rx - halfW + sx * dx, b = ry - halfH + sy * dy;
      if (a <= 0 || b <= 0 || !rx || !ry) continue;
      const u = a / rx, v = b / ry, radial = Math.hypot(u, v);
      const gx = u / rx, gy = v / ry, length = Math.hypot(gx, gy);
      const distance = (radial - 1) * radial / length;
      if (distance > out.distance) {
        out.distance = distance;
        out.nx = sx * gx / length; out.ny = sy * gy / length;
      }
    }
    // Match the shader's interior bevel when baking the native backdrop displacement.
    const arcOffset = out.distance - boxDistance;
    const gap = arcOffset > 0 ? arcOffset : Math.abs(qx - qy);
    const reach = Math.min(-optics.normalBlend * out.distance, bevel);
    if (gap >= reach) return out;
    const sx = arcOffset > 0 ? out.nx : dx, sy = arcOffset > 0 ? out.ny : dy;
    const corner = sy < 0 ? (sx < 0 ? 0 : 1) : (sx < 0 ? 3 : 2);
    const blend = Math.min(reach, bevel - Math.min(corners.x[corner], corners.y[corner]));
    if (gap < blend) {
      const wx = Math.max(0, Math.min(1, .5 + .5 * (qx - qy) / blend));
      const t = Math.max(0, arcOffset / blend), arcWeight = t * t * (3 - 2 * t);
      const nx = (1 - arcWeight) * Math.sign(dx) * wx + arcWeight * out.nx;
      const ny = (1 - arcWeight) * Math.sign(dy) * (1 - wx) + arcWeight * out.ny;
      const length = Math.sqrt(Math.max(nx * nx + ny * ny, 1e-8));
      out.nx = nx / length;
      out.ny = ny / length;
    }
    return out;
  }

  // R/G carry the entire ray displacement; blue carries the front surface height.
  // Work in optical radii so similar-sized controls can share a map at each resolution.
  function normalMapShape(width, height, corners, dpr) {
    const shortSide = Math.min(width, height);
    const aspectX = Math.round(width / shortSide * 16) / 16;
    const aspectY = Math.round(height / shortSide * 16) / 16;
    const relative = r => Math.round(r / shortSide * 32) / 32;
    const roundX = corners.x.map(relative), roundY = corners.y.map(relative);
    const relativeRadius = Math.max(.001, Math.round(Math.min(1, 2 * optics.maxRadius / shortSide) * 1000) / 1000);
    const resolution = Math.max(64, Math.min(512, 2 ** Math.ceil(Math.log2(shortSide * dpr))));
    const key = [aspectX, aspectY, roundX, roundY, relativeRadius, resolution].join('/');
    const w = Math.min(1536, Math.round(resolution * aspectX));
    const h = Math.min(1536, Math.round(resolution * aspectY));
    return { key, w, h, aspectX, aspectY, relativeRadius, roundX, roundY };
  }

  function drawNormalMap(canvas, shape) {
    const { w, h, aspectX, aspectY, relativeRadius, roundX, roundY } = shape;
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext('2d');
    const pixels = context.createImageData(w, h), data = pixels.data;
    const halfW = aspectX / relativeRadius, halfH = aspectY / relativeRadius;
    const mapRadius = r => 2 * r / relativeRadius;
    const mapCorners = { x: roundX.map(mapRadius), y: roundY.map(mapRadius) };
    const sample = {}, eta = 1 / optics.index;
    // Outside the corner boxes the outline is rectangular. Two bevel widths also
    // cover the normal blend wherever its slope contributes to the displacement.
    const cornerBandX = Math.max(2 * optics.rim, ...mapCorners.x);
    const cornerBandY = Math.max(2 * optics.rim, ...mapCorners.y);
    // The short axis has a power-of-two resolution, so opposite texel centers
    // are exact negatives. Only reflect when the two corner pairs also match.
    const shortX = w <= h;
    const symmetric = [roundX, roundY].every(r => shortX
      ? r[0] === r[1] && r[3] === r[2] : r[0] === r[3] && r[1] === r[2]);
    const mirrorX = symmetric && shortX;
    const rows = symmetric && !shortX ? h / 2 : h;
    const cols = mirrorX ? w / 2 : w;
    const columns = Array.from({ length: cols }, (_, x) => {
      const u = 2 * (x + .5) / w - 1, dx = u * halfW;
      return { u, dx, archX: 1 - u * u, insetX: halfW - Math.abs(dx) };
    });
    for (let y = 0; y < rows; y++) {
      const v = 2 * (y + .5) / h - 1, dy = v * halfH, archY = 1 - v * v;
      const insetY = halfH - Math.abs(dy);
      let opposite = 4 * (mirrorX ? (y + 1) * w - 1 : (h - 1 - y) * w);
      for (let x = 0, i = y * w * 4; x < cols; x++, i += 4) {
        const { u, dx, archX, insetX } = columns[x];
        let depth = Math.min(insetX, insetY);
        let nx = insetX < insetY ? Math.sign(dx) : 0, ny = insetY <= insetX ? Math.sign(dy) : 0;
        if (insetX < cornerBandX && insetY < cornerBandY) {
          outlineAt(dx, dy, halfW, halfH, mapCorners, sample, optics.rim);
          depth = Math.max(0, -sample.distance);
          nx = sample.nx; ny = sample.ny;
        }
        const edge = Math.max(0, 1 - depth / optics.rim);
        const arc = Math.sqrt(1 - edge * edge);
        const crown = optics.base + optics.crown * archX * archY;
        const frontHeight = arc * crown;
        const rimSlope = crown / optics.rim * edge / Math.max(.15, arc);
        const gx = 2 * optics.crown * arc * u * archY / halfW + nx * rimSlope;
        const gy = 2 * optics.crown * arc * v * archX / halfH + ny * rimSlope;
        // Snell refraction of a perpendicular viewing ray, followed by the flat rear interface.
        const nz = 1 / Math.sqrt(1 + gx * gx + gy * gy);
        const bend = (eta * nz - Math.sqrt(1 - eta * eta * (1 - nz * nz))) * nz;
        const rayX = bend * gx, rayY = bend * gy;
        const rayLength2 = rayX * rayX + rayY * rayY;
        const exitCos2 = 1 - optics.index ** 2 * rayLength2;
        const t = Math.max(0, Math.min(1, exitCos2 / .16));
        const escape = t * t * (3 - 2 * t);
        let travel = optics.chord * frontHeight / (eta - bend)
          + optics.index * optics.clearance * arc * escape / Math.sqrt(Math.max(.16, exitCos2));
        // Ease the rays near the rim so the lens magnifies evenly instead of smearing.
        travel /= 1 + Math.sqrt(rayLength2) * travel / 1.35;
        const shiftX = rayX * travel / optics.mapRange, shiftY = rayY * travel / optics.mapRange;
        data[i] = 255 * (.5 + shiftX);
        data[i + 1] = 255 * (.5 + shiftY);
        data[i + 2] = 255 * frontHeight / (optics.base + optics.crown);
        data[i + 3] = 255;
        if (symmetric) {
          // Reverse the ray before 8-bit rounding, including at zero displacement.
          data[opposite] = mirrorX ? 255 * (.5 - shiftX) : data[i];
          data[opposite + 1] = mirrorX ? data[i + 1] : 255 * (.5 - shiftY);
          data[opposite + 2] = data[i + 2];
          data[opposite + 3] = 255;
          opposite += mirrorX ? -4 : 4;
        }
      }
    }
    context.putImageData(pixels, 0, 0);
  }

  // Embedded with standalone components so an offline page needs no extra URL.
  function normalMapWorker() {
    self.onmessage = async ({ data }) => {
      try {
        const canvas = new OffscreenCanvas(1, 1);
        drawNormalMap(canvas, data.shape);
        const png = await canvas.convertToBlob({ type: 'image/png' });
        self.postMessage(new FileReaderSync().readAsDataURL(png));
      } catch {
        self.postMessage(null);
      }
    };
  }

  class NormalMaps {
    static forDocument(doc) {
      if (!mapStores.has(doc)) mapStores.set(doc, new NormalMaps(doc));
      return mapStores.get(doc);
    }

    constructor(doc) {
      this.doc = doc;
      this.cache = new Map();
      this.pending = new Map();
      this.workers = [];
      const win = doc.defaultView;
      this.disabled = !win.Worker || !win.OffscreenCanvas?.prototype.convertToBlob;
      this.limit = win.navigator.hardwareConcurrency > 2 ? 2 : 1;
    }

    remember(key, url) {
      if (!this.cache.has(key) && this.cache.size >= 96) this.cache.delete(this.cache.keys().next().value);
      this.cache.set(key, url);
      return url;
    }

    bake(shape) {
      const canvas = this.doc.createElement('canvas');
      drawNormalMap(canvas, shape);
      return this.remember(shape.key, canvas.toDataURL());
    }

    get(shape, ready) {
      const cached = this.cache.get(shape.key);
      if (cached) return cached;
      if (!ready || this.disabled || shape.w * shape.h < 262144) return this.bake(shape);
      let task = this.pending.get(shape.key);
      if (!task) {
        task = { shape, listeners: new Set(), running: false };
        this.pending.set(shape.key, task);
      }
      task.listeners.add(ready);
      this.dispatch();
      return () => {
        task.listeners.delete(ready);
        if (!task.running && !task.listeners.size && this.pending.get(shape.key) === task) this.pending.delete(shape.key);
      };
    }

    makeWorker() {
      const win = this.doc.defaultView;
      if (!this.workerURL) {
        const source = ['const optics = ' + JSON.stringify(optics) + ';', outlineAt, drawNormalMap,
          '(' + normalMapWorker + ')()'].join('\n');
        this.workerURL = win.URL.createObjectURL(new win.Blob([source], { type: 'text/javascript' }));
      }
      const slot = { worker: new win.Worker(this.workerURL), task: null };
      slot.worker.onmessage = ({ data }) => {
        if (!slot.task) return;
        if (typeof data !== 'string') { this.fallback(); return; }
        const { shape, listeners } = slot.task;
        slot.task = null;
        this.pending.delete(shape.key);
        this.remember(shape.key, data);
        for (const ready of listeners) ready(data);
        listeners.clear();
        this.dispatch();
      };
      slot.worker.onerror = event => { event.preventDefault(); this.fallback(); };
      slot.worker.onmessageerror = () => this.fallback();
      this.workers.push(slot);
      return slot;
    }

    dispatch() {
      const win = this.doc.defaultView;
      win.clearTimeout(this.idle);
      try {
        for (const task of this.pending.values()) {
          if (task.running) continue;
          let slot = this.workers.find(worker => !worker.task);
          if (!slot && this.workers.length < this.limit) slot = this.makeWorker();
          if (!slot) return;
          slot.task = task;
          task.running = true;
          slot.worker.postMessage({ type: 'nacreon-normal-map', shape: task.shape });
        }
      } catch { this.fallback(); return; }
      if (!this.pending.size) this.idle = win.setTimeout(() => this.close(), 30000);
    }

    close() {
      const win = this.doc.defaultView;
      win.clearTimeout(this.idle);
      for (const slot of this.workers) {
        slot.task = null;
        slot.worker.onmessage = slot.worker.onerror = slot.worker.onmessageerror = null;
        slot.worker.terminate();
      }
      this.workers.length = 0;
      if (this.workerURL) win.URL.revokeObjectURL(this.workerURL);
      this.workerURL = null;
    }

    fallback() {
      this.close();
      this.disabled = true;
      for (const { shape, listeners } of this.pending.values()) {
        if (!listeners.size) continue;
        const url = this.cache.get(shape.key) || this.bake(shape);
        for (const ready of listeners) ready(url);
        listeners.clear();
      }
      this.pending.clear();
    }
  }

  function normalizedRgb(value, fallback) {
    // color-mix(in srgb, ...) serializes in 0–1 units. Legacy lamp tokens use 0–255 channels.
    const srgb = value.startsWith('color(srgb ');
    const components = srgb ? value.slice(11, -1) : value.replace(/^rgba?\(|\)$/g, '');
    const channels = components.split('/')[0].trim().split(/[\s,]+/).slice(0, 3).map(Number);
    const maximum = srgb ? 1 : 255;
    return channels.length === 3 && channels.every(Number.isFinite)
      ? channels.map(channel => Math.max(0, Math.min(maximum, channel)) / maximum) : fallback;
  }

  class PointerLightSurface {
    constructor(surface, tier) {
      this.tier = tier;
      this.light = defaultLight;
      this.layer = surface.ownerDocument.createElement('span');
      this.layer.className = 'ml-optical';
      this.layer.dataset.mlRenderer = 'css';
      this.layer.dataset.mlLight = tier;
      this.layer.setAttribute('aria-hidden', 'true');
      surface.prepend(this.layer);
    }

    remove() { this.layer.remove(); }

    #unlight() {
      if (!this.state) return;
      this.state = null;
      this.layer.removeAttribute('data-ml-lit');
    }

    paint(pointer, pulse, now) {
      const el = this.layer;
      const fixed = this.light.mode === 'fixed';
      if (!fixed && !pointer) return this.#unlight();
      if (!motionFrames.due(this, this.light.mediumMotion, now, this.scene)) return;
      const box = el.getBoundingClientRect(), win = el.ownerDocument.defaultView;
      if (!box.width || !box.height || box.right <= 0 || box.bottom <= 0 || box.left >= win.innerWidth || box.top >= win.innerHeight) {
        return this.#unlight();
      }
      const width = el.clientWidth, height = el.clientHeight;
      const x = fixed ? width * .24 : (pointer.x - box.left) * width / box.width;
      const y = fixed ? height * .12 : (pointer.y - box.top) * height / box.height;
      const dx = x - width / 2, dy = y - height / 2;
      const reach = Math.max(32, Math.min(150, Math.min(width, height) * 1.1));
      const outside = Math.hypot(Math.max(0, Math.abs(dx) - width / 2), Math.max(0, Math.abs(dy) - height / 2));
      const falloff = 1 - outside / (reach * 1.75);
      if (falloff <= 0) return this.#unlight();
      const strength = this.light.strength * (fixed ? 1 : pointer.weight ?? 1);
      const state = [width, height, x.toFixed(1), y.toFixed(1), strength].join('/');
      if (state === this.state) return;
      this.state = state;
      el.style.filter = strength < 1 ? 'opacity(' + strength + ')' : '';
      el.style.setProperty('--ml-light-x', x.toFixed(1) + 'px');
      el.style.setProperty('--ml-light-y', y.toFixed(1) + 'px');
      el.style.setProperty('--ml-light-reach', reach.toFixed(1) + 'px');
      if (this.tier === 'medium') {
        const power = falloff * falloff * (3 - 2 * falloff);
        const cast = reach * .055 * power / Math.hypot(dx, dy, reach * .7);
        el.style.setProperty('--ml-light-cast-x', (-dx * cast).toFixed(2) + 'px');
        el.style.setProperty('--ml-light-cast-y', (-dy * cast).toFixed(2) + 'px');
        el.style.setProperty('--ml-light-shadow-alpha', (.19 * power).toFixed(3));
      }
      if (!el.hasAttribute('data-ml-lit')) el.setAttribute('data-ml-lit', '');
    }
  }

  class GlassSurface {
    static lighting(style, reduced, enabled = true, source = '') {
      const mode = source || style.getPropertyValue('--ml-light-source').trim() || 'pointer';
      const mediumMotion = !reduced && style.getPropertyValue('--ml-motion-level').trim() === 'medium';
      const raw = parseFloat(style.getPropertyValue('--ml-light-intensity'));
      const strength = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 1;
      if (!enabled || !strength || mode === 'none') return { mode: 'none', strength: 0, mediumMotion };
      return { mode: mode === 'pointer' && !reduced ? 'pointer' : 'fixed', strength, mediumMotion };
    }

    static lightingTier(style, light) {
      const level = style.getPropertyValue('--ml-material-level').trim();
      if (level === 'none') return null;
      if (style.getPropertyValue('--ml-optics').trim() === 'block') return 'high';
      // Older standalone components pass their pointer-following flag here.
      const lit = typeof light === 'boolean' ? light : light.mode !== 'none';
      return lit && ['base', 'low', 'medium'].includes(level) ? level : null;
    }

    static forTier(current, surface, lens, tier, light = defaultLight) {
      if (current?.tier !== tier || current.layer.parentElement !== surface) {
        current?.remove();
        motionFrames.watch(surface.getRootNode());
        current = tier === 'high' ? new GlassSurface(surface, lens) : new PointerLightSurface(surface, tier);
        current.scene = (previousScene || GlassScene).forDocument(surface.ownerDocument);
      }
      current.light = light;
      return current;
    }

    constructor(surface, lens) {
      this.tier = 'high';
      this.light = defaultLight;
      this.surface = surface;
      this.lens = lens;
      const id = 'ml-glass-v15-' + ++nextGlassId;
      this.layer = document.createElement('span');
      this.layer.className = 'ml-optical';
      this.layer.setAttribute('aria-hidden', 'true');
      this.layer.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" focusable="false" style="color:rgb(var(--ml-glass-lamp-rgb, 243 249 255))">
        <defs>
          <filter id="${id}-bend" x="0%" y="0%" width="100%" height="100%" color-interpolation-filters="sRGB">
            <feImage preserveAspectRatio="none" result="normals"/>
            <feDisplacementMap in="SourceGraphic" in2="normals" xChannelSelector="R" yChannelSelector="G"/>
          </filter>
          <filter id="${id}-light" x="0%" y="0%" width="100%" height="100%" color-interpolation-filters="sRGB">
            <feImage preserveAspectRatio="none" result="surface"/>
            <feColorMatrix in="surface" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 1 0 0" result="height"/>
            <feGaussianBlur in="height" result="dome"/>
            <feDiffuseLighting in="dome" lighting-color="white" result="illumination"><fePointLight/></feDiffuseLighting>
            <feComponentTransfer in="height" result="density"><feFuncA type="table" tableValues="0 .085 .16 .235 .31"/></feComponentTransfer>
            <feFlood flood-color="var(--ml-optical-body, rgb(var(--ml-glass-body-rgb, 138 192 217)))" result="bodyTint"/>
            <feComposite in="bodyTint" in2="density" operator="in" result="body"/>
            <feComposite in="body" in2="illumination" operator="arithmetic" k1=".10" k2=".90" result="litBody"/>
            <feSpecularLighting in="dome" specularExponent="30" lighting-color="currentColor" result="shine">
              <fePointLight/>
            </feSpecularLighting>
            <feGaussianBlur in="shine" result="polished"/>
            <feMerge result="illuminated"><feMergeNode in="litBody"/><feMergeNode in="polished"/></feMerge>
            <feComposite in="body" in2="SourceAlpha" operator="in"/>
          </filter>
          <radialGradient id="${id}-glint" gradientUnits="userSpaceOnUse">
            <stop stop-color="currentColor"/><stop offset=".40" stop-color="currentColor" stop-opacity=".62"/>
            <stop offset="1" stop-color="currentColor" stop-opacity="0"/>
          </radialGradient>
          <radialGradient id="${id}-caustic" gradientUnits="userSpaceOnUse">
            <stop stop-color="currentColor"/><stop offset=".32" stop-color="currentColor" stop-opacity=".74"/>
            <stop offset="1" stop-color="currentColor" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <path fill="url(#${id}-glint)"/>
        <path filter="url(#${id}-light)"/>
        <g filter="url(#${id}-bend)">
          <path fill="none" stroke="url(#${id}-caustic)"/>
          <circle fill="none" stroke="#fff" opacity="0"/>
        </g>
        <path fill="url(#${id}-caustic)"/>
        <path fill="none" stroke="var(--ml-color-control-border, #788595)"/>
        <path fill="none" stroke="url(#${id}-glint)"/>
      </svg>`;
      const svg = this.layer.firstElementChild;
      this.maps = svg.querySelectorAll('feImage');
      this.displacement = svg.querySelector('feDisplacementMap');
      [this.blur, this.polish] = svg.querySelectorAll('feGaussianBlur');
      this.reflection = svg.querySelector('feSpecularLighting');
      this.diffuse = svg.querySelector('feDiffuseLighting');
      this.lamps = svg.querySelectorAll('fePointLight');
      [this.glint, this.caustic] = svg.querySelectorAll('radialGradient');
      [this.face, this.dome, this.causticFace, this.interiorLight, this.darkRim, this.litRim] = svg.querySelectorAll('path');
      this.bodyDensity = svg.querySelector('feFuncA');
      this.bodyComposite = svg.querySelector('filter[id$="-light"] > feComposite:last-child');
      this.wave = svg.querySelector('circle');
      this.surface.style.setProperty('--ml-bend', 'url("#' + id + '-bend")');
      this.surface.classList.add('ml-refractive');
      this.surface.prepend(this.layer);
    }

    remove() {
      this.cancelMap?.();
      this.layer.remove();
      this.surface.classList.remove('ml-refractive');
      this.surface.style.removeProperty('--ml-bend');
    }

    paint(pointer, pulse, now, backdrop = null, version = 0, deferMap = false) {
      if (!motionFrames.due(this, this.light.mediumMotion, now, this.scene)) return;
      const box = this.layer.getBoundingClientRect();
      const doc = this.surface.ownerDocument;
      const win = doc.defaultView;
      if (!box.width || !box.height || box.right <= 0 || box.bottom <= 0
        || box.left >= win.innerWidth || box.top >= win.innerHeight) return;
      // SVG coordinates are local CSS pixels, including under a transformed host.
      const width = this.layer.clientWidth, height = this.layer.clientHeight;
      if (!width || !height) return;
      const sx = width / box.width, sy = height / box.height;
      const opticalStyle = win.getComputedStyle(this.layer);
      const radiusStyles = [opticalStyle.borderTopLeftRadius, opticalStyle.borderTopRightRadius,
        opticalStyle.borderBottomRightRadius, opticalStyle.borderBottomLeftRadius];
      const thickness = Math.min(width, height);
      const lampRGB = opticalStyle.getPropertyValue('--ml-glass-lamp-rgb').trim() || '243 249 255';
      const bodyRGB = opticalStyle.getPropertyValue('--ml-optical-body') ? opticalStyle.color
        : opticalStyle.getPropertyValue('--ml-glass-body-rgb').trim() || '234 244 248';
      if (lampRGB !== this.lampRGB) {
        this.lampRGB = lampRGB;
        this.tint = normalizedRgb(lampRGB, [243 / 255, 249 / 255, 1]);
      }
      if (bodyRGB !== this.bodyRGB) {
        this.bodyRGB = bodyRGB;
        this.bodyTint = normalizedRgb(bodyRGB, [234 / 255, 244 / 255, 248 / 255]);
      }
      const gain = parseFloat(opticalStyle.getPropertyValue('--ml-glass-face-gain'));
      const faceGain = Number.isFinite(gain) ? Math.max(0, Math.min(1, gain)) : .135;
      const densityReading = parseFloat(opticalStyle.getPropertyValue('--ml-glass-density'));
      const density = Number.isFinite(densityReading) ? Math.max(0, Math.min(2.5, densityReading)) : 1;
      const transmissionReading = parseFloat(opticalStyle.getPropertyValue('--ml-material-transparency'));
      const transmission = Number.isFinite(transmissionReading) ? Math.max(0, Math.min(1, transmissionReading / 100)) : 1;
      const strength = this.light.strength;
      if (this.light.mode !== 'pointer') pointer = null;
      const dpr = win.devicePixelRatio || 1;
      const opticalRadius = Math.min(thickness / 2, optics.maxRadius);
      const renderer = globalThis[Symbol.for('material-lib.glass-shader.v1')].forDocument(doc, () => {
        // An older standalone component can already own the document's scene.
        const scene = previousScene ? previousScene.forDocument(doc) : scenes.get(doc);
        if (scene?.painters.size) scene.wake();
        else scene?.remove();
      });
      const shape = [width, height, radiusStyles, dpr].join('/');
      if (shape !== this.shape) {
        this.cancelMap?.();
        this.cancelMap = null;
        this.shape = shape;
        this.corners = usedCorners(this.layer, radiusStyles, width, height);
        const install = url => {
          this.mapPending = false;
          if (this.maps[0].getAttribute('href') !== url) {
            for (const map of this.maps) map.setAttribute('href', url);
          }
        };
        this.mapPending = true;
        const store = NormalMaps.forDocument(doc);
        const result = store.get(normalMapShape(width, height, this.corners, dpr), deferMap && this.scene && renderer.program ? url => {
          if (this.shape !== shape || !this.layer.parentNode) return;
          install(url);
          this.cancelMap = null;
          this.state = null;
          this.scene.wake();
        } : null);
        if (typeof result === 'string') install(result);
        else if (this.mapPending) {
          this.cancelMap = result;
          // A resize can leave the previous shape's PNG installed during the new bake.
          for (const map of this.maps) map.removeAttribute('href');
        }
        const outline = outlinePath(width, height, this.corners);
        for (const face of [this.face, this.dome, this.interiorLight]) face.setAttribute('d', outline);
        const rimWidth = Math.max(1.15, Math.min(2.6, thickness * .032));
        this.litRim.setAttribute('d', outlinePath(width, height, this.corners, rimWidth / 2));
        this.litRim.setAttribute('stroke-width', rimWidth);
        this.darkRim.setAttribute('d', outlinePath(width, height, this.corners, rimWidth * .9));
        this.darkRim.setAttribute('stroke-width', rimWidth * 1.9);
        const inset = Math.max(1.5, Math.min(17, thickness * (this.lens ? .116 : .109)));
        const causticFace = this.causticFace;
        causticFace.setAttribute('d', outlinePath(width, height, this.corners, inset));
        causticFace.setAttribute('stroke-width', Math.max(.85, height * .017));
        this.blur.setAttribute('stdDeviation', Math.max(.7, height * .016));
        this.polish.setAttribute('stdDeviation', Math.max(.6, height * .018));
        this.layer.style.setProperty('--ml-rim', Math.max(1, Math.min(2.6, height * .023)) + 'px');
        this.wave.setAttribute('stroke-width', Math.max(1.3, height * .03));
      }
      const elevation = Math.max(30, Math.min(116, thickness * .76));
      const restX = Math.min(width * .24, this.corners.x[0] + elevation * .6);
      const restY = -Math.min(height * .28, elevation * .55);
      const weight = pointer?.weight ?? 1;
      const x = pointer ? restX + ((pointer.x - box.left) * sx - restX) * weight : restX;
      const y = pointer ? restY + ((pointer.y - box.top) * sy - restY) * weight : restY;
      const fraction = pulse ? Math.min(1, Math.max(0, (now - pulse.start) / waveDuration)) : 1;
      let sample = null;
      if (renderer.program && backdrop?.width && backdrop.height) {
        const b = backdrop.getBoundingClientRect();
        if (b.width && b.height) sample = { canvas: backdrop, version, rect: [
          (box.left - b.left) / b.width, (box.top - b.top) / b.height, box.width / b.width, box.height / b.height,
        ] };
      }
      // The last active frame must stay distinct from the exact resting state.
      const state = [shape, x.toFixed(1), y.toFixed(1), fraction, renderer.generation,
        lampRGB, bodyRGB, faceGain, density, strength, transmission, version, sample?.rect.map(n => n.toFixed(5))].join('/');
      if (state === this.state && this.lastBackdrop === backdrop) return;
      this.state = state;
      this.lastBackdrop = backdrop;
      const dx = x - width / 2, dy = y - height / 2;
      // For a long surface, the pointer can be close to a corner but far from the center.
      const outside = Math.max(0, outlineAt(dx, dy, width / 2, height / 2, this.corners, {}).distance);
      const energy = strength / (1 + (outside / (elevation * 1.5)) ** 2);
      const span = Math.hypot(dx, dy, elevation);
      const style = this.layer.style;
      const cast = Math.min(120, thickness) * (this.lens ? .09 : .055) * energy;
      style.setProperty('--ml-cast-x', (-dx / span * cast).toFixed(2) + 'px');
      style.setProperty('--ml-cast-y', (-dy / span * cast).toFixed(2) + 'px');
      style.setProperty('--ml-penumbra', Math.max(1.5, Math.min(120, thickness) * (.04 + .04 * energy)).toFixed(2) + 'px');
      style.setProperty('--ml-cast-opacity', (.04 + .15 * energy).toFixed(3));
      const depth = fraction < 1 ? Math.sin(fraction * Math.PI * 4) * (1 - fraction) ** 2 : 0;
      const scale = this.maps[0].hasAttribute('href') ? String(opticalRadius * optics.mapRange * (1 + depth * .26)) : '0';
      if (this.displacement.getAttribute('scale') !== scale) this.displacement.setAttribute('scale', scale);
      const cx = pulse ? (pulse.x - box.left) * sx : width / 2;
      const cy = pulse ? (pulse.y - box.top) * sy : height / 2;
      if (renderer.program) {
        if (!this.output) {
          this.output = doc.createElement('canvas');
          this.layer.append(this.output);
        }
        if (renderer.draw(this.output, {width, height, corners: this.corners, x, y, elevation, energy, tint: this.tint,
          bodyTint: this.bodyTint, faceGain, density, strength, transmission, cx, cy, fraction, lens: this.lens, dpr, sample})) {
          if (this.layer.dataset.mlRenderer !== 'webgl') this.layer.dataset.mlRenderer = 'webgl';
          return;
        }
      }
      if (this.layer.dataset.mlRenderer !== 'svg') this.layer.dataset.mlRenderer = 'svg';
      const peakHeight = opticalRadius * (optics.base + optics.crown);
      for (const lamp of this.lamps) {
        lamp.setAttribute('x', x);
        lamp.setAttribute('y', y);
        lamp.setAttribute('z', elevation + peakHeight);
      }
      const specular = Number((.04 * strength + energy * faceGain * (this.lens ? 1.45 : 1.05)).toFixed(3));
      this.reflection.setAttribute('specularConstant', specular);
      // A zero-strength SVG specular primitive can paint opaque black. Use the unlit body directly.
      this.bodyComposite.setAttribute('in', specular > 0 ? 'illuminated' : 'body');
      this.diffuse.setAttribute('diffuseConstant', strength);
      this.reflection.setAttribute('surfaceScale', peakHeight * (1 + depth * .26));
      this.diffuse.setAttribute('surfaceScale', peakHeight);
      this.glint.setAttribute('cx', x);
      this.glint.setAttribute('cy', y);
      this.glint.setAttribute('r', elevation * 1.85);
      this.litRim.setAttribute('opacity', (.92 * energy).toFixed(3));
      this.darkRim.setAttribute('opacity', (.13 + .12 * (1 - energy)).toFixed(3));
      this.bodyDensity.setAttribute('tableValues', [0, .085, .16, .235, .31].map(value => (value * density).toFixed(3)).join(' '));
      this.face.setAttribute('opacity', (faceGain * (.5 * strength + .44 * energy)).toFixed(3));
      const projection = Math.max(1, Math.hypot(dx / (width / 2), dy / (height / 2)));
      this.caustic.setAttribute('cx', width / 2 - .76 * dx / projection);
      this.caustic.setAttribute('cy', height / 2 - .76 * dy / projection);
      this.caustic.setAttribute('r', elevation * .8);
      const transmitted = energy * Math.hypot(dx, dy) / span;
      this.causticFace.setAttribute('opacity', (.37 * transmitted).toFixed(3));
      this.interiorLight.setAttribute('opacity', (.21 * transmitted).toFixed(3));
      if (fraction < 1) {
        this.wave.setAttribute('cx', cx);
        this.wave.setAttribute('cy', cy);
        const extent = Math.hypot(Math.max(cx, width - cx), Math.max(cy, height - cy));
        this.wave.setAttribute('r', 1 + extent * (1 - (1 - fraction) ** 2));
        this.wave.setAttribute('opacity', (.9 * (1 - fraction) ** 1.4).toFixed(3));
      } else {
        this.wave.setAttribute('opacity', 0);
      }
    }
  }

  const scenes = new WeakMap();

  // Every visible piece of glass in a document samples the same viewport-space lamp.
  // A stationary pointer also lights a moving lens during its finite settling time.
  class GlassScene {
    #paintedPointer = null;
    #returnStarted = null;

    static forDocument(doc) {
      if (!scenes.has(doc)) scenes.set(doc, new GlassScene(doc));
      return scenes.get(doc);
    }

    constructor(doc) {
      this.doc = doc;
      this.win = doc.defaultView;
      this.painters = new Set();
      this.until = 0;
      this.frame = 0;
      this.pointer = null;
      this.tracksPointer = false;
      this.media = this.win.matchMedia('(prefers-reduced-motion: reduce)');
      this.events = new AbortController();
      const listen = (target, type) => target.addEventListener(type, this, {
        capture: true, passive: true, signal: this.events.signal,
      });
      for (const type of ['pointermove', 'pointerdown', 'pointerup', 'pointerout', 'pointercancel',
        'scroll', 'visibilitychange']) listen(doc, type);
      for (const type of ['resize', 'blur']) listen(this.win, type);
      listen(this.media, 'change');
      listen(this.win.matchMedia('(forced-colors: active)'), 'change');
      this.settings = new MutationObserver(records => {
        const changed = records.some(({ attributeName, target, oldValue }) => {
          if (attributeName !== 'style' && attributeName !== 'class') return true;
          if (attributeName === 'style' && /--ml-(?:light-intensity|light-source|material-transparency)\s*:/.test((oldValue || '') + ';' + target.style.cssText)) return true;
          // A token on a surface or ancestor can reshape stationary glass without resizing it.
          // Ignore frames written by the renderer itself.
          return !target.closest('.ml-optical') && (target.matches('.ml-refractive') || target.querySelector('.ml-refractive'));
        });
        if (changed) this.wake();
      });
      this.settings.observe(doc.documentElement, { attributes: true, attributeOldValue: true, subtree: true,
        attributeFilter: ['data-ml-material', 'data-ml-motion', 'data-ml-theme', 'data-ml-light-source', 'placement', 'dir', 'class', 'style',
          'hidden', 'disabled', 'aria-disabled', 'aria-busy', 'inert'] });
    }

    handleEvent(event) {
      switch (event.type) {
        case 'pointermove':
        case 'pointerdown':
          if (!event.isPrimary || (event.pointerType === 'touch' && !event.buttons)) return;
          this.pointer = { x: event.clientX, y: event.clientY };
          this.#returnStarted = null;
          if (!this.tracksPointer) return;
          break;
        case 'pointerout':
        case 'pointerup':
        case 'pointercancel':
          if (!event.isPrimary || (event.type === 'pointerout' && event.relatedTarget)
            || (event.type === 'pointerup' && event.pointerType === 'mouse')) return;
          this.#returnPointer();
          return;
        case 'blur':
          if (event.target === this.win) this.#returnPointer();
          return;
        case 'visibilitychange':
          // A hidden tab has no visible transition. Discard the old pointer before it is shown again.
          this.pointer = null;
          this.#paintedPointer = null;
          this.#returnStarted = null;
          break;
      }
      this.wake();
    }

    #returnPointer() {
      if (!this.pointer || this.#returnStarted !== null) return;
      this.pointer = this.tracksPointer && !this.media.matches ? this.#paintedPointer : null;
      if (this.pointer) this.#returnStarted = this.win.performance.now();
      if (this.tracksPointer) this.wake();
    }

    wake(duration = 0) {
      this.until = Math.max(this.until, this.win.performance.now() + duration);
      if (!this.frame) this.frame = this.win.requestAnimationFrame(this.draw);
    }

    draw = now => {
      this.frame = 0;
      let pointer = this.pointer;
      if (this.#returnStarted !== null) {
        const progress = Math.max(0, (now - this.#returnStarted) / lightReturnDuration);
        if (progress >= 1 || this.media.matches) {
          pointer = this.pointer = null;
          this.#returnStarted = null;
        } else {
          // Ease from the last pointer position to each surface's own resting light.
          const weight = (pointer.weight ?? 1) * (1 - progress * progress * (3 - 2 * progress));
          pointer = { ...pointer, weight };
        }
      }
      this.#paintedPointer = pointer;
      this.tracksPointer = false;
      for (const paint of this.painters) {
        if (paint(pointer, now)) this.tracksPointer = true;
      }
      if (!this.frame && (now < this.until || (this.tracksPointer && this.#returnStarted !== null))) {
        this.frame = this.win.requestAnimationFrame(this.draw);
      }
    };

    remove(paint) {
      this.painters.delete(paint);
      if (this.painters.size) return;
      this.events.abort();
      this.settings.disconnect();
      this.win.cancelAnimationFrame(this.frame);
      scenes.delete(this.doc);
    }
  }

  globalThis[key] = Object.freeze({ version: 15, GlassSurface, GlassScene: previousScene || GlassScene, waveDuration });
})();
