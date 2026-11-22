/* Generated from src/icons.svg and src/glass-shader.js, src/glass.js, src/icons.js, src/icon-motion.js, src/icon-material.js by build.mjs. */
(() => {
  'use strict';

  const key = Symbol.for('material-lib.glass-shader.v1');
  if (globalThis[key]?.version >= 4) return;

  // Distances are in units of the optical radius. The native displacement map
  // uses the same profile, refractive index and rear interface as the shader.
  const optics = Object.freeze({ maxRadius: 68, rim: .64, base: .42, crown: .60,
    chord: 1.25, clearance: .14, index: 1.48, mapRange: 1 });

  const vertex = `
    attribute vec2 position;
    varying vec2 uv;
    void main() {
      uv = vec2(position.x * .5 + .5, .5 - position.y * .5);
      gl_Position = vec4(position, 0., 1.);
    }`;

  const fragment = `
    precision highp float;
    varying vec2 uv;
    uniform vec2 size, contact;
    uniform vec4 lamp, lightColor;
    uniform vec3 bodyTint;
    uniform vec4 radiusX, radiusY;
    uniform float progress, lens, pixel, hasImage;
    uniform vec4 imageRect;
    uniform sampler2D backdrop;

    float bell(float x) { return exp(-x * x); }

    void cutCorner(vec2 p, vec2 halfSize, vec2 side, vec2 axes, inout float distance, inout vec2 outward) {
      vec2 q = axes - halfSize + side * p;
      if (min(q.x, q.y) <= 0. || min(axes.x, axes.y) <= 0.) return;
      vec2 unit = q / axes;
      float radial = length(unit);
      vec2 gradient = unit / axes;
      float magnitude = length(gradient);
      float arcDistance = (radial - 1.) * radial / magnitude;
      if (arcDistance > distance) {
        distance = arcDistance;
        outward = side * gradient / magnitude;
      }
    }

    void main() {
      vec2 halfSize = size * .5;
      vec2 p = (uv - .5) * size;
      vec2 q = abs(p) - halfSize;
      float distance = max(q.x, q.y);
      vec2 outward = q.x > q.y ? vec2(sign(p.x), 0.) : vec2(0., sign(p.y));
      cutCorner(p, halfSize, vec2(-1., -1.), vec2(radiusX.x, radiusY.x), distance, outward);
      cutCorner(p, halfSize, vec2( 1., -1.), vec2(radiusX.y, radiusY.y), distance, outward);
      cutCorner(p, halfSize, vec2( 1.,  1.), vec2(radiusX.z, radiusY.z), distance, outward);
      cutCorner(p, halfSize, vec2(-1.,  1.), vec2(radiusX.w, radiusY.w), distance, outward);
      float coverage = 1. - smoothstep(-pixel, pixel, distance);
      float opticalRadius = min(min(halfSize.x, halfSize.y), ${optics.maxRadius}.0);
      float depth = max(-distance, 0.);
      float bevel = opticalRadius * ${optics.rim};
      float slope = clamp(1. - depth / bevel, 0., 1.);
      float arc = sqrt(max(0., 1. - slope * slope));
      vec2 local = p / halfSize;
      vec2 arch = max(vec2(0.), 1. - local * local);
      float crown = ${optics.base} + ${optics.crown} * arch.x * arch.y;
      float frontHeight = opticalRadius * arc * crown;
      vec2 gradient = 2. * ${optics.crown} * opticalRadius * arc * local * arch.yx / halfSize
        + outward * (crown / ${optics.rim}) * slope / max(.085, arc);
      float wave = 0.;
      if (progress < 1.) {
        float reach = length(max(contact, size - contact));
        float front = reach * (1. - (1. - progress) * (1. - progress));
        float offset = (length(uv * size - contact) - front) / max(1.4, bevel * .23);
        wave = exp(-offset * offset) * (1. - progress);
      }
      vec2 ripple = (size * uv - contact) / max(1., length(size * uv - contact));
      vec3 normal = normalize(vec3(gradient + .12 * wave * ripple, 1.));
      // Follow the ray through the whole chord, then out through the flat back.
      // Near the critical angle the escaping ray gives way to an internal reflection.
      const float ior = ${optics.index};
      vec3 ray = refract(vec3(0., 0., -1.), normal, 1. / ior);
      float path = ${optics.chord} * frontHeight / -ray.z;
      float exitCos2 = 1. - ior * ior * dot(ray.xy, ray.xy);
      float escape = smoothstep(0., .16, exitCos2);
      vec2 exitSlope = ray.xy * ior * inversesqrt(max(.16, exitCos2));
      vec2 travel = ray.xy * path + exitSlope * (escape * ${optics.clearance} * opticalRadius * arc);
      vec2 toLight = lamp.xy - size * uv;
      float z2 = lamp.z * lamp.z;
      float lampHeight = lamp.z + opticalRadius * (${optics.base} + ${optics.crown}) - frontHeight;
      vec3 incident = vec3(toLight, lampHeight);
      float irradiance = z2 / dot(incident, incident);
      vec3 light = normalize(incident);
      vec3 halfLight = normalize(light + vec3(0., 0., 1.));
      float nDotH = max(dot(normal, halfLight), 0.);
      float fresnel = .038 + .962 * pow(clamp(1. - normal.z, 0., 1.), 5.);
      float lipWidth = max(.65 * pixel, clamp(bevel * .079, .64, 2.1));
      float lip = bell((depth - lipWidth * .80) / lipWidth);
      float shoulder = bell((depth - bevel * .23) / max(pixel, bevel * .17));

      // Distance to each point on the perimeter localizes the highlight along long straight edges.
      // A bearing taken about the lens stays continuous as the pointer crosses its silhouette.
      vec2 fromCenter = lamp.xy - halfSize;
      float bearing = dot(outward, fromCenter) / length(vec3(fromCenter, lamp.z * .60));
      vec2 toRim = toLight - outward * min(depth, bevel);
      float rimLight = z2 / (z2 + dot(toRim, toRim));
      float key = rimLight * (.28 + .72 * smoothstep(-.27, .73, bearing));
      float sky = max(dot(outward, vec2(-.50, -.866)), 0.);
      vec3 reflected = reflect(vec3(0., 0., -1.), normal);
      float skylight = bell((reflected.y + .69 - .20 * reflected.x) / .31)
        * smoothstep(-.42, .34, reflected.z) * (.74 - .24 * reflected.x);
      float ambient = .12 * fresnel + (.025 + .060 * sky * sky) * lip + .17 * skylight;
      float face = irradiance * (.54 * pow(nDotH, 42.) + .46 * pow(nDotH, 8.))
        * mix(lightColor.a * .86, .30, slope) * mix(.78, 1., lens);
      face += (.04 + .28 * lightColor.a) * irradiance * pow(nDotH, 6.) * smoothstep(.16, .78, length(local));
      float reflection = key * (.72 * lip + .31 * shoulder + .11 * slope + .08 * (1. - escape));
      // Light leaving the curved body concentrates on the far shoulder.
      vec2 exitPoint = halfSize - .76 * fromCenter / max(1., length(fromCenter / halfSize));
      vec2 toExit = (size * uv - exitPoint) / (vec2(.55, .48) * lamp.z + .20 * halfSize);
      float focus = exp(-dot(toExit, toExit));
      float farSide = smoothstep(.02, .60, -dot(local, fromCenter) / length(vec3(fromCenter, lamp.z * .72)));
      float caustic = lamp.w * focus * (.13 * farSide * arc + .13 * smoothstep(.02, .78, -bearing)
        * bell((depth - bevel * .66) / max(pixel, bevel * .35)));
      float shine = 1. - (1. - ambient) * (1. - min(.94, reflection)) * (1. - face)
        * (1. - caustic) * (1. - .22 * wave);
      float shade = slope * (.045 + .09 * lamp.w * max(-bearing, 0.)) * (1. - .59 * key);
      vec3 glint = mix(lightColor.rgb, vec3(1.), .30 * key * lip);
      // Beer-Lambert transmission and a softly lit body also work over ordinary HTML.
      float transmission = exp(-.245 * path / opticalRadius);
      float bodyLight = .52 + .26 * max(dot(normal, vec3(-.32, -.57, .75)), 0.)
        + .27 * irradiance * max(dot(normal, light), 0.);
      vec3 body = bodyTint * bodyLight * (1. - transmission);
      float throughFace = (1. - shine) * (1. - shade);
      float alpha = 1. - throughFace * transmission;
      vec3 color = glint * shine + vec3(.09,.12,.15) * shade * (1. - shine) + throughFace * body;
      if (hasImage > .5) {
        vec2 offset = travel / size * imageRect.zw;
        vec2 at = imageRect.xy + uv * imageRect.zw;
        vec4 transmitted = texture2D(backdrop, at + offset);
        transmitted.r = texture2D(backdrop, at + offset * 1.012).r;
        transmitted.b = texture2D(backdrop, at + offset * .988).b;
        color += transmitted.rgb * transmitted.a * (1. - alpha);
        alpha += transmitted.a * (1. - alpha);
      }
      gl_FragColor = vec4(color, alpha) * coverage;
    }`;

  const renderers = new WeakMap();

  function compile(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
    const reason = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(reason || 'Glass shader compilation failed');
  }

  // One context and program per document. Only the finished frame is copied to each DOM surface.
  class GlassRenderer {
    static get version() { return 4; }
    static get optics() { return optics; }
    static forDocument(doc, invalidate) {
      if (!renderers.has(doc)) renderers.set(doc, new GlassRenderer(doc, invalidate));
      return renderers.get(doc);
    }

    constructor(doc, invalidate) {
      this.canvas = doc.createElement('canvas');
      this.canvas.width = this.canvas.height = 1;
      this.generation = 0;
      try {
        this.gl = this.canvas.getContext('webgl', {
          alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
        });
      } catch { return; }
      if (!this.gl) return;
      this.canvas.addEventListener('webglcontextlost', event => {
        event.preventDefault();
        this.program = null;
        this.generation++;
        invalidate();
      });
      this.canvas.addEventListener('webglcontextrestored', () => {
        this.setup();
        this.generation++;
        invalidate();
      });
      this.setup();
    }

    setup() {
      const gl = this.gl;
      const program = gl.createProgram();
      const shaders = [];
      try {
        shaders.push(compile(gl, gl.VERTEX_SHADER, vertex));
        shaders.push(compile(gl, gl.FRAGMENT_SHADER, fragment));
        for (const shader of shaders) gl.attachShader(program, shader);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
        const position = gl.getAttribLocation(program, 'position');
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        this.uniform = {};
        for (const name of ['size','lamp','lightColor','bodyTint','contact','radiusX','radiusY','progress','lens','pixel','imageRect','hasImage','backdrop']) {
          this.uniform[name] = gl.getUniformLocation(program, name);
        }
        gl.uniform1i(this.uniform.backdrop, 0);
        this.textures = new WeakMap();
        this.emptyTexture = this.createTexture();
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
        this.maxSide = Math.min(4096, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), ...gl.getParameter(gl.MAX_VIEWPORT_DIMS));
        this.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        this.program = program;
      } catch (error) {
        gl.deleteProgram(program);
        this.program = null;
        if (!gl.isContextLost()) console.warn('Material Library · WebGL', error.message);
      } finally {
        for (const shader of shaders) gl.deleteShader(shader);
      }
    }

    createTexture() {
      const gl = this.gl, target = gl.TEXTURE_2D;
      const texture = gl.createTexture();
      gl.bindTexture(target, texture);
      gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return texture;
    }

    bindBackdrop(sample) {
      const gl = this.gl;
      if (sample && sample.canvas.width <= this.maxTexture && sample.canvas.height <= this.maxTexture) {
        let entry = this.textures.get(sample.canvas);
        if (!entry) {
          entry = { texture: this.createTexture() };
          this.textures.set(sample.canvas, entry);
        }
        gl.bindTexture(gl.TEXTURE_2D, entry.texture);
        if (entry.version !== sample.version) {
          entry.version = sample.version;
          try {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sample.canvas);
            entry.ready = true;
          } catch {
            entry.ready = false; // A cross-origin canvas can still use native backdrop optics.
          }
        }
        if (entry.ready) return true;
      }
      gl.bindTexture(gl.TEXTURE_2D, this.emptyTexture);
      return false;
    }

    draw(output, frame) {
      const gl = this.gl;
      if (!this.program || gl.isContextLost()) return false;
      const {width, height, dpr, corners, x, y, cx, cy, fraction, lens, sample} = frame;
      // Previous standalone components can share this renderer when only one bundle is upgraded.
      const { elevation = Math.max(30, Math.min(116, Math.min(width, height) * .76)), energy = 1,
        tint = [.95, .975, 1.], bodyTint = [.54, .75, .85], faceGain = .135 } = frame;
      const scale = Math.min(dpr, this.maxSide / Math.max(width, height));
      const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
      if (this.canvas.width < w) this.canvas.width = w;
      if (this.canvas.height < h) this.canvas.height = h;
      if (output.width !== w) output.width = w;
      if (output.height !== h) output.height = h;
      const context = output.getContext('2d');
      if (!context) return false;
      const u = this.uniform;
      const textured = this.bindBackdrop(sample);
      gl.viewport(0, 0, w, h);
      gl.uniform2f(u.size, width, height);
      gl.uniform4f(u.lamp, x, y, elevation, energy);
      gl.uniform4f(u.lightColor, tint[0], tint[1], tint[2], faceGain);
      gl.uniform3fv(u.bodyTint, bodyTint);
      gl.uniform2f(u.contact, cx, cy);
      if (corners) {
        gl.uniform4fv(u.radiusX, corners.x);
        gl.uniform4fv(u.radiusY, corners.y);
      } else {
        const r = frame.radius ?? 0;
        gl.uniform4f(u.radiusX, r, r, r, r);
        gl.uniform4f(u.radiusY, r, r, r, r);
      }
      gl.uniform1f(u.progress, fraction);
      gl.uniform1f(u.lens, lens ? 1 : 0);
      gl.uniform1f(u.pixel, 1 / scale);
      gl.uniform1f(u.hasImage, textured ? 1 : 0);
      if (textured) gl.uniform4fv(u.imageRect, sample.rect);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (gl.isContextLost()) return false;
      context.globalCompositeOperation = 'copy';
      context.drawImage(this.canvas, 0, this.canvas.height - h, w, h, 0, 0, w, h);
      return true;
    }
  }

  globalThis[key] = GlassRenderer;
})();

(() => {
  'use strict';

  const key = Symbol.for('material-lib.glass.v1');
  if (globalThis[key]?.version >= 6) return;
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
    const resolution = Math.max(64, Math.min(256, 2 ** Math.ceil(Math.log2(shortSide * dpr))));
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
        const rimSlope = crown / optics.rim * edge / Math.max(.085, arc);
        const gx = 2 * optics.crown * arc * u * archY / halfW + sample.nx * rimSlope;
        const gy = 2 * optics.crown * arc * v * archX / halfH + sample.ny * rimSlope;
        // Snell refraction of a perpendicular viewing ray, followed by the flat rear interface.
        const nz = 1 / Math.sqrt(1 + gx * gx + gy * gy);
        const bend = (eta * nz - Math.sqrt(1 - eta * eta * (1 - nz * nz))) * nz;
        const rayX = bend * gx, rayY = bend * gy;
        const exitCos2 = 1 - optics.index ** 2 * (rayX * rayX + rayY * rayY);
        const t = Math.max(0, Math.min(1, exitCos2 / .16));
        const escape = t * t * (3 - 2 * t);
        const travel = optics.chord * frontHeight / (eta - bend)
          + optics.index * optics.clearance * arc * escape / Math.sqrt(Math.max(.16, exitCos2));
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
            <feComponentTransfer in="height" result="density"><feFuncA type="table" tableValues="0 .075 .145 .21 .27"/></feComponentTransfer>
            <feFlood flood-color="rgb(var(--ml-glass-body-rgb, 138 192 217))" result="bodyTint"/>
            <feComposite in="bodyTint" in2="density" operator="in" result="body"/>
            <feComposite in="body" in2="illumination" operator="arithmetic" k1=".35" k2=".65" result="litBody"/>
            <feSpecularLighting in="dome" specularExponent="23" lighting-color="currentColor" result="shine">
              <fePointLight/>
            </feSpecularLighting>
            <feGaussianBlur in="shine" result="polished"/>
            <feMerge><feMergeNode in="litBody"/><feMergeNode in="polished"/></feMerge>
            <feComposite in2="SourceAlpha" operator="in"/>
          </filter>
          <radialGradient id="${id}-glint" gradientUnits="userSpaceOnUse">
            <stop stop-color="currentColor"/><stop offset=".45" stop-color="currentColor" stop-opacity=".54"/>
            <stop offset="1" stop-color="currentColor" stop-opacity="0"/>
          </radialGradient>
          <radialGradient id="${id}-caustic" gradientUnits="userSpaceOnUse">
            <stop stop-color="currentColor"/><stop offset=".36" stop-color="currentColor" stop-opacity=".68"/>
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
      [this.face, this.dome, this.causticFace, this.interiorLight, this.litRim] = svg.querySelectorAll('path');
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
        const inset = Math.max(1.5, Math.min(17, thickness * (this.lens ? .116 : .109)));
        const causticFace = this.causticFace;
        causticFace.setAttribute('d', outlinePath(width, height, this.corners, inset));
        causticFace.setAttribute('stroke-width', Math.max(.85, height * .017));
        this.blur.setAttribute('stdDeviation', Math.max(.75, height * .018));
        this.polish.setAttribute('stdDeviation', Math.max(.65, height * .021));
        this.layer.style.setProperty('--ml-rim', Math.max(1, Math.min(2.6, height * .023)) + 'px');
        this.wave.setAttribute('stroke-width', Math.max(1.1, height * .025));
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
        lampRGB, bodyRGB, faceGain, version, sample?.rect.map(n => n.toFixed(5))].join('/');
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
      this.displacement.setAttribute('scale', opticalRadius * optics.mapRange * (1 + depth * .18));
      const cx = pulse ? (pulse.x - box.left) * sx : width / 2;
      const cy = pulse ? (pulse.y - box.top) * sy : height / 2;
      if (renderer.program) {
        if (!this.output) {
          this.output = doc.createElement('canvas');
          this.layer.append(this.output);
        }
        if (renderer.draw(this.output, {width, height, corners: this.corners, x, y, elevation, energy, tint: this.tint,
          bodyTint: this.bodyTint, faceGain, cx, cy, fraction, lens: this.lens, dpr, sample})) {
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
      this.reflection.setAttribute('specularConstant', (.04 + energy * faceGain * (this.lens ? 1.2 : .9)).toFixed(3));
      this.reflection.setAttribute('surfaceScale', peakHeight * (1 + depth * .18));
      this.diffuse.setAttribute('surfaceScale', peakHeight);
      this.glint.setAttribute('cx', x);
      this.glint.setAttribute('cy', y);
      this.glint.setAttribute('r', elevation * 1.85);
      this.litRim.setAttribute('opacity', (.85 * energy).toFixed(3));
      this.face.setAttribute('opacity', (faceGain * (.45 + .4 * energy)).toFixed(3));
      const projection = Math.max(1, Math.hypot(dx / (width / 2), dy / (height / 2)));
      this.caustic.setAttribute('cx', width / 2 - .76 * dx / projection);
      this.caustic.setAttribute('cy', height / 2 - .76 * dy / projection);
      this.caustic.setAttribute('r', elevation * .85);
      const transmitted = energy * Math.hypot(dx, dy) / span;
      this.causticFace.setAttribute('opacity', (.29 * transmitted).toFixed(3));
      this.interiorLight.setAttribute('opacity', (.13 * transmitted).toFixed(3));
      if (fraction < 1) {
        this.wave.setAttribute('cx', cx);
        this.wave.setAttribute('cy', cy);
        const extent = Math.hypot(Math.max(cx, width - cx), Math.max(cy, height - cy));
        this.wave.setAttribute('r', 1 + extent * (1 - (1 - fraction) ** 2));
        this.wave.setAttribute('opacity', (.68 * (1 - fraction) ** 1.5).toFixed(3));
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

  globalThis[key] = Object.freeze({ version: 6, GlassSurface, GlassScene: previousScene || GlassScene, waveDuration });
})();

(() => {
  'use strict';
  if (customElements.get('ml-icon')) return;

  const ns = 'http://www.w3.org/2000/svg';
  const template = document.createElement('template');
  template.innerHTML = "<svg xmlns=\"http://www.w3.org/2000/svg\">\n  <defs data-category=\"navigation\" data-label=\"导航与布局\">\n    <symbol id=\"i-layers\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"图层\" data-keywords=\"素材 层叠 stack collection\"><path d=\"m3 8 9-5 9 5-9 5z\" fill=\"var(--ml-icon-pane, none)\"/><path d=\"M3.5 12l8.5 4.8 8.5-4.8\"/><path d=\"M3.5 16l8.5 4.8 8.5-4.8\"/></symbol>\n    <symbol id=\"i-home\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"主页\" data-keywords=\"首页 房子 home dashboard\"><path d=\"m3 10 8-6.5a1.6 1.6 0 0 1 2 0l8 6.5M5.3 8.6v10.3c0 .9.7 1.6 1.6 1.6H10v-6h4v6h3.1c.9 0 1.6-.7 1.6-1.6V8.6\" fill=\"var(--ml-icon-pane, none)\"/></symbol>\n    <symbol id=\"i-page\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"页面\" data-keywords=\"窗口 浏览器 browser window\"><rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2.8\" fill=\"var(--ml-icon-pane, none)\"/><path d=\"M3.5 9h17M7 6.6h.1m2.6 0h.1\"/></symbol>\n    <symbol id=\"i-grid\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"网格\" data-keywords=\"宫格 布局 overview layout\"><rect x=\"3.5\" y=\"3.5\" width=\"7\" height=\"7\" rx=\"1.6\" fill=\"var(--ml-icon-pane, none)\"/><rect x=\"13.5\" y=\"3.5\" width=\"7\" height=\"7\" rx=\"1.6\" fill=\"var(--ml-icon-pane, none)\"/><rect x=\"3.5\" y=\"13.5\" width=\"7\" height=\"7\" rx=\"1.6\" fill=\"var(--ml-icon-pane, none)\"/><rect x=\"13.5\" y=\"13.5\" width=\"7\" height=\"7\" rx=\"1.6\" fill=\"var(--ml-icon-pane, none)\"/></symbol>\n    <symbol id=\"i-list\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"列表\" data-keywords=\"条目 清单 项目符号 列表视图 list view rows bullets\"><path d=\"M4.1 6h.2M8.5 6h12\"/><path d=\"M4.1 12h.2M8.5 12h12\"/><path d=\"M4.1 18h.2M8.5 18h12\"/></symbol>\n    <symbol id=\"i-sidebar\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"侧栏\" data-keywords=\"侧边栏 分栏 sidebar layout\"><rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"3\" fill=\"var(--ml-icon-pane, none)\"/><path d=\"M9.2 4.5v15M5.7 8h1M5.7 11h1\"/></symbol>\n    <symbol id=\"i-menu\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"菜单\" data-keywords=\"菜单 列表 menu navigation\"><path d=\"M4 6.5h16\"/><path d=\"M4 12h16\"/><path d=\"M4 17.5h16\"/></symbol>\n    <symbol id=\"i-more\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"更多操作\" data-keywords=\"更多 菜单 more ellipsis overflow\"><circle cx=\"5\" cy=\"12\" r=\"1.3\" fill=\"var(--ml-icon-lens, none)\"/><circle cx=\"12\" cy=\"12\" r=\"1.3\" fill=\"var(--ml-icon-lens, none)\"/><circle cx=\"19\" cy=\"12\" r=\"1.3\" fill=\"var(--ml-icon-lens, none)\"/></symbol>\n    <symbol id=\"i-mode\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"分段切换\" data-keywords=\"选项 模式 segmented control\"><rect x=\"2.8\" y=\"5.5\" width=\"18.4\" height=\"13\" rx=\"4\" fill=\"var(--ml-icon-pane, none)\"/><path d=\"M12 6.5v11\"/><rect x=\"5.3\" y=\"8\" width=\"4.3\" height=\"8\" rx=\"1.3\" fill=\"currentColor\" stroke=\"none\"/></symbol>\n    <symbol id=\"i-modal\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"弹窗\" data-keywords=\"对话框 弹出 dialog window\"><rect x=\"2.5\" y=\"4\" width=\"19\" height=\"16\" rx=\"3\" fill=\"var(--ml-icon-pane, none)\"/><rect x=\"7\" y=\"8\" width=\"10\" height=\"8\" rx=\"1.5\" fill=\"var(--ml-icon-lens, none)\"/></symbol>\n    <symbol id=\"i-expand\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"展开\" data-keywords=\"放大 全屏 fullscreen maximize\"><path d=\"M14.5 4H20v5.5M20 4l-6 6m-4.5 10H4v-5.5M4 20l6-6\"/></symbol>\n    <symbol id=\"i-collapse\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"收起\" data-keywords=\"缩小 退出全屏 minimize\"><path d=\"M20 9.5h-5.5V4m0 5.5 6-6M4 14.5h5.5V20m0-5.5-6 6\"/></symbol>\n    <symbol id=\"i-size\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"原寸\" data-keywords=\"实际尺寸 一比一 actual size\"><rect x=\"3.5\" y=\"4.5\" width=\"17\" height=\"15\" rx=\"3\" fill=\"var(--ml-icon-pane, none)\"/><path d=\"M7.5 10H9v4m5-4h1.5v4\"/><path d=\"M12 10.8h.01m-.01 2.6h.01\"/></symbol>\n    <symbol id=\"i-chevron-left\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"返回\" data-keywords=\"上一步 向左 上一页 back previous\"><path d=\"m14.8 4.8-7.2 7.2 7.2 7.2\"/></symbol>\n    <symbol id=\"i-chevron-right\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"前进\" data-keywords=\"下一步 向右 下一页 forward next\"><path d=\"m9.2 4.8 7.2 7.2-7.2 7.2\"/></symbol>\n    <symbol id=\"i-chevron-down\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"下拉\" data-keywords=\"向下 展开 dropdown down\"><path d=\"m5 9 7 7 7-7\"/></symbol>\n    <symbol id=\"i-chevron-up\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"向上折叠\" data-keywords=\"上拉 收起 向上 尖括号 up disclosure collapse\"><path d=\"m5 15 7-7 7 7\"/></symbol>\n    <symbol id=\"i-arrow-left\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"向左箭头\" data-keywords=\"左移 返回 向左拓展 back left direction\"><path d=\"M20 12H4m6-6-6 6 6 6\"/></symbol>\n    <symbol id=\"i-arrow-right\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"向右箭头\" data-keywords=\"右移 前往 向右拓展 forward right direction\"><path d=\"M4 12h16m-6-6 6 6-6 6\"/></symbol>\n    <symbol id=\"i-arrow-up\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"向上箭头\" data-keywords=\"上移 向上拓展 upward up direction\"><path d=\"M12 20V4m-6 6 6-6 6 6\"/></symbol>\n    <symbol id=\"i-arrow-down\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"向下箭头\" data-keywords=\"下移 向下拓展 downward down direction\"><path d=\"M12 4v16m-6-6 6 6 6-6\"/></symbol>\n  </defs>\n  <defs data-category=\"actions\" data-label=\"操作与编辑\">\n    <symbol id=\"i-search\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"搜索\" data-keywords=\"查找 搜寻 放大镜 find lookup\"><circle cx=\"10.4\" cy=\"10.4\" r=\"6.5\" fill=\"var(--ml-icon-lens, none)\"/><path d=\"m15.2 15.2 5.1 5.1\"/></symbol>\n    <symbol id=\"i-plus\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"添加\" data-keywords=\"增加 新建 add new\"><path d=\"M12 5v14M5 12h14\"/></symbol>\n    <symbol id=\"i-minus\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"减少\" data-keywords=\"减去 移除 subtract remove\"><path d=\"M5 12h14\"/></symbol>\n    <symbol id=\"i-check\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"确认\" data-keywords=\"完成 勾选 对勾 done confirm\"><path d=\"m5 12 4.6 4.6L19 7.3\"/></symbol>\n    <symbol id=\"i-close\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"关闭\" data-keywords=\"取消 叉号 dismiss cancel\"><path d=\"m6 6 12 12M18 6 6 18\"/></symbol>\n    <symbol id=\"i-edit\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"编辑\" data-keywords=\"修改 铅笔 pencil write\"><path d=\"m4 16-.8 4.8 4.8-.8L20 8a2.3 2.3 0 0 0 0-3.2l-.8-.8a2.3 2.3 0 0 0-3.2 0ZM14.7 5.3l4 4\" fill=\"var(--ml-icon-alloy, none)\"/></symbol>\n    <symbol id=\"i-copy\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"复制\" data-keywords=\"副本 剪贴板 duplicate clipboard\"><rect x=\"8\" y=\"8\" width=\"12\" height=\"13\" rx=\"2\" fill=\"var(--ml-icon-pane, none)\"/><path d=\"M15.5 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3\"/></symbol>\n    <symbol id=\"i-trash\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"删除\" data-keywords=\"回收站 垃圾桶 delete bin\"><path d=\"M4 7h16M9 7V4.5h6V7\"/><path d=\"M6.5 7l.8 12.5h9.4L17.5 7M10 10.5v5.8m4-5.8v5.8\" fill=\"var(--ml-icon-pane, none)\"/></symbol>\n    <symbol id=\"i-settings\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"设置\" data-keywords=\"齿轮 系统设置 外观设置 设备设置 配置 参数 首选项 偏好设置 gear cog preferences configuration\"><path d=\"M10.71 2.84L13.29 2.84L13.65 5.14A7.05 7.05 0 0 1 15.68 5.99L17.57 4.61L19.39 6.43L18.01 8.32A7.05 7.05 0 0 1 18.86 10.35L21.16 10.71L21.16 13.29L18.86 13.65A7.05 7.05 0 0 1 18.01 15.68L19.39 17.57L17.57 19.39L15.68 18.01A7.05 7.05 0 0 1 13.65 18.86L13.29 21.16L10.71 21.16L10.35 18.86A7.05 7.05 0 0 1 8.32 18.01L6.43 19.39L4.61 17.57L5.99 15.68A7.05 7.05 0 0 1 5.14 13.65L2.84 13.29L2.84 10.71L5.14 10.35A7.05 7.05 0 0 1 5.99 8.32L4.61 6.43L6.43 4.61L8.32 5.99A7.05 7.05 0 0 1 10.35 5.14ZM15.05 12a3.05 3.05 0 1 0-6.1 0 3.05 3.05 0 1 0 6.1 0Z\" fill-rule=\"evenodd\" fill=\"var(--ml-icon-alloy, none)\"/></symbol>\n    <symbol id=\"i-sliders\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"调节\" data-keywords=\"设置 参数 控制 settings adjust controls\"><g><path d=\"M4 7h7m4 0h5\"/><circle cx=\"13\" cy=\"7\" r=\"2\" fill=\"var(--ml-icon-lens, none)\"/></g><g><path d=\"M4 17h3m4 0h9\"/><circle cx=\"9\" cy=\"17\" r=\"2\" fill=\"var(--ml-icon-lens, none)\"/></g></symbol>\n    <symbol id=\"i-filter\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"筛选\" data-keywords=\"过滤 条件 漏斗 filter funnel\"><path d=\"M3.5 5h17l-6.7 7.7v5.5l-3.6 1.8v-7.3z\" fill=\"var(--ml-icon-pane, none)\"/></symbol>\n    <symbol id=\"i-sort\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"排序\" data-keywords=\"升序 降序 按时间 按名称 重新排列 order ascending descending\"><path d=\"M7.5 19.5v-15M4.1 8l3.4-3.5L11 8\"/><path d=\"M16.5 4.5v15M13 16l3.5 3.5 3.4-3.5\"/></symbol>\n    <symbol id=\"i-pin\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"置顶\" data-keywords=\"固定 图钉 置顶记录 大头针 pin to top thumbtack\"><path transform=\"rotate(36 12 12)\" d=\"M7.5 3.8h9M9 4v5.2c0 1.4-.7 2.1-2.4 3.4l-1 1V15h12.8v-1.4l-1-1C15.7 11.3 15 10.6 15 9.2V4M12 15v5.7\" fill=\"var(--ml-icon-alloy, none)\"/></symbol>\n    <symbol id=\"i-reset\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"重置\" data-keywords=\"刷新 恢复 reset refresh restore\"><path d=\"M4 5v5h5m-4.7-.5a8 8 0 1 1 .9 7.3\"/></symbol>\n    <symbol id=\"i-refresh\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"刷新\" data-keywords=\"重新加载 重试 同步 更新 reload retry sync update\"><path d=\"M20 4.5v5h-5M4 19.5v-5h5M4.3 9a8.2 8.2 0 0 1 13.4-3L20 9.5M19.7 15a8.2 8.2 0 0 1-13.4 3L4 14.5\"/></symbol>\n    <symbol id=\"i-undo\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"撤销\" data-keywords=\"撤回 撤销移除 上一步 复原 undo revert\"><path d=\"m8.2 4.8-4.6 4.6L8.2 14M4 9.4h10.1a6.1 6.1 0 0 1 6.1 6.1v3.2\"/></symbol>\n    <symbol id=\"i-redo\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"重做\" data-keywords=\"恢复撤销 重做操作 下一步 redo reapply\"><path d=\"m15.8 4.8 4.6 4.6-4.6 4.6M20 9.4H9.9a6.1 6.1 0 0 0-6.1 6.1v3.2\"/></symbol>\n    <symbol id=\"i-zoom\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"放大查看\" data-keywords=\"缩放 放大镜 zoom in zoom-in\"><circle cx=\"10.5\" cy=\"10.5\" r=\"6.4\" fill=\"var(--ml-icon-lens, none)\"/><path d=\"m15.4 15.4 4.8 4.8M8 10.5h5m-2.5-2.5v5\"/></symbol>\n    <symbol id=\"i-zoom-out\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"缩小查看\" data-keywords=\"缩放 缩小 放大镜 zoom out zoom-out magnifier\"><circle cx=\"10.5\" cy=\"10.5\" r=\"6.4\" fill=\"var(--ml-icon-lens, none)\"/><path d=\"m15.4 15.4 4.8 4.8M8 10.5h5\"/></symbol>\n    <symbol id=\"i-share\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"分享\" data-keywords=\"共享 发送 share send\"><path d=\"M12 15V3.5m-3.6 3.6L12 3.5l3.6 3.6\"/><path d=\"M7.7 9.5H6A2 2 0 0 0 4 11.5v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1.7\"/></symbol>\n    <symbol id=\"i-download\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"下载\" data-keywords=\"导出 保存 下载到本地 export save\"><path d=\"M12 3.5v11m-4-4 4 4 4-4\"/><path d=\"M4.5 15.5v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3\"/></symbol>\n    <symbol id=\"i-upload\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"上传\" data-keywords=\"导入 文件 import upload\"><path d=\"M12 15V4m-4 4 4-4 4 4\"/><path d=\"M4.5 15.5v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3\"/></symbol>\n    <symbol id=\"i-save\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"保存\" data-keywords=\"存储 保存修改 草稿 软盘 save disk floppy\"><path d=\"M5.3 3.5h10.4l4.8 4.8v10.4a1.8 1.8 0 0 1-1.8 1.8H5.3a1.8 1.8 0 0 1-1.8-1.8V5.3a1.8 1.8 0 0 1 1.8-1.8ZM7.6 3.8v5h7.5v-5M7.5 20.2v-7h9v7\" fill=\"var(--ml-icon-pane, none)\"/></symbol>\n    <symbol id=\"i-play\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"播放\" data-keywords=\"开始 启动 运行 继续 回放 媒体 start resume playback\"><path d=\"M7.3 4.1 20 12 7.3 19.9Z\" fill=\"var(--ml-icon-pane, none)\"/></symbol>\n    <symbol id=\"i-pause\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"暂停\" data-keywords=\"暂停播放 挂起 等待 媒体 hold suspend playback\"><rect x=\"5.5\" y=\"4.5\" width=\"3.7\" height=\"15\" rx=\"1\" fill=\"var(--ml-icon-alloy, none)\"/><rect x=\"14.8\" y=\"4.5\" width=\"3.7\" height=\"15\" rx=\"1\" fill=\"var(--ml-icon-alloy, none)\"/></symbol>\n    <symbol id=\"i-stop\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"停止\" data-keywords=\"结束 停止播放 停止任务 媒体 end halt playback\"><rect x=\"5\" y=\"5\" width=\"14\" height=\"14\" rx=\"2.1\" fill=\"var(--ml-icon-pane, none)\"/></symbol>\n  </defs>\n  <defs data-category=\"content\" data-label=\"文件与内容\">\n    <symbol id=\"i-folder\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"文件夹\" data-keywords=\"目录 资料 文件 folder directory\"><path d=\"M3 7.5A1.5 1.5 0 0 1 4.5 6h5l2 2h8A1.5 1.5 0 0 1 21 9.5V18a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18ZM3.5 10.5h17\" fill=\"var(--ml-icon-pane, none)\"/></symbol>\n    <symbol id=\"i-file\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"文件\" data-keywords=\"文档 资料 document file\"><path d=\"M6.5 3.5h7l4.8 4.8v10.5a1.7 1.7 0 0 1-1.7 1.7H6.5a1.7 1.7 0 0 1-1.7-1.7V5.2a1.7 1.7 0 0 1 1.7-1.7ZM13.3 3.8v4.8h4.8M8.5 13h6.6m-6.6 3.2h4.7\" fill=\"var(--ml-icon-pane, none)\"/></symbol>\n    <symbol id=\"i-form\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"表单\" data-keywords=\"填写 表格 记录 form record\"><rect x=\"4\" y=\"4.5\" width=\"16\" height=\"15\" rx=\"3\" fill=\"var(--ml-icon-pane, none)\"/><path d=\"M8 9h8m-8 4h4\"/></symbol>\n    <symbol id=\"i-image\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"图像\" data-keywords=\"图片 照片 截图 photo picture\"><rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"3\" fill=\"var(--ml-icon-pane, none)\"/><circle cx=\"8.2\" cy=\"9\" r=\"1.35\" fill=\"var(--ml-icon-lens, none)\"/><path d=\"m4 17 4.5-4.5 3 2.6 3.8-4.4 5.3 5.5\"/></symbol>\n    <symbol id=\"i-image-off\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"无图像\" data-keywords=\"暂无图像 暂无画面 无信号 图片不可用 空帧 missing image unavailable no frame\"><path d=\"m3.5 3.5 17 17M8 4h10a3 3 0 0 1 3 3v9M4 5a3 3 0 0 0-1 2.2V17a3 3 0 0 0 3 3h11.5M4.2 17l4.3-4.4 2.9 2.5 1.7-1.8\"/><circle cx=\"15.8\" cy=\"8.5\" r=\"1.35\" fill=\"var(--ml-icon-lens, none)\"/></symbol>\n    <symbol id=\"i-tag\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"标签\" data-keywords=\"标注 分类 label category\"><path d=\"M3.5 5.5v6.1c0 .5.2.9.5 1.2l7.9 7.8a1.6 1.6 0 0 0 2.3 0l6.4-6.4a1.6 1.6 0 0 0 0-2.3L12.8 4a1.7 1.7 0 0 0-1.2-.5H5.5a2 2 0 0 0-2 2Z\" fill=\"var(--ml-icon-pane, none)\"/><circle cx=\"8.1\" cy=\"8.1\" r=\"1.1\"/></symbol>\n    <symbol id=\"i-bookmark\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"收藏\" data-keywords=\"书签 保存 favorite star\"><path d=\"M6.5 4.5h11v15l-5.5-3.7-5.5 3.7z\" fill=\"var(--ml-icon-pane, none)\"/></symbol>\n    <symbol id=\"i-link\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"链接\" data-keywords=\"关联 地址 跳转 url chain\"><path d=\"m10 13.9 4-4m-1.1-3.5 1.5-1.5a4 4 0 0 1 5.7 5.7l-3.1 3.1a4 4 0 0 1-5.7 0m-.2 3.9-1.5 1.5a4 4 0 0 1-5.7-5.7l3.1-3.1a4 4 0 0 1 5.7 0\"/></symbol>\n    <symbol id=\"i-archive\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"归档\" data-keywords=\"存档 箱子 收纳 archive box\"><rect x=\"3\" y=\"4\" width=\"18\" height=\"5\" rx=\"1.5\" fill=\"var(--ml-icon-pane, none)\"/><path d=\"M5 9v10h14V9M9.5 13h5\" fill=\"var(--ml-icon-pane, none)\"/></symbol>\n    <symbol id=\"i-code\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"代码\" data-keywords=\"开发 标签 编程 source markup\"><path d=\"m7.5 7-5 5 5 5m9-10 5 5-5 5m-3-13-3 16\"/></symbol>\n    <symbol id=\"i-calendar\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"日历\" data-keywords=\"日期 排期 时间 date schedule\"><rect x=\"3.5\" y=\"5.5\" width=\"17\" height=\"15\" rx=\"2.5\" fill=\"var(--ml-icon-pane, none)\"/><path d=\"M7.5 3.5v4M16.5 3.5v4M4 10h16M8 14h2m4 0h2\"/></symbol>\n  </defs>\n  <defs data-category=\"status\" data-label=\"状态与通知\">\n    <symbol id=\"i-bell\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"通知\" data-keywords=\"消息 提醒 铃铛 notification alert\"><path d=\"M18 10a6 6 0 0 0-12 0c0 4-1 5.5-2.4 7h16.8C19 15.5 18 14 18 10ZM10 20a2.3 2.3 0 0 0 4 0\" fill=\"var(--ml-icon-pane, none)\"/></symbol>\n    <symbol id=\"i-bell-off\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"关闭通知\" data-keywords=\"免打扰 静音通知 取消订阅 勿扰 muted notifications silent do not disturb\"><path d=\"m3.5 3.5 17 17M9.4 4.6A6 6 0 0 1 18 10c0 2.1.3 3.6 1 5M6.8 6.8A6.1 6.1 0 0 0 6 10c0 4-1 5.5-2.4 7H17M10 20a2.3 2.3 0 0 0 4 0\"/></symbol>\n    <symbol id=\"i-info\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"信息\" data-keywords=\"说明 提示 帮助 information help\"><circle cx=\"12\" cy=\"12\" r=\"8.6\" fill=\"var(--ml-icon-pane, none)\"/><path d=\"M12 11v5m0-9v.2\"/></symbol>\n    <symbol id=\"i-help-circle\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"帮助\" data-keywords=\"问号 疑问 使用指南 帮助中心 question help support\"><circle cx=\"12\" cy=\"12\" r=\"8.6\" fill=\"var(--ml-icon-pane, none)\"/><path d=\"M9.4 9.4a2.7 2.7 0 1 1 4.4 2.1c-1.2.8-1.8 1.3-1.8 2.5m0 2.8v.12\"/></symbol>\n    <symbol id=\"i-check-circle\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"成功\" data-keywords=\"完成 正常 通过 success done ok\"><circle cx=\"12\" cy=\"12\" r=\"8.7\" fill=\"var(--ml-icon-pane, none)\"/><path d=\"m7.8 12.1 2.9 3 5.5-6.3\"/></symbol>\n    <symbol id=\"i-warning\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"警告\" data-keywords=\"注意 告警 三角 感叹 caution alert\"><path d=\"m10.5 4.6-8 13.9a1.6 1.6 0 0 0 1.4 2.4h16.2a1.6 1.6 0 0 0 1.4-2.4l-8-13.9a1.7 1.7 0 0 0-3 0ZM12 9v4.5m0 3.1v.1\" fill=\"var(--ml-icon-pane, none)\"/></symbol>\n    <symbol id=\"i-error-circle\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"异常\" data-keywords=\"错误 禁止 故障 error fault stop\"><circle cx=\"12\" cy=\"12\" r=\"8.7\" fill=\"var(--ml-icon-pane, none)\"/><path d=\"M7.8 12h8.4\"/></symbol>\n    <symbol id=\"i-clock\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"时钟\" data-keywords=\"时间 历史 时间戳 clock time history\"><circle cx=\"12\" cy=\"12\" r=\"8.7\" fill=\"var(--ml-icon-lens, none)\"/><path d=\"M12 7v5.1l3.6 2\"/></symbol>\n    <symbol id=\"i-timer\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"计时\" data-keywords=\"间隔 秒表 耗时 timer stopwatch\"><circle cx=\"12\" cy=\"13.5\" r=\"7.2\" fill=\"var(--ml-icon-lens, none)\"/><path d=\"M12 9.3v4.3l2.8 1.9\"/><path d=\"M9.5 3h5M12 3v3\"/></symbol>\n    <symbol id=\"i-signal\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"信号\" data-keywords=\"状态 波形 脉冲 activity waveform pulse\"><path d=\"M2 12h4l3-7 4.5 14 3-9 1.5 2h4\"/></symbol>\n    <symbol id=\"i-toggle\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"开关\" data-keywords=\"启用 禁用 通断 switch toggle\"><rect x=\"2\" y=\"6\" width=\"20\" height=\"12\" rx=\"6\" fill=\"var(--ml-icon-pane, none)\"/><circle cx=\"15.7\" cy=\"12\" r=\"3\" fill=\"var(--ml-icon-lens, none)\"/></symbol>\n    <symbol id=\"i-eye\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"显示\" data-keywords=\"查看 预览 眼睛 show visible\"><path d=\"M2.5 12s3.3-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.3 6.5-9.5 6.5S2.5 12 2.5 12Z\" fill=\"var(--ml-icon-lens, none)\"/><circle cx=\"12\" cy=\"12\" r=\"2.8\"/></symbol>\n    <symbol id=\"i-eye-off\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"隐藏\" data-keywords=\"不可见 隐私 眼睛 hide invisible\"><path d=\"m3.5 3.5 17 17M6.8 7.2A18.4 18.4 0 0 0 2.5 12s3.3 6.5 9.5 6.5c1.6 0 3-.4 4.2-1M9.5 5.9c.8-.3 1.6-.4 2.5-.4 6.2 0 9.5 6.5 9.5 6.5a18 18 0 0 1-2.7 3.4M9.4 11.4a2.7 2.7 0 0 0 3.2 3.2\"/></symbol>\n    <symbol id=\"i-lock\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"锁定\" data-keywords=\"锁 已锁 密码 权限 安全 只读 padlock locked secure permission\"><rect x=\"5\" y=\"10.5\" width=\"14\" height=\"10\" rx=\"2.2\" fill=\"var(--ml-icon-pane, none)\"/><path d=\"M8.3 10.4V7.3a3.7 3.7 0 0 1 7.4 0v3.1\"/><path d=\"M12 14.5v2.1\"/></symbol>\n    <symbol id=\"i-unlock\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"解锁\" data-keywords=\"开锁 已解锁 可编辑 权限 unlocked open padlock permission\"><rect x=\"5\" y=\"10.5\" width=\"14\" height=\"10\" rx=\"2.2\" fill=\"var(--ml-icon-pane, none)\"/><path d=\"M8.3 10.4V7.3a3.7 3.7 0 0 1 7.1-1.5\"/><path d=\"M12 14.5v2.1\"/></symbol>\n    <symbol id=\"i-sun\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"太阳\" data-keywords=\"浅色模式 日间 白天 明亮 亮度 light theme daylight brightness\"><circle cx=\"12\" cy=\"12\" r=\"4.1\" fill=\"var(--ml-icon-lens, none)\"/><path d=\"M12 2.6v2M12 19.4v2M2.6 12h2M19.4 12h2M5.35 5.35l1.45 1.45m10.4 10.4 1.45 1.45M5.35 18.65l1.45-1.45M17.2 6.8l1.45-1.45\"/></symbol>\n    <symbol id=\"i-moon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"月亮\" data-keywords=\"深色模式 夜间 暗色 夜晚 dark theme night crescent\"><path d=\"M20.6 14.8A8 8 0 0 1 9.2 3.4a8.7 8.7 0 1 0 11.4 11.4Z\" fill=\"var(--ml-icon-lens, none)\"/></symbol>\n  </defs>\n  <defs data-category=\"inspection\" data-label=\"设备与测量\">\n    <symbol id=\"i-camera\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"相机\" data-keywords=\"拍照 摄像头 摄影 camera photo imaging\"><path d=\"M4.4 7.5h3l1.5-2.7h6.2l1.5 2.7h3a1.9 1.9 0 0 1 1.9 1.9v8.2a1.9 1.9 0 0 1-1.9 1.9H4.4a1.9 1.9 0 0 1-1.9-1.9V9.4a1.9 1.9 0 0 1 1.9-1.9Z\" fill=\"var(--ml-icon-pane, none)\"/><circle cx=\"12\" cy=\"13\" r=\"3.6\" fill=\"var(--ml-icon-lens, none)\"/></symbol>\n    <symbol id=\"i-aperture\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"光圈\" data-keywords=\"镜头 成像 采集 曝光 aperture lens exposure shutter\"><circle cx=\"12\" cy=\"12\" r=\"8.7\" fill=\"var(--ml-icon-lens, none)\"/><path d=\"M12 8.55L20.39 13.39M14.99 10.28L14.99 19.96M14.99 13.72L6.6 18.57M12 15.45L3.61 10.61M9.01 13.72L9.01 4.04M9.01 10.27L17.4 5.43\"/></symbol>\n    <symbol id=\"i-video\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"录像\" data-keywords=\"视频 录制 摄像头 video record\"><rect x=\"2.5\" y=\"6\" width=\"13.5\" height=\"12\" rx=\"2.5\" fill=\"var(--ml-icon-pane, none)\"/><path d=\"m16 10 5-3v10l-5-3\" fill=\"var(--ml-icon-lens, none)\"/></symbol>\n    <symbol id=\"i-frame\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"取景框\" data-keywords=\"瞄准 定位 预览 取景 viewfinder focus\"><path d=\"M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9m6 0h3.5A1.5 1.5 0 0 1 20 5.5V9m0 6v3.5a1.5 1.5 0 0 1-1.5 1.5H15m-6 0H5.5A1.5 1.5 0 0 1 4 18.5V15\"/><circle cx=\"12\" cy=\"12\" r=\"1.4\" fill=\"var(--ml-icon-lens, none)\"/></symbol>\n    <symbol id=\"i-scan-line\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"扫描\" data-keywords=\"巡检 扫描线 检测 scan inspect\"><path d=\"M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8m8 0h2.5A1.5 1.5 0 0 1 20 5.5V8m0 8v2.5a1.5 1.5 0 0 1-1.5 1.5H16m-8 0H5.5A1.5 1.5 0 0 1 4 18.5V16\"/><path d=\"M2.7 12h18.6\"/></symbol>\n    <symbol id=\"i-pipe\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"管道\" data-keywords=\"管线 弯管 管系 管路 pipe pipeline elbow\"><path data-ml-glass-face=\"\" stroke=\"none\" fill=\"var(--ml-icon-pane, none)\" d=\"M4 6.5h7.7a6 6 0 0 1 6 6V18h-5v-5.3a1.2 1.2 0 0 0-1.2-1.2H4Z\"/><path d=\"M4 6.5h7.7a6 6 0 0 1 6 6V18M4 11.5h7.5a1.2 1.2 0 0 1 1.2 1.2V18M3.5 4.8v8.4m7.6 5.4h8.3\"/></symbol>\n    <symbol id=\"i-drop\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"水滴\" data-keywords=\"水 液体 湿度 滴水 water liquid humidity droplet\"><path d=\"M12 2.8S5.2 10.9 5.2 15a6.8 6.8 0 0 0 13.6 0c0-4.1-6.8-12.2-6.8-12.2Zm-3.9 12.3a3.8 3.8 0 0 0 2.7 3.6\" fill=\"var(--ml-icon-lens, none)\"/></symbol>\n    <symbol id=\"i-gauge\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"仪表\" data-keywords=\"仪表盘 压力 表计 测量 gauge meter pressure\"><path d=\"M4.4 18.5a9 9 0 1 1 15.2 0ZM12 5.8v1.5m-6.1 1.3 1 1.1m11.2-1.1-1 1.1\" fill=\"var(--ml-icon-pane, none)\"/><path d=\"M14 10l-2.4 4.1\"/><circle cx=\"11.3\" cy=\"15.2\" r=\"1.2\" fill=\"var(--ml-icon-alloy, none)\"/></symbol>\n    <symbol id=\"i-crosshair\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"定位\" data-keywords=\"坐标 靶心 目标 位置 target location\"><circle cx=\"12\" cy=\"12\" r=\"7\" fill=\"var(--ml-icon-lens, none)\"/><path d=\"M12 2.5v4M12 17.5v4M2.5 12h4m11 0h4\"/><circle cx=\"12\" cy=\"12\" r=\"1\" fill=\"currentColor\" stroke=\"none\"/></symbol>\n    <symbol id=\"i-map-pin\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"位置标记\" data-keywords=\"地图 地点 点位 地图标记 位置 map marker location place\"><path d=\"M19 10c0 4.8-7 10.6-7 10.6S5 14.8 5 10a7 7 0 1 1 14 0Z\" fill=\"var(--ml-icon-pane, none)\"/><circle cx=\"12\" cy=\"10\" r=\"2.45\" fill=\"var(--ml-icon-lens, none)\"/></symbol>\n    <symbol id=\"i-cube\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"三维视图\" data-keywords=\"立方体 三维场景 模型 空间 3D box model scene\"><path data-ml-glass-face=\"\" stroke=\"none\" fill=\"var(--ml-icon-alloy, none)\" d=\"m12 12.2 8.3-4.7v9L12 21.1Z\"/><path d=\"M12 2.9 20.3 7.5v9L12 21.1l-8.3-4.6v-9ZM3.9 7.6l8.1 4.6 8.1-4.6M12 12.2v8.7\" fill=\"var(--ml-icon-pane, none)\"/></symbol>\n    <symbol id=\"i-ruler\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"标尺\" data-keywords=\"尺子 测量 长度 距离 尺寸 measure measurement distance scale\"><g transform=\"rotate(-40 12 12)\"><rect x=\"2.9\" y=\"8\" width=\"18.2\" height=\"8\" rx=\"1.4\" fill=\"var(--ml-icon-alloy, none)\"/><path d=\"M7.2 8.2v2.1m3.2-2.1v3.4m3.2-3.4v2.1m3.2-2.1v3.4\"/></g></symbol>\n    <symbol id=\"i-antenna\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"通信天线\" data-keywords=\"无线 通道 信号 收发 连接 天线 radio antenna broadcast connection\"><path d=\"M5 5.5a9.6 9.6 0 0 0 0 13M19 5.5a9.6 9.6 0 0 1 0 13\"/><path d=\"M8 8.3a5.5 5.5 0 0 0 0 7.4m8-7.4a5.5 5.5 0 0 1 0 7.4\"/><path d=\"M12 14v6.6\"/><circle cx=\"12\" cy=\"12\" r=\"1.65\" fill=\"var(--ml-icon-lens, none)\"/></symbol>\n    <symbol id=\"i-thermometer\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"温度\" data-keywords=\"热度 温度计 测温 thermal temperature\"><path d=\"M9.5 5.4a2.5 2.5 0 0 1 5 0v8.2a4.6 4.6 0 1 1-5 0Z\" fill=\"var(--ml-icon-lens, none)\"/><path d=\"M12 7.6v8.2\"/><circle cx=\"12\" cy=\"17.4\" r=\"1.4\" fill=\"currentColor\" stroke=\"none\"/></symbol>\n    <symbol id=\"i-keyboard\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"键盘\" data-keywords=\"输入 快捷键 keyboard shortcut\"><rect x=\"2.5\" y=\"5.5\" width=\"19\" height=\"13\" rx=\"3\" fill=\"var(--ml-icon-pane, none)\"/><path d=\"M6.7 9h.1m3.4 0h.1m3.4 0h.1m3.4 0h.1M7 14.5h10\"/></symbol>\n  </defs>\n</svg>";
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
  function createIconMotion(art) {
    function move(poses, duration = 430, origin = '50% 50%', box = 'view-box') {
      const frames = ['none', ...poses, 'none'].map(transform => ({
        transform, transformOrigin: origin, transformBox: box, easing: 'cubic-bezier(.33,0,.2,1)',
      }));
      return { frames, duration };
    }

    const left = move(['translateX(-9%)', 'translateX(1.5%)']);
    const right = move(['translateX(9%)', 'translateX(-1.5%)']);
    const up = move(['translateY(-9%)', 'translateY(1.5%)']);
    const down = move(['translateY(9%)', 'translateY(-1.5%)']);
    const grow = move(['scale(1.14)', 'scale(.98)']);
    const tuck = move(['scale(.83)', 'scale(1.025)']);
    const lift = move(['translateY(-6%) scale(1.035)', 'translateY(1%)']);
    const tilt = move(['rotate(-9deg)', 'rotate(2deg)'], 460);
    const turn = move(['rotate(-5deg)', 'rotate(34deg)', 'rotate(-2deg)'], 570);
    const rewind = move(['rotate(5deg)', 'rotate(-34deg)', 'rotate(2deg)'], 570);
    const place = move(['translateY(-6%)', 'translateY(5%) scale(1.04,.95)'], 490, '50% 82%');
    const ring = move(['rotate(13deg)', 'rotate(-10deg)', 'rotate(5deg)', 'rotate(-2deg)'], 610, '50% 19%');
    const shake = move(['translateX(-5%)', 'translateX(5%)', 'translateX(-2%)'], 400);
    const dim = { frames: [{ opacity: 1 }, { opacity: .60 }, { opacity: 1 }], duration: 420 };
    const draw = {
      duration: 470,
      frames(path) {
        const length = path.getTotalLength();
        return [0, length * .8, 0].map(strokeDashoffset => ({
          strokeDasharray: length + ' ' + length, strokeDashoffset, easing: 'ease-in-out',
        }));
      },
    };

    // A symbol reference exposes one drawable element. An ml-icon also exposes its individual strokes.
    const recipes = new Map();
    function part(selector, motion, stagger = 0) { return { selector, motion, stagger }; }
    function assign(names, whole, ...parts) {
      for (const name of names.split(' ')) recipes.set(name, { whole, parts });
    }

    assign('layers', lift, part('path:first-child', up), part('path:nth-child(2)', move(['translateY(-4%)'])));
    assign('home page', lift);
    assign('grid', grow, part('rect', move(['scale(.75)', 'scale(1.05)'], 360, '50% 50%', 'fill-box'), 48));
    assign('list menu', right, part('path', move(['translateX(6%)']), 50));
    assign('sidebar', right, part('path', right));
    assign('more', up, part('circle', up, 64));
    assign('mode', right, part('rect:last-child', move(['translateX(6%)'])));
    assign('modal', grow, part('rect:last-child', grow));
    assign('expand size plus zoom', grow);
    assign('collapse minus zoom-out stop', tuck);
    assign('chevron-left arrow-left', left);
    assign('chevron-right arrow-right play', right);
    assign('chevron-up arrow-up', up);
    assign('chevron-down arrow-down', down);

    assign('search', move(['translate(-3%,-3%) rotate(-11deg)', 'rotate(2deg)'], 470, '66% 66%'));
    assign('check check-circle', grow, part('path', draw));
    assign('close', tilt);
    assign('edit', move(['translate(-3%,4%) rotate(-5deg)', 'translate(5%,-3%) rotate(3deg)'], 480));
    assign('copy', lift, part('rect', move(['translate(6%,6%)', 'translate(-1%,-1%)'])));
    assign('trash', tilt, part('path:first-child', move(['translateY(-6%) rotate(-9deg)', 'rotate(2deg)'], 470, '78% 29%')));
    assign('settings', turn, part('path', turn));
    assign('sliders', right, part('g:first-child', right), part('g:last-child', left));
    assign('filter', move(['scale(.86,1.06)', 'scale(1.02,.99)'], 440, '50% 75%'));
    assign('sort', up, part('path:first-child', up), part('path:last-child', down));
    assign('pin map-pin bookmark', place);
    assign('refresh', turn);
    assign('reset', rewind);
    assign('undo', move(['translateX(-7%) rotate(-9deg)', 'rotate(2deg)']));
    assign('redo', move(['translateX(7%) rotate(9deg)', 'rotate(-2deg)']));
    assign('share upload', up, part('path:first-child', up));
    assign('download', down, part('path:first-child', down));
    assign('save', down);
    assign('pause', tuck, part('rect:first-child', move(['translateX(5%)'])), part('rect:last-child', move(['translateX(-5%)'])));

    assign('folder file calendar', move(['rotate(-6deg) translateY(-3%)', 'rotate(1deg)'], 450, '22% 78%'));
    assign('form', right, part('path', move(['scaleX(.64)', 'scaleX(1.025)'], 440, '33% 50%')));
    assign('image', lift, part('path', move(['translateY(-5%)'])));
    assign('image-off eye-off bell-off', dim);
    assign('tag', move(['rotate(11deg)', 'rotate(-4deg)'], 500, '34% 34%'));
    assign('link', move(['rotate(-7deg) scaleX(1.07)', 'rotate(2deg)']));
    assign('archive', up, part('rect', up));
    assign('code', move(['scaleX(1.085)', 'scaleX(.985)']));

    assign('bell', ring);
    assign('info', lift, part('path', move(['translateY(-5%)'])));
    assign('help-circle', tilt, part('path', tilt));
    assign('warning', shake);
    assign('error-circle', shake, part('path', move(['scaleX(.68)', 'scaleX(1.06)'])));
    assign('clock', turn, part('path', move(['rotate(35deg)', 'rotate(-3deg)'], 500)));
    assign('timer', turn, part('path:first-of-type', move(['rotate(35deg)', 'rotate(-3deg)'], 500, '50% 56.25%')));
    assign('signal', move(['scaleY(.62)', 'scaleY(1.1)', 'scaleY(.96)'], 530));
    assign('toggle', left, part('circle', move(['translateX(-16%)', 'translateX(1%)'], 480)));
    assign('eye', right, part('circle', move(['translateX(9%)', 'translateX(-3%)'], 470)));
    assign('lock', down, part('path:first-of-type', move(['translateY(5%)', 'translateY(-1%)'])));
    assign('unlock', up, part('path:first-of-type', move(['rotate(-12deg)', 'rotate(2deg)'], 460, '35% 44%')));
    assign('sun aperture', turn, part('path', turn));
    assign('moon', tilt);

    assign('camera', tuck, part('circle', move(['scale(.60)', 'scale(1.08)'], 420, '50% 50%', 'fill-box')));
    assign('video', right, part('path', move(['scaleX(.70)', 'scaleX(1.05)'], 440, '67% 50%')));
    assign('frame', tuck, part('path', tuck));
    assign('scan-line', down, part('path:last-child', move(['translateY(-18%)', 'translateY(18%)'], 590)));
    assign('pipe', right, part('path:last-child', {
      duration: 610,
      frames: [
        { opacity: 0, strokeDashoffset: .22 }, { opacity: .95, strokeDashoffset: 0, offset: .18 },
        { opacity: .95, strokeDashoffset: -.77, offset: .80 }, { opacity: 0, strokeDashoffset: -1 },
      ],
    }));
    assign('drop', place);
    assign('gauge', turn, part('path:nth-of-type(2)', move(['rotate(30deg)', 'rotate(-7deg)', 'rotate(2deg)'], 590, '47.08% 63.33%')));
    assign('crosshair', tuck, part('circle:first-child', tuck), part('path', tuck));
    assign('cube', move(['rotate(-8deg) scale(.96)', 'rotate(2deg)']));
    assign('ruler', right, part('path', move(['scaleY(.62)'], 420, '50% 0%', 'fill-box')));
    assign('antenna', grow, part('path:nth-child(2)', grow), part('path:first-child', move(['scale(.92)', 'scale(1.06)'], 550)));
    assign('thermometer', up, part('path:last-of-type', move(['scaleY(.58)', 'scaleY(1.06)'], 510, '50% 66%')));
    assign('keyboard', down, part('path', move(['translateY(5%)'])));

    const active = new Map();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const disabled = '[hidden], [inert], [disabled], [aria-disabled="true"], [aria-busy="true"], :disabled';
    const controls = 'button, a[href], label, summary, [role="button"], [role="tab"], [role="option"], [role="switch"], [role="radio"], [role="checkbox"], [role^="menuitem"]';
    const glyphs = 'ml-icon, svg > use:only-of-type';

    function allowed(icon) {
      if (!icon.isConnected || icon.ownerDocument.hidden || reduced.matches) return false;
      let level;
      for (let node = icon; node; node = iconParent(node)) {
        level ??= node.getAttribute('data-ml-motion');
        if (node.matches(disabled) || (node.localName === 'label' && node.control?.matches(disabled))) return false;
      }
      if (level != null) return level === 'high';
      return getComputedStyle(icon).getPropertyValue('--ml-follow').trim() === '1';
    }

    function forget(icon, animations) {
      if (active.get(icon) !== animations) return;
      active.delete(icon);
      if (!active.size) observer.disconnect();
    }
    function stop(icon) {
      const animations = active.get(icon);
      if (!animations) return;
      forget(icon, animations);
      for (const animation of animations) animation.cancel();
    }
    function checkActive() {
      for (const icon of active.keys()) if (!allowed(icon)) stop(icon);
    }
    const observer = new MutationObserver(records => {
      for (const record of records) if (record.attributeName === 'href') stop(record.target);
      checkActive();
    });
    const observeOptions = { subtree: true, childList: true, attributes: true,
      attributeFilter: ['data-ml-motion', 'disabled', 'aria-disabled', 'aria-busy', 'inert', 'hidden', 'href', 'slot', 'name'] };
    reduced.addEventListener('change', checkActive);
    document.addEventListener('visibilitychange', checkActive);

    function prepare(svg, name) {
      const group = svg.ownerDocument.createElementNS(svg.namespaceURI, 'g');
      group.append(...svg.children);
      if (name === 'pipe') {
        // The moving dash follows the centre of the elbow. Only the live icon needs it.
        const flow = svg.ownerDocument.createElementNS(svg.namespaceURI, 'path');
        flow.setAttribute('d', 'M4 9h7.5a3.6 3.6 0 0 1 3.6 3.6v4.9');
        flow.setAttribute('pathLength', '1');
        flow.setAttribute('stroke-dasharray', '.22 1');
        flow.setAttribute('stroke-width', '1.15');
        flow.setAttribute('opacity', '0');
        group.append(flow);
      }
      svg.append(group);
    }

    function play(icon, restart = false) {
      if ((!restart && active.has(icon)) || !allowed(icon)) return false;
      const instance = icon.localName === 'ml-icon';
      const name = instance ? icon.getAttribute('name') : symbolName(icon);
      const recipe = recipes.get(name);
      const group = instance ? icon.firstElementChild?.firstElementChild : icon;
      if (!recipe || !art.has(name) || !group?.animate) return false;
      stop(icon);
      const animations = [];
      function animate(target, motion, delay = 0) {
        const frames = typeof motion.frames === 'function' ? motion.frames(target) : motion.frames;
        animations.push(target.animate(frames, { duration: motion.duration, delay }));
      }
      if (instance) {
        for (const { selector, motion, stagger } of recipe.parts) {
          group.querySelectorAll(selector).forEach((shape, index) => animate(shape, motion, index * stagger));
        }
      }
      if (!animations.length) animate(group, recipe.whole);
      active.set(icon, animations);
      let previousRoot;
      for (let node = icon; node; node = iconParent(node)) {
        const root = node.getRootNode();
        if (root !== previousRoot) observer.observe(root, observeOptions);
        previousRoot = root;
      }
      Promise.allSettled(animations.map(animation => animation.finished)).then(() => forget(icon, animations));
      return true;
    }

    function playWithin(element) {
      if (element.matches?.(glyphs)) play(element);
      else element.querySelectorAll(glyphs).forEach(icon => play(icon));
    }
    function handle(event) {
      if (reduced.matches || (event.type === 'pointerover' && event.pointerType === 'touch')) return;
      const path = event.composedPath();
      const control = path.find(node => node.matches?.(controls));
      const glyph = path.find(node => node.localName === 'ml-icon') ?? path.find(node => node.localName === 'svg');
      const target = control ?? glyph ?? path[0]?.labels?.[0];
      if (!target || (event.type === 'pointerover' && target.contains(event.relatedTarget))) return;
      playWithin(target);
      const content = target.shadowRoot ?? target;
      if (content !== target) playWithin(content);
      for (const slot of content.querySelectorAll('slot')) slot.assignedElements({ flatten: true }).forEach(playWithin);
    }
    const listening = new WeakSet();
    function listen(root) {
      if (listening.has(root)) return;
      listening.add(root);
      for (const type of ['pointerover', 'focusin', 'click']) root.addEventListener(type, handle, { capture: true, passive: true });
    }
    listen(document);
    return { prepare, listen, play, stop, allowed };
  }
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
