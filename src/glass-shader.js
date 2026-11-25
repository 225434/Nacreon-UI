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
