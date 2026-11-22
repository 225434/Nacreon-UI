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
