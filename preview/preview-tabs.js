(() => {
  'use strict';

  window.createTabsPreview = function (inlineIcons) {
    const source = document.querySelector('#tabs-template').content.firstElementChild;
    const layouts = document.querySelector('#tabs-layouts');
    const variants = document.querySelector('#tabs-variants');
    const activation = document.querySelector('#tabs-activation');
    const tools = document.querySelector('#tabs-tools');
    const specimen = document.querySelector('#tabs-specimen');
    const examples = document.querySelector('#tabs-examples');
    const tabs = source.cloneNode(true);
    specimen.append(tabs);

    function show() {
      if (specimen.hidden) return;
      const selected = tabs.querySelector('[aria-selected="true"]');
      const text = selected?.textContent.trim() || '请选择页签';
      const status = document.querySelector('#stage-state');
      if (status.textContent !== text) status.textContent = text;
      document.querySelector('#state-dot').className = 'state-dot';
      const shortcut = document.querySelector('#shortcut');
      shortcut.hidden = false;
      shortcut.querySelector('kbd').textContent = tabs.orientation === 'vertical' ? '↑ ↓' : '← →';
      shortcut.querySelector('span').textContent = tabs.getAttribute('activation') === 'manual' ? '浏览，Enter 确认' : '切换页签';
      shortcut.title = '将键盘焦点移到页签后操作';
    }
    const settings = [[layouts, 'orientation'], [variants, 'variant'], [activation, 'activation']];
    for (const [options, attr] of settings) {
      options.addEventListener('change', () => {
        tabs.setAttribute(attr, options.querySelector(':checked').value);
        show();
      });
    }
    tabs.addEventListener('ml-tab-change', show);
    new MutationObserver(show).observe(tabs, { attributes: true, attributeFilter: ['data-ml-vertical'] });

    function select(enabled) {
      for (const panel of [layouts, tools, specimen, examples]) panel.hidden = !enabled;
    }
    function code(head, lines) {
      const sample = source.cloneNode(true);
      sample.setAttribute('value', tabs.value);
      for (const [, attr] of settings) {
        if (tabs.hasAttribute(attr)) sample.setAttribute(attr, tabs.getAttribute(attr));
      }
      for (const panel of sample.querySelectorAll('[data-panel]')) panel.hidden = panel.dataset.panel !== tabs.value;
      // A leading newline preserves the first character when markup is parsed as HTML.
      sample.querySelector('textarea').textContent = '\n' + tabs.querySelector('textarea').value;
      inlineIcons(sample);
      lines[2] = lines[2].replace(/>$/, ' data-ml-theme-surface>');
      const style = document.querySelector('#tabs-demo-style').textContent.trimEnd();
      return head.concat('<style>' + style + '\n</style>', '', lines, '  ' + sample.outerHTML, '</div>').join('\n');
    }
    return { select, show, code };
  };
})();
