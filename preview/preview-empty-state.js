(() => {
  'use strict';

  const messages = {
    empty: { title: '暂无素材记录', description: '新建一条记录后，就可以在这里查看整理结果。',
      action: '新建示例记录', recovered: '已新建 1 条示例记录', status: '等待创建记录' },
    search: { title: '没有匹配的记录', description: '可以换一个关键词，或清除当前筛选。',
      action: '清除筛选', recovered: '已清除筛选，显示 1 条记录', status: '筛选结果为 0 条' },
    error: { title: '素材记录加载失败', description: '请检查连接，然后重新加载记录。',
      action: '重新加载', recovered: '已重新加载 1 条示例记录', status: '等待重试' },
    restricted: { title: '需要查看权限', description: '请联系工作区管理员开通此目录的访问权限。',
      status: '等待授权' },
  };

  // The exported example uses the same native controls and focus behavior as the live preview.
  function bindRecovery(root, onChange) {
    const state = root.querySelector('ml-empty-state');
    const action = root.querySelector('[data-empty-action]');
    if (!action) return;
    const result = root.querySelector('[data-empty-result]');
    function showResult(recovered) {
      state.hidden = recovered;
      result.hidden = !recovered;
      (recovered ? result.querySelector('h3') : action).focus();
      onChange?.();
    }
    action.addEventListener('click', () => showResult(true));
    result.querySelector('[data-empty-reset]').addEventListener('click', () => showResult(false));
  }

  window.createEmptyStatePreview = function () {
    const kinds = document.querySelector('#empty-state-kinds');
    const layouts = document.querySelector('#empty-state-layouts');
    const specimen = document.querySelector('#empty-state-specimen');
    const examples = document.querySelector('#empty-state-examples');
    const source = document.querySelector('#empty-state-template').content.firstElementChild;
    const kind = () => kinds.querySelector(':checked').value;
    let sample;

    function applyLayout(state) {
      const panel = layouts.querySelector(':checked').value === 'panel';
      if (panel) {
        state.setAttribute('variant', 'panel');
        state.removeAttribute('density');
      } else {
        state.removeAttribute('variant');
        state.setAttribute('density', 'compact');
      }
    }
    function makeSample() {
      const copy = source.cloneNode(true);
      const state = copy.querySelector('ml-empty-state');
      const message = messages[kind()];
      state.setAttribute('kind', kind());
      applyLayout(state);
      state.querySelector('.ml-empty-title').textContent = message.title;
      state.querySelector('.ml-empty-description').textContent = message.description;
      if (message.action) state.querySelector('[data-empty-action]').textContent = message.action;
      else {
        state.querySelector('.ml-empty-actions').remove();
        copy.querySelector('[data-empty-result]').remove();
      }
      return copy;
    }
    function readout() {
      const recovered = sample.querySelector('ml-empty-state').hidden;
      const message = messages[kind()];
      document.querySelector('#stage-state').textContent = recovered ? message.recovered : message.status;
      document.querySelector('#state-dot').className = recovered ? 'state-dot on' : 'state-dot off';
      document.querySelector('#shortcut').hidden = true;
    }
    function showScenario() {
      sample = makeSample();
      specimen.replaceChildren(sample);
      bindRecovery(sample, readout);
      if (!specimen.hidden) readout();
    }
    kinds.addEventListener('change', showScenario);
    layouts.addEventListener('change', () => applyLayout(sample.querySelector('ml-empty-state')));
    showScenario();

    const filterExample = examples.querySelector('#empty-filter-example');
    const field = filterExample.querySelector('ml-input');
    const table = filterExample.querySelector('ml-data-table');
    const filterStatus = filterExample.querySelector('[role="status"]');
    function filter() {
      const query = field.value.trim().toLocaleLowerCase();
      for (const row of table.table.tBodies[0].rows) {
        row.hidden = !row.cells[0].textContent.toLocaleLowerCase().includes(query);
      }
      table.refresh();
      filterStatus.textContent = '显示 ' + table.visibleRows.length + ' 条记录';
    }
    field.addEventListener('input', filter);
    filterExample.querySelector('[data-empty-clear]').addEventListener('click', () => {
      field.value = '';
      field.control.focus();
      filter();
    });
    filter();

    const savedExample = examples.querySelector('#empty-saved-example');
    const savedEmpty = savedExample.querySelector('ml-empty-state');
    const savedList = savedExample.querySelector('[data-empty-saved]');
    const save = savedExample.querySelector('[data-empty-save]');
    const remove = savedExample.querySelector('[data-empty-remove]');
    function setSaved(saved) {
      savedEmpty.hidden = saved;
      savedList.hidden = !saved;
      (saved ? remove : save).focus();
      savedExample.querySelector('[role="status"]').textContent = saved ? '已收藏山间湖泊' : '已取消收藏山间湖泊';
    }
    save.addEventListener('click', () => setSaved(true));
    remove.addEventListener('click', () => setSaved(false));

    function select(enabled) {
      kinds.hidden = layouts.hidden = specimen.hidden = examples.hidden = !enabled;
    }
    function code(head, lines) {
      const copy = makeSample();
      copy.id = 'sample-empty-state';
      lines[2] = lines[2].replace(/>$/, ' data-ml-theme-surface>');
      const markup = copy.outerHTML.replace(/\n {4}/g, '\n').trimEnd().split('\n').map(line => '  ' + line);
      const snippet = head.concat(lines, markup, '</div>');
      if (messages[kind()].action) {
        snippet.push('', '<script>', '(' + bindRecovery.toString() + ')(document.getElementById("sample-empty-state"));', '</script>');
      }
      return snippet.join('\n');
    }
    return { select, readout, code };
  };
})();
