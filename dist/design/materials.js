/* Generated from src/motion-frames.js and src/glass-shader.js and src/glass.js and src/control-glass.js and src/materials.js by build.mjs. */
(() => {
  'use strict';
  const key = Symbol.for('material-lib.motion-frames.v1');
  if (globalThis[key]) return;

  const mediumFPS = 90;
  const watched = new WeakSet(), active = new Map(), entries = new WeakMap(), curves = new Map();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const nativeRate = typeof Animation !== 'undefined' && 'frameRate' in Animation.prototype;
  const linearStops = CSS.supports('animation-timing-function', 'linear(0, 1)');

  // Use a shared time grid. Resetting a timer on each draw drops 120 Hz to 60.
  // A deferred final input gets another display callback even after the pointer stops.
  function due(item, medium, now, scene) {
    if (!medium || !Number.isFinite(now)) {
      item.motionSlot = undefined;
      return true;
    }
    const slot = Math.floor(now * mediumFPS / 1000 + 1e-7);
    if (item.motionSlot === slot) {
      if (scene && !scene.frame) scene.wake();
      return false;
    }
    item.motionSlot = slot;
    return true;
  }

  // CSS animations keep their own per-keyframe easing. Transitions apply easing to
  // the entire effect, so hold samples of the authored curve at equal time intervals.
  function sampledEasing(easing, steps) {
    if (easing === 'linear' || steps === 1) return 'steps(' + steps + ', end)';
    const cacheKey = easing + '/' + steps;
    if (curves.has(cacheKey)) return curves.get(cacheKey);
    const effect = new KeyframeEffect(null, [], { duration: steps, fill: 'both', easing });
    const clock = new Animation(effect, null), stops = [];
    for (let i = 0; i <= steps; i++) {
      clock.currentTime = i;
      const value = +effect.getComputedTiming().progress.toFixed(7);
      const start = 100 * i / steps;
      stops.push(i === steps ? value + ' 100%' : value + ' ' + start + '% ' + (100 * (i + 1) / steps) + '%');
    }
    const curve = 'linear(' + stops.join(',') + ')';
    if (curves.size >= 64) curves.delete(curves.keys().next().value);
    curves.set(cacheKey, curve);
    return curve;
  }

  function apply(animation, entry) {
    const level = reduced.matches ? 'base' : getComputedStyle(entry.owner).getPropertyValue('--ml-motion-level').trim()
      || entry.owner.closest('[data-ml-motion]')?.dataset.mlMotion || 'high';
    if (nativeRate) {
      animation.frameRate = level === 'medium' ? mediumFPS : level === 'high' ? 'highest' : 'auto';
      return;
    }
    if (level !== 'medium' && !entry.applied) return;
    const effect = animation.effect, timing = effect.getTiming();
    if (timing.easing !== entry.applied) entry.original = timing.easing;
    const duration = Number(timing.duration);
    const sample = level === 'medium' && duration > 0 && Number.isFinite(duration);
    const steps = Math.min(2147483647, Math.max(1, Math.floor(duration * mediumFPS / 1000)));
    let easing = entry.original;
    // Library effects with a nonlinear overall curve are two-endpoint transitions.
    // For long custom durations (or engines without linear stops), apply the curve
    // between the endpoints and let native steps hold its input. Cost stays constant.
    const segment = sample && easing !== 'linear' && (!linearStops || steps > 512);
    if (segment && !entry.keyframes) {
      const frames = effect.getKeyframes();
      if (frames.length === 2 && frames[0].easing === 'linear') {
        entry.keyframes = frames;
        effect.setKeyframes([{ ...frames[0], easing }, frames[1]]);
      }
    } else if (!segment && entry.keyframes) {
      effect.setKeyframes(entry.keyframes);
      entry.keyframes = null;
    }
    if (sample) {
      easing = easing === 'linear' || entry.keyframes || !linearStops
        ? 'steps(' + steps + ', end)' : sampledEasing(easing, Math.min(steps, 512));
    }
    if (timing.easing !== easing) effect.updateTiming({ easing });
    entry.applied = sample ? effect.getTiming().easing : null;
  }

  function track(animation, owner) {
    if (!animation?.effect || ['idle', 'finished'].includes(animation.playState)) return;
    watch(owner.getRootNode());
    let entry = entries.get(animation);
    if (!entry) {
      entry = { owner, applied: null };
      entries.set(animation, entry);
    }
    if (!active.has(animation)) {
      active.set(animation, entry);
      const release = () => {
        active.delete(animation);
        animation.removeEventListener('finish', release);
        animation.removeEventListener('cancel', release);
        animation.removeEventListener('remove', release);
      };
      animation.addEventListener('finish', release);
      animation.addEventListener('cancel', release);
      animation.addEventListener('remove', release);
    }
    apply(animation, entry);
  }

  function owned(animation) {
    if (!animation.effect?.target) return false;
    if ('animationName' in animation) return animation.animationName.startsWith('ml-');
    const property = animation.transitionProperty;
    if (!property || ['display', 'overlay', 'visibility', 'content-visibility'].includes(property)) return false;
    const style = getComputedStyle(animation.effect.target, animation.effect.pseudoElement);
    const declared = style.getPropertyValue('--ml-native-transition').trim().split(/\s+/);
    if (declared.includes(property)) return true;
    // Transition events name physical longhands even when the stylesheet used a shorthand or logical axis.
    if (/^border-\w+-color$/.test(property)) return declared.includes('border-color');
    if (/^border-\w+-\w+-radius$/.test(property)) return declared.includes('border-radius');
    const vertical = style.writingMode !== 'horizontal-tb';
    if (property === (vertical ? 'height' : 'width')) return declared.includes('inline-size');
    if (declared.includes('inset-inline-start') || declared.includes('inset-inline-end')) {
      const reverse = (style.direction === 'rtl') !== (style.writingMode === 'sideways-lr');
      const [start, end] = vertical ? ['top', 'bottom'] : ['left', 'right'];
      return (property === (reverse ? end : start) && declared.includes('inset-inline-start'))
        || (property === (reverse ? start : end) && declared.includes('inset-inline-end'));
    }
    return false;
  }

  function sync() {
    for (const [animation, entry] of active) if (animation.effect) apply(animation, entry);
  }

  function watch(root) {
    if (watched.has(root) || !root.getAnimations) return;
    watched.add(root);
    if (root.host) watch(root.host.getRootNode());
    const start = event => {
      if (event.type === 'animationstart' && !event.animationName.startsWith('ml-')) return;
      const target = event.target, pseudo = event.pseudoElement || null;
      // Pseudo-element effects are included only in a subtree query.
      for (const animation of target.getAnimations({ subtree: !!pseudo })) {
        const effect = animation.effect;
        if (effect?.target !== target || (effect.pseudoElement || null) !== pseudo) continue;
        if (event.type === 'animationstart' ? animation.animationName !== event.animationName
          : animation.transitionProperty !== event.propertyName) continue;
        if (owned(animation)) track(animation, target);
      }
    };
    root.addEventListener('transitionrun', start, true);
    root.addEventListener('animationstart', start, true);
    new MutationObserver(sync).observe(root, { subtree: true, attributes: true, attributeFilter: ['data-ml-motion'] });
    const scan = () => {
      for (const animation of root.getAnimations()) if (owned(animation)) track(animation, animation.effect.target);
    };
    if (root.readyState === 'loading') root.addEventListener('DOMContentLoaded', scan, { once: true });
    else scan();
  }
  reduced.addEventListener('change', sync);
  globalThis[key] = Object.freeze({ due, track, watch });
  watch(document);
})();

(() => {
  'use strict';

  const key = Symbol.for('material-lib.glass-shader.v1');
  if (globalThis[key]?.version >= 8) return;

  // Distances are in units of the optical radius. The native displacement map
  // uses the same profile, refractive index and rear interface as the shader.
  const optics = Object.freeze({ maxRadius: 68, rim: .64, normalBlend: .60, base: .42, crown: .60,
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
    uniform vec2 size, contact, raster;
    uniform vec4 lamp, lightColor;
    uniform vec3 bodyTint;
    uniform vec4 radiusX, radiusY;
    uniform float progress, lens, hasImage, density, lampStrength, imageTransmission;
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

    vec2 bevelDirection(vec2 p, vec2 q, float depth, float bevel, float arcOffset, vec2 outward) {
      float gap = arcOffset > 0. ? arcOffset : abs(q.x - q.y);
      float blend = min(${optics.normalBlend} * depth, bevel);
      if (gap >= blend) return outward;
      // An asymmetric ellipse can extend past the center of the box.
      vec2 side = arcOffset > 0. ? outward : p;
      vec4 radii = min(radiusX, radiusY);
      float radius = side.y < 0. ? (side.x < 0. ? radii.x : radii.y) : (side.x < 0. ? radii.w : radii.z);
      blend = min(blend, bevel - radius);
      if (gap >= blend) return outward;
      float wx = clamp(.5 + .5 * (q.x - q.y) / blend, 0., 1.);
      vec2 faces = sign(p) * vec2(wx, 1. - wx);
      vec2 direction = mix(faces, outward, smoothstep(0., blend, arcOffset));
      return direction * inversesqrt(max(dot(direction, direction), 1.e-8));
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
      float pixel = raster.x;
      vec2 halfSize = size * .5;
      vec2 p = (uv - .5) * size;
      vec2 q = abs(p) - halfSize;
      float boxDistance = max(q.x, q.y), distance = boxDistance;
      vec2 outward = q.x > q.y ? vec2(sign(p.x), 0.) : vec2(0., sign(p.y));
      cutCorner(p, halfSize, vec2(-1., -1.), vec2(radiusX.x, radiusY.x), distance, outward);
      cutCorner(p, halfSize, vec2( 1., -1.), vec2(radiusX.y, radiusY.y), distance, outward);
      cutCorner(p, halfSize, vec2( 1.,  1.), vec2(radiusX.z, radiusY.z), distance, outward);
      cutCorner(p, halfSize, vec2(-1.,  1.), vec2(radiusX.w, radiusY.w), distance, outward);
      float coverage = 1. - smoothstep(-pixel, pixel, distance);
      float opticalRadius = min(min(halfSize.x, halfSize.y), ${optics.maxRadius}.0);
      float depth = max(-distance, 0.);
      float bevel = opticalRadius * ${optics.rim};
      // Inside a corner the nearest straight edge changes on its diagonal. Blend the
      // two face directions across the bevel, keeping the exact silhouette and outer arc.
      outward = bevelDirection(p, q, depth, bevel, distance - boxDistance, outward);
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
      vec3 ray = refract(vec3(0., 0., -1.), normal, 1. / ior);
      float path = ${optics.chord} * frontHeight / -ray.z;
      float exitCos2 = 1. - ior * ior * dot(ray.xy, ray.xy);
      float escape = smoothstep(0., .16, exitCos2);
      vec2 toLight = lamp.xy - size * uv;
      float z2 = lamp.z * lamp.z;
      float lampHeight = lamp.z + opticalRadius * (${optics.base} + ${optics.crown}) - frontHeight;
      vec3 incident = vec3(toLight, lampHeight);
      float irradiance = lampStrength * z2 / dot(incident, incident);
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
      float key = lampStrength * rimLight * (.28 + .72 * smoothstep(-.27, .73, bearing));
      float sky = max(dot(outward, vec2(-.50, -.866)), 0.);
      vec3 reflected = reflect(vec3(0., 0., -1.), normal);
      float skylight = bell((reflected.y + .69 - .20 * reflected.x) / .31)
        * smoothstep(-.42, .34, reflected.z) * (.74 - .24 * reflected.x);
      float ambient = .15 * fresnel + .018 * lip + lampStrength * (.045 * sky * sky * lip + .17 * skylight);
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
      // A longer light path reveals more of the theme's body colour. Dispersion is in the refracted rays.
      float transmission = exp(-.245 * density * path / opticalRadius);
      float bodyLight = .95 - .05 * slope + .07 * irradiance * max(dot(normal, light), 0.);
      vec3 body = bodyTint * bodyLight * (1. - transmission);
      float throughFace = (1. - shine) * (1. - shade);
      float alpha = 1. - throughFace * transmission;
      vec3 color = glint * shine + bodyTint * .68 * shade * (1. - shine) + throughFace * body;
      if (hasImage > .5) {
        // Dispersion only contributes when sampling a supplied background image.
        const float spread = .055;
        vec2 exitSlope = ray.xy * ior * inversesqrt(max(.16, exitCos2));
        vec2 travel = ray.xy * path + exitSlope * (escape * ${optics.clearance} * opticalRadius * arc);
        vec2 travelR = refractTravel(normal, frontHeight, opticalRadius, arc, ior * (1. - spread));
        vec2 travelB = refractTravel(normal, frontHeight, opticalRadius, arc, ior * (1. + spread));
        travel /= 1. + length(travel) / (opticalRadius * 1.35);
        travelR /= 1. + length(travelR) / (opticalRadius * 1.35);
        travelB /= 1. + length(travelB) / (opticalRadius * 1.35);
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
        float transmittedAlpha = imageTransmission * mean.a * (1. - alpha);
        color += dispersed * transmittedAlpha;
        alpha += transmittedAlpha;
      }
      vec4 glass = vec4(color, alpha) * coverage;
      // A fixed, neutral sub-code offset breaks up 8-bit terraces on dark glass.
      // Apply it before RGB quantization and keep transparent pixels premultiplied.
      float dark = raster.y * (1. - smoothstep(.20, .45, dot(bodyTint, vec3(.2126, .7152, .0722))));
      if (dark > 0.) {
        float noise = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715)))) - .5;
        glass.rgb = clamp(glass.rgb + dark * noise / 255., vec3(0.), vec3(glass.a));
      }
      gl_FragColor = glass;
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
    static get version() { return 8; }
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
        for (const name of ['size','lamp','lightColor','bodyTint','contact','radiusX','radiusY','progress','lens','raster','imageRect','hasImage','density','lampStrength','imageTransmission','backdrop']) {
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
        tint = [.95, .975, 1.], bodyTint = [.92, .96, .97], faceGain = .135, density = 1 } = frame;
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
      gl.uniform1f(u.lampStrength, frame.strength ?? 1);
      gl.uniform1f(u.imageTransmission, frame.transmission ?? 1);
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
      // Avoid magnifying a pixel-scale dither pattern on size-limited backing canvases.
      gl.uniform2f(u.raster, 1 / scale, Math.max(0, 2 * scale / dpr - 1));
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

(() => {
  'use strict';

  const key = Symbol.for('material-lib.glass-control.v1');
  if (globalThis[key]?.version >= 10) return;
  const { GlassScene, GlassSurface, waveDuration } = globalThis[Symbol.for('material-lib.glass.v1')];
  const events = ['pointerdown', 'click', 'transitionrun', 'transitionend', 'transitioncancel'];

  // Optical treatment for a compact surface. Its content owns semantics and focus.
  class GlassControl extends HTMLElement {
    static get version() { return 10; }
    #scene;
    #glass;
    #pulse;
    #size = new ResizeObserver(() => this.#scene?.wake());
    #children = new MutationObserver(() => this.#scene?.wake());

    get glassContent() { return this.querySelector(':scope > button'); }

    connectedCallback() {
      globalThis[Symbol.for('material-lib.motion-frames.v1')].watch(this.getRootNode());
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
      if (this.#glass) this.updateGlassViewport?.(null);
      this.#glass?.remove();
      this.#glass = null;
      this.#pulse = null;
    }

    // A surface with no press target of its own can still rebound like liquid.
    pulse(x, y) {
      const content = this.glassContent;
      const style = getComputedStyle(this);
      if (!this.#scene || !content || style.getPropertyValue('--ml-optics').trim() !== 'block'
        || !this.#enabled(content) || style.getPropertyValue('--ml-follow').trim() !== '1') return false;
      this.#pulse = { x, y, start: this.#scene.win.performance.now() };
      this.#scene.wake(waveDuration + 35);
      return true;
    }

    #enabled(content) {
      return content && !content.matches(':disabled, [disabled]')
        && !content.closest('[inert], [aria-disabled="true"], [aria-busy="true"]');
    }

    #paint = (pointer, now) => {
      const content = this.glassContent;
      const style = getComputedStyle(this);
      const enabled = this.#enabled(content);
      const dynamic = enabled && style.getPropertyValue('--ml-follow').trim() === '1';
      const light = GlassSurface.lighting(style, this.#scene.media.matches, enabled);
      const tier = content && GlassSurface.lightingTier(style, light);
      if (!tier) {
        if (this.#glass) this.#clear();
        return;
      }
      if (!this.getClientRects().length) return;
      this.#glass = GlassSurface.forTier(this.#glass, this, true, tier, light);
      if (tier !== 'high' || !dynamic || (this.#pulse && now - this.#pulse.start >= waveDuration)) this.#pulse = null;
      this.#glass.paint(pointer, this.#pulse, now, this.glassBackdrop, this.glassBackdropVersion, true);
      this.updateGlassViewport?.(this.#glass.mapPending ? null : this.#glass);
      if (light.mode === 'pointer' && this.getAnimations().some(a => a.transitionProperty && a.playState === 'running')) this.#scene.wake();
      return light.mode === 'pointer';
    };

    handleEvent(event) {
      if (event.type.startsWith('transition')) {
        if (event.target === this) this.#scene.wake();
        return;
      }
      const action = event.target.closest?.('button, select, input[type="checkbox"], input[type="radio"]');
      if (action?.parentElement !== this || event.defaultPrevented) return;
      const style = getComputedStyle(this);
      if (style.getPropertyValue('--ml-optics').trim() !== 'block' || !this.#enabled(action) || style.getPropertyValue('--ml-follow').trim() !== '1') return;
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
  if (customElements.get('ml-material')) return;

  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  const { GlassScene } = globalThis[Symbol.for('material-lib.glass.v1')];
  const versions = new WeakMap();
  const levels = Object.freeze([
    { value: 'base', label: '关闭', name: '云母', note: '云母', description: '不透明底面带少量主题染色，背景细节隐去。',
      light: '轮廓微光', litDescription: '靠近指针的一段轮廓亮起，中央保持纯色。' },
    { value: 'low', label: '低', name: '增强云母', note: '增强云母', description: '不透明底面加强主题染色，边缘的明暗区分表面层级。',
      light: '局部柔光', litDescription: '指针在实色表面照出一小片柔光。' },
    { value: 'medium', label: '中', name: '磨砂玻璃', note: '磨砂玻璃', description: '半透明表面扩散底纹，背景轮廓变软。',
      light: '磨砂散射', litDescription: '光晕在磨砂层里散开，软阴影偏向背光侧。' },
    { value: 'high', label: '高', name: '实心流体玻璃', note: '实心流体玻璃', description: '凸面放大底纹，较厚的边缘透出更明显的主题色。',
      light: '玻璃聚光', litDescription: '迎光弧面锐亮，对侧聚出光斑，边缘泛出光谱色散。' },
  ].map(Object.freeze));

  class MaterialSurface extends GlassControl {
    #backdrop = null;
    #resize = new ResizeObserver(() => this.#wake());

    static get levels() { return levels; }
    get glassContent() { return this; }
    get glassBackdrop() { return this.#backdrop; }
    get glassBackdropVersion() { return versions.get(this.#backdrop) || 0; }
    get backdrop() { return this.#backdrop; }

    // Pressing anywhere on the sample sends a liquid rebound over its glass.
    // A press on its own control still uses the control's ripple instead.
    handleEvent(event) {
      const action = event.target.closest?.('button, select, input[type="checkbox"], input[type="radio"]');
      super.handleEvent(event);
      if (event.type !== 'pointerdown' || (action && action.parentElement === this)) return;
      if (!event.isPrimary || event.button !== 0 || event.defaultPrevented) return;
      this.pulse(event.clientX, event.clientY);
    }

    // Supply the visible, axis-aligned background canvas for texture refraction.
    set backdrop(canvas) {
      if (canvas != null && (canvas.localName !== 'canvas' || canvas.ownerDocument !== this.ownerDocument)) {
        throw new TypeError('backdrop must be a canvas in the same document');
      }
      this.#resize.disconnect();
      this.#backdrop = canvas || null;
      if (canvas && this.isConnected) this.#resize.observe(canvas);
      this.#wake();
    }

    refreshBackdrop() {
      if (this.#backdrop) versions.set(this.#backdrop, this.glassBackdropVersion + 1);
      this.#wake();
    }

    #wake() {
      if (this.isConnected) GlassScene.forDocument(this.ownerDocument).wake();
    }

    connectedCallback() {
      super.connectedCallback();
      if (Object.hasOwn(this, 'backdrop')) {
        const canvas = this.backdrop;
        delete this.backdrop;
        this.backdrop = canvas;
      } else if (this.#backdrop) this.#resize.observe(this.#backdrop);
    }

    disconnectedCallback() {
      this.#resize.disconnect();
      super.disconnectedCallback();
    }
  }

  customElements.define('ml-material', MaterialSurface);
})();
