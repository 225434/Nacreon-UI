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
