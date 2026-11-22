(() => {
  'use strict';
  window.createAccordionPreview = function (inlineIcons) {
    const source = document.querySelector('#accordion-template').content.firstElementChild;
    const specimen = document.querySelector('#accordion-specimen');
    const examples = document.querySelector('#accordion-examples');
    const modes = document.querySelector('#accordion-modes');
    const status = document.querySelector('#stage-state');
    const dot = document.querySelector('#state-dot');
    const shortcut = document.querySelector('#shortcut');
    const accordion = source.cloneNode(true);
    specimen.append(accordion);

    function show() {
      if (specimen.hidden) return;
      const open = accordion.querySelectorAll(':scope > details[open]').length;
      const text = open ? '已展开 ' + open + ' 项' : '已全部收起';
      if (status.textContent !== text) status.textContent = text;
      dot.className = open ? 'state-dot on' : 'state-dot off';
      shortcut.hidden = false;
      shortcut.querySelector('kbd').textContent = '↑ ↓';
      shortcut.querySelector('span').textContent = '移动到相邻标题';
    }
    accordion.addEventListener('toggle', event => {
      if (event.target.parentElement === accordion) show();
    }, true);
    modes.addEventListener('change', () => {
      accordion.setAttribute('mode', modes.querySelector(':checked').value);
      show();
    });

    function select(enabled) {
      modes.hidden = specimen.hidden = examples.hidden = !enabled;
    }
    function code(head, lines) {
      const sample = source.cloneNode(true);
      sample.setAttribute('mode', accordion.getAttribute('mode'));
      const items = accordion.querySelectorAll(':scope > details');
      sample.querySelectorAll(':scope > details').forEach((item, index) => { item.open = items[index].open; });
      sample.querySelector('textarea').textContent = '\n' + accordion.querySelector('textarea').value;
      inlineIcons(sample);
      lines[2] = lines[2].replace(/>$/, ' data-ml-theme-surface>');
      const css = document.querySelector('#accordion-demo-style').textContent.trimEnd();
      return head.concat('<style>' + css + '\n</style>', '', lines, '  ' + sample.outerHTML, '</div>').join('\n');
    }
    return { select, show, code };
  };
})();
