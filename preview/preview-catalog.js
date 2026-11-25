(() => {
  'use strict';

  const sample = `<ml-navigation-panel label="偏好设置" search-label="搜索展示文本">
  <nav aria-label="偏好设置">
    <section data-icon="sun">
      <h3>显示与文字</h3>
      <section data-icon="keyboard">
        <h4>文字预览</h4>
        <p>标题示例<small>山间来信</small></p>
        <p>正文示例<small>清晨的光穿过树梢，落在翻开的书页上。</small></p>
        <p>注释示例<small>摘自周末的阅读笔记。</small></p>
      </section>
      <p>外观名称<small>晨雾白</small></p>
    </section>
    <section data-icon="bell">
      <h3>通知样式</h3>
      <p>通知标题<small>阅读提醒</small></p>
      <p>通知正文<small>你收藏的随笔已更新。</small></p>
    </section>
    <section data-icon="layers">
      <h3>声音与触感</h3>
      <p>提示音名称<small>溪流</small></p>
      <p>触感说明<small>两次轻触，间隔短暂。</small></p>
    </section>
  </nav>
</ml-navigation-panel>`;

  window.createCatalogPreview = function () {
    const options = document.querySelector('#catalog-options');
    const specimen = document.querySelector('#catalog-specimen');
    specimen.innerHTML = sample;
    const directory = specimen.querySelector('ml-navigation-panel');
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'ml-navigation-panel-trigger';
    trigger.textContent = '打开偏好设置';
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-controls', 'sample-catalog-dialog');
    trigger.setAttribute('aria-expanded', 'false');
    const modal = document.createElement('ml-dialog');
    modal.setAttribute('dismiss-on-backdrop', '');
    const dialog = document.createElement('dialog');
    dialog.id = 'sample-catalog-dialog';
    dialog.setAttribute('aria-label', '偏好设置');
    modal.append(dialog);
    specimen.append(trigger, modal);
    trigger.addEventListener('click', event => directory.showModal(trigger, {
      focusSearch: event.detail === 0 || !matchMedia('(pointer: coarse)').matches,
    }));
    const isModal = () => options.querySelector('[name="catalog-kind"]:checked').value === 'dialog';
    const isCompact = () => options.querySelector('[name="catalog-density"]:checked').value === 'compact';
    function show() {
      const popup = isModal();
      directory.setAttribute('density', isCompact() ? 'compact' : 'normal');
      trigger.hidden = !popup;
      if (popup && directory.parentElement !== dialog) dialog.append(directory);
      if (!popup && directory.parentElement !== specimen) {
        if (modal.open) modal.close();
        specimen.prepend(directory);
        directory.reset();
      }
      document.querySelector('#stage-state').textContent = popup ? '弹窗' : '页面内嵌';
      document.querySelector('#state-dot').className = 'state-dot on';
      document.querySelector('#shortcut').hidden = true;
    }
    options.addEventListener('change', show);
    function select(enabled) {
      options.hidden = specimen.hidden = !enabled;
      if (!enabled && modal.open) modal.close();
    }
    function code(head, lines) {
      const markup = isCompact() ? sample.replace('<ml-navigation-panel ', '<ml-navigation-panel density="compact" ') : sample;
      const rows = markup.split('\n');
      if (!isModal()) return [...head, ...lines, ...rows.map(row => '  ' + row), '</div>'].join('\n');
      return [...head, ...lines,
        '  <button type="button" id="show-preferences" class="ml-navigation-panel-trigger" aria-haspopup="dialog"',
        '          aria-controls="preferences-dialog" aria-expanded="false">打开偏好设置</button>',
        '  <ml-dialog dismiss-on-backdrop>', '    <dialog id="preferences-dialog" aria-label="偏好设置">',
        ...rows.map(row => '      ' + row), '    </dialog>', '  </ml-dialog>', '</div>', '',
        '<script type="module">',
        '  const panel = document.querySelector("#preferences-dialog > ml-navigation-panel");',
        '  document.getElementById("show-preferences").addEventListener("click", event => {',
        '    panel.showModal(event.currentTarget, { focusSearch: event.detail === 0 || !matchMedia("(pointer: coarse)").matches });',
        '  });', '</script>'].join('\n');
    }
    return { select, show, code };
  };
})();
