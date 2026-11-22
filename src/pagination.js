(() => {
  'use strict';
  if (customElements.get('ml-pagination')) return;
  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  function integer(raw, fallback, min) {
    if (raw == null || String(raw).trim() === '') return fallback;
    const n = Number(raw);
    return Number.isSafeInteger(n) ? Math.max(min, n) : fallback;
  }
  function pageLinks(page, last) {
    if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);
    if (page <= 4) return [1, 2, 3, 4, 5, null, last];
    if (page >= last - 3) return [1, null, last - 4, last - 3, last - 2, last - 1, last];
    return [1, null, page - 1, page, page + 1, null, last];
  }
  class Pagination extends GlassControl {
    static observedAttributes = ['total', 'page', 'page-size', 'page-sizes', 'jump', 'disabled', 'label', 'for'];
    #nav;
    #last;
    #reflecting = false;
    get glassContent() { return this.#nav; }
    get total() { return integer(this.getAttribute('total'), 0, 0); }
    set total(value) { this.setAttribute('total', value); }
    get pageSize() { return integer(this.getAttribute('page-size'), 10, 1); }
    set pageSize(value) { this.setAttribute('page-size', value); }
    get pageCount() { return Math.ceil(this.total / this.pageSize); }
    get page() { return Math.min(this.pageCount, integer(this.getAttribute('page'), 1, 1)); }
    set page(value) { this.setAttribute('page', value); }
    get state() {
      const { total, page, pageSize, pageCount } = this;
      const start = page ? (page - 1) * pageSize + 1 : 0;
      const end = Math.min(total, page * pageSize);
      return { total, page, pageSize, pageCount, start, end };
    }
    connectedCallback() {
      let nav = this.querySelector(':scope > nav.ml-page-nav');
      if (!nav) {
        nav = this.ownerDocument.createElement('nav');
        nav.className = 'ml-page-nav';
        nav.innerHTML = '<span class="ml-page-summary" role="status" aria-atomic="true"></span>' +
          '<div class="ml-page-links"><button type="button" data-page-action="prev" aria-label="上一页"></button>' +
          '<span class="ml-page-numbers"></span><span class="ml-page-fraction"></span>' +
          '<button type="button" data-page-action="next" aria-label="下一页"></button></div>' +
          '<div class="ml-page-options"><label class="ml-page-size">每页 <span><select aria-label="每页条数"></select></span></label>' +
          '<span class="ml-page-jump"><label>跳至 <input type="text" inputmode="numeric" autocomplete="off" aria-label="跳转页码"></label>' +
          '<button type="button" data-page-action="go">前往</button></span></div>' +
          '<span class="ml-page-error" role="status" hidden></span>';
        this.append(nav);
      }
      this.#nav = nav;
      super.connectedCallback();
      nav.addEventListener('click', this.#click);
      nav.addEventListener('change', this.#change);
      nav.addEventListener('keydown', this.#keydown);
      nav.addEventListener('input', this.#clearError);
      this.#sync('connect');
    }
    disconnectedCallback() {
      this.#nav.removeEventListener('click', this.#click);
      this.#nav.removeEventListener('change', this.#change);
      this.#nav.removeEventListener('keydown', this.#keydown);
      this.#nav.removeEventListener('input', this.#clearError);
      super.disconnectedCallback();
    }
    attributeChangedCallback(name, before, after) {
      if (this.#nav && this.isConnected && !this.#reflecting && before !== after) this.#sync(name);
    }
    #sync(reason) {
      const previous = this.#last;
      let page = this.page;
      if (reason === 'page-size' && previous?.start) {
        page = Math.min(this.pageCount, Math.floor((previous.start - 1) / this.pageSize) + 1);
      }
      // Keep an initial requested page until a linked table supplies its total.
      if ((this.total || previous?.total) && String(page || 1) !== this.getAttribute('page')) {
        this.#reflecting = true;
        this.setAttribute('page', page || 1);
        this.#reflecting = false;
      }
      const state = this.state;
      this.#last = state;
      this.#render(state, !!previous?.page && previous.page !== page);
      if (previous && reason !== 'connect' && (state.page !== previous.page || state.total !== previous.total || state.pageSize !== previous.pageSize)) {
        this.dispatchEvent(new CustomEvent('ml-page-change', { bubbles: true, composed: true, detail: { ...state, reason } }));
      }
    }
    #render(state, changedPage) {
      const { total, page, pageCount, pageSize, start, end } = state;
      const nav = this.#nav, locked = this.hasAttribute('disabled');
      const focused = nav.getRootNode().activeElement;
      const hadLinkFocus = focused && nav.querySelector('.ml-page-links').contains(focused);
      nav.setAttribute('aria-label', this.getAttribute('label') || '分页');
      const summary = nav.querySelector('.ml-page-summary');
      const text = total ? '第 ' + start + '–' + end + ' 条，共 ' + total + ' 条' : '共 0 条';
      if (summary.textContent !== text) summary.textContent = text;
      const fraction = nav.querySelector('.ml-page-fraction');
      const pageText = page ? '第 ' + page + ' / ' + pageCount + ' 页' : '暂无页码';
      if (fraction.textContent !== pageText) {
        const counter = this.ownerDocument.createElement('span');
        counter.textContent = pageText;
        if (changedPage) counter.className = 'ml-page-arrival';
        fraction.replaceChildren(counter);
      }
      nav.querySelector('[data-page-action="prev"]').disabled = locked || page <= 1;
      nav.querySelector('[data-page-action="next"]').disabled = locked || page >= pageCount;
      const numbers = nav.querySelector('.ml-page-numbers');
      numbers.replaceChildren(...pageLinks(page, pageCount).map(value => {
        if (value === null) {
          const gap = this.ownerDocument.createElement('span');
          gap.className = 'ml-page-gap'; gap.textContent = '…'; gap.setAttribute('aria-hidden', 'true');
          return gap;
        }
        const button = this.ownerDocument.createElement('button');
        button.type = 'button'; button.dataset.page = value; button.textContent = value;
        button.setAttribute('aria-label', '第 ' + value + ' 页');
        button.disabled = locked;
        if (value === page) {
          button.setAttribute('aria-current', 'page');
          if (changedPage) button.className = 'ml-page-arrival';
        }
        return button;
      }));
      nav.toggleAttribute('data-empty', !total);
      nav.toggleAttribute('data-long-pages', pageCount > 9999);
      const size = nav.querySelector('.ml-page-size'), select = size.querySelector('select');
      const sizes = (this.getAttribute('page-sizes') || '').split(/[,\s]+/).map(Number).filter(n => Number.isSafeInteger(n) && n > 0);
      size.hidden = !sizes.length;
      const options = [...new Set([...sizes, pageSize])].sort((a, b) => a - b);
      if (select.dataset.sizes !== options.join(',')) {
        select.replaceChildren(...options.map(n => new Option(n + ' 条', String(n))));
        select.dataset.sizes = options.join(',');
      }
      select.value = String(pageSize); select.disabled = locked;
      const jump = nav.querySelector('.ml-page-jump');
      jump.hidden = !this.hasAttribute('jump');
      nav.querySelector('.ml-page-options').hidden = size.hidden && jump.hidden;
      jump.querySelector('input').disabled = jump.querySelector('button').disabled = locked || !total;
      if (jump.hidden || locked || !total) jump.querySelector('input').value = '';
      this.#clearError();
      const id = this.getAttribute('for');
      for (const control of nav.querySelectorAll('button, select')) {
        if (id) control.setAttribute('aria-controls', id);
        else control.removeAttribute('aria-controls');
      }
      if (hadLinkFocus && (!focused.isConnected || focused.disabled)) this.#focusPage();
    }
    #focusPage() {
      const target = [...this.#nav.querySelectorAll('[aria-current="page"], [data-page-action="next"], [data-page-action="prev"]')]
        .filter(el => !el.disabled && el.getClientRects().length);
      (target.find(el => el.hasAttribute('aria-current')) || target[0])?.focus({ preventScroll: true });
    }
    #clearError = () => {
      this.#nav.querySelector('.ml-page-error').hidden = true;
      this.#nav.querySelector('.ml-page-jump input').removeAttribute('aria-invalid');
    };
    #jump() {
      const field = this.#nav.querySelector('.ml-page-jump input');
      const value = Number(field.value.trim());
      if (!/^\d+$/.test(field.value.trim()) || !Number.isSafeInteger(value) || value < 1 || value > this.pageCount) {
        const error = this.#nav.querySelector('.ml-page-error');
        error.textContent = '请输入 1 至 ' + this.pageCount + ' 之间的页码';
        error.hidden = false; field.setAttribute('aria-invalid', 'true'); field.focus(); field.select();
        return;
      }
      this.#clearError();
      this.page = value;
      field.value = '';
    }
    #click = event => {
      const button = event.target.closest('button');
      if (!button || button.disabled || this.hasAttribute('disabled')) return;
      if (button.dataset.page) this.page = Number(button.dataset.page);
      else if (button.dataset.pageAction === 'prev') this.page--;
      else if (button.dataset.pageAction === 'next') this.page++;
      else if (button.dataset.pageAction === 'go') this.#jump();
    };
    #change = event => { if (event.target.matches('.ml-page-size select') && !this.hasAttribute('disabled')) this.pageSize = event.target.value; };
    #keydown = event => {
      if (this.hasAttribute('disabled') || !this.page) return;
      if (event.target.matches('.ml-page-jump input') && event.key === 'Enter' && !event.isComposing) {
        event.preventDefault(); this.#jump(); return;
      }
      if (!event.target.closest('.ml-page-links')) return;
      const step = getComputedStyle(this).direction === 'rtl' ? -1 : 1;
      const pages = { ArrowLeft: this.page - step, ArrowRight: this.page + step, Home: 1, End: this.pageCount };
      if (!Object.hasOwn(pages, event.key)) return;
      event.preventDefault();
      this.page = Math.max(1, Math.min(this.pageCount, pages[event.key]));
      this.#focusPage();
    };
  }
  customElements.define('ml-pagination', Pagination);
})();
