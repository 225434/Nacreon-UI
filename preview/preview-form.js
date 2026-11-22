(() => {
  'use strict';

  function bindRecordForm(form) {
    const result = form.querySelector('.ml-form-result');
    form.addEventListener('submit', event => {
      event.preventDefault();
      const data = new FormData(form);
      const area = form.elements.area.selectedOptions[0].textContent;
      result.textContent = '已通过校验 · ' + data.get('recordName') + ' · ' + area + ' · ' +
        data.get('frames') + ' 张 · ' + data.getAll('reviewers').length + ' 人复核';
    });
    form.addEventListener('input', () => { result.textContent = ''; });
    form.addEventListener('reset', () => { result.textContent = ''; });
  }

  window.createFormPreview = function (bundleTags) {
    const layouts = document.querySelector('#form-layouts');
    const tools = document.querySelector('#form-tools');
    const specimen = document.querySelector('#form-specimen');
    const source = document.querySelector('#form-template').content.firstElementChild;
    const examples = document.querySelector('#form-examples');
    const sample = source.cloneNode(true);
    specimen.append(sample);
    const form = sample.form;
    const result = form.querySelector('.ml-form-result');
    const reviewers = form.querySelector('ml-multi-select');
    const layout = () => layouts.querySelector(':checked').value;
    const state = document.querySelector('#stage-state');

    function show() {
      if (specimen.hidden) return;
      const submitted = Boolean(result.textContent);
      const summary = form.querySelector('.ml-form-summary');
      const message = submitted ? '已通过校验' : summary && !summary.hidden
        ? summary.querySelector('strong').textContent : '等待提交';
      if (state.textContent !== message) state.textContent = message;
      document.querySelector('#state-dot').className = submitted ? 'state-dot on' : 'state-dot off';
      document.querySelector('#shortcut').hidden = true;
    }

    bindRecordForm(form);
    layouts.addEventListener('change', () => sample.setAttribute('layout', layout()));
    tools.addEventListener('click', () => {
      form.elements.recordName.value = '封面选片';
      form.elements.area.value = 'mountains';
      form.elements.frames.value = '96';
      reviewers.values = ['member-a', 'member-b'];
      form.elements.notes.value = '核对山间湖泊的封面和照片数量。';
      form.elements.notes.dispatchEvent(new Event('input', { bubbles: true }));
    });
    new MutationObserver(show).observe(form, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'] });

    const attachment = examples.querySelector('form');
    const attachmentResult = attachment.querySelector('.ml-form-result');
    attachment.addEventListener('submit', event => {
      event.preventDefault();
      const files = new FormData(attachment).getAll('attachments');
      attachmentResult.textContent = '已通过校验 · ' + files.map(file => file.name).join('、');
    });
    for (const event of ['input', 'reset']) attachment.addEventListener(event, () => { attachmentResult.textContent = ''; });

    function select(enabled) {
      layouts.hidden = tools.hidden = specimen.hidden = examples.hidden = !enabled;
      if (!enabled) reviewers.close();
    }

    function code(head, lines) {
      const copy = source.cloneNode(true);
      copy.id = 'record-form-sample';
      copy.setAttribute('layout', layout());
      const dependencies = ['input', 'select', 'multi-select'].flatMap(bundleTags);
      lines[2] = lines[2].replace(/>$/, ' data-ml-theme-surface>');
      return head.concat(dependencies, '', lines, '  ' + copy.outerHTML, '</div>', '', '<script>',
        '  (' + bindRecordForm.toString() + ')(document.querySelector("#record-form-sample > form"));',
        '</script>').join('\n');
    }
    return { select, show, code };
  };
})();
