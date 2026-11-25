(() => {
  'use strict';

  function bindRequest(example, region, update, pendingMessage, doneMessage) {
    const button = example.querySelector('button');
    const status = example.querySelector('[data-loading-announcement]');
    button.addEventListener('click', () => {
      if (region.getAttribute('aria-busy') === 'true') return;
      region.setAttribute('aria-busy', 'true');
      button.setAttribute('aria-disabled', 'true');
      update(true);
      status.textContent = pendingMessage;
      setTimeout(() => {
        update(false);
        region.setAttribute('aria-busy', 'false');
        button.removeAttribute('aria-disabled');
        status.textContent = doneMessage;
      }, 1500);
    });
  }

  window.createLoadingPreview = function () {
    const kinds = document.querySelector('#loading-kinds');
    const tools = document.querySelector('#loading-tools');
    const variants = document.querySelector('#spinner-variants');
    const presets = document.querySelector('#skeleton-presets');
    const specimen = document.querySelector('#loading-specimen');
    const examples = document.querySelector('#loading-examples');
    const body = document.querySelector('#loading-preview-body');
    const result = document.querySelector('#loading-preview-result');
    const indicator = specimen.querySelector('ml-spinner');
    const waiting = indicator.parentElement;
    const skeleton = specimen.querySelector('ml-skeleton');
    const toggle = document.querySelector('#loading-toggle');
    const status = document.querySelector('#stage-state');
    const selected = options => options.querySelector(':checked').value;
    let busy = true;

    function render() {
      const showSpinner = selected(kinds) === 'spinner';
      const preset = showSpinner ? 'list' : selected(presets);
      if (busy) body.setAttribute('aria-busy', 'true');
      body.dataset.preset = preset;
      indicator.setAttribute('variant', selected(variants));
      skeleton.setAttribute('preset', preset);
      waiting.hidden = !busy || !showSpinner;
      skeleton.hidden = !busy || showSpinner;
      result.hidden = busy;
      result.querySelector('.loading-records').hidden = preset !== 'list';
      result.querySelector('.loading-record-card').hidden = preset !== 'card';
      result.querySelector('.loading-record-table').hidden = preset !== 'table';
      if (!busy) body.setAttribute('aria-busy', 'false');
      variants.hidden = !showSpinner;
      presets.hidden = showSpinner;
      toggle.textContent = busy ? '完成加载' : '重新加载';
      const message = busy ? '正在读取记录' : '素材记录已载入';
      if (status.textContent !== message) status.textContent = message;
      document.querySelector('#state-dot').className = busy ? 'state-dot' : 'state-dot on';
      document.querySelector('#shortcut').hidden = true;
    }
    for (const options of [kinds, variants, presets]) options.addEventListener('change', () => {
      busy = true;
      render();
    });
    toggle.addEventListener('click', () => { busy = !busy; render(); });

    const sync = document.querySelector('#loading-sync-example');
    const syncSpinner = sync.querySelector('ml-spinner');
    bindRequest(sync, sync.querySelector('#loading-sync-content'), loading => { syncSpinner.hidden = !loading; },
      '正在同步示例目录', '已同步 12 份示例文件');
    const list = document.querySelector('#loading-list-example');
    const listSkeleton = list.querySelector('ml-skeleton');
    const loadedList = list.querySelector('[data-loaded-list]');
    loadedList.append(result.querySelector('.loading-records').cloneNode(true));
    bindRequest(list, list.querySelector('#loading-list-content'), loading => {
      listSkeleton.hidden = !loading;
      loadedList.hidden = loading;
    }, '正在刷新记录', '已加载 3 条记录');

    function select(enabled) {
      for (const panel of [kinds, tools, specimen, examples]) panel.hidden = !enabled;
    }
    function code(head, lines) {
      lines[2] = lines[2].replace(/>$/, ' data-ml-theme-surface>');
      if (selected(kinds) === 'spinner') {
        return head.concat(lines,
          '  <ml-material>',
          '    <ml-spinner variant="' + selected(variants) + '" size="large" layout="stacked" label="正在读取素材记录" show-label></ml-spinner>',
          '  </ml-material>', '</div>').join('\n');
      }
      return head.concat(lines,
        '  <p class="ml-loading-sr" role="status">正在读取素材记录</p>',
        '  <ml-material style="display:block; max-inline-size:32rem">',
        '    <div aria-busy="true">',
        '      <ml-skeleton preset="' + selected(presets) + '"></ml-skeleton>',
        '    </div>', '  </ml-material>', '</div>').join('\n');
    }
    return { select, show: render, code };
  };
})();
