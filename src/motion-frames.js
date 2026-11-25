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
