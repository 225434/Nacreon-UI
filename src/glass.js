(() => {
  'use strict';

  const key = Symbol.for('material-lib.glass.v1');
  if (globalThis[key]?.version >= 8) return;
  const previousScene = globalThis[key]?.GlassScene;
  const { optics } = globalThis[Symbol.for('material-lib.glass-shader.v1')];

  const waveDuration = 620;
  let nextGlassId = 0;
  const normalMaps = new Map();

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
  function outlineAt(dx, dy, halfW, halfH, corners, out) {
    const qx = Math.abs(dx) - halfW, qy = Math.abs(dy) - halfH;
    const ox = Math.max(qx, 0), oy = Math.max(qy, 0), outside = Math.hypot(ox, oy);
    out.distance = outside + Math.min(Math.max(qx, qy), 0);
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
    return out;
  }

  // R/G carry the entire ray displacement; blue carries the front surface height.
  // Work in optical radii so similar-sized controls can share a map at each resolution.
  function glassNormals(width, height, corners, dpr) {
    const shortSide = Math.min(width, height);
    const aspectX = Math.round(width / shortSide * 16) / 16;
    const aspectY = Math.round(height / shortSide * 16) / 16;
    const relative = r => Math.round(r / shortSide * 32) / 32;
    const roundX = corners.x.map(relative), roundY = corners.y.map(relative);
    const relativeRadius = Math.max(.001, Math.round(Math.min(1, 2 * optics.maxRadius / shortSide) * 1000) / 1000);
    const resolution = Math.max(64, Math.min(512, 2 ** Math.ceil(Math.log2(shortSide * dpr))));
    const key = [aspectX, aspectY, roundX, roundY, relativeRadius, resolution].join('/');
    if (normalMaps.has(key)) return normalMaps.get(key);
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(1536, Math.round(resolution * aspectX));
    canvas.height = Math.min(1536, Math.round(resolution * aspectY));
    const context = canvas.getContext('2d');
    const pixels = context.createImageData(canvas.width, canvas.height);
    const halfW = aspectX / relativeRadius, halfH = aspectY / relativeRadius;
    const mapRadius = r => 2 * r / relativeRadius;
    const mapCorners = { x: roundX.map(mapRadius), y: roundY.map(mapRadius) };
    const sample = {}, eta = 1 / optics.index;
    for (let y = 0, i = 0; y < canvas.height; y++) {
      const v = 2 * (y + .5) / canvas.height - 1, dy = v * halfH, archY = 1 - v * v;
      for (let x = 0; x < canvas.width; x++, i += 4) {
        const u = 2 * (x + .5) / canvas.width - 1, dx = u * halfW, archX = 1 - u * u;
        outlineAt(dx, dy, halfW, halfH, mapCorners, sample);
        const depth = Math.max(0, -sample.distance);
        const edge = Math.max(0, 1 - depth / optics.rim);
        const arc = Math.sqrt(1 - edge * edge);
        const crown = optics.base + optics.crown * archX * archY;
        const frontHeight = arc * crown;
        const rimSlope = crown / optics.rim * edge / Math.max(.15, arc);
        const gx = 2 * optics.crown * arc * u * archY / halfW + sample.nx * rimSlope;
        const gy = 2 * optics.crown * arc * v * archX / halfH + sample.ny * rimSlope;
        // Snell refraction of a perpendicular viewing ray, followed by the flat rear interface.
        const nz = 1 / Math.sqrt(1 + gx * gx + gy * gy);
        const bend = (eta * nz - Math.sqrt(1 - eta * eta * (1 - nz * nz))) * nz;
        const rayX = bend * gx, rayY = bend * gy;
        const exitCos2 = 1 - optics.index ** 2 * (rayX * rayX + rayY * rayY);
        const t = Math.max(0, Math.min(1, exitCos2 / .16));
        const escape = t * t * (3 - 2 * t);
        let travel = optics.chord * frontHeight / (eta - bend)
          + optics.index * optics.clearance * arc * escape / Math.sqrt(Math.max(.16, exitCos2));
        // Ease the rays near the rim so the lens magnifies evenly instead of smearing.
        travel /= 1 + Math.hypot(rayX, rayY) * travel / 1.35;
        pixels.data[i] = 255 * (.5 + rayX * travel / optics.mapRange);
        pixels.data[i + 1] = 255 * (.5 + rayY * travel / optics.mapRange);
        pixels.data[i + 2] = 255 * frontHeight / (optics.base + optics.crown);
        pixels.data[i + 3] = 255;
      }
    }
    context.putImageData(pixels, 0, 0);
    const url = canvas.toDataURL();
    if (normalMaps.size >= 96) normalMaps.delete(normalMaps.keys().next().value);
    normalMaps.set(key, url);
    return url;
  }

  function normalizedRgb(value, fallback) {
    const channels = value.split(/\s+/).map(Number);
    return channels.length === 3 && channels.every(Number.isFinite)
      ? channels.map(channel => Math.max(0, Math.min(255, channel)) / 255) : fallback;
  }

  class PointerLightSurface {
    constructor(surface, tier) {
      this.tier = tier;
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

    paint(pointer) {
      const el = this.layer;
      if (!pointer) return this.#unlight();
      const box = el.getBoundingClientRect(), win = el.ownerDocument.defaultView;
      if (!box.width || !box.height || box.right <= 0 || box.bottom <= 0 || box.left >= win.innerWidth || box.top >= win.innerHeight) {
        return this.#unlight();
      }
      const width = el.clientWidth, height = el.clientHeight;
      const x = (pointer.x - box.left) * width / box.width, y = (pointer.y - box.top) * height / box.height;
      const dx = x - width / 2, dy = y - height / 2;
      const reach = Math.max(32, Math.min(150, Math.min(width, height) * 1.1));
      const outside = Math.hypot(Math.max(0, Math.abs(dx) - width / 2), Math.max(0, Math.abs(dy) - height / 2));
      const falloff = 1 - outside / (reach * 1.75);
      if (falloff <= 0) return this.#unlight();
      const state = [width, height, x.toFixed(1), y.toFixed(1)].join('/');
      if (state === this.state) return;
      this.state = state;
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
    static lightingTier(style, follows) {
      const level = style.getPropertyValue('--ml-material-level').trim();
      if (level === 'none') return null;
      if (style.getPropertyValue('--ml-optics').trim() === 'block') return 'high';
      return follows && ['base', 'low', 'medium'].includes(level) ? level : null;
    }

    static forTier(current, surface, lens, tier) {
      if (current?.tier === tier && current.layer.parentElement === surface) return current;
      current?.remove();
      return tier === 'high' ? new GlassSurface(surface, lens) : new PointerLightSurface(surface, tier);
    }

    constructor(surface, lens) {
      this.tier = 'high';
      this.surface = surface;
      this.lens = lens;
      const id = 'ml-glass-v6-' + ++nextGlassId;
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
            <feFlood flood-color="rgb(var(--ml-glass-body-rgb, 138 192 217))" result="bodyTint"/>
            <feComposite in="bodyTint" in2="density" operator="in" result="body"/>
            <feComposite in="body" in2="illumination" operator="arithmetic" k1=".35" k2=".65" result="litBody"/>
            <feSpecularLighting in="dome" specularExponent="30" lighting-color="currentColor" result="shine">
              <fePointLight/>
            </feSpecularLighting>
            <feGaussianBlur in="shine" result="polished"/>
            <feMerge><feMergeNode in="litBody"/><feMergeNode in="polished"/></feMerge>
            <feComposite in2="SourceAlpha" operator="in"/>
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
        <path fill="none" stroke="#0a1420"/>
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
      this.wave = svg.querySelector('circle');
      this.surface.style.setProperty('--ml-bend', 'url("#' + id + '-bend")');
      this.surface.classList.add('ml-refractive');
      this.surface.prepend(this.layer);
    }

    remove() {
      this.layer.remove();
      this.surface.classList.remove('ml-refractive');
      this.surface.style.removeProperty('--ml-bend');
    }

    paint(pointer, pulse, now, backdrop = null, version = 0) {
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
      const bodyRGB = opticalStyle.getPropertyValue('--ml-glass-body-rgb').trim() || '138 192 217';
      if (lampRGB !== this.lampRGB) {
        this.lampRGB = lampRGB;
        this.tint = normalizedRgb(lampRGB, [243 / 255, 249 / 255, 1]);
      }
      if (bodyRGB !== this.bodyRGB) {
        this.bodyRGB = bodyRGB;
        this.bodyTint = normalizedRgb(bodyRGB, [138 / 255, 192 / 255, 217 / 255]);
      }
      const gain = parseFloat(opticalStyle.getPropertyValue('--ml-glass-face-gain'));
      const faceGain = Number.isFinite(gain) ? Math.max(0, Math.min(1, gain)) : .135;
      const densityReading = parseFloat(opticalStyle.getPropertyValue('--ml-glass-density'));
      const density = Number.isFinite(densityReading) ? Math.max(0, Math.min(2.5, densityReading)) : 1;
      const dpr = win.devicePixelRatio || 1;
      const opticalRadius = Math.min(thickness / 2, optics.maxRadius);
      const shape = [width, height, radiusStyles, dpr].join('/');
      if (shape !== this.shape) {
        this.shape = shape;
        this.corners = usedCorners(this.layer, radiusStyles, width, height);
        const url = glassNormals(width, height, this.corners, dpr);
        if (this.maps[0].getAttribute('href') !== url) {
          for (const map of this.maps) map.setAttribute('href', url);
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
      const x = pointer ? (pointer.x - box.left) * sx : Math.min(width * .24, this.corners.x[0] + elevation * .6);
      const y = pointer ? (pointer.y - box.top) * sy : -Math.min(height * .28, elevation * .55);
      const fraction = pulse ? Math.min(1, Math.max(0, (now - pulse.start) / waveDuration)) : 1;
      const renderer = globalThis[Symbol.for('material-lib.glass-shader.v1')].forDocument(doc, () => {
        // An older standalone component can already own the document's scene.
        const scene = previousScene ? previousScene.forDocument(doc) : scenes.get(doc);
        if (scene?.painters.size) scene.wake();
        else scene?.remove();
      });
      let sample = null;
      if (renderer.program && backdrop?.width && backdrop.height) {
        const b = backdrop.getBoundingClientRect();
        if (b.width && b.height) sample = { canvas: backdrop, version, rect: [
          (box.left - b.left) / b.width, (box.top - b.top) / b.height, box.width / b.width, box.height / b.height,
        ] };
      }
      const state = [shape, x.toFixed(1), y.toFixed(1), fraction.toFixed(3), renderer.generation,
        lampRGB, bodyRGB, faceGain, density, version, sample?.rect.map(n => n.toFixed(5))].join('/');
      if (state === this.state && this.lastBackdrop === backdrop) return;
      this.state = state;
      this.lastBackdrop = backdrop;
      const dx = x - width / 2, dy = y - height / 2;
      // For a long surface, the pointer can be close to a corner but far from the center.
      const outside = Math.max(0, outlineAt(dx, dy, width / 2, height / 2, this.corners, {}).distance);
      const energy = 1 / (1 + (outside / (elevation * 1.5)) ** 2);
      const span = Math.hypot(dx, dy, elevation);
      const style = this.layer.style;
      const cast = Math.min(120, thickness) * (this.lens ? .09 : .055) * energy;
      style.setProperty('--ml-cast-x', (-dx / span * cast).toFixed(2) + 'px');
      style.setProperty('--ml-cast-y', (-dy / span * cast).toFixed(2) + 'px');
      style.setProperty('--ml-penumbra', Math.max(1.5, Math.min(120, thickness) * (.04 + .04 * energy)).toFixed(2) + 'px');
      style.setProperty('--ml-cast-opacity', (.04 + .15 * energy).toFixed(3));
      const depth = fraction < 1 ? Math.sin(fraction * Math.PI * 4) * (1 - fraction) ** 2 : 0;
      this.displacement.setAttribute('scale', opticalRadius * optics.mapRange * (1 + depth * .26));
      const cx = pulse ? (pulse.x - box.left) * sx : width / 2;
      const cy = pulse ? (pulse.y - box.top) * sy : height / 2;
      if (renderer.program) {
        if (!this.output) {
          this.output = doc.createElement('canvas');
          this.layer.append(this.output);
        }
        if (renderer.draw(this.output, {width, height, corners: this.corners, x, y, elevation, energy, tint: this.tint,
          bodyTint: this.bodyTint, faceGain, density, cx, cy, fraction, lens: this.lens, dpr, sample})) {
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
      this.reflection.setAttribute('specularConstant', (.04 + energy * faceGain * (this.lens ? 1.45 : 1.05)).toFixed(3));
      this.reflection.setAttribute('surfaceScale', peakHeight * (1 + depth * .26));
      this.diffuse.setAttribute('surfaceScale', peakHeight);
      this.glint.setAttribute('cx', x);
      this.glint.setAttribute('cy', y);
      this.glint.setAttribute('r', elevation * 1.85);
      this.litRim.setAttribute('opacity', (.92 * energy).toFixed(3));
      this.darkRim.setAttribute('opacity', (.13 + .12 * (1 - energy)).toFixed(3));
      this.bodyDensity.setAttribute('tableValues', [0, .085, .16, .235, .31].map(value => (value * density).toFixed(3)).join(' '));
      this.face.setAttribute('opacity', (faceGain * (.5 + .44 * energy)).toFixed(3));
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
        const changed = records.some(({ attributeName, target }) => {
          if (attributeName !== 'style' && attributeName !== 'class') return true;
          // A token on a surface or ancestor can reshape stationary glass without resizing it.
          // Ignore frames written by the renderer itself.
          return !target.closest('.ml-optical') && (target.matches('.ml-refractive') || target.querySelector('.ml-refractive'));
        });
        if (changed) this.wake();
      });
      this.settings.observe(doc.documentElement, { attributes: true, subtree: true,
        attributeFilter: ['data-ml-material', 'data-ml-motion', 'data-ml-theme', 'placement', 'dir', 'class', 'style',
          'hidden', 'disabled', 'aria-disabled', 'aria-busy', 'inert'] });
    }

    handleEvent(event) {
      if (event.type === 'pointermove' || event.type === 'pointerdown') {
        if (!event.isPrimary || (event.pointerType === 'touch' && !event.buttons)) return;
        this.pointer = { x: event.clientX, y: event.clientY };
        if (!this.tracksPointer) return;
      } else if (event.type === 'pointerout' || event.type === 'pointerup') {
        if (!event.isPrimary || (event.type === 'pointerout' && event.relatedTarget)
          || (event.type === 'pointerup' && event.pointerType === 'mouse')) return;
        this.pointer = null;
        if (!this.tracksPointer) return;
      } else if (event.type === 'blur' || event.type === 'visibilitychange' || event.type === 'pointercancel') {
        if (event.type === 'blur' && event.target !== this.win) return;
        this.pointer = null;
      }
      this.wake();
    }

    wake(duration = 0) {
      this.until = Math.max(this.until, this.win.performance.now() + duration);
      if (!this.frame) this.frame = this.win.requestAnimationFrame(this.draw);
    }

    draw = now => {
      this.frame = 0;
      this.tracksPointer = false;
      for (const paint of this.painters) {
        if (paint(this.pointer, now)) this.tracksPointer = true;
      }
      if (now < this.until && !this.frame) this.frame = this.win.requestAnimationFrame(this.draw);
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

  globalThis[key] = Object.freeze({ version: 8, GlassSurface, GlassScene: previousScene || GlassScene, waveDuration });
})();
