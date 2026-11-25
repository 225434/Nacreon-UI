/* Generated for the gallery by build.mjs. */
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

  if (customElements.get('ml-button')) return;
  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  class MaterialButton extends GlassControl {}
  customElements.define('ml-button', MaterialButton);
})();

(() => {
  'use strict';

  if (customElements.get('ml-dialog')) return;
  const { GlassScene, GlassSurface, waveDuration } = globalThis[Symbol.for('material-lib.glass.v1')];
  const events = ['pointerdown', 'pointercancel', 'click', 'keydown', 'transitionrun', 'transitionend', 'transitioncancel'];

  function onBackdrop(event, dialog) {
    if (event.target !== dialog || !dialog.matches(':modal')) return false;
    const box = dialog.getBoundingClientRect();
    return event.clientX < box.left || event.clientX >= box.right
      || event.clientY < box.top || event.clientY >= box.bottom;
  }

  // Native modality keeps the page inert. Wrap the two keyboard boundaries too,
  // so a single-button alert stays focused when the user presses Tab.
  function wrapTab(event, dialog) {
    if (event.key !== 'Tab' || event.ctrlKey || event.altKey || event.metaKey || !dialog.matches(':modal')) return;
    if (event.target.closest('dialog') !== dialog || event.composedPath()[0] !== event.target) return;
    const candidates = dialog.querySelectorAll('button, input, select, textarea, a[href], area[href], summary, iframe, audio[controls], video[controls], [contenteditable], [tabindex]');
    const visible = [...candidates].filter(el =>
      (el.tabIndex >= 0 || (el.isContentEditable && !el.hasAttribute('tabindex'))) &&
      !el.matches(':disabled') && !el.closest('[inert]') && el.getClientRects().length &&
      getComputedStyle(el).visibility === 'visible');
    const stops = visible.filter(el => {
      if (el.type !== 'radio' || !el.name) return true;
      const group = visible.filter(other => other.type === 'radio' && other.name === el.name && other.form === el.form);
      return el === (group.find(radio => radio.checked) ?? group[0]);
    });
    const order = el => el.tabIndex > 0 ? el.tabIndex : Number.MAX_SAFE_INTEGER;
    stops.sort((a, b) => order(a) - order(b));
    const first = stops[0] ?? dialog;
    const last = stops.at(-1) ?? dialog;
    if (event.target === (event.shiftKey ? first : last) || event.target === dialog) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  }

  // Keep the native dialog in its original form and DOM tree. showModal() supplies
  // the top layer, inert background, initial focus and restoration on dismissal.
  class MaterialDialog extends HTMLElement {
    #native;
    #scene;
    #glass;
    #pulse;
    #outsidePress = false;
    #size = new ResizeObserver(() => this.#scene?.wake());
    #watch = new MutationObserver(() => { this.#bind(); this.#scene?.wake(); });

    get dialog() { return this.querySelector(':scope > dialog'); }
    get open() { return Boolean(this.dialog?.open); }
    get returnValue() { return this.dialog?.returnValue ?? ''; }

    showModal(trigger) {
      const dialog = this.#bind();
      if (!dialog || dialog.matches(':modal')) return;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
      // The browser preserves returnValue across openings, including an Escape dismissal.
      dialog.returnValue = '';
      dialog.showModal();
      this.#scene?.wake();
    }

    close(value = '') { this.dialog?.close(String(value)); }

    connectedCallback() {
      globalThis[Symbol.for('material-lib.motion-frames.v1')].watch(this.getRootNode());
      this.#scene = GlassScene.forDocument(this.ownerDocument);
      this.#scene.painters.add(this.#paint);
      this.#bind();
      this.#watch.observe(this, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] });
      for (const type of events) this.addEventListener(type, this);
      this.#scene.wake();
    }

    disconnectedCallback() {
      for (const type of events) this.removeEventListener(type, this);
      this.#watch.disconnect();
      this.#size.disconnect();
      this.#scene?.remove(this.#paint);
      this.#scene = null;
      this.#clear();
      this.#native = null;
    }

    #bind() {
      const dialog = this.dialog;
      if (this.#native === dialog) return dialog;
      this.#clear();
      this.#size.disconnect();
      this.#native = dialog;
      this.#outsidePress = false;
      if (dialog) {
        // Cloning a live specimen also copies its generated filter IDs.
        for (const copy of dialog.querySelectorAll(':scope > .ml-optical')) copy.remove();
        dialog.classList.remove('ml-refractive');
        dialog.style.removeProperty('--ml-bend');
        this.#size.observe(dialog);
      }
      return dialog;
    }

    #clear() {
      this.#glass?.remove();
      this.#glass = null;
      this.#pulse = null;
    }

    #paint = (pointer, now) => {
      const dialog = this.#native;
      if (!dialog) return;
      const style = getComputedStyle(dialog);
      const dynamic = style.getPropertyValue('--ml-follow').trim() === '1';
      const light = GlassSurface.lighting(style, this.#scene.media.matches);
      const tier = GlassSurface.lightingTier(style, light);
      if (!tier || !dialog.getClientRects().length) {
        if (this.#glass) this.#clear();
        return;
      }
      if (!dialog.open) {
        // The glass reflection fades with the closing dialog. Pointer feedback ends on dismissal.
        if (this.#glass && (tier !== 'high' || this.#glass.tier !== tier)) this.#clear();
        return;
      }
      this.#glass = GlassSurface.forTier(this.#glass, dialog, false, tier, light);
      if (tier !== 'high' || !dynamic || (this.#pulse && now - this.#pulse.start >= waveDuration)) this.#pulse = null;
      this.#glass.paint(pointer, this.#pulse, now);
      if (light.mode === 'pointer' && dialog.getAnimations().some(a => a.playState === 'running')) this.#scene.wake();
      return light.mode === 'pointer';
    };

    handleEvent(event) {
      const dialog = this.#native;
      if (!dialog || event.target.closest?.('ml-dialog') !== this) return;
      if (event.type.startsWith('transition')) {
        if (event.target === dialog) this.#scene?.wake();
        return;
      }
      if (!dialog.open || event.defaultPrevented) return;
      if (event.type === 'keydown') { wrapTab(event, dialog); return; }
      if (event.type === 'pointercancel') { this.#outsidePress = false; return; }
      if (event.type === 'pointerdown') {
        if (!event.isPrimary || event.button !== 0) return;
        this.#outsidePress = onBackdrop(event, dialog);
        const style = getComputedStyle(dialog);
        if (!this.#outsidePress && this.#glass?.tier === 'high' && style.getPropertyValue('--ml-follow').trim() === '1') {
          this.#pulse = { x: event.clientX, y: event.clientY, start: this.#scene.win.performance.now() };
          this.#scene.wake(waveDuration + 35);
        }
        return;
      }
      const outside = this.#outsidePress && onBackdrop(event, dialog);
      this.#outsidePress = false;
      const cancel = event.target.closest?.('button[data-ml-dialog-close]');
      if (cancel && !cancel.matches(':disabled')) {
        event.preventDefault();
        this.close(cancel.value || 'cancel');
      } else if (outside && this.hasAttribute('dismiss-on-backdrop')) {
        // Backdrop dismissal is opt-in. Give listeners the same veto as Escape,
        // including on subsequent attempts after a listener rejected the first.
        if (dialog.dispatchEvent(new Event('cancel', { cancelable: true }))) this.close('cancel');
      }
    }
  }

  customElements.define('ml-dialog', MaterialDialog);
})();

(() => {
  'use strict';

  if (customElements.get('ml-tag')) return;
  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];

  class MaterialTag extends GlassControl {
    static observedAttributes = ['kind', 'label', 'selected', 'disabled', 'remove-label'];
    #kind;
    #text;
    #action;

    get glassContent() { return this.#action ?? this.#text; }
    get label() { return this.getAttribute('label') ?? ''; }
    set label(text) { this.setAttribute('label', text); }
    get value() { return this.getAttribute('value') ?? this.label; }
    set value(value) { this.setAttribute('value', value); }
    get selected() { return this.hasAttribute('selected'); }
    set selected(value) { this.toggleAttribute('selected', Boolean(value)); }
    get disabled() { return this.hasAttribute('disabled'); }
    set disabled(value) { this.toggleAttribute('disabled', Boolean(value)); }

    connectedCallback() {
      // Apply properties set by a consumer before this custom element was upgraded.
      for (const key of ['label', 'value', 'selected', 'disabled']) {
        if (!Object.hasOwn(this, key)) continue;
        const value = this[key];
        delete this[key];
        this[key] = value;
      }
      this.#render();
      super.connectedCallback();
      this.addEventListener('click', this.#activate);
      this.addEventListener('keydown', this.#deleteKey);
    }

    disconnectedCallback() {
      this.removeEventListener('click', this.#activate);
      this.removeEventListener('keydown', this.#deleteKey);
      super.disconnectedCallback();
    }

    attributeChangedCallback() { if (this.isConnected) this.#render(); }

    #render() {
      const requested = this.getAttribute('kind');
      const kind = requested === 'filter' || requested === 'removable' ? requested : 'status';
      if (kind !== this.#kind) {
        const focused = this.#action && this.ownerDocument.activeElement === this.#action;
        this.#kind = kind;
        this.#text = this.ownerDocument.createElement('span');
        this.#text.className = 'ml-tag-text';
        this.#action = null;
        if (kind === 'status') {
          this.replaceChildren(this.#text);
        } else {
          this.#action = this.ownerDocument.createElement('button');
          this.#action.type = 'button';
          if (kind === 'filter') {
            this.#action.append(this.#text);
            this.replaceChildren(this.#action);
          } else {
            this.replaceChildren(this.#text, this.#action);
          }
          this.#action.disabled = this.disabled;
          if (focused) this.#action.focus({ preventScroll: true });
        }
      }
      if (this.#text.textContent !== this.label) this.#text.textContent = this.label;
      if (!this.#action) return;
      this.#action.disabled = this.disabled;
      if (kind === 'filter') this.#action.setAttribute('aria-pressed', String(this.selected));
      else this.#action.setAttribute('aria-label', this.getAttribute('remove-label') || '移除' + this.label);
    }

    #deleteKey = event => {
      if (this.#kind !== 'removable' || event.target !== this.#action || event.defaultPrevented ||
          event.ctrlKey || event.metaKey || event.altKey || !['Delete', 'Backspace'].includes(event.key)) return;
      event.preventDefault();
      if (!event.repeat) this.#action.click();
    };

    #activate = event => {
      if (!this.#action?.contains(event.target) || this.#action.matches(':disabled') || event.defaultPrevented) return;
      if (this.#kind === 'filter') {
        this.selected = !this.selected;
        this.dispatchEvent(new CustomEvent('ml-change', {
          bubbles: true, composed: true, detail: { kind: 'filter', value: this.value, selected: this.selected },
        }));
        return;
      }

      const allowed = this.dispatchEvent(new CustomEvent('ml-remove', {
        bubbles: true, composed: true, cancelable: true, detail: { kind: 'removable', value: this.value, label: this.label },
      }));
      if (!allowed || !this.parentElement) return;
      const group = this.parentElement;
      if (this.contains(this.ownerDocument.activeElement) && group.matches('.ml-tag-group')) {
        const buttons = [...group.querySelectorAll(':scope > ml-tag > button:enabled')]
          .filter(button => button.getClientRects().length && !button.closest('[inert]'));
        const i = buttons.indexOf(this.#action);
        const next = buttons[i + 1] ?? buttons[i - 1] ?? group;
        next.focus({ preventScroll: true });
      }
      this.remove();
    };
  }

  customElements.define('ml-tag', MaterialTag);
})();

(() => {
  'use strict';
  const key = Symbol.for('material-lib.select-picker.v1');
  if (globalThis[key]) return;

  const normalize = text => text.normalize('NFKC').trim().toLocaleLowerCase();

  function renderOptions(select, list, matches) {
    const doc = select.ownerDocument;
    const frag = doc.createDocumentFragment();
    const rows = [];
    let lastGroup, section;
    for (const option of select.options) {
      const group = option.closest('optgroup');
      if (option.hidden || group?.hidden || !matches(option, group)) continue;
      if (group && group !== lastGroup) {
        section = doc.createElement('div');
        section.className = 'ml-select-group';
        section.setAttribute('role', 'group');
        section.setAttribute('aria-label', group.label);
        const heading = doc.createElement('div');
        heading.className = 'ml-select-heading';
        heading.setAttribute('aria-hidden', 'true');
        heading.textContent = group.label;
        section.append(heading);
        frag.append(section);
      }
      lastGroup = group;
      const row = doc.createElement('div');
      row.className = 'ml-select-option';
      row.setAttribute('role', 'option');
      row.id = list.id + '-' + option.index;
      row.setAttribute('aria-selected', String(option.selected));
      if (option.matches(':disabled')) row.setAttribute('aria-disabled', 'true');
      row.textContent = option.label;
      (group ? section : frag).append(row);
      rows.push({ row, option });
    }
    list.replaceChildren(frag);
    return rows;
  }

  function revealOption(row, list) {
    const item = row.getBoundingClientRect(), frame = list.getBoundingClientRect();
    if (item.top < frame.top) list.scrollTop -= frame.top - item.top;
    else if (item.bottom > frame.bottom) list.scrollTop += item.bottom - frame.bottom;
  }

  function placePopup(owner, target, panel, previous, force = false) {
    const doc = owner.ownerDocument;
    const viewport = doc.defaultView.visualViewport;
    const anchor = target.getBoundingClientRect();
    const vx = viewport?.offsetLeft ?? 0, vy = viewport?.offsetTop ?? 0;
    const vw = viewport?.width ?? doc.documentElement.clientWidth;
    const vh = viewport?.height ?? doc.documentElement.clientHeight;
    if (!anchor.width || !anchor.height || anchor.bottom <= vy || anchor.top >= vy + vh ||
        anchor.right <= vx || anchor.left >= vx + vw) return null;
    const geometry = [anchor.x, anchor.y, anchor.width, anchor.height, vx, vy, vw, vh].join('/');
    if (!force && previous === geometry) return geometry;
    const gap = 5, margin = 8;
    const width = Math.min(Math.max(anchor.width, 160), Math.max(1, vw - margin * 2));
    const left = getComputedStyle(owner).direction === 'rtl' ? anchor.right - width : anchor.left;
    panel.style.width = width + 'px';
    panel.style.left = Math.max(vx + margin, Math.min(left, vx + vw - margin - width)) + 'px';
    panel.style.removeProperty('--ml-select-room');
    const below = vy + vh - margin - anchor.bottom - gap;
    const above = anchor.top - vy - margin - gap;
    const up = below < panel.offsetHeight && above > below;
    panel.style.setProperty('--ml-select-room', Math.max(1, up ? above : below) + 'px');
    panel.dataset.side = up ? 'above' : 'below';
    panel.style.top = Math.max(vy + margin, up ? anchor.top - gap - panel.offsetHeight : anchor.bottom + gap) + 'px';
    return geometry;
  }

  globalThis[key] = { normalize, renderOptions, revealOption, placePopup };
})();

(() => {
  'use strict';

  if (customElements.get('ml-select')) return;
  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  const { GlassScene, GlassSurface } = globalThis[Symbol.for('material-lib.glass.v1')];
  let nextId = 0;
  const { normalize, renderOptions, revealOption, placePopup } = globalThis[Symbol.for('material-lib.select-picker.v1')];

  // The actual select stays visible and owns its label, value, validation and form.
  // Only the open picker is supplied here. Native programmatic writes therefore
  // also update the closed field without a synthetic event or a second model.
  class MaterialSelect extends GlassControl {
    #panel;
    #list;
    #search;
    #empty;
    #native;
    #rows = [];
    #active;
    #selected = -1;
    #geometry = '';
    #prefix = '';
    #lastKey = 0;
    #startedOpen = false;
    #frame = 0;
    #scene;
    #surface;
    #aria;
    #options = new MutationObserver(() => { if (this.open) this.#render(); });

    get select() { return this.querySelector(':scope > select'); }
    get glassContent() {
      const select = this.select;
      return select && !select.multiple && select.size <= 1 ? select : null;
    }
    get open() { return Boolean(this.#native); }

    connectedCallback() {
      this.removeAttribute('data-ml-select-open');
      // A clone of a live field must not retain a second picker with the same IDs.
      for (const copy of this.querySelectorAll(':scope > .ml-select-popup')) {
        if (this.select?.getAttribute('aria-controls') === copy.querySelector('[role="listbox"]')?.id) {
          for (const attr of ['aria-controls', 'aria-expanded', 'aria-activedescendant']) this.select.removeAttribute(attr);
        }
        copy.remove();
      }
      super.connectedCallback();
      this.addEventListener('pointerdown', this.#pointerDown);
      this.addEventListener('mousedown', this.#mouseDown);
      this.addEventListener('click', this.#click);
      this.addEventListener('keydown', this.#keyDown);
      this.addEventListener('focusout', this.#focusOut);
    }

    disconnectedCallback() {
      this.removeEventListener('pointerdown', this.#pointerDown);
      this.removeEventListener('mousedown', this.#mouseDown);
      this.removeEventListener('click', this.#click);
      this.removeEventListener('keydown', this.#keyDown);
      this.removeEventListener('focusout', this.#focusOut);
      this.close();
      this.#panel?.remove();
      this.#panel = null;
      super.disconnectedCallback();
    }

    #canOpen(select) {
      return select && !select.multiple && select.size <= 1 && !select.matches(':disabled') &&
        !select.closest('[inert]') && typeof this.showPopover === 'function';
    }

    #makePanel() {
      const doc = this.ownerDocument;
      const panel = doc.createElement('div');
      panel.className = 'ml-select-popup';
      panel.popover = 'auto';
      const searchBox = doc.createElement('div');
      searchBox.className = 'ml-select-search';
      this.#search = doc.createElement('input');
      this.#search.type = 'text';
      this.#search.autocomplete = 'off';
      this.#search.spellcheck = false;
      this.#search.setAttribute('role', 'combobox');
      this.#search.setAttribute('aria-autocomplete', 'list');
      this.#search.setAttribute('aria-expanded', 'true');
      searchBox.append(this.#search);
      this.#list = doc.createElement('div');
      this.#list.className = 'ml-select-list';
      this.#list.id = 'ml-select-options-' + ++nextId;
      this.#list.setAttribute('role', 'listbox');
      this.#list.tabIndex = -1;
      this.#search.setAttribute('aria-controls', this.#list.id);
      this.#empty = doc.createElement('div');
      this.#empty.className = 'ml-select-empty';
      this.#empty.setAttribute('role', 'status');
      panel.append(searchBox, this.#list, this.#empty);
      panel.addEventListener('beforetoggle', event => { if (event.newState === 'closed') this.#release(); });
      this.#search.addEventListener('input', event => {
        event.stopPropagation();
        this.#render();
      });
      this.#search.addEventListener('change', event => event.stopPropagation());
      this.#list.addEventListener('pointermove', event => {
        if (event.pointerType === 'touch') return;
        const row = event.target.closest('[role="option"]');
        if (row && row.getAttribute('aria-disabled') !== 'true') this.#activate(row, false);
      });
      this.append(panel);
      this.#panel = panel;
    }

    showPicker() {
      const select = this.select;
      if (this.open || !this.isConnected || !this.#canOpen(select) || !select.getClientRects().length) return;
      if (!this.#panel) this.#makePanel();
      const search = this.hasAttribute('searchable');
      this.#search.parentElement.hidden = !search;
      this.#search.value = '';
      this.#search.placeholder = this.getAttribute('search-label') || '搜索选项';
      this.#search.setAttribute('aria-label', this.#search.placeholder);
      if (select.hasAttribute('aria-labelledby')) this.#list.setAttribute('aria-labelledby', select.getAttribute('aria-labelledby'));
      else this.#list.removeAttribute('aria-labelledby');
      this.#list.setAttribute('aria-label', select.getAttribute('aria-label') || select.labels?.[0]?.textContent.trim() || '选项');
      select.focus({ preventScroll: true });
      this.#native = select;
      this.#aria = ['aria-expanded', 'aria-controls', 'aria-activedescendant'].map(name => [name, select.getAttribute(name)]);
      select.setAttribute('aria-expanded', 'true');
      select.setAttribute('aria-controls', this.#list.id);
      this.toggleAttribute('data-ml-select-open', true);
      this.#prefix = '';
      this.#geometry = '';
      this.#render();
      this.#panel.showPopover();
      this.#position(true);
      if (!this.open) return;
      // Focus the visible options so assistive technology follows the active row.
      // Some platforms always expose the native select as collapsed here.
      (search ? this.#search : this.#list).focus({ preventScroll: true });
      this.#reveal();
      this.#options.observe(select, { childList: true, subtree: true, characterData: true, attributes: true,
        attributeFilter: ['label', 'value', 'selected', 'disabled', 'hidden', 'multiple', 'size'] });
      this.#scene = GlassScene.forDocument(this.ownerDocument);
      this.#scene.painters.add(this.#paintMenu);
      this.#scene.wake();
      this.#frame = this.ownerDocument.defaultView.requestAnimationFrame(this.#track);
    }

    close(restoreFocus = false) {
      const select = this.#native;
      if (!select) return;
      if (this.#panel.matches(':popover-open')) this.#panel.hidePopover();
      this.#release();
      if (restoreFocus && select.isConnected) select.focus({ preventScroll: true });
    }

    #release() {
      if (!this.#native) return;
      for (const [name, original] of this.#aria) {
        if (original === null) this.#native.removeAttribute(name);
        else this.#native.setAttribute(name, original);
      }
      this.#native = null;
      this.removeAttribute('data-ml-select-open');
      this.#options.disconnect();
      this.ownerDocument.defaultView.cancelAnimationFrame(this.#frame);
      this.#scene?.remove(this.#paintMenu);
      this.#scene = null;
      this.#surface?.remove();
      this.#surface = null;
      this.#active = null;
      this.#rows = [];
    }

    #render() {
      const select = this.#native;
      const previous = this.#active && this.#active.option;
      const query = normalize(this.#search.value);
      this.#rows = renderOptions(select, this.#list, (option, group) =>
        !query || normalize(option.label + ' ' + (group?.label ?? '')).includes(query));
      this.#selected = select.selectedIndex;
      this.#empty.hidden = this.#rows.length > 0;
      this.#empty.textContent = this.#rows.length ? '' : query ? (this.getAttribute('empty-label') || '没有匹配的选项') : '暂无选项';
      const enabled = this.#enabled();
      const next = enabled.find(item => item.option === previous) ?? enabled.find(item => item.option.selected) ?? enabled[0];
      this.#activate(next?.row, false);
      if (this.#panel.matches(':popover-open')) { this.#position(true); this.#reveal(); }
    }

    #enabled() { return this.#rows.filter(item => !item.option.matches(':disabled')); }

    #activate(row, scroll = true) {
      this.#active?.row.removeAttribute('data-active');
      this.#active = this.#rows.find(item => item.row === row);
      const focus = this.#search.parentElement.hidden ? this.#list : this.#search;
      if (!this.#active) { focus.removeAttribute('aria-activedescendant'); return; }
      row.setAttribute('data-active', '');
      focus.setAttribute('aria-activedescendant', row.id);
      if (scroll) this.#reveal();
    }

    #reveal() {
      if (this.#active) revealOption(this.#active.row, this.#list);
    }

    #commit(option) {
      const select = this.#native;
      if (!select || !option || select.matches(':disabled') || option.matches(':disabled') || option.closest('select') !== select) return;
      const changed = select.selectedIndex !== option.index;
      select.selectedIndex = option.index;
      this.close(true);
      if (changed) {
        select.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    #pointerDown = event => {
      this.#startedOpen = event.target === this.select && this.open;
    };

    #mouseDown = event => {
      if (event.button !== 0) return;
      if (event.target === this.select && this.#canOpen(event.target)) {
        event.preventDefault();
        event.target.focus({ preventScroll: true });
      } else if (this.open && event.target.closest('[role="option"], .ml-select-heading')) event.preventDefault();
    };

    #click = event => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.target === this.select && this.#canOpen(event.target)) {
        event.preventDefault();
        if (this.open || (event.detail > 0 && this.#startedOpen)) this.close(true);
        else this.showPicker();
        this.#startedOpen = false;
      } else if (this.open && this.#list.contains(event.target)) {
        event.preventDefault();
        const row = event.target.closest('[role="option"]');
        this.#commit(this.#rows.find(item => item.row === row)?.option);
      }
    };

    #focusOut = event => {
      if (this.open && event.relatedTarget && !this.contains(event.relatedTarget)) this.close();
    };

    #keyDown = event => {
      const select = this.select;
      const search = event.target === this.#search;
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229 ||
          (event.target !== select && event.target !== this.#list && !search) || !this.#canOpen(select)) return;
      const key = event.key;
      if (this.open && key === 'Tab') { this.close(event.target !== select); return; }
      if (this.open && (key === 'Escape' || (key === 'ArrowUp' && event.altKey))) {
        event.preventDefault(); event.stopPropagation(); this.close(true); return;
      }
      if (event.ctrlKey || event.metaKey || (event.altKey && key !== 'ArrowDown')) return;
      const arrow = key === 'ArrowDown' || key === 'ArrowUp';
      const edge = !search && (key === 'Home' || key === 'End');
      const confirm = key === 'Enter' || (!search && key === ' ');
      const typed = !search && key.length === 1 && key !== ' ';
      if (!arrow && !edge && !confirm && !typed) return;
      event.preventDefault();
      const wasOpen = this.open;
      if (!wasOpen) this.showPicker();
      if (!this.open) return;
      if (confirm) { if (wasOpen && this.#active) this.#commit(this.#active.option); return; }
      const rows = this.#enabled();
      if (typed && !this.#search.parentElement.hidden) {
        this.#search.value += key;
        this.#render();
      } else if (typed) {
        const now = performance.now();
        this.#prefix = now - this.#lastKey > 650 ? normalize(key) : this.#prefix + normalize(key);
        this.#lastKey = now;
        const repeated = [...this.#prefix].every(ch => ch === this.#prefix[0]);
        const start = rows.indexOf(this.#active) + (repeated ? 1 : 0);
        const sequence = rows.slice(start).concat(rows.slice(0, start));
        const hit = sequence.find(item => normalize(item.option.label).startsWith(repeated ? this.#prefix[0] : this.#prefix));
        if (hit) this.#activate(hit.row);
      } else if (edge) {
        this.#activate((key === 'Home' ? rows[0] : rows.at(-1))?.row);
      } else if (wasOpen && !event.altKey && rows.length) {
        const index = rows.indexOf(this.#active) + (key === 'ArrowDown' ? 1 : -1);
        this.#activate(rows[Math.max(0, Math.min(rows.length - 1, index))].row);
      }
    };

    #position(force = false) {
      this.#geometry = placePopup(this, this.#native, this.#panel, this.#geometry, force);
      if (this.#geometry === null) this.close();
    }

    // Track the anchor only while open, including scrolling, transformed parents,
    // soft keyboard resizing and native value writes that do not emit change.
    #track = () => {
      if (!this.open) return;
      if (this.#native !== this.select || !this.#canOpen(this.#native)) { this.close(); return; }
      if (this.#selected !== this.#native.selectedIndex) { this.#active = null; this.#render(); }
      if (!this.open) return;
      this.#position();
      if (this.open) this.#frame = this.ownerDocument.defaultView.requestAnimationFrame(this.#track);
    };

    #paintMenu = (pointer, now) => {
      if (!this.open) return;
      const style = getComputedStyle(this.#panel);
      const light = GlassSurface.lighting(style, this.#scene.media.matches);
      const dynamic = light.mode === 'pointer';
      const tier = GlassSurface.lightingTier(style, light);
      if (!tier) {
        this.#surface?.remove(); this.#surface = null; return;
      }
      this.#surface = GlassSurface.forTier(this.#surface, this.#panel, false, tier, light);
      this.#surface.paint(pointer, null, now);
      if (dynamic && this.#panel.getAnimations().some(a => a.playState === 'running')) this.#scene.wake();
      return dynamic;
    };
  }

  customElements.define('ml-select', MaterialSelect);
})();

(() => {
  'use strict';
  if (customElements.get('ml-multi-select')) return;

  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  const { normalize, renderOptions, revealOption, placePopup } = globalThis[Symbol.for('material-lib.select-picker.v1')];
  let nextId = 0;

  class MultiPicker extends GlassControl {
    get glassContent() { return this.matches(':popover-open') ? this : null; }
  }
  customElements.define('ml-multi-picker', MultiPicker);

  class MultiSelect extends GlassControl {
    #native;
    #field;
    #trigger;
    #chips;
    #chipOptions = new WeakMap();
    #description;
    #error;
    #panel;
    #search;
    #list;
    #empty;
    #count;
    #clear;
    #rows = [];
    #active;
    #shown = false;
    #wasOpen = false;
    #geometry;
    #frame = 0;
    #invalid = false;
    #events;
    #changes = new MutationObserver(records => {
      if (records.some(record => record.target === this || this.#native?.contains(record.target))) this.refresh();
    });

    get select() { return this.querySelector(':scope > select[multiple]'); }
    get glassContent() { return this.#trigger; }
    get open() { return this.#shown; }
    focus(options) { (this.#trigger ?? this.select)?.focus(options); }
    get values() { return Array.from(this.select?.selectedOptions ?? [], option => option.value); }
    set values(values) {
      const keys = new Set(typeof values === 'string' ? [values] : Array.from(values ?? [], String));
      for (const option of this.select?.options ?? []) option.selected = keys.has(option.value);
      this.refresh();
    }

    connectedCallback() {
      for (const child of this.querySelectorAll(':scope > :is(.ml-multi-field, .ml-multi-error, ml-multi-picker)')) child.remove();
      this.removeAttribute('data-ml-multi-ready');
      this.removeAttribute('data-ml-multi-open');
      this.removeAttribute('data-ml-multi-invalid');
      super.connectedCallback();
      this.#events = new AbortController();
      const signal = this.#events.signal;
      this.addEventListener('click', this.#click, { signal });
      this.addEventListener('pointerdown', event => {
        this.#wasOpen = event.target === this.#trigger && this.open;
      }, { signal });
      this.addEventListener('mousedown', event => {
        if (event.button === 0 && this.#list?.contains(event.target)) event.preventDefault();
      }, { signal });
      this.addEventListener('keydown', this.#keys, { signal });
      this.addEventListener('input', this.#nativeChange, { capture: true, signal });
      this.addEventListener('change', this.#nativeChange, { signal });
      this.addEventListener('invalid', this.#validate, { capture: true, signal });
      this.addEventListener('focusout', this.#focusOut, { signal });
      const root = this.getRootNode();
      root.addEventListener('click', this.#labelClick, { signal });
      root.addEventListener('reset', this.#reset, { capture: true, signal });
      this.refresh();
      this.#changes.observe(this, { childList: true, subtree: true, characterData: true, attributes: true,
        attributeFilter: ['multiple', 'disabled', 'required', 'hidden', 'aria-label', 'aria-labelledby', 'aria-describedby', 'aria-invalid', 'data-ml-form-managed',
          'label', 'selected', 'value', 'data-keywords', 'placeholder', 'search-label', 'max-tags'] });
    }

    disconnectedCallback() {
      this.#events.abort();
      this.#changes.disconnect();
      this.close();
      this.#unmount();
      super.disconnectedCallback();
    }

    #mount() {
      const doc = this.ownerDocument, tree = this.getRootNode();
      let id;
      do { id = 'ml-multi-' + ++nextId; } while (['panel', 'options', 'summary', 'error'].some(part => tree.getElementById(id + '-' + part)));
      this.#field = doc.createElement('div');
      this.#field.className = 'ml-multi-field';
      this.#field.innerHTML = `<button type="button" class="ml-multi-trigger" aria-haspopup="dialog" aria-expanded="false">
        <span class="ml-multi-arrow" aria-hidden="true"></span></button>
        <div class="ml-multi-chips"></div><span class="ml-multi-sr"></span>`;
      this.#trigger = this.#field.querySelector('button');
      this.#trigger.setAttribute('aria-controls', id + '-panel');
      this.#chips = this.#field.querySelector('.ml-multi-chips');
      this.#description = this.#field.querySelector('.ml-multi-sr');
      this.#description.id = id + '-summary';
      this.#error = doc.createElement('p');
      this.#error.id = id + '-error';
      this.#error.className = 'ml-multi-error';
      this.#error.setAttribute('role', 'alert');
      this.#error.hidden = true;
      this.#panel = doc.createElement('ml-multi-picker');
      this.#panel.id = id + '-panel';
      this.#panel.popover = 'auto';
      this.#panel.setAttribute('role', 'dialog');
      this.#panel.innerHTML = `<div class="ml-select-search"><input type="search" autocomplete="off" spellcheck="false"></div>
        <div class="ml-select-list" role="listbox" aria-label="可选项" aria-multiselectable="true" tabindex="0"></div>
        <p class="ml-select-empty" role="status" hidden></p>
        <div class="ml-multi-actions"><span class="ml-multi-count" role="status"></span>
          <button type="button" data-ml-clear>清空</button><button type="button" data-ml-done>完成</button></div>`;
      this.#search = this.#panel.querySelector('input');
      this.#list = this.#panel.querySelector('[role="listbox"]');
      this.#list.id = id + '-options';
      this.#search.setAttribute('aria-controls', this.#list.id);
      this.#empty = this.#panel.querySelector('.ml-select-empty');
      this.#count = this.#panel.querySelector('.ml-multi-count');
      this.#clear = this.#panel.querySelector('[data-ml-clear]');
      this.#panel.addEventListener('beforetoggle', event => { if (event.newState === 'closed') this.#release(); });
      this.#search.addEventListener('input', event => {
        event.stopPropagation();
        this.#active = null;
        this.#renderOptions();
      });
      this.#search.addEventListener('change', event => event.stopPropagation());
      this.append(this.#field, this.#error, this.#panel);
      this.toggleAttribute('data-ml-multi-ready', true);
    }

    #unmount() {
      this.#field?.remove();
      this.#error?.remove();
      this.#panel?.remove();
      this.#native = this.#trigger = this.#field = this.#error = this.#panel = null;
      this.#chips = this.#description = this.#search = this.#list = this.#empty = this.#count = this.#clear = null;
      this.#rows = [];
      this.#active = null;
      this.#invalid = false;
      this.removeAttribute('data-ml-multi-ready');
      this.removeAttribute('data-ml-multi-invalid');
    }

    refresh() {
      if (!this.isConnected || typeof this.showPopover !== 'function') return;
      const native = this.select;
      if (this.#native !== native) {
        this.close();
        this.#unmount();
        if (!native) return;
        this.#native = native;
        this.#mount();
      }
      if (!native) return;
      const namedBy = native.getAttribute('aria-labelledby');
      const name = native.getAttribute('aria-label') || native.labels?.[0]?.textContent.trim() || '选择多项';
      for (const control of [this.#trigger, this.#panel]) {
        if (namedBy) control.setAttribute('aria-labelledby', namedBy);
        else control.removeAttribute('aria-labelledby');
        control.setAttribute('aria-label', name);
      }
      this.#trigger.disabled = native.disabled;
      const searchHint = this.getAttribute('search-label') || '搜索名称、分组或关键词';
      this.#search.placeholder = searchHint;
      this.#search.setAttribute('aria-label', searchHint);
      this.#syncSelection();
      if (this.open) {
        if (this.#enabled()) this.#renderOptions();
        else this.close();
      }
    }

    #syncSelection() {
      const native = this.#native;
      const selected = [...native.selectedOptions];
      const root = this.getRootNode(), doc = this.ownerDocument;
      const controls = [...this.#chips.querySelectorAll('button')];
      const focused = controls.indexOf(root.activeElement);
      const maxTags = Number.parseInt(this.getAttribute('max-tags'), 10);
      const limit = maxTags >= 0 ? maxTags : 3;
      const summary = selected.length ? '已选 ' + selected.length + ' 项' : this.getAttribute('placeholder') || '请选择';
      const display = doc.createDocumentFragment();
      for (const option of selected.slice(0, limit)) {
        const chip = doc.createElement('span');
        chip.className = 'ml-multi-chip';
        chip.title = option.label;
        const label = doc.createElement('span');
        label.textContent = option.label;
        const remove = doc.createElement('button');
        remove.type = 'button';
        this.#chipOptions.set(remove, option);
        remove.setAttribute('aria-label', '移除' + option.label);
        remove.disabled = native.disabled || option.matches(':disabled');
        chip.append(label, remove);
        display.append(chip);
      }
      if (!selected.length || selected.length > limit) {
        const more = doc.createElement('span');
        more.className = selected.length ? 'ml-multi-more' : 'ml-multi-placeholder';
        more.textContent = limit > 0 && selected.length ? '+' + (selected.length - limit) : summary;
        more.setAttribute('aria-hidden', 'true');
        display.append(more);
      }
      this.#chips.replaceChildren(display);
      if (focused >= 0) {
        const next = [...this.#chips.querySelectorAll('button:not(:disabled)')];
        (next[Math.min(focused, next.length - 1)] ?? this.#trigger).focus({ preventScroll: true });
      }
      this.#description.textContent = (native.required ? '本项必选。' : '') + summary;
      const count = '已选 ' + selected.length + ' 项';
      if (this.#count.textContent !== count) this.#count.textContent = count;
      this.#clear.disabled = !selected.some(option => !option.matches(':disabled'));
      for (const { option, row } of this.#rows) row.setAttribute('aria-selected', String(option.selected));
      const invalid = !native.hasAttribute('data-ml-form-managed') && this.#invalid && !native.validity.valid;
      this.#invalid = invalid;
      const marked = invalid || native.getAttribute('aria-invalid') === 'true';
      this.toggleAttribute('data-ml-multi-invalid', marked);
      if (marked) this.#trigger.setAttribute('aria-invalid', 'true');
      else this.#trigger.removeAttribute('aria-invalid');
      this.#error.hidden = !invalid;
      const error = invalid ? (native.validity.customError ? native.validationMessage : '请至少选择一项。') : '';
      if (this.#error.textContent !== error) this.#error.textContent = error;
      this.#trigger.setAttribute('aria-describedby', [native.getAttribute('aria-describedby'), this.#description.id,
        invalid && this.#error.id].filter(Boolean).join(' '));
    }

    #enabled() {
      return this.#native && this.#native === this.select && !this.#native.matches(':disabled') && !this.closest('[inert]');
    }

    showPicker() {
      if (this.open || !this.#enabled() || !this.#field.getClientRects().length) return;
      this.refresh();
      this.#search.value = '';
      this.#active = null;
      this.#geometry = '';
      this.#renderOptions();
      this.#panel.showPopover();
      if (!this.#panel.matches(':popover-open')) return;
      this.#shown = true;
      this.#trigger.setAttribute('aria-expanded', 'true');
      this.toggleAttribute('data-ml-multi-open', true);
      this.#position(true);
      if (!this.open) return;
      this.#search.focus({ preventScroll: true });
      if (this.#active) revealOption(this.#active.row, this.#list);
      this.#frame = this.ownerDocument.defaultView.requestAnimationFrame(this.#track);
    }

    close(restoreFocus = false) {
      if (!this.open) return;
      if (this.#panel.matches(':popover-open')) this.#panel.hidePopover();
      this.#release();
      if (restoreFocus) this.#trigger?.focus({ preventScroll: true });
    }

    #release() {
      if (!this.open) return;
      this.#shown = false;
      this.removeAttribute('data-ml-multi-open');
      this.#trigger.setAttribute('aria-expanded', 'false');
      this.ownerDocument.defaultView.cancelAnimationFrame(this.#frame);
    }

    #position(force = false) {
      this.#geometry = placePopup(this, this.#field, this.#panel, this.#geometry, force);
      if (this.#geometry === null) this.close();
    }
    #track = () => {
      if (!this.open) return;
      if (!this.#enabled()) { this.close(); return; }
      this.#position();
      if (this.open) this.#frame = this.ownerDocument.defaultView.requestAnimationFrame(this.#track);
    };

    #choices() { return this.#rows.filter(({ option }) => !option.matches(':disabled')); }

    #renderOptions() {
      const query = normalize(this.#search.value).split(/\s+/).filter(Boolean);
      const previous = this.#active?.option;
      this.#rows = renderOptions(this.#native, this.#list, (option, group) => {
        const terms = normalize([option.label, option.value, group?.label, option.dataset.keywords].filter(Boolean).join(' '));
        return query.every(word => terms.includes(word));
      });
      this.#list.hidden = this.#rows.length === 0;
      this.#empty.hidden = !this.#list.hidden;
      const message = this.#list.hidden ? query.length ? '没有匹配的选项' : '暂无选项' : '';
      if (message !== this.#empty.textContent) this.#empty.textContent = message;
      const choices = this.#choices();
      this.#activate(choices.find(item => item.option === previous) ?? choices[0], false);
      if (this.open) {
        this.#position(true);
        if (this.#active) revealOption(this.#active.row, this.#list);
      }
    }

    #activate(item, scroll = true) {
      this.#active?.row.removeAttribute('data-active');
      this.#active = item;
      if (!item) { this.#list.removeAttribute('aria-activedescendant'); return; }
      item.row.setAttribute('data-active', '');
      this.#list.setAttribute('aria-activedescendant', item.row.id);
      if (scroll) revealOption(item.row, this.#list);
    }

    #toggle(option) {
      if (!this.#enabled() || !option || option.matches(':disabled') || option.closest('select') !== this.#native) return;
      option.selected = !option.selected;
      this.#notify();
    }
    #notify() {
      const native = this.#native;
      native.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      native.dispatchEvent(new Event('change', { bubbles: true }));
      if (this.open) this.#position(true);
    }

    #nativeChange = event => { if (event.target === this.#native) this.#syncSelection(); };
    #validate = event => {
      if (event.target !== this.#native || event.target.hasAttribute('data-ml-form-managed')) return;
      event.preventDefault();
      this.#invalid = true;
      this.#syncSelection();
      if (!this.open) this.#trigger.focus();
    };
    #reset = event => {
      if (event.target !== this.#native?.form) return;
      queueMicrotask(() => {
        if (event.defaultPrevented) return;
        this.close(this.open);
        this.#invalid = false;
        this.refresh();
      });
    };
    #labelClick = event => {
      if (event.defaultPrevented || event.button !== 0 || !this.#enabled() || this.contains(event.target)) return;
      if (event.target.closest?.('label')?.control !== this.#native) return;
      event.preventDefault();
      this.#trigger.focus({ preventScroll: true });
      this.showPicker();
    };
    #focusOut = event => {
      if (this.open && event.relatedTarget && this.#panel.contains(event.target) && !this.#panel.contains(event.relatedTarget)) this.close();
    };
    #click = event => {
      if (event.defaultPrevented || event.button !== 0 || !this.#enabled()) return;
      const target = event.target;
      if (target === this.#trigger) {
        if (this.open || (event.detail > 0 && this.#wasOpen)) this.close(true);
        else this.showPicker();
        this.#wasOpen = false;
      } else if (this.#chipOptions.has(target)) {
        this.#toggle(this.#chipOptions.get(target));
      } else if (this.open && target.hasAttribute('data-ml-done')) {
        this.close(true);
      } else if (this.open && target === this.#clear && !target.disabled) {
        for (const option of [...this.#native.selectedOptions]) if (!option.matches(':disabled')) option.selected = false;
        this.#search.focus({ preventScroll: true });
        this.#notify();
      } else if (this.open && this.#list.contains(target)) {
        const row = target.closest('[role="option"]');
        const item = this.#choices().find(entry => entry.row === row);
        if (item) { this.#activate(item); this.#toggle(item.option); }
      }
    };

    #keys = event => {
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || !this.#enabled()) return;
      const target = event.target, key = event.key;
      if (this.open && key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); this.close(true); return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const arrow = key === 'ArrowDown' || key === 'ArrowUp';
      if (target === this.#trigger && arrow) {
        event.preventDefault(); this.showPicker(); return;
      }
      if (!this.open || (target !== this.#search && target !== this.#list)) return;
      const options = this.#choices();
      if (key === 'Enter' || (key === ' ' && target === this.#list)) {
        event.preventDefault();
        this.#toggle(this.#active?.option);
      } else if (arrow && target === this.#search) {
        if (!options.length) return;
        event.preventDefault();
        this.#list.focus({ preventScroll: true });
        this.#activate(key === 'ArrowUp' ? options.at(-1) : this.#active ?? options[0]);
      } else if (target === this.#list && (arrow || key === 'Home' || key === 'End')) {
        event.preventDefault();
        const index = options.indexOf(this.#active) + (key === 'ArrowDown' ? 1 : -1);
        this.#activate(key === 'Home' ? options[0] : key === 'End' ? options.at(-1) : options[Math.max(0, Math.min(options.length - 1, index))]);
      }
    };
  }

  customElements.define('ml-multi-select', MultiSelect);
})();

(() => {
  'use strict';

  if (customElements.get('ml-progress')) return;
  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  class ProgressTrack extends GlassControl {
    get glassContent() { return this; }
  }
  customElements.define('ml-progress-track', ProgressTrack);

  // A rounded number near an endpoint must still distinguish a partial task from 0 or 100%.
  function percentage(position) {
    const rounded = Math.round(position * 100);
    if (rounded === 0 && position > 0) return '<1%';
    if (rounded === 100 && position < 1) return '>99%';
    return rounded + '%';
  }

  class MaterialProgress extends HTMLElement {
    #view;
    #label;
    #status;
    #number;
    #track;
    #changes = new MutationObserver(records => {
      if (records.some(record => record.target === this ||
          (record.type === 'attributes' && record.target === this.progress))) this.#render();
    });

    get progress() { return this.querySelector(':scope > progress'); }

    connectedCallback() {
      // A clone can already contain another instance's decorative rail.
      for (const copy of this.querySelectorAll(':scope > .ml-progress-view')) {
        if (copy !== this.#view) copy.remove();
      }
      this.#changes.observe(this, { subtree: true, childList: true, attributes: true,
        attributeFilter: ['value', 'max', 'aria-label', 'state'] });
      this.#render();
    }

    disconnectedCallback() { this.#changes.disconnect(); }

    #mount() {
      this.#view = this.ownerDocument.createElement('span');
      this.#view.className = 'ml-progress-view';
      this.#view.innerHTML = `<span class="ml-progress-head">
        <span class="ml-progress-label" aria-hidden="true"></span>
        <span class="ml-progress-reading"><span class="ml-progress-status" role="status"></span><strong class="ml-progress-number" aria-hidden="true"></strong></span>
      </span><ml-progress-track aria-hidden="true"><span class="ml-progress-fill"></span><span class="ml-progress-activity"></span></ml-progress-track>`;
      this.#label = this.#view.querySelector('.ml-progress-label');
      this.#status = this.#view.querySelector('.ml-progress-status');
      this.#number = this.#view.querySelector('.ml-progress-number');
      this.#track = this.#view.querySelector('ml-progress-track');
    }

    #render() {
      // The native element owns naming, max, clamping and the distinction between 0 and missing value.
      const native = this.progress;
      this.toggleAttribute('data-ml-progress-ready', Boolean(native));
      if (!native) { this.#view?.remove(); return; }
      if (!this.#view) this.#mount();
      const position = native.position;
      const requested = this.getAttribute('state');
      const state = requested === 'paused' || requested === 'error' ? requested
        : position === 1 ? 'complete' : position < 0 ? 'waiting' : 'active';
      this.#view.dataset.state = state;
      this.#view.toggleAttribute('data-indeterminate', position < 0);
      this.#view.toggleAttribute('data-at-start', position === 0);
      this.#label.textContent = native.getAttribute('aria-label') ?? '';
      const status = { paused: '已暂停', error: '失败', complete: '已完成', waiting: '进行中' }[state] ?? '';
      if (this.#status.textContent !== status) this.#status.textContent = status;
      this.#number.textContent = position < 0 ? '' : percentage(position);
      this.#track.style.setProperty('--ml-progress-level', Math.max(0, position * 100) + '%');
      if (this.#view.parentElement !== this) this.append(this.#view);
    }
  }
  customElements.define('ml-progress', MaterialProgress);
})();

(() => {
  'use strict';
  if (customElements.get('ml-file-upload')) return;

  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  const stateLabel = { ready: '待上传', uploading: '上传中', complete: '已上传', error: '上传失败', canceled: '已取消' };
  const fileKey = file => JSON.stringify([file.name, file.size, file.type, file.lastModified]);
  let nextId = 0;

  function uniqueId(tree) {
    let id;
    do { id = 'ml-file-' + ++nextId; } while (['', '-hint', '-message'].some(suffix => tree.getElementById(id + suffix)));
    return id;
  }

  function limit(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? number : Infinity;
  }
  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    const unit = Math.min(3, Math.floor(Math.log(bytes) / Math.log(1024)));
    return (bytes / 1024 ** unit).toLocaleString('zh-CN', { maximumFractionDigits: 1 }) + ' ' + ['B', 'KiB', 'MiB', 'GiB'][unit];
  }
  function allowed(file, rules) {
    const type = file.type.toLowerCase(), name = file.name.toLowerCase();
    return rules.length === 0 || rules.some(rule => rule === '*/*' || (rule.startsWith('.') ? name.endsWith(rule)
      : rule.endsWith('/*') ? type.startsWith(rule.slice(0, -1)) : type === rule));
  }

  class DropSurface extends GlassControl {
    get glassContent() { return this.closest('ml-file-upload')?.input; }
  }
  customElements.define('ml-file-drop', DropSurface);

  class FileUpload extends HTMLElement {
    #native;
    #view;
    #hintId;
    #messageId;
    #items = [];
    #upload;
    #events;
    #reasons = [];
    #invalid = false;
    #dragDepth = 0;
    #changing = false;
    #changes = new MutationObserver(records => {
      if (records.some(({ target, type }) => target === this ||
        (type === 'attributes' && target.parentElement === this && target.localName === 'input'))) this.refresh();
    });

    get input() { return this.querySelector(':scope > input[type="file"]'); }
    get files() { return Array.from(this.input?.files ?? []); }
    get entries() {
      this.#bindInput();
      return this.#items.map(({ file, state, progress }) => ({ file, state, progress }));
    }
    get upload() { return this.#upload; }
    set upload(handler) {
      this.#upload = typeof handler === 'function' ? handler : undefined;
      if (this.#view) {
        for (const item of this.#items) this.#renderRow(item);
        this.#renderFooter();
      }
    }

    connectedCallback() {
      for (const copy of this.querySelectorAll(':scope > .ml-file-view')) if (copy !== this.#view) copy.remove();
      if (typeof this.ownerDocument.defaultView.DataTransfer !== 'function') {
        this.removeAttribute('data-ml-file-ready');
        return;
      }
      this.#events = new AbortController();
      const signal = this.#events.signal;
      this.addEventListener('input', this.#choose, { capture: true, signal });
      this.addEventListener('change', this.#choose, { capture: true, signal });
      this.addEventListener('click', this.#click, { signal });
      this.addEventListener('invalid', this.#onInvalid, { capture: true, signal });
      this.getRootNode().addEventListener('reset', this.#reset, { capture: true, signal });
      for (const name of ['dragenter', 'dragover', 'dragleave', 'drop', 'dragend']) this.addEventListener(name, this.#drag, { signal });
      this.#changes.observe(this, { childList: true, attributes: true, subtree: true,
        attributeFilter: ['type', 'id', 'disabled', 'multiple', 'accept', 'required', 'max-files', 'max-size', 'label', 'upload-label', 'data-ml-form-managed'] });
      this.refresh();
    }

    disconnectedCallback() {
      this.#events?.abort();
      this.#events = null;
      this.#changes.disconnect();
      this.#endDrag();
      queueMicrotask(() => {
        if (!this.isConnected) for (const item of this.#items) this.#cancel(item);
      });
    }

    #bindInput() {
      if (!this.#events) return;
      const input = this.input;
      if (input === this.#native) return;
      const previous = this.#items;
      if (this.#native) {
        const descriptions = (this.#native.getAttribute('aria-describedby') || '').split(/\s+/)
          .filter(id => id && id !== this.#hintId && id !== this.#messageId);
        if (descriptions.length) this.#native.setAttribute('aria-describedby', descriptions.join(' '));
        else this.#native.removeAttribute('aria-describedby');
      }
      this.#native = input;
      this.#items = [];
      this.#reasons = [];
      this.#invalid = false;
      this.#endDrag();
      this.removeAttribute('data-ml-file-invalid');
      this.#view?.remove();
      this.#view = null;
      this.toggleAttribute('data-ml-file-ready', !!input);
      if (input) {
        this.#mount();
        this.#add([...input.files], { replace: true, announce: false });
      }
      const adopted = this.#items;
      for (const item of previous) this.#abort(item);
      if (input === this.input && adopted === this.#items && (previous.length || adopted.length)) {
        this.#emit('ml-files-change', { files: this.files });
      }
    }

    #mount() {
      const doc = this.ownerDocument, tree = this.getRootNode();
      const id = uniqueId(tree);
      const input = this.#native;
      if (!input.id || tree.querySelectorAll('#' + CSS.escape(input.id)).length !== 1) input.id = id;
      this.#hintId = id + '-hint';
      this.#messageId = id + '-message';
      const descriptions = (input.getAttribute('aria-describedby') || '').split(/\s+/)
        .filter(value => value && !/^ml-file-\d+-(hint|message)$/.test(value));
      input.setAttribute('aria-describedby', [...descriptions, this.#hintId, this.#messageId].join(' '));
      this.#view = doc.createElement('div');
      this.#view.className = 'ml-file-view';
      this.#view.innerHTML = `<ml-file-drop>
        <label class="ml-file-pick"><span class="ml-file-mark" aria-hidden="true"></span>
          <span class="ml-file-prompt"><strong></strong><span aria-hidden="true">或将文件拖到这里</span></span>
        </label><small class="ml-file-hint"></small>
      </ml-file-drop>
      <p class="ml-file-message" role="status"></p>
      <ul class="ml-file-list" role="list" aria-label="已选文件" hidden></ul>
      <div class="ml-file-footer" hidden><span class="ml-file-total"></span>
        <ml-button><button type="button" data-action="upload">上传文件</button></ml-button></div>
      <span class="ml-file-sr" role="status"></span>`;
      this.#view.querySelector('label').htmlFor = input.id;
      this.#view.querySelector('.ml-file-hint').id = this.#hintId;
      this.#view.querySelector('.ml-file-message').id = this.#messageId;
      this.append(this.#view);
    }

    #limits() {
      return {
        count: this.#native.multiple ? limit(this.getAttribute('max-files')) : 1,
        size: limit(this.getAttribute('max-size')),
        rules: this.#native.accept.toLowerCase().split(',').map(value => value.trim()).filter(Boolean),
      };
    }
    #available() { return this.isConnected && this.#native && this.#native === this.input && !this.#native.matches(':disabled') && !this.closest('[inert]'); }

    refresh() {
      this.#bindInput();
      if (!this.#view || !this.#events) return;
      if (!this.#native.id) this.#native.id = uniqueId(this.getRootNode());
      const label = this.#view.querySelector('label');
      if (label.htmlFor !== this.#native.id) label.htmlFor = this.#native.id;
      const { count, size, rules } = this.#limits();
      const hint = [];
      if (rules.length) hint.push(rules.join('、'));
      if (Number.isFinite(size)) hint.push('单个不超过 ' + formatSize(size));
      if (Number.isFinite(count)) hint.push('最多 ' + count + ' 个');
      const note = this.#view.querySelector('.ml-file-hint');
      note.textContent = hint.join(' · ');
      note.hidden = !hint.length;
      this.#view.querySelector('.ml-file-prompt strong').textContent = this.getAttribute('label') || '选择文件';
      if (!this.#available()) this.#endDrag();
      const incoming = [...this.#native.files];
      const same = incoming.length === this.#items.length && incoming.every((file, index) => file === this.#items[index].file);
      if (!same || this.#items.length > count || this.#items.some(item => item.file.size > size || !allowed(item.file, rules))) {
        this.#add(incoming, { replace: true });
      }
      for (const item of this.#items) this.#renderRow(item);
      this.#renderMessage();
      this.#renderFooter();
    }

    addFiles(files) {
      this.#bindInput();
      if (!this.#view || !this.#available()) return [];
      return this.#add(Array.from(files ?? []), { nativeEvents: true });
    }

    #add(files, { replace = false, nativeEvents = false, announce = true }) {
      const { count, size, rules } = this.#limits();
      const next = replace || !this.#native.multiple ? [] : [...this.#items];
      const previous = new Map(this.#items.map(item => [fileKey(item.file), item]));
      const seen = new Set(next.map(item => fileKey(item.file)));
      const accepted = [];
      this.#reasons = [];
      for (const file of files) {
        if (!(file instanceof this.ownerDocument.defaultView.File)) continue;
        const key = fileKey(file);
        const reason = !allowed(file, rules) ? '类型不符合要求' : file.size > size ? '超过单个文件大小限制'
          : seen.has(key) ? '已添加' : next.length >= count ? '超过文件数量限制' : '';
        if (reason) { this.#reasons.push('「' + file.name + '」' + reason); continue; }
        const entry = previous.get(key) ?? { file, state: 'ready', progress: null, run: null };
        seen.add(key);
        next.push(entry);
        accepted.push(file);
      }
      const keep = !replace && !this.#native.multiple && !next.length ? this.#items : next;
      this.#apply(keep, { nativeEvents, announce });
      return accepted;
    }

    #apply(next, { nativeEvents, announce = true }) {
      const unchanged = next.length === this.#items.length && next.every((item, index) => item === this.#items[index]);
      const transfer = new this.ownerDocument.defaultView.DataTransfer();
      for (const item of next) transfer.items.add(item.file);
      this.#native.files = transfer.files;
      const removed = this.#items.filter(item => !next.includes(item));
      this.#items = next;
      for (const item of removed) this.#abort(item);
      if (!unchanged) this.#renderList();
      this.#renderMessage();
      this.#renderFooter();
      if (unchanged) return;
      if (nativeEvents) {
        this.#changing = true;
        try {
          this.#native.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
          this.#native.dispatchEvent(new Event('change', { bubbles: true }));
        } finally { this.#changing = false; }
      }
      if (announce) this.#emit('ml-files-change', { files: this.files });
    }

    #choose = event => {
      if (event.target !== this.input || this.#changing) return;
      this.#bindInput();
      if (!this.#native) return;
      const selected = [...this.#native.files];
      if (selected.length === this.#items.length && selected.every((file, index) => file === this.#items[index].file)) return;
      this.#add(selected, { replace: selected.length === 0 });
    };
    #onInvalid = event => {
      if (event.target !== this.input || event.target.hasAttribute('data-ml-form-managed')) return;
      this.#bindInput();
      event.preventDefault();
      this.#invalid = true;
      this.#renderMessage();
      this.#native.focus();
    };
    #reset = event => {
      const input = this.input;
      if (event.target !== input?.form) return;
      queueMicrotask(() => { if (!event.defaultPrevented && input === this.input) this.clear(false); });
    };
    clear(notify = true) {
      this.#bindInput();
      if (!this.#view) return;
      this.#reasons = [];
      this.#invalid = false;
      this.#apply([], { nativeEvents: notify });
    }

    #drag = event => {
      if (event.target.closest?.('ml-file-drop') !== this.#view?.firstElementChild || !this.#view) return;
      if (event.type === 'dragend') { this.#endDrag(); return; }
      if (!event.dataTransfer?.types.includes('Files')) return;
      event.preventDefault();
      if (event.type === 'dragleave') {
        if (--this.#dragDepth <= 0) this.#endDrag();
      } else if (event.type === 'drop') {
        this.#endDrag();
        this.addFiles(event.dataTransfer.files);
      } else if (this.#available()) {
        event.dataTransfer.dropEffect = 'copy';
        if (event.type === 'dragenter') this.#dragDepth++;
        this.toggleAttribute('data-ml-file-drag', true);
      } else {
        event.dataTransfer.dropEffect = 'none';
        this.#endDrag();
      }
    };
    #endDrag() { this.#dragDepth = 0; this.removeAttribute('data-ml-file-drag'); }

    #click = event => {
      if (!this.#available() || event.defaultPrevented) return;
      const action = event.target.closest('button[data-action]');
      if (!action || !this.#view.contains(action)) return;
      if (action.dataset.action === 'upload') {
        this.start();
        return;
      }
      const index = this.#items.findIndex(item => item.row === action.closest('li'));
      const item = this.#items[index];
      if (!item) return;
      if (action.dataset.action === 'remove') {
        this.#reasons = [];
        this.#apply(this.#items.filter(entry => entry !== item), { nativeEvents: true });
        (this.#items[Math.min(index, this.#items.length - 1)]?.row.querySelector('button:not([hidden]):enabled') ?? this.#native).focus();
      } else if (action.dataset.action === 'cancel') this.#cancel(item);
      else if (action.dataset.action === 'retry') this.#run(item);
    };

    start() {
      this.#bindInput();
      return Promise.all(this.#items.filter(item => item.state === 'ready').map(item => this.#run(item)));
    }
    async #run(item) {
      if (!this.#available() || !this.#upload || item.run) return;
      const upload = this.#upload, input = this.#native;
      const run = new AbortController();
      const current = () => item.run === run && this.isConnected && this.input === input;
      item.run = run;
      item.progress = null;
      this.#setState(item, 'uploading');
      if (!current()) return;
      try {
        await upload.call(this, item.file, { signal: run.signal, onProgress: (loaded, total = item.file.size) => {
          if (!current() || !Number.isFinite(loaded) || !Number.isFinite(total) || total <= 0) return;
          item.progress = Math.min(100, Math.max(0, 100 * loaded / total));
          this.#renderRow(item);
        } });
        if (!current()) return;
        item.run = null;
        item.progress = 100;
        this.#setState(item, 'complete');
      } catch {
        if (!current()) return;
        item.run = null;
        this.#setState(item, 'error');
      }
    }
    #abort(item) {
      const run = item.run;
      item.run = null;
      run?.abort();
    }
    #cancel(item) {
      if (!item.run) return;
      this.#abort(item);
      this.#setState(item, 'canceled');
    }
    #setState(item, state) {
      const root = this.getRootNode();
      const active = root.activeElement;
      const focused = item.row?.contains(active);
      const start = this.#view.querySelector('[data-action="upload"]');
      const startFocused = start === active;
      item.state = state;
      this.#renderRow(item);
      this.#renderFooter();
      if (focused && (active.hidden || active.disabled || !item.row.contains(root.activeElement))) {
        item.row.querySelector('button:not([hidden]):enabled')?.focus({ preventScroll: true });
      } else if (startFocused && start.disabled) {
        (item.row.querySelector('button:not([hidden]):enabled') ?? this.#native).focus({ preventScroll: true });
      }
      this.#view.querySelector('.ml-file-sr').textContent = item.file.name + '，' + stateLabel[state];
      this.#emit('ml-upload-state', { file: item.file, state, progress: item.progress });
    }

    #renderList() {
      const doc = this.ownerDocument;
      const list = this.#view.querySelector('.ml-file-list');
      for (const item of this.#items) {
        if (!item.row) {
          const row = doc.createElement('li');
          row.innerHTML = `<span class="ml-file-type" aria-hidden="true"></span>
            <div class="ml-file-detail"><strong></strong><small></small>
              <ml-progress class="ml-file-progress" hidden><progress max="100"></progress></ml-progress></div>
            <div class="ml-file-actions"><button type="button" data-action="retry" hidden>重试</button>
              <button type="button" data-action="cancel" hidden>取消</button><button type="button" data-action="remove"></button></div>`;
          row.className = 'ml-file-row';
          row.querySelector('strong').textContent = item.file.name;
          row.querySelector('strong').title = item.file.name;
          row.querySelector('progress').setAttribute('aria-label', item.file.name + '上传进度');
          for (const button of row.querySelectorAll('button')) {
            const actionName = { retry: '重试', cancel: '取消上传', remove: '移除' }[button.dataset.action];
            button.setAttribute('aria-label', actionName + item.file.name);
          }
          row.querySelector('[data-action="remove"]').title = '移除文件';
          row.toggleAttribute('data-image', item.file.type.startsWith('image/'));
          item.row = row;
        }
        this.#renderRow(item);
      }
      list.replaceChildren(...this.#items.map(item => item.row));
      list.hidden = this.#items.length === 0;
    }
    #renderRow(item) {
      const { row, file, state, progress } = item;
      if (!row) return;
      const label = state === 'ready' && !this.#upload ? '已添加' : stateLabel[state];
      const status = formatSize(file.size) + ' · ' + label;
      if (row.querySelector('small').textContent !== status) row.querySelector('small').textContent = status;
      row.dataset.state = state;
      row.querySelector('[data-action="cancel"]').hidden = state !== 'uploading';
      row.querySelector('[data-action="remove"]').hidden = state === 'uploading';
      row.querySelector('[data-action="retry"]').hidden = !this.#upload || !['error', 'canceled'].includes(state);
      for (const button of row.querySelectorAll('button')) button.disabled = this.#native.disabled;
      row.querySelector('ml-progress').hidden = state !== 'uploading';
      const rail = row.querySelector('progress');
      if (progress == null) rail.removeAttribute('value');
      else rail.value = progress;
    }
    #renderMessage() {
      this.#invalid &&= !this.#native.hasAttribute('data-ml-form-managed') && !this.#native.validity.valid;
      this.toggleAttribute('data-ml-file-invalid', this.#invalid);
      const validation = this.#invalid ? (this.#native.validity.valueMissing ? '请先选择文件。' : this.#native.validationMessage) : '';
      const message = this.#reasons.length ? this.#reasons.join('。') : validation;
      const area = this.#view.querySelector('.ml-file-message');
      if (area.textContent !== message) area.textContent = message;
    }
    #renderFooter() {
      const footer = this.#view.querySelector('.ml-file-footer');
      const upload = footer.querySelector('button');
      footer.hidden = this.#items.length === 0;
      footer.querySelector('.ml-file-total').textContent = '已选 ' + this.#items.length + ' 个文件';
      upload.parentElement.hidden = !this.#upload;
      upload.disabled = this.#native.disabled || !this.#items.some(item => item.state === 'ready');
      upload.textContent = this.getAttribute('upload-label') || '上传文件';
    }
    #emit(name, detail) { this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail })); }
  }
  customElements.define('ml-file-upload', FileUpload);
})();

(() => {
  'use strict';
  if (customElements.get('ml-form')) return;

  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  const controls = 'input:not([type="hidden"], [type="submit"], [type="reset"], [type="button"], [type="image"]), select, textarea';
  const widgets = 'ml-input, ml-select, ml-multi-select, ml-file-upload, ml-date-range, ml-choice-group';
  const structure = controls + ', form, fieldset, option, .ml-form-hint';
  const fieldAttributes = ['id', 'disabled', 'readonly', 'required', 'form', 'type', 'name', 'min', 'max', 'step',
    'minlength', 'maxlength', 'pattern', 'multiple', 'selected', 'value', 'data-error-message', 'error-message'];
  const ownership = new WeakMap();
  let nextId = 0;

  function fieldGroup(control) {
    return control.closest('.ml-form-field') ?? control.closest(widgets) ?? control;
  }

  function textId(node) {
    if (node.id) return node.id;
    const root = node.getRootNode();
    let id;
    do { id = 'ml-form-text-' + ++nextId; } while (root.getElementById(id));
    node.id = id;
    return id;
  }

  function labelOf(group, control) {
    const label = group.querySelector(':scope > :is(.ml-form-label, legend)');
    return (label?.textContent || control.getAttribute('aria-label') || control.labels?.[0]?.textContent || control.name)
      .replace(/\s*[＊*]\s*$/, '').trim() || '此字段';
  }

  function messageFor(group, control) {
    const { validity, type } = control;
    if (validity.customError) return control.validationMessage;
    const message = control.dataset.errorMessage || group.dataset.errorMessage || control.parentElement?.getAttribute('error-message');
    if (message) return message;
    if (validity.valueMissing) {
      if (type === 'file') return '请选择文件。';
      if (type === 'select-multiple') return '请至少选择一项。';
      if (type === 'select-one' || type === 'radio') return '请选择一项。';
      if (type === 'checkbox') return '请勾选此项。';
      if (type === 'date') return '请选择日期。';
      return '请填写此项。';
    }
    if (validity.typeMismatch && type === 'email') return '请输入有效的电子邮箱地址。';
    if (validity.typeMismatch && type === 'url') return '请输入有效的网址。';
    if (validity.badInput && type === 'number') return '请输入有效的数字。';
    if (validity.tooShort) return '至少输入 ' + control.minLength + ' 个字符。';
    if (validity.tooLong) return '最多输入 ' + control.maxLength + ' 个字符。';
    if (validity.patternMismatch) return '请输入符合要求的格式。';
    if (validity.rangeUnderflow) return '请输入不小于 ' + control.min + ' 的值。';
    if (validity.rangeOverflow) return '请输入不大于 ' + control.max + ' 的值。';
    return control.validationMessage;
  }

  function describe(control, state, ids) {
    const current = control.getAttribute('aria-describedby');
    const retained = (current || '').split(/\s+/).filter(id => id && !state.ids.includes(id));
    state.ids = ids.filter(id => id && !retained.includes(id));
    const next = retained.concat(state.ids).join(' ');
    if (next) {
      if (next !== current) control.setAttribute('aria-describedby', next);
    } else if (current !== null) control.removeAttribute('aria-describedby');
  }

  function markInvalid(control, state, invalid) {
    const current = control.getAttribute('aria-invalid');
    if (invalid) {
      if (state.priorInvalid === undefined) state.priorInvalid = current;
      if (current !== 'true') control.setAttribute('aria-invalid', 'true');
    } else if (state.priorInvalid !== undefined) {
      if (current === 'true') {
        if (state.priorInvalid === null) control.removeAttribute('aria-invalid');
        else control.setAttribute('aria-invalid', state.priorInvalid);
      }
      state.priorInvalid = undefined;
    }
  }

  class MaterialForm extends GlassControl {
    #native;
    #events;
    #managed = new Set();
    #groups = new Map();
    #errors = new Map();
    #touched = new WeakSet();
    #attempted = false;
    #pending = false;
    #pointer = null;
    #deferredBlur;
    #submitClick;
    #summary;
    #live;
    #issues = [];
    #linkedSelector = '';
    #linkedChanges = new MutationObserver(records => {
      const linked = this.#linkedSelector;
      if (!linked) return;
      if (!this.#native?.id) { this.refresh(); return; }
      const containsLink = node => node.nodeType === 1 && (node.matches(linked) || node.querySelector(linked));
      const ownerId = '#' + CSS.escape(this.#native.id);
      if (records.some(({ target, type, attributeName, oldValue, addedNodes, removedNodes }) => {
        if (this.contains(target)) return false;
        if (this.#managed.has(target) || target.closest?.(linked)) return true;
        if (attributeName === 'id') return target.id === this.#native.id || oldValue === this.#native.id;
        if (type === 'attributes') return containsLink(target);
        return [...addedNodes, ...removedNodes].some(node => containsLink(node) ||
          (node.nodeType === 1 && (node.matches(ownerId) || node.querySelector(ownerId)))) ||
          (target.closest?.('.ml-form-field')?.querySelector(linked) &&
            [...addedNodes, ...removedNodes].some(node => node.nodeType === 1 && node.matches('.ml-form-hint')));
      })) this.refresh();
    });
    #structure = new MutationObserver(records => {
      if (records.some(record => record.type === 'attributes' || [...record.addedNodes, ...record.removedNodes]
        .some(node => node.nodeType === 1 && (node.matches(structure) || node.querySelector(structure))))) this.refresh();
    });

    get form() { return this.querySelector(':scope > form'); }
    get glassContent() { return this.form; }

    connectedCallback() {
      super.connectedCallback();
      this.#events = new AbortController();
      const signal = this.#events.signal;
      const root = this.getRootNode();
      root.addEventListener('invalid', this.#invalid, { capture: true, signal });
      root.addEventListener('input', this.#edit, { signal });
      root.addEventListener('change', this.#edit, { signal });
      root.addEventListener('focusout', this.#blur, { signal });
      this.addEventListener('reset', this.#reset, { signal });
      root.addEventListener('click', this.#activateSubmit, { capture: true, signal });
      const doc = this.ownerDocument;
      doc.addEventListener('pointerdown', this.#press, { capture: true, signal });
      doc.addEventListener('pointerup', this.#releasePointer, { capture: true, signal });
      doc.addEventListener('pointercancel', this.#releasePointer, { capture: true, signal });
      doc.defaultView?.addEventListener('blur', this.#releasePointer, { signal });
      this.#structure.observe(this, { childList: true, subtree: true, attributeFilter: fieldAttributes });
      this.refresh();
    }

    disconnectedCallback() {
      this.#events.abort();
      this.#structure.disconnect();
      this.#linkedChanges.disconnect();
      this.#linkedSelector = '';
      this.#pointer = null;
      this.#deferredBlur = null;
      super.disconnectedCallback();
      queueMicrotask(() => {
        if (this.isConnected) return;
        for (const control of this.#managed) this.#release(control);
        this.#groups.clear();
        for (const [group, error] of this.#errors) {
          if (!this.contains(group)) { error.remove(); this.#errors.delete(group); }
        }
      });
    }

    #mount(form) {
      this.#summary?.remove();
      this.#live?.remove();
      for (const error of this.#errors.values()) error.remove();
      for (const control of this.#managed) this.#release(control);
      this.#errors.clear();
      this.#native = form;
      this.#clear();
      if (!form) return;
      // A live region stays mounted while the visible summary opens and closes.
      const doc = this.ownerDocument;
      this.#live = doc.createElement('span');
      this.#live.className = 'ml-form-live';
      this.#live.setAttribute('role', 'status');
      this.#summary = doc.createElement('div');
      this.#summary.className = 'ml-form-summary';
      this.#summary.hidden = true;
      this.#summary.tabIndex = -1;
      this.#summary.setAttribute('role', 'group');
      this.#summary.setAttribute('aria-label', '表单校验错误');
      this.#summary.innerHTML = '<p><strong></strong></p><ul role="list"></ul>';
      this.#summary.addEventListener('click', event => {
        const button = event.target.closest('button[data-field]');
        if (button) this.#focus(this.#issues[Number(button.dataset.field)]?.control);
      });
      form.prepend(this.#live, this.#summary);
    }

    #claim(control) {
      const prior = ownership.get(control);
      if (prior?.owner === this) return prior;
      prior?.owner.#release(control);
      control.setAttribute('data-ml-form-managed', '');
      // Let a previously standalone input restore its authored ARIA state first.
      control.parentElement?.closest('ml-input')?.refresh?.();
      const state = { owner: this, ids: [], priorInvalid: undefined };
      ownership.set(control, state);
      this.#managed.add(control);
      return state;
    }

    #release(control) {
      const state = ownership.get(control);
      describe(control, state, []);
      markInvalid(control, state, false);
      control.removeAttribute('data-ml-form-managed');
      ownership.delete(control);
      this.#managed.delete(control);
    }

    #belongs(control) {
      return this.#native && control?.form === this.#native && control.matches(controls)
        && !control.closest('.ml-select-popup, ml-multi-picker');
    }

    #inline(group, message) {
      let error = this.#errors.get(group);
      if (!error && message) {
        error = this.ownerDocument.createElement('p');
        error.className = 'ml-form-error';
        group.append(error);
        textId(error);
        this.#errors.set(group, error);
      }
      if (error) {
        if (error.textContent !== message) error.textContent = message;
        error.hidden = !message;
      }
      return message ? error.id : '';
    }

    #renderSummary(issues) {
      if (issues.length === this.#issues.length && issues.every(({ control, label, message }, index) => {
        const previous = this.#issues[index];
        return control === previous.control && label === previous.label && message === previous.message;
      })) return;
      const previousCount = this.#issues.length;
      this.#issues = issues;
      const title = issues.length ? '请检查 ' + issues.length + ' 项' : '';
      this.#summary.hidden = !issues.length;
      this.#summary.querySelector('strong').textContent = title;
      this.#summary.querySelector('ul').replaceChildren(...issues.map(({ label, message }, index) => {
        const item = this.ownerDocument.createElement('li');
        const button = this.ownerDocument.createElement('button');
        button.type = 'button';
        button.dataset.field = index;
        button.textContent = label;
        item.append(button, '　' + message);
        return item;
      }));
      if (previousCount !== issues.length) this.#live.textContent = title;
    }

    refresh() {
      const form = this.form;
      if (form !== this.#native) this.#mount(form);
      const linked = this.isConnected && form?.id ? '[form="' + CSS.escape(form.id) + '"]' : '';
      if (linked !== this.#linkedSelector) {
        this.#linkedChanges.disconnect();
        this.#linkedSelector = linked;
        if (linked) this.#linkedChanges.observe(this.getRootNode(), {
          childList: true, subtree: true, attributeOldValue: true, attributeFilter: fieldAttributes,
        });
      }
      const groups = new Map();
      this.#groups = groups;
      if (!form) return true;

      const fields = new Set([...form.elements].filter(control => this.#belongs(control)));
      for (const control of this.#managed) if (!fields.has(control)) this.#release(control);
      for (const control of fields) {
        const group = fieldGroup(control);
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group).push(control);
      }
      for (const [group, error] of this.#errors) {
        if (!groups.has(group)) { error.remove(); this.#errors.delete(group); }
      }

      const issues = [];
      for (const [group, groupControls] of groups) {
        const control = groupControls.find(field => field.willValidate && !field.validity.valid);
        const issue = control && { group, control, label: labelOf(group, control), message: messageFor(group, control) };
        if (issue) issues.push(issue);
        const show = issue && (this.#attempted || this.#touched.has(group));
        const hint = group.querySelector(':scope > .ml-form-hint:not([hidden])');
        const errorId = group.matches('.ml-form-field') ? this.#inline(group, show ? issue.message : '') : '';
        for (const field of groupControls) {
          const state = this.#claim(field);
          const invalid = Boolean(show && field.willValidate && !field.validity.valid);
          markInvalid(field, state, invalid);
          describe(field, state, [hint && textId(hint), invalid && errorId]);
        }
      }
      this.#renderSummary(this.#attempted ? issues : []);
      return issues.length === 0;
    }

    #focus(control) {
      if (!control || control.matches(':disabled') || !this.#belongs(control)) return;
      const multi = control.parentElement?.closest('ml-multi-select');
      if (multi?.select === control && typeof multi.focus === 'function') multi.focus();
      else control.focus();
    }

    reportValidity() {
      this.#attempted = true;
      const valid = this.refresh();
      if (!valid) this.#focus(this.#issues[0]?.control);
      return valid;
    }

    #activateSubmit = event => {
      const action = event.target.closest?.('button, input');
      if (!event.isTrusted || action?.form !== this.#native || !['submit', 'image'].includes(action?.type)) return;
      this.#submitClick = event;
      setTimeout(() => { if (this.#submitClick === event) this.#submitClick = null; }, 0);
    };

    #invalid = event => {
      if (!this.#belongs(event.target)) return;
      event.preventDefault();
      if (this.#pending) return;
      this.#pending = true;
      const activation = this.#submitClick;
      const form = this.#native;
      queueMicrotask(() => {
        this.#pending = false;
        if (form !== this.form) return;
        this.#attempted = true;
        this.refresh();
        if (activation && !activation.defaultPrevented && this.isConnected && !this.#summary.hidden) this.#summary.focus();
      });
    };

    #edit = event => {
      if (!event.isComposing && this.#belongs(event.target)) this.refresh();
    };

    #press = event => {
      const active = this.getRootNode().activeElement;
      if (event.button === 0 && (this.#native?.contains(active) || this.#belongs(active))) this.#pointer = event.pointerId;
    };

    #releasePointer = event => {
      if (event.type !== 'blur' && event.pointerId !== this.#pointer) return;
      this.#pointer = null;
      const group = this.#deferredBlur;
      // Wait until click activation finishes before messages can move its target.
      if (group) setTimeout(() => {
        if (group !== this.#deferredBlur) return;
        this.#deferredBlur = null;
        if (!group.contains(this.getRootNode().activeElement)) this.#validateBlur(group);
      }, 0);
    };

    #blur = event => {
      const group = event.target.closest && fieldGroup(event.target);
      if (!this.#groups.has(group) || group.contains(event.relatedTarget)) return;
      if (this.#pointer !== null) this.#deferredBlur = group;
      else this.#validateBlur(group);
    };

    #validateBlur(group) {
      if (this.#attempted || this.getAttribute('validate-on') === 'submit' || this.#native?.noValidate) return;
      this.#touched.add(group);
      this.refresh();
      const error = this.#errors.get(group);
      this.#live.textContent = error && !error.hidden ? error.textContent : '';
    };

    #clear() {
      this.#attempted = false;
      this.#touched = new WeakSet();
      this.#deferredBlur = null;
      if (this.#live) this.#live.textContent = '';
    }

    #reset = event => {
      if (event.target !== this.#native) return;
      queueMicrotask(() => {
        if (event.defaultPrevented || event.target !== this.form) return;
        this.#clear();
        this.refresh();
      });
    };
  }
  customElements.define('ml-form', MaterialForm);
})();

(() => {
  'use strict';

  if (customElements.get('ml-hover-card')) return;
  const { GlassScene, GlassSurface } = globalThis[Symbol.for('material-lib.glass.v1')];
  const activeCards = new WeakMap();
  let nextId = 0;

  function ensureId(element, kind) {
    const prefix = 'ml-hover-' + kind + '-';
    if (!element.id || element.id.startsWith(prefix)) element.id = prefix + ++nextId;
    return element.id;
  }

  class MaterialHoverCard extends HTMLElement {
    #trigger;
    #panel;
    #surface;
    #events;
    #openEvents;
    #timer;
    #frame = 0;
    #over = false;
    #returning = false;
    #pressedOpen;
    #size = new ResizeObserver(() => this.#queuePosition());
    #visibility = new IntersectionObserver(entries => {
      const last = entries.at(-1);
      if (this.open && last.target === this.#trigger && !last.isIntersecting) this.hide();
    });
    #children = new MutationObserver(() => this.#bind());
    #scene;
    #glass;

    get open() { return Boolean(this.#openEvents); }

    connectedCallback() {
      globalThis[Symbol.for('material-lib.motion-frames.v1')].watch(this.getRootNode());
      this.#children.observe(this, { childList: true });
      this.#bind();
    }

    disconnectedCallback() {
      this.#children.disconnect();
      this.#unbind();
    }

    #bind() {
      const trigger = this.querySelector(':scope > button');
      const panel = this.querySelector(':scope > .ml-hover-panel');
      if (trigger === this.#trigger && panel === this.#panel) return;
      this.#unbind();
      if (!trigger || !panel) return;
      this.#trigger = trigger;
      this.#panel = panel;
      this.#surface = panel.querySelector(':scope > .ml-hover-surface');
      if (!this.#surface) {
        this.#surface = this.ownerDocument.createElement('div');
        this.#surface.className = 'ml-hover-surface';
        this.#surface.append(...panel.childNodes);
        panel.append(this.#surface);
      }
      for (const layer of this.#surface.querySelectorAll(':scope > .ml-optical')) layer.remove();
      this.#surface.classList.remove('ml-refractive');
      this.#surface.style.removeProperty('--ml-bend');
      if (!trigger.hasAttribute('type')) trigger.type = 'button';
      trigger.setAttribute('aria-controls', ensureId(panel, 'panel'));
      trigger.setAttribute('aria-expanded', 'false');
      if (!panel.hasAttribute('aria-label') && (!panel.hasAttribute('aria-labelledby') || panel.getAttribute('aria-labelledby').startsWith('ml-hover-trigger-'))) {
        panel.setAttribute('aria-labelledby', ensureId(trigger, 'trigger'));
      }
      if (typeof panel.showPopover === 'function') panel.popover = 'manual';
      else panel.removeAttribute('popover');
      this.setAttribute('data-ml-hover-ready', '');
      this.#events = new AbortController();
      const options = { signal: this.#events.signal };
      this.addEventListener('pointerenter', this.#enter, options);
      this.addEventListener('pointerleave', this.#leave, options);
      this.addEventListener('focusin', this.#focusIn, options);
      this.addEventListener('focusout', this.#focusOut, options);
      trigger.addEventListener('pointerdown', () => { this.#pressedOpen = this.open; }, options);
      trigger.addEventListener('click', event => {
        if (event.defaultPrevented) return;
        const wasOpen = event.detail > 0 ? this.#pressedOpen ?? this.open : this.open;
        this.#pressedOpen = undefined;
        if (wasOpen) this.hide(); else this.show();
      }, options);
      panel.addEventListener('beforetoggle', event => {
        if (event.newState === 'closed') this.#release();
      }, options);
    }

    #unbind() {
      this.hide();
      this.#events?.abort();
      this.#trigger?.removeAttribute('aria-controls');
      this.#trigger?.removeAttribute('aria-expanded');
      this.#panel?.removeAttribute('popover');
      this.removeAttribute('data-ml-hover-ready');
      this.removeAttribute('data-ml-hover-open');
      this.#trigger = this.#panel = this.#surface = null;
      this.#over = false;
      this.#pressedOpen = undefined;
    }

    #enter = event => {
      if (event.pointerType === 'touch') return;
      this.#over = true;
      clearTimeout(this.#timer);
      if (!this.open) this.#timer = setTimeout(() => {
        const other = activeCards.get(this.ownerDocument);
        if (!other || !other.#panel.matches(':focus-within')) this.show();
      }, 160);
    };

    #leave = event => {
      if (event.pointerType === 'touch') return;
      this.#over = false;
      this.#scheduleClose();
    };

    #focusIn = () => {
      clearTimeout(this.#timer);
      if (!this.#returning) this.show();
    };

    #focusOut = event => {
      if (!this.contains(event.relatedTarget)) this.#scheduleClose();
    };

    #scheduleClose() {
      clearTimeout(this.#timer);
      if (this.open) this.#timer = setTimeout(() => {
        if (!this.#over && !this.matches(':focus-within')) this.hide();
      }, 160);
    }

    show() {
      clearTimeout(this.#timer);
      if (!this.isConnected) return;
      this.#bind();
      if (this.open || !this.#trigger?.getClientRects().length ||
          this.#trigger.matches(':disabled') || this.closest('[inert]')) return;
      const doc = this.ownerDocument, win = doc.defaultView;
      activeCards.get(doc)?.hide();
      activeCards.set(doc, this);
      this.#openEvents = new AbortController();
      this.setAttribute('data-ml-hover-open', '');
      this.#trigger.setAttribute('aria-expanded', 'true');
      if (this.#panel.hasAttribute('popover')) this.#panel.showPopover({ source: this.#trigger });
      this.#position();
      if (!this.open) return;
      this.#surface.scrollTop = 0;
      const options = { signal: this.#openEvents.signal };
      doc.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
        const modal = event.target.closest?.('dialog:modal');
        if (modal && !modal.contains(this)) { this.hide(); return; }
        event.preventDefault();
        this.hide(this.#panel.matches(':focus-within'));
      }, options);
      doc.addEventListener('pointerdown', event => {
        if (!event.composedPath().includes(this)) this.hide();
      }, { ...options, capture: true });
      const scrollOptions = { ...options, capture: true, passive: true };
      doc.addEventListener('scroll', this.#queuePosition, scrollOptions);
      win.addEventListener('resize', this.#queuePosition, options);
      win.visualViewport?.addEventListener('scroll', this.#queuePosition, options);
      win.visualViewport?.addEventListener('resize', this.#queuePosition, options);
      this.#size.observe(this.#trigger);
      this.#size.observe(this.#surface);
      if (this.#panel.hasAttribute('popover')) this.#visibility.observe(this.#trigger);
      this.#scene = GlassScene.forDocument(doc);
      this.#scene.painters.add(this.#paint);
      this.#scene.wake();
      this.dispatchEvent(new CustomEvent('ml-toggle', { bubbles: true, detail: { open: true } }));
    }

    hide(restoreFocus = false) {
      clearTimeout(this.#timer);
      if (!this.open) return;
      this.#returning = true;
      if (this.#panel.hasAttribute('popover') && this.#panel.matches(':popover-open')) this.#panel.hidePopover();
      this.#release();
      if (restoreFocus && this.#trigger?.isConnected) this.#trigger.focus({ preventScroll: true });
      this.#returning = false;
    }

    #release() {
      if (!this.open) return;
      this.#openEvents.abort();
      this.#openEvents = null;
      if (activeCards.get(this.ownerDocument) === this) activeCards.delete(this.ownerDocument);
      this.removeAttribute('data-ml-hover-open');
      this.#trigger.setAttribute('aria-expanded', 'false');
      this.#size.disconnect();
      this.#visibility.disconnect();
      this.ownerDocument.defaultView.cancelAnimationFrame(this.#frame);
      this.#frame = 0;
      this.#scene?.remove(this.#paint);
      this.#scene = null;
      this.#glass?.remove();
      this.#glass = null;
      this.dispatchEvent(new CustomEvent('ml-toggle', { bubbles: true, detail: { open: false } }));
    }

    #queuePosition = () => {
      if (this.open && !this.#frame) this.#frame = this.ownerDocument.defaultView.requestAnimationFrame(() => {
        this.#frame = 0;
        if (this.open) { this.#position(); this.#scene?.wake(); }
      });
    };

    #position() {
      const panel = this.#panel;
      if (!panel.hasAttribute('popover')) return;
      const anchor = this.#trigger.getBoundingClientRect();
      const doc = this.ownerDocument, viewport = doc.defaultView.visualViewport;
      const x = viewport?.offsetLeft ?? 0, y = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? doc.documentElement.clientWidth;
      const height = viewport?.height ?? doc.documentElement.clientHeight;
      if (!anchor.width || !anchor.height || this.#trigger.matches(':disabled') ||
          anchor.bottom <= y || anchor.top >= y + height || anchor.right <= x || anchor.left >= x + width) {
        this.hide(); return;
      }
      const margin = 8;
      panel.style.setProperty('--ml-hover-space-x', Math.max(1, width - 2 * margin) + 'px');
      // Measure the full reading height without expanding the scroll area and
      // losing its current scroll position when the user is reading a long card.
      const naturalHeight = this.#surface.scrollHeight + panel.offsetHeight - this.#surface.clientHeight;
      const desiredHeight = Math.min(naturalHeight, parseFloat(getComputedStyle(panel).maxHeight) || Infinity);
      const above = anchor.top - y - margin, below = y + height - margin - anchor.bottom;
      const preferAbove = this.getAttribute('placement') === 'above';
      const up = preferAbove ? above >= desiredHeight || above > below : below < desiredHeight && above > below;
      panel.dataset.side = up ? 'above' : 'below';
      panel.style.setProperty('--ml-hover-space-y', Math.max(1, up ? above : below) + 'px');
      const center = anchor.left + anchor.width / 2;
      const left = Math.max(x + margin, Math.min(center - panel.offsetWidth / 2, x + width - margin - panel.offsetWidth));
      panel.style.left = left + 'px';
      panel.style.top = Math.max(y + margin, up ? anchor.top - panel.offsetHeight : anchor.bottom) + 'px';
      panel.style.setProperty('--ml-hover-tip-x', Math.max(16, Math.min(panel.offsetWidth - 16, center - left)) + 'px');
    }

    #paint = (pointer, now) => {
      if (this.#trigger.matches(':disabled')) { this.hide(); return; }
      const style = getComputedStyle(this.#surface);
      const light = GlassSurface.lighting(style, this.#scene.media.matches);
      const follows = light.mode === 'pointer';
      const tier = GlassSurface.lightingTier(style, light);
      if (!tier) {
        this.#glass?.remove(); this.#glass = null; return;
      }
      this.#glass = GlassSurface.forTier(this.#glass, this.#surface, false, tier, light);
      this.#glass.paint(pointer, null, now);
      if (follows && this.#panel.getAnimations().some(animation => animation.playState === 'running')) this.#scene.wake();
      return follows;
    };
  }
  customElements.define('ml-hover-card', MaterialHoverCard);
})();

(() => {
  'use strict';
  if (customElements.get('ml-tooltip')) return;

  const { GlassScene, GlassSurface } = globalThis[Symbol.for('material-lib.glass.v1')];
  const active = new WeakMap();
  const pending = new WeakMap();
  const controls = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [tabindex], [contenteditable="true"]';
  const sides = { top: ['bottom', 'right', 'left'], bottom: ['top', 'right', 'left'],
    left: ['right', 'top', 'bottom'], right: ['left', 'top', 'bottom'] };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  let sequence = 0;

  function viewportOf(doc) {
    const view = doc.defaultView.visualViewport;
    return { x: view?.offsetLeft ?? 0, y: view?.offsetTop ?? 0,
      width: view?.width ?? doc.documentElement.clientWidth, height: view?.height ?? doc.documentElement.clientHeight };
  }
  function inView(rect, { x, y, width, height }) {
    return rect.width > 0 && rect.height > 0 && rect.right > x && rect.left < x + width && rect.bottom > y && rect.top < y + height;
  }

  function describe(trigger, id, enabled) {
    if (!trigger) return;
    const ids = (trigger.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    if (ids.includes(id) === enabled) return;
    const next = enabled ? [...ids, id] : ids.filter(token => token !== id);
    if (next.length) trigger.setAttribute('aria-describedby', next.join(' '));
    else trigger.removeAttribute('aria-describedby');
  }

  class MaterialTooltip extends HTMLElement {
    static observedAttributes = ['text', 'placement', 'disabled'];
    #panel;
    #surface;
    #message;
    #trigger;
    #events;
    #session;
    #reasons = new Set();
    #dismissed = false;
    #timer;
    #frame = 0;
    #scene;
    #glass;
    #changes = new MutationObserver(records => {
      if (records.some(({ target }) => !this.#panel.contains(target))) this.#bind();
    });
    #sizes = new ResizeObserver(() => this.#queuePosition());
    #visibility = new IntersectionObserver(entries => {
      const entry = entries.at(-1);
      if (entry.target === this.#trigger && !entry.isIntersecting) this.hide();
    });

    get open() { return Boolean(this.#session); }

    connectedCallback() {
      globalThis[Symbol.for('material-lib.motion-frames.v1')].watch(this.getRootNode());
      const doc = this.ownerDocument;
      // cloneNode can copy a live specimen, including its generated description.
      for (const copy of this.querySelectorAll(':scope > .ml-tooltip-panel')) {
        describe(this.querySelector(controls), copy.id, false);
        copy.remove();
      }
      this.removeAttribute('data-ml-tooltip-open');
      this.#panel = doc.createElement('span');
      this.#panel.className = 'ml-tooltip-panel';
      do { this.#panel.id = 'ml-tooltip-' + ++sequence; } while (this.getRootNode().getElementById(this.#panel.id));
      this.#panel.setAttribute('role', 'tooltip');
      if (typeof this.#panel.showPopover === 'function') this.#panel.popover = 'manual';
      this.#surface = doc.createElement('span');
      this.#surface.className = 'ml-tooltip-surface';
      this.#message = doc.createTextNode('');
      this.#surface.append(this.#message);
      this.#panel.append(this.#surface);
      this.append(this.#panel);
      this.#bind();
      this.#changes.observe(this, { childList: true, subtree: true, attributes: true,
        attributeFilter: ['aria-describedby', 'disabled', 'hidden', 'inert', 'href', 'tabindex', 'type'] });
    }

    disconnectedCallback() {
      this.#changes.disconnect();
      this.#unbind();
      this.#panel.remove();
      this.#panel = null;
    }

    attributeChangedCallback(name, before, after) {
      if (!this.#panel || before === after) return;
      if (name !== 'placement') this.#bind();
      this.#queuePosition();
    }

    #unbind() {
      this.hide();
      this.#events?.abort();
      describe(this.#trigger, this.#panel.id, false);
      this.#trigger = null;
      this.#reasons.clear();
      this.#dismissed = false;
    }

    #bind() {
      if (this.#panel.parentNode !== this) this.append(this.#panel);
      const trigger = this.querySelector(controls);
      if (trigger !== this.#trigger) {
        this.#unbind();
        this.#trigger = trigger;
        if (trigger) this.#listen(trigger);
      }
      const text = (this.getAttribute('text') || '').trim();
      if (this.#message.data !== text) {
        this.#message.data = text;
        // The referenced text also needs to be available while a closed popover fades out.
        this.#panel.setAttribute('aria-label', text);
      }
      const enabled = Boolean(text) && !this.hasAttribute('disabled');
      describe(trigger, this.#panel.id, enabled);
      if (!enabled || trigger?.matches(':disabled') || trigger?.closest('[hidden], [inert]')) this.hide();
    }

    #listen(trigger) {
      this.#events = new AbortController();
      const options = { signal: this.#events.signal };
      for (const [element, reason] of [[trigger, 'trigger'], [this.#panel, 'panel']]) {
        element.addEventListener('pointerenter', event => {
          if (event.pointerType !== 'touch') this.#enter(reason, reason === 'trigger' ? 350 : 0);
        }, options);
        element.addEventListener('pointerleave', event => {
          if (event.pointerType !== 'touch') this.#leave(reason);
        }, options);
      }
      trigger.addEventListener('focus', () => {
        if (trigger.matches(':focus-visible')) this.#enter('focus', 0);
      }, options);
      trigger.addEventListener('blur', () => {
        this.#reasons.delete('tap');
        this.#leave('focus');
      }, options);
      trigger.addEventListener('click', () => {
        if (this.hasAttribute('toggle-on-click') && !this.open) {
          this.#reasons.add('tap');
          this.show();
        } else this.hide();
      }, options);
      this.#panel.addEventListener('beforetoggle', event => {
        if (event.newState === 'closed') this.#release();
      }, options);
    }

    #cancelTimer() {
      clearTimeout(this.#timer);
      if (pending.get(this.ownerDocument) === this) pending.delete(this.ownerDocument);
    }

    #enter(reason, delay) {
      this.#reasons.add(reason);
      this.#cancelTimer();
      if (this.#dismissed) return;
      if (!delay) this.show();
      else if (!this.open) {
        pending.get(this.ownerDocument)?.#cancelTimer();
        pending.set(this.ownerDocument, this);
        this.#timer = setTimeout(() => this.show(), delay);
      }
    }

    #leave(reason) {
      this.#reasons.delete(reason);
      if (this.#reasons.size) return;
      this.#dismissed = false;
      this.#cancelTimer();
      if (this.open) this.#timer = setTimeout(() => this.hide(), 120);
    }

    show() {
      this.#cancelTimer();
      const trigger = this.#trigger;
      if (!this.isConnected || !trigger || !this.#message.data ||
          this.hasAttribute('disabled') || trigger.matches(':disabled') || trigger.closest('[inert], [hidden]')) return;
      const doc = this.ownerDocument, win = doc.defaultView;
      const modal = doc.activeElement?.closest('dialog:modal');
      const anchor = trigger.getBoundingClientRect(), view = viewportOf(doc);
      if ((modal && !modal.contains(this)) || !inView(anchor, view)) return;
      // A pending hover on another control must not replace a newer focus or tap.
      pending.get(doc)?.#cancelTimer();
      if (this.open) return;
      active.get(doc)?.hide();
      active.set(doc, this);
      this.#dismissed = false;
      this.#session = new AbortController();
      const options = { signal: this.#session.signal };
      this.setAttribute('data-ml-tooltip-open', '');
      if (this.#panel.hasAttribute('popover')) this.#panel.showPopover();
      this.#position(anchor, view);
      if (!this.open) return;
      doc.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented) return;
        const modal = event.target.closest?.('dialog:modal');
        if (!modal || modal.contains(this)) {
          event.preventDefault();
          event.stopPropagation();
        }
        this.hide();
      }, { ...options, capture: true });
      doc.addEventListener('pointerdown', event => {
        if (!event.composedPath().includes(this)) this.hide();
      }, { ...options, capture: true });
      doc.addEventListener('focusin', event => {
        const dialog = event.target.closest?.('dialog:modal');
        if ((dialog && !dialog.contains(this)) || (this.#reasons.has('tap') && !event.composedPath().includes(this))) this.hide();
      }, options);
      doc.addEventListener('scroll', this.#queuePosition, { ...options, capture: true, passive: true });
      win.addEventListener('resize', this.#queuePosition, options);
      win.visualViewport?.addEventListener('resize', this.#queuePosition, options);
      win.visualViewport?.addEventListener('scroll', this.#queuePosition, options);
      this.#visibility.observe(trigger);
      this.#sizes.observe(trigger);
      this.#sizes.observe(this.#surface);
      this.#scene = GlassScene.forDocument(doc);
      this.#scene.painters.add(this.#paint);
      this.#scene.wake();
      this.dispatchEvent(new CustomEvent('ml-toggle', { bubbles: true, detail: { open: true } }));
    }

    hide() {
      this.#cancelTimer();
      this.#reasons.delete('tap');
      this.#reasons.delete('panel');
      this.#dismissed = this.#reasons.size > 0;
      if (!this.open) return;
      if (this.#panel.hasAttribute('popover') && this.#panel.matches(':popover-open')) this.#panel.hidePopover();
      this.#release();
    }

    #release() {
      if (!this.open) return;
      this.#session.abort();
      this.#session = null;
      this.removeAttribute('data-ml-tooltip-open');
      if (active.get(this.ownerDocument) === this) active.delete(this.ownerDocument);
      this.#sizes.disconnect();
      this.#visibility.disconnect();
      this.ownerDocument.defaultView.cancelAnimationFrame(this.#frame);
      this.#frame = 0;
      this.#scene?.remove(this.#paint);
      this.#scene = null;
      this.#glass?.remove();
      this.#glass = null;
      this.dispatchEvent(new CustomEvent('ml-toggle', { bubbles: true, detail: { open: false } }));
    }

    #queuePosition = () => {
      if (this.open && !this.#frame) this.#frame = this.ownerDocument.defaultView.requestAnimationFrame(() => {
        this.#frame = 0;
        this.#position();
        this.#scene?.wake();
      });
    };

    #position(a = this.#trigger.getBoundingClientRect(), view = viewportOf(this.ownerDocument)) {
      const { x, y, width, height } = view, panel = this.#panel;
      if (!inView(a, view)) {
        this.hide();
        return;
      }
      const margin = 8, gap = 8;
      panel.style.setProperty('--ml-tooltip-view-width', Math.max(1, width - 2 * margin) + 'px');
      const w = panel.offsetWidth;
      const h = this.#surface.scrollHeight + this.#surface.offsetHeight - this.#surface.clientHeight;
      const room = { top: a.top - y - margin - gap, bottom: y + height - a.bottom - margin - gap,
        left: a.left - x - margin - gap, right: x + width - a.right - margin - gap };
      const preferred = this.getAttribute('placement');
      const first = Object.hasOwn(sides, preferred) ? preferred : 'top';
      const vertical = side => side === 'top' || side === 'bottom';
      const side = [first, ...sides[first]].find(s => room[s] >= (vertical(s) ? h : w))
        ?? (room.top >= room.bottom ? 'top' : 'bottom');
      panel.dataset.side = side;
      panel.style.setProperty('--ml-tooltip-view-height', Math.max(1, vertical(side) ? room[side] : height - 2 * margin) + 'px');
      const actualHeight = panel.offsetHeight, cx = a.left + a.width / 2, cy = a.top + a.height / 2;
      const left = clamp(side === 'left' ? a.left - gap - w : side === 'right' ? a.right + gap : cx - w / 2, x + margin, x + width - margin - w);
      const top = clamp(side === 'top' ? a.top - gap - actualHeight : side === 'bottom' ? a.bottom + gap : cy - actualHeight / 2, y + margin, y + height - margin - actualHeight);
      panel.style.left = left + 'px';
      panel.style.top = top + 'px';
      const tip = vertical(side) ? clamp(cx - left, 9, w - 9) : clamp(cy - top, 9, actualHeight - 9);
      panel.style.setProperty('--ml-tooltip-tip', tip + 'px');
    }

    #paint = (pointer, now) => {
      const style = getComputedStyle(this.#surface);
      const light = GlassSurface.lighting(style, this.#scene.media.matches);
      const follows = light.mode === 'pointer';
      const tier = GlassSurface.lightingTier(style, light);
      if (!tier) {
        this.#glass?.remove();
        this.#glass = null;
        return;
      }
      this.#glass = GlassSurface.forTier(this.#glass, this.#surface, true, tier, light);
      this.#glass.paint(pointer, null, now);
      if (follows && this.#panel.getAnimations().some(animation => animation.playState === 'running')) this.#scene.wake();
      return follows;
    };
  }
  customElements.define('ml-tooltip', MaterialTooltip);
})();

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

(() => {
  'use strict';

  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  for (const name of ['ml-info-pill', 'ml-info-card', 'ml-card']) {
    if (customElements.get(name)) continue;
    // The host provides the surface. Focus and activation belong to its native content.
    customElements.define(name, class extends GlassControl {
      get glassContent() { return this; }
    });
  }
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

(() => {
  'use strict';

  if (customElements.get('ml-toast')) return;
  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  const defaultDuration = 4000;

  function toggleNotice(host, open, reason) {
    host.dispatchEvent(new CustomEvent('ml-toggle', { bubbles: true, detail: { open, reason } }));
  }

  function closeButton(doc, label) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'ml-feedback-close';
    button.setAttribute('aria-label', label);
    return button;
  }

  function restoreFocus(target) {
    if (target?.isConnected && typeof target.focus === 'function' &&
        !target.closest('[inert], :disabled') && target.getClientRects().length) {
      target.focus({ preventScroll: true });
    }
  }

  class ToastSurface extends GlassControl {
    get glassContent() { return this; }
  }
  customElements.define('ml-toast-surface', ToastSurface);

  class MaterialToast extends HTMLElement {
    static observedAttributes = ['inline', 'hidden'];
    #queue = [];
    #current = null;
    #layer;
    #surface;
    #text;
    #live;
    #doc;
    #timer = null;
    #announceTimer;
    #remaining = 0;
    #started = 0;
    #hovered = false;

    get open() { return this.#current !== null; }

    connectedCallback() {
      this.#doc = this.ownerDocument;
      if (!this.#layer) this.#mount();
      this.#place();
      this.#doc.addEventListener('visibilitychange', this.#visibility);
    }

    disconnectedCallback() {
      this.#doc.removeEventListener('visibilitychange', this.#visibility);
      this.#queue.length = 0;
      this.#hide(false);
    }

    attributeChangedCallback(name) {
      if (!this.isConnected || !this.#layer) return;
      if (name === 'inline') this.#place();
      if (this.hidden) this.clear();
    }

    #mount() {
      const doc = this.#doc;
      // Keep the live region mounted before its first announcement, independently of the popover.
      this.#live = doc.createElement('span');
      this.#live.className = 'ml-feedback-sr';
      this.#live.setAttribute('role', 'status');
      this.#live.setAttribute('aria-atomic', 'true');
      this.#layer = doc.createElement('div');
      this.#layer.className = 'ml-toast-layer';
      this.#layer.inert = true;
      this.#surface = doc.createElement('ml-toast-surface');
      this.#text = doc.createElement('span');
      this.#text.className = 'ml-toast-text';
      this.#text.setAttribute('aria-hidden', 'true');
      const close = closeButton(doc, '关闭轻提示');
      close.addEventListener('click', () => this.dismiss());
      this.#surface.append(this.#text, close);
      this.#layer.append(this.#surface);
      this.replaceChildren(this.#live, this.#layer);
      this.#surface.addEventListener('pointerenter', event => {
        if (event.pointerType !== 'touch') { this.#hovered = true; this.#pause(); }
      });
      this.#surface.addEventListener('pointerleave', () => { this.#hovered = false; this.#resume(); });
      this.#surface.addEventListener('focusin', () => this.#pause());
      this.#surface.addEventListener('focusout', () => queueMicrotask(() => this.#resume()));
      this.#surface.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
        event.preventDefault();
        this.dismiss('escape');
      });
    }

    #place() {
      if (typeof this.#layer.showPopover !== 'function') return;
      const mode = this.hasAttribute('inline') ? null : 'manual';
      if (this.#layer.popover !== mode) {
        if (this.#layer.matches(':popover-open')) this.#layer.hidePopover();
        this.#layer.popover = mode;
      }
      if (mode && this.open && !this.#layer.matches(':popover-open')) this.#layer.showPopover();
    }

    show(message, options = {}) {
      const text = String(message ?? '').trim();
      if (!this.isConnected || this.hidden || !text) return false;
      const ms = Number(options.duration ?? this.getAttribute('duration') ?? defaultDuration);
      this.#queue.push({ text, tone: options.tone ?? this.getAttribute('tone') ?? 'info',
        duration: Number.isFinite(ms) && ms >= 0 ? ms : defaultDuration,
        trigger: options.trigger ?? this.#doc.activeElement });
      this.#next();
      return true;
    }

    #next() {
      if (this.open || !this.#queue.length) return;
      const item = this.#current = this.#queue.shift();
      this.#remaining = item.duration;
      this.#text.textContent = item.text;
      this.#surface.setAttribute('tone', item.tone);
      this.#layer.inert = false;
      this.#layer.setAttribute('data-open', '');
      this.#place();
      this.#hovered = this.#doc.defaultView.matchMedia('(hover: hover)').matches && this.#surface.matches(':hover');
      this.#announceTimer = setTimeout(() => { this.#live.textContent = item.text; }, 0);
      this.#resume();
      toggleNotice(this, true, 'show');
    }

    #pause() {
      if (this.#timer === null) return;
      clearTimeout(this.#timer);
      this.#timer = null;
      this.#remaining = Math.max(0, this.#remaining - (performance.now() - this.#started));
    }

    #resume() {
      if (!this.open || !this.#current.duration || this.#timer !== null || this.#hovered ||
          this.#doc.hidden || this.#layer.contains(this.#doc.activeElement)) return;
      this.#started = performance.now();
      this.#timer = setTimeout(() => this.dismiss('timeout'), this.#remaining);
    }

    #visibility = () => { if (this.#doc.hidden) this.#pause(); else this.#resume(); };

    #hide(restore) {
      if (!this.open) return;
      const item = this.#current;
      const focused = this.#layer.contains(this.#doc.activeElement);
      this.#current = null;
      this.#pause();
      clearTimeout(this.#announceTimer);
      this.#live.textContent = '';
      this.#layer.inert = true;
      this.#layer.removeAttribute('data-open');
      if (this.#layer.hasAttribute('popover') && this.#layer.matches(':popover-open')) this.#layer.hidePopover();
      if (restore && focused) restoreFocus(item.trigger);
    }

    dismiss(reason = 'dismiss') {
      if (!this.open) return;
      this.#hide(true);
      toggleNotice(this, false, reason);
      this.#next();
    }

    clear() { this.#queue.length = 0; this.dismiss('clear'); }
  }
  customElements.define('ml-toast', MaterialToast);

  class MaterialBanner extends GlassControl {
    static observedAttributes = ['dismissible'];
    #close;
    #returnTo;
    #children = new MutationObserver(() => this.#sync());
    get glassContent() { return this; }

    connectedCallback() {
      for (const copy of this.querySelectorAll(':scope > .ml-feedback-close')) if (copy !== this.#close) copy.remove();
      super.connectedCallback();
      this.#children.observe(this, { childList: true });
      this.addEventListener('focusin', this.#rememberFocus);
      this.#sync();
    }

    disconnectedCallback() {
      this.#children.disconnect();
      this.removeEventListener('focusin', this.#rememberFocus);
      super.disconnectedCallback();
    }

    attributeChangedCallback() { if (this.isConnected) this.#sync(); }

    #sync() {
      const content = this.querySelector(':scope > .ml-banner-content');
      if (content && !content.hasAttribute('role') && !content.hasAttribute('aria-live') &&
          !this.hasAttribute('role') && !this.hasAttribute('aria-live')) content.setAttribute('role', 'status');
      if (!this.hasAttribute('dismissible')) { this.#close?.remove(); return; }
      if (!this.#close) {
        this.#close = closeButton(this.ownerDocument, '关闭消息横幅');
        this.#close.addEventListener('click', () => this.dismiss());
      }
      if (this.#close.parentElement !== this) this.append(this.#close);
    }

    #rememberFocus = event => {
      if (event.relatedTarget && !this.contains(event.relatedTarget)) this.#returnTo = event.relatedTarget;
    };

    show(trigger) {
      if (trigger) this.#returnTo = trigger;
      if (!this.hidden) return;
      this.hidden = false;
      toggleNotice(this, true, 'show');
    }

    dismiss() {
      if (this.hidden) return;
      const focused = this.contains(this.ownerDocument.activeElement);
      this.hidden = true;
      toggleNotice(this, false, 'dismiss');
      if (focused) restoreFocus(this.#returnTo);
    }
  }
  customElements.define('ml-banner', MaterialBanner);
})();

(() => {
  'use strict';

  if (customElements.get('ml-island')) return;
  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  const directions = ['left', 'right', 'up', 'down'];
  let nextPanelId = 0;

  class IslandSurface extends GlassControl {
    get glassContent() { return this; }
  }
  customElements.define('ml-island-surface', IslandSurface);

  function setPixels(style, property, value) {
    const px = Math.round(value * 100) / 100 + 'px';
    if (style.getPropertyValue(property) !== px) style.setProperty(property, px);
  }

  function clamp(value, min, max) { return Math.max(min, Math.min(value, max)); }

  // Respect scrolling/clipping ancestors as well as an explicitly bounded preview or toolbar.
  function boundaries(host) {
    const result = [];
    for (let node = host.parentElement; node && node !== host.ownerDocument.documentElement; node = node.parentElement) {
      const css = getComputedStyle(node);
      const bound = node.hasAttribute('data-ml-island-bounds');
      const x = bound || css.overflowX !== 'visible';
      const y = bound || css.overflowY !== 'visible';
      if (x || y) result.push({ node, x, y });
    }
    return result;
  }

  function availableRect(doc, bounds) {
    const viewport = doc.defaultView.visualViewport;
    const left = viewport?.offsetLeft ?? 0;
    const top = viewport?.offsetTop ?? 0;
    const area = { left, top, right: left + (viewport?.width ?? doc.documentElement.clientWidth),
      bottom: top + (viewport?.height ?? doc.documentElement.clientHeight) };
    for (const { node, x, y } of bounds) {
      const rect = node.getBoundingClientRect();
      const sx = node.offsetWidth ? rect.width / node.offsetWidth : 1;
      const sy = node.offsetHeight ? rect.height / node.offsetHeight : 1;
      const innerLeft = rect.left + node.clientLeft * sx, innerTop = rect.top + node.clientTop * sy;
      if (x) {
        area.left = Math.max(area.left, innerLeft);
        area.right = Math.min(area.right, innerLeft + node.clientWidth * sx);
      }
      if (y) {
        area.top = Math.max(area.top, innerTop);
        area.bottom = Math.min(area.bottom, innerTop + node.clientHeight * sy);
      }
    }
    return area;
  }

  class MaterialIsland extends HTMLElement {
    static observedAttributes = ['direction', 'open'];
    #trigger;
    #panel;
    #surface;
    #bounds = [];
    #watch;
    #frame = 0;
    #clipFrame = 0;
    #size = new ResizeObserver(() => {
      if (this.open) this.#clipPanel();
      this.#schedule();
    });
    #children = new MutationObserver(() => this.#bind());

    get direction() {
      const value = this.getAttribute('direction');
      return directions.includes(value) ? value : 'down';
    }
    set direction(value) { this.setAttribute('direction', value); }
    get open() { return this.hasAttribute('open'); }
    set open(value) { this.toggleAttribute('open', Boolean(value)); }
    show() { this.open = true; }
    hide() { this.open = false; }

    connectedCallback() {
      this.addEventListener('click', this.#click);
      this.addEventListener('keydown', this.#key);
      this.#children.observe(this, { childList: true });
      this.#bind();
    }

    disconnectedCallback() {
      this.removeEventListener('click', this.#click);
      this.removeEventListener('keydown', this.#key);
      this.#children.disconnect();
      this.#size.disconnect();
      this.#stopWatching();
      this.#trigger = this.#panel = null;
    }

    #bind() {
      const trigger = this.querySelector(':scope > button');
      const panel = this.querySelector(':scope > .ml-island-panel');
      let surface = this.querySelector(':scope > ml-island-surface');
      if (!surface) {
        surface = this.ownerDocument.createElement('ml-island-surface');
        surface.setAttribute('aria-hidden', 'true');
        this.prepend(surface);
      }
      if (trigger === this.#trigger && panel === this.#panel && surface === this.#surface) return;
      this.#size.disconnect();
      this.#stopWatching();
      this.#trigger = trigger;
      this.#panel = panel;
      this.#surface = surface;
      if (!trigger || !panel) {
        trigger?.removeAttribute('aria-controls');
        trigger?.removeAttribute('aria-expanded');
        if (panel) panel.hidden = true;
        return;
      }
      if (!trigger.hasAttribute('type')) trigger.type = 'button';
      const tree = this.getRootNode();
      if (!panel.id || tree.querySelectorAll('#' + CSS.escape(panel.id)).length > 1) {
        let id;
        do { id = 'ml-island-panel-' + ++nextPanelId; } while (tree.getElementById(id));
        panel.id = id;
      }
      trigger.setAttribute('aria-controls', panel.id);
      this.#size.observe(trigger);
      this.#size.observe(panel);
      this.#sync();
    }

    attributeChangedCallback(name, before, after) {
      if (before === after || !this.isConnected || !this.#trigger || !this.#panel) return;
      if (name === 'direction') {
        if (this.open) {
          // Start the new direction at the original button, even halfway through an old morph.
          this.#surface.setAttribute('data-ml-compact', '');
          this.#layout();
          void this.#surface.offsetWidth;
          this.#surface.removeAttribute('data-ml-compact');
          this.#clipPanel();
        }
        return;
      }
      this.#sync();
      if ((before === null) !== (after === null)) this.dispatchEvent(new CustomEvent('ml-toggle', {
        bubbles: true, detail: { open: this.open, direction: this.direction }
      }));
    }

    #click = event => {
      if (this.#panel && !event.defaultPrevented && this.#trigger?.contains(event.target) && !this.#trigger.disabled) this.open = !this.open;
    };
    #key = event => {
      if (this.open && event.key === 'Escape' && !event.defaultPrevented && !event.isComposing &&
          event.target.closest('ml-island') === this) {
        event.preventDefault();
        this.hide();
      }
    };

    #sync() {
      const tree = this.getRootNode();
      if (!this.open && this.#panel.contains(tree.activeElement)) this.#trigger.focus({ preventScroll: true });
      this.#trigger.setAttribute('aria-expanded', String(this.open));
      this.#panel.hidden = !this.open;
      if (!this.open) { this.#stopWatching(); return; }
      if (!this.#watch) {
        this.#bounds = boundaries(this);
        for (const { node } of this.#bounds) this.#size.observe(node);
        this.#watch = new AbortController();
        const win = this.ownerDocument.defaultView;
        const options = { signal: this.#watch.signal, passive: true, capture: true };
        win.addEventListener('resize', this.#schedule, options);
        win.addEventListener('scroll', this.#schedule, options);
        win.visualViewport?.addEventListener('resize', this.#schedule, options);
        win.visualViewport?.addEventListener('scroll', this.#schedule, options);
      }
      this.#layout();
    }

    #stopWatching() {
      this.#watch?.abort();
      this.#watch = null;
      for (const { node } of this.#bounds) this.#size.unobserve(node);
      this.#bounds = [];
      if (this.#frame) cancelAnimationFrame(this.#frame);
      this.#frame = 0;
      if (this.#clipFrame) cancelAnimationFrame(this.#clipFrame);
      this.#clipFrame = 0;
      this.#panel?.style.removeProperty('--ml-island-clip');
    }
    #schedule = () => {
      if (this.open && this.isConnected && !this.#frame) this.#frame = requestAnimationFrame(() => {
        this.#frame = 0;
        this.#layout();
      });
    };

    // During a morph the text already has its final layout. Reveal only what fits inside the moving skin.
    #clipPanel = () => {
      if (this.#clipFrame) cancelAnimationFrame(this.#clipFrame);
      this.#clipFrame = 0;
      const panel = this.#panel;
      if (!panel || !this.open) return;
      const moving = this.#surface.getAnimations().some(a =>
        ['left', 'top', 'width', 'height'].includes(a.transitionProperty) && a.playState === 'running');
      const skin = this.#surface.getBoundingClientRect(), content = panel.getBoundingClientRect();
      if (!content.width || !content.height) return;
      const sx = panel.offsetWidth / content.width, sy = panel.offsetHeight / content.height;
      const edges = [(skin.top - content.top) * sy, (content.right - skin.right) * sx,
        (content.bottom - skin.bottom) * sy, (skin.left - content.left) * sx];
      if (edges.some(value => value > 1)) {
        panel.style.setProperty('--ml-island-clip', 'inset(' + edges.map(v => Math.max(0, v).toFixed(2) + 'px').join(' ') + ')');
      } else panel.style.removeProperty('--ml-island-clip');
      if (moving) this.#clipFrame = requestAnimationFrame(this.#clipPanel);
    };

    #layout() {
      if (!this.open || !this.#trigger || !this.#panel) return;
      const anchor = this.#trigger.getBoundingClientRect();
      if (!anchor.width || !anchor.height) return;
      const area = availableRect(this.ownerDocument, this.#bounds);
      if (area.right <= area.left || area.bottom <= area.top ||
          anchor.right <= area.left || anchor.left >= area.right || anchor.bottom <= area.top || anchor.top >= area.bottom) return;
      const css = getComputedStyle(this.#trigger);
      const w = parseFloat(css.width), h = parseFloat(css.height);
      const sx = w / anchor.width, sy = h / anchor.height;
      const left = (area.left - anchor.left) * sx, right = (area.right - anchor.left) * sx;
      const top = (area.top - anchor.top) * sy, bottom = (area.bottom - anchor.top) * sy;
      const dir = this.direction, horizontal = dir === 'left' || dir === 'right';
      const sideSpace = dir === 'left' ? -left : right - w;
      // Switch to wrapped rows when a side column would only fit a few characters.
      const line = parseFloat(css.fontSize);
      const side = horizontal && sideSpace >= 6 * line;
      const above = -top, below = bottom - h;
      let up = dir === 'up';
      if (!side && (up ? above : below) < 3 * line && (up ? below : above) > (up ? above : below)) up = !up;
      const availableWidth = right - left;
      const stackedWidth = horizontal ? clamp(w + sideSpace, Math.min(availableWidth, 11 * line), availableWidth) : availableWidth;
      const panel = this.#panel;
      panel.dataset.layout = side ? dir : (up ? 'up' : 'down');
      setPixels(panel.style, '--ml-room-w', Math.max(1, side ? sideSpace : stackedWidth));
      setPixels(panel.style, '--ml-room-h', Math.max(1, side ? bottom - top : (up ? above : below)));

      // Measure the real, wrapped content. Only the background morphs; the trigger stays in normal flow.
      const pw = panel.offsetWidth, ph = panel.offsetHeight;
      const width = side ? w + pw : Math.max(w, pw);
      const height = side ? Math.max(h, ph) : h + ph;
      const preferredX = dir === 'left' ? w - width : dir === 'right' ? 0 : (w - width) / 2;
      const x = clamp(preferredX, left, right - width);
      const y = side ? clamp((h - height) / 2, top, bottom - height) : up ? h - height : 0;
      setPixels(panel.style, 'left', side ? (dir === 'left' ? x : w) : x + (width - pw) / 2);
      setPixels(panel.style, 'top', side ? y + (height - ph) / 2 : up ? -ph : h);
      const skin = this.#surface.style;
      setPixels(skin, '--ml-open-x', x);
      setPixels(skin, '--ml-open-y', y);
      setPixels(skin, '--ml-open-w', width);
      setPixels(skin, '--ml-open-h', height);
      this.#clipPanel();
    }
  }
  customElements.define('ml-island', MaterialIsland);
})();

(() => {
  'use strict';

  if (customElements.get('ml-input')) return;
  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  const fieldSelector = ':scope > input:not([type="hidden"]), :scope > textarea';
  let nextId = 0;

  class InputSurface extends GlassControl {
    get glassContent() { return this.parentElement?.querySelector(fieldSelector); }
  }
  customElements.define('ml-input-surface', InputSurface);

  function ensureId(node) {
    const tree = node.getRootNode();
    if (!node.id || tree.querySelectorAll('#' + CSS.escape(node.id)).length > 1) {
      let id;
      do { id = 'ml-input-' + ++nextId; } while (tree.getElementById(id));
      node.id = id;
    }
    return node.id;
  }

  // Keep descriptions supplied by the application when adding or removing a hint or error.
  function describe(field, ids) {
    const managed = (field.dataset.mlInputDescriptions || '').split(' ');
    const keep = (field.getAttribute('aria-describedby') || '').split(/\s+/).filter(id => id && !managed.includes(id));
    const add = ids.filter(id => id && !keep.includes(id));
    const next = keep.concat(add).join(' ');
    if (next && next !== field.getAttribute('aria-describedby')) field.setAttribute('aria-describedby', next);
    else if (!next) field.removeAttribute('aria-describedby');
    if (add.length) field.dataset.mlInputDescriptions = add.join(' ');
    else delete field.dataset.mlInputDescriptions;
  }

  function markInvalid(field, invalid) {
    if (invalid && !field.hasAttribute('data-ml-input-prior-invalid')) {
      field.dataset.mlInputPriorInvalid = field.getAttribute('aria-invalid') ?? '';
      field.setAttribute('aria-invalid', 'true');
    } else if (!invalid && field.hasAttribute('data-ml-input-prior-invalid')) {
      if (field.getAttribute('aria-invalid') === 'true') {
        if (field.dataset.mlInputPriorInvalid) field.setAttribute('aria-invalid', field.dataset.mlInputPriorInvalid);
        else field.removeAttribute('aria-invalid');
      }
      delete field.dataset.mlInputPriorInvalid;
    }
  }

  function maskPassword(field) {
    if (!field?.hasAttribute('data-ml-input-visible')) return;
    if (field.type === 'text') field.type = 'password';
    field.removeAttribute('data-ml-input-visible');
  }

  class MaterialInput extends HTMLElement {
    static observedAttributes = ['clearable', 'count', 'error-message', 'hidden'];
    #field;
    #surface;
    #action;
    #counter;
    #error;
    #hint;
    #events;
    #edited = false;
    #checked = false;
    #composing = false;
    #children = new MutationObserver(() => this.#bind());
    #attributes = new MutationObserver(records => {
      if (records.some(r => r.attributeName === 'id')) this.#bind();
      else this.refresh();
    });

    get control() { return this.querySelector(fieldSelector); }
    get value() { return this.control?.value ?? ''; }
    set value(value) {
      if (this.control) this.control.value = value ?? '';
      this.refresh();
    }

    connectedCallback() {
      this.#events = new AbortController();
      const options = { signal: this.#events.signal };
      this.addEventListener('input', this.#edit, options);
      this.addEventListener('change', this.#edit, options);
      this.addEventListener('compositionstart', this.#composition, options);
      this.addEventListener('compositionend', this.#composition, options);
      this.addEventListener('focusin', this.#focusIn, options);
      this.addEventListener('focusout', this.#focusOut, options);
      this.addEventListener('invalid', this.#invalid, { ...options, capture: true });
      this.addEventListener('mousedown', this.#mouseDown, options);
      this.addEventListener('click', this.#click, options);
      this.addEventListener('keydown', this.#key, options);
      this.getRootNode().addEventListener('reset', this.#reset, { ...options, capture: true });
      this.#children.observe(this, { childList: true });
      this.#bind();
    }

    disconnectedCallback() {
      this.#events.abort();
      this.#children.disconnect();
      this.#attributes.disconnect();
      this.#composing = false;
      maskPassword(this.#field);
    }

    attributeChangedCallback() { if (this.isConnected) this.refresh(); }

    #part(name, tag) {
      let node = this.querySelector(':scope > [data-ml-input-part="' + name + '"]');
      if (!node) {
        node = this.ownerDocument.createElement(tag);
        node.dataset.mlInputPart = name;
        this.append(node);
      }
      return node;
    }

    #bind() {
      this.#attributes.disconnect();
      const field = this.control;
      if (this.#field !== field) {
        if (this.#field) {
          maskPassword(this.#field);
          describe(this.#field, []);
          markInvalid(this.#field, false);
        }
        this.#edited = this.#checked = this.#composing = false;
        this.#field = field;
        maskPassword(field); // A clone always starts masked.
      }
      this.#surface = this.#part('surface', 'ml-input-surface');
      this.#surface.setAttribute('aria-hidden', 'true');
      this.#action = this.#part('action', 'button');
      this.#action.type = 'button';
      this.#counter = this.#part('counter', 'span');
      this.#error = this.#part('error', 'span');
      this.#error.setAttribute('aria-live', 'polite');
      this.#hint = this.querySelector(':scope > .ml-input-hint');
      if (!field) {
        for (const part of [this.#surface, this.#action, this.#counter, this.#error]) part.hidden = true;
        return;
      }
      this.#surface.hidden = false;
      const label = this.querySelector(':scope > label');
      if (!field.id && label?.htmlFor && !this.getRootNode().getElementById(label.htmlFor)) field.id = label.htmlFor;
      ensureId(field);
      if (label) label.htmlFor = field.id;
      if (this.#hint) ensureId(this.#hint);
      ensureId(this.#error);
      this.#action.setAttribute('aria-controls', field.id);
      this.#attributes.observe(field, { attributes: true, childList: true, characterData: true, subtree: true,
        attributeFilter: ['id', 'type', 'value', 'disabled', 'readonly', 'required', 'minlength', 'maxlength', 'pattern', 'min', 'max', 'step', 'aria-describedby', 'data-ml-form-managed'] });
      for (let fs = this.closest('fieldset'); fs; fs = fs.parentElement?.closest('fieldset')) {
        this.#attributes.observe(fs, { attributes: true, attributeFilter: ['disabled'] });
      }
      this.refresh();
    }

    refresh() {
      const field = this.#field;
      if (!field || !this.#action) return;
      const disabled = field.matches(':disabled');
      if (disabled || this.hidden || field.type !== 'text') maskPassword(field);
      const revealed = field.hasAttribute('data-ml-input-visible');
      const password = revealed || field.type === 'password';
      const search = field.type === 'search';
      const clearable = !password && (search || this.hasAttribute('clearable'));
      this.dataset.mlInputKind = password ? 'password' : field.type;
      this.toggleAttribute('data-ml-input-trailing', password || clearable);
      this.#action.hidden = disabled || (!password && (!clearable || field.readOnly || !field.value));
      this.#action.disabled = disabled;
      this.#action.dataset.icon = password ? (revealed ? 'eye-off' : 'eye') : 'close';
      const label = password ? '显示密码' : search ? '清空搜索' : '清空内容';
      this.#action.setAttribute('aria-label', label);
      this.#action.title = revealed ? '隐藏密码' : label;
      if (password) this.#action.setAttribute('aria-pressed', String(revealed));
      else this.#action.removeAttribute('aria-pressed');
      this.#counter.hidden = password || !this.hasAttribute('count');
      if (!this.#counter.hidden) this.#counter.textContent = field.value.length + (field.maxLength >= 0 ? ' / ' + field.maxLength : '');
      if (this.#composing) return;
      const invalid = !field.hasAttribute('data-ml-form-managed') && this.#checked && field.willValidate && !field.validity.valid;
      const message = invalid ? (field.validity.customError ? field.validationMessage : this.getAttribute('error-message') || field.validationMessage) : '';
      markInvalid(field, invalid);
      if (this.#error.textContent !== message) this.#error.textContent = message;
      this.#error.hidden = !message;
      describe(field, [this.#hint?.id, message && this.#error.id]);
    }

    validate() {
      if (!this.#field) return true;
      this.#checked = true;
      const valid = this.#field.checkValidity();
      this.refresh();
      return valid;
    }

    clear() {
      const field = this.#field;
      if (!field || !field.value || field.readOnly || field.matches(':disabled') || this.#composing) return false;
      field.value = '';
      field.focus({ preventScroll: true });
      field.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      return true;
    }

    #edit = event => {
      if (event.target !== this.#field) return;
      this.#edited = true;
      this.refresh();
    };
    #composition = event => {
      if (event.target !== this.#field) return;
      this.#composing = event.type === 'compositionstart';
      if (!this.#composing) this.refresh();
    };
    #focusIn = event => { if (event.target === this.#field) this.refresh(); };
    #focusOut = event => {
      if (this.contains(event.relatedTarget) || !this.#field || this.#composing) return;
      if (this.#edited || this.#field.value) this.#checked = true;
      this.refresh();
    };
    #invalid = event => {
      if (event.target !== this.#field || event.target.hasAttribute('data-ml-form-managed')) return;
      this.#checked = true;
      this.refresh();
    };
    #reset = event => {
      const field = this.#field;
      if (!field || event.target !== field.form) return;
      // Native values are restored by the reset event's default action.
      setTimeout(() => {
        if (event.defaultPrevented || !this.isConnected || this.#field !== field) return;
        this.#checked = this.#edited = this.#composing = false;
        maskPassword(field);
        this.refresh();
      }, 0);
    };
    #mouseDown = event => {
      if (event.target === this.#action && event.button === 0 && this.getRootNode().activeElement === this.#field) event.preventDefault();
    };
    #click = event => {
      if (event.target !== this.#action || event.defaultPrevented || this.#action.hidden) return;
      const field = this.#field;
      if (!field || field.matches(':disabled')) return;
      if (this.dataset.mlInputKind !== 'password') { this.clear(); return; }
      const start = field.selectionStart, end = field.selectionEnd, direction = field.selectionDirection, scroll = field.scrollLeft;
      const reveal = field.type === 'password';
      field.type = reveal ? 'text' : 'password';
      field.toggleAttribute('data-ml-input-visible', reveal);
      if (start !== null) field.setSelectionRange(start, end, direction);
      field.scrollLeft = scroll;
      this.refresh();
    };
    #key = event => {
      if (event.target === this.#field && event.key === 'Escape' && this.#field.type === 'search' &&
          !event.defaultPrevented && !event.isComposing && event.keyCode !== 229 && this.clear()) event.preventDefault();
    };
  }
  customElements.define('ml-input', MaterialInput);
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
  if (customElements.get('ml-slider')) return;
  const { ValueField, part, describeUnit } = globalThis[Symbol.for('material-lib.value-controls.v1')];
  const { GlassScene } = globalThis[Symbol.for('material-lib.glass.v1')];
  const adjustmentKeys = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);
  const interactionEvents = ['pointerdown', 'pointerup', 'pointercancel', 'lostpointercapture', 'keydown', 'keyup', 'focusout'];
  function limit(attribute, fallback) {
    return attribute.trim() && Number.isFinite(Number(attribute)) ? Number(attribute) : fallback;
  }
  class Slider extends ValueField {
    static observedAttributes = ['unit', 'ticks'];
    #pressedKey = null;
    #pointerId = null;
    #activeInput = null;
    #drag = null;
    #tick = null;
    get control() { return this.querySelector(':scope > input[type="range"]'); }
    get value() { return this.control?.valueAsNumber; }
    set value(number) {
      if (this.control) { this.control.value = String(number); this.refresh(); }
    }
    connectedCallback() {
      super.connectedCallback();
      this.#release();
      for (const type of interactionEvents) this.addEventListener(type, this.#onInteraction);
    }
    disconnectedCallback() {
      for (const type of interactionEvents) this.removeEventListener(type, this.#onInteraction);
      this.#release();
      super.disconnectedCallback();
    }
    #onInteraction = event => {
      const input = event.target;
      switch (event.type) {
        case 'pointerdown':
          if (this.#pointerId !== null || event.defaultPrevented || !event.isPrimary || event.button !== 0 || input !== this.control || !input.matches(':enabled')) return;
          this.#pressedKey = null;
          this.#pointerId = event.pointerId;
          this.#activeInput = input;
          this.dataset.mlAdjust = 'pointer';
          this.#startDrag(event);
          // Capture on the native input itself so dragging and its form events remain native.
          if (event.isTrusted) input.setPointerCapture(event.pointerId);
          break;
        case 'pointerup':
        case 'pointercancel':
        case 'lostpointercapture':
          if (event.pointerId === this.#pointerId) this.#release();
          break;
        case 'keydown':
          if (this.#pointerId !== null || event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey ||
              event.isComposing || !adjustmentKeys.has(event.key) || input !== this.control || !input.matches(':enabled')) return;
          this.#pressedKey = event.key;
          this.#activeInput = input;
          this.dataset.mlAdjust = 'key';
          break;
        case 'keyup':
          if (event.key === this.#pressedKey) this.#release();
          break;
        case 'focusout':
          if (input === this.#activeInput) this.#release();
          break;
      }
    };
    #startDrag(event) {
      const win = this.ownerDocument.defaultView;
      if (win.matchMedia('(prefers-reduced-motion: reduce), (forced-colors: active)').matches ||
          !(parseFloat(win.getComputedStyle(this).getPropertyValue('--ml-slider-stretch')) > 0)) return;
      const track = this.querySelector(':scope > [data-ml-part="track"]');
      if (!track) return;
      const { left, right } = track.getBoundingClientRect();
      if (right <= left) return;
      this.#drag = { track, left, right, x: Math.max(left, Math.min(right, event.clientX)), time: event.timeStamp, timer: 0 };
      this.addEventListener('pointermove', this.#onDragMove, { passive: true });
    }
    #onDragMove = event => {
      if (event.pointerId !== this.#pointerId) return;
      const drag = this.#drag;
      const x = Math.max(drag.left, Math.min(drag.right, event.clientX));
      if (x === drag.x) return;
      // Only the contour follows speed. The native range owns the position and all value events.
      const elapsed = Math.max(8, event.timeStamp - drag.time);
      const speed = Math.min(1, Math.abs(x - drag.x) / elapsed / 1.2);
      drag.x = x;
      drag.time = event.timeStamp;
      drag.track.style.setProperty('--ml-slider-speed', speed.toFixed(2));
      clearTimeout(drag.timer);
      drag.timer = setTimeout(() => drag.track.style.removeProperty('--ml-slider-speed'), 75);
    };
    #release() {
      if (this.#drag) {
        this.removeEventListener('pointermove', this.#onDragMove);
        clearTimeout(this.#drag.timer);
        this.#drag.track.style.removeProperty('--ml-slider-speed');
        this.#drag = null;
      }
      this.#pressedKey = null;
      this.#pointerId = null;
      this.#activeInput = null;
      this.removeAttribute('data-ml-adjust');
    }
    refresh() {
      const input = this.control;
      this.toggleAttribute('data-ml-ready', !!input);
      if (this.#activeInput && (input !== this.#activeInput || !input.matches(':enabled'))) this.#release();
      if (!input) return;
      const min = limit(input.min, 0), max = limit(input.max, 100);
      const ratio = max > min ? Math.max(0, Math.min(1, (input.valueAsNumber - min) / (max - min))) : 0;
      const unit = this.getAttribute('unit') || '';
      describeUnit(this, input, unit);
      const reading = part(this, 'reading');
      reading.setAttribute('aria-hidden', 'true');
      reading.textContent = input.value + unit;
      const track = part(this, 'track');
      track.setAttribute('aria-hidden', 'true');
      const position = ratio * 100 + '%';
      if (track.style.getPropertyValue('--ml-position') !== position) {
        track.style.setProperty('--ml-position', position);
        // A form reset or value assignment can move a stationary, lit thumb.
        GlassScene.forDocument(this.ownerDocument).wake();
      }
      part(track, 'fill');
      part(track, 'thumb', 'ml-value-surface');
      const ticks = part(track, 'ticks');
      const increment = limit(input.step, 1);
      const step = input.step.toLowerCase() === 'any' ? 0 : increment > 0 ? increment : 1;
      // HTML bases the step grid on min, then the value attribute, then zero.
      const base = limit(input.min, limit(input.getAttribute('value') || '', 0));
      const first = step > 0 ? Math.ceil((min - base) / step - 1e-9) : 0;
      const tickKey = [min, max, step, base, this.hasAttribute('ticks')].join('/');
      if (ticks.dataset.scale !== tickKey) {
        ticks.dataset.scale = tickKey;
        ticks.replaceChildren();
        this.#tick = null;
        const intervals = step > 0 ? Math.floor((max - base) / step + 1e-9) - first : 0;
        if (this.hasAttribute('ticks') && intervals >= 1 && intervals <= 24 && max > min) {
          for (let i = 0; i <= intervals; i++) {
            const mark = this.ownerDocument.createElement('i');
            const value = base + (first + i) * step;
            mark.style.insetInlineStart = Math.max(0, Math.min(100, 100 * (value - min) / (max - min))) + '%';
            ticks.append(mark);
          }
        }
      }
      const tick = ticks.childElementCount
        ? ticks.children[Math.round((input.valueAsNumber - base) / step) - first] : null;
      if (this.#tick !== tick) {
        this.#tick?.removeAttribute('data-ml-current');
        tick?.setAttribute('data-ml-current', '');
        this.#tick = tick;
      }
      const ends = part(this, 'ends');
      ends.setAttribute('aria-hidden', 'true');
      part(ends, 'minimum').textContent = min + unit;
      part(ends, 'maximum').textContent = max + unit;
    }
  }
  customElements.define('ml-slider', Slider);
})();

(() => {
  'use strict';
  if (customElements.get('ml-stepper')) return;
  const { ValueField, part, ensureId, describeUnit, signal } = globalThis[Symbol.for('material-lib.value-controls.v1')];

  // Let the browser resolve decimal precision, off-grid values and the native step base.
  function nextValue(input, direction) {
    const probe = input.cloneNode(false);
    probe.value = input.value;
    if (input.step === 'any') {
      const min = input.min === '' ? -Infinity : Number(input.min);
      const max = input.max === '' ? Infinity : Number(input.max);
      if (min > max) return input.value;
      const base = Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : 0;
      const next = Math.max(Number.isFinite(min) ? min : -Infinity, Math.min(Number.isFinite(max) ? max : Infinity, base + direction));
      if (input.value !== '' && (next - base) * direction <= 0) return input.value;
      probe.valueAsNumber = Number(next.toPrecision(15));
    } else if (direction > 0) probe.stepUp();
    else probe.stepDown();
    return probe.value;
  }
  class Stepper extends ValueField {
    get control() { return this.querySelector(':scope > input[type="number"]'); }
    get value() { return this.control?.valueAsNumber; }
    set value(number) {
      if (this.control) { this.control.value = number == null ? '' : String(number); this.refresh(); }
    }
    connectedCallback() { super.connectedCallback(); this.addEventListener('click', this.#click); }
    disconnectedCallback() { this.removeEventListener('click', this.#click); super.disconnectedCallback(); }
    #click = event => {
      const button = event.target.closest('button[data-ml-part]');
      const input = this.control;
      if (button?.parentElement !== this || !input || input.matches(':disabled, [readonly]') || button.disabled) return;
      const value = nextValue(input, button.dataset.mlPart === 'plus' ? 1 : -1);
      if (value !== input.value) {
        const focused = button.matches(':focus');
        input.value = value;
        signal(input);
        if (focused && button.disabled) input.focus({ preventScroll: true });
      }
    };
    refresh() {
      const input = this.control;
      this.toggleAttribute('data-ml-ready', !!input);
      if (!input) return;
      part(this, 'surface', 'ml-value-surface');
      const unit = part(this, 'reading');
      unit.textContent = this.getAttribute('unit') || '';
      unit.hidden = !unit.textContent;
      describeUnit(this, input, unit.textContent);
      const label = input.getAttribute('aria-label') || input.labels?.[0]?.textContent.trim() || '数值';
      for (const [direction, name, verb] of [[-1, 'minus', '减少'], [1, 'plus', '增加']]) {
        const button = part(this, name, 'button');
        button.setAttribute('aria-label', verb + label);
        button.setAttribute('aria-controls', ensureId(input));
        button.disabled = input.matches(':disabled, [readonly]') || nextValue(input, direction) === input.value;
      }
    }
  }
  customElements.define('ml-stepper', Stepper);
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

(() => {
  'use strict';
  const key = Symbol.for('material-lib.picker-field.v1');
  if (globalThis[key]) return;
  const { ValueField, part, ensureId, signal } = globalThis[Symbol.for('material-lib.value-controls.v1')];
  const { GlassScene } = globalThis[Symbol.for('material-lib.glass.v1')];

  function outside(event, panel) {
    if (event.target !== panel) return false;
    const box = panel.getBoundingClientRect();
    return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
  }

  // The light-DOM field owns form value and validity. A dialog only proposes a value.
  class PickerField extends ValueField {
    #panel;
    #trigger;

    get field() {
      const selector = 'input[type="' + this.inputType + '"]';
      return this.querySelector(':scope > ' + selector + ', :scope > label ' + selector);
    }
    get value() { return this.field?.value ?? ''; }
    set value(value) {
      const field = this.field;
      if (field) { field.value = value ?? ''; this.refresh(); }
    }
    get open() { return this.#panel?.open ?? false; }
    connectedCallback() {
      if (!this.#panel) this.querySelector(':scope > dialog[data-ml-part="picker"]')?.remove();
      super.connectedCallback();
      this.addEventListener('click', this.#activate);
    }
    disconnectedCallback() {
      this.removeEventListener('click', this.#activate);
      this.closePicker(false);
      super.disconnectedCallback();
    }

    refresh() {
      const field = this.field;
      this.toggleAttribute('data-ml-ready', Boolean(field));
      if (!field) { this.closePicker(false); return; }
      part(this, 'surface', 'ml-value-surface');
      const trigger = this.#trigger = part(this, 'open', 'button');
      trigger.setAttribute('aria-label', '打开' + this.pickerLabel + '选择器');
      trigger.setAttribute('aria-haspopup', 'dialog');
      trigger.setAttribute('aria-expanded', String(this.open));
      if (this.#panel) trigger.setAttribute('aria-controls', this.#panel.id);
      else trigger.removeAttribute('aria-controls');
      trigger.disabled = field.matches(':disabled, [readonly]') || !this.readLimits(field);
      if (!this.open) return;
      if (trigger.disabled) this.closePicker(false);
      else this.updatePicker(this.#panel);
    }

    #activate = event => {
      if (!event.defaultPrevented && event.target.closest('button') === this.#trigger) this.openPicker();
    };

    #mount() {
      const panel = this.#panel = part(this, 'picker', 'dialog');
      panel.classList.add('ml-picker-panel');
      panel.setAttribute('aria-label', '选择' + this.pickerLabel);
      this.#trigger.setAttribute('aria-controls', ensureId(panel));
      this.buildPicker(panel);
      part(panel, 'sheet', 'ml-value-surface');
      let pressedOutside = false;
      panel.addEventListener('pointerdown', event => { pressedOutside = outside(event, panel); });
      panel.addEventListener('click', event => {
        if ((pressedOutside && outside(event, panel)) || event.target.closest('[data-ml-picker-cancel]')) this.closePicker();
        pressedOutside = false;
      });
      panel.addEventListener('close', () => {
        if (!panel.open) this.#trigger?.setAttribute('aria-expanded', 'false');
      });
    }

    openPicker() {
      if (!this.isConnected || !this.getClientRects().length || this.closest('[inert]') || this.open) return;
      this.refresh();
      if (!this.field || this.#trigger.disabled) return;
      if (!this.#panel) this.#mount();
      this.updatePicker(this.#panel, true);
      this.#trigger.focus({ preventScroll: true });
      this.#panel.showModal();
      this.#trigger.setAttribute('aria-expanded', 'true');
      this.focusPicker(this.#panel);
      const entrance = this.#panel.getAnimations().find(animation => animation.animationName === 'ml-picker-in');
      if (entrance && getComputedStyle(this).getPropertyValue('--ml-light-source').trim() === 'pointer') {
        GlassScene.forDocument(this.ownerDocument).wake(entrance.effect.getComputedTiming().endTime);
      }
    }
    closePicker(restoreFocus = true) {
      if (!this.open) return;
      this.#panel.close();
      this.#trigger.setAttribute('aria-expanded', 'false');
      if (restoreFocus && !this.#trigger.matches(':disabled')) this.#trigger.focus({ preventScroll: true });
    }

    choose(value) {
      const field = this.field;
      if (!this.open || !field || field.matches(':disabled, [readonly]')) return;
      // Check the proposed value with the same native constraints before writing it.
      const probe = field.cloneNode(false);
      probe.value = value;
      if (probe.value !== value || !probe.validity.valid) return;
      const changed = field.value !== value;
      field.value = value;
      this.closePicker();
      if (changed) signal(field);
    }
  }
  globalThis[key] = { PickerField };
})();

(() => {
  'use strict';
  if (customElements.get('ml-date-picker')) return;
  const { PickerField } = globalThis[Symbol.for('material-lib.picker-field.v1')];
  const { CalendarView, dayOf, isoOf, shiftMonth, today, limits, allowed, aligned } =
    globalThis[Symbol.for('material-lib.calendar.v1')];

  class SingleDatePicker extends PickerField {
    #limits;
    #calendar;
    get inputType() { return 'date'; }
    get pickerLabel() { return '日期'; }
    readLimits(field) {
      this.#limits = limits(field);
      return this.#limits.min <= this.#limits.max;
    }
    buildPicker(panel) {
      this.#calendar = new CalendarView(panel, day => allowed(day, this.#limits),
        '<footer><div class="ml-picker-actions">' +
        '<button type="button" data-calendar="today" data-ml-picker-action="quiet">今天</button>' +
        '<button type="button" data-calendar="clear" data-ml-picker-action="quiet">清除</button></div>' +
        '<button type="button" data-ml-picker-cancel data-ml-picker-action>取消</button></footer>');
      panel.querySelector('[data-calendar="prompt"]').textContent = '选择日期';
      panel.addEventListener('click', this.#click);
      panel.addEventListener('keydown', this.#keys);
    }
    updatePicker(panel, opening = false) {
      let day = this.#calendar.cursor;
      if (opening) {
        const initial = dayOf(this.value) ?? today();
        const before = aligned(this.#limits, initial, -1), after = aligned(this.#limits, initial, 1);
        day = after === null || (before !== null && initial - before < after - initial) ? before : after;
      }
      this.#move(day, panel.querySelector('tbody button:focus') !== null);
      panel.querySelector('[data-calendar="today"]').disabled = !allowed(today(), this.#limits);
      panel.querySelector('[data-calendar="clear"]').hidden = this.field.required || !this.value;
    }
    focusPicker() { this.#calendar.focus(); }
    #move(day, focus, direction = 1) {
      this.#calendar.move(day, this.#limits, direction);
      this.#calendar.select(dayOf(this.value));
      if (focus) this.#calendar.focus();
    }
    #click = event => {
      const button = event.target.closest('button');
      if (!button || button.disabled || !this.open) return;
      if (button.dataset.day !== undefined) {
        const day = Number(button.dataset.day);
        if (allowed(day, this.#limits)) this.choose(isoOf(day));
        return;
      }
      const action = button.dataset.calendar;
      if (action === 'today') this.choose(isoOf(today()));
      if (action === 'clear') this.choose('');
      if (action === 'prev' || action === 'next') {
        this.#move(shiftMonth(this.#calendar.cursor, action === 'prev' ? -1 : 1), false);
        if (button.disabled) this.#calendar.focus();
      }
    };
    #keys = event => {
      const move = this.#calendar.keyMove(event);
      if (!move) return;
      const day = move.arrow ? aligned(this.#limits, move.day, move.direction) : move.day;
      if (day !== null) this.#move(day, true, move.direction);
    };
  }
  customElements.define('ml-date-picker', SingleDatePicker);
})();

(() => {
  'use strict';
  if (customElements.get('ml-time-picker')) return;
  const { PickerField } = globalThis[Symbol.for('material-lib.picker-field.v1')];
  const { ensureId, stepStride } = globalThis[Symbol.for('material-lib.value-controls.v1')];
  const second = 1000, minute = 60 * second, hour = 60 * minute, day = 24 * hour;
  const units = [
    { label: '小时', scale: hour, size: 24 },
    { label: '分钟', scale: minute, size: 60 },
    { label: '秒', scale: second, size: 60 },
  ];
  const two = value => String(value).padStart(2, '0');
  const partOf = (time, unit) => Math.floor(time / unit.scale) % unit.size;
  function timeOf(value) {
    const valid = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.(\d{1,3}))?)?$/.exec(value);
    if (!valid) return null;
    const [, h, m, s = '0', ms = ''] = valid;
    return Number(h) * hour + Number(m) * minute + Number(s) * second + Number(ms.padEnd(3, '0'));
  }
  function timeString(value, withSeconds = false) {
    const h = partOf(value, units[0]), m = partOf(value, units[1]), s = partOf(value, units[2]);
    const ms = value % second;
    const digits = two(h) + ':' + two(m);
    if (!s && !ms && !withSeconds) return digits;
    return digits + ':' + two(s) + (ms ? '.' + String(ms).padStart(3, '0').replace(/0+$/, '') : '');
  }

  function limits(input) {
    const min = timeOf(input.min) ?? 0, max = timeOf(input.max) ?? day - 1;
    const intervals = min > max ? [[0, max], [min, day - 1]] : [[min, max]];
    return { intervals, firstHour: min > max ? Math.floor(min / hour) : 0,
      base: timeOf(input.min) ?? timeOf(input.defaultValue) ?? 0, step: Math.min(day, stepStride(input.step, minute, 3)) };
  }
  function closestTime({ intervals, base, step }, target, start = 0, end = day - 1) {
    let selected = null;
    for (const [min, max] of intervals) {
      const first = Math.ceil((Math.max(start, min) - base) / step);
      const last = Math.floor((Math.min(end, max) - base) / step);
      if (first > last) continue;
      const index = Math.max(first, Math.min(last, Math.round((target - base) / step)));
      const value = base + index * step;
      if (selected === null || Math.abs(target - value) < Math.abs(target - selected)) selected = value;
    }
    return selected;
  }

  class TimePicker extends PickerField {
    #limits;
    #draft;
    #columns;
    #reading;
    #clear;
    get inputType() { return 'time'; }
    get pickerLabel() { return '时间'; }
    readLimits(input) {
      this.#limits = limits(input);
      return closestTime(this.#limits, 0) !== null;
    }
    buildPicker(panel) {
      panel.classList.add('ml-time-panel');
      panel.innerHTML = '<header><h2>选择时间</h2><div class="ml-time-reading" dir="ltr" role="status" aria-atomic="true"></div></header>' +
        '<div class="ml-time-columns"></div><footer>' +
        '<div class="ml-picker-actions"><button type="button" data-time-action="clear" data-ml-picker-action="quiet">清除</button></div>' +
        '<div class="ml-picker-actions"><button type="button" data-ml-picker-cancel data-ml-picker-action>取消</button>' +
        '<button type="button" data-time-action="confirm" data-ml-picker-action="primary">确定</button></div></footer>';
      this.#reading = panel.querySelector('.ml-time-reading');
      this.#clear = panel.querySelector('[data-time-action="clear"]');
      const container = panel.querySelector('.ml-time-columns');
      this.#columns = units.map(unit => this.#createColumn(container, unit));
      panel.addEventListener('click', this.#click);
      panel.addEventListener('keydown', this.#keys);
    }
    #createColumn(container, unit) {
      const doc = this.ownerDocument;
      const column = doc.createElement('div');
      const label = doc.createElement('span');
      label.className = 'ml-time-label';
      label.textContent = unit.label;
      const list = doc.createElement('div');
      list.className = 'ml-time-list';
      list.setAttribute('role', 'listbox');
      list.setAttribute('aria-label', unit.label);
      list.tabIndex = 0;
      const id = ensureId(list);
      const items = [];
      for (let index = 0; index < unit.size; index++) {
        const item = doc.createElement('div');
        item.id = id + '-' + index;
        item.dataset.time = String(index);
        item.setAttribute('role', 'option');
        item.textContent = two(index);
        items.push(item);
      }
      list.append(...items);
      column.append(label, list);
      container.append(column);
      return { ...unit, column, list, items, first: 0 };
    }

    updatePicker(panel, opening = false) {
      const now = new Date();
      const preferred = opening ? timeOf(this.value) ?? (now.getHours() * hour + now.getMinutes() * minute) : this.#draft;
      this.#draft = closestTime(this.#limits, preferred);
      this.#clear.hidden = this.field.required || !this.value;
      this.#draw();
    }
    focusPicker() {
      this.#columns[0].list.focus({ preventScroll: true });
      for (const column of this.#columns) this.#reveal(column);
    }
    #partStart(column, index) {
      const span = column.scale * column.size;
      return Math.floor(this.#draft / span) * span + column.scale * index;
    }
    #draw() {
      const showSeconds = this.#limits.step % minute !== 0 || this.#limits.base % minute !== 0;
      this.#columns[2].column.hidden = !showSeconds;
      this.#reading.textContent = timeString(this.#draft, showSeconds);
      const hours = this.#columns[0], first = this.#limits.firstHour;
      if (first !== hours.first) {
        hours.list.append(...hours.items.slice(first), ...hours.items.slice(0, first));
        hours.first = first;
      }
      for (const column of this.#columns) {
        if (column.column.hidden) continue;
        const selected = partOf(this.#draft, column);
        column.items.forEach((item, index) => {
          const start = this.#partStart(column, index);
          item.hidden = closestTime(this.#limits, start, start, start + column.scale - 1) === null;
          item.setAttribute('aria-selected', String(index === selected));
        });
        column.list.setAttribute('aria-activedescendant', column.items[selected].id);
        this.#reveal(column);
      }
    }
    #reveal(column) {
      const { list, items } = column;
      const row = items[partOf(this.#draft, column)];
      if (!list.clientHeight) return;
      if (row.offsetTop < list.scrollTop) list.scrollTop = row.offsetTop;
      else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) {
        list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight;
      }
    }
    #select(column, index) {
      const start = this.#partStart(column, index);
      const proposed = start + this.#draft % column.scale;
      const value = closestTime(this.#limits, proposed, start, start + column.scale - 1);
      if (value !== null && value !== this.#draft) {
        this.#draft = value;
        this.#draw();
      }
    }
    #confirm() {
      this.choose(timeOf(this.value) === this.#draft ? this.value : timeString(this.#draft));
    }
    #click = event => {
      if (!this.open) return;
      const item = event.target.closest('[data-time]');
      if (item && !item.hidden) {
        const column = this.#columns.find(c => c.list === item.parentElement);
        if (column) {
          this.#select(column, Number(item.dataset.time));
          column.list.focus({ preventScroll: true });
        }
      } else if (event.target.dataset.timeAction === 'confirm') this.#confirm();
      else if (event.target.dataset.timeAction === 'clear' && !this.#clear.hidden) this.choose('');
    };
    #keys = event => {
      if (!this.open || event.altKey || event.ctrlKey || event.metaKey) return;
      const column = this.#columns.find(c => c.list === event.target);
      if (!column) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (event.key === 'Enter') this.#confirm();
        return;
      }
      const shifts = { ArrowUp: -1, ArrowDown: 1, PageUp: -5, PageDown: 5, Home: -column.size, End: column.size };
      if (!Object.hasOwn(shifts, event.key)) return;
      event.preventDefault();
      const items = Array.from(column.list.children).filter(item => !item.hidden);
      const index = items.indexOf(column.items[partOf(this.#draft, column)]);
      const next = items[Math.max(0, Math.min(items.length - 1, index + shifts[event.key]))];
      if (next) this.#select(column, Number(next.dataset.time));
    };
  }
  customElements.define('ml-time-picker', TimePicker);
})();

(() => {
  'use strict';

  if (customElements.get('ml-choice')) return;
  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  const inputSelector = 'input:is([type="checkbox"], [type="radio"])';
  const masterSelector = 'input[type="checkbox"][data-ml-all]';

  class Choice extends GlassControl {
    get glassContent() { return this.querySelector(':scope > ' + inputSelector); }
  }
  customElements.define('ml-choice', Choice);

  // Keep the selection visible when a common fieldset is disabled. A disabled
  // option or sub-fieldset that only affects a child is outside the bulk action.
  function selectableWith(field, master) {
    if (!field.matches(':disabled')) return true;
    if (field.disabled) return false;
    for (let fs = field.closest('fieldset[disabled]'); fs; fs = fs.parentElement?.closest('fieldset[disabled]')) {
      const legend = fs.querySelector(':scope > legend');
      if (!legend?.contains(field) && (!fs.contains(master) || legend?.contains(master))) return false;
    }
    return true;
  }

  function setUnavailable(master, unavailable) {
    if (unavailable && !master.disabled) {
      master.setAttribute('data-ml-choice-empty', '');
      master.disabled = true;
    } else if (!unavailable && master.hasAttribute('data-ml-choice-empty')) {
      master.removeAttribute('data-ml-choice-empty');
      master.disabled = false;
    }
  }

  // An application can explicitly disable the master while all children are unavailable.
  // Our own automatic disable always changes an absent attribute to a present one.
  function preserveExplicitDisables(records) {
    for (const { target, attributeName, oldValue } of records) {
      if (attributeName === 'disabled' && oldValue !== null && target.disabled && target.hasAttribute('data-ml-choice-empty')) {
        target.removeAttribute('data-ml-choice-empty');
      }
    }
  }

  class ChoiceGroup extends HTMLElement {
    #master;
    #events;
    #sending = false;
    #changes = new MutationObserver(records => this.#refresh(records));

    get options() {
      return [...this.querySelectorAll('ml-choice > ' + inputSelector)]
        .filter(field => !field.matches(masterSelector) && field.closest('ml-choice-group') === this);
    }

    connectedCallback() {
      this.#events = new AbortController();
      const listen = { capture: true, signal: this.#events.signal };
      this.addEventListener('input', this.#select, listen);
      this.addEventListener('change', this.#select, listen);
      this.getRootNode().addEventListener('reset', this.#reset, listen);
      this.#changes.observe(this, { childList: true, subtree: true, attributeOldValue: true,
        attributeFilter: ['type', 'checked', 'disabled', 'data-ml-all'] });
      this.refresh();
    }

    disconnectedCallback() {
      preserveExplicitDisables(this.#changes.takeRecords());
      this.#changes.disconnect();
      this.#events.abort();
      if (this.#master) setUnavailable(this.#master, false);
      this.#master = null;
    }

    #members(master) {
      return this.options.filter(field => field.type === 'checkbox' && selectableWith(field, master));
    }

    refresh() { this.#refresh(this.#changes.takeRecords()); }

    #refresh(records) {
      preserveExplicitDisables(records);
      const master = [...this.querySelectorAll('ml-choice > ' + masterSelector)]
        .find(field => field.closest('ml-choice-group') === this);
      if (this.#master && this.#master !== master) setUnavailable(this.#master, false);
      this.#master = master;
      if (!master) return;
      const options = this.#members(master);
      master.checked = options.length > 0 && options.every(field => field.checked && !field.indeterminate);
      master.indeterminate = !master.checked && options.some(field => field.checked || field.indeterminate);
      setUnavailable(master, options.length === 0);
    }

    #select = event => {
      const field = event.target;
      if (this.#sending || !field.matches?.('ml-choice > ' + inputSelector) || field.closest('ml-choice-group') !== this) return;
      // Native activation already applied the bulk action during input. Its change
      // event must keep any corrections made by the application's input listeners.
      if (!field.matches(masterSelector) || field.matches(':disabled') || (event.type === 'change' && event.isTrusted)) {
        this.refresh();
        return;
      }
      const checked = field.checked;
      const changed = this.#members(field).filter(option => option.checked !== checked || option.indeterminate);
      for (const option of changed) {
        option.checked = checked;
        option.indeterminate = false;
      }
      this.refresh();
      // Observers see the final selection, including when they listen on an individual option.
      this.#sending = true;
      try {
        for (const option of changed) {
          option.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
          option.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } finally {
        this.#sending = false;
        this.refresh();
      }
    };

    #reset = event => {
      if (!this.#master || (event.target !== this.#master.form && !this.options.some(field => field.form === event.target))) return;
      // Let the browser restore defaultChecked before deriving the mixed indicator.
      setTimeout(() => { if (this.isConnected && !event.defaultPrevented) this.refresh(); }, 0);
    };
  }
  customElements.define('ml-choice-group', ChoiceGroup);
})();

(() => {
  'use strict';

  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  const grouped = 'ml-list-group > :is(ul, ol) > li > ml-list-item';

  if (!customElements.get('ml-list-group')) {
    customElements.define('ml-list-group', class extends GlassControl {
      get glassContent() { return this.querySelector(':scope > :is(ul, ol):not([hidden])'); }
    });
  }

  if (!customElements.get('ml-list-item')) {
    customElements.define('ml-list-item', class extends GlassControl {
      #standalone = false;

      connectedCallback() {
        // Grouped rows share their list's lens, even when a row moves between lists.
        this.#standalone = !this.matches(grouped);
        if (this.#standalone) {
          super.connectedCallback();
        } else {
          // A copied standalone row can carry a refractive lens or a CSS pointer light.
          for (const layer of this.querySelectorAll(':scope > .ml-optical')) layer.remove();
          this.classList.remove('ml-refractive');
          this.style.removeProperty('--ml-bend');
        }
      }

      disconnectedCallback() {
        if (this.#standalone) super.disconnectedCallback();
      }

      get glassContent() {
        return this.querySelector(':scope > .ml-list-row, :scope > details > summary.ml-list-row');
      }
    });
  }
})();

(() => {
  'use strict';
  if (customElements.get('ml-accordion')) return;

  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  const supportsGroups = 'name' in HTMLDetailsElement.prototype;
  const names = new WeakMap();
  let sequence = 0;

  class MaterialAccordion extends GlassControl {
    static observedAttributes = ['mode'];
    #group = 'ml-accordion-group-' + ++sequence;
    #items = new Set();
    #closing = new Map();
    #changes = new MutationObserver(records => {
      if (records.some(record => record.type === 'childList' && record.target === this &&
        [...record.addedNodes, ...record.removedNodes].some(node => node.localName === 'details'))) {
        this.#syncGroup();
      }
      const changed = records.filter(record => record.type === 'attributes' && this.#items.has(record.target))
        .map(record => record.target);
      if (!supportsGroups && this.#single) {
        this.#keepOne(changed.findLast(item => item.open));
      }
      for (const item of new Set(changed)) this.#syncPanel(item);
    });

    get #single() { return this.getAttribute('mode') === 'single'; }
    get glassContent() { return this.querySelector(':scope > details:not([hidden])') && this; }

    connectedCallback() {
      super.connectedCallback();
      this.#changes.observe(this, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
      this.#syncGroup();
      this.addEventListener('keydown', this.#onKey);
    }

    disconnectedCallback() {
      this.removeEventListener('keydown', this.#onKey);
      this.#changes.disconnect();
      for (const panel of this.#closing.keys()) this.#endClose(panel);
      for (const item of this.#items) if (item.parentElement !== this) this.#restoreName(item);
      super.disconnectedCallback();
    }

    attributeChangedCallback(name, before, after) {
      if (this.isConnected && before !== after) this.#syncGroup();
    }

    #syncGroup() {
      const items = new Set(this.querySelectorAll(':scope > details'));
      for (const item of this.#items) if (!items.has(item)) this.#restoreName(item);
      this.#items = items;
      if (this.#single) this.#keepOne([...items].find(item => item.open));
      for (const item of items) {
        const original = names.get(item) ?? { name: item.getAttribute('name') };
        original.owner = this;
        names.set(item, original);
        if (this.#single) {
          if (item.getAttribute('name') !== this.#group) item.setAttribute('name', this.#group);
        } else item.removeAttribute('name');
      }
    }

    #restoreName(item) {
      const original = names.get(item);
      if (original?.owner !== this) return;
      if (original.name === null) item.removeAttribute('name');
      else item.setAttribute('name', original.name);
      names.delete(item);
    }

    #keepOne(open) {
      if (!open) return;
      for (const item of this.#items) if (item !== open && item.open) item.open = false;
    }

    #syncPanel(item) {
      const summary = item.querySelector(':scope > summary:first-child');
      const panel = item.querySelector(':scope > summary + .ml-accordion-panel:last-child');
      if (!summary || !panel) return;
      if (item.open) {
        this.#endClose(panel);
        return;
      }
      if (panel.contains(this.getRootNode().activeElement)) summary.focus({ preventScroll: true });
      // Native details hides the panel once the exit finishes. Until then, skip its controls.
      const fade = panel.getAnimations().find(animation => animation.transitionProperty === 'opacity');
      if (!fade || (panel.inert && !this.#closing.has(panel))) return;
      panel.inert = true;
      this.#closing.set(panel, fade);
      const settle = () => { if (this.#closing.get(panel) === fade) this.#endClose(panel); };
      fade.finished.then(settle, settle);
    }

    #endClose(panel) {
      if (this.#closing.delete(panel)) panel.inert = false;
    }

    #onKey = event => {
      const keys = ['ArrowUp', 'ArrowDown', 'Home', 'End'];
      const from = event.target;
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
          !keys.includes(event.key) || !from.matches('summary:first-child') || from.parentElement.parentElement !== this) return;
      const headers = Array.from(this.querySelectorAll(':scope > details > summary:first-child'))
        .filter(summary => !summary.closest('[inert]') && summary.getClientRects().length);
      const index = headers.indexOf(from);
      if (index === -1) return;
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? headers.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + headers.length) % headers.length;
      event.preventDefault();
      headers[next].focus();
    };
  }
  customElements.define('ml-accordion', MaterialAccordion);
})();

(() => {
  'use strict';
  if (customElements.get('ml-empty-state')) return;

  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  const { GlassScene } = globalThis[Symbol.for('material-lib.glass.v1')];

  class EmptyState extends GlassControl {
    static observedAttributes = ['variant'];

    get glassContent() { return this.getAttribute('variant') === 'panel' ? this : null; }

    attributeChangedCallback(name, before, after) {
      if (before !== after && this.isConnected) GlassScene.forDocument(this.ownerDocument).wake();
    }
  }

  customElements.define('ml-empty-state', EmptyState);
})();

(() => {
  'use strict';
  if (customElements.get('ml-pagination')) return;
  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  function integer(raw, fallback, min) {
    if (raw == null || String(raw).trim() === '') return fallback;
    const n = Number(raw);
    return Number.isSafeInteger(n) ? Math.max(min, n) : fallback;
  }
  function pageLinks(page, last) {
    if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);
    if (page <= 4) return [1, 2, 3, 4, 5, null, last];
    if (page >= last - 3) return [1, null, last - 4, last - 3, last - 2, last - 1, last];
    return [1, null, page - 1, page, page + 1, null, last];
  }
  class Pagination extends GlassControl {
    static observedAttributes = ['total', 'page', 'page-size', 'page-sizes', 'jump', 'disabled', 'label', 'for'];
    #nav;
    #last;
    #reflecting = false;
    get glassContent() { return this.#nav; }
    get total() { return integer(this.getAttribute('total'), 0, 0); }
    set total(value) { this.setAttribute('total', value); }
    get pageSize() { return integer(this.getAttribute('page-size'), 10, 1); }
    set pageSize(value) { this.setAttribute('page-size', value); }
    get pageCount() { return Math.ceil(this.total / this.pageSize); }
    get page() { return Math.min(this.pageCount, integer(this.getAttribute('page'), 1, 1)); }
    set page(value) { this.setAttribute('page', value); }
    get state() {
      const { total, page, pageSize, pageCount } = this;
      const start = page ? (page - 1) * pageSize + 1 : 0;
      const end = Math.min(total, page * pageSize);
      return { total, page, pageSize, pageCount, start, end };
    }
    connectedCallback() {
      let nav = this.querySelector(':scope > nav.ml-page-nav');
      if (!nav) {
        nav = this.ownerDocument.createElement('nav');
        nav.className = 'ml-page-nav';
        nav.innerHTML = '<span class="ml-page-summary" role="status" aria-atomic="true"></span>' +
          '<div class="ml-page-links"><button type="button" data-page-action="prev" aria-label="上一页"></button>' +
          '<span class="ml-page-numbers"></span><span class="ml-page-fraction"></span>' +
          '<button type="button" data-page-action="next" aria-label="下一页"></button></div>' +
          '<div class="ml-page-options"><label class="ml-page-size">每页 <span><select aria-label="每页条数"></select></span></label>' +
          '<span class="ml-page-jump"><label>跳至 <input type="text" inputmode="numeric" autocomplete="off" aria-label="跳转页码"></label>' +
          '<button type="button" data-page-action="go">前往</button></span></div>' +
          '<span class="ml-page-error" role="status" hidden></span>';
        this.append(nav);
      }
      this.#nav = nav;
      super.connectedCallback();
      nav.addEventListener('click', this.#click);
      nav.addEventListener('change', this.#change);
      nav.addEventListener('keydown', this.#keydown);
      nav.addEventListener('input', this.#clearError);
      this.#sync('connect');
    }
    disconnectedCallback() {
      this.#nav.removeEventListener('click', this.#click);
      this.#nav.removeEventListener('change', this.#change);
      this.#nav.removeEventListener('keydown', this.#keydown);
      this.#nav.removeEventListener('input', this.#clearError);
      super.disconnectedCallback();
    }
    attributeChangedCallback(name, before, after) {
      if (this.#nav && this.isConnected && !this.#reflecting && before !== after) this.#sync(name);
    }
    #sync(reason) {
      const previous = this.#last;
      let page = this.page;
      if (reason === 'page-size' && previous?.start) {
        page = Math.min(this.pageCount, Math.floor((previous.start - 1) / this.pageSize) + 1);
      }
      // Keep an initial requested page until a linked table supplies its total.
      if ((this.total || previous?.total) && String(page || 1) !== this.getAttribute('page')) {
        this.#reflecting = true;
        this.setAttribute('page', page || 1);
        this.#reflecting = false;
      }
      const state = this.state;
      this.#last = state;
      this.#render(state, !!previous?.page && previous.page !== page);
      if (previous && reason !== 'connect' && (state.page !== previous.page || state.total !== previous.total || state.pageSize !== previous.pageSize)) {
        this.dispatchEvent(new CustomEvent('ml-page-change', { bubbles: true, composed: true, detail: { ...state, reason } }));
      }
    }
    #render(state, changedPage) {
      const { total, page, pageCount, pageSize, start, end } = state;
      const nav = this.#nav, locked = this.hasAttribute('disabled');
      const focused = nav.getRootNode().activeElement;
      const hadLinkFocus = focused && nav.querySelector('.ml-page-links').contains(focused);
      nav.setAttribute('aria-label', this.getAttribute('label') || '分页');
      const summary = nav.querySelector('.ml-page-summary');
      const text = total ? '第 ' + start + '–' + end + ' 条，共 ' + total + ' 条' : '共 0 条';
      if (summary.textContent !== text) summary.textContent = text;
      const fraction = nav.querySelector('.ml-page-fraction');
      const pageText = page ? '第 ' + page + ' / ' + pageCount + ' 页' : '暂无页码';
      if (fraction.textContent !== pageText) {
        const counter = this.ownerDocument.createElement('span');
        counter.textContent = pageText;
        if (changedPage) counter.className = 'ml-page-arrival';
        fraction.replaceChildren(counter);
      }
      nav.querySelector('[data-page-action="prev"]').disabled = locked || page <= 1;
      nav.querySelector('[data-page-action="next"]').disabled = locked || page >= pageCount;
      const numbers = nav.querySelector('.ml-page-numbers');
      numbers.replaceChildren(...pageLinks(page, pageCount).map(value => {
        if (value === null) {
          const gap = this.ownerDocument.createElement('span');
          gap.className = 'ml-page-gap'; gap.textContent = '…'; gap.setAttribute('aria-hidden', 'true');
          return gap;
        }
        const button = this.ownerDocument.createElement('button');
        button.type = 'button'; button.dataset.page = value; button.textContent = value;
        button.setAttribute('aria-label', '第 ' + value + ' 页');
        button.disabled = locked;
        if (value === page) {
          button.setAttribute('aria-current', 'page');
          if (changedPage) button.className = 'ml-page-arrival';
        }
        return button;
      }));
      nav.toggleAttribute('data-empty', !total);
      nav.toggleAttribute('data-long-pages', pageCount > 9999);
      const size = nav.querySelector('.ml-page-size'), select = size.querySelector('select');
      const sizes = (this.getAttribute('page-sizes') || '').split(/[,\s]+/).map(Number).filter(n => Number.isSafeInteger(n) && n > 0);
      size.hidden = !sizes.length;
      const options = [...new Set([...sizes, pageSize])].sort((a, b) => a - b);
      if (select.dataset.sizes !== options.join(',')) {
        select.replaceChildren(...options.map(n => new Option(n + ' 条', String(n))));
        select.dataset.sizes = options.join(',');
      }
      select.value = String(pageSize); select.disabled = locked;
      const jump = nav.querySelector('.ml-page-jump');
      jump.hidden = !this.hasAttribute('jump');
      nav.querySelector('.ml-page-options').hidden = size.hidden && jump.hidden;
      jump.querySelector('input').disabled = jump.querySelector('button').disabled = locked || !total;
      if (jump.hidden || locked || !total) jump.querySelector('input').value = '';
      this.#clearError();
      const id = this.getAttribute('for');
      for (const control of nav.querySelectorAll('button, select')) {
        if (id) control.setAttribute('aria-controls', id);
        else control.removeAttribute('aria-controls');
      }
      if (hadLinkFocus && (!focused.isConnected || focused.disabled)) this.#focusPage();
    }
    #focusPage() {
      const target = [...this.#nav.querySelectorAll('[aria-current="page"], [data-page-action="next"], [data-page-action="prev"]')]
        .filter(el => !el.disabled && el.getClientRects().length);
      (target.find(el => el.hasAttribute('aria-current')) || target[0])?.focus({ preventScroll: true });
    }
    #clearError = () => {
      this.#nav.querySelector('.ml-page-error').hidden = true;
      this.#nav.querySelector('.ml-page-jump input').removeAttribute('aria-invalid');
    };
    #jump() {
      const field = this.#nav.querySelector('.ml-page-jump input');
      const value = Number(field.value.trim());
      if (!/^\d+$/.test(field.value.trim()) || !Number.isSafeInteger(value) || value < 1 || value > this.pageCount) {
        const error = this.#nav.querySelector('.ml-page-error');
        error.textContent = '请输入 1 至 ' + this.pageCount + ' 之间的页码';
        error.hidden = false; field.setAttribute('aria-invalid', 'true'); field.focus(); field.select();
        return;
      }
      this.#clearError();
      this.page = value;
      field.value = '';
    }
    #click = event => {
      const button = event.target.closest('button');
      if (!button || button.disabled || this.hasAttribute('disabled')) return;
      if (button.dataset.page) this.page = Number(button.dataset.page);
      else if (button.dataset.pageAction === 'prev') this.page--;
      else if (button.dataset.pageAction === 'next') this.page++;
      else if (button.dataset.pageAction === 'go') this.#jump();
    };
    #change = event => { if (event.target.matches('.ml-page-size select') && !this.hasAttribute('disabled')) this.pageSize = event.target.value; };
    #keydown = event => {
      if (this.hasAttribute('disabled') || !this.page) return;
      if (event.target.matches('.ml-page-jump input') && event.key === 'Enter' && !event.isComposing) {
        event.preventDefault(); this.#jump(); return;
      }
      if (!event.target.closest('.ml-page-links')) return;
      const step = getComputedStyle(this).direction === 'rtl' ? -1 : 1;
      const pages = { ArrowLeft: this.page - step, ArrowRight: this.page + step, Home: 1, End: this.pageCount };
      if (!Object.hasOwn(pages, event.key)) return;
      event.preventDefault();
      this.page = Math.max(1, Math.min(this.pageCount, pages[event.key]));
      this.#focusPage();
    };
  }
  customElements.define('ml-pagination', Pagination);
})();

(() => {
  'use strict';
  if (customElements.get('ml-data-table')) return;
  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  let nextTableId = 0;
  const generatedIds = new WeakMap();

  // Resolve a leaf heading through any spanning labels in earlier header rows.
  function columnOf(th) {
    const rows = th.parentElement.parentElement.rows, occupied = [];
    for (let i = 0; i < rows.length; i++) {
      let start = 0;
      for (const cell of rows[i].cells) {
        while (occupied[start] > i) start++;
        if (cell === th) return start;
        const end = start + cell.colSpan;
        for (; start < end; start++) occupied[start] = cell.rowSpan ? i + cell.rowSpan : rows.length;
      }
    }
    return -1;
  }
  function sortValue(row, index, type) {
    let end = 0;
    const cell = [...row.cells].find(field => { end += field.colSpan; return index < end; });
    if (!cell) return null;
    const raw = (cell.dataset.sortValue ?? cell.querySelector('time[datetime]')?.dateTime ?? cell.textContent).trim();
    if (!raw) return null;
    if (type === 'number' || type === 'date') {
      const value = type === 'number' ? Number(raw) : Date.parse(raw);
      return Number.isFinite(value) ? value : null;
    }
    return raw;
  }
  function addCheckbox(row, tag, label) {
    const cell = row.ownerDocument.createElement(tag);
    cell.className = 'ml-table-check';
    if (tag === 'th') cell.scope = 'col';
    const wrap = row.ownerDocument.createElement('label'), box = row.ownerDocument.createElement('input');
    box.type = 'checkbox'; box.setAttribute('aria-label', label);
    wrap.append(box); cell.append(wrap); row.prepend(cell);
    return cell;
  }

  // Keep the original SVG for foreground caustics, printing, and the handoff between strips.
  // Chrome transports the displacement bitmap with compositor updates, even for clipped tables.
  class TableRefraction {
    constructor(host, glass) {
      this.host = host;
      this.glass = glass;
      this.shape = glass.shape;
      this.pointer = glass.scene.pointer;
      this.tiles = new Map();
      this.events = new AbortController();
      this.scrolling = new Set();
      this.resize = new ResizeObserver(() => glass.scene.wake());
      this.source = new Image();
      this.source.onload = () => glass.scene.wake();
      this.source.src = glass.maps[0].getAttribute('href');
      this.filter = glass.displacement.parentNode.cloneNode(true);
      this.filter.id += '-viewport';
      this.map = this.filter.querySelector('feImage');
      this.bend = this.filter.querySelector('feDisplacementMap');
      glass.displacement.parentNode.after(this.filter);
      this.url = 'url("#' + this.filter.id + '")';
      const track = event => {
        for (let node = host; node; node = node.assignedSlot || node.parentNode || node.host) {
          if (node !== event.target) continue;
          if (event.type === 'scrollend') this.scrolling.delete(node);
          else this.scrolling.add(node);
          glass.scene.wake();
          break;
        }
      };
      const options = { capture: true, passive: true, signal: this.events.signal };
      for (let root = host.getRootNode(); root; root = root.host?.getRootNode()) {
        if ('onscrollend' in host.ownerDocument) {
          root.addEventListener('scroll', track, options);
          root.addEventListener('scrollend', track, options);
        } else if (root.host) {
          root.addEventListener('scroll', () => glass.scene.wake(), options);
        }
      }
    }

    useFull() {
      if (this.active) this.host.style.removeProperty('--ml-table-window');
      this.active = null;
    }

    remove() {
      this.useFull();
      this.glass.scene.win.clearTimeout(this.pointerTimer);
      this.source.onload = null;
      this.events.abort();
      this.resize.disconnect();
      this.tiles.clear();
      this.filter.remove();
    }

    // Pointer input can arrive much faster than the browser presents frames.
    // Schedule a single wake after the final change to restore the native grid.
    endPointer = () => {
      const win = this.glass.scene.win;
      const remaining = this.pointerUntil - win.performance.now();
      if (remaining > 0) {
        this.pointerTimer = win.setTimeout(this.endPointer, remaining);
      } else {
        this.pointerTimer = 0;
        this.glass.scene.wake();
      }
    };

    tile(first, last) {
      const key = first + '/' + last;
      if (this.tiles.has(key)) return this.tiles.get(key);
      const { naturalWidth: width, naturalHeight: height } = this.source;
      const canvas = this.host.ownerDocument.createElement('canvas');
      canvas.width = width;
      canvas.height = height * (last - first) / 16;
      const context = canvas.getContext('2d');
      context.drawImage(this.source, 0, height * first / 16, width, canvas.height, 0, 0, width, canvas.height);
      const image = new Image(), tile = { first, last, image, ready: false };
      image.src = canvas.toDataURL();
      if (this.tiles.size >= 8) this.tiles.delete(this.tiles.keys().next().value);
      this.tiles.set(key, tile);
      image.decode().then(() => {
        if (this.tiles.get(key) === tile) { tile.ready = true; this.glass.scene.wake(); }
      }, () => {});
      return tile;
    }

    update() {
      if (!this.source.complete || !this.source.naturalHeight || this.source.naturalHeight % 16) return;
      const host = this.host, win = host.ownerDocument.defaultView, box = host.getBoundingClientRect();
      const pointer = this.glass.light.mode === 'pointer' ? this.glass.scene.pointer : null;
      const moved = pointer && this.pointer && (pointer.x !== this.pointer.x || pointer.y !== this.pointer.y);
      this.pointer = pointer;
      if (!pointer && this.pointerTimer) {
        win.clearTimeout(this.pointerTimer);
        this.pointerTimer = 0;
      }
      let top = 0, bottom = win.innerHeight, clip = null;
      for (let el = host; el; el = el.assignedSlot || el.parentElement || el.getRootNode().host) {
        const style = win.getComputedStyle(el);
        // The original filter also handles rotated, scaled and perspective-transformed layouts.
        if (style.transform !== 'none' || style.rotate !== 'none' || style.scale !== 'none' || style.perspective !== 'none'
          || Number(style.zoom || 1) !== 1) {
          this.useFull();
          return;
        }
        if (el !== host && style.overflowY !== 'visible') {
          const bounds = el.getBoundingClientRect();
          top = Math.max(top, bounds.top);
          bottom = Math.min(bottom, bounds.bottom);
          clip ||= el;
        }
      }
      if (this.clip !== clip) {
        this.resize.disconnect();
        if (clip) this.resize.observe(clip);
        this.clip = clip;
      }
      const start = Math.max(0, top - box.top), end = Math.min(box.height, bottom - box.top);
      if (end <= start) { this.useFull(); return; }
      const unit = box.height / 16, guard = Math.max(128, end - start);
      // With display scaling, moving the bitmap origin can change interpolation at
      // the same texel. A power-of-two prefix keeps the native origin and scale.
      const hi = Math.min(16, Math.ceil((end + guard) / unit));
      let anchored = win.devicePixelRatio !== 1;
      if (anchored && hi > 4) {
        // The scrollport or its pointer light can move independently. The full
        // filter restores the native sampling grid once both have settled.
        const motion = !this.glass.scene.media.matches
          && win.getComputedStyle(host).getPropertyValue('--ml-motion-level').trim();
        if (motion !== 'high' && motion !== 'medium') { this.useFull(); return; }
        if (moved) {
          this.pointerUntil = win.performance.now() + 80;
          if (!this.pointerTimer) this.pointerTimer = win.setTimeout(this.endPointer, 80);
        }
        if (!this.scrolling.size && !(pointer && this.pointerTimer)) { this.useFull(); return; }
        anchored = false;
      }
      const lo = anchored ? 0 : Math.max(0, Math.floor((start - guard) / unit));
      // Use original texels and power-of-two scales so sampling keeps its pixel phase.
      const span = 2 ** Math.ceil(Math.log2(Math.max(2, hi - lo)));
      const first = anchored ? 0 : Math.max(0, Math.min(16 - span, Math.floor((lo + hi - span) / 2)));
      if (span >= 16 || !box.width) { this.useFull(); return; }
      const tile = this.tile(first, first + span);
      const scale = this.glass.displacement.getAttribute('scale');
      if (this.bend.getAttribute('scale') !== scale) this.bend.setAttribute('scale', scale);
      if (!tile.ready) {
        if (this.active && (start < this.active.first * unit || end > this.active.last * unit)) this.useFull();
        return;
      }
      if (this.active === tile && this.width === box.width && this.height === box.height) return;
      this.map.setAttribute('x', 0);
      this.map.setAttribute('y', unit * first);
      this.map.setAttribute('width', box.width);
      this.map.setAttribute('height', unit * span);
      this.map.setAttribute('href', tile.image.src);
      this.host.style.setProperty('--ml-table-window', this.url);
      this.active = tile;
      this.width = box.width;
      this.height = box.height;
    }
  }

  class DataTable extends GlassControl {
    static observedAttributes = ['selectable', 'sort-by', 'sort-direction', 'empty-text'];
    #table;
    #scroll;
    #empty;
    #hint;
    #pager;
    #rows = [];
    #onPage = [];
    #order = new WeakMap();
    #serial = 0;
    #sorted = false;
    #busy = false;
    #connected = false;
    #refraction;
    #resizes = new ResizeObserver(() => this.#overflow());
    #changes = new MutationObserver(records => {
      const sourceChanged = records.some(r =>
        (this.#table && this.#table.contains(r.target)) ||
        ((r.target === this || r.target === this.#scroll) && [...r.addedNodes, ...r.removedNodes].some(n =>
          n.nodeType === 1 && n.matches('table, .ml-table-scroll, ml-pagination, ml-empty-state'))));
      if (sourceChanged) this.refresh();
    });
    get table() { return this.#table; }
    get glassContent() { return this.#table; }
    updateGlassViewport(glass) {
      const eligible = glass?.layer.dataset.mlRenderer === 'webgl'
        && glass.layer.clientHeight > Math.max(2048, 4 * this.ownerDocument.defaultView.innerHeight);
      if (this.#refraction && (!eligible || this.#refraction.glass !== glass || this.#refraction.shape !== glass.shape)) {
        this.#refraction.remove();
        this.#refraction = null;
      }
      if (!eligible) return;
      this.#refraction ||= new TableRefraction(this, glass);
      this.#refraction.update();
    }
    get visibleRows() { return this.#onPage.slice(); }
    get selectedRows() {
      return this.#table ? [...this.#table.tBodies].flatMap(body => [...body.rows]).filter(row => row.hasAttribute('data-selected')) : [];
    }
    get sort() {
      const th = this.#headers().find(h => h.hasAttribute('aria-sort'));
      return th ? { key: this.#key(th), direction: th.getAttribute('aria-sort') } : { key: '', direction: 'none' };
    }
    connectedCallback() {
      this.#connected = true;
      this.style.removeProperty('--ml-table-window');
      super.connectedCallback();
      this.addEventListener('click', this.#click);
      this.addEventListener('change', this.#check);
      this.addEventListener('ml-page-change', this.#pageChange);
      this.refresh();
    }
    disconnectedCallback() {
      this.#connected = false;
      this.removeEventListener('click', this.#click);
      this.removeEventListener('change', this.#check);
      this.removeEventListener('ml-page-change', this.#pageChange);
      this.#changes.disconnect(); this.#resizes.disconnect(); this.#resizing = false;
      super.disconnectedCallback();
    }
    attributeChangedCallback(name, before, after) {
      if (this.#connected && !this.#busy && before !== after) this.refresh(name.startsWith('sort-'));
    }
    #part(name, tag) {
      let el = this.querySelector(':scope > .' + name);
      if (!el) { el = this.ownerDocument.createElement(tag); el.className = name; this.append(el); }
      return el;
    }
    #headers() {
      return this.#table?.tHead ? [...this.#table.tHead.rows].flatMap(row => [...row.cells]).filter(th => th.matches('th[data-sort]')) : [];
    }
    #key(th) {
      return th.dataset.key || String(columnOf(th) - Number(this.hasAttribute('selectable')));
    }
    #enhanceHead() {
      const head = this.#table.tHead;
      if (!head) return;
      for (const row of head.rows) {
        for (const th of row.cells) {
          const button = th.querySelector(':scope > button.ml-table-sort');
          if (!th.matches('th[data-sort]')) {
            if (button) { button.replaceWith(...button.childNodes); th.removeAttribute('aria-sort'); }
          } else if (!button) {
            const action = this.ownerDocument.createElement('button');
            action.type = 'button'; action.className = 'ml-table-sort';
            action.append(...th.childNodes); th.append(action);
          }
        }
      }
    }
    #prepareChecks(bodies) {
      const head = this.#table.tHead, selectable = this.hasAttribute('selectable');
      for (const row of head?.rows || []) {
        const cell = row.querySelector(':scope > th.ml-table-check');
        if (row === head.rows[0] && selectable) {
          (cell || addCheckbox(row, 'th', '选择本页全部记录')).rowSpan = head.rows.length;
        } else cell?.remove();
      }
      for (const body of bodies) {
        for (const row of body.rows) {
          let cell = row.querySelector(':scope > td.ml-table-check');
          if (!selectable) { cell?.remove(); continue; }
          cell ||= addCheckbox(row, 'td', '选择记录');
          const label = row.dataset.key || row.querySelector('th[scope="row"]')?.textContent.trim() || row.cells[1]?.textContent.trim();
          const box = cell.querySelector('input');
          box.setAttribute('aria-label', label ? '选择 ' + label : '选择记录');
          box.checked = row.hasAttribute('data-selected');
        }
      }
    }
    #sortRows(bodies) {
      const headers = this.#headers(), key = this.getAttribute('sort-by');
      const active = headers.find(th => this.#key(th) === key);
      const direction = this.getAttribute('sort-direction') === 'descending' ? 'descending' : 'ascending';
      for (const th of headers) {
        if (th === active) th.setAttribute('aria-sort', direction);
        else th.removeAttribute('aria-sort');
      }
      // Capture source order before sorting. Reuse the row nodes and their form controls.
      if (!active && !this.#sorted) { this.#order = new WeakMap(); this.#serial = 0; }
      const type = active?.dataset.sort;
      const index = active ? columnOf(active) : -1;
      const language = this.closest('[lang]')?.lang || this.ownerDocument.documentElement.lang;
      let collator;
      if (active && type !== 'number' && type !== 'date') {
        const options = { numeric: true, sensitivity: 'base' };
        try { collator = new Intl.Collator(language || undefined, options); }
        catch { collator = new Intl.Collator(undefined, options); }
      }
      for (const body of bodies) {
        const rows = [...body.rows];
        const records = rows.map(row => {
          if (!this.#order.has(row)) this.#order.set(row, ++this.#serial);
          return { row, order: this.#order.get(row), value: active ? sortValue(row, index, type) : null };
        });
        if (!active && !this.#sorted) continue;
        records.sort((a, b) => {
          if (a.value === null || b.value === null) return (a.value === null) - (b.value === null) || a.order - b.order;
          const difference = collator ? collator.compare(a.value, b.value) : a.value - b.value;
          return (direction === 'descending' ? -difference : difference) || a.order - b.order;
        });
        records.forEach(({ row }, i) => { if (body.rows[i] !== row) body.insertBefore(row, body.rows[i]); });
      }
      this.#sorted = !!active;
    }
    refresh(resetPage = false) {
      if (this.#busy || !this.isConnected) return;
      this.#busy = true; this.#changes.disconnect();
      try {
        const direct = this.querySelector(':scope > table');
        const table = direct || this.querySelector(':scope > .ml-table-scroll > table');
        const pager = this.querySelector(':scope > ml-pagination');
        this.#pager = pager;
        const previousScroll = this.#scroll;
        this.#scroll = this.#part('ml-table-scroll', 'div');
        const fallback = this.#part('ml-table-empty', 'p');
        const customEmpty = this.querySelector(':scope > ml-empty-state');
        this.#empty = customEmpty || fallback;
        this.#hint = this.#part('ml-table-hint', 'span');
        if (direct) this.#scroll.append(direct);
        if (customEmpty) {
          fallback.hidden = true;
          if (fallback.previousElementSibling !== customEmpty) fallback.before(customEmpty);
        } else {
          fallback.setAttribute('role', 'status');
          fallback.textContent = this.getAttribute('empty-text') || '暂无记录';
        }
        // Only move the footer when it is out of order, preserving keyboard focus.
        if (pager && (this.#hint.compareDocumentPosition(pager) & Node.DOCUMENT_POSITION_PRECEDING)) this.append(pager);
        if (this.#table !== table || this.#scroll !== previousScroll || !this.#resizing) {
          this.#resizes.disconnect(); this.#resizes.observe(this.#scroll);
          if (table) this.#resizes.observe(table);
          this.#resizing = true;
        }
        this.#table = table;
        this.#hint.textContent = '可横向滚动查看更多列';
        const bodies = table ? [...table.tBodies] : [];
        if (table) { this.#enhanceHead(); this.#prepareChecks(bodies); this.#sortRows(bodies); }
        this.#rows = bodies.filter(body => !body.hidden).flatMap(body => [...body.rows].filter(row => !row.hidden));
        if (pager) {
          if (table) {
            if (!table.id || (table.dataset.mlTableId === table.id && generatedIds.get(table) !== table.id)) {
              let id;
              do { id = 'ml-records-' + ++nextTableId; } while (table.getRootNode().getElementById(id));
              table.id = table.dataset.mlTableId = id;
              generatedIds.set(table, id);
            }
            if (pager.getAttribute('for') !== table.id) pager.setAttribute('for', table.id);
          }
          if (pager.total !== this.#rows.length || !pager.hasAttribute('total')) pager.total = this.#rows.length;
          if (resetPage && pager.page > 1) pager.page = 1;
        }
        this.#applyPage();
        this.#overflow();
      } finally {
        this.#busy = false;
        this.#changes.observe(this, { subtree: true, childList: true, characterData: true, attributes: true,
          attributeFilter: ['hidden', 'data-key', 'data-sort', 'data-sort-value', 'data-selected', 'datetime', 'rowspan', 'colspan'] });
      }
    }
    #resizing = false;
    #overflow() {
      if (!this.#scroll) return;
      const overflow = !!this.#table && this.#scroll.clientWidth > 0 && this.#scroll.scrollWidth > this.#scroll.clientWidth + 1;
      this.#hint.hidden = !overflow;
      if (overflow) {
        this.#scroll.tabIndex = 0; this.#scroll.setAttribute('role', 'region');
        this.#scroll.setAttribute('aria-label', (this.#table.caption?.textContent.trim() || this.#table.getAttribute('aria-label') || '数据表格') + '，可横向滚动');
      } else {
        for (const name of ['tabindex', 'role', 'aria-label']) this.#scroll.removeAttribute(name);
      }
    }
    #applyPage() {
      const state = this.#pager?.state;
      const first = state ? Math.max(0, state.start - 1) : 0, end = state ? state.end : this.#rows.length;
      this.#onPage = this.#rows.slice(first, end);
      this.#rows.forEach((row, i) => row.toggleAttribute('data-ml-page-hidden', i < first || i >= end));
      this.#empty.toggleAttribute('hidden', this.#rows.length > 0);
      this.#syncHeadCheck();
    }
    #syncHeadCheck() {
      const box = this.#table?.tHead?.querySelector('.ml-table-check input');
      if (!box) return;
      const count = this.#onPage.filter(row => row.hasAttribute('data-selected')).length;
      box.disabled = !this.#onPage.length;
      box.checked = count > 0 && count === this.#onPage.length;
      box.indeterminate = count > 0 && count < this.#onPage.length;
    }
    sortBy(key, direction = 'ascending') {
      if (direction !== 'none' && !this.#headers().some(th => this.#key(th) === String(key))) return;
      this.#busy = true;
      try {
        if (direction === 'none') { this.removeAttribute('sort-by'); this.removeAttribute('sort-direction'); }
        else { this.setAttribute('sort-by', key); this.setAttribute('sort-direction', direction === 'descending' ? direction : 'ascending'); }
      } finally { this.#busy = false; }
      this.refresh(true);
      this.dispatchEvent(new CustomEvent('ml-sort-change', { bubbles: true, composed: true, detail: this.sort }));
    }
    #click = event => {
      const button = event.target.closest('button.ml-table-sort');
      if (!button || button.closest('table') !== this.#table) return;
      const th = button.parentElement, current = th.getAttribute('aria-sort');
      this.sortBy(this.#key(th), current === 'ascending' ? 'descending' : current === 'descending' ? 'none' : 'ascending');
    };
    #pageChange = event => { if (event.target === this.#pager) this.#applyPage(); };
    #check = event => {
      const box = event.target;
      if (!box.matches('.ml-table-check input') || box.closest('table') !== this.#table) return;
      const row = box.closest('tr'), selected = box.checked;
      const rows = box.closest('thead') ? this.#onPage : [row];
      for (const item of rows) {
        item.toggleAttribute('data-selected', selected);
        item.querySelector(':scope > .ml-table-check input').checked = selected;
      }
      this.#syncHeadCheck();
      const all = this.selectedRows;
      this.dispatchEvent(new CustomEvent('ml-selection-change', { bubbles: true, composed: true,
        detail: { rows: all, keys: all.map(item => item.dataset.key).filter(Boolean) } }));
    };
  }
  customElements.define('ml-data-table', DataTable);
})();

(() => {
  'use strict';
  const key = Symbol.for('material-lib.navigation.v1');
  if (globalThis[key]) return;
  const generatedTitles = new WeakMap();

  function items(host, selector) {
    return [...host.querySelectorAll(selector)].filter(item => item.closest(host.localName) === host);
  }
  function available(item, boundary) {
    if (item.matches(':disabled, [aria-disabled="true"]')) return false;
    for (let node = item; node && node !== boundary; node = node.parentElement) {
      if (node.matches('[hidden], [inert], [aria-hidden="true"]')) return false;
    }
    return true;
  }
  function focusByKey(event, choices, vertical) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const position = choices.indexOf(event.target);
    if (position < 0) return;
    let index;
    if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = choices.length - 1;
    else {
      const arrows = vertical ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight'];
      let step = arrows.indexOf(event.key);
      if (step < 0) return;
      step = step === 0 ? -1 : 1;
      if (!vertical && getComputedStyle(event.currentTarget).direction === 'rtl') step *= -1;
      index = (position + step + choices.length) % choices.length;
    }
    event.preventDefault();
    choices[index].focus();
  }
  function modifiedLink(event, item) {
    return item.localName === 'a' && (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey);
  }
  function prepareItem(item, labelSelector) {
    if (item.localName === 'button' && !item.hasAttribute('type')) item.type = 'button';
    if (item.title && item.title !== generatedTitles.get(item)) return;
    const label = item.querySelector(labelSelector)?.textContent.trim() || '';
    if (item.title !== label) {
      if (label) item.title = label;
      else item.removeAttribute('title');
    }
    generatedTitles.set(item, label);
  }
  function emit(host, name, detail) {
    host.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }));
  }
  globalThis[key] = { items, available, focusByKey, modifiedLink, prepareItem, emit };
})();

(() => {
  'use strict';
  if (customElements.get('ml-toolbar')) return;
  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  const { items, available, focusByKey, modifiedLink, prepareItem, emit } = globalThis[Symbol.for('material-lib.navigation.v1')];
  const selector = 'button[data-action], a[href][data-action]';

  class MaterialToolbar extends GlassControl {
    static observedAttributes = ['orientation'];
    #current;
    #watch = new MutationObserver(records => {
      if (records.some(record => {
        const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
        if (target?.closest('svg, ml-icon, .ml-optical')) return false;
        return record.type === 'attributes' || target?.closest('.ml-tool-label') ||
          [...record.addedNodes, ...record.removedNodes].some(node => node.matches?.(selector + ', .ml-tool-label') || node.querySelector?.(selector));
      })) this.#sync();
    });
    get glassContent() { return this; }
    get orientation() { return this.getAttribute('orientation') === 'vertical' ? 'vertical' : 'horizontal'; }
    set orientation(value) { this.setAttribute('orientation', value); }
    attributeChangedCallback() { if (this.isConnected) this.setAttribute('aria-orientation', this.orientation); }
    connectedCallback() {
      super.connectedCallback();
      this.setAttribute('role', 'toolbar');
      this.setAttribute('aria-orientation', this.orientation);
      this.#sync();
      this.#watch.observe(this, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-action', 'href', 'disabled', 'aria-disabled', 'hidden', 'inert', 'aria-hidden'] });
      this.addEventListener('focusin', this.#focus);
      this.addEventListener('click', this.#click, true);
      this.addEventListener('keydown', this.#key);
    }
    disconnectedCallback() {
      this.#watch.disconnect();
      this.removeEventListener('focusin', this.#focus);
      this.removeEventListener('click', this.#click, true);
      this.removeEventListener('keydown', this.#key);
      super.disconnectedCallback();
    }
    #sync(preferred = this.#current) {
      const commands = items(this, selector);
      const enabled = commands.filter(el => available(el, this));
      this.#current = enabled.includes(preferred) ? preferred : enabled[0];
      for (const command of commands) {
        command.tabIndex = command === this.#current ? 0 : -1;
        prepareItem(command, '.ml-tool-label');
      }
      return enabled;
    }
    #focus = event => {
      if (event.target.matches(selector) && event.target.closest('ml-toolbar') === this) this.#sync(event.target);
    };
    #key = event => {
      if (event.target.closest('ml-toolbar') === this && !event.defaultPrevented) focusByKey(event, this.#sync(), this.orientation === 'vertical');
    };
    #click = event => {
      const item = event.target.closest?.(selector);
      if (!item || item.closest('ml-toolbar') !== this || event.defaultPrevented) return;
      if (!available(item, this)) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      if (modifiedLink(event, item)) return;
      this.#sync(item);
      let pressed = null;
      if (item.hasAttribute('aria-pressed')) {
        pressed = item.getAttribute('aria-pressed') !== 'true';
        item.setAttribute('aria-pressed', String(pressed));
      }
      emit(this, 'ml-toolbar-action', { action: item.dataset.action, item, pressed });
    };
  }
  customElements.define('ml-toolbar', MaterialToolbar);
})();

(() => {
  'use strict';
  if (customElements.get('ml-sidebar')) return;
  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  const { items, available, focusByKey, modifiedLink, prepareItem, emit } = globalThis[Symbol.for('material-lib.navigation.v1')];
  const selector = 'button[data-value], a[href][data-value]';
  let serial = 0;

  class MaterialSidebar extends GlassControl {
    static observedAttributes = ['value', 'collapsed', 'layout', 'label'];
    #nav;
    #toggle;
    #caption;
    #current;
    #narrow = false;
    #expanded = false;
    #reflecting = false;
    #container;
    #resize = new ResizeObserver(() => this.#layout());
    #watch = new MutationObserver(records => {
      const changed = records.some(record => {
        if (record.target === this) return [...record.addedNodes, ...record.removedNodes].some(node => node.localName === 'nav');
        const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
        return this.#nav?.contains(target) && !target.closest('svg, ml-icon');
      });
      if (changed) this.#sync();
    });
    get glassContent() { return this; }
    get value() { return this.getAttribute('value') ?? ''; }
    set value(value) { this.setAttribute('value', value ?? ''); }
    get collapsed() { return this.hasAttribute('collapsed'); }
    set collapsed(flag) { this.toggleAttribute('collapsed', Boolean(flag)); }
    get narrow() { return this.#narrow; }
    get expanded() { return this.#narrow ? this.#expanded : !this.collapsed; }
    connectedCallback() {
      super.connectedCallback();
      this.#toggle = this.querySelector(':scope > .ml-side-toggle');
      if (!this.#toggle) {
        this.#toggle = this.ownerDocument.createElement('button');
        this.#toggle.type = 'button';
        this.#toggle.className = 'ml-side-toggle';
        this.#toggle.innerHTML = '<span class="ml-side-symbol" aria-hidden="true"></span><span class="ml-side-caption"></span><span class="ml-side-chevron" aria-hidden="true"></span>';
        this.prepend(this.#toggle);
      }
      this.#caption = this.#toggle.querySelector('.ml-side-caption');
      this.#container = this.parentElement?.closest('[data-ml-sidebar-layout]');
      if (this.#container) this.#resize.observe(this.#container);
      this.ownerDocument.defaultView.addEventListener('resize', this.#layout);
      this.ownerDocument.addEventListener('pointerdown', this.#outside, true);
      this.addEventListener('keydown', this.#key);
      this.addEventListener('click', this.#click, true);
      this.#sync();
      this.#layout();
      this.#watch.observe(this, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['data-value', 'href', 'disabled', 'aria-disabled', 'hidden', 'inert', 'aria-hidden', 'aria-label'] });
    }
    disconnectedCallback() {
      this.#watch.disconnect();
      this.#resize.disconnect();
      this.ownerDocument.defaultView.removeEventListener('resize', this.#layout);
      this.ownerDocument.removeEventListener('pointerdown', this.#outside, true);
      this.removeEventListener('keydown', this.#key);
      this.removeEventListener('click', this.#click, true);
      this.#expanded = false;
      super.disconnectedCallback();
    }
    attributeChangedCallback(name, old, value) {
      if (!this.isConnected || !this.#toggle || this.#reflecting || old === value) return;
      if (name === 'layout') this.#layout();
      else this.#sync();
    }
    toggleNavigation() {
      if (this.#narrow) this.#expanded = !this.#expanded;
      else this.collapsed = !this.collapsed;
      this.#render();
      this.#notify();
    }
    closeNavigation(restoreFocus = false) {
      if (!this.#narrow || !this.#expanded) return;
      this.#expanded = false;
      if (restoreFocus) this.#toggle.focus({ preventScroll: true });
      this.#render();
      this.#notify();
    }
    #notify() { emit(this, 'ml-sidebar-toggle', { narrow: this.#narrow, collapsed: this.collapsed, expanded: this.expanded }); }
    #layout = () => {
      const layout = this.getAttribute('layout');
      const width = this.#container?.getBoundingClientRect().width ?? this.ownerDocument.documentElement.clientWidth;
      const narrow = layout === 'disclosure' || (layout !== 'inline' && width > 0 && width <= 560);
      if (this.#narrow !== narrow) {
        if (narrow && this.#nav?.contains(this.ownerDocument.activeElement)) this.#toggle.focus({ preventScroll: true });
        this.#narrow = narrow;
        this.#expanded = false;
      }
      this.#render();
    };
    #choices() { return this.#nav ? items(this, selector).filter(item => this.#nav.contains(item) && available(item, this.#nav)) : []; }
    #sync() {
      const nav = this.querySelector(':scope > nav');
      if (nav && nav !== this.#nav) {
        if (!nav.id || this.ownerDocument.getElementById(nav.id) !== nav) {
          let id;
          do { id = 'ml-side-nav-' + (++serial); } while (this.ownerDocument.getElementById(id));
          nav.id = id;
        }
        this.#toggle.setAttribute('aria-controls', nav.id);
      }
      this.#nav = nav;
      if (!nav) { this.#render(); return; }
      const choices = this.#choices();
      const selected = choices.find(el => el.dataset.value === this.value) ??
        choices.find(el => el.getAttribute('aria-current') === 'page') ?? choices[0];
      const previousValue = this.#current;
      this.#current = selected?.dataset.value ?? '';
      if (choices.length || previousValue) {
        this.#reflecting = true;
        if (this.value !== this.#current) this.value = this.#current;
        this.#reflecting = false;
      }
      for (const item of items(this, selector)) {
        if (item === selected) item.setAttribute('aria-current', 'page');
        else item.removeAttribute('aria-current');
        prepareItem(item, '.ml-side-label');
      }
      this.#render(selected);
      if (previousValue !== undefined && previousValue !== this.#current) {
        emit(this, 'ml-sidebar-change', { value: this.#current, previousValue, item: selected ?? null });
      }
    }
    #render(selected = this.#nav?.querySelector('[aria-current="page"]')) {
      if (!this.#toggle) return;
      this.toggleAttribute('data-ml-narrow', this.#narrow);
      const expanded = this.expanded;
      const label = this.getAttribute('label') || this.#nav?.getAttribute('aria-label') || '导航';
      const current = selected?.querySelector('.ml-side-label')?.textContent.trim() || selected?.getAttribute('aria-label') || selected?.textContent.trim();
      const caption = this.#narrow ? current || label : label;
      if (this.#caption.textContent !== caption) this.#caption.textContent = caption;
      const action = (expanded ? '收起' : '展开') + label + (this.#narrow && current ? '，当前为' + current : '');
      this.#toggle.title = action;
      this.#toggle.setAttribute('aria-label', action);
      this.#toggle.setAttribute('aria-expanded', String(expanded));
      if (this.#nav) this.#nav.toggleAttribute('hidden', this.#narrow && !expanded);
    }
    #key = event => {
      if (event.target.closest('ml-sidebar') !== this || event.defaultPrevented) return;
      if (event.key === 'Escape' && this.#narrow && this.#expanded) {
        event.preventDefault(); event.stopPropagation(); this.closeNavigation(true);
      } else focusByKey(event, this.#choices(), true);
    };
    #click = event => {
      if (event.target.closest?.('ml-sidebar') !== this || event.defaultPrevented) return;
      if (this.#toggle.contains(event.target)) { this.toggleNavigation(); return; }
      const item = event.target.closest?.(selector);
      if (!item || !this.#nav?.contains(item)) return;
      if (!available(item, this.#nav)) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      if (modifiedLink(event, item)) return;
      this.value = item.dataset.value;
      this.closeNavigation(true);
    };
    #outside = event => { if (!event.composedPath().includes(this)) this.closeNavigation(); };
  }
  customElements.define('ml-sidebar', MaterialSidebar);
})();

(() => {
  'use strict';
  if (customElements.get('ml-navigation-panel')) return;

  let sequence = 0;
  const normalize = value => (value || '').normalize('NFKC').toLowerCase().replace(/[\s/_-]+/g, '');
  const template = document.createElement('template');
  template.innerHTML = `
    <div class="ml-catalog-panel">
      <header class="ml-catalog-head">
        <button class="ml-catalog-back" type="button" hidden><span></span></button>
        <h2 class="ml-catalog-title" tabindex="-1"></h2>
        <button class="ml-catalog-find" type="button" aria-label="搜索全部条目" title="搜索全部条目" hidden></button>
        <button class="ml-catalog-dismiss" type="button" data-ml-dialog-close aria-label="关闭导航面板" title="关闭导航面板" hidden></button>
        <div class="ml-catalog-search">
          <span class="ml-catalog-glyph" aria-hidden="true"></span>
          <input type="search" aria-description="搜索所有层级，按上下方向键浏览结果。" autocomplete="off" spellcheck="false" enterkeyhint="go">
          <button class="ml-catalog-clear" type="button" aria-label="清除搜索" hidden></button>
        </div>
      </header>
      <div class="ml-catalog-viewport">
        <div class="ml-catalog-results">
          <span class="ml-catalog-count" role="status" aria-atomic="true"></span>
          <div class="ml-catalog-empty" hidden><p></p><button type="button">清除搜索</button></div>
        </div>
      </div>
    </div>`;
  const groupTemplate = document.createElement('template');
  groupTemplate.innerHTML = '<button class="ml-catalog-group" type="button"><span class="ml-catalog-name"></span><span class="ml-catalog-quantity" aria-hidden="true"></span></button>';

  function rank(fields, words) {
    const names = fields.slice(0, 3);
    const matches = values => words.every(word => values.some(value => value.includes(word)));
    if (names.includes(words.join(''))) return 0;
    if (matches(names)) return 1;
    if (matches(fields.slice(0, 5))) return 2;
    return matches(fields) ? 3 : Infinity;
  }

  // Sort the real rows so reading order, keyboard order and native link actions agree.
  function order(group, items) {
    let cursor = group.button ? group.button.nextElementSibling : group.element.firstElementChild;
    for (const { element } of items) {
      if (element.parentElement !== group.element) continue;
      if (cursor !== element) group.element.insertBefore(element, cursor);
      cursor = element.nextElementSibling;
    }
  }

  function restoreOrder(group) {
    order(group, group.items);
    for (const item of group.items) if (item.items) restoreOrder(item);
  }

  function mark(row, icon) {
    let glyph = row.querySelector(':scope > .ml-catalog-mark');
    if (!/^[a-z][a-z0-9-]*$/.test(icon || '')) { glyph?.remove(); return; }
    if (!glyph) {
      glyph = document.createElement('span');
      glyph.className = 'ml-catalog-mark';
      glyph.setAttribute('aria-hidden', 'true');
      row.prepend(glyph);
    }
    glyph.style.setProperty('--ml-entry-icon', 'var(--ml-catalog-icon-' + icon + ', var(--ml-catalog-icon-page))');
  }

  function readLeaf(element, path) {
    let copy = element.querySelector(':scope > .ml-catalog-copy');
    if (!copy) {
      copy = document.createElement('span');
      copy.className = 'ml-catalog-copy';
      const detail = element.querySelector(':scope > small');
      const name = document.createElement('span');
      name.className = 'ml-catalog-name';
      name.append(...[...element.childNodes].filter(node => node !== detail));
      copy.append(name);
      if (detail) copy.append(detail);
      element.append(copy);
    }
    const title = copy.querySelector('.ml-catalog-name').textContent.trim();
    let alias = copy.querySelector('.ml-catalog-alias');
    if (element.dataset.en) {
      if (!alias) {
        alias = document.createElement('span');
        alias.className = 'ml-catalog-alias'; alias.lang = 'en';
        alias.setAttribute('aria-hidden', 'true');
        copy.append(alias);
      }
      alias.textContent = element.dataset.en;
    } else alias?.remove();
    let context = copy.querySelector('.ml-catalog-context');
    if (!context) {
      context = document.createElement('span');
      context.className = 'ml-catalog-context';
      copy.append(context);
    }
    context.textContent = path.join(' › ');
    const link = element.matches('a[href]') ? element : null;
    if (!link) element.tabIndex = -1;
    const slug = link?.hash.slice(1) || link?.pathname.split('/').filter(Boolean).at(-1);
    const detail = copy.querySelector('small');
    const fields = [title, element.dataset.en, slug, path.join(' '), element.dataset.keywords,
      element.dataset.lead, detail?.textContent].map(normalize);
    mark(element, element.dataset.icon);
    element.classList.add('ml-catalog-leaf');
    return { element, title, fields, link, hasDetail: !!(detail || element.dataset.en) };
  }

  // Copy only the painted parts of a row. The departing page has no live controls or links.
  function snapshotRow(source) {
    const doc = source.ownerDocument;
    const row = doc.createElement(source.matches('a') ? 'a' : 'div');
    row.className = source.className;
    for (const name of ['data-icon', 'dir', 'aria-current']) {
      if (source.hasAttribute(name)) row.setAttribute(name, source.getAttribute(name));
    }
    for (const child of source.querySelectorAll(':scope > :is(.ml-catalog-mark, .ml-catalog-copy, .ml-catalog-name, .ml-catalog-quantity)')) {
      const copy = doc.createElement('span');
      copy.className = child.className;
      if (child.matches('.ml-catalog-mark')) copy.style.cssText = child.style.cssText;
      if (child.matches('.ml-catalog-copy')) {
        for (const field of child.children) {
          const text = doc.createElement(field.localName === 'small' ? 'small' : 'span');
          text.className = field.className;
          text.textContent = field.textContent;
          copy.append(text);
        }
      } else copy.textContent = child.textContent;
      row.append(copy);
    }
    return row;
  }

  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  class MaterialNavigationPanel extends GlassControl {
    #nav;
    #panel;
    #title;
    #back;
    #find;
    #query;
    #results;
    #empty;
    #status;
    #trigger;
    #tree;
    #groups = new Map();
    #leaves = [];
    #trail = [];
    #searchOpen = false;
    #searchScroll = null;
    #ranked = false;
    #ownsSurface = false;
    #slide;
    #observer = new MutationObserver(records => { if (this.#dataChanged(records)) this.refresh(); });

    get glassContent() { return this.#panel; }
    get #dialog() { return this.parentElement?.matches('ml-dialog > dialog') ? this.parentElement : null; }
    get #level() { return this.#groups.get(this.#trail.at(-1)?.section) || this.#tree; }
    get entries() {
      if (this.#dataChanged(this.#observer.takeRecords())) this.refresh();
      return this.#leaves.filter(item => item.link).map(({ link, title }) => ({ link, title }));
    }

    connectedCallback() {
      this.refresh();
      this.#ownsSurface = !this.#dialog;
      if (this.#ownsSurface) super.connectedCallback();
      for (const type of ['click', 'input', 'keydown']) this.addEventListener(type, this.#onEvent);
    }

    disconnectedCallback() {
      this.#observer.disconnect();
      this.#finishSlide();
      this.#releaseTrigger();
      for (const type of ['click', 'input', 'keydown']) this.removeEventListener(type, this.#onEvent);
      if (this.#ownsSurface) super.disconnectedCallback();
    }

    #releaseTrigger() {
      this.#trigger?.setAttribute('aria-expanded', 'false');
      this.#trigger = null;
    }

    showModal(trigger, { focusSearch = !matchMedia('(pointer: coarse)').matches } = {}) {
      const dialog = this.#dialog;
      if (!dialog || dialog.open || !this.#panel) return;
      this.#releaseTrigger();
      this.#trigger = trigger;
      this.reset();
      const dismiss = this.#panel.querySelector('.ml-catalog-dismiss');
      this.#query.autofocus = focusSearch;
      dismiss.autofocus = !focusSearch;
      dialog.parentElement.showModal(trigger);
      this.#query.autofocus = dismiss.autofocus = false;
      trigger?.setAttribute('aria-expanded', 'true');
      dialog.addEventListener('close', () => {
        if (dialog.open) return;
        this.#finishSlide();
        this.#releaseTrigger();
      }, { once: true });
      if (focusSearch) this.focusSearch();
    }

    #observe() {
      if (!this.isConnected) return;
      this.#observer.observe(this, { childList: true, attributes: true, attributeFilter: ['label', 'search-label'] });
      if (this.#nav) this.#observer.observe(this.#nav, { subtree: true, childList: true, characterData: true,
        attributes: true, attributeFilter: ['href', 'data-en', 'data-lead', 'data-keywords', 'data-icon'] });
    }

    #dataChanged(records) {
      return records.some(record => record.target !== this || record.type === 'attributes' ||
        [...record.addedNodes].some(node => node.localName === 'nav') || [...record.removedNodes].includes(this.#panel));
    }

    #mount(nav) {
      this.#panel = template.content.firstElementChild.cloneNode(true);
      this.#title = this.#panel.querySelector('.ml-catalog-title');
      this.#back = this.#panel.querySelector('.ml-catalog-back');
      this.#find = this.#panel.querySelector('.ml-catalog-find');
      this.#results = this.#panel.querySelector('.ml-catalog-results');
      this.#query = this.#panel.querySelector('input');
      this.#empty = this.#panel.querySelector('.ml-catalog-empty');
      this.#status = this.#panel.querySelector('[role="status"]');
      this.append(this.#panel);
      this.#empty.before(nav);
    }

    #readGroup(element, title, path, button = null) {
      const group = { element, title, button, items: [], count: 0 };
      this.#groups.set(element, group);
      for (const child of element.querySelectorAll(':scope > :is(section, a[href], p)')) {
        if (child.localName !== 'section') {
          const leaf = readLeaf(child, path);
          group.items.push(leaf);
          this.#leaves.push(leaf);
          group.count++;
          continue;
        }
        const heading = child.querySelector(':scope > :is(h2, h3, h4, h5, h6)');
        if (!heading) { child.hidden = true; continue; }
        const name = heading.textContent.trim();
        heading.hidden = true;
        let row = child.querySelector(':scope > .ml-catalog-group');
        if (!row) { row = groupTemplate.content.firstElementChild.cloneNode(true); heading.after(row); }
        const icon = child.dataset.icon || heading.querySelector('use')?.getAttribute('href')?.match(/^#i-([\w-]+)$/)?.[1] || 'folder';
        row.dataset.icon = icon;
        mark(row, icon);
        row.querySelector('.ml-catalog-name').textContent = name;
        row.setAttribute('aria-controls', this.#nav.id);
        const section = this.#readGroup(child, name, [...path, name], row);
        row.querySelector('.ml-catalog-quantity').textContent = section.count;
        row.setAttribute('aria-description', section.count + ' 个条目');
        group.items.push(section);
        group.count += section.count;
      }
      return group;
    }

    refresh() {
      this.#finishSlide();
      this.#observer.disconnect();
      if (this.#panel?.parentElement !== this) {
        const previous = this.querySelector(':scope > .ml-catalog-panel');
        const source = previous?.querySelector('.ml-catalog-results > nav');
        if (source) { source.removeAttribute('id'); previous.replaceWith(source); }
        this.#panel = this.#nav = null;
      }
      const next = this.querySelector(':scope > nav');
      if (next) {
        if (this.#panel) this.#nav.replaceWith(next);
        else this.#mount(next);
        this.#nav = next;
        if (!next.id || this.ownerDocument.getElementById(next.id) !== next) {
          let id;
          do { id = 'ml-catalog-links-' + ++sequence; } while (this.ownerDocument.getElementById(id));
          next.id = id;
        }
        this.#query.setAttribute('aria-controls', next.id);
        this.#trail = []; this.#searchOpen = false; this.#searchScroll = null;
        this.#query.value = ''; this.#ranked = false;
      }
      this.#groups.clear();
      this.#leaves = [];
      if (!this.#nav) { this.#tree = null; this.#observe(); return; }
      if (this.#ranked) restoreOrder(this.#tree);
      this.#tree = this.#readGroup(this.#nav, this.getAttribute('label') || '导航面板', []);
      let rows = 1;
      for (const group of this.#groups.values()) {
        let units = 0;
        for (const item of group.items) {
          if (item.items) units += Number(item.count > 0);
          else units += item.hasDetail ? 1.25 : 1;
        }
        rows = Math.max(rows, units);
      }
      this.#panel.style.setProperty('--ml-nav-row-count', rows);
      const lost = this.#trail.findIndex(frame => !this.#groups.get(frame.section)?.count ||
        frame.section.parentElement !== frame.parent);
      if (lost >= 0) this.#trail.length = lost;
      if (!this.#trail.length) this.#searchOpen = false;
      this.#panel.querySelector('.ml-catalog-dismiss').hidden = !this.#dialog;
      const prompt = this.getAttribute('search-label') || '搜索全部条目';
      this.#query.placeholder = prompt;
      this.#query.setAttribute('aria-label', prompt);
      this.#find.setAttribute('aria-label', prompt);
      this.#find.title = prompt;
      this.#render();
    }

    #render() {
      if (this.#dataChanged(this.#observer.takeRecords())) { this.refresh(); return; }
      this.#observer.disconnect();
      const level = this.#level;
      const path = new Set(this.#trail.map(frame => frame.section));
      const words = this.#query.value.trim().split(/\s+/).map(normalize).filter(Boolean);
      const searching = words.length > 0;
      let matches = 0;
      if (!searching && this.#ranked) restoreOrder(this.#tree);
      const visit = group => {
        const scores = [];
        let best = Infinity;
        for (const item of group.items) {
          let score = Infinity;
          if (item.items) {
            score = visit(item);
            const row = !searching && group === level && item.count > 0;
            item.button.hidden = !row;
            item.element.hidden = searching ? !Number.isFinite(score) : !row && !path.has(item.element);
          } else {
            if (searching) score = rank(item.fields, words);
            item.element.hidden = searching ? !Number.isFinite(score) : group !== level;
            if (searching && !item.element.hidden) matches++;
          }
          if (searching) { scores.push({ element: item.element, score }); best = Math.min(best, score); }
        }
        if (searching) order(group, scores.sort((a, b) => a.score - b.score));
        return best;
      };
      visit(this.#tree);
      this.#ranked = searching;
      const nested = level !== this.#tree;
      this.#panel.toggleAttribute('data-nested', nested);
      this.#panel.toggleAttribute('data-search-open', nested && this.#searchOpen);
      this.#panel.toggleAttribute('data-searching', searching);
      this.#title.textContent = level.title;
      this.#back.hidden = !nested;
      if (nested) {
        const parent = this.#searchOpen ? level : this.#groups.get(level.element.parentElement);
        this.#back.firstElementChild.textContent = parent.title;
        this.#back.setAttribute('aria-label', '返回' + parent.title);
      }
      this.#find.hidden = !nested || this.#searchOpen;
      this.#query.parentElement.hidden = nested && !this.#searchOpen;
      this.#panel.querySelector('.ml-catalog-clear').hidden = !this.#query.value;
      const empty = searching ? matches === 0 : level.count === 0;
      this.#nav.hidden = empty;
      this.#empty.hidden = !empty;
      this.#empty.querySelector('p').textContent = searching ? '没有找到匹配项' : '暂无导航条目';
      this.#empty.querySelector('button').hidden = !searching;
      const status = searching ? '找到 ' + matches + ' 项' : level.title + '，' + level.count + ' 个条目';
      if (this.#status.textContent !== status) this.#status.textContent = status;
      this.#observe();
    }

    #finishSlide() {
      if (!this.#slide) return;
      const { previous, animations } = this.#slide;
      this.#slide = null;
      const viewport = previous.parentElement;
      previous.remove();
      viewport?.removeAttribute('data-step');
      for (const animation of animations) animation.cancel();
    }

    #captureSlide(forward) {
      const height = this.getAttribute('density') === 'compact' ? this.#panel.offsetHeight : 0;
      const listHeight = this.#results.clientHeight;
      this.#finishSlide();
      const win = this.ownerDocument.defaultView;
      const style = win.getComputedStyle(this.#panel);
      const travel = style.getPropertyValue('--ml-travel').trim();
      const duration = Math.min(240, parseFloat(travel) * (travel.endsWith('ms') ? 1 : 1000));
      if (!(duration > 0) || !this.#results.animate || !listHeight ||
          win.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
      const previous = this.ownerDocument.createElement('div');
      previous.className = 'ml-catalog-results ml-catalog-outgoing';
      if (height) previous.style.blockSize = listHeight + 'px';
      previous.inert = true;
      previous.setAttribute('aria-hidden', 'true');
      const list = this.ownerDocument.createElement('div');
      list.className = 'ml-catalog-list';
      for (const item of this.#level.items) {
        const row = item.button || item.element;
        if (!row.hidden) list.append(snapshotRow(row));
      }
      previous.append(list);
      return { previous, forward, height, duration, easing: style.getPropertyValue('--ml-front-ease').trim() || 'ease-out',
        sign: style.direction === 'rtl' ? -1 : 1, scroll: this.#results.scrollTop };
    }

    #playSlide(slide) {
      if (!slide) return;
      const { previous, forward, height, duration, easing, sign, scroll } = slide;
      const viewport = this.#results.parentElement;
      viewport.dataset.step = forward ? 'forward' : 'back';
      viewport.append(previous);
      previous.scrollTop = scroll;
      const shift = amount => ({ transform: 'translateX(' + amount * sign + '%)' });
      const options = { duration, easing };
      const animations = [
        this.#results.animate([shift(forward ? 100 : -28), shift(0)], options),
        previous.animate([shift(0), shift(forward ? -28 : 100)], options),
      ];
      if (height) {
        const target = this.#panel.offsetHeight;
        if (height !== target) {
          animations.push(this.#panel.animate([{ blockSize: height + 'px' }, { blockSize: target + 'px' }], options));
        }
      }
      this.#slide = { previous, animations };
      const frames = globalThis[Symbol.for('material-lib.motion-frames.v1')];
      for (const animation of animations) frames.track(animation, this);
      const finish = () => {
        if (this.#slide?.previous === previous) this.#finishSlide();
      };
      animations[0].finished.then(finish, finish);
    }

    #enter(section) {
      const slide = this.#captureSlide(true);
      this.#trail.push({ section, parent: this.#level.element, scroll: this.#results.scrollTop });
      this.#searchOpen = false; this.#searchScroll = null; this.#query.value = '';
      this.#render();
      this.#results.scrollTop = 0;
      this.#title.focus({ preventScroll: true });
      this.#playSlide(slide);
    }

    #clearSearch(collapse) {
      const scroll = this.#searchScroll ?? 0;
      this.#query.value = '';
      if (collapse) this.#searchOpen = false;
      this.#searchScroll = this.#searchOpen ? scroll : null;
      this.#finishSlide();
      this.#render();
      this.#results.scrollTop = scroll;
      (this.#query.parentElement.hidden ? this.#find : this.#query).focus({ preventScroll: true });
    }

    #goBack() {
      if (this.#query.value || this.#searchOpen) { this.#clearSearch(true); return true; }
      const frame = this.#trail.at(-1);
      if (!frame) return false;
      const slide = this.#captureSlide(false);
      this.#trail.pop();
      this.#render();
      this.#results.scrollTop = frame.scroll;
      this.#groups.get(frame.section)?.button.focus({ preventScroll: true });
      this.#playSlide(slide);
      return true;
    }

    focusSearch() {
      if (!this.#nav) return;
      if (this.#trail.length && !this.#searchOpen) {
        this.#searchOpen = true;
        this.#searchScroll = this.#results.scrollTop;
        this.#finishSlide();
        this.#render();
      }
      this.#query.focus({ preventScroll: true });
    }

    reset({ reveal = false } = {}) {
      if (this.#dataChanged(this.#observer.takeRecords())) this.refresh();
      if (!this.#nav) return;
      this.#trail = [];
      this.#query.value = ''; this.#searchOpen = false; this.#searchScroll = null;
      this.#finishSlide();
      const link = reveal && this.#leaves.find(item => item.link?.getAttribute('aria-current') === 'page')?.link;
      for (let section = link?.parentElement; section && section !== this.#nav; section = section.parentElement) {
        this.#trail.unshift({ section, parent: section.parentElement, scroll: 0 });
      }
      this.#render();
      this.#results.scrollTop = 0;
      if (link) link.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    }

    #onEvent = event => {
      const target = event.target;
      if (!this.#tree || target.closest('ml-navigation-panel, ml-catalog') !== this) return;
      if (event.type === 'input') {
        if (target !== this.#query) return;
        this.#finishSlide();
        if (this.#query.value && this.#searchScroll === null) this.#searchScroll = this.#results.scrollTop;
        this.#render();
        this.#results.scrollTop = this.#query.value ? 0 : this.#searchScroll ?? 0;
        if (!this.#query.value && !this.#searchOpen) this.#searchScroll = null;
        return;
      }
      const button = target.closest('button');
      if (event.type === 'click') {
        if (event.defaultPrevented) return;
        if (button === this.#back) this.#goBack();
        else if (button === this.#find) this.focusSearch();
        else if (button?.matches('.ml-catalog-group')) this.#enter(button.parentElement);
        else if (button?.matches('.ml-catalog-clear') || this.#empty.contains(button)) this.#clearSearch(false);
        const link = target.closest('a[href]');
        if (link && this.#nav.contains(link) && this.#dialog?.open && event.button === 0 &&
            !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey &&
            !link.hasAttribute('download') && (!link.target || link.target.toLowerCase() === '_self')) this.#dialog.close();
        return;
      }
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229 ||
          event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      const key = event.key, fromSearch = target === this.#query;
      if (key === 'Escape') {
        if (this.#goBack()) event.preventDefault();
        else if (fromSearch && this.#dialog?.open) {
          event.preventDefault();
          if (this.#dialog.dispatchEvent(new Event('cancel', { cancelable: true }))) this.#dialog.close('cancel');
        }
        return;
      }
      if (!fromSearch && (key === 'ArrowLeft' || key === 'ArrowRight')) {
        const forward = key === (getComputedStyle(this).direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight');
        if (!forward && this.#goBack()) event.preventDefault();
        else if (forward && button?.matches('.ml-catalog-group')) { event.preventDefault(); this.#enter(button.parentElement); }
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter'].includes(key) ||
          (fromSearch && (key === 'Home' || key === 'End')) || (!fromSearch && key === 'Enter')) return;
      const rows = [...this.#nav.querySelectorAll(':is(.ml-catalog-group, .ml-catalog-leaf):not([hidden])')]
        .filter(row => !row.closest('[hidden]'));
      if (key === 'Enter') {
        event.preventDefault();
        if (this.#ranked && rows[0]?.matches('a[href]')) rows[0].click();
        return;
      }
      if (!rows.length) return;
      event.preventDefault();
      const index = rows.indexOf(target.closest('.ml-catalog-group, .ml-catalog-leaf'));
      const next = key === 'Home' ? 0 : key === 'End' || (index < 0 && key === 'ArrowUp') ? rows.length - 1
        : key === 'ArrowDown' ? Math.min(index + 1, rows.length - 1) : index - 1;
      (next < 0 ? (this.#query.parentElement.hidden ? this.#back : this.#query) : rows[next]).focus();
    };
  }

  customElements.define('ml-navigation-panel', MaterialNavigationPanel);
  if (!customElements.get('ml-catalog')) customElements.define('ml-catalog', class extends MaterialNavigationPanel {});
})();

(() => {
  'use strict';
  if (customElements.get('ml-tabs')) return;

  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  const { available, focusByKey, emit } = globalThis[Symbol.for('material-lib.navigation.v1')];
  const listSelector = '[data-ml-tablist]';
  const panelSelector = '[data-panel]';
  const tabSelector = 'button[data-tab]';
  const sideWidth = 480;
  let nextId = 0;

  function ensureId(element, prefix) {
    const root = element.getRootNode();
    if (element.id && !/\s/.test(element.id) && root.querySelectorAll('#' + CSS.escape(element.id)).length === 1) return element.id;
    let id;
    do { id = 'ml-' + prefix + '-' + ++nextId; } while (root.getElementById(id));
    element.id = id;
    return id;
  }

  // Reveal a tab within its own scroll container without moving the page.
  function reveal(list, tab, vertical) {
    const frame = list.getBoundingClientRect();
    if (!frame.width || !frame.height) return;
    const rect = tab.getBoundingClientRect();
    const start = vertical ? rect.top - frame.top - list.clientTop : rect.left - frame.left - list.clientLeft;
    const end = start + (vertical ? rect.height - list.clientHeight : rect.width - list.clientWidth);
    const distance = start < 0 ? start : Math.max(0, end);
    if (distance) {
      if (vertical) list.scrollTop += distance;
      else list.scrollLeft += distance;
    }
  }

  class Tabs extends GlassControl {
    static observedAttributes = ['value', 'orientation', 'activation'];
    #list;
    #marker;
    #panels = [];
    #pairs = new Map();
    #current;
    #currentPanel;
    #connected = false;
    #sizes = new ResizeObserver(() => this.#layout(true));
    #changes = new MutationObserver(records => {
      const changed = records.some(({ target, type, attributeName }) => {
        if (type === 'childList') return target === this || target === this.#list;
        if (target.parentElement === this.#list && target.matches('button')) return true;
        return target.parentElement === this && ['data-ml-tablist', 'data-panel', 'id'].includes(attributeName);
      });
      if (changed) this.refresh();
    });

    get glassContent() { return this; }
    get value() { return this.#current?.dataset.tab ?? ''; }
    set value(value) {
      if (value == null) this.removeAttribute('value');
      else this.setAttribute('value', value);
    }
    get panel() { return this.#currentPanel ?? null; }
    get orientation() { return this.hasAttribute('data-ml-vertical') ? 'vertical' : 'horizontal'; }

    connectedCallback() {
      super.connectedCallback();
      this.#connected = true;
      this.addEventListener('click', this.#click);
      this.addEventListener('focusin', this.#focus);
      this.addEventListener('focusout', this.#blur);
      this.refresh();
      this.#changes.observe(this, { subtree: true, childList: true, attributes: true,
        attributeFilter: ['data-ml-tablist', 'data-tab', 'data-panel', 'id', 'disabled', 'hidden', 'inert', 'aria-hidden', 'aria-disabled'] });
    }

    disconnectedCallback() {
      this.#connected = false;
      this.removeEventListener('click', this.#click);
      this.removeEventListener('focusin', this.#focus);
      this.removeEventListener('focusout', this.#blur);
      this.#list?.removeEventListener('keydown', this.#key);
      this.#list = null;
      this.#sizes.disconnect();
      this.#changes.disconnect();
      super.disconnectedCallback();
    }

    attributeChangedCallback(name, before, after) {
      if (!this.#connected || before === after) return;
      if (name === 'orientation') this.#layout();
      else this.#render();
    }

    refresh() {
      if (!this.#connected) return;
      const list = this.querySelector(':scope > ' + listSelector);
      if (list !== this.#list) {
        this.#list?.removeEventListener('keydown', this.#key);
        this.#list = list;
        this.#marker = list?.querySelector(':scope > .ml-tabs-marker');
        if (list) {
          list.setAttribute('role', 'tablist');
          list.tabIndex = -1;
          if (!this.#marker) {
            this.#marker = this.ownerDocument.createElement('span');
            this.#marker.className = 'ml-tabs-marker';
            this.#marker.setAttribute('aria-hidden', 'true');
            list.prepend(this.#marker);
          }
          list.addEventListener('keydown', this.#key);
        }
      }

      this.#panels = [...this.querySelectorAll(':scope > ' + panelSelector)];
      const byKey = new Map();
      for (const panel of this.#panels) {
        if (panel.dataset.panel && !byKey.has(panel.dataset.panel)) byKey.set(panel.dataset.panel, panel);
      }
      const claimed = new Set();
      this.#pairs.clear();
      this.#sizes.disconnect();
      this.#sizes.observe(this);
      if (list) this.#sizes.observe(list);
      for (const tab of list?.querySelectorAll(':scope > ' + tabSelector) ?? []) {
        const panel = byKey.get(tab.dataset.tab);
        const linked = panel && !claimed.has(panel);
        tab.toggleAttribute('data-ml-tab-orphan', !linked);
        if (!linked) {
          tab.tabIndex = -1;
          tab.removeAttribute('aria-controls');
          tab.removeAttribute('aria-selected');
          continue;
        }
        tab.type = 'button';
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-controls', ensureId(panel, 'tabpanel'));
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-labelledby', ensureId(tab, 'tab'));
        if (!panel.hasAttribute('tabindex')) panel.tabIndex = 0;
        claimed.add(panel);
        this.#pairs.set(tab, panel);
        this.#sizes.observe(tab);
      }
      this.#render();
    }

    select(value) {
      const tab = this.#choices().find(item => item.dataset.tab === String(value));
      if (!tab) return false;
      this.#activate(tab);
      return true;
    }

    #choices() { return [...this.#pairs.keys()].filter(tab => available(tab, this.#list)); }

    #stops(target) {
      for (const tab of this.#pairs.keys()) tab.tabIndex = tab === target ? 0 : -1;
    }

    #render() {
      const choices = this.#choices();
      const requested = this.getAttribute('value');
      const next = choices.find(tab => tab.dataset.tab === requested) ?? choices[0];
      const panel = this.#pairs.get(next);
      const focus = this.getRootNode().activeElement;
      const focusedTab = choices.includes(focus) ? focus : null;
      const focusWillHide = this.#currentPanel && this.#currentPanel !== panel && this.#currentPanel.contains(focus);
      const moveTabFocus = focus?.matches(tabSelector) && focus.parentElement === this.#list &&
        (!focusedTab || this.getAttribute('activation') !== 'manual');
      this.#current = next;
      this.#currentPanel = panel;
      for (const tab of this.#pairs.keys()) tab.setAttribute('aria-selected', String(tab === next));
      this.#stops(moveTabFocus ? next : focusedTab ?? next);
      this.#layout();
      if (next && (focusWillHide || (moveTabFocus && next !== focusedTab))) next.focus({ preventScroll: true });
      for (const page of this.#panels) page.toggleAttribute('hidden', page !== panel);
      if (next && !focusedTab) reveal(this.#list, next, this.orientation === 'vertical');
    }

    #layout(fromResize = false) {
      const vertical = this.getAttribute('orientation') === 'vertical' && this.clientWidth >= sideWidth;
      const changed = this.hasAttribute('data-ml-vertical') !== vertical;
      this.toggleAttribute('data-ml-vertical', vertical);
      if (!this.#list) return;
      this.#list.setAttribute('aria-orientation', this.orientation);
      const tab = this.#current;
      const visible = tab?.offsetWidth > 0 && tab.offsetHeight > 0;
      this.#marker.toggleAttribute('hidden', !visible);
      if (visible) {
        const { offsetLeft, offsetTop, offsetWidth, offsetHeight } = tab;
        const style = this.#marker.style;
        style.setProperty('--ml-tab-x', offsetLeft + 'px');
        style.setProperty('--ml-tab-y', offsetTop + 'px');
        style.setProperty('--ml-tab-w', offsetWidth + 'px');
        style.setProperty('--ml-tab-h', offsetHeight + 'px');
        if (changed || fromResize) {
          const focus = this.getRootNode().activeElement;
          const inList = this.#pairs.has(focus) && available(focus, this.#list);
          reveal(this.#list, inList ? focus : tab, vertical);
        }
      }
    }

    #activate(tab) {
      const previousValue = this.value;
      this.value = tab.dataset.tab;
      if (this.value !== previousValue) emit(this, 'ml-tab-change', { value: this.value, previousValue, tab, panel: this.panel });
    }

    #click = event => {
      const tab = event.target.closest?.(tabSelector);
      if (tab?.parentElement !== this.#list || event.defaultPrevented) return;
      if (!this.#pairs.has(tab) || !available(tab, this.#list)) {
        event.preventDefault();
        return;
      }
      this.#activate(tab);
    };

    #focus = event => {
      const tab = event.target;
      if (!this.#pairs.has(tab) || !available(tab, this.#list)) return;
      this.#stops(tab);
      reveal(this.#list, tab, this.orientation === 'vertical');
      if (this.getAttribute('activation') !== 'manual' && tab !== this.#current) this.#activate(tab);
    };

    #blur = event => {
      if (this.#pairs.has(event.target) && !this.#pairs.has(event.relatedTarget)) this.#stops(this.#current);
    };

    #key = event => {
      if (event.defaultPrevented || event.isComposing) return;
      focusByKey(event, this.#choices(), this.orientation === 'vertical');
    };
  }

  customElements.define('ml-tabs', Tabs);
})();

(() => {
  'use strict';
  if (customElements.get('ml-breadcrumb')) return;

  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  const { placePopup } = globalThis[Symbol.for('material-lib.select-picker.v1')];
  let nextId = 0;

  class BreadcrumbPanel extends GlassControl {
    get glassContent() { return this.matches(':popover-open') ? this.querySelector(':scope > ol') : null; }
  }
  customElements.define('ml-breadcrumb-panel', BreadcrumbPanel);

  class Breadcrumb extends GlassControl {
    #trail;
    #overflow;
    #button;
    #panel;
    #links;
    #events;
    #frame = 0;
    #geometry;
    #sizes = new ResizeObserver(() => this.refresh());
    #markup = new MutationObserver(records => {
      if (records.some(record => !(record.target.parentElement ?? record.target).closest?.('.ml-optical') &&
        (record.type !== 'childList' || [...record.addedNodes, ...record.removedNodes].some(node => !node.matches?.('.ml-optical'))))) this.refresh();
    });

    get glassContent() { return this.querySelector(':scope > nav'); }
    get open() { return this.#panel?.matches(':popover-open') ?? false; }

    connectedCallback() {
      super.connectedCallback();
      this.#events = new AbortController();
      this.ownerDocument.fonts?.addEventListener('loadingdone', this.#fontChange, { signal: this.#events.signal });
      this.refresh();
      if (this.#overflow) this.#sizes.observe(this.#trail);
    }

    disconnectedCallback() {
      this.close();
      this.#events.abort();
      this.#sizes.disconnect();
      this.#markup.disconnect();
      super.disconnectedCallback();
    }

    #fontChange = () => this.refresh();

    #mount(trail) {
      this.close();
      this.#panel?.removeEventListener('toggle', this.#toggle);
      this.#panel?.removeEventListener('click', this.#linkClick);
      this.#sizes.disconnect();
      this.#trail = trail;
      this.#overflow = this.#button = this.#panel = this.#links = null;
      if (!trail) return;
      trail.setAttribute('role', 'list');
      if (typeof this.showPopover !== 'function') return;
      const root = this.getRootNode();
      const overflow = trail.querySelector(':scope > .ml-breadcrumb-overflow') ?? this.ownerDocument.createElement('li');
      overflow.className = 'ml-breadcrumb-overflow';
      if (!overflow.firstElementChild) {
        overflow.hidden = true;
        overflow.innerHTML = `<button type="button" aria-label="更多层级" aria-expanded="false"></button>
          <ml-breadcrumb-panel popover="auto"><ol role="list" aria-label="折叠的上级页面"></ol></ml-breadcrumb-panel>`;
        trail.append(overflow);
      }
      this.#overflow = overflow;
      this.#button = overflow.querySelector('button');
      this.#panel = overflow.querySelector('ml-breadcrumb-panel');
      this.#links = this.#panel.querySelector('ol');
      let id;
      do { id = 'ml-breadcrumb-path-' + ++nextId; } while (root.getElementById(id));
      this.#panel.id = id;
      this.#button.setAttribute('popovertarget', id);
      this.#button.setAttribute('aria-controls', id);
      this.#panel.addEventListener('toggle', this.#toggle);
      this.#panel.addEventListener('click', this.#linkClick);
      this.#sizes.observe(trail);
    }

    #items() {
      return [...this.#trail.children].flatMap(item => item === this.#overflow ? [...this.#links.children] : [item])
        .filter(item => item.localName === 'li');
    }

    #widths(items) {
      // Measure the full labels in the trail style without changing focus or the open popover.
      const doc = this.ownerDocument;
      const probe = doc.createElement('div');
      probe.className = 'ml-breadcrumb-measure';
      probe.setAttribute('aria-hidden', 'true');
      probe.inert = true;
      const list = doc.createElement('ol');
      const more = this.#overflow.cloneNode(false);
      more.hidden = false;
      more.append(this.#button.cloneNode(true));
      for (const item of items) {
        const copy = item.cloneNode(true);
        copy.removeAttribute('id');
        for (const child of copy.querySelectorAll('[id]')) child.removeAttribute('id');
        list.append(copy);
      }
      list.append(more);
      probe.append(list);
      this.glassContent.append(probe);
      const widths = [...list.children].map(item => item.getBoundingClientRect().width);
      probe.remove();
      return widths;
    }

    refresh() {
      if (!this.isConnected) return;
      this.#markup.disconnect();
      try {
        const trail = this.querySelector(':scope > nav > ol');
        if (trail !== this.#trail || (this.#overflow && this.#overflow.parentElement !== trail)) this.#mount(trail);
        this.toggleAttribute('data-ml-breadcrumb-ready', Boolean(this.#overflow));
        if (!this.#overflow || !trail.clientWidth) return;
        const items = this.#items();
        const visible = items.filter(item => !item.hidden);
        const lastFolded = this.#folded(visible, trail.clientWidth).at(-1);
        const folded = lastFolded ? items.slice(items.indexOf(visible[0]) + 1, items.indexOf(lastFolded) + 1) : [];
        this.#layout(items, visible[0], folded);
      } finally {
        this.#markup.observe(this, { subtree: true, childList: true, characterData: true, attributes: true,
          attributeFilter: ['hidden', 'aria-current', 'href', 'dir', 'data-home'] });
      }
    }

    #folded(items, capacity) {
      if (items.length < 3) return [];
      const widths = this.#widths(items);
      const trigger = widths.pop();
      if (widths.reduce((sum, width) => sum + width, 0) <= capacity + .5) return [];
      let firstKept = items.length - 1;
      let spare = capacity - widths[0] - trigger - widths[firstKept];
      while (firstKept > 2 && spare >= widths[firstKept - 1]) spare -= widths[--firstKept];
      return items.slice(1, firstKept);
    }

    #layout(items, root, folded) {
      const same = folded.length === this.#links.children.length && folded.every((item, index) => this.#links.children[index] === item);
      this.#geometry = '';
      if (same && this.#overflow.hidden === !folded.length && (!folded.length || this.#overflow.previousElementSibling === root)) return;
      const active = this.getRootNode().activeElement;
      const onTrail = this.#trail.contains(active);
      const activeItem = onTrail && active.closest('li');
      this.close();
      const inline = items.filter(item => !folded.includes(item));
      inline.splice(inline.indexOf(root) + 1, 0, this.#overflow);
      let next = null;
      for (const item of inline.toReversed()) {
        if (item.parentElement !== this.#trail || item.nextElementSibling !== next) this.#trail.insertBefore(item, next);
        next = item;
      }
      this.#links.replaceChildren(...folded);
      this.#overflow.hidden = !folded.length;
      if (!onTrail) return;
      if (folded.includes(activeItem)) this.#button.focus({ preventScroll: true });
      else if (active === this.#button && !folded.length) {
        inline.findLast(item => item !== this.#overflow && !item.hidden && item.querySelector('a[href]'))
          ?.querySelector('a[href]').focus({ preventScroll: true });
      } else if (active !== this.getRootNode().activeElement) active.focus({ preventScroll: true });
    }

    #linkClick = event => {
      if (event.target.closest('a[href]')) this.close();
    };

    #toggle = event => {
      if (event.target !== this.#panel) return;
      const win = this.ownerDocument.defaultView;
      win.cancelAnimationFrame(this.#frame);
      this.#button.setAttribute('aria-expanded', String(this.open));
      this.#geometry = '';
      if (this.open) this.#position();
      else this.#panel.removeAttribute('data-side');
    };

    #position = () => {
      if (!this.open || !this.isConnected) return;
      this.#geometry = placePopup(this, this.#button, this.#panel, this.#geometry);
      if (!this.#geometry) { this.close(); return; }
      this.#frame = this.ownerDocument.defaultView.requestAnimationFrame(this.#position);
    };

    close() {
      if (this.open) this.#panel.hidePopover();
      this.ownerDocument.defaultView?.cancelAnimationFrame(this.#frame);
      this.#button?.setAttribute('aria-expanded', 'false');
      this.#panel?.removeAttribute('data-side');
    }
  }
  customElements.define('ml-breadcrumb', Breadcrumb);
})();

(() => {
  'use strict';
  if (customElements.get('ml-steps')) return;

  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];

  class Steps extends GlassControl {
    static observedAttributes = ['current', 'finished', 'orientation'];
    #items = [];
    #active;
    #sizes = new ResizeObserver(() => this.#layout());
    #changes = new MutationObserver(records => {
      if (records.some(({ target, type, addedNodes, removedNodes }) =>
        target === this ? type === 'childList' && [...addedNodes, ...removedNodes].some(node => node.localName === 'ol')
          : !target.closest('.ml-optical'))) this.refresh();
    });

    get glassContent() { return this.querySelector(':scope > ol'); }
    get current() { return this.#active?.dataset.step ?? ''; }
    set current(value) {
      if (value == null || value === '') this.removeAttribute('current');
      else this.setAttribute('current', String(value));
    }

    connectedCallback() {
      super.connectedCallback();
      this.addEventListener('click', this.#request);
      this.refresh();
      this.#sizes.observe(this);
      this.#changes.observe(this, { subtree: true, childList: true, attributes: true,
        attributeFilter: ['data-step', 'data-complete', 'data-error', 'hidden'] });
    }

    disconnectedCallback() {
      this.removeEventListener('click', this.#request);
      this.#sizes.disconnect();
      this.#changes.disconnect();
      super.disconnectedCallback();
    }

    attributeChangedCallback(name, before, after) {
      if (!this.isConnected || before === after) return;
      if (name === 'orientation') this.#layout();
      else this.refresh();
    }

    refresh() {
      const list = this.glassContent;
      const entries = [...(list?.querySelectorAll(':scope > li[data-step]') ?? [])];
      this.#items = entries.filter(item => !item.hidden);
      const key = this.getAttribute('current');
      this.#active = this.hasAttribute('finished') ? null : this.#items.find(item => item.dataset.step === key) ?? this.#items[0];
      if (list && list.getAttribute('role') !== 'list') list.setAttribute('role', 'list');
      let number = 0;
      for (const item of entries) {
        const control = item.querySelector(':scope > :is(button, a, span, div)');
        if (!control) continue;
        const active = item === this.#active;
        if (active) {
          if (control.getAttribute('aria-current') !== 'step') control.setAttribute('aria-current', 'step');
        } else if (control.getAttribute('aria-current') === 'step') control.removeAttribute('aria-current');
        if (item.hidden) continue;
        if (control.localName === 'button' && !control.hasAttribute('type')) control.type = 'button';
        const status = item.hasAttribute('data-error') ? 'error'
          : active ? 'current' : item.hasAttribute('data-complete') ? 'complete' : 'pending';
        item.dataset.mlStepState = status;
        this.#decorate(control, ++number, status);
      }
      this.#layout();
    }

    #decorate(control, number, status) {
      let marker = control.querySelector(':scope > .ml-step-marker');
      let description = control.querySelector(':scope > .ml-step-status');
      if (!marker) {
        marker = this.ownerDocument.createElement('span');
        marker.className = 'ml-step-marker';
        marker.setAttribute('aria-hidden', 'true');
        control.prepend(marker);
      }
      if (!description) {
        description = this.ownerDocument.createElement('span');
        description.className = 'ml-step-status';
        control.append(description);
      }
      const label = { complete: '，已完成', error: '，有错误', pending: '，待开始', current: '' }[status];
      if (marker.textContent !== String(number)) marker.textContent = String(number);
      if (description.textContent !== label) description.textContent = label;
    }

    #layout() {
      const list = this.glassContent;
      if (!list) return;
      const mode = this.getAttribute('orientation');
      const width = list.clientWidth;
      const minWidth = Math.max(27, this.#items.length * 7) * parseFloat(getComputedStyle(this).fontSize);
      const vertical = mode === 'vertical' || (mode !== 'horizontal' && width > 0 && width < minWidth);
      this.toggleAttribute('data-ml-steps-vertical', vertical);
    }

    #request = event => {
      if (event.defaultPrevented) return;
      const button = event.target.closest('button');
      const item = button?.parentElement;
      if (!this.#items.includes(item) || button.matches(':disabled, [aria-disabled="true"]') || item === this.#active) return;
      this.dispatchEvent(new CustomEvent('ml-step-request', {
        bubbles: true, composed: true, detail: { step: item.dataset.step, from: this.current },
      }));
    };
  }
  customElements.define('ml-steps', Steps);
})();

(() => {
  'use strict';
  if (customElements.get('ml-tree')) return;

  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  const { emit } = globalThis[Symbol.for('material-lib.navigation.v1')];
  const nodeSelector = 'li[data-node]';
  const excluded = '[hidden], [inert], [aria-hidden="true"]';
  const normalize = label => label.trim().normalize('NFKC').toLocaleLowerCase();
  let nextId = 0;

  class MaterialTree extends GlassControl {
    static observedAttributes = ['value'];
    #root;
    #nodes = new Map();
    #keys = new Map();
    #visible = [];
    #selected;
    #stop;
    #labelRefs = new WeakMap();
    #prefix = '';
    #typedAt = 0;
    #watch = new MutationObserver(records => {
      if (records.some(({ target, type, attributeName, addedNodes, removedNodes }) => {
        if (target === this) return type === 'childList' && [...addedNodes, ...removedNodes].some(node => node.localName === 'ul');
        if (attributeName === 'hidden' && target.localName === 'ul') return false;
        return target.closest('ml-tree') === this && !target.closest('.ml-optical');
      })) this.refresh();
    });

    get glassContent() { return this.querySelector(':scope > ul'); }
    get value() { return this.#selected?.key ?? ''; }
    set value(value) {
      if (value == null || value === '') this.removeAttribute('value');
      else this.setAttribute('value', String(value));
    }
    get selectedItem() { return this.#selected?.node ?? null; }

    connectedCallback() {
      super.connectedCallback();
      this.addEventListener('click', this.#click);
      this.addEventListener('keydown', this.#key);
      this.addEventListener('focusin', this.#focus);
      this.addEventListener('focusout', this.#blur);
      this.refresh();
      this.#watch.observe(this, { childList: true, subtree: true, attributes: true,
        attributeFilter: ['data-node', 'data-open', 'hidden', 'inert', 'aria-hidden', 'aria-disabled', 'id'] });
    }

    disconnectedCallback() {
      this.#watch.disconnect();
      this.removeEventListener('click', this.#click);
      this.removeEventListener('keydown', this.#key);
      this.removeEventListener('focusin', this.#focus);
      this.removeEventListener('focusout', this.#blur);
      super.disconnectedCallback();
    }

    attributeChangedCallback(name, before, after) {
      if (this.isConnected && before !== after) this.refresh();
    }

    #read(group, level, parent) {
      const entries = [];
      for (const node of group.children) {
        if (!node.matches(nodeSelector) || node.matches(excluded)) continue;
        const row = node.querySelector(':scope > .ml-tree-row');
        const label = row?.querySelector(':scope > .ml-tree-label');
        const key = node.dataset.node;
        if (!label || !key || this.#keys.has(key)) continue;
        const children = node.querySelector(':scope > ul');
        const disabled = parent?.disabled || node.getAttribute('aria-disabled') === 'true';
        const entry = { node, row, label, key, group: children, parent, level, disabled };
        entries.push(entry);
        this.#nodes.set(node, entry);
        this.#keys.set(key, entry);
        entry.children = children ? this.#read(children, level + 1, entry) : [];
      }
      for (const [index, entry] of entries.entries()) {
        entry.node.setAttribute('aria-posinset', String(index + 1));
        entry.node.setAttribute('aria-setsize', String(entries.length));
      }
      return entries;
    }

    #decorate(entry) {
      const { node, row, label, group, level, disabled } = entry;
      node.setAttribute('role', 'treeitem');
      node.setAttribute('aria-level', String(level));
      if (node !== this.#stop && node.getAttribute('tabindex') !== '-1') node.tabIndex = -1;
      node.toggleAttribute('data-ml-tree-disabled', Boolean(disabled));
      row.style.setProperty('--ml-tree-depth', String(level - 1));
      if (!label.id) {
        const scope = label.getRootNode();
        let id;
        do { id = 'ml-tree-label-' + ++nextId; } while (scope.getElementById(id));
        label.id = id;
      }
      const reference = node.getAttribute('aria-labelledby');
      if ((!reference && !node.hasAttribute('aria-label')) || reference === this.#labelRefs.get(node)) {
        node.setAttribute('aria-labelledby', label.id);
        this.#labelRefs.set(node, label.id);
      }
      if (!row.querySelector(':scope > .ml-tree-toggle')) row.insertAdjacentHTML('afterbegin',
        '<span class="ml-tree-toggle" aria-hidden="true"></span><span class="ml-tree-icon" aria-hidden="true"></span>');
      if (group) group.setAttribute('role', 'group');
    }

    #reveal(entry) {
      for (let ancestor = entry.parent; ancestor; ancestor = ancestor.parent) ancestor.node.setAttribute('data-open', '');
    }

    refresh() {
      this.#root = this.glassContent;
      this.#nodes.clear();
      this.#keys.clear();
      if (this.#root) {
        this.#root.setAttribute('role', 'tree');
        this.#root.tabIndex = -1;
        if (!this.#root.hasAttribute('aria-label') && !this.#root.hasAttribute('aria-labelledby')) {
          this.#root.setAttribute('aria-label', '目录');
        }
        this.#read(this.#root, 1);
      }
      const previous = this.#selected;
      const requested = this.#keys.get(this.getAttribute('value'));
      this.#selected = requested && !requested.disabled ? requested : null;
      if (this.#selected && this.#selected.node !== previous?.node) this.#reveal(this.#selected);
      for (const entry of this.#nodes.values()) this.#decorate(entry);
      this.#render();
      if (previous !== undefined && previous?.key !== this.#selected?.key) {
        emit(this, 'ml-tree-change', { value: this.value, previousValue: previous?.key ?? '', item: this.selectedItem });
      }
    }

    #render() {
      const active = this.#nodes.get(this.getRootNode().activeElement);
      this.#visible = [];
      for (const entry of this.#nodes.values()) {
        const { node, parent, children, disabled } = entry;
        entry.expanded = children.length > 0 && node.hasAttribute('data-open');
        entry.visible = !parent || (parent.visible && parent.expanded);
        if (entry.visible && !disabled) this.#visible.push(entry);
        if (children.length) node.setAttribute('aria-expanded', String(entry.expanded));
        else node.removeAttribute('aria-expanded');
        if (disabled) node.removeAttribute('aria-selected');
        else node.setAttribute('aria-selected', String(entry === this.#selected));
      }
      const stop = this.#nearest(active ?? this.#selected);
      this.#setStop(stop);
      const focusMoved = active && stop !== active;
      if (focusMoved) (stop?.node ?? this.#root).focus({ preventScroll: true });
      for (const { group, expanded } of this.#nodes.values()) {
        if (group && group.hidden === expanded) group.hidden = !expanded;
      }
      if (focusMoved) stop?.row.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    #nearest(entry) {
      for (let candidate = entry; candidate; candidate = candidate.parent) {
        if (candidate.visible && !candidate.disabled) return candidate;
      }
      return this.#visible[0];
    }

    #setStop(entry) {
      if (this.#stop && this.#stop !== entry?.node) this.#stop.tabIndex = -1;
      this.#stop = entry?.node;
      if (this.#stop && this.#stop.tabIndex !== 0) this.#stop.tabIndex = 0;
    }

    focus(options) { this.#stop?.focus(options); }

    select(value) {
      const entry = this.#keys.get(String(value));
      if (!entry || entry.disabled) return false;
      if (entry === this.#selected) {
        this.#reveal(entry);
        this.#render();
      } else this.value = entry.key;
      return true;
    }

    setExpanded(value, expanded) {
      const entry = this.#keys.get(String(value));
      if (!entry?.children.length || entry.disabled) return false;
      const next = Boolean(expanded);
      if (entry.expanded === next) return true;
      entry.node.toggleAttribute('data-open', next);
      this.#render();
      emit(this, 'ml-tree-toggle', { value: entry.key, expanded: next, item: entry.node });
      return true;
    }

    setAllExpanded(expanded) {
      for (const entry of this.#nodes.values()) {
        if (entry.children.length && !entry.disabled) entry.node.toggleAttribute('data-open', Boolean(expanded));
      }
      this.#render();
    }

    #focus = event => {
      const entry = this.#nodes.get(event.target);
      if (entry?.visible && !entry.disabled) this.#setStop(entry);
    };

    #blur = event => {
      if (!this.contains(event.relatedTarget)) {
        queueMicrotask(() => {
          if (!this.contains(this.getRootNode().activeElement)) this.#setStop(this.#nearest(this.#selected));
        });
      }
    };

    #click = event => {
      if (event.defaultPrevented || event.button !== 0) return;
      const entry = this.#nodes.get(event.target.closest(nodeSelector));
      if (!entry?.visible || entry.disabled) return;
      const onNode = event.target === entry.node;
      if (!onNode && !entry.row.contains(event.target)) return;
      entry.node.focus({ preventScroll: true });
      if (entry.children.length && (onNode || event.target.closest('.ml-tree-toggle'))) {
        this.setExpanded(entry.key, !entry.expanded);
      } else this.select(entry.key);
    };

    #key = event => {
      if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
      const entry = this.#nodes.get(event.target);
      if (!entry?.visible || entry.disabled) return;
      const index = this.#visible.indexOf(entry);
      let target;
      switch (event.key) {
        case 'ArrowUp': target = this.#visible[index - 1]; break;
        case 'ArrowDown': target = this.#visible[index + 1]; break;
        case 'Home': target = this.#visible[0]; break;
        case 'End': target = this.#visible.at(-1); break;
        case 'ArrowRight':
          if (entry.expanded) target = this.#visible.find(item => item.parent === entry);
          else this.setExpanded(entry.key, true);
          break;
        case 'ArrowLeft':
          if (entry.expanded) this.setExpanded(entry.key, false);
          else target = entry.parent;
          break;
        case 'Enter':
        case ' ': this.select(entry.key); break;
        default:
          if (event.key.length !== 1) return;
          target = this.#typeAhead(event.key, index);
          if (!target) return;
      }
      event.preventDefault();
      if (target) {
        target.node.focus({ preventScroll: true });
        target.row.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    };

    #typeAhead(key, index) {
      const char = normalize(key);
      const now = Date.now();
      this.#prefix = now - this.#typedAt < 550 && this.#prefix !== char ? this.#prefix + char : char;
      this.#typedAt = now;
      const options = this.#visible.slice(index + 1).concat(this.#visible.slice(0, index + 1));
      return options.find(entry => normalize(entry.label.textContent).startsWith(this.#prefix));
    }
  }
  customElements.define('ml-tree', MaterialTree);
})();

(() => {
  'use strict';
  if (customElements.get('ml-media-viewer')) return;

  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  const linkSelector = 'a[data-media][href]';
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const point = event => ({ x: event.clientX, y: event.clientY });
  const center = ([a, b]) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const distance = ([a, b]) => Math.hypot(a.x - b.x, a.y - b.y);

  class MediaSurface extends GlassControl {
    get glassContent() { return this.querySelector('.ml-media-stage'); }
  }
  customElements.define('ml-media-surface', MediaSurface);

  const icon = (action, glyph, label) =>
    '<button class="ml-media-icon" type="button" data-action="' + action + '" data-icon="' + glyph +
    '" title="' + label + '" aria-label="' + label + '"></button>';

  class MediaViewer extends HTMLElement {
    static observedAttributes = ['value'];
    #items = [];
    #item;
    #media;
    #view;
    #dialog;
    #stage;
    #list;
    #status;
    #events;
    #loadEvents;
    #scale = 1;
    #x = 0;
    #y = 0;
    #pointers = new Map();
    #sizes = new ResizeObserver(() => { if (this.#image) this.#draw(); });
    #watch = new MutationObserver(records => {
      if (records.some(({ target, type, addedNodes, removedNodes }) => target === this
        ? type === 'childList' && [...addedNodes, ...removedNodes].some(node => node.localName === 'ul')
        : this.#list?.contains(target))) this.refresh();
    });

    get value() { return this.#item?.key ?? ''; }
    set value(value) {
      if (value == null || value === '') this.removeAttribute('value');
      else this.setAttribute('value', String(value));
    }
    get selectedItem() { return this.#item?.link ?? null; }
    get media() { return this.#media ?? null; }
    get open() { return Boolean(this.#dialog?.open); }
    get #image() { return this.#media?.localName === 'img' && this.#media.naturalWidth && !this.#media.hidden ? this.#media : null; }

    connectedCallback() {
      if (!this.#view) this.#mount();
      this.#events = new AbortController();
      const signal = this.#events.signal;
      this.addEventListener('click', this.#click, { signal });
      this.addEventListener('keydown', this.#key, { signal });
      this.#dialog.addEventListener('close', () => {
        if (!this.open) this.#restore(true);
      }, { signal });
      this.#stage.addEventListener('wheel', this.#wheel, { passive: false, signal });
      this.#stage.addEventListener('dblclick', this.#doubleClick, { signal });
      this.#stage.addEventListener('pointerdown', this.#press, { signal });
      this.#stage.addEventListener('pointermove', this.#move, { signal });
      for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        this.#stage.addEventListener(name, this.#release, { signal });
      }
      this.#sizes.observe(this.#stage);
      this.refresh();
      this.#watch.observe(this, { childList: true, characterData: true, subtree: true, attributes: true,
        attributeFilter: ['href', 'data-media', 'data-kind', 'data-title', 'data-alt', 'data-poster', 'data-captions', 'hidden'] });
    }

    disconnectedCallback() {
      this.#watch.disconnect();
      this.#sizes.disconnect();
      this.#events.abort();
      this.close(false);
      this.pause();
      this.#endGesture();
    }

    attributeChangedCallback(name, before, after) {
      if (this.isConnected && this.#view && before !== after) this.refresh();
    }

    #mount() {
      this.#view = this.ownerDocument.createElement('ml-media-surface');
      this.#view.innerHTML = `
        <div class="ml-media-heading">
          <div class="ml-media-heading-text"><strong data-media-title></strong><small data-media-count aria-live="polite"></small></div>
          ${icon('enlarge', 'expand', '放大预览')}
        </div>
        <div class="ml-media-stage" role="group" tabindex="0">
          <div class="ml-media-status">
            <p role="status"></p><button type="button" data-action="retry" hidden>重试</button>
          </div>
        </div>
        <div class="ml-media-toolbar">
          <div class="ml-media-switcher" role="group" aria-label="切换媒体">
            ${icon('previous', 'chevron-left', '上一项')}${icon('next', 'chevron-right', '下一项')}
          </div>
          <div class="ml-media-zoom" role="group" aria-label="缩放图片" hidden>
            ${icon('zoom-out', 'zoom-out', '缩小图片')}
            <button type="button" data-action="fit" aria-label="恢复适应" title="恢复适应">100%</button>
            ${icon('zoom-in', 'zoom', '放大图片')}
          </div>
        </div>`;
      this.#dialog = this.ownerDocument.createElement('dialog');
      this.#dialog.className = 'ml-media-dialog';
      this.#stage = this.#view.querySelector('.ml-media-stage');
      this.#status = this.#stage.querySelector('.ml-media-status');
      this.prepend(this.#view);
      this.append(this.#dialog);
      this.#expanded(false);
    }

    #button(action) { return this.#view.querySelector('[data-action="' + action + '"]'); }

    refresh() {
      this.#list = this.querySelector(':scope > ul');
      const seen = new Set();
      this.#items = [];
      for (const link of this.#list?.querySelectorAll(':scope > li > ' + linkSelector) ?? []) {
        const data = link.dataset, key = data.media;
        if (!key || seen.has(key) || !link.getAttribute('href').trim() || link.hidden || link.parentElement.hidden) continue;
        seen.add(key);
        this.#items.push({
          link, key, url: link.href, kind: data.kind === 'video' ? 'video' : 'image',
          title: data.title || link.textContent.trim() || key, alt: data.alt,
          poster: data.poster || '', captions: data.captions || '',
        });
      }
      const previous = this.#item;
      this.#item = this.#items.find(item => item.key === this.getAttribute('value')) ?? this.#items[0] ?? null;
      const changed = this.#item
        ? ['key', 'url', 'kind', 'poster', 'captions'].some(prop => this.#item[prop] !== previous?.[prop])
        : previous !== null;
      if (changed) this.#load();
      this.#readout();
      if (changed && this.selectedItem && this.#list.clientWidth) {
        const box = this.selectedItem.getBoundingClientRect(), frame = this.#list.getBoundingClientRect();
        this.#list.scrollLeft += box.left < frame.left ? box.left - frame.left : Math.max(0, box.right - frame.right);
      }
      if (previous !== undefined && previous?.key !== this.#item?.key) {
        this.dispatchEvent(new CustomEvent('ml-media-change', { bubbles: true, composed: true,
          detail: { value: this.value, previousValue: previous?.key ?? '', item: this.selectedItem } }));
      }
    }

    #readout() {
      const item = this.#item, index = this.#items.indexOf(item);
      const focused = this.getRootNode().activeElement;
      const title = item?.title ?? '媒体预览';
      const count = item ? (item.kind === 'video' ? '视频' : '图片') + ' · ' + (index + 1) + ' / ' + this.#items.length : '';
      const heading = this.#view.querySelector('[data-media-title]');
      const badge = this.#view.querySelector('[data-media-count]');
      if (heading.textContent !== title) heading.textContent = title;
      if (badge.textContent !== count) badge.textContent = count;
      badge.hidden = !count;
      this.#dialog.setAttribute('aria-label', title + ' · 放大预览');
      this.#stage.setAttribute('aria-label', title);
      this.#view.querySelector('.ml-media-toolbar').hidden = !item;
      this.#view.querySelector('.ml-media-zoom').hidden = item?.kind !== 'image';
      this.#button('previous').disabled = index <= 0;
      this.#button('next').disabled = index < 0 || index + 1 >= this.#items.length;
      this.#button('enlarge').disabled = !item;
      for (const link of this.#list?.querySelectorAll(linkSelector) ?? []) {
        if (link === item?.link) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      }
      if (this.#media?.localName === 'img') this.#media.alt = item.alt ?? title;
      if (this.#media?.localName === 'video') this.#media.setAttribute('aria-label', title);
      this.#zoomReadout();
      if (focused && this.#view.contains(focused) && (focused.matches(':disabled') || focused.closest('[hidden]'))) {
        this.#stage.focus({ preventScroll: true });
      }
    }

    #message(message, error = false) {
      this.#status.hidden = !message;
      this.#status.querySelector('p').textContent = message;
      this.#status.toggleAttribute('data-error', error);
      this.#button('retry').hidden = !error;
    }

    #load() {
      this.#endGesture();
      this.#loadEvents?.abort();
      this.pause();
      if (this.#media?.localName === 'video') {
        this.#media.removeAttribute('src');
        this.#media.load();
      }
      this.#media?.remove();
      this.#media = null;
      this.#scale = 1;
      this.#x = this.#y = 0;
      this.#stage.removeAttribute('data-zoomed');
      const item = this.#item;
      this.#stage.dataset.kind = item?.kind ?? '';
      this.#message(item ? '正在加载' + (item.kind === 'video' ? '视频' : '图片') + '…' : '暂无可预览的媒体');
      if (!item) return;
      const isVideo = item.kind === 'video';
      const media = this.ownerDocument.createElement(isVideo ? 'video' : 'img');
      this.#media = media;
      this.#loadEvents = new AbortController();
      const options = { signal: this.#loadEvents.signal };
      media.addEventListener(isVideo ? 'loadedmetadata' : 'load', () => {
        this.#message('');
        if (!isVideo) this.#draw();
      }, options);
      media.addEventListener('error', () => {
        media.hidden = true;
        this.#message('无法加载' + (isVideo ? '视频' : '图片'), true);
        this.#zoomReadout();
      }, options);
      if (isVideo) {
        media.controls = true;
        media.playsInline = true;
        media.preload = 'metadata';
        media.setAttribute('aria-label', item.title);
        if (item.poster) media.poster = item.poster;
        if (item.captions) {
          const track = this.ownerDocument.createElement('track');
          track.kind = 'captions';
          track.label = '字幕';
          track.srclang = this.ownerDocument.documentElement.lang || 'zh-CN';
          track.src = item.captions;
          media.append(track);
        }
      } else {
        media.alt = item.alt ?? item.title;
        media.draggable = false;
        media.decoding = 'async';
      }
      this.#stage.prepend(media);
      media.src = item.url;
    }

    select(value) {
      const key = String(value);
      if (!this.#items.some(item => item.key === key)) return false;
      this.value = key;
      return true;
    }

    #step(direction) {
      const target = this.#items[this.#items.indexOf(this.#item) + direction];
      if (target) this.select(target.key);
    }

    pause() { if (this.#media?.localName === 'video') this.#media.pause(); }

    show() {
      if (!this.isConnected || this.open || !this.#item || typeof this.#dialog.showModal !== 'function') return false;
      this.#endGesture();
      this.#dialog.append(this.#view);
      try { this.#dialog.showModal(); }
      catch { this.#restore(false); return false; }
      this.#expanded(true);
      this.#button('enlarge').focus({ preventScroll: true });
      return true;
    }

    close(restoreFocus = true) {
      if (this.open) this.#dialog.close();
      this.#restore(restoreFocus);
    }

    #restore(focus) {
      if (this.#view.parentElement !== this.#dialog) return;
      this.#endGesture();
      this.prepend(this.#view);
      this.#expanded(false);
      if (focus) this.#button('enlarge').focus({ preventScroll: true });
    }

    #expanded(open) {
      const control = this.#button('enlarge');
      const label = open ? '关闭放大预览' : '放大预览';
      control.dataset.icon = open ? 'close' : 'expand';
      control.title = label;
      control.setAttribute('aria-label', label);
      if (open) control.removeAttribute('aria-haspopup');
      else control.setAttribute('aria-haspopup', 'dialog');
    }

    #zoomReadout() {
      const fit = this.#button('fit');
      fit.textContent = Math.round(this.#scale * 100) + '%';
      fit.disabled = !this.#image || this.#scale === 1;
      this.#button('zoom-out').disabled = fit.disabled;
      this.#button('zoom-in').disabled = !this.#image || this.#scale === 4;
    }

    #draw() {
      const img = this.#image;
      if (!img) return;
      const w = this.#stage.clientWidth, h = this.#stage.clientHeight;
      if (!w || !h) return;
      const fit = Math.min(w / img.naturalWidth, h / img.naturalHeight);
      const limitX = Math.max(0, (fit * img.naturalWidth * this.#scale - w) / 2);
      const limitY = Math.max(0, (fit * img.naturalHeight * this.#scale - h) / 2);
      this.#x = clamp(this.#x, -limitX, limitX);
      this.#y = clamp(this.#y, -limitY, limitY);
      this.#stage.toggleAttribute('data-zoomed', this.#scale > 1);
      img.style.transform = 'translate(' + this.#x + 'px, ' + this.#y + 'px) scale(' + this.#scale + ')';
      this.#zoomReadout();
    }

    #zoom(scale, anchor, shift = { x: 0, y: 0 }) {
      if (!this.#image) return;
      const next = clamp(scale, 1, 4);
      const box = this.#stage.getBoundingClientRect();
      const x = anchor ? anchor.x - box.left - box.width / 2 : 0;
      const y = anchor ? anchor.y - box.top - box.height / 2 : 0;
      const ratio = next / this.#scale;
      this.#x = x - (x - this.#x) * ratio + shift.x;
      this.#y = y - (y - this.#y) * ratio + shift.y;
      this.#scale = next;
      this.#draw();
    }

    #wheel = event => {
      if (!this.#image || this.getRootNode().activeElement !== this.#stage || event.ctrlKey || event.metaKey || !event.deltaY) return;
      event.preventDefault();
      this.#zoom(this.#scale * (event.deltaY < 0 ? 1.15 : 1 / 1.15), point(event));
    };

    #doubleClick = event => { if (this.#image) this.#zoom(this.#scale > 1 ? 1 : 2, point(event)); };

    #press = event => {
      if (!this.#image || event.button !== 0 || this.#pointers.size >= 2) return;
      this.#pointers.set(event.pointerId, point(event));
      this.#stage.setPointerCapture(event.pointerId);
      this.#stage.setAttribute('data-dragging', '');
    };

    #move = event => {
      const prior = this.#pointers.get(event.pointerId);
      if (!prior) return;
      const before = [...this.#pointers.values()];
      const next = point(event);
      this.#pointers.set(event.pointerId, next);
      if (before.length === 2) {
        const after = [...this.#pointers.values()];
        const first = center(before), last = center(after);
        this.#zoom(this.#scale * (distance(after) / Math.max(1, distance(before))), first,
          { x: last.x - first.x, y: last.y - first.y });
      } else if (this.#scale > 1) {
        this.#x += next.x - prior.x;
        this.#y += next.y - prior.y;
        this.#draw();
      }
    };

    #release = event => {
      this.#pointers.delete(event.pointerId);
      if (!this.#pointers.size) this.#stage.removeAttribute('data-dragging');
    };

    #endGesture() {
      const pointers = [...this.#pointers.keys()];
      this.#pointers.clear();
      for (const pointerId of pointers) {
        if (this.#stage.hasPointerCapture(pointerId)) this.#stage.releasePointerCapture(pointerId);
      }
      this.#stage.removeAttribute('data-dragging');
    }

    #click = event => {
      if (event.defaultPrevented || event.button !== 0 || event.target.closest('ml-media-viewer') !== this) return;
      const link = event.target.closest(linkSelector);
      if (link && this.#list?.contains(link)) {
        if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
        if (this.select(link.dataset.media)) event.preventDefault();
        return;
      }
      const button = event.target.closest('button[data-action]');
      if (!button || button.disabled || !this.#view.contains(button)) return;
      switch (button.dataset.action) {
        case 'previous': this.#step(-1); break;
        case 'next': this.#step(1); break;
        case 'enlarge': if (this.open) this.close(); else this.show(); break;
        case 'zoom-out': this.#zoom(this.#scale / 1.25); break;
        case 'zoom-in': this.#zoom(this.#scale * 1.25); break;
        case 'fit': this.#zoom(1); break;
        case 'retry': this.#load(); this.#zoomReadout(); break;
      }
      if (button.disabled && this.getRootNode().activeElement !== this.#stage) this.#stage.focus({ preventScroll: true });
    };

    #key = event => {
      if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey ||
          event.target.closest('ml-media-viewer') !== this || event.target.closest('video, input, textarea, select, [contenteditable]')) return;
      const key = event.key;
      if (this.#image && ['+', '=', '-', '0'].includes(key)) {
        this.#zoom(key === '0' ? 1 : this.#scale * (key === '-' ? 1 / 1.25 : 1.25));
      } else if (this.#image && this.#scale > 1 && event.target === this.#stage &&
          ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) {
        this.#x += key === 'ArrowLeft' ? 32 : key === 'ArrowRight' ? -32 : 0;
        this.#y += key === 'ArrowUp' ? 32 : key === 'ArrowDown' ? -32 : 0;
        this.#draw();
      } else if (key === 'ArrowLeft' || key === 'ArrowRight') {
        this.#step(key === 'ArrowLeft' ? -1 : 1);
      } else return;
      event.preventDefault();
    };
  }
  customElements.define('ml-media-viewer', MediaViewer);
})();

(() => {
  'use strict';
  if (customElements.get('ml-drawer')) return;
  let serial = 0;
  function identify(element, prefix) {
    if (!element.id || element.ownerDocument.getElementById(element.id) !== element) {
      let id;
      do { id = prefix + (++serial); } while (element.ownerDocument.getElementById(id));
      element.id = id;
    }
    return element.id;
  }

  class MaterialDrawer extends HTMLElement {
    #shell;
    #native;
    #opener;
    #watch = new MutationObserver(records => {
      if (records.some(record => record.target === this || [...record.addedNodes, ...record.removedNodes].some(node =>
        node.matches?.('dialog, [data-ml-drawer-open], .ml-drawer-header') || node.querySelector?.('[data-ml-drawer-open]')))) this.#sync();
    });
    get dialog() { return this.#native; }
    get open() { return Boolean(this.#native?.open); }
    get returnValue() { return this.#native?.returnValue ?? ''; }
    get placement() { return this.getAttribute('placement') || 'auto'; }
    set placement(value) { this.setAttribute('placement', value); }
    connectedCallback() {
      this.#sync();
      this.#watch.observe(this, { childList: true, subtree: true });
      this.addEventListener('click', this.#click);
    }
    disconnectedCallback() {
      this.#watch.disconnect();
      this.removeEventListener('click', this.#click);
      this.#native?.removeEventListener('close', this.#closed);
      if (this.open) this.#native.close();
      this.#updateTriggers();
      this.#native = this.#shell = this.#opener = null;
    }
    showModal(trigger) {
      this.#sync();
      if (!this.#native || this.#native.matches(':modal')) return;
      if (this.open) this.#native.close();
      this.#opener = trigger || this.ownerDocument.activeElement;
      this.#shell.showModal(this.#opener);
      this.#updateTriggers();
      this.dispatchEvent(new CustomEvent('ml-drawer-open', { bubbles: true, detail: { trigger: this.#opener } }));
    }
    close(value = '') { this.#shell?.close(value); this.#updateTriggers(); }
    #sync() {
      const direct = this.querySelector(':scope > dialog');
      this.#shell = this.querySelector(':scope > ml-dialog');
      if (direct) {
        if (!this.#shell) {
          this.#shell = this.ownerDocument.createElement('ml-dialog');
          this.#shell.setAttribute('dismiss-on-backdrop', '');
          direct.before(this.#shell);
        }
        this.#shell.append(direct);
      }
      const dialog = this.#shell?.dialog;
      if (this.#native !== dialog) {
        this.#native?.removeEventListener('close', this.#closed);
        this.#native = dialog;
        dialog?.addEventListener('close', this.#closed);
      }
      if (!dialog) return;
      identify(dialog, 'ml-drawer-');
      const generated = dialog.querySelector(':scope > [data-ml-drawer-header]');
      let header = dialog.querySelector(':scope > .ml-drawer-header:not([data-ml-drawer-header])');
      if (header) generated?.remove();
      else header = generated;
      if (!header) {
        header = this.ownerDocument.createElement('header');
        header.className = 'ml-drawer-header';
        header.setAttribute('data-ml-drawer-header', '');
        const existing = dialog.querySelector(':scope > :is(h1,h2,h3)');
        if (existing) header.append(existing);
        dialog.prepend(header);
      }
      const fallback = header.querySelector('[data-ml-drawer-heading]');
      let heading = header.querySelector(':is(h1, h2, h3):not([data-ml-drawer-heading])');
      if (heading) fallback?.remove();
      else heading = fallback;
      if (!heading) {
        heading = this.ownerDocument.createElement('h2');
        heading.setAttribute('data-ml-drawer-heading', '');
        heading.textContent = dialog.getAttribute('aria-label') || '详情';
        header.prepend(heading);
      }
      if (!dialog.hasAttribute('aria-label') && (!dialog.hasAttribute('aria-labelledby') || dialog.hasAttribute('data-ml-drawer-labelled'))) {
        dialog.setAttribute('aria-labelledby', identify(heading, 'ml-drawer-title-'));
        dialog.setAttribute('data-ml-drawer-labelled', '');
      }
      if (!header.querySelector('[data-ml-drawer-close], [data-ml-dialog-close]')) {
        const close = this.ownerDocument.createElement('button');
        close.type = 'button';
        close.value = 'close';
        close.className = 'ml-drawer-dismiss';
        close.setAttribute('data-ml-drawer-close', '');
        close.setAttribute('aria-label', '关闭详情');
        close.title = '关闭详情';
        header.append(close);
      }
      this.#updateTriggers();
    }
    #updateTriggers() {
      for (const button of this.querySelectorAll('[data-ml-drawer-open]')) {
        if (button.closest('ml-drawer') !== this) continue;
        button.setAttribute('aria-haspopup', 'dialog');
        if (this.#native) button.setAttribute('aria-controls', this.#native.id);
        button.setAttribute('aria-expanded', String(this.open));
      }
    }
    #click = event => {
      if (event.defaultPrevented || event.target.closest?.('ml-drawer') !== this) return;
      const button = event.target.closest('button[data-ml-drawer-open], button[data-ml-drawer-close]');
      if (!button || button.matches(':disabled, [aria-disabled="true"]')) return;
      if (button.hasAttribute('data-ml-drawer-open')) {
        event.preventDefault();
        this.showModal(button);
      } else if (this.open && this.#native.contains(button)) {
        event.preventDefault();
        this.close(button.value || 'close');
      }
    };
    #closed = event => {
      if (event.target !== this.#native || this.open) return;
      this.#updateTriggers();
      const trigger = this.#opener;
      this.#opener = null;
      this.dispatchEvent(new CustomEvent('ml-drawer-close', { bubbles: true, detail: { trigger, returnValue: this.returnValue } }));
    };
  }
  customElements.define('ml-drawer', MaterialDrawer);
})();

(() => {
  'use strict';
  if (customElements.get('ml-menu')) return;

  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  const items = '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';
  const openMenus = new WeakMap();
  let nextId = 0;

  class MenuPanel extends GlassControl {
    get glassContent() {
      return this.hasAttribute('data-ml-menu-shown') ? this.querySelector(':scope > [role="menu"]') : null;
    }
  }

  class ActionMenu extends GlassControl {
    #id = 'ml-menu-' + ++nextId;
    #panel;
    #body;
    #button;
    #session;
    #frame = 0;
    #geometry = '';
    #prefix = '';
    #lastKey = 0;
    #markup = new MutationObserver(() => {
      this.#wire();
      if (!this.open) return;
      this.#prepareItems();
      const active = this.getRootNode().activeElement;
      if (!this.#body.contains(active) || !active.getClientRects().length || active.matches(':disabled')) this.#focusEdge(false);
    });

    get open() { return Boolean(this.#session); }
    get trigger() { return this.querySelector(':scope > button'); }

    connectedCallback() {
      super.connectedCallback();
      this.#wire();
      this.#markup.observe(this, { childList: true, subtree: true, attributes: true,
        attributeFilter: ['disabled', 'hidden', 'role', 'aria-hidden'] });
      this.addEventListener('click', this.#guardDisabled, true);
      this.addEventListener('click', this.#click);
      this.addEventListener('keydown', this.#key);
      this.addEventListener('pointermove', this.#point);
      this.addEventListener('beforetoggle', this.#nativeToggle, true);
    }

    disconnectedCallback() {
      this.close();
      this.#markup.disconnect();
      this.removeEventListener('click', this.#guardDisabled, true);
      this.removeEventListener('click', this.#click);
      this.removeEventListener('keydown', this.#key);
      this.removeEventListener('pointermove', this.#point);
      this.removeEventListener('beforetoggle', this.#nativeToggle, true);
      super.disconnectedCallback();
    }

    #wire() {
      const button = this.trigger;
      const panel = this.querySelector(':scope > ml-menu-panel');
      const body = panel?.querySelector(':scope > [role="menu"]');
      if (this.open && (this.#button !== button || this.#panel !== panel || this.#body !== body || button?.matches(':disabled'))) this.close();
      this.#button = button;
      this.#panel = panel;
      this.#body = body;
      if (!panel || !button || !body) return;
      if (!button.hasAttribute('type')) button.type = 'button';
      if (panel.getAttribute('popover') !== 'manual') panel.setAttribute('popover', 'manual');
      if (!this.open) panel.removeAttribute('data-ml-menu-shown');
      // Generated names are local to this instance, including a clone of a live menu.
      for (const [node, suffix] of [[button, 'trigger'], [body, 'items']]) {
        if (!node.id || node.hasAttribute('data-ml-menu-id')) {
          node.id = this.#id + '-' + suffix;
          node.setAttribute('data-ml-menu-id', '');
        }
      }
      button.setAttribute('aria-haspopup', 'menu');
      button.setAttribute('aria-controls', body.id);
      button.setAttribute('aria-expanded', String(this.open));
      if (!body.hasAttribute('aria-label') && (!body.hasAttribute('aria-labelledby') || body.hasAttribute('data-ml-menu-label'))) {
        body.setAttribute('aria-labelledby', button.id);
        body.setAttribute('data-ml-menu-label', '');
      }
      body.tabIndex = -1;
    }

    #prepareItems() {
      for (const item of this.#body.querySelectorAll(items)) {
        if (item.closest('[role="menu"]') !== this.#body) continue;
        item.tabIndex = -1;
        if (item.localName === 'button' && !item.hasAttribute('type')) item.type = 'button';
        if (item.getAttribute('role') !== 'menuitem' && !item.hasAttribute('aria-checked')) item.setAttribute('aria-checked', 'false');
      }
    }

    #rows() {
      return [...this.#body.querySelectorAll(items)].filter(item => item.closest('[role="menu"]') === this.#body &&
        !item.matches(':disabled') && !item.closest('[inert], [aria-hidden="true"]') && item.getClientRects().length);
    }

    show(last = false) {
      this.#wire();
      const button = this.#button, panel = this.#panel;
      if (this.open || !this.isConnected || !this.#body || !button || button.matches(':disabled, [aria-disabled="true"]') ||
          button.closest('[inert]') || !button.getClientRects().length) return;
      const doc = this.ownerDocument;
      openMenus.get(doc)?.close();
      openMenus.set(doc, this);
      this.#session = new AbortController();
      this.#prefix = '';
      this.#geometry = '';
      this.#prepareItems();
      button.setAttribute('aria-expanded', 'true');
      panel.setAttribute('data-ml-menu-shown', '');
      if (typeof panel.showPopover === 'function') {
        panel.showPopover();
        if (!panel.matches(':popover-open')) { this.close(); return; }
      }
      this.#track();
      if (!this.open) return;
      const opts = { capture: true, signal: this.#session.signal };
      // Each root sees a different target when the menu lives inside a closed shadow tree.
      for (let boundary = this; boundary; boundary = boundary.getRootNode().host) {
        const root = boundary.getRootNode(), inside = boundary;
        const dismiss = event => { if (!event.composedPath().includes(inside)) this.close(); };
        root.addEventListener('pointerdown', dismiss, opts);
        root.addEventListener('focusin', dismiss, opts);
      }
      this.#focusEdge(last);
    }

    close(restoreFocus = false) {
      if (!this.open) return;
      this.#release();
      if (typeof this.#panel.hidePopover === 'function' && this.#panel.matches(':popover-open')) this.#panel.hidePopover();
      if (restoreFocus && this.#button.isConnected) this.#button.focus({ preventScroll: true });
    }

    #release() {
      this.#session.abort();
      this.#session = null;
      openMenus.delete(this.ownerDocument);
      this.ownerDocument.defaultView.cancelAnimationFrame(this.#frame);
      this.#button.setAttribute('aria-expanded', 'false');
      this.#panel.removeAttribute('data-ml-menu-shown');
    }

    #nativeToggle = event => {
      if (event.target === this.#panel && event.newState === 'closed' && this.open) this.#release();
    };

    #focus(row) {
      (row || this.#body).focus({ preventScroll: true });
      if (!row) return;
      const r = row.getBoundingClientRect(), b = this.#body.getBoundingClientRect();
      if (r.top < b.top) this.#body.scrollTop -= b.top - r.top;
      else if (r.bottom > b.bottom) this.#body.scrollTop += r.bottom - b.bottom;
    }

    #focusEdge(last) { this.#focus(this.#rows().at(last ? -1 : 0)); }
    #item(target) {
      const row = target.closest?.(items);
      return this.open && row && row.closest('[role="menu"]') === this.#body ? row : null;
    }

    #guardDisabled = event => {
      const row = this.#item(event.target);
      if ((row && (row.matches(':disabled, [aria-disabled="true"]') || !row.getClientRects().length || row.closest('[inert], [aria-hidden="true"]'))) ||
          (this.#button?.contains(event.target) && this.#button.matches('[aria-disabled="true"]'))) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };

    #click = event => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (this.#button?.contains(event.target)) {
        event.preventDefault();
        if (this.open) this.close(true);
        else this.show();
        return;
      }
      const item = this.#item(event.target);
      if (!item) return;
      const role = item.getAttribute('role');
      let checked;
      if (role === 'menuitemcheckbox') checked = item.getAttribute('aria-checked') !== 'true';
      if (role === 'menuitemradio') {
        checked = true;
        const group = item.closest('[role="group"], [role="menu"]');
        for (const peer of group.querySelectorAll('[role="menuitemradio"]')) {
          if (peer !== item && peer.closest('[role="group"], [role="menu"]') === group) peer.setAttribute('aria-checked', 'false');
        }
      }
      if (checked !== undefined) item.setAttribute('aria-checked', String(checked));
      if (role !== 'menuitemcheckbox' || !this.hasAttribute('keep-open')) this.close(true);
      this.dispatchEvent(new CustomEvent('ml-menu-action', { bubbles: true, composed: true,
        detail: { action: item.dataset.action || '', item, checked } }));
    };

    #point = event => {
      if (event.pointerType !== 'mouse' || (!event.movementX && !event.movementY)) return;
      const row = this.#item(event.target);
      if (row && !row.matches(':disabled') && row !== this.getRootNode().activeElement) this.#focus(row);
    };

    #key = event => {
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.altKey || event.ctrlKey || event.metaKey) return;
      const key = event.key;
      if (!this.open) {
        if (event.target === this.#button && (key === 'ArrowUp' || key === 'ArrowDown')) {
          event.preventDefault(); this.show(key === 'ArrowUp');
        }
        return;
      }
      if (key === 'Tab') { this.close(true); return; }
      if (key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.close(true); return; }
      const row = this.#item(event.target);
      if (!row && event.target !== this.#body) return;
      if (key === 'Enter' || key === ' ') {
        event.preventDefault();
        if (!event.repeat) row?.click();
        return;
      }
      const rows = this.#rows();
      if (!rows.length) return;
      const index = rows.indexOf(row);
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) {
        event.preventDefault();
        const next = key === 'Home' ? 0 : key === 'End' ? rows.length - 1 : index + (key === 'ArrowDown' ? 1 : -1);
        this.#focus(rows[(next + rows.length) % rows.length]);
      } else if (key.length === 1) {
        event.preventDefault();
        const now = performance.now(), ch = key.normalize('NFKC').toLocaleLowerCase();
        this.#prefix = now - this.#lastKey > 650 ? ch : this.#prefix + ch;
        this.#lastKey = now;
        const single = [...this.#prefix].every(letter => letter === ch);
        const start = Math.max(0, index + (single ? 1 : 0));
        const match = rows.slice(start).concat(rows.slice(0, start)).find(item =>
          (item.getAttribute('aria-label') || item.textContent).trim().normalize('NFKC').toLocaleLowerCase().startsWith(single ? ch : this.#prefix));
        if (match) this.#focus(match);
      }
    };

    // Only an open menu tracks its anchor. Measure the scrollable content to choose
    // the side even when the available height has already constrained the panel.
    #track = () => {
      const panel = this.#panel, body = this.#body, doc = this.ownerDocument;
      const win = doc.defaultView, view = win.visualViewport, a = this.#button.getBoundingClientRect();
      const x = view?.offsetLeft ?? 0, y = view?.offsetTop ?? 0;
      const w = view?.width ?? doc.documentElement.clientWidth, h = view?.height ?? doc.documentElement.clientHeight;
      if (!a.width || !a.height || a.bottom <= y || a.top >= y + h || a.right <= x || a.left >= x + w ||
          this.#button.matches(':disabled, [aria-disabled="true"]') || this.closest('[inert]')) { this.close(); return; }
      const rtl = getComputedStyle(this).direction === 'rtl', end = this.getAttribute('align') === 'end';
      const geometry = [a.x, a.y, a.width, a.height, x, y, w, h, rtl, end, panel.offsetWidth, body.scrollHeight].join('/');
      if (geometry !== this.#geometry) {
        this.#geometry = geometry;
        const margin = 8, gap = 5;
        panel.style.setProperty('--ml-menu-viewport', Math.max(1, w - 2 * margin) + 'px');
        const width = panel.offsetWidth, natural = body.scrollHeight + panel.offsetHeight - body.clientHeight;
        const above = a.top - y - margin - gap, below = y + h - margin - a.bottom - gap;
        const up = below < natural && above > below;
        const space = Math.max(1, h - 2 * margin);
        const overlap = Math.max(above, below) < Math.min(56, space);
        const room = overlap ? space : Math.max(1, up ? above : below);
        const left = end !== rtl ? a.right - width : a.left;
        panel.dataset.side = up ? 'above' : 'below';
        panel.style.setProperty('--ml-menu-room', room + 'px');
        panel.style.left = Math.max(x + margin, Math.min(left, x + w - margin - width)) + 'px';
        const top = up ? a.top - gap - panel.offsetHeight : a.bottom + gap;
        panel.style.top = Math.max(y + margin, Math.min(top, y + h - margin - panel.offsetHeight)) + 'px';
      }
      this.#frame = win.requestAnimationFrame(this.#track);
    };
  }

  customElements.define('ml-menu-panel', MenuPanel);
  customElements.define('ml-menu', ActionMenu);
})();

(() => {
  'use strict';
  if (customElements.get('ml-icon')) return;

  const ns = 'http://www.w3.org/2000/svg';
  const template = document.createElement('template');
  template.innerHTML = "<svg xmlns=\"http://www.w3.org/2000/svg\" data-small-stroke=\"2\">\n  <defs data-category=\"navigation\" data-label=\"导航与布局\">\n    <symbol id=\"i-layers\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"图层\" data-keywords=\"素材 层叠 stack collection\"><path d=\"m3 8 9-5 9 5-9 5z\" fill=\"var(--ml-icon-pane, none)\"/><path d=\"M3.5 12l8.5 4.8 8.5-4.8\"/><path d=\"M3.5 16l8.5 4.8 8.5-4.8\"/></symbol>\n    <symbol id=\"i-home\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"主页\" data-keywords=\"首页 房子 home dashboard\"><path d=\"m3 10 8-6.5a1.6 1.6 0 0 1 2 0l8 6.5M5.3 8.6v10.3c0 .9.7 1.6 1.6 1.6H10v-6h4v6h3.1c.9 0 1.6-.7 1.6-1.6V8.6\" fill=\"var(--ml-icon-pane, none)\"/></symbol>\n    <symbol id=\"i-page\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"页面\" data-keywords=\"窗口 浏览器 browser window\"><rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2.8\" fill=\"var(--ml-icon-pane, none)\"/><path d=\"M3.5 9h17M7 6.6h.1m2.6 0h.1\"/></symbol>\n    <symbol id=\"i-grid\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"网格\" data-keywords=\"宫格 布局 overview layout\"><rect x=\"3.5\" y=\"3.5\" width=\"7\" height=\"7\" rx=\"1.6\" fill=\"var(--ml-icon-pane, none)\"/><rect x=\"13.5\" y=\"3.5\" width=\"7\" height=\"7\" rx=\"1.6\" fill=\"var(--ml-icon-pane, none)\"/><rect x=\"3.5\" y=\"13.5\" width=\"7\" height=\"7\" rx=\"1.6\" fill=\"var(--ml-icon-pane, none)\"/><rect x=\"13.5\" y=\"13.5\" width=\"7\" height=\"7\" rx=\"1.6\" fill=\"var(--ml-icon-pane, none)\"/></symbol>\n    <symbol id=\"i-list\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"列表\" data-keywords=\"条目 清单 项目符号 列表视图 list view rows bullets\"><path d=\"M4.1 6h.2M8.5 6h12\"/><path d=\"M4.1 12h.2M8.5 12h12\"/><path d=\"M4.1 18h.2M8.5 18h12\"/></symbol>\n    <symbol id=\"i-sidebar\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"侧栏\" data-keywords=\"侧边栏 分栏 sidebar layout\"><rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"3\" fill=\"var(--ml-icon-pane, none)\"/><path d=\"M9.2 4.5v15M5.7 8h1M5.7 11h1\"/></symbol>\n    <symbol id=\"i-menu\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"菜单\" data-keywords=\"菜单 列表 menu navigation\"><path d=\"M4 6.5h16\"/><path d=\"M4 12h16\"/><path d=\"M4 17.5h16\"/></symbol>\n    <symbol id=\"i-more\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"更多操作\" data-keywords=\"更多 菜单 more ellipsis overflow\"><circle cx=\"5\" cy=\"12\" r=\"1.3\" fill=\"var(--ml-icon-lens, none)\"/><circle cx=\"12\" cy=\"12\" r=\"1.3\" fill=\"var(--ml-icon-lens, none)\"/><circle cx=\"19\" cy=\"12\" r=\"1.3\" fill=\"var(--ml-icon-lens, none)\"/></symbol>\n    <symbol id=\"i-mode\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"分段切换\" data-keywords=\"选项 模式 segmented control\"><rect x=\"2.8\" y=\"5.5\" width=\"18.4\" height=\"13\" rx=\"4\" fill=\"var(--ml-icon-pane, none)\"/><path d=\"M12 6.5v11\"/><rect x=\"5.3\" y=\"8\" width=\"4.3\" height=\"8\" rx=\"1.3\" fill=\"currentColor\" stroke=\"none\"/></symbol>\n    <symbol id=\"i-modal\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"弹窗\" data-keywords=\"对话框 弹出 dialog window\"><rect x=\"2.5\" y=\"4\" width=\"19\" height=\"16\" rx=\"3\" fill=\"var(--ml-icon-pane, none)\"/><rect x=\"7\" y=\"8\" width=\"10\" height=\"8\" rx=\"1.5\" fill=\"var(--ml-icon-lens, none)\"/></symbol>\n    <symbol id=\"i-expand\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"展开\" data-keywords=\"放大 全屏 fullscreen maximize\"><path d=\"M14.5 4H20v5.5M20 4l-6 6m-4.5 10H4v-5.5M4 20l6-6\"/></symbol>\n    <symbol id=\"i-collapse\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"收起\" data-keywords=\"缩小 退出全屏 minimize\"><path d=\"M20 9.5h-5.5V4m0 5.5 6-6M4 14.5h5.5V20m0-5.5-6 6\"/></symbol>\n    <symbol id=\"i-size\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"原寸\" data-keywords=\"实际尺寸 一比一 actual size\"><rect x=\"3.5\" y=\"4.5\" width=\"17\" height=\"15\" rx=\"3\" fill=\"var(--ml-icon-pane, none)\"/><path d=\"M7.5 10H9v4m5-4h1.5v4\"/><path d=\"M12 10.8h.01m-.01 2.6h.01\"/></symbol>\n    <symbol id=\"i-chevron-left\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"返回\" data-keywords=\"上一步 向左 上一页 back previous\"><path d=\"m14.8 4.8-7.2 7.2 7.2 7.2\"/></symbol>\n    <symbol id=\"i-chevron-right\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"前进\" data-keywords=\"下一步 向右 下一页 forward next\"><path d=\"m9.2 4.8 7.2 7.2-7.2 7.2\"/></symbol>\n    <symbol id=\"i-chevron-down\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"下拉\" data-keywords=\"向下 展开 dropdown down\"><path d=\"m5 9 7 7 7-7\"/></symbol>\n    <symbol id=\"i-chevron-up\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"向上折叠\" data-keywords=\"上拉 收起 向上 尖括号 up disclosure collapse\"><path d=\"m5 15 7-7 7 7\"/></symbol>\n    <symbol id=\"i-arrow-left\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"向左箭头\" data-keywords=\"左移 返回 向左拓展 back left direction\"><path d=\"M20 12H4m6-6-6 6 6 6\"/></symbol>\n    <symbol id=\"i-arrow-right\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"向右箭头\" data-keywords=\"右移 前往 向右拓展 forward right direction\"><path d=\"M4 12h16m-6-6 6 6-6 6\"/></symbol>\n    <symbol id=\"i-arrow-up\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"向上箭头\" data-keywords=\"上移 向上拓展 upward up direction\"><path d=\"M12 20V4m-6 6 6-6 6 6\"/></symbol>\n    <symbol id=\"i-arrow-down\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"向下箭头\" data-keywords=\"下移 向下拓展 downward down direction\"><path d=\"M12 4v16m-6-6 6 6 6-6\"/></symbol>\n  </defs>\n  <defs data-category=\"actions\" data-label=\"操作与编辑\">\n    <symbol id=\"i-search\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"搜索\" data-keywords=\"查找 搜寻 放大镜 find lookup\"><circle cx=\"10.4\" cy=\"10.4\" r=\"6.5\" fill=\"var(--ml-icon-lens, none)\"/><path d=\"m15.2 15.2 5.1 5.1\"/></symbol>\n    <symbol id=\"i-plus\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"添加\" data-keywords=\"增加 新建 add new\"><path d=\"M12 5v14M5 12h14\"/></symbol>\n    <symbol id=\"i-minus\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"减少\" data-keywords=\"减去 移除 subtract remove\"><path d=\"M5 12h14\"/></symbol>\n    <symbol id=\"i-check\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"确认\" data-keywords=\"完成 勾选 对勾 done confirm\"><path d=\"m5 12 4.6 4.6L19 7.3\"/></symbol>\n    <symbol id=\"i-close\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"关闭\" data-keywords=\"取消 叉号 dismiss cancel\"><path d=\"m6 6 12 12M18 6 6 18\"/></symbol>\n    <symbol id=\"i-edit\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"编辑\" data-keywords=\"修改 铅笔 pencil write\"><path d=\"m4 16-.8 4.8 4.8-.8L20 8a2.3 2.3 0 0 0 0-3.2l-.8-.8a2.3 2.3 0 0 0-3.2 0ZM14.7 5.3l4 4\" fill=\"var(--ml-icon-alloy, none)\"/></symbol>\n    <symbol id=\"i-copy\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"复制\" data-keywords=\"副本 剪贴板 duplicate clipboard\"><rect x=\"8\" y=\"8\" width=\"12\" height=\"13\" rx=\"2\" fill=\"var(--ml-icon-pane, none)\"/><path d=\"M15.5 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3\"/></symbol>\n    <symbol id=\"i-trash\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"删除\" data-keywords=\"回收站 垃圾桶 delete bin\"><path d=\"M4 7h16M9 7V4.5h6V7\"/><path d=\"M6.5 7l.8 12.5h9.4L17.5 7M10 10.5v5.8m4-5.8v5.8\" fill=\"var(--ml-icon-pane, none)\"/></symbol>\n    <symbol id=\"i-settings\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"设置\" data-keywords=\"齿轮 系统设置 外观设置 设备设置 配置 参数 首选项 偏好设置 gear cog preferences configuration\"><path d=\"M10.71 2.84L13.29 2.84L13.65 5.14A7.05 7.05 0 0 1 15.68 5.99L17.57 4.61L19.39 6.43L18.01 8.32A7.05 7.05 0 0 1 18.86 10.35L21.16 10.71L21.16 13.29L18.86 13.65A7.05 7.05 0 0 1 18.01 15.68L19.39 17.57L17.57 19.39L15.68 18.01A7.05 7.05 0 0 1 13.65 18.86L13.29 21.16L10.71 21.16L10.35 18.86A7.05 7.05 0 0 1 8.32 18.01L6.43 19.39L4.61 17.57L5.99 15.68A7.05 7.05 0 0 1 5.14 13.65L2.84 13.29L2.84 10.71L5.14 10.35A7.05 7.05 0 0 1 5.99 8.32L4.61 6.43L6.43 4.61L8.32 5.99A7.05 7.05 0 0 1 10.35 5.14ZM15.05 12a3.05 3.05 0 1 0-6.1 0 3.05 3.05 0 1 0 6.1 0Z\" fill-rule=\"evenodd\" fill=\"var(--ml-icon-alloy, none)\"/></symbol>\n    <symbol id=\"i-sliders\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"调节\" data-keywords=\"设置 参数 控制 settings adjust controls\"><g><path d=\"M4 7h7m4 0h5\"/><circle cx=\"13\" cy=\"7\" r=\"2\" fill=\"var(--ml-icon-lens, none)\"/></g><g><path d=\"M4 17h3m4 0h9\"/><circle cx=\"9\" cy=\"17\" r=\"2\" fill=\"var(--ml-icon-lens, none)\"/></g></symbol>\n    <symbol id=\"i-filter\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"筛选\" data-keywords=\"过滤 条件 漏斗 filter funnel\"><path d=\"M3.5 5h17l-6.7 7.7v5.5l-3.6 1.8v-7.3z\" fill=\"var(--ml-icon-pane, none)\"/></symbol>\n    <symbol id=\"i-sort\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"排序\" data-keywords=\"升序 降序 按时间 按名称 重新排列 order ascending descending\"><path d=\"M7.5 19.5v-15M4.1 8l3.4-3.5L11 8\"/><path d=\"M16.5 4.5v15M13 16l3.5 3.5 3.4-3.5\"/></symbol>\n    <symbol id=\"i-pin\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"置顶\" data-keywords=\"固定 图钉 置顶记录 大头针 pin to top thumbtack\"><path transform=\"rotate(36 12 12)\" d=\"M7.5 3.8h9M9 4v5.2c0 1.4-.7 2.1-2.4 3.4l-1 1V15h12.8v-1.4l-1-1C15.7 11.3 15 10.6 15 9.2V4M12 15v5.7\" fill=\"var(--ml-icon-alloy, none)\"/></symbol>\n    <symbol id=\"i-reset\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"重置\" data-keywords=\"刷新 恢复 reset refresh restore\"><path d=\"M4 5v5h5m-4.7-.5a8 8 0 1 1 .9 7.3\"/></symbol>\n    <symbol id=\"i-refresh\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"刷新\" data-keywords=\"重新加载 重试 同步 更新 reload retry sync update\"><path d=\"M20 4.5v5h-5M4 19.5v-5h5M4.3 9a8.2 8.2 0 0 1 13.4-3L20 9.5M19.7 15a8.2 8.2 0 0 1-13.4 3L4 14.5\"/></symbol>\n    <symbol id=\"i-undo\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"撤销\" data-keywords=\"撤回 撤销移除 上一步 复原 undo revert\"><path d=\"m8.2 4.8-4.6 4.6L8.2 14M4 9.4h10.1a6.1 6.1 0 0 1 6.1 6.1v3.2\"/></symbol>\n    <symbol id=\"i-redo\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"重做\" data-keywords=\"恢复撤销 重做操作 下一步 redo reapply\"><path d=\"m15.8 4.8 4.6 4.6-4.6 4.6M20 9.4H9.9a6.1 6.1 0 0 0-6.1 6.1v3.2\"/></symbol>\n    <symbol id=\"i-zoom\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"放大查看\" data-keywords=\"缩放 放大镜 zoom in zoom-in\"><circle cx=\"10.5\" cy=\"10.5\" r=\"6.4\" fill=\"var(--ml-icon-lens, none)\"/><path d=\"m15.4 15.4 4.8 4.8M8 10.5h5m-2.5-2.5v5\"/></symbol>\n    <symbol id=\"i-zoom-out\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"缩小查看\" data-keywords=\"缩放 缩小 放大镜 zoom out zoom-out magnifier\"><circle cx=\"10.5\" cy=\"10.5\" r=\"6.4\" fill=\"var(--ml-icon-lens, none)\"/><path d=\"m15.4 15.4 4.8 4.8M8 10.5h5\"/></symbol>\n    <symbol id=\"i-share\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"分享\" data-keywords=\"共享 发送 share send\"><path d=\"M12 15V3.5m-3.6 3.6L12 3.5l3.6 3.6\"/><path d=\"M7.7 9.5H6A2 2 0 0 0 4 11.5v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1.7\"/></symbol>\n    <symbol id=\"i-download\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"下载\" data-keywords=\"导出 保存 下载到本地 export save\"><path d=\"M12 3.5v11m-4-4 4 4 4-4\"/><path d=\"M4.5 15.5v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3\"/></symbol>\n    <symbol id=\"i-upload\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"上传\" data-keywords=\"导入 文件 import upload\"><path d=\"M12 15V4m-4 4 4-4 4 4\"/><path d=\"M4.5 15.5v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3\"/></symbol>\n    <symbol id=\"i-save\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"保存\" data-keywords=\"存储 保存修改 草稿 软盘 save disk floppy\"><path d=\"M5.3 3.5h10.4l4.8 4.8v10.4a1.8 1.8 0 0 1-1.8 1.8H5.3a1.8 1.8 0 0 1-1.8-1.8V5.3a1.8 1.8 0 0 1 1.8-1.8ZM7.6 3.8v5h7.5v-5M7.5 20.2v-7h9v7\" fill=\"var(--ml-icon-pane, none)\"/></symbol>\n    <symbol id=\"i-play\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"播放\" data-keywords=\"开始 启动 运行 继续 回放 媒体 start resume playback\"><path d=\"M7.3 4.1 20 12 7.3 19.9Z\" fill=\"var(--ml-icon-pane, none)\"/></symbol>\n    <symbol id=\"i-pause\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"暂停\" data-keywords=\"暂停播放 挂起 等待 媒体 hold suspend playback\"><rect x=\"5.5\" y=\"4.5\" width=\"3.7\" height=\"15\" rx=\"1\" fill=\"var(--ml-icon-alloy, none)\"/><rect x=\"14.8\" y=\"4.5\" width=\"3.7\" height=\"15\" rx=\"1\" fill=\"var(--ml-icon-alloy, none)\"/></symbol>\n    <symbol id=\"i-stop\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"停止\" data-keywords=\"结束 停止播放 停止任务 媒体 end halt playback\"><rect x=\"5\" y=\"5\" width=\"14\" height=\"14\" rx=\"2.1\" fill=\"var(--ml-icon-pane, none)\"/></symbol>\n  </defs>\n  <defs data-category=\"content\" data-label=\"文件与内容\">\n    <symbol id=\"i-folder\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"文件夹\" data-keywords=\"目录 资料 文件 folder directory\"><path d=\"M3 7.5A1.5 1.5 0 0 1 4.5 6h5l2 2h8A1.5 1.5 0 0 1 21 9.5V18a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18ZM3.5 10.5h17\" fill=\"var(--ml-icon-pane, none)\"/></symbol>\n    <symbol id=\"i-file\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"文件\" data-keywords=\"文档 资料 document file\"><path d=\"M6.5 3.5h7l4.8 4.8v10.5a1.7 1.7 0 0 1-1.7 1.7H6.5a1.7 1.7 0 0 1-1.7-1.7V5.2a1.7 1.7 0 0 1 1.7-1.7ZM13.3 3.8v4.8h4.8M8.5 13h6.6m-6.6 3.2h4.7\" fill=\"var(--ml-icon-pane, none)\"/></symbol>\n    <symbol id=\"i-form\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"表单\" data-keywords=\"填写 表格 记录 form record\"><rect x=\"4\" y=\"4.5\" width=\"16\" height=\"15\" rx=\"3\" fill=\"var(--ml-icon-pane, none)\"/><path d=\"M8 9h8m-8 4h4\"/></symbol>\n    <symbol id=\"i-image\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"图像\" data-keywords=\"图片 照片 截图 photo picture\"><rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"3\" fill=\"var(--ml-icon-pane, none)\"/><circle cx=\"8.2\" cy=\"9\" r=\"1.35\" fill=\"var(--ml-icon-lens, none)\"/><path d=\"m4 17 4.5-4.5 3 2.6 3.8-4.4 5.3 5.5\"/></symbol>\n    <symbol id=\"i-image-off\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"无图像\" data-keywords=\"暂无图像 暂无画面 无信号 图片不可用 空帧 missing image unavailable no frame\"><path d=\"m3.5 3.5 17 17M8 4h10a3 3 0 0 1 3 3v9M4 5a3 3 0 0 0-1 2.2V17a3 3 0 0 0 3 3h11.5M4.2 17l4.3-4.4 2.9 2.5 1.7-1.8\"/><circle cx=\"15.8\" cy=\"8.5\" r=\"1.35\" fill=\"var(--ml-icon-lens, none)\"/></symbol>\n    <symbol id=\"i-tag\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"标签\" data-keywords=\"标注 分类 label category\"><path d=\"M3.5 5.5v6.1c0 .5.2.9.5 1.2l7.9 7.8a1.6 1.6 0 0 0 2.3 0l6.4-6.4a1.6 1.6 0 0 0 0-2.3L12.8 4a1.7 1.7 0 0 0-1.2-.5H5.5a2 2 0 0 0-2 2Z\" fill=\"var(--ml-icon-pane, none)\"/><circle cx=\"8.1\" cy=\"8.1\" r=\"1.1\"/></symbol>\n    <symbol id=\"i-bookmark\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"收藏\" data-keywords=\"书签 保存 favorite star\"><path d=\"M6.5 4.5h11v15l-5.5-3.7-5.5 3.7z\" fill=\"var(--ml-icon-pane, none)\"/></symbol>\n    <symbol id=\"i-link\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"链接\" data-keywords=\"关联 地址 跳转 url chain\"><path d=\"m10 13.9 4-4m-1.1-3.5 1.5-1.5a4 4 0 0 1 5.7 5.7l-3.1 3.1a4 4 0 0 1-5.7 0m-.2 3.9-1.5 1.5a4 4 0 0 1-5.7-5.7l3.1-3.1a4 4 0 0 1 5.7 0\"/></symbol>\n    <symbol id=\"i-archive\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"归档\" data-keywords=\"存档 箱子 收纳 archive box\"><rect x=\"3\" y=\"4\" width=\"18\" height=\"5\" rx=\"1.5\" fill=\"var(--ml-icon-pane, none)\"/><path d=\"M5 9v10h14V9M9.5 13h5\" fill=\"var(--ml-icon-pane, none)\"/></symbol>\n    <symbol id=\"i-code\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"代码\" data-keywords=\"开发 标签 编程 source markup\"><path d=\"m7.5 7-5 5 5 5m9-10 5 5-5 5m-3-13-3 16\"/></symbol>\n    <symbol id=\"i-calendar\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"日历\" data-keywords=\"日期 排期 时间 date schedule\"><rect x=\"3.5\" y=\"5.5\" width=\"17\" height=\"15\" rx=\"2.5\" fill=\"var(--ml-icon-pane, none)\"/><path d=\"M7.5 3.5v4M16.5 3.5v4M4 10h16M8 14h2m4 0h2\"/></symbol>\n  </defs>\n  <defs data-category=\"status\" data-label=\"状态与通知\">\n    <symbol id=\"i-bell\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"通知\" data-keywords=\"消息 提醒 铃铛 notification alert\"><path d=\"M18 10a6 6 0 0 0-12 0c0 4-1 5.5-2.4 7h16.8C19 15.5 18 14 18 10ZM10 20a2.3 2.3 0 0 0 4 0\" fill=\"var(--ml-icon-pane, none)\"/></symbol>\n    <symbol id=\"i-bell-off\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"关闭通知\" data-keywords=\"免打扰 静音通知 取消订阅 勿扰 muted notifications silent do not disturb\"><path d=\"m3.5 3.5 17 17M9.4 4.6A6 6 0 0 1 18 10c0 2.1.3 3.6 1 5M6.8 6.8A6.1 6.1 0 0 0 6 10c0 4-1 5.5-2.4 7H17M10 20a2.3 2.3 0 0 0 4 0\"/></symbol>\n    <symbol id=\"i-info\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"信息\" data-keywords=\"说明 提示 帮助 information help\"><circle cx=\"12\" cy=\"12\" r=\"8.6\" fill=\"var(--ml-icon-pane, none)\"/><path d=\"M12 11v5m0-9v.2\"/></symbol>\n    <symbol id=\"i-help-circle\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"帮助\" data-keywords=\"问号 疑问 使用指南 帮助中心 question help support\"><circle cx=\"12\" cy=\"12\" r=\"8.6\" fill=\"var(--ml-icon-pane, none)\"/><path d=\"M9.4 9.4a2.7 2.7 0 1 1 4.4 2.1c-1.2.8-1.8 1.3-1.8 2.5m0 2.8v.12\"/></symbol>\n    <symbol id=\"i-check-circle\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"成功\" data-keywords=\"完成 正常 通过 success done ok\"><circle cx=\"12\" cy=\"12\" r=\"8.7\" fill=\"var(--ml-icon-pane, none)\"/><path d=\"m7.8 12.1 2.9 3 5.5-6.3\"/></symbol>\n    <symbol id=\"i-warning\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"警告\" data-keywords=\"注意 告警 三角 感叹 caution alert\"><path d=\"m10.5 4.6-8 13.9a1.6 1.6 0 0 0 1.4 2.4h16.2a1.6 1.6 0 0 0 1.4-2.4l-8-13.9a1.7 1.7 0 0 0-3 0ZM12 9v4.5m0 3.1v.1\" fill=\"var(--ml-icon-pane, none)\"/></symbol>\n    <symbol id=\"i-error-circle\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"异常\" data-keywords=\"错误 禁止 故障 error fault stop\"><circle cx=\"12\" cy=\"12\" r=\"8.7\" fill=\"var(--ml-icon-pane, none)\"/><path d=\"M7.8 12h8.4\"/></symbol>\n    <symbol id=\"i-clock\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"时钟\" data-keywords=\"时间 历史 时间戳 clock time history\"><circle cx=\"12\" cy=\"12\" r=\"8.7\" fill=\"var(--ml-icon-lens, none)\"/><path d=\"M12 7v5.1l3.6 2\"/></symbol>\n    <symbol id=\"i-timer\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"计时\" data-keywords=\"间隔 秒表 耗时 timer stopwatch\"><circle cx=\"12\" cy=\"13.5\" r=\"7.2\" fill=\"var(--ml-icon-lens, none)\"/><path d=\"M12 9.3v4.3l2.8 1.9\"/><path d=\"M9.5 3h5M12 3v3\"/></symbol>\n    <symbol id=\"i-signal\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"信号\" data-keywords=\"状态 波形 脉冲 activity waveform pulse\"><path d=\"M2 12h4l3-7 4.5 14 3-9 1.5 2h4\"/></symbol>\n    <symbol id=\"i-toggle\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"开关\" data-keywords=\"启用 禁用 通断 switch toggle\"><rect x=\"2\" y=\"6\" width=\"20\" height=\"12\" rx=\"6\" fill=\"var(--ml-icon-pane, none)\"/><circle cx=\"15.7\" cy=\"12\" r=\"3\" fill=\"var(--ml-icon-lens, none)\"/></symbol>\n    <symbol id=\"i-eye\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"显示\" data-keywords=\"查看 预览 眼睛 show visible\"><path d=\"M2.5 12s3.3-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.3 6.5-9.5 6.5S2.5 12 2.5 12Z\" fill=\"var(--ml-icon-lens, none)\"/><circle cx=\"12\" cy=\"12\" r=\"2.8\"/></symbol>\n    <symbol id=\"i-eye-off\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"隐藏\" data-keywords=\"不可见 隐私 眼睛 hide invisible\"><path d=\"m3.5 3.5 17 17M6.8 7.2A18.4 18.4 0 0 0 2.5 12s3.3 6.5 9.5 6.5c1.6 0 3-.4 4.2-1M9.5 5.9c.8-.3 1.6-.4 2.5-.4 6.2 0 9.5 6.5 9.5 6.5a18 18 0 0 1-2.7 3.4M9.4 11.4a2.7 2.7 0 0 0 3.2 3.2\"/></symbol>\n    <symbol id=\"i-lock\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"锁定\" data-keywords=\"锁 已锁 密码 权限 安全 只读 padlock locked secure permission\"><rect x=\"5\" y=\"10.5\" width=\"14\" height=\"10\" rx=\"2.2\" fill=\"var(--ml-icon-pane, none)\"/><path d=\"M8.3 10.4V7.3a3.7 3.7 0 0 1 7.4 0v3.1\"/><path d=\"M12 14.5v2.1\"/></symbol>\n    <symbol id=\"i-unlock\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"解锁\" data-keywords=\"开锁 已解锁 可编辑 权限 unlocked open padlock permission\"><rect x=\"5\" y=\"10.5\" width=\"14\" height=\"10\" rx=\"2.2\" fill=\"var(--ml-icon-pane, none)\"/><path d=\"M8.3 10.4V7.3a3.7 3.7 0 0 1 7.1-1.5\"/><path d=\"M12 14.5v2.1\"/></symbol>\n    <symbol id=\"i-sun\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"太阳\" data-keywords=\"浅色模式 日间 白天 明亮 亮度 light theme daylight brightness\"><circle cx=\"12\" cy=\"12\" r=\"4.1\" fill=\"var(--ml-icon-lens, none)\"/><path d=\"M12 2.6v2M12 19.4v2M2.6 12h2M19.4 12h2M5.35 5.35l1.45 1.45m10.4 10.4 1.45 1.45M5.35 18.65l1.45-1.45M17.2 6.8l1.45-1.45\"/></symbol>\n    <symbol id=\"i-moon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"月亮\" data-keywords=\"深色模式 夜间 暗色 夜晚 dark theme night crescent\"><path d=\"M20.6 14.8A8 8 0 0 1 9.2 3.4a8.7 8.7 0 1 0 11.4 11.4Z\" fill=\"var(--ml-icon-lens, none)\"/></symbol>\n  </defs>\n  <defs data-category=\"inspection\" data-label=\"设备与测量\">\n    <symbol id=\"i-camera\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"相机\" data-keywords=\"拍照 摄像头 摄影 camera photo imaging\"><path d=\"M4.4 7.5h3l1.5-2.7h6.2l1.5 2.7h3a1.9 1.9 0 0 1 1.9 1.9v8.2a1.9 1.9 0 0 1-1.9 1.9H4.4a1.9 1.9 0 0 1-1.9-1.9V9.4a1.9 1.9 0 0 1 1.9-1.9Z\" fill=\"var(--ml-icon-pane, none)\"/><circle cx=\"12\" cy=\"13\" r=\"3.6\" fill=\"var(--ml-icon-lens, none)\"/></symbol>\n    <symbol id=\"i-aperture\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"光圈\" data-keywords=\"镜头 成像 采集 曝光 aperture lens exposure shutter\"><circle cx=\"12\" cy=\"12\" r=\"8.7\" fill=\"var(--ml-icon-lens, none)\"/><path d=\"M12 8.55L20.39 13.39M14.99 10.28L14.99 19.96M14.99 13.72L6.6 18.57M12 15.45L3.61 10.61M9.01 13.72L9.01 4.04M9.01 10.27L17.4 5.43\"/></symbol>\n    <symbol id=\"i-video\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"录像\" data-keywords=\"视频 录制 摄像头 video record\"><rect x=\"2.5\" y=\"6\" width=\"13.5\" height=\"12\" rx=\"2.5\" fill=\"var(--ml-icon-pane, none)\"/><path d=\"m16 10 5-3v10l-5-3\" fill=\"var(--ml-icon-lens, none)\"/></symbol>\n    <symbol id=\"i-frame\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"取景框\" data-keywords=\"瞄准 定位 预览 取景 viewfinder focus\"><path d=\"M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9m6 0h3.5A1.5 1.5 0 0 1 20 5.5V9m0 6v3.5a1.5 1.5 0 0 1-1.5 1.5H15m-6 0H5.5A1.5 1.5 0 0 1 4 18.5V15\"/><circle cx=\"12\" cy=\"12\" r=\"1.4\" fill=\"var(--ml-icon-lens, none)\"/></symbol>\n    <symbol id=\"i-scan-line\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"扫描\" data-keywords=\"巡检 扫描线 检测 scan inspect\"><path d=\"M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8m8 0h2.5A1.5 1.5 0 0 1 20 5.5V8m0 8v2.5a1.5 1.5 0 0 1-1.5 1.5H16m-8 0H5.5A1.5 1.5 0 0 1 4 18.5V16\"/><path d=\"M2.7 12h18.6\"/></symbol>\n    <symbol id=\"i-pipe\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"管道\" data-keywords=\"管线 弯管 管系 管路 pipe pipeline elbow\"><path data-ml-glass-face=\"\" stroke=\"none\" fill=\"var(--ml-icon-pane, none)\" d=\"M4 6.5h7.7a6 6 0 0 1 6 6V18h-5v-5.3a1.2 1.2 0 0 0-1.2-1.2H4Z\"/><path d=\"M4 6.5h7.7a6 6 0 0 1 6 6V18M4 11.5h7.5a1.2 1.2 0 0 1 1.2 1.2V18M3.5 4.8v8.4m7.6 5.4h8.3\"/></symbol>\n    <symbol id=\"i-drop\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"水滴\" data-keywords=\"水 液体 湿度 滴水 water liquid humidity droplet\"><path d=\"M12 2.8S5.2 10.9 5.2 15a6.8 6.8 0 0 0 13.6 0c0-4.1-6.8-12.2-6.8-12.2Zm-3.9 12.3a3.8 3.8 0 0 0 2.7 3.6\" fill=\"var(--ml-icon-lens, none)\"/></symbol>\n    <symbol id=\"i-gauge\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"仪表\" data-keywords=\"仪表盘 压力 表计 测量 gauge meter pressure\"><path d=\"M4.4 18.5a9 9 0 1 1 15.2 0ZM12 5.8v1.5m-6.1 1.3 1 1.1m11.2-1.1-1 1.1\" fill=\"var(--ml-icon-pane, none)\"/><path d=\"M14 10l-2.4 4.1\"/><circle cx=\"11.3\" cy=\"15.2\" r=\"1.2\" fill=\"var(--ml-icon-alloy, none)\"/></symbol>\n    <symbol id=\"i-crosshair\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"定位\" data-keywords=\"坐标 靶心 目标 位置 target location\"><circle cx=\"12\" cy=\"12\" r=\"7\" fill=\"var(--ml-icon-lens, none)\"/><path d=\"M12 2.5v4M12 17.5v4M2.5 12h4m11 0h4\"/><circle cx=\"12\" cy=\"12\" r=\"1\" fill=\"currentColor\" stroke=\"none\"/></symbol>\n    <symbol id=\"i-map-pin\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"位置标记\" data-keywords=\"地图 地点 点位 地图标记 位置 map marker location place\"><path d=\"M19 10c0 4.8-7 10.6-7 10.6S5 14.8 5 10a7 7 0 1 1 14 0Z\" fill=\"var(--ml-icon-pane, none)\"/><circle cx=\"12\" cy=\"10\" r=\"2.45\" fill=\"var(--ml-icon-lens, none)\"/></symbol>\n    <symbol id=\"i-cube\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"三维视图\" data-keywords=\"立方体 三维场景 模型 空间 3D box model scene\"><path data-ml-glass-face=\"\" stroke=\"none\" fill=\"var(--ml-icon-alloy, none)\" d=\"m12 12.2 8.3-4.7v9L12 21.1Z\"/><path d=\"M12 2.9 20.3 7.5v9L12 21.1l-8.3-4.6v-9ZM3.9 7.6l8.1 4.6 8.1-4.6M12 12.2v8.7\" fill=\"var(--ml-icon-pane, none)\"/></symbol>\n    <symbol id=\"i-ruler\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"标尺\" data-keywords=\"尺子 测量 长度 距离 尺寸 measure measurement distance scale\"><g transform=\"rotate(-40 12 12)\"><rect x=\"2.9\" y=\"8\" width=\"18.2\" height=\"8\" rx=\"1.4\" fill=\"var(--ml-icon-alloy, none)\"/><path d=\"M7.2 8.2v2.1m3.2-2.1v3.4m3.2-3.4v2.1m3.2-2.1v3.4\"/></g></symbol>\n    <symbol id=\"i-antenna\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"通信天线\" data-keywords=\"无线 通道 信号 收发 连接 天线 radio antenna broadcast connection\"><path d=\"M5 5.5a9.6 9.6 0 0 0 0 13M19 5.5a9.6 9.6 0 0 1 0 13\"/><path d=\"M8 8.3a5.5 5.5 0 0 0 0 7.4m8-7.4a5.5 5.5 0 0 1 0 7.4\"/><path d=\"M12 14v6.6\"/><circle cx=\"12\" cy=\"12\" r=\"1.65\" fill=\"var(--ml-icon-lens, none)\"/></symbol>\n    <symbol id=\"i-thermometer\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"温度\" data-keywords=\"热度 温度计 测温 thermal temperature\"><path d=\"M9.5 5.4a2.5 2.5 0 0 1 5 0v8.2a4.6 4.6 0 1 1-5 0Z\" fill=\"var(--ml-icon-lens, none)\"/><path d=\"M12 7.6v8.2\"/><circle cx=\"12\" cy=\"17.4\" r=\"1.4\" fill=\"currentColor\" stroke=\"none\"/></symbol>\n    <symbol id=\"i-keyboard\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" data-label=\"键盘\" data-keywords=\"输入 快捷键 keyboard shortcut\"><rect x=\"2.5\" y=\"5.5\" width=\"19\" height=\"13\" rx=\"3\" fill=\"var(--ml-icon-pane, none)\"/><path d=\"M6.7 9h.1m3.4 0h.1m3.4 0h.1m3.4 0h.1M7 14.5h10\"/></symbol>\n  </defs>\n</svg>";
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
  const weights = new Map([['light', 1.35], ['regular', 1.75], ['bold', 2.35]]);
  const smallStroke = Number(template.content.querySelector('svg').dataset.smallStroke);
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
        const animation = target.animate(frames, { duration: motion.duration, delay });
        globalThis[Symbol.for('material-lib.motion-frames.v1')].track(animation, icon);
        animations.push(animation);
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
  function createIconMaterial(art) {
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
    function inkLight(svg, drawing, tier, theme, reference, strength) {
      const id = prefix + ++serial;
      const defs = node(svg, 'defs', { 'data-ml-icon-light': tier, 'aria-hidden': 'true' });
      const filter = node(defs, 'filter', { id, filterUnits: 'userSpaceOnUse',
        x: '-16%', y: '-16%', width: '132%', height: '132%', 'color-interpolation-filters': 'sRGB' });
      const diffuse = node(filter, 'feDiffuseLighting', { in: 'SourceAlpha', surfaceScale: 0, 'lighting-color': 'white' });
      const lamp = node(diffuse, 'fePointLight', {});
      node(filter, 'feColorMatrix', { values: '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.8 0 0 0 -.8', result: 'intensity' });
      const tint = theme === 'warm' ? '#ebbe88' : theme === 'dark' ? '#a9d2f4' : '#93bde3';
      const [heightFactor, opacity] = { base: [.34, .37], low: [.54, .43], medium: [.85, .51] }[tier];
      const tintLayer = node(filter, 'feFlood', { 'flood-color': tint, 'flood-opacity': opacity * strength });
      node(filter, 'feComposite', { in2: 'intensity', operator: 'in' });
      node(filter, 'feComposite', { in2: 'SourceGraphic', operator: 'atop' });
      const original = drawing.getAttribute('filter');
      const applied = (original && original !== 'none' ? original + ' ' : '') + 'url(#' + id + ')';
      if (reference) defs.setAttribute('data-ml-icon-reference', original ?? '');
      drawing.setAttribute('filter', applied);
      let previous;
      let lightWeight = 1;
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
        setLightWeight(weight) {
          if (weight === lightWeight) return;
          lightWeight = weight;
          tintLayer.setAttribute('flood-opacity', (opacity * strength * weight).toFixed(3));
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
    function surface(svg, drawing, name, theme, reference = false, strength = 1) {
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
          node(paint, 'stop', { offset, 'stop-color': color, 'stop-opacity': color === glint ? opacity * strength : opacity });
        }
      }
      // Gradients live with the glyph, so each instance inherits its own CSS color.
      const ink = 'currentColor', glint = colors.light;
      if (!reference) {
        gradient('ink', [[0, ink], [.36, ink], [.46, ink, .84], [.55, ink], [.86, ink], [1, ink, .95]]);
        // A horizontal or vertical stroke has an empty object bounding box. Use the 24-unit glyph space.
        axes[0].setAttribute('gradientUnits', 'userSpaceOnUse');
        if (faces.has('pane')) gradient('pane', [[0, ink, colors.pane * 1.7], [.29, glint, .34],
          [.47, ink, colors.pane * .55], [.73, ink, colors.pane], [1, ink, colors.pane * 1.75]]);
        if (faces.has('lens')) gradient('lens', [[0, glint, .96], [.10, glint, .72], [.29, ink, colors.lens],
          [.57, ink, colors.lens * .40], [.81, ink, colors.lens], [1, ink, .66]], true);
        if (faces.has('alloy')) gradient('alloy', [[0, ink, .72], [.27, ink, colors.alloy], [.43, glint, .72],
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
      node(filter, 'feFlood', { 'flood-color': glint, 'flood-opacity': .52 * strength, result: 'frost' });
      node(filter, 'feComposite', { in: 'frost', in2: 'lip', operator: 'in', result: 'rim' });
      const front = node(filter, 'feOffset', { in: 'height', result: 'ahead' });
      node(filter, 'feComposite', { in: 'SourceAlpha', in2: 'ahead', operator: 'out', result: 'backEdge' });
      node(filter, 'feFlood', { 'flood-color': colors.shade, 'flood-opacity': .66 * strength, result: 'shadow' });
      node(filter, 'feComposite', { in: 'shadow', in2: 'backEdge', operator: 'in', result: 'depth' });
      const shine = node(filter, 'feSpecularLighting', { in: 'height', specularConstant: .7 * strength,
        specularExponent: '26', 'lighting-color': glint, result: 'reflection' });
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
      const raw = Number(options.lightIntensity ?? 1);
      const strength = options.lightSource === 'none' ? 0 : Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 1;
      if (options.material !== 'high') {
        svg.querySelectorAll('[data-ml-glass-face]').forEach(shape => shape.remove());
        svg.querySelectorAll(faceSelector).forEach(shape => shape.removeAttribute('fill'));
        if (options.lightSource === 'fixed' && strength && ['base', 'low', 'medium'].includes(options.material)) {
          const drawing = node(svg, 'g', {});
          drawing.append(...[...svg.children].filter(child => child !== drawing));
          inkLight(svg, drawing, options.material, options.theme, false, strength).light(.21, .12);
          svg.querySelector('defs').removeAttribute('data-ml-icon-light');
        }
        return svg;
      }
      const drawing = node(svg, 'g', {});
      drawing.append(...[...svg.children].filter(child => child !== drawing));
      const glass = surface(svg, drawing, name, options.theme, false, strength);
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
    const { GlassScene, GlassSurface } = globalThis[Symbol.for('material-lib.glass.v1')];
    const motionFrames = globalThis[Symbol.for('material-lib.motion-frames.v1')];
    function context(doc) {
      let ctx = contexts.get(doc);
      if (ctx) return ctx;
      const scene = GlassScene.forDocument(doc);
      const forced = doc.defaultView.matchMedia('(forced-colors: active)');
      ctx = { scene, forced, items: new Set(), views: new WeakMap(), dirty: true };
      ctx.wake = () => { ctx.dirty = true; scene.wake(); };
      ctx.resize = new ResizeObserver(() => scene.wake());
      // Prepare icons just outside the viewport before they scroll into view.
      const Observer = doc.defaultView.IntersectionObserver;
      if (Observer) ctx.viewport = new Observer(records => {
        let entered = false;
        for (const record of records) {
          const view = ctx.views.get(record.target);
          if (!view) continue;
          entered ||= !view.visible && record.isIntersecting;
          view.visible = record.isIntersecting;
        }
        if (entered) scene.wake();
      }, { rootMargin: '96px', scrollMargin: '96px' });
      ctx.paint = (pointer, now) => {
        const refresh = ctx.dirty;
        ctx.dirty = false;
        let follows = false;
        for (const item of ctx.items) {
          const refreshItem = refresh || item.dirty;
          if (refreshItem) {
            item.dirty = false;
            let level, theme, source, motion, disabled = false;
            const style = getComputedStyle(item.owner);
            for (let node = item.owner; node; node = iconParent(node)) {
              if (node.assignedSlot) watch(node.assignedSlot.getRootNode());
              level ??= node.getAttribute('data-ml-material');
              theme ??= node.getAttribute('data-ml-theme');
              source ??= node.getAttribute('data-ml-light-source');
              motion ??= node.getAttribute('data-ml-motion');
              disabled ||= node.matches(':disabled, [inert], [aria-disabled="true"], [aria-busy="true"]');
            }
            if (!level) {
              level = style.getPropertyValue('--ml-material-level').trim()
                || (style.getPropertyValue('--ml-optics').trim() === 'block' ? 'high' : 'base');
            }
            const light = GlassSurface.lighting(style, scene.media.matches, !disabled, source);
            item.mediumMotion = !scene.media.matches && (style.getPropertyValue('--ml-motion-level').trim() || motion) === 'medium';
            item.follows = light.mode === 'pointer' && !forced.matches;
            const tier = !forced.matches && (level === 'high' || (light.mode !== 'none' && ['base', 'low', 'medium'].includes(level))) ? level : null;
            if (item.glass && (tier !== item.tier || theme !== item.theme || light.strength !== item.strength)) {
              item.glass.remove(); item.glass = null;
            }
            item.tier = tier;
            item.theme = theme;
            item.strength = light.strength;
          }
          if (!item.tier || (!item.view.visible && !refreshItem)) continue;
          if (!motionFrames.due(item, item.mediumMotion, now, scene)) {
            follows ||= item.follows;
            continue;
          }
          const box = item.svg.getBoundingClientRect();
          if (!box.width || !box.height) continue;
          follows ||= item.follows;
          const followWeight = item.follows ? pointer?.weight ?? 1 : 1;
          let x = .21, y = .12;
          if (item.tier !== 'high') {
            if (item.follows && (!pointer || Math.hypot(Math.max(box.left - pointer.x, 0, pointer.x - box.right),
              Math.max(box.top - pointer.y, 0, pointer.y - box.bottom)) > Math.max(box.width, box.height) * 2)) {
              if (item.glass) { item.glass.remove(); item.glass = null; }
              continue;
            }
            item.glass ??= inkLight(item.svg, item.drawing, item.tier, item.theme, item.reference, item.strength);
            item.glass.setLightWeight(followWeight);
            if (item.follows) {
              x = (pointer.x - box.left) / box.width;
              y = (pointer.y - box.top) / box.height;
            }
          } else {
            item.glass ??= surface(item.svg, item.drawing, item.name, item.theme, item.reference, item.strength);
          }
          if (item.tier === 'high' && item.follows && pointer) {
            const px = (pointer.x - box.left) / box.width, py = (pointer.y - box.top) / box.height;
            const distance = Math.hypot((px - .5) * box.width, (py - .5) * box.height);
            const reach = Math.max(85, Math.max(box.width, box.height) * 2.6);
            const near = Math.max(0, Math.min(1, 1.5 - distance / reach)) * followWeight;
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
      if (--item.view.count === 0) {
        ctx.resize.unobserve(item.svg);
        ctx.viewport?.unobserve(item.svg);
        ctx.views.delete(item.svg);
      }
      ctx.items.delete(item);
      entries.delete(owner);
      if (!ctx.items.size) {
        ctx.scene.remove(ctx.paint);
        ctx.forced.removeEventListener('change', ctx.wake);
        ctx.scene.media.removeEventListener('change', ctx.wake);
        ctx.scene.doc.removeEventListener('visibilitychange', ctx.wake);
        ctx.resize.disconnect();
        ctx.viewport?.disconnect();
        contexts.delete(ctx.scene.doc);
      }
    }
    function attach(owner, svg, drawing, name) {
      const previous = entries.get(owner);
      if (previous?.name === name && previous?.drawing === drawing) return;
      detach(owner);
      if (!art.has(name) || !owner.isConnected) return;
      const ctx = context(owner.ownerDocument);
      let view = ctx.views.get(svg);
      if (!view) {
        view = { visible: true, count: 0 };
        ctx.views.set(svg, view);
        ctx.resize.observe(svg);
        ctx.viewport?.observe(svg);
      }
      view.count++;
      const item = { ctx, owner, svg, view, drawing, name, reference: owner === drawing, dirty: true };
      entries.set(owner, item);
      ctx.items.add(item);
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
      motionFrames.watch(root);
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
          } else if (record.attributeName === 'style') {
            if (/--ml-light-(?:intensity|source)\s*:/.test((record.oldValue || '') + ';' + record.target.style.cssText)) changed = true;
          } else if (record.attributeName === 'href' && record.target.localName === 'use') scan(record.target, true);
          else changed = true;
        }
        if (changed) wake();
      });
      observer.observe(root, { subtree: true, childList: true, attributes: true, attributeOldValue: true,
        attributeFilter: ['data-ml-material', 'data-ml-motion', 'data-ml-theme', 'data-ml-light-source', 'style', 'disabled', 'aria-disabled', 'aria-busy', 'hidden', 'inert', 'slot', 'name', 'href'] });
      root.addEventListener('slotchange', wake, true);
      root.addEventListener('load', event => { if (event.target.localName === 'link') wake(); }, true);
      scan(root, true);
    }
    watch(document);
    return { label, watch, attach, detach, forExport };
  }
  const motion = createIconMotion(art);
  const material = createIconMaterial(art);

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
      const smallSize = Math.max(0, Math.min(1, (24 - (size === '1em' ? 16 : pixels)) / 8));
      const stroke = (weights.get(options.weight) ?? weights.get('regular')) + smallSize * (smallStroke - weights.get('regular'));
      const svg = doc.createElementNS(ns, 'svg');
      svg.setAttribute('viewBox', symbol.getAttribute('viewBox'));
      svg.setAttribute('width', size);
      svg.setAttribute('height', size);
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', String(Number(stroke.toFixed(3))));
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

(() => {
  'use strict';
  if (window.MaterialMotion) return;

  const levels = Object.freeze([
    { value: 'base', label: '基础', name: '即时反馈', description: '状态立即到位。' },
    { value: 'low', label: '低', name: '短暂淡变', description: '位置立即到位，明暗短暂过渡。' },
    { value: 'medium', label: '中', name: '平滑过渡', description: '沿一个方向减速，动画更新上限为 90 FPS。' },
    { value: 'high', label: '高', name: '弹性反馈', description: '位移和按压带回弹，跟随浏览器刷新绘制。' },
  ].map(Object.freeze));
  const active = new Map();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  function milliseconds(value) {
    const time = value.trim();
    return (parseFloat(time) || 0) * (time.endsWith('ms') ? 1 : 1000);
  }

  function timing(element, action = 'move') {
    const style = getComputedStyle(element);
    const level = reduced.matches || !element.animate ? 'base' : style.getPropertyValue('--ml-motion-level').trim() || 'base';
    const durationToken = action === 'enter' ? '--ml-enter-time' : action === 'exit' ? '--ml-exit-time'
      : level === 'low' ? '--ml-tone' : '--ml-travel';
    const duration = level === 'base' ? 0 : milliseconds(style.getPropertyValue(durationToken));
    const easing = level === 'base' ? 'linear' : action === 'exit' ? 'ease-out' : style.getPropertyValue('--ml-ease').trim();
    return { level, duration, easing: easing || 'linear' };
  }

  // CSS transitions react to tier changes automatically. Settle any imperative animation as well.
  const settings = new MutationObserver(() => {
    for (const [element, entry] of active) {
      if (!element.isConnected || timing(element).level !== entry.level) finish(element);
    }
  });
  reduced.addEventListener('change', () => { if (reduced.matches) for (const el of active.keys()) finish(el); });

  function stop(element, settle = true) {
    const entry = active.get(element);
    if (!entry) return;
    active.delete(element);
    entry.animation.onfinish = entry.animation.oncancel = null;
    entry.animation.cancel();
    if (settle) entry.settle?.();
    if (!active.size) settings.disconnect();
  }

  function finish(element) { stop(element); }

  function play(element, frames, profile, settle) {
    if (!profile.duration || !element.isConnected || !element.animate) { settle?.(); return; }
    let animation;
    try { animation = element.animate(frames, { duration: profile.duration, fill: 'both' }); }
    catch { settle?.(); return; }
    globalThis[Symbol.for('material-lib.motion-frames.v1')].track(animation, element);
    if (!active.size) settings.observe(document.documentElement, { subtree: true, attributes: true,
      attributeFilter: ['data-ml-motion'], childList: true });
    active.set(element, { animation, settle, level: profile.level });
    animation.onfinish = animation.oncancel = () => {
      if (active.get(element)?.animation === animation) finish(element);
    };
    // A moving surface crosses the page-space light even when the pointer is still.
    const style = element.matches('ml-material') && getComputedStyle(element);
    if ((style && (style.getPropertyValue('--ml-optics').trim() === 'block' || style.getPropertyValue('--ml-light-source').trim() === 'pointer'))
      || element.matches('.ml-refractive') || element.querySelector('.ml-optical')) {
      const { GlassScene } = globalThis[Symbol.for('material-lib.glass.v1')];
      GlassScene.forDocument(element.ownerDocument).wake(profile.duration);
    }
  }

  function move(element, changeLayout) {
    const before = element.getBoundingClientRect();
    finish(element);
    changeLayout();
    const after = element.getBoundingClientRect();
    const profile = timing(element);
    if (!profile.duration || !before.width || !after.width || !after.height) return;
    const style = getComputedStyle(element);
    if (profile.level === 'low') {
      play(element, [{ opacity: Number(style.opacity) * .48, easing: profile.easing }, { opacity: style.opacity }], profile);
      return;
    }
    const x = (before.left - after.left) * (element.offsetWidth || after.width) / after.width;
    const y = (before.top - after.top) * (element.offsetHeight || after.height) / after.height;
    if (Math.abs(x) + Math.abs(y) < .01) return;
    play(element, [{ translate: x + 'px ' + y + 'px', composite: 'add', easing: profile.easing },
      { translate: '0px 0px', composite: 'add' }], profile);
  }

  function press(element) {
    const style = getComputedStyle(element);
    const startScale = style.scale, startDip = style.translate;
    finish(element);
    const profile = timing(element, 'press');
    if (!profile.duration) return;
    if (profile.level === 'low') {
      play(element, [{ opacity: style.opacity }, { opacity: Number(style.opacity) * .62, offset: .36, easing: 'ease-out' },
        { opacity: style.opacity }], profile);
      return;
    }
    const down = Math.min(.8, milliseconds(style.getPropertyValue('--ml-down-time')) / profile.duration);
    play(element, [{ scale: startScale, translate: startDip, easing: 'ease-out' },
      { scale: style.getPropertyValue('--ml-down-scale').trim(), translate: '0px ' + style.getPropertyValue('--ml-down-shift').trim(),
        offset: down, easing: profile.easing }, { scale: style.scale, translate: style.translate }], profile);
  }

  function reveal(element, visible, trigger) {
    const entry = active.get(element);
    const open = Boolean(visible);
    if (trigger) trigger.setAttribute('aria-expanded', String(open));
    if (entry?.open !== undefined ? entry.open === open : element.hidden === !open) return;
    const style = getComputedStyle(element);
    const previous = entry && entry.open !== undefined
      ? { opacity: style.opacity, translate: style.translate, scale: style.scale } : null;
    const wasInert = entry?.wasInert ?? element.inert;
    stop(element, false);
    if (!open && trigger && element.contains(element.ownerDocument.activeElement)) trigger.focus({ preventScroll: true });
    element.hidden = false;
    element.inert = open ? wasInert : true;
    const profile = timing(element, open ? 'enter' : 'exit');
    const shown = { opacity: style.opacity };
    const concealed = { opacity: 0 };
    if (profile.level === 'medium' || profile.level === 'high') {
      shown.translate = style.translate;
      shown.scale = style.scale;
      concealed.translate = '0px ' + style.getPropertyValue('--ml-enter-shift').trim();
      concealed.scale = style.getPropertyValue('--ml-enter-scale').trim();
    }
    const start = previous && profile.level === 'low' ? { opacity: previous.opacity } : previous || (open ? concealed : shown);
    play(element, [{ ...start, easing: profile.easing }, open ? shown : concealed], profile, () => {
      element.hidden = !open;
      element.inert = wasInert;
    });
    const running = active.get(element);
    if (running) Object.assign(running, { open, wasInert });
  }

  window.MaterialMotion = Object.freeze({ levels, timing, move, press, reveal, finish });
})();
