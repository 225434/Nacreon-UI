(() => {
  'use strict';
  if (customElements.get('ml-navigation-panel')) return;

  let sequence = 0;
  const normalize = value => (value || '').normalize('NFKC').toLowerCase().replace(/[\s/_-]+/g, '');
  const template = document.createElement('template');
  template.innerHTML = `
    <div class="ml-catalog-panel">
      <header class="ml-catalog-head">
        <button class="ml-catalog-back" type="button" hidden><span></span></button>
        <h2 class="ml-catalog-title" tabindex="-1"></h2>
        <button class="ml-catalog-find" type="button" aria-label="搜索全部条目" title="搜索全部条目" hidden></button>
        <button class="ml-catalog-dismiss" type="button" data-ml-dialog-close aria-label="关闭导航面板" title="关闭导航面板" hidden></button>
        <div class="ml-catalog-search">
          <span class="ml-catalog-glyph" aria-hidden="true"></span>
          <input type="search" aria-description="搜索所有层级，按上下方向键浏览结果。" autocomplete="off" spellcheck="false" enterkeyhint="go">
          <button class="ml-catalog-clear" type="button" aria-label="清除搜索" hidden></button>
        </div>
      </header>
      <div class="ml-catalog-viewport">
        <div class="ml-catalog-results">
          <span class="ml-catalog-count" role="status" aria-atomic="true"></span>
          <div class="ml-catalog-empty" hidden><p></p><button type="button">清除搜索</button></div>
        </div>
      </div>
    </div>`;
  const groupTemplate = document.createElement('template');
  groupTemplate.innerHTML = '<button class="ml-catalog-group" type="button"><span class="ml-catalog-name"></span><span class="ml-catalog-quantity" aria-hidden="true"></span></button>';

  function rank(fields, words) {
    const names = fields.slice(0, 3);
    const matches = values => words.every(word => values.some(value => value.includes(word)));
    if (names.includes(words.join(''))) return 0;
    if (matches(names)) return 1;
    if (matches(fields.slice(0, 5))) return 2;
    return matches(fields) ? 3 : Infinity;
  }

  // Sort the real rows so reading order, keyboard order and native link actions agree.
  function order(group, items) {
    let cursor = group.button ? group.button.nextElementSibling : group.element.firstElementChild;
    for (const { element } of items) {
      if (element.parentElement !== group.element) continue;
      if (cursor !== element) group.element.insertBefore(element, cursor);
      cursor = element.nextElementSibling;
    }
  }

  function restoreOrder(group) {
    order(group, group.items);
    for (const item of group.items) if (item.items) restoreOrder(item);
  }

  function mark(row, icon) {
    let glyph = row.querySelector(':scope > .ml-catalog-mark');
    if (!/^[a-z][a-z0-9-]*$/.test(icon || '')) { glyph?.remove(); return; }
    if (!glyph) {
      glyph = document.createElement('span');
      glyph.className = 'ml-catalog-mark';
      glyph.setAttribute('aria-hidden', 'true');
      row.prepend(glyph);
    }
    glyph.style.setProperty('--ml-entry-icon', 'var(--ml-catalog-icon-' + icon + ', var(--ml-catalog-icon-page))');
  }

  function readLeaf(element, path) {
    let copy = element.querySelector(':scope > .ml-catalog-copy');
    if (!copy) {
      copy = document.createElement('span');
      copy.className = 'ml-catalog-copy';
      const detail = element.querySelector(':scope > small');
      const name = document.createElement('span');
      name.className = 'ml-catalog-name';
      name.append(...[...element.childNodes].filter(node => node !== detail));
      copy.append(name);
      if (detail) copy.append(detail);
      element.append(copy);
    }
    const title = copy.querySelector('.ml-catalog-name').textContent.trim();
    let alias = copy.querySelector('.ml-catalog-alias');
    if (element.dataset.en) {
      if (!alias) {
        alias = document.createElement('span');
        alias.className = 'ml-catalog-alias'; alias.lang = 'en';
        alias.setAttribute('aria-hidden', 'true');
        copy.append(alias);
      }
      alias.textContent = element.dataset.en;
    } else alias?.remove();
    let context = copy.querySelector('.ml-catalog-context');
    if (!context) {
      context = document.createElement('span');
      context.className = 'ml-catalog-context';
      copy.append(context);
    }
    context.textContent = path.join(' › ');
    const link = element.matches('a[href]') ? element : null;
    if (!link) element.tabIndex = -1;
    const slug = link?.hash.slice(1) || link?.pathname.split('/').filter(Boolean).at(-1);
    const detail = copy.querySelector('small');
    const fields = [title, element.dataset.en, slug, path.join(' '), element.dataset.keywords,
      element.dataset.lead, detail?.textContent].map(normalize);
    mark(element, element.dataset.icon);
    element.classList.add('ml-catalog-leaf');
    return { element, title, fields, link, hasDetail: !!(detail || element.dataset.en) };
  }

  // Copy only the painted parts of a row. The departing page has no live controls or links.
  function snapshotRow(source) {
    const doc = source.ownerDocument;
    const row = doc.createElement(source.matches('a') ? 'a' : 'div');
    row.className = source.className;
    for (const name of ['data-icon', 'dir', 'aria-current']) {
      if (source.hasAttribute(name)) row.setAttribute(name, source.getAttribute(name));
    }
    for (const child of source.querySelectorAll(':scope > :is(.ml-catalog-mark, .ml-catalog-copy, .ml-catalog-name, .ml-catalog-quantity)')) {
      const copy = doc.createElement('span');
      copy.className = child.className;
      if (child.matches('.ml-catalog-mark')) copy.style.cssText = child.style.cssText;
      if (child.matches('.ml-catalog-copy')) {
        for (const field of child.children) {
          const text = doc.createElement(field.localName === 'small' ? 'small' : 'span');
          text.className = field.className;
          text.textContent = field.textContent;
          copy.append(text);
        }
      } else copy.textContent = child.textContent;
      row.append(copy);
    }
    return row;
  }

  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  class MaterialNavigationPanel extends GlassControl {
    #nav;
    #panel;
    #title;
    #back;
    #find;
    #query;
    #results;
    #empty;
    #status;
    #trigger;
    #tree;
    #groups = new Map();
    #leaves = [];
    #trail = [];
    #searchOpen = false;
    #searchScroll = null;
    #ranked = false;
    #ownsSurface = false;
    #slide;
    #observer = new MutationObserver(records => { if (this.#dataChanged(records)) this.refresh(); });

    get glassContent() { return this.#panel; }
    get #dialog() { return this.parentElement?.matches('ml-dialog > dialog') ? this.parentElement : null; }
    get #level() { return this.#groups.get(this.#trail.at(-1)?.section) || this.#tree; }
    get entries() {
      if (this.#dataChanged(this.#observer.takeRecords())) this.refresh();
      return this.#leaves.filter(item => item.link).map(({ link, title }) => ({ link, title }));
    }

    connectedCallback() {
      this.refresh();
      this.#ownsSurface = !this.#dialog;
      if (this.#ownsSurface) super.connectedCallback();
      for (const type of ['click', 'input', 'keydown']) this.addEventListener(type, this.#onEvent);
    }

    disconnectedCallback() {
      this.#observer.disconnect();
      this.#finishSlide();
      this.#releaseTrigger();
      for (const type of ['click', 'input', 'keydown']) this.removeEventListener(type, this.#onEvent);
      if (this.#ownsSurface) super.disconnectedCallback();
    }

    #releaseTrigger() {
      this.#trigger?.setAttribute('aria-expanded', 'false');
      this.#trigger = null;
    }

    showModal(trigger, { focusSearch = !matchMedia('(pointer: coarse)').matches } = {}) {
      const dialog = this.#dialog;
      if (!dialog || dialog.open || !this.#panel) return;
      this.#releaseTrigger();
      this.#trigger = trigger;
      this.reset();
      const dismiss = this.#panel.querySelector('.ml-catalog-dismiss');
      this.#query.autofocus = focusSearch;
      dismiss.autofocus = !focusSearch;
      dialog.parentElement.showModal(trigger);
      this.#query.autofocus = dismiss.autofocus = false;
      trigger?.setAttribute('aria-expanded', 'true');
      dialog.addEventListener('close', () => {
        if (dialog.open) return;
        this.#finishSlide();
        this.#releaseTrigger();
      }, { once: true });
      if (focusSearch) this.focusSearch();
    }

    #observe() {
      if (!this.isConnected) return;
      this.#observer.observe(this, { childList: true, attributes: true, attributeFilter: ['label', 'search-label'] });
      if (this.#nav) this.#observer.observe(this.#nav, { subtree: true, childList: true, characterData: true,
        attributes: true, attributeFilter: ['href', 'data-en', 'data-lead', 'data-keywords', 'data-icon'] });
    }

    #dataChanged(records) {
      return records.some(record => record.target !== this || record.type === 'attributes' ||
        [...record.addedNodes].some(node => node.localName === 'nav') || [...record.removedNodes].includes(this.#panel));
    }

    #mount(nav) {
      this.#panel = template.content.firstElementChild.cloneNode(true);
      this.#title = this.#panel.querySelector('.ml-catalog-title');
      this.#back = this.#panel.querySelector('.ml-catalog-back');
      this.#find = this.#panel.querySelector('.ml-catalog-find');
      this.#results = this.#panel.querySelector('.ml-catalog-results');
      this.#query = this.#panel.querySelector('input');
      this.#empty = this.#panel.querySelector('.ml-catalog-empty');
      this.#status = this.#panel.querySelector('[role="status"]');
      this.append(this.#panel);
      this.#empty.before(nav);
    }

    #readGroup(element, title, path, button = null) {
      const group = { element, title, button, items: [], count: 0 };
      this.#groups.set(element, group);
      for (const child of element.querySelectorAll(':scope > :is(section, a[href], p)')) {
        if (child.localName !== 'section') {
          const leaf = readLeaf(child, path);
          group.items.push(leaf);
          this.#leaves.push(leaf);
          group.count++;
          continue;
        }
        const heading = child.querySelector(':scope > :is(h2, h3, h4, h5, h6)');
        if (!heading) { child.hidden = true; continue; }
        const name = heading.textContent.trim();
        heading.hidden = true;
        let row = child.querySelector(':scope > .ml-catalog-group');
        if (!row) { row = groupTemplate.content.firstElementChild.cloneNode(true); heading.after(row); }
        const icon = child.dataset.icon || heading.querySelector('use')?.getAttribute('href')?.match(/^#i-([\w-]+)$/)?.[1] || 'folder';
        row.dataset.icon = icon;
        mark(row, icon);
        row.querySelector('.ml-catalog-name').textContent = name;
        row.setAttribute('aria-controls', this.#nav.id);
        const section = this.#readGroup(child, name, [...path, name], row);
        row.querySelector('.ml-catalog-quantity').textContent = section.count;
        row.setAttribute('aria-description', section.count + ' 个条目');
        group.items.push(section);
        group.count += section.count;
      }
      return group;
    }

    refresh() {
      this.#finishSlide();
      this.#observer.disconnect();
      if (this.#panel?.parentElement !== this) {
        const previous = this.querySelector(':scope > .ml-catalog-panel');
        const source = previous?.querySelector('.ml-catalog-results > nav');
        if (source) { source.removeAttribute('id'); previous.replaceWith(source); }
        this.#panel = this.#nav = null;
      }
      const next = this.querySelector(':scope > nav');
      if (next) {
        if (this.#panel) this.#nav.replaceWith(next);
        else this.#mount(next);
        this.#nav = next;
        if (!next.id || this.ownerDocument.getElementById(next.id) !== next) {
          let id;
          do { id = 'ml-catalog-links-' + ++sequence; } while (this.ownerDocument.getElementById(id));
          next.id = id;
        }
        this.#query.setAttribute('aria-controls', next.id);
        this.#trail = []; this.#searchOpen = false; this.#searchScroll = null;
        this.#query.value = ''; this.#ranked = false;
      }
      this.#groups.clear();
      this.#leaves = [];
      if (!this.#nav) { this.#tree = null; this.#observe(); return; }
      if (this.#ranked) restoreOrder(this.#tree);
      this.#tree = this.#readGroup(this.#nav, this.getAttribute('label') || '导航面板', []);
      let rows = 1;
      for (const group of this.#groups.values()) {
        let units = 0;
        for (const item of group.items) {
          if (item.items) units += Number(item.count > 0);
          else units += item.hasDetail ? 1.25 : 1;
        }
        rows = Math.max(rows, units);
      }
      this.#panel.style.setProperty('--ml-nav-row-count', rows);
      const lost = this.#trail.findIndex(frame => !this.#groups.get(frame.section)?.count ||
        frame.section.parentElement !== frame.parent);
      if (lost >= 0) this.#trail.length = lost;
      if (!this.#trail.length) this.#searchOpen = false;
      this.#panel.querySelector('.ml-catalog-dismiss').hidden = !this.#dialog;
      const prompt = this.getAttribute('search-label') || '搜索全部条目';
      this.#query.placeholder = prompt;
      this.#query.setAttribute('aria-label', prompt);
      this.#find.setAttribute('aria-label', prompt);
      this.#find.title = prompt;
      this.#render();
    }

    #render() {
      if (this.#dataChanged(this.#observer.takeRecords())) { this.refresh(); return; }
      this.#observer.disconnect();
      const level = this.#level;
      const path = new Set(this.#trail.map(frame => frame.section));
      const words = this.#query.value.trim().split(/\s+/).map(normalize).filter(Boolean);
      const searching = words.length > 0;
      let matches = 0;
      if (!searching && this.#ranked) restoreOrder(this.#tree);
      const visit = group => {
        const scores = [];
        let best = Infinity;
        for (const item of group.items) {
          let score = Infinity;
          if (item.items) {
            score = visit(item);
            const row = !searching && group === level && item.count > 0;
            item.button.hidden = !row;
            item.element.hidden = searching ? !Number.isFinite(score) : !row && !path.has(item.element);
          } else {
            if (searching) score = rank(item.fields, words);
            item.element.hidden = searching ? !Number.isFinite(score) : group !== level;
            if (searching && !item.element.hidden) matches++;
          }
          if (searching) { scores.push({ element: item.element, score }); best = Math.min(best, score); }
        }
        if (searching) order(group, scores.sort((a, b) => a.score - b.score));
        return best;
      };
      visit(this.#tree);
      this.#ranked = searching;
      const nested = level !== this.#tree;
      this.#panel.toggleAttribute('data-nested', nested);
      this.#panel.toggleAttribute('data-search-open', nested && this.#searchOpen);
      this.#panel.toggleAttribute('data-searching', searching);
      this.#title.textContent = level.title;
      this.#back.hidden = !nested;
      if (nested) {
        const parent = this.#searchOpen ? level : this.#groups.get(level.element.parentElement);
        this.#back.firstElementChild.textContent = parent.title;
        this.#back.setAttribute('aria-label', '返回' + parent.title);
      }
      this.#find.hidden = !nested || this.#searchOpen;
      this.#query.parentElement.hidden = nested && !this.#searchOpen;
      this.#panel.querySelector('.ml-catalog-clear').hidden = !this.#query.value;
      const empty = searching ? matches === 0 : level.count === 0;
      this.#nav.hidden = empty;
      this.#empty.hidden = !empty;
      this.#empty.querySelector('p').textContent = searching ? '没有找到匹配项' : '暂无导航条目';
      this.#empty.querySelector('button').hidden = !searching;
      const status = searching ? '找到 ' + matches + ' 项' : level.title + '，' + level.count + ' 个条目';
      if (this.#status.textContent !== status) this.#status.textContent = status;
      this.#observe();
    }

    #finishSlide() {
      if (!this.#slide) return;
      const { previous, animations } = this.#slide;
      this.#slide = null;
      const viewport = previous.parentElement;
      previous.remove();
      viewport?.removeAttribute('data-step');
      for (const animation of animations) animation.cancel();
    }

    #captureSlide(forward) {
      const height = this.getAttribute('density') === 'compact' ? this.#panel.offsetHeight : 0;
      const listHeight = this.#results.clientHeight;
      this.#finishSlide();
      const win = this.ownerDocument.defaultView;
      const style = win.getComputedStyle(this.#panel);
      const travel = style.getPropertyValue('--ml-travel').trim();
      const duration = Math.min(240, parseFloat(travel) * (travel.endsWith('ms') ? 1 : 1000));
      if (!(duration > 0) || !this.#results.animate || !listHeight ||
          win.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
      const previous = this.ownerDocument.createElement('div');
      previous.className = 'ml-catalog-results ml-catalog-outgoing';
      if (height) previous.style.blockSize = listHeight + 'px';
      previous.inert = true;
      previous.setAttribute('aria-hidden', 'true');
      const list = this.ownerDocument.createElement('div');
      list.className = 'ml-catalog-list';
      for (const item of this.#level.items) {
        const row = item.button || item.element;
        if (!row.hidden) list.append(snapshotRow(row));
      }
      previous.append(list);
      return { previous, forward, height, duration, easing: style.getPropertyValue('--ml-front-ease').trim() || 'ease-out',
        sign: style.direction === 'rtl' ? -1 : 1, scroll: this.#results.scrollTop };
    }

    #playSlide(slide) {
      if (!slide) return;
      const { previous, forward, height, duration, easing, sign, scroll } = slide;
      const viewport = this.#results.parentElement;
      viewport.dataset.step = forward ? 'forward' : 'back';
      viewport.append(previous);
      previous.scrollTop = scroll;
      const shift = amount => ({ transform: 'translateX(' + amount * sign + '%)' });
      const options = { duration, easing };
      const animations = [
        this.#results.animate([shift(forward ? 100 : -28), shift(0)], options),
        previous.animate([shift(0), shift(forward ? -28 : 100)], options),
      ];
      if (height) {
        const target = this.#panel.offsetHeight;
        if (height !== target) {
          animations.push(this.#panel.animate([{ blockSize: height + 'px' }, { blockSize: target + 'px' }], options));
        }
      }
      this.#slide = { previous, animations };
      const frames = globalThis[Symbol.for('material-lib.motion-frames.v1')];
      for (const animation of animations) frames.track(animation, this);
      const finish = () => {
        if (this.#slide?.previous === previous) this.#finishSlide();
      };
      animations[0].finished.then(finish, finish);
    }

    #enter(section) {
      const slide = this.#captureSlide(true);
      this.#trail.push({ section, parent: this.#level.element, scroll: this.#results.scrollTop });
      this.#searchOpen = false; this.#searchScroll = null; this.#query.value = '';
      this.#render();
      this.#results.scrollTop = 0;
      this.#title.focus({ preventScroll: true });
      this.#playSlide(slide);
    }

    #clearSearch(collapse) {
      const scroll = this.#searchScroll ?? 0;
      this.#query.value = '';
      if (collapse) this.#searchOpen = false;
      this.#searchScroll = this.#searchOpen ? scroll : null;
      this.#finishSlide();
      this.#render();
      this.#results.scrollTop = scroll;
      (this.#query.parentElement.hidden ? this.#find : this.#query).focus({ preventScroll: true });
    }

    #goBack() {
      if (this.#query.value || this.#searchOpen) { this.#clearSearch(true); return true; }
      const frame = this.#trail.at(-1);
      if (!frame) return false;
      const slide = this.#captureSlide(false);
      this.#trail.pop();
      this.#render();
      this.#results.scrollTop = frame.scroll;
      this.#groups.get(frame.section)?.button.focus({ preventScroll: true });
      this.#playSlide(slide);
      return true;
    }

    focusSearch() {
      if (!this.#nav) return;
      if (this.#trail.length && !this.#searchOpen) {
        this.#searchOpen = true;
        this.#searchScroll = this.#results.scrollTop;
        this.#finishSlide();
        this.#render();
      }
      this.#query.focus({ preventScroll: true });
    }

    reset({ reveal = false } = {}) {
      if (this.#dataChanged(this.#observer.takeRecords())) this.refresh();
      if (!this.#nav) return;
      this.#trail = [];
      this.#query.value = ''; this.#searchOpen = false; this.#searchScroll = null;
      this.#finishSlide();
      const link = reveal && this.#leaves.find(item => item.link?.getAttribute('aria-current') === 'page')?.link;
      for (let section = link?.parentElement; section && section !== this.#nav; section = section.parentElement) {
        this.#trail.unshift({ section, parent: section.parentElement, scroll: 0 });
      }
      this.#render();
      this.#results.scrollTop = 0;
      if (link) link.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    }

    #onEvent = event => {
      const target = event.target;
      if (!this.#tree || target.closest('ml-navigation-panel, ml-catalog') !== this) return;
      if (event.type === 'input') {
        if (target !== this.#query) return;
        this.#finishSlide();
        if (this.#query.value && this.#searchScroll === null) this.#searchScroll = this.#results.scrollTop;
        this.#render();
        this.#results.scrollTop = this.#query.value ? 0 : this.#searchScroll ?? 0;
        if (!this.#query.value && !this.#searchOpen) this.#searchScroll = null;
        return;
      }
      const button = target.closest('button');
      if (event.type === 'click') {
        if (event.defaultPrevented) return;
        if (button === this.#back) this.#goBack();
        else if (button === this.#find) this.focusSearch();
        else if (button?.matches('.ml-catalog-group')) this.#enter(button.parentElement);
        else if (button?.matches('.ml-catalog-clear') || this.#empty.contains(button)) this.#clearSearch(false);
        const link = target.closest('a[href]');
        if (link && this.#nav.contains(link) && this.#dialog?.open && event.button === 0 &&
            !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey &&
            !link.hasAttribute('download') && (!link.target || link.target.toLowerCase() === '_self')) this.#dialog.close();
        return;
      }
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229 ||
          event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      const key = event.key, fromSearch = target === this.#query;
      if (key === 'Escape') {
        if (this.#goBack()) event.preventDefault();
        else if (fromSearch && this.#dialog?.open) {
          event.preventDefault();
          if (this.#dialog.dispatchEvent(new Event('cancel', { cancelable: true }))) this.#dialog.close('cancel');
        }
        return;
      }
      if (!fromSearch && (key === 'ArrowLeft' || key === 'ArrowRight')) {
        const forward = key === (getComputedStyle(this).direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight');
        if (!forward && this.#goBack()) event.preventDefault();
        else if (forward && button?.matches('.ml-catalog-group')) { event.preventDefault(); this.#enter(button.parentElement); }
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter'].includes(key) ||
          (fromSearch && (key === 'Home' || key === 'End')) || (!fromSearch && key === 'Enter')) return;
      const rows = [...this.#nav.querySelectorAll(':is(.ml-catalog-group, .ml-catalog-leaf):not([hidden])')]
        .filter(row => !row.closest('[hidden]'));
      if (key === 'Enter') {
        event.preventDefault();
        if (this.#ranked && rows[0]?.matches('a[href]')) rows[0].click();
        return;
      }
      if (!rows.length) return;
      event.preventDefault();
      const index = rows.indexOf(target.closest('.ml-catalog-group, .ml-catalog-leaf'));
      const next = key === 'Home' ? 0 : key === 'End' || (index < 0 && key === 'ArrowUp') ? rows.length - 1
        : key === 'ArrowDown' ? Math.min(index + 1, rows.length - 1) : index - 1;
      (next < 0 ? (this.#query.parentElement.hidden ? this.#back : this.#query) : rows[next]).focus();
    };
  }

  customElements.define('ml-navigation-panel', MaterialNavigationPanel);
  if (!customElements.get('ml-catalog')) customElements.define('ml-catalog', class extends MaterialNavigationPanel {});
})();
