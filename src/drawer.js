(() => {
  'use strict';
  if (customElements.get('ml-drawer')) return;
  let serial = 0;
  function identify(element, prefix) {
    if (!element.id || element.ownerDocument.getElementById(element.id) !== element) {
      let id;
      do { id = prefix + (++serial); } while (element.ownerDocument.getElementById(id));
      element.id = id;
    }
    return element.id;
  }

  class MaterialDrawer extends HTMLElement {
    #shell;
    #native;
    #opener;
    #watch = new MutationObserver(records => {
      if (records.some(record => record.target === this || [...record.addedNodes, ...record.removedNodes].some(node =>
        node.matches?.('dialog, [data-ml-drawer-open], .ml-drawer-header') || node.querySelector?.('[data-ml-drawer-open]')))) this.#sync();
    });
    get dialog() { return this.#native; }
    get open() { return Boolean(this.#native?.open); }
    get returnValue() { return this.#native?.returnValue ?? ''; }
    get placement() { return this.getAttribute('placement') || 'auto'; }
    set placement(value) { this.setAttribute('placement', value); }
    connectedCallback() {
      this.#sync();
      this.#watch.observe(this, { childList: true, subtree: true });
      this.addEventListener('click', this.#click);
    }
    disconnectedCallback() {
      this.#watch.disconnect();
      this.removeEventListener('click', this.#click);
      this.#native?.removeEventListener('close', this.#closed);
      if (this.open) this.#native.close();
      this.#updateTriggers();
      this.#native = this.#shell = this.#opener = null;
    }
    showModal(trigger) {
      this.#sync();
      if (!this.#native || this.#native.matches(':modal')) return;
      if (this.open) this.#native.close();
      this.#opener = trigger || this.ownerDocument.activeElement;
      this.#shell.showModal(this.#opener);
      this.#updateTriggers();
      this.dispatchEvent(new CustomEvent('ml-drawer-open', { bubbles: true, detail: { trigger: this.#opener } }));
    }
    close(value = '') { this.#shell?.close(value); this.#updateTriggers(); }
    #sync() {
      const direct = this.querySelector(':scope > dialog');
      this.#shell = this.querySelector(':scope > ml-dialog');
      if (direct) {
        if (!this.#shell) {
          this.#shell = this.ownerDocument.createElement('ml-dialog');
          this.#shell.setAttribute('dismiss-on-backdrop', '');
          direct.before(this.#shell);
        }
        this.#shell.append(direct);
      }
      const dialog = this.#shell?.dialog;
      if (this.#native !== dialog) {
        this.#native?.removeEventListener('close', this.#closed);
        this.#native = dialog;
        dialog?.addEventListener('close', this.#closed);
      }
      if (!dialog) return;
      identify(dialog, 'ml-drawer-');
      const generated = dialog.querySelector(':scope > [data-ml-drawer-header]');
      let header = dialog.querySelector(':scope > .ml-drawer-header:not([data-ml-drawer-header])');
      if (header) generated?.remove();
      else header = generated;
      if (!header) {
        header = this.ownerDocument.createElement('header');
        header.className = 'ml-drawer-header';
        header.setAttribute('data-ml-drawer-header', '');
        const existing = dialog.querySelector(':scope > :is(h1,h2,h3)');
        if (existing) header.append(existing);
        dialog.prepend(header);
      }
      const fallback = header.querySelector('[data-ml-drawer-heading]');
      let heading = header.querySelector(':is(h1, h2, h3):not([data-ml-drawer-heading])');
      if (heading) fallback?.remove();
      else heading = fallback;
      if (!heading) {
        heading = this.ownerDocument.createElement('h2');
        heading.setAttribute('data-ml-drawer-heading', '');
        heading.textContent = dialog.getAttribute('aria-label') || '详情';
        header.prepend(heading);
      }
      if (!dialog.hasAttribute('aria-label') && (!dialog.hasAttribute('aria-labelledby') || dialog.hasAttribute('data-ml-drawer-labelled'))) {
        dialog.setAttribute('aria-labelledby', identify(heading, 'ml-drawer-title-'));
        dialog.setAttribute('data-ml-drawer-labelled', '');
      }
      if (!header.querySelector('[data-ml-drawer-close], [data-ml-dialog-close]')) {
        const close = this.ownerDocument.createElement('button');
        close.type = 'button';
        close.value = 'close';
        close.className = 'ml-drawer-dismiss';
        close.setAttribute('data-ml-drawer-close', '');
        close.setAttribute('aria-label', '关闭详情');
        close.title = '关闭详情';
        header.append(close);
      }
      this.#updateTriggers();
    }
    #updateTriggers() {
      for (const button of this.querySelectorAll('[data-ml-drawer-open]')) {
        if (button.closest('ml-drawer') !== this) continue;
        button.setAttribute('aria-haspopup', 'dialog');
        if (this.#native) button.setAttribute('aria-controls', this.#native.id);
        button.setAttribute('aria-expanded', String(this.open));
      }
    }
    #click = event => {
      if (event.defaultPrevented || event.target.closest?.('ml-drawer') !== this) return;
      const button = event.target.closest('button[data-ml-drawer-open], button[data-ml-drawer-close]');
      if (!button || button.matches(':disabled, [aria-disabled="true"]')) return;
      if (button.hasAttribute('data-ml-drawer-open')) {
        event.preventDefault();
        this.showModal(button);
      } else if (this.open && this.#native.contains(button)) {
        event.preventDefault();
        this.close(button.value || 'close');
      }
    };
    #closed = event => {
      if (event.target !== this.#native || this.open) return;
      this.#updateTriggers();
      const trigger = this.#opener;
      this.#opener = null;
      this.dispatchEvent(new CustomEvent('ml-drawer-close', { bubbles: true, detail: { trigger, returnValue: this.returnValue } }));
    };
  }
  customElements.define('ml-drawer', MaterialDrawer);
})();
