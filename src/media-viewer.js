(() => {
  'use strict';
  if (customElements.get('ml-media-viewer')) return;

  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  const linkSelector = 'a[data-media][href]';
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const point = event => ({ x: event.clientX, y: event.clientY });
  const center = ([a, b]) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const distance = ([a, b]) => Math.hypot(a.x - b.x, a.y - b.y);

  class MediaSurface extends GlassControl {
    get glassContent() { return this.querySelector('.ml-media-stage'); }
  }
  customElements.define('ml-media-surface', MediaSurface);

  const icon = (action, glyph, label) =>
    '<button class="ml-media-icon" type="button" data-action="' + action + '" data-icon="' + glyph +
    '" title="' + label + '" aria-label="' + label + '"></button>';

  class MediaViewer extends HTMLElement {
    static observedAttributes = ['value'];
    #items = [];
    #item;
    #media;
    #view;
    #dialog;
    #stage;
    #list;
    #status;
    #events;
    #loadEvents;
    #scale = 1;
    #x = 0;
    #y = 0;
    #pointers = new Map();
    #sizes = new ResizeObserver(() => { if (this.#image) this.#draw(); });
    #watch = new MutationObserver(records => {
      if (records.some(({ target, type, addedNodes, removedNodes }) => target === this
        ? type === 'childList' && [...addedNodes, ...removedNodes].some(node => node.localName === 'ul')
        : this.#list?.contains(target))) this.refresh();
    });

    get value() { return this.#item?.key ?? ''; }
    set value(value) {
      if (value == null || value === '') this.removeAttribute('value');
      else this.setAttribute('value', String(value));
    }
    get selectedItem() { return this.#item?.link ?? null; }
    get media() { return this.#media ?? null; }
    get open() { return Boolean(this.#dialog?.open); }
    get #image() { return this.#media?.localName === 'img' && this.#media.naturalWidth && !this.#media.hidden ? this.#media : null; }

    connectedCallback() {
      if (!this.#view) this.#mount();
      this.#events = new AbortController();
      const signal = this.#events.signal;
      this.addEventListener('click', this.#click, { signal });
      this.addEventListener('keydown', this.#key, { signal });
      this.#dialog.addEventListener('close', () => {
        if (!this.open) this.#restore(true);
      }, { signal });
      this.#stage.addEventListener('wheel', this.#wheel, { passive: false, signal });
      this.#stage.addEventListener('dblclick', this.#doubleClick, { signal });
      this.#stage.addEventListener('pointerdown', this.#press, { signal });
      this.#stage.addEventListener('pointermove', this.#move, { signal });
      for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        this.#stage.addEventListener(name, this.#release, { signal });
      }
      this.#sizes.observe(this.#stage);
      this.refresh();
      this.#watch.observe(this, { childList: true, characterData: true, subtree: true, attributes: true,
        attributeFilter: ['href', 'data-media', 'data-kind', 'data-title', 'data-alt', 'data-poster', 'data-captions', 'hidden'] });
    }

    disconnectedCallback() {
      this.#watch.disconnect();
      this.#sizes.disconnect();
      this.#events.abort();
      this.close(false);
      this.pause();
      this.#endGesture();
    }

    attributeChangedCallback(name, before, after) {
      if (this.isConnected && this.#view && before !== after) this.refresh();
    }

    #mount() {
      this.#view = this.ownerDocument.createElement('ml-media-surface');
      this.#view.innerHTML = `
        <div class="ml-media-heading">
          <div class="ml-media-heading-text"><strong data-media-title></strong><small data-media-count aria-live="polite"></small></div>
          ${icon('enlarge', 'expand', '放大预览')}
        </div>
        <div class="ml-media-stage" role="group" tabindex="0">
          <div class="ml-media-status">
            <p role="status"></p><button type="button" data-action="retry" hidden>重试</button>
          </div>
        </div>
        <div class="ml-media-toolbar">
          <div class="ml-media-switcher" role="group" aria-label="切换媒体">
            ${icon('previous', 'chevron-left', '上一项')}${icon('next', 'chevron-right', '下一项')}
          </div>
          <div class="ml-media-zoom" role="group" aria-label="缩放图片" hidden>
            ${icon('zoom-out', 'zoom-out', '缩小图片')}
            <button type="button" data-action="fit" aria-label="恢复适应" title="恢复适应">100%</button>
            ${icon('zoom-in', 'zoom', '放大图片')}
          </div>
        </div>`;
      this.#dialog = this.ownerDocument.createElement('dialog');
      this.#dialog.className = 'ml-media-dialog';
      this.#stage = this.#view.querySelector('.ml-media-stage');
      this.#status = this.#stage.querySelector('.ml-media-status');
      this.prepend(this.#view);
      this.append(this.#dialog);
      this.#expanded(false);
    }

    #button(action) { return this.#view.querySelector('[data-action="' + action + '"]'); }

    refresh() {
      this.#list = this.querySelector(':scope > ul');
      const seen = new Set();
      this.#items = [];
      for (const link of this.#list?.querySelectorAll(':scope > li > ' + linkSelector) ?? []) {
        const data = link.dataset, key = data.media;
        if (!key || seen.has(key) || !link.getAttribute('href').trim() || link.hidden || link.parentElement.hidden) continue;
        seen.add(key);
        this.#items.push({
          link, key, url: link.href, kind: data.kind === 'video' ? 'video' : 'image',
          title: data.title || link.textContent.trim() || key, alt: data.alt,
          poster: data.poster || '', captions: data.captions || '',
        });
      }
      const previous = this.#item;
      this.#item = this.#items.find(item => item.key === this.getAttribute('value')) ?? this.#items[0] ?? null;
      const changed = this.#item
        ? ['key', 'url', 'kind', 'poster', 'captions'].some(prop => this.#item[prop] !== previous?.[prop])
        : previous !== null;
      if (changed) this.#load();
      this.#readout();
      if (changed && this.selectedItem && this.#list.clientWidth) {
        const box = this.selectedItem.getBoundingClientRect(), frame = this.#list.getBoundingClientRect();
        this.#list.scrollLeft += box.left < frame.left ? box.left - frame.left : Math.max(0, box.right - frame.right);
      }
      if (previous !== undefined && previous?.key !== this.#item?.key) {
        this.dispatchEvent(new CustomEvent('ml-media-change', { bubbles: true, composed: true,
          detail: { value: this.value, previousValue: previous?.key ?? '', item: this.selectedItem } }));
      }
    }

    #readout() {
      const item = this.#item, index = this.#items.indexOf(item);
      const focused = this.getRootNode().activeElement;
      const title = item?.title ?? '媒体预览';
      const count = item ? (item.kind === 'video' ? '视频' : '图片') + ' · ' + (index + 1) + ' / ' + this.#items.length : '';
      const heading = this.#view.querySelector('[data-media-title]');
      const badge = this.#view.querySelector('[data-media-count]');
      if (heading.textContent !== title) heading.textContent = title;
      if (badge.textContent !== count) badge.textContent = count;
      badge.hidden = !count;
      this.#dialog.setAttribute('aria-label', title + ' · 放大预览');
      this.#stage.setAttribute('aria-label', title);
      this.#view.querySelector('.ml-media-toolbar').hidden = !item;
      this.#view.querySelector('.ml-media-zoom').hidden = item?.kind !== 'image';
      this.#button('previous').disabled = index <= 0;
      this.#button('next').disabled = index < 0 || index + 1 >= this.#items.length;
      this.#button('enlarge').disabled = !item;
      for (const link of this.#list?.querySelectorAll(linkSelector) ?? []) {
        if (link === item?.link) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      }
      if (this.#media?.localName === 'img') this.#media.alt = item.alt ?? title;
      if (this.#media?.localName === 'video') this.#media.setAttribute('aria-label', title);
      this.#zoomReadout();
      if (focused && this.#view.contains(focused) && (focused.matches(':disabled') || focused.closest('[hidden]'))) {
        this.#stage.focus({ preventScroll: true });
      }
    }

    #message(message, error = false) {
      this.#status.hidden = !message;
      this.#status.querySelector('p').textContent = message;
      this.#status.toggleAttribute('data-error', error);
      this.#button('retry').hidden = !error;
    }

    #load() {
      this.#endGesture();
      this.#loadEvents?.abort();
      this.pause();
      if (this.#media?.localName === 'video') {
        this.#media.removeAttribute('src');
        this.#media.load();
      }
      this.#media?.remove();
      this.#media = null;
      this.#scale = 1;
      this.#x = this.#y = 0;
      this.#stage.removeAttribute('data-zoomed');
      const item = this.#item;
      this.#stage.dataset.kind = item?.kind ?? '';
      this.#message(item ? '正在加载' + (item.kind === 'video' ? '视频' : '图片') + '…' : '暂无可预览的媒体');
      if (!item) return;
      const isVideo = item.kind === 'video';
      const media = this.ownerDocument.createElement(isVideo ? 'video' : 'img');
      this.#media = media;
      this.#loadEvents = new AbortController();
      const options = { signal: this.#loadEvents.signal };
      media.addEventListener(isVideo ? 'loadedmetadata' : 'load', () => {
        this.#message('');
        if (!isVideo) this.#draw();
      }, options);
      media.addEventListener('error', () => {
        media.hidden = true;
        this.#message('无法加载' + (isVideo ? '视频' : '图片'), true);
        this.#zoomReadout();
      }, options);
      if (isVideo) {
        media.controls = true;
        media.playsInline = true;
        media.preload = 'metadata';
        media.setAttribute('aria-label', item.title);
        if (item.poster) media.poster = item.poster;
        if (item.captions) {
          const track = this.ownerDocument.createElement('track');
          track.kind = 'captions';
          track.label = '字幕';
          track.srclang = this.ownerDocument.documentElement.lang || 'zh-CN';
          track.src = item.captions;
          media.append(track);
        }
      } else {
        media.alt = item.alt ?? item.title;
        media.draggable = false;
        media.decoding = 'async';
      }
      this.#stage.prepend(media);
      media.src = item.url;
    }

    select(value) {
      const key = String(value);
      if (!this.#items.some(item => item.key === key)) return false;
      this.value = key;
      return true;
    }

    #step(direction) {
      const target = this.#items[this.#items.indexOf(this.#item) + direction];
      if (target) this.select(target.key);
    }

    pause() { if (this.#media?.localName === 'video') this.#media.pause(); }

    show() {
      if (!this.isConnected || this.open || !this.#item || typeof this.#dialog.showModal !== 'function') return false;
      this.#endGesture();
      this.#dialog.append(this.#view);
      try { this.#dialog.showModal(); }
      catch { this.#restore(false); return false; }
      this.#expanded(true);
      this.#button('enlarge').focus({ preventScroll: true });
      return true;
    }

    close(restoreFocus = true) {
      if (this.open) this.#dialog.close();
      this.#restore(restoreFocus);
    }

    #restore(focus) {
      if (this.#view.parentElement !== this.#dialog) return;
      this.#endGesture();
      this.prepend(this.#view);
      this.#expanded(false);
      if (focus) this.#button('enlarge').focus({ preventScroll: true });
    }

    #expanded(open) {
      const control = this.#button('enlarge');
      const label = open ? '关闭放大预览' : '放大预览';
      control.dataset.icon = open ? 'close' : 'expand';
      control.title = label;
      control.setAttribute('aria-label', label);
      if (open) control.removeAttribute('aria-haspopup');
      else control.setAttribute('aria-haspopup', 'dialog');
    }

    #zoomReadout() {
      const fit = this.#button('fit');
      fit.textContent = Math.round(this.#scale * 100) + '%';
      fit.disabled = !this.#image || this.#scale === 1;
      this.#button('zoom-out').disabled = fit.disabled;
      this.#button('zoom-in').disabled = !this.#image || this.#scale === 4;
    }

    #draw() {
      const img = this.#image;
      if (!img) return;
      const w = this.#stage.clientWidth, h = this.#stage.clientHeight;
      if (!w || !h) return;
      const fit = Math.min(w / img.naturalWidth, h / img.naturalHeight);
      const limitX = Math.max(0, (fit * img.naturalWidth * this.#scale - w) / 2);
      const limitY = Math.max(0, (fit * img.naturalHeight * this.#scale - h) / 2);
      this.#x = clamp(this.#x, -limitX, limitX);
      this.#y = clamp(this.#y, -limitY, limitY);
      this.#stage.toggleAttribute('data-zoomed', this.#scale > 1);
      img.style.transform = 'translate(' + this.#x + 'px, ' + this.#y + 'px) scale(' + this.#scale + ')';
      this.#zoomReadout();
    }

    #zoom(scale, anchor, shift = { x: 0, y: 0 }) {
      if (!this.#image) return;
      const next = clamp(scale, 1, 4);
      const box = this.#stage.getBoundingClientRect();
      const x = anchor ? anchor.x - box.left - box.width / 2 : 0;
      const y = anchor ? anchor.y - box.top - box.height / 2 : 0;
      const ratio = next / this.#scale;
      this.#x = x - (x - this.#x) * ratio + shift.x;
      this.#y = y - (y - this.#y) * ratio + shift.y;
      this.#scale = next;
      this.#draw();
    }

    #wheel = event => {
      if (!this.#image || this.getRootNode().activeElement !== this.#stage || event.ctrlKey || event.metaKey || !event.deltaY) return;
      event.preventDefault();
      this.#zoom(this.#scale * (event.deltaY < 0 ? 1.15 : 1 / 1.15), point(event));
    };

    #doubleClick = event => { if (this.#image) this.#zoom(this.#scale > 1 ? 1 : 2, point(event)); };

    #press = event => {
      if (!this.#image || event.button !== 0 || this.#pointers.size >= 2) return;
      this.#pointers.set(event.pointerId, point(event));
      this.#stage.setPointerCapture(event.pointerId);
      this.#stage.setAttribute('data-dragging', '');
    };

    #move = event => {
      const prior = this.#pointers.get(event.pointerId);
      if (!prior) return;
      const before = [...this.#pointers.values()];
      const next = point(event);
      this.#pointers.set(event.pointerId, next);
      if (before.length === 2) {
        const after = [...this.#pointers.values()];
        const first = center(before), last = center(after);
        this.#zoom(this.#scale * (distance(after) / Math.max(1, distance(before))), first,
          { x: last.x - first.x, y: last.y - first.y });
      } else if (this.#scale > 1) {
        this.#x += next.x - prior.x;
        this.#y += next.y - prior.y;
        this.#draw();
      }
    };

    #release = event => {
      this.#pointers.delete(event.pointerId);
      if (!this.#pointers.size) this.#stage.removeAttribute('data-dragging');
    };

    #endGesture() {
      const pointers = [...this.#pointers.keys()];
      this.#pointers.clear();
      for (const pointerId of pointers) {
        if (this.#stage.hasPointerCapture(pointerId)) this.#stage.releasePointerCapture(pointerId);
      }
      this.#stage.removeAttribute('data-dragging');
    }

    #click = event => {
      if (event.defaultPrevented || event.button !== 0 || event.target.closest('ml-media-viewer') !== this) return;
      const link = event.target.closest(linkSelector);
      if (link && this.#list?.contains(link)) {
        if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
        if (this.select(link.dataset.media)) event.preventDefault();
        return;
      }
      const button = event.target.closest('button[data-action]');
      if (!button || button.disabled || !this.#view.contains(button)) return;
      switch (button.dataset.action) {
        case 'previous': this.#step(-1); break;
        case 'next': this.#step(1); break;
        case 'enlarge': if (this.open) this.close(); else this.show(); break;
        case 'zoom-out': this.#zoom(this.#scale / 1.25); break;
        case 'zoom-in': this.#zoom(this.#scale * 1.25); break;
        case 'fit': this.#zoom(1); break;
        case 'retry': this.#load(); this.#zoomReadout(); break;
      }
      if (button.disabled && this.getRootNode().activeElement !== this.#stage) this.#stage.focus({ preventScroll: true });
    };

    #key = event => {
      if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey ||
          event.target.closest('ml-media-viewer') !== this || event.target.closest('video, input, textarea, select, [contenteditable]')) return;
      const key = event.key;
      if (this.#image && ['+', '=', '-', '0'].includes(key)) {
        this.#zoom(key === '0' ? 1 : this.#scale * (key === '-' ? 1 / 1.25 : 1.25));
      } else if (this.#image && this.#scale > 1 && event.target === this.#stage &&
          ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) {
        this.#x += key === 'ArrowLeft' ? 32 : key === 'ArrowRight' ? -32 : 0;
        this.#y += key === 'ArrowUp' ? 32 : key === 'ArrowDown' ? -32 : 0;
        this.#draw();
      } else if (key === 'ArrowLeft' || key === 'ArrowRight') {
        this.#step(key === 'ArrowLeft' ? -1 : 1);
      } else return;
      event.preventDefault();
    };
  }
  customElements.define('ml-media-viewer', MediaViewer);
})();
