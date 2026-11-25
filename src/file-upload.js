(() => {
  'use strict';
  if (customElements.get('ml-file-upload')) return;

  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  const stateLabel = { ready: '待上传', uploading: '上传中', complete: '已上传', error: '上传失败', canceled: '已取消' };
  const fileKey = file => JSON.stringify([file.name, file.size, file.type, file.lastModified]);
  let nextId = 0;

  function uniqueId(tree) {
    let id;
    do { id = 'ml-file-' + ++nextId; } while (['', '-hint', '-message'].some(suffix => tree.getElementById(id + suffix)));
    return id;
  }

  function limit(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? number : Infinity;
  }
  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    const unit = Math.min(3, Math.floor(Math.log(bytes) / Math.log(1024)));
    return (bytes / 1024 ** unit).toLocaleString('zh-CN', { maximumFractionDigits: 1 }) + ' ' + ['B', 'KiB', 'MiB', 'GiB'][unit];
  }
  function allowed(file, rules) {
    const type = file.type.toLowerCase(), name = file.name.toLowerCase();
    return rules.length === 0 || rules.some(rule => rule === '*/*' || (rule.startsWith('.') ? name.endsWith(rule)
      : rule.endsWith('/*') ? type.startsWith(rule.slice(0, -1)) : type === rule));
  }

  class DropSurface extends GlassControl {
    get glassContent() { return this.closest('ml-file-upload')?.input; }
  }
  customElements.define('ml-file-drop', DropSurface);

  class FileUpload extends HTMLElement {
    #native;
    #view;
    #hintId;
    #messageId;
    #items = [];
    #upload;
    #events;
    #reasons = [];
    #invalid = false;
    #dragDepth = 0;
    #changing = false;
    #changes = new MutationObserver(records => {
      if (records.some(({ target, type }) => target === this ||
        (type === 'attributes' && target.parentElement === this && target.localName === 'input'))) this.refresh();
    });

    get input() { return this.querySelector(':scope > input[type="file"]'); }
    get files() { return Array.from(this.input?.files ?? []); }
    get entries() {
      this.#bindInput();
      return this.#items.map(({ file, state, progress }) => ({ file, state, progress }));
    }
    get upload() { return this.#upload; }
    set upload(handler) {
      this.#upload = typeof handler === 'function' ? handler : undefined;
      if (this.#view) {
        for (const item of this.#items) this.#renderRow(item);
        this.#renderFooter();
      }
    }

    connectedCallback() {
      for (const copy of this.querySelectorAll(':scope > .ml-file-view')) if (copy !== this.#view) copy.remove();
      if (typeof this.ownerDocument.defaultView.DataTransfer !== 'function') {
        this.removeAttribute('data-ml-file-ready');
        return;
      }
      this.#events = new AbortController();
      const signal = this.#events.signal;
      this.addEventListener('input', this.#choose, { capture: true, signal });
      this.addEventListener('change', this.#choose, { capture: true, signal });
      this.addEventListener('click', this.#click, { signal });
      this.addEventListener('invalid', this.#onInvalid, { capture: true, signal });
      this.getRootNode().addEventListener('reset', this.#reset, { capture: true, signal });
      for (const name of ['dragenter', 'dragover', 'dragleave', 'drop', 'dragend']) this.addEventListener(name, this.#drag, { signal });
      this.#changes.observe(this, { childList: true, attributes: true, subtree: true,
        attributeFilter: ['type', 'id', 'disabled', 'multiple', 'accept', 'required', 'max-files', 'max-size', 'label', 'upload-label', 'data-ml-form-managed'] });
      this.refresh();
    }

    disconnectedCallback() {
      this.#events?.abort();
      this.#events = null;
      this.#changes.disconnect();
      this.#endDrag();
      queueMicrotask(() => {
        if (!this.isConnected) for (const item of this.#items) this.#cancel(item);
      });
    }

    #bindInput() {
      if (!this.#events) return;
      const input = this.input;
      if (input === this.#native) return;
      const previous = this.#items;
      if (this.#native) {
        const descriptions = (this.#native.getAttribute('aria-describedby') || '').split(/\s+/)
          .filter(id => id && id !== this.#hintId && id !== this.#messageId);
        if (descriptions.length) this.#native.setAttribute('aria-describedby', descriptions.join(' '));
        else this.#native.removeAttribute('aria-describedby');
      }
      this.#native = input;
      this.#items = [];
      this.#reasons = [];
      this.#invalid = false;
      this.#endDrag();
      this.removeAttribute('data-ml-file-invalid');
      this.#view?.remove();
      this.#view = null;
      this.toggleAttribute('data-ml-file-ready', !!input);
      if (input) {
        this.#mount();
        this.#add([...input.files], { replace: true, announce: false });
      }
      const adopted = this.#items;
      for (const item of previous) this.#abort(item);
      if (input === this.input && adopted === this.#items && (previous.length || adopted.length)) {
        this.#emit('ml-files-change', { files: this.files });
      }
    }

    #mount() {
      const doc = this.ownerDocument, tree = this.getRootNode();
      const id = uniqueId(tree);
      const input = this.#native;
      if (!input.id || tree.querySelectorAll('#' + CSS.escape(input.id)).length !== 1) input.id = id;
      this.#hintId = id + '-hint';
      this.#messageId = id + '-message';
      const descriptions = (input.getAttribute('aria-describedby') || '').split(/\s+/)
        .filter(value => value && !/^ml-file-\d+-(hint|message)$/.test(value));
      input.setAttribute('aria-describedby', [...descriptions, this.#hintId, this.#messageId].join(' '));
      this.#view = doc.createElement('div');
      this.#view.className = 'ml-file-view';
      this.#view.innerHTML = `<ml-file-drop>
        <label class="ml-file-pick"><span class="ml-file-mark" aria-hidden="true"></span>
          <span class="ml-file-prompt"><strong></strong><span aria-hidden="true">或将文件拖到这里</span></span>
        </label><small class="ml-file-hint"></small>
      </ml-file-drop>
      <p class="ml-file-message" role="status"></p>
      <ul class="ml-file-list" role="list" aria-label="已选文件" hidden></ul>
      <div class="ml-file-footer" hidden><span class="ml-file-total"></span>
        <ml-button><button type="button" data-action="upload">上传文件</button></ml-button></div>
      <span class="ml-file-sr" role="status"></span>`;
      this.#view.querySelector('label').htmlFor = input.id;
      this.#view.querySelector('.ml-file-hint').id = this.#hintId;
      this.#view.querySelector('.ml-file-message').id = this.#messageId;
      this.append(this.#view);
    }

    #limits() {
      return {
        count: this.#native.multiple ? limit(this.getAttribute('max-files')) : 1,
        size: limit(this.getAttribute('max-size')),
        rules: this.#native.accept.toLowerCase().split(',').map(value => value.trim()).filter(Boolean),
      };
    }
    #available() { return this.isConnected && this.#native && this.#native === this.input && !this.#native.matches(':disabled') && !this.closest('[inert]'); }

    refresh() {
      this.#bindInput();
      if (!this.#view || !this.#events) return;
      if (!this.#native.id) this.#native.id = uniqueId(this.getRootNode());
      const label = this.#view.querySelector('label');
      if (label.htmlFor !== this.#native.id) label.htmlFor = this.#native.id;
      const { count, size, rules } = this.#limits();
      const hint = [];
      if (rules.length) hint.push(rules.join('、'));
      if (Number.isFinite(size)) hint.push('单个不超过 ' + formatSize(size));
      if (Number.isFinite(count)) hint.push('最多 ' + count + ' 个');
      const note = this.#view.querySelector('.ml-file-hint');
      note.textContent = hint.join(' · ');
      note.hidden = !hint.length;
      this.#view.querySelector('.ml-file-prompt strong').textContent = this.getAttribute('label') || '选择文件';
      if (!this.#available()) this.#endDrag();
      const incoming = [...this.#native.files];
      const same = incoming.length === this.#items.length && incoming.every((file, index) => file === this.#items[index].file);
      if (!same || this.#items.length > count || this.#items.some(item => item.file.size > size || !allowed(item.file, rules))) {
        this.#add(incoming, { replace: true });
      }
      for (const item of this.#items) this.#renderRow(item);
      this.#renderMessage();
      this.#renderFooter();
    }

    addFiles(files) {
      this.#bindInput();
      if (!this.#view || !this.#available()) return [];
      return this.#add(Array.from(files ?? []), { nativeEvents: true });
    }

    #add(files, { replace = false, nativeEvents = false, announce = true }) {
      const { count, size, rules } = this.#limits();
      const next = replace || !this.#native.multiple ? [] : [...this.#items];
      const previous = new Map(this.#items.map(item => [fileKey(item.file), item]));
      const seen = new Set(next.map(item => fileKey(item.file)));
      const accepted = [];
      this.#reasons = [];
      for (const file of files) {
        if (!(file instanceof this.ownerDocument.defaultView.File)) continue;
        const key = fileKey(file);
        const reason = !allowed(file, rules) ? '类型不符合要求' : file.size > size ? '超过单个文件大小限制'
          : seen.has(key) ? '已添加' : next.length >= count ? '超过文件数量限制' : '';
        if (reason) { this.#reasons.push('「' + file.name + '」' + reason); continue; }
        const entry = previous.get(key) ?? { file, state: 'ready', progress: null, run: null };
        seen.add(key);
        next.push(entry);
        accepted.push(file);
      }
      const keep = !replace && !this.#native.multiple && !next.length ? this.#items : next;
      this.#apply(keep, { nativeEvents, announce });
      return accepted;
    }

    #apply(next, { nativeEvents, announce = true }) {
      const unchanged = next.length === this.#items.length && next.every((item, index) => item === this.#items[index]);
      const transfer = new this.ownerDocument.defaultView.DataTransfer();
      for (const item of next) transfer.items.add(item.file);
      this.#native.files = transfer.files;
      const removed = this.#items.filter(item => !next.includes(item));
      this.#items = next;
      for (const item of removed) this.#abort(item);
      if (!unchanged) this.#renderList();
      this.#renderMessage();
      this.#renderFooter();
      if (unchanged) return;
      if (nativeEvents) {
        this.#changing = true;
        try {
          this.#native.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
          this.#native.dispatchEvent(new Event('change', { bubbles: true }));
        } finally { this.#changing = false; }
      }
      if (announce) this.#emit('ml-files-change', { files: this.files });
    }

    #choose = event => {
      if (event.target !== this.input || this.#changing) return;
      this.#bindInput();
      if (!this.#native) return;
      const selected = [...this.#native.files];
      if (selected.length === this.#items.length && selected.every((file, index) => file === this.#items[index].file)) return;
      this.#add(selected, { replace: selected.length === 0 });
    };
    #onInvalid = event => {
      if (event.target !== this.input || event.target.hasAttribute('data-ml-form-managed')) return;
      this.#bindInput();
      event.preventDefault();
      this.#invalid = true;
      this.#renderMessage();
      this.#native.focus();
    };
    #reset = event => {
      const input = this.input;
      if (event.target !== input?.form) return;
      queueMicrotask(() => { if (!event.defaultPrevented && input === this.input) this.clear(false); });
    };
    clear(notify = true) {
      this.#bindInput();
      if (!this.#view) return;
      this.#reasons = [];
      this.#invalid = false;
      this.#apply([], { nativeEvents: notify });
    }

    #drag = event => {
      if (event.target.closest?.('ml-file-drop') !== this.#view?.firstElementChild || !this.#view) return;
      if (event.type === 'dragend') { this.#endDrag(); return; }
      if (!event.dataTransfer?.types.includes('Files')) return;
      event.preventDefault();
      if (event.type === 'dragleave') {
        if (--this.#dragDepth <= 0) this.#endDrag();
      } else if (event.type === 'drop') {
        this.#endDrag();
        this.addFiles(event.dataTransfer.files);
      } else if (this.#available()) {
        event.dataTransfer.dropEffect = 'copy';
        if (event.type === 'dragenter') this.#dragDepth++;
        this.toggleAttribute('data-ml-file-drag', true);
      } else {
        event.dataTransfer.dropEffect = 'none';
        this.#endDrag();
      }
    };
    #endDrag() { this.#dragDepth = 0; this.removeAttribute('data-ml-file-drag'); }

    #click = event => {
      if (!this.#available() || event.defaultPrevented) return;
      const action = event.target.closest('button[data-action]');
      if (!action || !this.#view.contains(action)) return;
      if (action.dataset.action === 'upload') {
        this.start();
        return;
      }
      const index = this.#items.findIndex(item => item.row === action.closest('li'));
      const item = this.#items[index];
      if (!item) return;
      if (action.dataset.action === 'remove') {
        this.#reasons = [];
        this.#apply(this.#items.filter(entry => entry !== item), { nativeEvents: true });
        (this.#items[Math.min(index, this.#items.length - 1)]?.row.querySelector('button:not([hidden]):enabled') ?? this.#native).focus();
      } else if (action.dataset.action === 'cancel') this.#cancel(item);
      else if (action.dataset.action === 'retry') this.#run(item);
    };

    start() {
      this.#bindInput();
      return Promise.all(this.#items.filter(item => item.state === 'ready').map(item => this.#run(item)));
    }
    async #run(item) {
      if (!this.#available() || !this.#upload || item.run) return;
      const upload = this.#upload, input = this.#native;
      const run = new AbortController();
      const current = () => item.run === run && this.isConnected && this.input === input;
      item.run = run;
      item.progress = null;
      this.#setState(item, 'uploading');
      if (!current()) return;
      try {
        await upload.call(this, item.file, { signal: run.signal, onProgress: (loaded, total = item.file.size) => {
          if (!current() || !Number.isFinite(loaded) || !Number.isFinite(total) || total <= 0) return;
          item.progress = Math.min(100, Math.max(0, 100 * loaded / total));
          this.#renderRow(item);
        } });
        if (!current()) return;
        item.run = null;
        item.progress = 100;
        this.#setState(item, 'complete');
      } catch {
        if (!current()) return;
        item.run = null;
        this.#setState(item, 'error');
      }
    }
    #abort(item) {
      const run = item.run;
      item.run = null;
      run?.abort();
    }
    #cancel(item) {
      if (!item.run) return;
      this.#abort(item);
      this.#setState(item, 'canceled');
    }
    #setState(item, state) {
      const root = this.getRootNode();
      const active = root.activeElement;
      const focused = item.row?.contains(active);
      const start = this.#view.querySelector('[data-action="upload"]');
      const startFocused = start === active;
      item.state = state;
      this.#renderRow(item);
      this.#renderFooter();
      if (focused && (active.hidden || active.disabled || !item.row.contains(root.activeElement))) {
        item.row.querySelector('button:not([hidden]):enabled')?.focus({ preventScroll: true });
      } else if (startFocused && start.disabled) {
        (item.row.querySelector('button:not([hidden]):enabled') ?? this.#native).focus({ preventScroll: true });
      }
      this.#view.querySelector('.ml-file-sr').textContent = item.file.name + '，' + stateLabel[state];
      this.#emit('ml-upload-state', { file: item.file, state, progress: item.progress });
    }

    #renderList() {
      const doc = this.ownerDocument;
      const list = this.#view.querySelector('.ml-file-list');
      for (const item of this.#items) {
        if (!item.row) {
          const row = doc.createElement('li');
          row.innerHTML = `<span class="ml-file-type" aria-hidden="true"></span>
            <div class="ml-file-detail"><strong></strong><small></small>
              <ml-progress class="ml-file-progress" hidden><progress max="100"></progress></ml-progress></div>
            <div class="ml-file-actions"><button type="button" data-action="retry" hidden>重试</button>
              <button type="button" data-action="cancel" hidden>取消</button><button type="button" data-action="remove"></button></div>`;
          row.className = 'ml-file-row';
          row.querySelector('strong').textContent = item.file.name;
          row.querySelector('strong').title = item.file.name;
          row.querySelector('progress').setAttribute('aria-label', item.file.name + '上传进度');
          for (const button of row.querySelectorAll('button')) {
            const actionName = { retry: '重试', cancel: '取消上传', remove: '移除' }[button.dataset.action];
            button.setAttribute('aria-label', actionName + item.file.name);
          }
          row.querySelector('[data-action="remove"]').title = '移除文件';
          row.toggleAttribute('data-image', item.file.type.startsWith('image/'));
          item.row = row;
        }
        this.#renderRow(item);
      }
      list.replaceChildren(...this.#items.map(item => item.row));
      list.hidden = this.#items.length === 0;
    }
    #renderRow(item) {
      const { row, file, state, progress } = item;
      if (!row) return;
      const label = state === 'ready' && !this.#upload ? '已添加' : stateLabel[state];
      const status = formatSize(file.size) + ' · ' + label;
      if (row.querySelector('small').textContent !== status) row.querySelector('small').textContent = status;
      row.dataset.state = state;
      row.querySelector('[data-action="cancel"]').hidden = state !== 'uploading';
      row.querySelector('[data-action="remove"]').hidden = state === 'uploading';
      row.querySelector('[data-action="retry"]').hidden = !this.#upload || !['error', 'canceled'].includes(state);
      for (const button of row.querySelectorAll('button')) button.disabled = this.#native.disabled;
      row.querySelector('ml-progress').hidden = state !== 'uploading';
      const rail = row.querySelector('progress');
      if (progress == null) rail.removeAttribute('value');
      else rail.value = progress;
    }
    #renderMessage() {
      this.#invalid &&= !this.#native.hasAttribute('data-ml-form-managed') && !this.#native.validity.valid;
      this.toggleAttribute('data-ml-file-invalid', this.#invalid);
      const validation = this.#invalid ? (this.#native.validity.valueMissing ? '请先选择文件。' : this.#native.validationMessage) : '';
      const message = this.#reasons.length ? this.#reasons.join('。') : validation;
      const area = this.#view.querySelector('.ml-file-message');
      if (area.textContent !== message) area.textContent = message;
    }
    #renderFooter() {
      const footer = this.#view.querySelector('.ml-file-footer');
      const upload = footer.querySelector('button');
      footer.hidden = this.#items.length === 0;
      footer.querySelector('.ml-file-total').textContent = '已选 ' + this.#items.length + ' 个文件';
      upload.parentElement.hidden = !this.#upload;
      upload.disabled = this.#native.disabled || !this.#items.some(item => item.state === 'ready');
      upload.textContent = this.getAttribute('upload-label') || '上传文件';
    }
    #emit(name, detail) { this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail })); }
  }
  customElements.define('ml-file-upload', FileUpload);
})();
