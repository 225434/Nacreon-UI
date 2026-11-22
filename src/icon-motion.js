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
