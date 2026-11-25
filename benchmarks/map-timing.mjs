import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// Install in a fresh document to time the real bake without instrumenting the bundles.
export function observeMapGeneration() {
  const pending = new WeakMap();
  window.normalMapTimings = new Map();
  const context = CanvasRenderingContext2D.prototype;
  const allocate = context.createImageData, upload = context.putImageData;
  const encode = HTMLCanvasElement.prototype.toDataURL;
  if (window.Worker) {
    const send = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message, ...args) {
      if (message?.type === 'nacreon-normal-map') {
        const start = performance.now(), { w: width, h: height } = message.shape;
        this.addEventListener('message', event => {
          if (typeof event.data === 'string') window.normalMapTimings.set(event.data, {
            width, height, calculationMs: null, totalMs: performance.now() - start, method: 'worker round trip',
          });
        }, { once: true });
      }
      return send.call(this, message, ...args);
    };
  }
  context.createImageData = function (...args) {
    pending.set(this.canvas, { start: performance.now() });
    return allocate.apply(this, args);
  };
  context.putImageData = function (...args) {
    const timing = pending.get(this.canvas);
    if (timing) timing.calculationMs = performance.now() - timing.start;
    return upload.apply(this, args);
  };
  HTMLCanvasElement.prototype.toDataURL = function (...args) {
    const url = encode.apply(this, args), timing = pending.get(this);
    if (timing?.calculationMs !== undefined) {
      window.normalMapTimings.set(url, { width: this.width, height: this.height,
        calculationMs: timing.calculationMs, totalMs: performance.now() - timing.start });
      pending.delete(this);
    }
    return url;
  };
}

export async function readMapTiming(surface) {
  const map = surface.locator(':scope > .ml-optical filter[id$="-bend"] feImage[href]');
  await map.waitFor({ state: 'attached' });
  const { url, timing } = await map.evaluate(map => {
    const url = map.getAttribute('href');
    return { url, timing: window.normalMapTimings.get(url) };
  });
  assert(timing, 'surface displacement map was not measured');
  const png = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
  return { ...timing, pngSha256: createHash('sha256').update(png).digest('hex') };
}
