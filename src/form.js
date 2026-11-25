(() => {
  'use strict';
  if (customElements.get('ml-form')) return;

  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  const controls = 'input:not([type="hidden"], [type="submit"], [type="reset"], [type="button"], [type="image"]), select, textarea';
  const widgets = 'ml-input, ml-select, ml-multi-select, ml-file-upload, ml-date-range, ml-choice-group';
  const structure = controls + ', form, fieldset, option, .ml-form-hint';
  const fieldAttributes = ['id', 'disabled', 'readonly', 'required', 'form', 'type', 'name', 'min', 'max', 'step',
    'minlength', 'maxlength', 'pattern', 'multiple', 'selected', 'value', 'data-error-message', 'error-message'];
  const ownership = new WeakMap();
  let nextId = 0;

  function fieldGroup(control) {
    return control.closest('.ml-form-field') ?? control.closest(widgets) ?? control;
  }

  function textId(node) {
    if (node.id) return node.id;
    const root = node.getRootNode();
    let id;
    do { id = 'ml-form-text-' + ++nextId; } while (root.getElementById(id));
    node.id = id;
    return id;
  }

  function labelOf(group, control) {
    const label = group.querySelector(':scope > :is(.ml-form-label, legend)');
    return (label?.textContent || control.getAttribute('aria-label') || control.labels?.[0]?.textContent || control.name)
      .replace(/\s*[＊*]\s*$/, '').trim() || '此字段';
  }

  function messageFor(group, control) {
    const { validity, type } = control;
    if (validity.customError) return control.validationMessage;
    const message = control.dataset.errorMessage || group.dataset.errorMessage || control.parentElement?.getAttribute('error-message');
    if (message) return message;
    if (validity.valueMissing) {
      if (type === 'file') return '请选择文件。';
      if (type === 'select-multiple') return '请至少选择一项。';
      if (type === 'select-one' || type === 'radio') return '请选择一项。';
      if (type === 'checkbox') return '请勾选此项。';
      if (type === 'date') return '请选择日期。';
      return '请填写此项。';
    }
    if (validity.typeMismatch && type === 'email') return '请输入有效的电子邮箱地址。';
    if (validity.typeMismatch && type === 'url') return '请输入有效的网址。';
    if (validity.badInput && type === 'number') return '请输入有效的数字。';
    if (validity.tooShort) return '至少输入 ' + control.minLength + ' 个字符。';
    if (validity.tooLong) return '最多输入 ' + control.maxLength + ' 个字符。';
    if (validity.patternMismatch) return '请输入符合要求的格式。';
    if (validity.rangeUnderflow) return '请输入不小于 ' + control.min + ' 的值。';
    if (validity.rangeOverflow) return '请输入不大于 ' + control.max + ' 的值。';
    return control.validationMessage;
  }

  function describe(control, state, ids) {
    const current = control.getAttribute('aria-describedby');
    const retained = (current || '').split(/\s+/).filter(id => id && !state.ids.includes(id));
    state.ids = ids.filter(id => id && !retained.includes(id));
    const next = retained.concat(state.ids).join(' ');
    if (next) {
      if (next !== current) control.setAttribute('aria-describedby', next);
    } else if (current !== null) control.removeAttribute('aria-describedby');
  }

  function markInvalid(control, state, invalid) {
    const current = control.getAttribute('aria-invalid');
    if (invalid) {
      if (state.priorInvalid === undefined) state.priorInvalid = current;
      if (current !== 'true') control.setAttribute('aria-invalid', 'true');
    } else if (state.priorInvalid !== undefined) {
      if (current === 'true') {
        if (state.priorInvalid === null) control.removeAttribute('aria-invalid');
        else control.setAttribute('aria-invalid', state.priorInvalid);
      }
      state.priorInvalid = undefined;
    }
  }

  class MaterialForm extends GlassControl {
    #native;
    #events;
    #managed = new Set();
    #groups = new Map();
    #errors = new Map();
    #touched = new WeakSet();
    #attempted = false;
    #pending = false;
    #pointer = null;
    #deferredBlur;
    #submitClick;
    #summary;
    #live;
    #issues = [];
    #linkedSelector = '';
    #linkedChanges = new MutationObserver(records => {
      const linked = this.#linkedSelector;
      if (!linked) return;
      if (!this.#native?.id) { this.refresh(); return; }
      const containsLink = node => node.nodeType === 1 && (node.matches(linked) || node.querySelector(linked));
      const ownerId = '#' + CSS.escape(this.#native.id);
      if (records.some(({ target, type, attributeName, oldValue, addedNodes, removedNodes }) => {
        if (this.contains(target)) return false;
        if (this.#managed.has(target) || target.closest?.(linked)) return true;
        if (attributeName === 'id') return target.id === this.#native.id || oldValue === this.#native.id;
        if (type === 'attributes') return containsLink(target);
        return [...addedNodes, ...removedNodes].some(node => containsLink(node) ||
          (node.nodeType === 1 && (node.matches(ownerId) || node.querySelector(ownerId)))) ||
          (target.closest?.('.ml-form-field')?.querySelector(linked) &&
            [...addedNodes, ...removedNodes].some(node => node.nodeType === 1 && node.matches('.ml-form-hint')));
      })) this.refresh();
    });
    #structure = new MutationObserver(records => {
      if (records.some(record => record.type === 'attributes' || [...record.addedNodes, ...record.removedNodes]
        .some(node => node.nodeType === 1 && (node.matches(structure) || node.querySelector(structure))))) this.refresh();
    });

    get form() { return this.querySelector(':scope > form'); }
    get glassContent() { return this.form; }

    connectedCallback() {
      super.connectedCallback();
      this.#events = new AbortController();
      const signal = this.#events.signal;
      const root = this.getRootNode();
      root.addEventListener('invalid', this.#invalid, { capture: true, signal });
      root.addEventListener('input', this.#edit, { signal });
      root.addEventListener('change', this.#edit, { signal });
      root.addEventListener('focusout', this.#blur, { signal });
      this.addEventListener('reset', this.#reset, { signal });
      root.addEventListener('click', this.#activateSubmit, { capture: true, signal });
      const doc = this.ownerDocument;
      doc.addEventListener('pointerdown', this.#press, { capture: true, signal });
      doc.addEventListener('pointerup', this.#releasePointer, { capture: true, signal });
      doc.addEventListener('pointercancel', this.#releasePointer, { capture: true, signal });
      doc.defaultView?.addEventListener('blur', this.#releasePointer, { signal });
      this.#structure.observe(this, { childList: true, subtree: true, attributeFilter: fieldAttributes });
      this.refresh();
    }

    disconnectedCallback() {
      this.#events.abort();
      this.#structure.disconnect();
      this.#linkedChanges.disconnect();
      this.#linkedSelector = '';
      this.#pointer = null;
      this.#deferredBlur = null;
      super.disconnectedCallback();
      queueMicrotask(() => {
        if (this.isConnected) return;
        for (const control of this.#managed) this.#release(control);
        this.#groups.clear();
        for (const [group, error] of this.#errors) {
          if (!this.contains(group)) { error.remove(); this.#errors.delete(group); }
        }
      });
    }

    #mount(form) {
      this.#summary?.remove();
      this.#live?.remove();
      for (const error of this.#errors.values()) error.remove();
      for (const control of this.#managed) this.#release(control);
      this.#errors.clear();
      this.#native = form;
      this.#clear();
      if (!form) return;
      // A live region stays mounted while the visible summary opens and closes.
      const doc = this.ownerDocument;
      this.#live = doc.createElement('span');
      this.#live.className = 'ml-form-live';
      this.#live.setAttribute('role', 'status');
      this.#summary = doc.createElement('div');
      this.#summary.className = 'ml-form-summary';
      this.#summary.hidden = true;
      this.#summary.tabIndex = -1;
      this.#summary.setAttribute('role', 'group');
      this.#summary.setAttribute('aria-label', '表单校验错误');
      this.#summary.innerHTML = '<p><strong></strong></p><ul role="list"></ul>';
      this.#summary.addEventListener('click', event => {
        const button = event.target.closest('button[data-field]');
        if (button) this.#focus(this.#issues[Number(button.dataset.field)]?.control);
      });
      form.prepend(this.#live, this.#summary);
    }

    #claim(control) {
      const prior = ownership.get(control);
      if (prior?.owner === this) return prior;
      prior?.owner.#release(control);
      control.setAttribute('data-ml-form-managed', '');
      // Let a previously standalone input restore its authored ARIA state first.
      control.parentElement?.closest('ml-input')?.refresh?.();
      const state = { owner: this, ids: [], priorInvalid: undefined };
      ownership.set(control, state);
      this.#managed.add(control);
      return state;
    }

    #release(control) {
      const state = ownership.get(control);
      describe(control, state, []);
      markInvalid(control, state, false);
      control.removeAttribute('data-ml-form-managed');
      ownership.delete(control);
      this.#managed.delete(control);
    }

    #belongs(control) {
      return this.#native && control?.form === this.#native && control.matches(controls)
        && !control.closest('.ml-select-popup, ml-multi-picker');
    }

    #inline(group, message) {
      let error = this.#errors.get(group);
      if (!error && message) {
        error = this.ownerDocument.createElement('p');
        error.className = 'ml-form-error';
        group.append(error);
        textId(error);
        this.#errors.set(group, error);
      }
      if (error) {
        if (error.textContent !== message) error.textContent = message;
        error.hidden = !message;
      }
      return message ? error.id : '';
    }

    #renderSummary(issues) {
      if (issues.length === this.#issues.length && issues.every(({ control, label, message }, index) => {
        const previous = this.#issues[index];
        return control === previous.control && label === previous.label && message === previous.message;
      })) return;
      const previousCount = this.#issues.length;
      this.#issues = issues;
      const title = issues.length ? '请检查 ' + issues.length + ' 项' : '';
      this.#summary.hidden = !issues.length;
      this.#summary.querySelector('strong').textContent = title;
      this.#summary.querySelector('ul').replaceChildren(...issues.map(({ label, message }, index) => {
        const item = this.ownerDocument.createElement('li');
        const button = this.ownerDocument.createElement('button');
        button.type = 'button';
        button.dataset.field = index;
        button.textContent = label;
        item.append(button, '　' + message);
        return item;
      }));
      if (previousCount !== issues.length) this.#live.textContent = title;
    }

    refresh() {
      const form = this.form;
      if (form !== this.#native) this.#mount(form);
      const linked = this.isConnected && form?.id ? '[form="' + CSS.escape(form.id) + '"]' : '';
      if (linked !== this.#linkedSelector) {
        this.#linkedChanges.disconnect();
        this.#linkedSelector = linked;
        if (linked) this.#linkedChanges.observe(this.getRootNode(), {
          childList: true, subtree: true, attributeOldValue: true, attributeFilter: fieldAttributes,
        });
      }
      const groups = new Map();
      this.#groups = groups;
      if (!form) return true;

      const fields = new Set([...form.elements].filter(control => this.#belongs(control)));
      for (const control of this.#managed) if (!fields.has(control)) this.#release(control);
      for (const control of fields) {
        const group = fieldGroup(control);
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group).push(control);
      }
      for (const [group, error] of this.#errors) {
        if (!groups.has(group)) { error.remove(); this.#errors.delete(group); }
      }

      const issues = [];
      for (const [group, groupControls] of groups) {
        const control = groupControls.find(field => field.willValidate && !field.validity.valid);
        const issue = control && { group, control, label: labelOf(group, control), message: messageFor(group, control) };
        if (issue) issues.push(issue);
        const show = issue && (this.#attempted || this.#touched.has(group));
        const hint = group.querySelector(':scope > .ml-form-hint:not([hidden])');
        const errorId = group.matches('.ml-form-field') ? this.#inline(group, show ? issue.message : '') : '';
        for (const field of groupControls) {
          const state = this.#claim(field);
          const invalid = Boolean(show && field.willValidate && !field.validity.valid);
          markInvalid(field, state, invalid);
          describe(field, state, [hint && textId(hint), invalid && errorId]);
        }
      }
      this.#renderSummary(this.#attempted ? issues : []);
      return issues.length === 0;
    }

    #focus(control) {
      if (!control || control.matches(':disabled') || !this.#belongs(control)) return;
      const multi = control.parentElement?.closest('ml-multi-select');
      if (multi?.select === control && typeof multi.focus === 'function') multi.focus();
      else control.focus();
    }

    reportValidity() {
      this.#attempted = true;
      const valid = this.refresh();
      if (!valid) this.#focus(this.#issues[0]?.control);
      return valid;
    }

    #activateSubmit = event => {
      const action = event.target.closest?.('button, input');
      if (!event.isTrusted || action?.form !== this.#native || !['submit', 'image'].includes(action?.type)) return;
      this.#submitClick = event;
      setTimeout(() => { if (this.#submitClick === event) this.#submitClick = null; }, 0);
    };

    #invalid = event => {
      if (!this.#belongs(event.target)) return;
      event.preventDefault();
      if (this.#pending) return;
      this.#pending = true;
      const activation = this.#submitClick;
      const form = this.#native;
      queueMicrotask(() => {
        this.#pending = false;
        if (form !== this.form) return;
        this.#attempted = true;
        this.refresh();
        if (activation && !activation.defaultPrevented && this.isConnected && !this.#summary.hidden) this.#summary.focus();
      });
    };

    #edit = event => {
      if (!event.isComposing && this.#belongs(event.target)) this.refresh();
    };

    #press = event => {
      const active = this.getRootNode().activeElement;
      if (event.button === 0 && (this.#native?.contains(active) || this.#belongs(active))) this.#pointer = event.pointerId;
    };

    #releasePointer = event => {
      if (event.type !== 'blur' && event.pointerId !== this.#pointer) return;
      this.#pointer = null;
      const group = this.#deferredBlur;
      // Wait until click activation finishes before messages can move its target.
      if (group) setTimeout(() => {
        if (group !== this.#deferredBlur) return;
        this.#deferredBlur = null;
        if (!group.contains(this.getRootNode().activeElement)) this.#validateBlur(group);
      }, 0);
    };

    #blur = event => {
      const group = event.target.closest && fieldGroup(event.target);
      if (!this.#groups.has(group) || group.contains(event.relatedTarget)) return;
      if (this.#pointer !== null) this.#deferredBlur = group;
      else this.#validateBlur(group);
    };

    #validateBlur(group) {
      if (this.#attempted || this.getAttribute('validate-on') === 'submit' || this.#native?.noValidate) return;
      this.#touched.add(group);
      this.refresh();
      const error = this.#errors.get(group);
      this.#live.textContent = error && !error.hidden ? error.textContent : '';
    };

    #clear() {
      this.#attempted = false;
      this.#touched = new WeakSet();
      this.#deferredBlur = null;
      if (this.#live) this.#live.textContent = '';
    }

    #reset = event => {
      if (event.target !== this.#native) return;
      queueMicrotask(() => {
        if (event.defaultPrevented || event.target !== this.form) return;
        this.#clear();
        this.refresh();
      });
    };
  }
  customElements.define('ml-form', MaterialForm);
})();
