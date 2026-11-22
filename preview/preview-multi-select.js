(() => {
  'use strict';

  window.createMultiSelectPreview = function () {
    const states = document.querySelector('#multi-select-states');
    const specimen = document.querySelector('#multi-select-specimen');
    const examples = document.querySelector('#multi-select-examples');
    const source = document.querySelector('#multi-select-template').content.firstElementChild;
    specimen.append(source.cloneNode(true));
    const field = specimen.querySelector('ml-multi-select');

    function show() {
      if (specimen.hidden) return;
      const disabled = field.select.disabled;
      const value = field.values.length;
      const message = disabled ? '已禁用' : value ? '已选 ' + value + ' 个相册' : '尚未选择相册';
      const status = document.querySelector('#stage-state');
      if (status.textContent !== message) status.textContent = message;
      document.querySelector('#state-dot').className = value && !disabled ? 'state-dot' : 'state-dot off';
      const shortcut = document.querySelector('#shortcut');
      shortcut.hidden = disabled;
      shortcut.querySelector('kbd').textContent = field.open ? 'Esc' : '↓';
      shortcut.querySelector('span').textContent = field.open ? '收起选项' : '展开选项';
      shortcut.title = '将键盘焦点移到多选框后操作';
    }
    states.addEventListener('change', () => {
      field.select.disabled = states.querySelector(':checked').value === 'disabled';
      field.refresh();
      show();
    });
    field.addEventListener('change', show);
    new MutationObserver(show).observe(field, { attributes: true, attributeFilter: ['data-ml-multi-open'] });

    const form = document.querySelector('#multi-select-form');
    const output = document.querySelector('#multi-report-output');
    form.addEventListener('submit', event => {
      event.preventDefault();
      output.textContent = '提交值 ' + new FormData(form).getAll('area').join('、');
    });
    form.addEventListener('reset', () => { output.textContent = ''; });

    const columns = document.querySelector('#multi-columns');
    const cells = [...document.querySelectorAll('#multi-column-table [data-column]')];
    columns.addEventListener('change', () => {
      const displayed = new Set(columns.values);
      for (const cell of cells) cell.hidden = !displayed.has(cell.dataset.column);
    });

    function select(enabled) {
      if (!enabled) for (const picker of document.querySelectorAll('ml-multi-select')) picker.close();
      states.hidden = specimen.hidden = examples.hidden = !enabled;
    }
    function code(head, lines) {
      const sample = source.cloneNode(true);
      const native = sample.querySelector('select');
      native.disabled = field.select.disabled;
      for (const [index, option] of [...native.options].entries()) {
        option.toggleAttribute('selected', field.select.options[index].selected);
      }
      lines[2] = lines[2].replace(/>$/, ' data-ml-theme-surface>');
      return head.concat(lines, '  ' + sample.outerHTML, '</div>').join('\n');
    }
    return { select, show, code };
  };
})();
