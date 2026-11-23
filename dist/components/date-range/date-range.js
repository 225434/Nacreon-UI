/* Generated from src/glass-shader.js and src/glass.js and src/control-glass.js and src/value-controls.js and src/calendar.js and src/date-range.js by build.mjs. */
(() => {
  'use strict';

  const key = Symbol.for('material-lib.glass-shader.v1');
  if (globalThis[key]?.version >= 6) return;

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
    uniform float progress, lens, pixel, hasImage, density;
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

    // One wavelength of light followed through the glass body and out the flat back.
    vec2 refractTravel(vec3 normal, float frontHeight, float opticalRadius, float arc, float ior) {
      vec3 ray = refract(vec3(0., 0., -1.), normal, 1. / ior);
      float path = ${optics.chord} * frontHeight / -ray.z;
      float exitCos2 = 1. - ior * ior * dot(ray.xy, ray.xy);
      float escape = smoothstep(0., .16, exitCos2);
      vec2 exitSlope = ray.xy * ior * inversesqrt(max(.16, exitCos2));
      return ray.xy * path + exitSlope * (escape * ${optics.clearance} * opticalRadius * arc);
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
      float wave = 0.;
      float wobble = 0.;
      if (progress < 1.) {
        float reach = length(max(contact, size - contact));
        float front = reach * (1. - (1. - progress) * (1. - progress));
        float along = length(size * uv - contact);
        float offset = (along - front) / max(1.4, bevel * .23);
        wave = exp(-offset * offset) * (1. - progress);
        // A weaker crest chases the first so a press reads as liquid.
        float trail = (along - front * .52) / max(1.4, bevel * .34);
        wave += .55 * exp(-trail * trail) * (1. - progress) * (1. - progress);
        wobble = sin(progress * 12.5663706) * (1. - progress) * (1. - progress);
      }
      float frontHeight = opticalRadius * arc * crown * (1. + .26 * wobble);
      vec2 gradient = 2. * ${optics.crown} * opticalRadius * arc * local * arch.yx / halfSize
        + outward * (crown / ${optics.rim}) * slope / max(.15, arc);
      vec2 ripple = (size * uv - contact) / max(1., length(size * uv - contact));
      vec3 normal = normalize(vec3(gradient + .26 * wave * ripple, 1.));
      // Follow the mean ray through the whole chord, then out through the flat back.
      // Near the critical angle the escaping ray gives way to an internal reflection.
      const float ior = ${optics.index};
      const float spread = .055;
      vec3 ray = refract(vec3(0., 0., -1.), normal, 1. / ior);
      float path = ${optics.chord} * frontHeight / -ray.z;
      float exitCos2 = 1. - ior * ior * dot(ray.xy, ray.xy);
      float escape = smoothstep(0., .16, exitCos2);
      vec2 exitSlope = ray.xy * ior * inversesqrt(max(.16, exitCos2));
      vec2 travel = ray.xy * path + exitSlope * (escape * ${optics.clearance} * opticalRadius * arc);
      // Red and blue bend around the mean ray, so glass edges fringe with the spectrum.
      vec2 travelR = refractTravel(normal, frontHeight, opticalRadius, arc, ior * (1. - spread));
      vec2 travelB = refractTravel(normal, frontHeight, opticalRadius, arc, ior * (1. + spread));
      // Ease the rays near the rim so the lens magnifies evenly instead of smearing.
      travel /= 1. + length(travel) / (opticalRadius * 1.35);
      travelR /= 1. + length(travelR) / (opticalRadius * 1.35);
      travelB /= 1. + length(travelB) / (opticalRadius * 1.35);
      vec2 toLight = lamp.xy - size * uv;
      float z2 = lamp.z * lamp.z;
      float lampHeight = lamp.z + opticalRadius * (${optics.base} + ${optics.crown}) - frontHeight;
      vec3 incident = vec3(toLight, lampHeight);
      float irradiance = z2 / dot(incident, incident);
      vec3 light = normalize(incident);
      vec3 halfLight = normalize(light + vec3(0., 0., 1.));
      float nDotH = max(dot(normal, halfLight), 0.);
      float fresnel = .038 + .962 * pow(clamp(1. - normal.z, 0., 1.), 5.);
      float lipWidth = max(.65 * pixel, clamp(bevel * .075, .60, 1.95));
      float lip = bell((depth - lipWidth * .82) / lipWidth);
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
      float ambient = .15 * fresnel + (.018 + .045 * sky * sky) * lip + .17 * skylight;
      // Three lobes: a broad sheen, the lamp's own arc and a tight wet glint.
      float sheen = pow(nDotH, 8.);
      float glintLobe = pow(nDotH, 240.);
      float face = irradiance * (.44 * sheen + .46 * pow(nDotH, 42.) + .58 * glintLobe)
        * mix(lightColor.a * .86, .30, slope) * mix(.78, 1., lens);
      face += (.04 + .28 * lightColor.a) * irradiance * sheen * smoothstep(.16, .78, length(local));
      // The lit rim reflects once more just inside the glass where rays nearly turn back.
      float echo = bell((depth - bevel * .86) / max(pixel, bevel * .13)) * (1. - escape);
      float reflection = key * (.85 * lip + .38 * shoulder + .11 * slope + .12 * (1. - escape) + .17 * echo);
      // Light leaving the curved body concentrates on the far shoulder.
      vec2 exitPoint = halfSize - .76 * fromCenter / max(1., length(fromCenter / halfSize));
      vec2 toExit = (size * uv - exitPoint) / (vec2(.55, .48) * lamp.z + .20 * halfSize);
      float exit2 = dot(toExit, toExit);
      // The focus carries a hot core so the far-side light reads as a caustic.
      float focus = exp(-exit2) * (1. + .6 * exp(-exit2 * 3.2));
      float farSide = smoothstep(.02, .60, -dot(local, fromCenter) / length(vec3(fromCenter, lamp.z * .72)));
      float caustic = lamp.w * focus * (.22 * farSide * arc + .17 * smoothstep(.02, .78, -bearing)
        * bell((depth - bevel * .66) / max(pixel, bevel * .35)));
      float shine = 1. - (1. - ambient) * (1. - min(.94, reflection)) * (1. - face)
        * (1. - caustic) * (1. - .30 * wave);
      // The silhouette darkens just inside its edge, so thickness reads without a glow outline.
      float edgeDark = bell((depth - bevel * .05) / max(pixel, bevel * .13));
      float shade = slope * (.045 + .09 * lamp.w * max(-bearing, 0.)) * (1. - .59 * key)
        + edgeDark * (.13 + .12 * (1. - key));
      vec3 glint = mix(lightColor.rgb, vec3(1.), clamp(.42 * key * lip + .30 * glintLobe * irradiance, 0., 1.));
      // Beer-Lambert transmission and a softly lit body also work over ordinary HTML.
      // The thicker the chord — and the heavier the tint — the more red is absorbed.
      vec3 transmission = exp(-vec3(.283, .245, .207) * density * path / opticalRadius);
      float bodyLight = .52 + .26 * max(dot(normal, vec3(-.32, -.57, .75)), 0.)
        + .27 * irradiance * max(dot(normal, light), 0.);
      vec3 body = bodyTint * bodyLight * (1. - transmission);
      float throughFace = (1. - shine) * (1. - shade);
      float alpha = 1. - throughFace * transmission.g;
      vec3 color = glint * shine + vec3(.09,.12,.15) * shade * (1. - shine) + throughFace * body;
      if (hasImage > .5) {
        vec2 offset = travel / size * imageRect.zw;
        vec2 at = imageRect.xy + uv * imageRect.zw;
        // A small aperture average diffuses busy backgrounds so overlaid ink stays readable.
        vec2 soft = (.9 + 1.2 * density) * pixel / size * imageRect.zw;
        vec3 through = texture2D(backdrop, at + offset + soft).rgb
          + texture2D(backdrop, at + offset + vec2(-soft.x, soft.y)).rgb
          + texture2D(backdrop, at + offset + vec2(soft.x, -soft.y)).rgb
          + texture2D(backdrop, at + offset - soft).rgb;
        vec4 mean = texture2D(backdrop, at + offset);
        vec3 dispersed = vec3(texture2D(backdrop, at + travelR / size * imageRect.zw).r,
          mean.g, texture2D(backdrop, at + travelB / size * imageRect.zw).b);
        dispersed = mix(dispersed, (through + mean.rgb) * .2, .34);
        color += dispersed * mean.a * (1. - alpha);
        alpha += mean.a * (1. - alpha);
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
    static get version() { return 6; }
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
        for (const name of ['size','lamp','lightColor','bodyTint','contact','radiusX','radiusY','progress','lens','pixel','imageRect','hasImage','density','backdrop']) {
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
        if (!gl.isContextLost()) console.warn('Nacreon UI · WebGL', error.message);
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
        tint = [.95, .975, 1.], bodyTint = [.54, .75, .85], faceGain = .135, density = 1 } = frame;
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
      gl.uniform1f(u.density, density);
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

(() => {
  'use strict';

  const key = Symbol.for('material-lib.glass-control.v1');
  if (globalThis[key]?.version >= 6) return;
  const { GlassScene, GlassSurface, waveDuration } = globalThis[Symbol.for('material-lib.glass.v1')];
  const events = ['pointerdown', 'click', 'transitionrun', 'transitionend', 'transitioncancel'];

  // Optical treatment for a compact surface. Its content owns semantics and focus.
  class GlassControl extends HTMLElement {
    static get version() { return 6; }
    #scene;
    #glass;
    #pulse;
    #size = new ResizeObserver(() => this.#scene?.wake());
    #children = new MutationObserver(() => this.#scene?.wake());

    get glassContent() { return this.querySelector(':scope > button'); }

    connectedCallback() {
      for (const copy of this.querySelectorAll(':scope > .ml-optical')) copy.remove();
      this.classList.remove('ml-refractive');
      this.style.removeProperty('--ml-bend');
      this.#scene = GlassScene.forDocument(this.ownerDocument);
      this.#scene.painters.add(this.#paint);
      this.#size.observe(this);
      this.#children.observe(this, { childList: true });
      for (const event of events) this.addEventListener(event, this);
      this.#scene.wake();
    }

    disconnectedCallback() {
      for (const event of events) this.removeEventListener(event, this);
      this.#size.disconnect();
      this.#children.disconnect();
      this.#scene.remove(this.#paint);
      this.#scene = null;
      this.#clear();
    }

    #clear() {
      this.#glass?.remove();
      this.#glass = null;
      this.#pulse = null;
    }

    // A surface with no press target of its own can still rebound like liquid.
    pulse(x, y) {
      const content = this.glassContent;
      const style = getComputedStyle(this);
      if (!this.#scene || !content || style.getPropertyValue('--ml-optics').trim() !== 'block'
        || !this.#canMove(content, style)) return false;
      this.#pulse = { x, y, start: this.#scene.win.performance.now() };
      this.#scene.wake(waveDuration + 35);
      return true;
    }

    #canMove(content, style) {
      return style.getPropertyValue('--ml-follow').trim() === '1'
        && !content.matches(':disabled, [disabled]')
        && !content.closest('[inert], [aria-disabled="true"], [aria-busy="true"]');
    }

    #paint = (pointer, now) => {
      const content = this.glassContent;
      const style = getComputedStyle(this);
      const dynamic = content && this.#canMove(content, style);
      const tier = content && GlassSurface.lightingTier(style, dynamic);
      if (!tier) {
        if (this.#glass) this.#clear();
        return;
      }
      if (!this.getClientRects().length) return;
      this.#glass = GlassSurface.forTier(this.#glass, this, true, tier);
      if (tier !== 'high' || !dynamic || (this.#pulse && now - this.#pulse.start >= waveDuration)) this.#pulse = null;
      this.#glass.paint(dynamic ? pointer : null, this.#pulse, now, this.glassBackdrop, this.glassBackdropVersion);
      if (dynamic && this.getAnimations().some(a => a.transitionProperty && a.playState === 'running')) this.#scene.wake();
      return dynamic;
    };

    handleEvent(event) {
      if (event.type.startsWith('transition')) {
        if (event.target === this) this.#scene.wake();
        return;
      }
      const action = event.target.closest?.('button, select, input[type="checkbox"], input[type="radio"]');
      if (action?.parentElement !== this || event.defaultPrevented) return;
      const style = getComputedStyle(this);
      if (style.getPropertyValue('--ml-optics').trim() !== 'block' || !this.#canMove(action, style)) return;
      let x = event.clientX, y = event.clientY;
      if (event.type === 'pointerdown') {
        if (!event.isPrimary || event.button !== 0) return;
      } else {
        if (event.detail !== 0) return;
        const rect = action.getBoundingClientRect();
        x = rect.left + rect.width / 2;
        y = rect.top + rect.height / 2;
      }
      this.#pulse = { x, y, start: this.#scene.win.performance.now() };
      this.#scene.wake(waveDuration + 35);
    }
  }

  globalThis[key] = GlassControl;
})();

(() => {
  'use strict';
  const key = Symbol.for('material-lib.value-controls.v1');
  if (globalThis[key]) return;
  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  class ValueSurface extends GlassControl {
    get glassContent() { return this.closest('ml-slider, ml-stepper, ml-date-range, ml-date-picker, ml-time-picker')?.querySelector('input'); }
  }
  customElements.define('ml-value-surface', ValueSurface);

  function part(parent, name, tag = 'span') {
    let element = parent.querySelector(':scope > [data-ml-part="' + name + '"]');
    if (!element) {
      element = parent.ownerDocument.createElement(tag);
      element.dataset.mlPart = name;
      if (tag === 'ml-value-surface') element.setAttribute('aria-hidden', 'true');
      if (tag === 'button') element.type = 'button';
      parent.append(element);
    }
    return element;
  }

  let nextId = 0;
  function ensureId(element) {
    if (!element.id) {
      let id;
      do { id = 'ml-field-' + ++nextId; } while (element.getRootNode().getElementById?.(id));
      element.id = id;
    }
    return element.id;
  }

  // Find the distance between representable values on a decimal step grid.
  // For example, a 1.5 ms step yields three whole milliseconds.
  function stepStride(raw, fallback, scalePower = 0) {
    if (raw.toLowerCase() === 'any') return 1;
    const value = parseFloat(raw);
    if (!Number.isFinite(value) || value <= 0) return fallback;
    const [coefficient, exponent = '0'] = String(value).split('e');
    const [whole, fraction = ''] = coefficient.split('.');
    const power = Number(exponent) + scalePower - fraction.length;
    if (power >= 0) return Math.min(Number.MAX_SAFE_INTEGER, Math.round(value * 10 ** scalePower));
    const numerator = BigInt(whole + fraction);
    let a = numerator, b = 10n ** BigInt(-power);
    while (b) [a, b] = [b, a % b];
    return Math.min(Number.MAX_SAFE_INTEGER, Number(numerator / a));
  }

  function describeUnit(host, input, unit) {
    const hint = part(host, 'unit-description');
    hint.hidden = true;
    const id = ensureId(hint);
    const other = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(token => token && token !== id);
    if (unit) { hint.textContent = '单位 ' + unit.trim(); other.push(id); }
    if (other.length) input.setAttribute('aria-describedby', other.join(' '));
    else input.removeAttribute('aria-describedby');
  }

  // The author-owned native fields keep their labels, validation and form association.
  class ValueField extends HTMLElement {
    static observedAttributes = ['unit'];
    #inputsChanged = new MutationObserver(records => {
      if (records.some(record => record.type === 'attributes' ? record.target.matches('input, fieldset')
        : [...record.addedNodes, ...record.removedNodes].some(node =>
          node.nodeType === 1 && (node.matches('input, label') || node.querySelector('input, label'))))) this.refresh();
    });
    #sync = event => { if (event.target.matches('input')) this.refresh(); };
    #eventRoot;
    #reset = event => {
      if (![...this.querySelectorAll('input')].some(input => input.form === event.target)) return;
      // A trusted reset-button click can run microtasks before the browser restores the inputs.
      setTimeout(() => {
        if (this.isConnected && !event.defaultPrevented) {
          this.closePicker?.();
          this.refresh();
        }
      }, 0);
    };
    connectedCallback() {
      this.addEventListener('input', this.#sync);
      this.addEventListener('change', this.#sync);
      this.#eventRoot = this.getRootNode();
      this.#eventRoot.addEventListener('reset', this.#reset, true);
      this.#inputsChanged.observe(this, { subtree: true, childList: true, attributes: true,
        attributeFilter: ['min', 'max', 'step', 'value', 'disabled', 'readonly', 'type', 'required', 'aria-label', 'id'] });
      for (let p = this.parentElement; p; p = p.parentElement) {
        if (p.localName === 'fieldset') this.#inputsChanged.observe(p, { attributes: true, attributeFilter: ['disabled'] });
      }
      this.refresh();
    }
    disconnectedCallback() {
      this.removeEventListener('input', this.#sync);
      this.removeEventListener('change', this.#sync);
      this.#eventRoot?.removeEventListener('reset', this.#reset, true);
      this.#inputsChanged.disconnect();
    }
    attributeChangedCallback() { if (this.isConnected) this.refresh(); }
  }
  function signal(input) {
    for (const type of ['input', 'change']) input.dispatchEvent(new Event(type, { bubbles: true, composed: true }));
  }
  globalThis[key] = { ValueField, part, ensureId, describeUnit, signal, stepStride };
})();

(() => {
  'use strict';
  const key = Symbol.for('material-lib.calendar.v1');
  if (globalThis[key]) return;
  const { part, ensureId, stepStride } = globalThis[Symbol.for('material-lib.value-controls.v1')];

  const dayLength = 86400000;
  const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
  const asDate = day => new Date(day * dayLength);
  const padTwo = number => String(number).padStart(2, '0');
  function isoOf(day) {
    const date = asDate(day);
    return String(date.getUTCFullYear()).padStart(4, '0') + '-' + padTwo(date.getUTCMonth() + 1) + '-' + padTwo(date.getUTCDate());
  }

  // Keep civil days separate from local time zones and daylight-saving transitions.
  function dayOf(iso) {
    const match = /^(\d{4,})-(\d{2})-(\d{2})$/.exec(iso);
    if (!match) return null;
    const year = Number(match[1]), month = Number(match[2]), date = Number(match[3]);
    if (year < 1 || year > 275760) return null;
    const value = new Date(0);
    value.setUTCFullYear(year, month - 1, date);
    return value.getUTCFullYear() === year && value.getUTCMonth() + 1 === month && value.getUTCDate() === date
      ? +value / dayLength : null;
  }
  const firstDay = dayOf('0001-01-01'), lastDay = dayOf('275760-09-13');
  const weekIndex = day => (asDate(day).getUTCDay() + 6) % 7;
  const monthStart = day => day - asDate(day).getUTCDate() + 1;
  function shiftMonth(day, count) {
    const first = asDate(monthStart(day));
    first.setUTCMonth(first.getUTCMonth() + count);
    if (!Number.isFinite(+first)) return count > 0 ? lastDay + 1 : firstDay - 1;
    const next = new Date(first);
    next.setUTCMonth(next.getUTCMonth() + 1);
    return Math.min(+first / dayLength + asDate(day).getUTCDate() - 1,
      Number.isFinite(+next) ? +next / dayLength - 1 : lastDay);
  }
  function today() {
    const now = new Date();
    return dayOf(String(now.getFullYear()).padStart(4, '0') + '-' + padTwo(now.getMonth() + 1) + '-' + padTwo(now.getDate()));
  }
  function dateStride(input) {
    const fallback = stepStride(input.step, 1);
    const step = parseFloat(input.step);
    if (!Number.isFinite(step) || step <= 0 || Number.isInteger(step)) return fallback;
    // Native date controls can round fractional steps to whole days. Keep the
    // calendar's choices on the same grid as the editable field.
    const probe = input.ownerDocument.createElement('input');
    probe.type = 'date';
    probe.step = input.step;
    probe.value = '1970-01-01';
    if (probe.type !== 'date') return fallback;
    probe.stepUp();
    const stride = probe.valueAsNumber / dayLength;
    return Number.isInteger(stride) && stride > 0 && probe.validity.valid ? stride : fallback;
  }
  function limits(input) {
    const min = dayOf(input.min), max = dayOf(input.max);
    const range = { min: min ?? firstDay, max: max ?? lastDay,
      base: min ?? dayOf(input.defaultValue) ?? 0, step: dateStride(input) };
    const first = aligned(range, range.min, 1), last = aligned(range, range.max, -1);
    range.min = first ?? lastDay + 1; range.max = last ?? firstDay - 1;
    return range;
  }
  function allowed(day, limit) {
    return day >= limit.min && day <= limit.max && (day - limit.base) % limit.step === 0;
  }
  function aligned(range, day, direction) {
    day = direction > 0 ? Math.max(day, range.min) : Math.min(day, range.max);
    const steps = (day - range.base) / range.step;
    day = range.base + (direction > 0 ? Math.ceil(steps) : Math.floor(steps)) * range.step;
    return day >= range.min && day <= range.max ? day : null;
  }
  function fullDate(day) {
    const d = asDate(day);
    return d.getUTCFullYear() + '年' + (d.getUTCMonth() + 1) + '月' + d.getUTCDate() + '日，星期' + weekdays[weekIndex(day)];
  }

  class CalendarView {
    #panel;
    #grid;
    #canPick;
    cursor;

    constructor(panel, canPick, footer) {
      this.#panel = panel;
      this.#canPick = canPick;
      panel.classList.add('ml-calendar');
      panel.innerHTML = '<header><div><span data-calendar="prompt" aria-live="polite"></span><h2 data-calendar="month" aria-live="polite"></h2></div>' +
        '<div class="ml-month-nav"><button type="button" data-calendar="prev" aria-label="上个月"></button><button type="button" data-calendar="next" aria-label="下个月"></button></div></header>' +
        '<table role="grid"><thead><tr></tr></thead><tbody></tbody></table>' + footer;
      part(panel, 'sheet', 'ml-value-surface');
      this.#grid = panel.querySelector('table');
      this.#grid.setAttribute('aria-labelledby', ensureId(panel.querySelector('h2')));
      const week = this.#grid.tHead.rows[0];
      for (const name of weekdays) {
        const th = panel.ownerDocument.createElement('th');
        th.scope = 'col'; th.textContent = name; th.setAttribute('aria-label', '星期' + name); week.append(th);
      }
    }

    move(day, { min, max }, direction = 1) {
      day = Math.min(max, Math.max(min, day));
      const month = monthStart(day), next = shiftMonth(month, 1);
      const start = Math.max(min, month), end = Math.min(max, next - 1);
      this.cursor = day;
      for (let distance = 0; distance <= end - start; distance++) {
        const near = [day + distance * direction, day - distance * direction]
          .find(candidate => candidate >= start && candidate <= end && this.#canPick(candidate));
        if (near !== undefined) { this.cursor = near; break; }
      }

      const d = asDate(month), panel = this.#panel;
      panel.querySelector('[data-calendar="month"]').textContent = d.getUTCFullYear() + '年' + (d.getUTCMonth() + 1) + '月';
      panel.querySelector('[data-calendar="prev"]').disabled = month <= min;
      panel.querySelector('[data-calendar="next"]').disabled = next > max;
      const body = this.#grid.tBodies[0];
      body.replaceChildren();
      const current = today();
      for (let week = month - weekIndex(month); week < next; week += 7) {
        const row = body.insertRow();
        for (let date = week; date < week + 7; date++) {
          const cell = row.insertCell();
          if (date < month || date >= next) continue;
          const button = panel.ownerDocument.createElement('button');
          button.type = 'button'; button.dataset.day = String(date);
          button.textContent = String(asDate(date).getUTCDate());
          button.setAttribute('aria-label', fullDate(date));
          if (date === current) button.setAttribute('aria-current', 'date');
          button.disabled = !this.#canPick(date);
          button.tabIndex = date === this.cursor && !button.disabled ? 0 : -1;
          cell.append(button);
        }
      }
    }

    select(first, last = null) {
      for (const button of this.#grid.querySelectorAll('button[data-day]')) {
        const day = Number(button.dataset.day), cell = button.parentElement;
        const edge = day === first || day === last;
        const inside = first !== null && last !== null &&
          day >= Math.min(first, last) && day <= Math.max(first, last);
        cell.toggleAttribute('data-in-range', inside);
        cell.toggleAttribute('data-edge', edge);
        cell.setAttribute('aria-selected', String(edge || inside));
      }
    }

    focus() {
      const target = this.#grid.querySelector('button[tabindex="0"]') ||
        this.#panel.querySelector('.ml-month-nav button:enabled, footer button:enabled:not([hidden])');
      target?.focus({ preventScroll: true });
      if (target && this.#panel.scrollHeight > this.#panel.clientHeight) target.scrollIntoView({ block: 'nearest' });
    }

    keyMove(event) {
      if (!event.target.matches('button[data-day]') || !this.#grid.contains(event.target) ||
          event.altKey || event.ctrlKey || event.metaKey) return null;
      const day = Number(event.target.dataset.day);
      const forward = getComputedStyle(this.#panel).direction === 'rtl' ? -1 : 1;
      const offsets = { ArrowLeft: -forward, ArrowRight: forward, ArrowUp: -7, ArrowDown: 7, Home: -weekIndex(day), End: 6 - weekIndex(day) };
      let next;
      if (Object.hasOwn(offsets, event.key)) next = day + offsets[event.key];
      else if (event.key === 'PageUp' || event.key === 'PageDown') {
        next = shiftMonth(day, (event.key === 'PageUp' ? -1 : 1) * (event.shiftKey ? 12 : 1));
      } else return null;
      event.preventDefault();
      return { day: next, direction: next < day ? -1 : 1, arrow: event.key.startsWith('Arrow') };
    }
  }

  globalThis[key] = { CalendarView, dayOf, isoOf, shiftMonth, today, limits, allowed, aligned };
})();

(() => {
  'use strict';
  if (customElements.get('ml-date-range')) return;
  const { ValueField, part, ensureId, signal } = globalThis[Symbol.for('material-lib.value-controls.v1')];
  const { CalendarView, dayOf, isoOf, shiftMonth, today, limits, allowed, aligned } =
    globalThis[Symbol.for('material-lib.calendar.v1')];
  const orderMessage = '结束日期须等于或晚于开始日期。';

  class DateRange extends ValueField {
    #panel;
    #anchor = null;
    #calendar;
    #ranges;
    #earliest;
    #latest;
    #ownError;
    #openButton;
    get fields() { return [...this.querySelectorAll('input[type="date"]')].slice(0, 2); }
    get value() { const [a, b] = this.fields; return { start: a?.value || '', end: b?.value || '' }; }
    set value({ start = '', end = '' }) {
      const [a, b] = this.fields;
      if (a && b) { a.value = start; b.value = end; this.refresh(); }
    }
    connectedCallback() {
      super.connectedCallback();
      this.addEventListener('click', this.#click);
      this.addEventListener('keydown', this.#keys);
      this.addEventListener('pointerover', this.#hover);
      this.addEventListener('pointerout', this.#leave);
    }
    disconnectedCallback() {
      this.closePicker();
      this.removeEventListener('click', this.#click);
      this.removeEventListener('keydown', this.#keys);
      this.removeEventListener('pointerover', this.#hover);
      this.removeEventListener('pointerout', this.#leave);
      super.disconnectedCallback();
    }
    refresh() {
      const [a, b] = this.fields;
      this.toggleAttribute('data-ml-ready', !!b);
      if (this.#ownError && (this.#ownError !== b || !a?.value || !b?.value || a.valueAsNumber <= b.valueAsNumber)) {
        if (this.#ownError.validationMessage === orderMessage) this.#ownError.setCustomValidity('');
        if (this.#ownError.willValidate || !this.#ownError.validity.customError) this.#ownError = null;
      }
      if (!b) { this.closePicker(); return; }
      const reversed = a.valueAsNumber > b.valueAsNumber;
      if (reversed && !b.validity.customError) { b.setCustomValidity(orderMessage); this.#ownError = b; }
      const error = part(this, 'error');
      error.setAttribute('aria-live', 'polite');
      error.hidden = !reversed;
      if (error.textContent !== (reversed ? orderMessage : '')) error.textContent = reversed ? orderMessage : '';
      part(this, 'surface', 'ml-value-surface');
      this.#openButton = part(this, 'open', 'button');
      this.#openButton.setAttribute('aria-label', '打开日期范围日历');
      this.#openButton.setAttribute('aria-haspopup', 'dialog');
      this.#openButton.setAttribute('aria-expanded', String(!!this.#panel?.open));
      this.#ranges = [limits(a), limits(b)];
      const [start, end] = this.#ranges;
      this.#earliest = start.min;
      this.#latest = end.max;
      this.#openButton.disabled = [a, b].some(field => field.matches(':disabled, [readonly]')) ||
        start.min > start.max || end.min > end.max || this.#earliest > this.#latest;
      if (this.#panel?.open) {
        if (this.#openButton.disabled) this.closePicker();
        else {
          if (this.#anchor !== null && !this.#canBegin(this.#anchor)) this.#anchor = null;
          this.#move(this.#calendar.cursor, false);
        }
      }
    }
    #canBegin(day) {
      const [a, b] = this.#ranges;
      return (allowed(day, a) && day <= b.max) || (allowed(day, b) && day >= a.min);
    }
    #canPick(day) {
      if (this.#anchor === null) return this.#canBegin(day);
      const [a, b] = this.#ranges;
      return allowed(Math.min(day, this.#anchor), a) && allowed(Math.max(day, this.#anchor), b);
    }
    #nextDay(day, direction) {
      const [start, end] = this.#ranges, anchor = this.#anchor;
      const choices = [];
      if (anchor === null || allowed(anchor, end)) {
        const limit = { ...start, max: Math.min(start.max, anchor ?? end.max) };
        const candidate = aligned(limit, day, direction);
        if (candidate !== null) choices.push(candidate);
      }
      if (anchor === null || allowed(anchor, start)) {
        const limit = { ...end, min: Math.max(end.min, anchor ?? start.min) };
        const candidate = aligned(limit, day, direction);
        if (candidate !== null) choices.push(candidate);
      }
      if (!choices.length) return null;
      return direction > 0 ? Math.min(...choices) : Math.max(...choices);
    }
    #makePanel() {
      const panel = part(this, 'calendar', 'dialog');
      // A cloned enhanced control may already contain a rendered calendar.
      panel.removeAttribute('open');
      this.#calendar = new CalendarView(panel, day => this.#canPick(day),
        '<footer><span data-calendar="selection"></span><button type="button" data-calendar="cancel">取消</button></footer>');
      panel.setAttribute('aria-label', '选择日期范围');
      this.#openButton.setAttribute('aria-controls', ensureId(panel));
      panel.addEventListener('close', () => {
        if (!panel.open) { this.#anchor = null; this.#openButton.setAttribute('aria-expanded', 'false'); }
      });
      this.#panel = panel;
    }
    openPicker() {
      this.refresh();
      if (!this.hasAttribute('data-ml-ready') || this.#openButton.disabled || this.#panel?.open) return;
      if (!this.#panel) this.#makePanel();
      this.#anchor = null;
      const { start, end } = this.value;
      this.#move(dayOf(start) ?? dayOf(end) ?? today(), false);
      this.#panel.showModal();
      this.#openButton.setAttribute('aria-expanded', 'true');
      this.#calendar.focus();
    }
    closePicker() {
      if (this.#panel?.open) {
        this.#panel.close();
        this.#anchor = null;
        this.#openButton.setAttribute('aria-expanded', 'false');
      }
    }
    #move(day, focus, direction = 1) {
      this.#calendar.move(day, { min: this.#earliest, max: this.#latest }, direction);
      this.#panel.querySelector('[data-calendar="prompt"]').textContent = this.#anchor === null ? '选择第一个日期' : '选择另一端日期';
      const { start, end } = this.value;
      this.#panel.querySelector('[data-calendar="selection"]').textContent = this.#anchor !== null ? '已选 ' + isoOf(this.#anchor)
        : [start, end].filter(Boolean).join(' 至 ') || '可选择同一天';
      this.#paintRange(this.#anchor);
      if (focus) this.#calendar.focus();
    }
    #paintRange(preview) {
      const { start, end } = this.value;
      this.#calendar.select(this.#anchor ?? dayOf(start), this.#anchor === null ? dayOf(end) : preview ?? this.#anchor);
    }
    #pick(day) {
      if (!this.#canPick(day)) return;
      if (this.#anchor === null) {
        this.#anchor = day;
        this.#move(day, true);
      } else {
        const [a, b] = this.fields;
        const start = isoOf(Math.min(this.#anchor, day)), end = isoOf(Math.max(this.#anchor, day));
        const changed = [a.value !== start, b.value !== end];
        this.closePicker();
        a.value = start; b.value = end;
        this.refresh();
        if (changed[0]) signal(a);
        if (changed[1]) signal(b);
      }
    }
    #click = event => {
      const target = event.target.closest('button, dialog');
      if (!target) return;
      if (target === this.#openButton) { this.openPicker(); return; }
      if (!this.#panel?.open) return;
      if (target === this.#panel) {
        if (event.target !== target) return;
        const rect = target.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) this.closePicker();
      } else if (target.dataset.day !== undefined) this.#pick(Number(target.dataset.day));
      else if (target.dataset.calendar === 'cancel') this.closePicker();
      else if (['prev', 'next'].includes(target.dataset.calendar)) this.#move(shiftMonth(this.#calendar.cursor, target.dataset.calendar === 'prev' ? -1 : 1), false);
    };
    #hover = event => {
      const button = event.target.closest('button[data-day]:enabled');
      if (this.#panel?.open && this.#anchor !== null && button) this.#paintRange(Number(button.dataset.day));
    };
    #leave = event => {
      if (this.#panel?.open && this.#anchor !== null && event.target.closest('tbody') && !event.relatedTarget?.closest?.('tbody')) this.#paintRange(this.#anchor);
    };
    #keys = event => {
      if (!this.#panel?.open) return;
      const move = this.#calendar.keyMove(event);
      if (!move) return;
      const day = move.arrow ? this.#nextDay(move.day, move.direction) : move.day;
      if (day === null) return;
      this.#move(day, true, move.direction);
      if (this.#anchor !== null) this.#paintRange(this.#calendar.cursor);
    };
  }
  customElements.define('ml-date-range', DateRange);
})();
