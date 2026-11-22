(() => {
  'use strict';

  function bindWizard(root, update = () => {}) {
    const steps = root.querySelector('ml-steps');
    const items = [...steps.querySelectorAll('li[data-step]')];
    const panels = [...root.querySelectorAll('ml-form[data-wizard-step]')];
    const forms = panels.map(panel => panel.querySelector('form'));
    const success = root.querySelector('.steps-success');
    const last = panels.length - 1;
    const completed = new Set();
    const errors = new Set();
    let index = 0;
    let finished = false;

    function isInvalid(form) {
      return [...form.elements].some(field => field.willValidate && !field.validity.valid);
    }

    function forgetFrom(start) {
      for (const step of completed) if (step >= start) completed.delete(step);
    }

    function values() {
      const record = Object.fromEntries(new FormData(forms[0]));
      const sampling = Object.fromEntries(new FormData(forms[1]));
      return {
        ...record, ...sampling,
        site: forms[0].elements.site.selectedOptions[0].textContent,
        frames: sampling.frames + ' 张',
        notes: sampling.notes.trim() || '—',
      };
    }

    function render(focus = false) {
      for (const [i, item] of items.entries()) {
        item.toggleAttribute('data-complete', completed.has(i));
        item.toggleAttribute('data-error', errors.has(i));
        item.querySelector('button').disabled = finished || i >= index || !completed.has(i);
        panels[i].hidden = finished || i !== index;
      }
      steps.current = items[index].dataset.step;
      steps.toggleAttribute('finished', finished);
      steps.refresh();
      success.hidden = !finished;
      if (focus) (finished ? success : panels[index]).querySelector('h3').focus();
      update({ index, count: items.length, finished, error: errors.has(index) });
    }

    function go(target) {
      index = target;
      if (target === last) {
        const data = values();
        for (const entry of panels[last].querySelectorAll('[data-review]')) entry.textContent = data[entry.dataset.review];
      }
      render(true);
    }

    function reset() {
      for (const form of forms) form.reset();
      completed.clear();
      errors.clear();
      finished = false;
      go(0);
    }

    for (const [i, form] of forms.entries()) {
      form.addEventListener('invalid', () => {
        if (i !== index || finished || errors.has(i)) return;
        errors.add(i);
        forgetFrom(i);
        render();
      }, true);
      const edit = event => {
        if (index !== i || finished || event.isComposing || !event.target.name || event.target.form !== form) return;
        forgetFrom(i);
        if (errors.has(i) && !isInvalid(form)) errors.delete(i);
        render();
      };
      form.addEventListener('input', edit);
      form.addEventListener('change', edit);
      form.addEventListener('submit', event => {
        event.preventDefault();
        if (index !== i || finished) return;
        errors.delete(i);
        if (i < last) {
          completed.add(i);
          go(i + 1);
          return;
        }
        const invalid = forms.findIndex(isInvalid);
        if (invalid >= 0) {
          forgetFrom(invalid);
          errors.add(invalid);
          go(invalid);
          panels[invalid].reportValidity();
          return;
        }
        completed.add(i);
        finished = true;
        const data = values();
        success.querySelector('[data-steps-result]').textContent = '本地示例 · ' + data.recordName + ' · ' + data.site + ' · ' + data.frames;
        render(true);
      });
    }

    steps.addEventListener('ml-step-request', event => {
      const target = items.findIndex(item => item.dataset.step === event.detail.step);
      if (!finished && completed.has(target) && target < index) go(target);
    });
    root.addEventListener('click', event => {
      if (event.target.closest('[data-steps-back]') && index > 0 && !finished) go(index - 1);
      else if (event.target.closest('[data-steps-reset]')) reset();
    });
    render();
    return { reset };
  }

  window.createStepsPreview = function (bundleTags) {
    const specimen = document.querySelector('#steps-specimen');
    const orientations = document.querySelector('#steps-orientations');
    const tools = document.querySelector('#steps-tools');
    const examples = document.querySelector('#steps-examples');
    const source = document.querySelector('#steps-template').content.firstElementChild;
    const sample = source.cloneNode(true);
    specimen.append(sample);
    const steps = sample.querySelector('ml-steps');
    const stage = document.querySelector('#stage-state');
    const orientation = () => orientations.querySelector(':checked').value;
    let state;

    function show() {
      if (specimen.hidden || !state) return;
      const message = state.finished ? '流程已完成'
        : '第 ' + (state.index + 1) + ' 步 / 共 ' + state.count + ' 步' + (state.error ? ' · 请检查当前步骤' : '');
      if (stage.textContent !== message) stage.textContent = message;
      document.querySelector('#state-dot').className = state.finished ? 'state-dot on' : 'state-dot';
      document.querySelector('#shortcut').hidden = true;
    }

    const wizard = bindWizard(sample, next => { state = next; show(); });
    orientations.addEventListener('change', () => steps.setAttribute('orientation', orientation()));
    tools.querySelector('button').addEventListener('click', wizard.reset);

    const flow = examples.querySelector('ml-steps');
    const flowStatus = examples.querySelector('#steps-flow-status');
    const notes = {
      received: '素材记录 DEMO-101 已提交。',
      checked: '资料核对发现 1 项附件待补充。',
      supplement: '缺少湖泊精选拍摄照片，待补齐后继续。',
      archive: '附件补齐并通过复核后进入归档。',
    };
    flow.addEventListener('ml-step-request', event => {
      flow.current = event.detail.step;
      flowStatus.textContent = notes[flow.current];
    });

    function select(enabled) {
      orientations.hidden = tools.hidden = specimen.hidden = examples.hidden = !enabled;
    }

    function code(head, lines) {
      const copy = source.cloneNode(true);
      copy.id = 'steps-wizard-sample';
      copy.querySelector('ml-steps').setAttribute('orientation', orientation());
      const dependencies = ['form', 'input', 'select'].flatMap(bundleTags);
      lines[2] = lines[2].replace(/>$/, ' data-ml-theme-surface>');
      const style = document.querySelector('#steps-demo-style').textContent.trim();
      return head.concat(dependencies, '', '<style>', style, '</style>', '', lines, '  ' + copy.outerHTML, '</div>', '', '<script>',
        '  Promise.all(["ml-steps", "ml-form", "ml-input", "ml-select"].map(name => customElements.whenDefined(name))).then(() => {',
        '    (' + bindWizard.toString() + ')(document.getElementById("steps-wizard-sample"));',
        '  });', '</script>').join('\n');
    }
    return { select, show, code };
  };
})();
