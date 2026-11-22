(() => {
  'use strict';
  const motion = window.MaterialMotion;

  window.createMotionPreview = function (chooseLevel) {
    const picker = document.querySelector('#motion-kinds');
    const hero = document.querySelector('#motion-specimen');
    const grid = document.querySelector('#motion-examples');
    const play = document.querySelector('#motion-play');
    const sync = document.querySelector('#motion-sync');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const cards = new Map();
    const samples = [];
    const state = { move: false, press: false, reveal: true };
    let kind = 'move', mounted;

    function makeCards() {
      for (const level of motion.levels) {
        const card = document.createElement('div');
        card.className = 'motion-card';
        card.dataset.mlMaterial = 'base';
        card.dataset.mlMotion = level.value;
        card.innerHTML = `<div class="motion-sample" aria-hidden="true" inert></div>
          <label><input type="radio" name="motion-comparison"><strong></strong></label>
          <span class="motion-time"></span><span class="motion-meter" aria-hidden="true"></span>
          <p></p>`;
        const radio = card.querySelector('input');
        radio.value = level.value;
        const timeId = 'motion-time-' + level.value, descriptionId = 'motion-description-' + level.value;
        card.querySelector('.motion-time').id = timeId;
        card.querySelector('p').id = descriptionId;
        radio.setAttribute('aria-describedby', timeId + ' ' + descriptionId);
        card.querySelector('strong').textContent = level.label + ' · ' + level.name;
        card.querySelector('p').textContent = level.description;
        cards.set(level.value, card);
        grid.append(card);
      }
    }

    function setPosition(sample, atEnd) {
      sample.track.toggleAttribute('data-ml-end', atEnd);
      sample.button.setAttribute('aria-label', atEnd ? '返回起点' : '移至终点');
    }

    function setFavorite(sample, selected) {
      sample.button.setAttribute('aria-pressed', String(selected));
      sample.button.querySelector('span').textContent = selected ? '已收藏' : '收藏';
    }

    function mount() {
      if (!cards.size) makeCards();
      for (const sample of samples) motion.finish(sample.target);
      samples.length = 0;
      const template = document.getElementById('motion-' + kind + '-template');
      for (const host of [hero, ...Array.from(cards.values(), card => card.querySelector('.motion-sample'))]) {
        host.replaceChildren(template.content.cloneNode(true));
        const target = host.querySelector('ml-material');
        const sample = { target, button: target.querySelector('button'), track: host.querySelector('.ml-motion-track') };
        if (kind === 'move') setPosition(sample, state.move);
        if (kind === 'press') setFavorite(sample, state.press);
        if (kind === 'reveal') target.hidden = !state.reveal;
        samples.push(sample);
      }
      if (kind === 'reveal') {
        samples[0].target.id = 'motion-live-notice';
        play.setAttribute('aria-controls', 'motion-live-notice');
      } else {
        play.removeAttribute('aria-controls');
        play.removeAttribute('aria-expanded');
      }
      mounted = kind;
    }

    function show() {
      if (mounted !== kind) mount();
      const instant = reduced.matches;
      const on = state[kind];
      const status = kind === 'move' ? (on ? '位于终点' : '位于起点') : kind === 'press' ? (on ? '已收藏' : '未收藏') : (on ? '提示已显示' : '提示已收起');
      const action = kind === 'move' ? (on ? '返回起点' : '移至终点') : kind === 'press' ? (on ? '取消收藏' : '收藏') : (on ? '收起提示' : '显示提示');
      const timingAction = kind === 'reveal' ? (on ? 'exit' : 'enter') : kind;
      const time = motion.timing(samples[0].target, timingAction).duration;
      play.querySelector('span').textContent = action;
      if (kind === 'reveal') play.setAttribute('aria-expanded', String(on));
      const suffix = instant ? '系统已减少动态' : '下次' + (kind === 'reveal' ? (on ? '退场' : '入场') : '动作');
      document.querySelector('#stage-state').textContent = status + ' · ' + suffix + ' ' + time + ' ms';
      document.querySelector('#shortcut').hidden = true;
      const max = Math.max(1, motion.timing(cards.get('high'), timingAction).duration);
      for (const [value, card] of cards) {
        const duration = motion.timing(card, timingAction).duration;
        card.querySelector('input').checked = value === document.documentElement.dataset.mlMotion;
        card.querySelector('.motion-time').textContent = duration + ' ms';
        card.style.setProperty('--motion-length', duration / max * 100 + '%');
      }
    }

    function run() {
      const next = !state[kind];
      for (const sample of samples) {
        if (kind === 'move') motion.move(sample.target, () => setPosition(sample, next));
        if (kind === 'press') { setFavorite(sample, next); motion.press(sample.target); }
        if (kind === 'reveal') motion.reveal(sample.target, next, sample === samples[0] ? play : null);
      }
      state[kind] = next;
      show();
    }

    picker.addEventListener('change', event => { kind = event.target.value; show(); });
    hero.addEventListener('click', event => { if (event.target.closest('button')) run(); });
    play.addEventListener('click', run);
    sync.addEventListener('click', run);
    grid.addEventListener('change', event => chooseLevel(event.target.value));

    function select(visible) {
      for (const control of [picker, hero, grid, sync, play]) control.hidden = !visible;
      if (!visible) for (const sample of samples) motion.finish(sample.target);
    }

    function code(head, lines) {
      if (kind === 'move') return head.concat(lines,
        '  <div class="ml-motion-track" id="track" style="max-width: 20rem"' + (state.move ? ' data-ml-end' : '') + '>',
        '    <ml-material class="ml-motion-item"><button type="button">' + (state.move ? '返回起点' : '移至终点') + '</button></ml-material>',
        '  </div>', '</div>', '', '<script>',
        "  const track = document.querySelector('#track');", "  const item = track.querySelector('ml-material');",
        "  const button = item.querySelector('button');", "  button.addEventListener('click', () => {",
        '    MaterialMotion.move(item, () => {', "      const atEnd = track.toggleAttribute('data-ml-end');",
        "      button.textContent = atEnd ? '返回起点' : '移至终点';", '    });', '  });', '</script>').join('\n');
      if (kind === 'press') return head.concat(lines,
        '  <ml-material id="favorite"><button type="button" aria-pressed="' + state.press + '" aria-label="收藏">' +
          (state.press ? '已收藏' : '收藏') + '</button></ml-material>',
        '</div>', '', '<script>', "  const surface = document.querySelector('#favorite');",
        "  const button = surface.querySelector('button');", "  button.addEventListener('click', () => {",
        "    const selected = button.getAttribute('aria-pressed') !== 'true';",
        "    button.setAttribute('aria-pressed', String(selected));", "    button.textContent = selected ? '已收藏' : '收藏';",
        '    MaterialMotion.press(surface);', '  });', '</script>').join('\n');
      return head.concat(lines,
        '  <button type="button" id="toggle-notice" aria-controls="notice" aria-expanded="' + state.reveal + '">' +
          (state.reveal ? '收起提示' : '显示提示') + '</button>',
        '  <ml-material id="notice"' + (state.reveal ? '' : ' hidden') + '>更改已保存</ml-material>', '</div>', '', '<script>',
        "  const button = document.querySelector('#toggle-notice');", "  const notice = document.querySelector('#notice');",
        "  button.addEventListener('click', () => {", "    const open = button.getAttribute('aria-expanded') !== 'true';",
        '    MaterialMotion.reveal(notice, open, button);', "    button.textContent = open ? '收起提示' : '显示提示';",
        '  });', '</script>').join('\n');
    }

    return { select, show, code };
  };
})();
