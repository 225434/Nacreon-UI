(() => {
  'use strict';
  if (customElements.get('ml-data-table')) return;
  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  let nextTableId = 0;
  const generatedIds = new WeakMap();

  // Resolve a leaf heading through any spanning labels in earlier header rows.
  function columnOf(th) {
    const rows = th.parentElement.parentElement.rows, occupied = [];
    for (let i = 0; i < rows.length; i++) {
      let start = 0;
      for (const cell of rows[i].cells) {
        while (occupied[start] > i) start++;
        if (cell === th) return start;
        const end = start + cell.colSpan;
        for (; start < end; start++) occupied[start] = cell.rowSpan ? i + cell.rowSpan : rows.length;
      }
    }
    return -1;
  }
  function sortValue(row, index, type) {
    let end = 0;
    const cell = [...row.cells].find(field => { end += field.colSpan; return index < end; });
    if (!cell) return null;
    const raw = (cell.dataset.sortValue ?? cell.querySelector('time[datetime]')?.dateTime ?? cell.textContent).trim();
    if (!raw) return null;
    if (type === 'number' || type === 'date') {
      const value = type === 'number' ? Number(raw) : Date.parse(raw);
      return Number.isFinite(value) ? value : null;
    }
    return raw;
  }
  function addCheckbox(row, tag, label) {
    const cell = row.ownerDocument.createElement(tag);
    cell.className = 'ml-table-check';
    if (tag === 'th') cell.scope = 'col';
    const wrap = row.ownerDocument.createElement('label'), box = row.ownerDocument.createElement('input');
    box.type = 'checkbox'; box.setAttribute('aria-label', label);
    wrap.append(box); cell.append(wrap); row.prepend(cell);
    return cell;
  }
  class DataTable extends GlassControl {
    static observedAttributes = ['selectable', 'sort-by', 'sort-direction', 'empty-text'];
    #table;
    #scroll;
    #empty;
    #hint;
    #pager;
    #rows = [];
    #onPage = [];
    #order = new WeakMap();
    #serial = 0;
    #sorted = false;
    #busy = false;
    #connected = false;
    #resizes = new ResizeObserver(() => this.#overflow());
    #changes = new MutationObserver(records => {
      const sourceChanged = records.some(r =>
        (this.#table && this.#table.contains(r.target)) ||
        ((r.target === this || r.target === this.#scroll) && [...r.addedNodes, ...r.removedNodes].some(n =>
          n.nodeType === 1 && n.matches('table, .ml-table-scroll, ml-pagination, ml-empty-state'))));
      if (sourceChanged) this.refresh();
    });
    get table() { return this.#table; }
    get glassContent() { return this.#table; }
    get visibleRows() { return this.#onPage.slice(); }
    get selectedRows() {
      return this.#table ? [...this.#table.tBodies].flatMap(body => [...body.rows]).filter(row => row.hasAttribute('data-selected')) : [];
    }
    get sort() {
      const th = this.#headers().find(h => h.hasAttribute('aria-sort'));
      return th ? { key: this.#key(th), direction: th.getAttribute('aria-sort') } : { key: '', direction: 'none' };
    }
    connectedCallback() {
      this.#connected = true;
      super.connectedCallback();
      this.addEventListener('click', this.#click);
      this.addEventListener('change', this.#check);
      this.addEventListener('ml-page-change', this.#pageChange);
      this.refresh();
    }
    disconnectedCallback() {
      this.#connected = false;
      this.removeEventListener('click', this.#click);
      this.removeEventListener('change', this.#check);
      this.removeEventListener('ml-page-change', this.#pageChange);
      this.#changes.disconnect(); this.#resizes.disconnect(); this.#resizing = false;
      super.disconnectedCallback();
    }
    attributeChangedCallback(name, before, after) {
      if (this.#connected && !this.#busy && before !== after) this.refresh(name.startsWith('sort-'));
    }
    #part(name, tag) {
      let el = this.querySelector(':scope > .' + name);
      if (!el) { el = this.ownerDocument.createElement(tag); el.className = name; this.append(el); }
      return el;
    }
    #headers() {
      return this.#table?.tHead ? [...this.#table.tHead.rows].flatMap(row => [...row.cells]).filter(th => th.matches('th[data-sort]')) : [];
    }
    #key(th) {
      return th.dataset.key || String(columnOf(th) - Number(this.hasAttribute('selectable')));
    }
    #enhanceHead() {
      const head = this.#table.tHead;
      if (!head) return;
      for (const row of head.rows) {
        for (const th of row.cells) {
          const button = th.querySelector(':scope > button.ml-table-sort');
          if (!th.matches('th[data-sort]')) {
            if (button) { button.replaceWith(...button.childNodes); th.removeAttribute('aria-sort'); }
          } else if (!button) {
            const action = this.ownerDocument.createElement('button');
            action.type = 'button'; action.className = 'ml-table-sort';
            action.append(...th.childNodes); th.append(action);
          }
        }
      }
    }
    #prepareChecks(bodies) {
      const head = this.#table.tHead, selectable = this.hasAttribute('selectable');
      for (const row of head?.rows || []) {
        const cell = row.querySelector(':scope > th.ml-table-check');
        if (row === head.rows[0] && selectable) {
          (cell || addCheckbox(row, 'th', '选择本页全部记录')).rowSpan = head.rows.length;
        } else cell?.remove();
      }
      for (const body of bodies) {
        for (const row of body.rows) {
          let cell = row.querySelector(':scope > td.ml-table-check');
          if (!selectable) { cell?.remove(); continue; }
          cell ||= addCheckbox(row, 'td', '选择记录');
          const label = row.dataset.key || row.querySelector('th[scope="row"]')?.textContent.trim() || row.cells[1]?.textContent.trim();
          const box = cell.querySelector('input');
          box.setAttribute('aria-label', label ? '选择 ' + label : '选择记录');
          box.checked = row.hasAttribute('data-selected');
        }
      }
    }
    #sortRows(bodies) {
      const headers = this.#headers(), key = this.getAttribute('sort-by');
      const active = headers.find(th => this.#key(th) === key);
      const direction = this.getAttribute('sort-direction') === 'descending' ? 'descending' : 'ascending';
      for (const th of headers) {
        if (th === active) th.setAttribute('aria-sort', direction);
        else th.removeAttribute('aria-sort');
      }
      // Capture source order before sorting. Reuse the row nodes and their form controls.
      if (!active && !this.#sorted) { this.#order = new WeakMap(); this.#serial = 0; }
      const type = active?.dataset.sort;
      const index = active ? columnOf(active) : -1;
      const language = this.closest('[lang]')?.lang || this.ownerDocument.documentElement.lang;
      let collator;
      if (active && type !== 'number' && type !== 'date') {
        const options = { numeric: true, sensitivity: 'base' };
        try { collator = new Intl.Collator(language || undefined, options); }
        catch { collator = new Intl.Collator(undefined, options); }
      }
      for (const body of bodies) {
        const rows = [...body.rows];
        const records = rows.map(row => {
          if (!this.#order.has(row)) this.#order.set(row, ++this.#serial);
          return { row, order: this.#order.get(row), value: active ? sortValue(row, index, type) : null };
        });
        if (!active && !this.#sorted) continue;
        records.sort((a, b) => {
          if (a.value === null || b.value === null) return (a.value === null) - (b.value === null) || a.order - b.order;
          const difference = collator ? collator.compare(a.value, b.value) : a.value - b.value;
          return (direction === 'descending' ? -difference : difference) || a.order - b.order;
        });
        records.forEach(({ row }, i) => { if (body.rows[i] !== row) body.insertBefore(row, body.rows[i]); });
      }
      this.#sorted = !!active;
    }
    refresh(resetPage = false) {
      if (this.#busy || !this.isConnected) return;
      this.#busy = true; this.#changes.disconnect();
      try {
        const direct = this.querySelector(':scope > table');
        const table = direct || this.querySelector(':scope > .ml-table-scroll > table');
        const pager = this.querySelector(':scope > ml-pagination');
        this.#pager = pager;
        const previousScroll = this.#scroll;
        this.#scroll = this.#part('ml-table-scroll', 'div');
        const fallback = this.#part('ml-table-empty', 'p');
        const customEmpty = this.querySelector(':scope > ml-empty-state');
        this.#empty = customEmpty || fallback;
        this.#hint = this.#part('ml-table-hint', 'span');
        if (direct) this.#scroll.append(direct);
        if (customEmpty) {
          fallback.hidden = true;
          if (fallback.previousElementSibling !== customEmpty) fallback.before(customEmpty);
        } else {
          fallback.setAttribute('role', 'status');
          fallback.textContent = this.getAttribute('empty-text') || '暂无记录';
        }
        // Only move the footer when it is out of order, preserving keyboard focus.
        if (pager && (this.#hint.compareDocumentPosition(pager) & Node.DOCUMENT_POSITION_PRECEDING)) this.append(pager);
        if (this.#table !== table || this.#scroll !== previousScroll || !this.#resizing) {
          this.#resizes.disconnect(); this.#resizes.observe(this.#scroll);
          if (table) this.#resizes.observe(table);
          this.#resizing = true;
        }
        this.#table = table;
        this.#hint.textContent = '可横向滚动查看更多列';
        const bodies = table ? [...table.tBodies] : [];
        if (table) { this.#enhanceHead(); this.#prepareChecks(bodies); this.#sortRows(bodies); }
        this.#rows = bodies.filter(body => !body.hidden).flatMap(body => [...body.rows].filter(row => !row.hidden));
        if (pager) {
          if (table) {
            if (!table.id || (table.dataset.mlTableId === table.id && generatedIds.get(table) !== table.id)) {
              let id;
              do { id = 'ml-records-' + ++nextTableId; } while (table.getRootNode().getElementById(id));
              table.id = table.dataset.mlTableId = id;
              generatedIds.set(table, id);
            }
            if (pager.getAttribute('for') !== table.id) pager.setAttribute('for', table.id);
          }
          if (pager.total !== this.#rows.length || !pager.hasAttribute('total')) pager.total = this.#rows.length;
          if (resetPage && pager.page > 1) pager.page = 1;
        }
        this.#applyPage();
        this.#overflow();
      } finally {
        this.#busy = false;
        this.#changes.observe(this, { subtree: true, childList: true, characterData: true, attributes: true,
          attributeFilter: ['hidden', 'data-key', 'data-sort', 'data-sort-value', 'data-selected', 'datetime', 'rowspan', 'colspan'] });
      }
    }
    #resizing = false;
    #overflow() {
      if (!this.#scroll) return;
      const overflow = !!this.#table && this.#scroll.clientWidth > 0 && this.#scroll.scrollWidth > this.#scroll.clientWidth + 1;
      this.#hint.hidden = !overflow;
      if (overflow) {
        this.#scroll.tabIndex = 0; this.#scroll.setAttribute('role', 'region');
        this.#scroll.setAttribute('aria-label', (this.#table.caption?.textContent.trim() || this.#table.getAttribute('aria-label') || '数据表格') + '，可横向滚动');
      } else {
        for (const name of ['tabindex', 'role', 'aria-label']) this.#scroll.removeAttribute(name);
      }
    }
    #applyPage() {
      const state = this.#pager?.state;
      const first = state ? Math.max(0, state.start - 1) : 0, end = state ? state.end : this.#rows.length;
      this.#onPage = this.#rows.slice(first, end);
      this.#rows.forEach((row, i) => row.toggleAttribute('data-ml-page-hidden', i < first || i >= end));
      this.#empty.toggleAttribute('hidden', this.#rows.length > 0);
      this.#syncHeadCheck();
    }
    #syncHeadCheck() {
      const box = this.#table?.tHead?.querySelector('.ml-table-check input');
      if (!box) return;
      const count = this.#onPage.filter(row => row.hasAttribute('data-selected')).length;
      box.disabled = !this.#onPage.length;
      box.checked = count > 0 && count === this.#onPage.length;
      box.indeterminate = count > 0 && count < this.#onPage.length;
    }
    sortBy(key, direction = 'ascending') {
      if (direction !== 'none' && !this.#headers().some(th => this.#key(th) === String(key))) return;
      this.#busy = true;
      try {
        if (direction === 'none') { this.removeAttribute('sort-by'); this.removeAttribute('sort-direction'); }
        else { this.setAttribute('sort-by', key); this.setAttribute('sort-direction', direction === 'descending' ? direction : 'ascending'); }
      } finally { this.#busy = false; }
      this.refresh(true);
      this.dispatchEvent(new CustomEvent('ml-sort-change', { bubbles: true, composed: true, detail: this.sort }));
    }
    #click = event => {
      const button = event.target.closest('button.ml-table-sort');
      if (!button || button.closest('table') !== this.#table) return;
      const th = button.parentElement, current = th.getAttribute('aria-sort');
      this.sortBy(this.#key(th), current === 'ascending' ? 'descending' : current === 'descending' ? 'none' : 'ascending');
    };
    #pageChange = event => { if (event.target === this.#pager) this.#applyPage(); };
    #check = event => {
      const box = event.target;
      if (!box.matches('.ml-table-check input') || box.closest('table') !== this.#table) return;
      const row = box.closest('tr'), selected = box.checked;
      const rows = box.closest('thead') ? this.#onPage : [row];
      for (const item of rows) {
        item.toggleAttribute('data-selected', selected);
        item.querySelector(':scope > .ml-table-check input').checked = selected;
      }
      this.#syncHeadCheck();
      const all = this.selectedRows;
      this.dispatchEvent(new CustomEvent('ml-selection-change', { bubbles: true, composed: true,
        detail: { rows: all, keys: all.map(item => item.dataset.key).filter(Boolean) } }));
    };
  }
  customElements.define('ml-data-table', DataTable);
})();
