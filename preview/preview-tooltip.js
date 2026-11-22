(() => {
  'use strict';
  window.createTooltipPreview = function () {
    const placements = document.querySelector('#tooltip-placements');
    const specimen = document.querySelector('#tooltip-specimen');
    const examples = document.querySelector('#tooltip-examples');
    const tooltip = specimen.querySelector('ml-tooltip');
    const status = document.querySelector('#stage-state');
    const shortcut = document.querySelector('#shortcut');

    function show() {
      if (specimen.hidden) return;
      const message = tooltip.open ? '提示已显示' : '提示已收起';
      if (status.textContent !== message) status.textContent = message;
      document.querySelector('#state-dot').className = tooltip.open ? 'state-dot on' : 'state-dot off';
      shortcut.hidden = !tooltip.open;
      shortcut.querySelector('kbd').textContent = 'Esc';
      shortcut.querySelector('span').textContent = '收起提示';
    }
    tooltip.addEventListener('ml-toggle', show);
    function reveal() {
      if (!specimen.hidden) tooltip.show();
    }
    placements.addEventListener('change', () => {
      tooltip.setAttribute('placement', placements.querySelector(':checked').value);
      reveal();
    });
    const bookmark = examples.querySelector('#tooltip-bookmark');
    bookmark.querySelector('button').addEventListener('click', event => {
      const button = event.currentTarget;
      const saved = button.getAttribute('aria-pressed') !== 'true';
      button.setAttribute('aria-pressed', String(saved));
      button.querySelector('span').textContent = saved ? '已收藏' : '收藏照片';
      bookmark.setAttribute('text', saved ? '从收藏夹移除这张照片' : '将这张照片加入收藏夹');
    });

    function select(enabled) {
      const entering = enabled && specimen.hidden;
      placements.hidden = specimen.hidden = examples.hidden = !enabled;
      if (!enabled) {
        tooltip.hide();
        for (const item of examples.querySelectorAll('ml-tooltip')) item.hide();
      } else if (entering && location.hash === '#tooltip') {
        reveal();
      }
    }
    function code(head, lines) {
      const side = tooltip.getAttribute('placement');
      return head.concat(lines,
        '  <ml-tooltip text="' + tooltip.getAttribute('text') + '" placement="' + side + '" toggle-on-click>',
        '    <button type="button">照片信息</button>',
        '  </ml-tooltip>', '</div>').join('\n');
    }
    return { select, show, reveal, code };
  };
})();
