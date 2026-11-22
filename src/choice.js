(() => {
  'use strict';

  if (customElements.get('ml-choice')) return;
  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  const inputSelector = 'input:is([type="checkbox"], [type="radio"])';
  const masterSelector = 'input[type="checkbox"][data-ml-all]';

  class Choice extends GlassControl {
    get glassContent() { return this.querySelector(':scope > ' + inputSelector); }
  }
  customElements.define('ml-choice', Choice);

  // Keep the selection visible when a common fieldset is disabled. A disabled
  // option or sub-fieldset that only affects a child is outside the bulk action.
  function selectableWith(field, master) {
    if (!field.matches(':disabled')) return true;
    if (field.disabled) return false;
    for (let fs = field.closest('fieldset[disabled]'); fs; fs = fs.parentElement?.closest('fieldset[disabled]')) {
      const legend = fs.querySelector(':scope > legend');
      if (!legend?.contains(field) && (!fs.contains(master) || legend?.contains(master))) return false;
    }
    return true;
  }

  function setUnavailable(master, unavailable) {
    if (unavailable && !master.disabled) {
      master.setAttribute('data-ml-choice-empty', '');
      master.disabled = true;
    } else if (!unavailable && master.hasAttribute('data-ml-choice-empty')) {
      master.removeAttribute('data-ml-choice-empty');
      master.disabled = false;
    }
  }

  // An application can explicitly disable the master while all children are unavailable.
  // Our own automatic disable always changes an absent attribute to a present one.
  function preserveExplicitDisables(records) {
    for (const { target, attributeName, oldValue } of records) {
      if (attributeName === 'disabled' && oldValue !== null && target.disabled && target.hasAttribute('data-ml-choice-empty')) {
        target.removeAttribute('data-ml-choice-empty');
      }
    }
  }

  class ChoiceGroup extends HTMLElement {
    #master;
    #events;
    #sending = false;
    #changes = new MutationObserver(records => this.#refresh(records));

    get options() {
      return [...this.querySelectorAll('ml-choice > ' + inputSelector)]
        .filter(field => !field.matches(masterSelector) && field.closest('ml-choice-group') === this);
    }

    connectedCallback() {
      this.#events = new AbortController();
      const listen = { capture: true, signal: this.#events.signal };
      this.addEventListener('input', this.#select, listen);
      this.addEventListener('change', this.#select, listen);
      this.getRootNode().addEventListener('reset', this.#reset, listen);
      this.#changes.observe(this, { childList: true, subtree: true, attributeOldValue: true,
        attributeFilter: ['type', 'checked', 'disabled', 'data-ml-all'] });
      this.refresh();
    }

    disconnectedCallback() {
      preserveExplicitDisables(this.#changes.takeRecords());
      this.#changes.disconnect();
      this.#events.abort();
      if (this.#master) setUnavailable(this.#master, false);
      this.#master = null;
    }

    #members(master) {
      return this.options.filter(field => field.type === 'checkbox' && selectableWith(field, master));
    }

    refresh() { this.#refresh(this.#changes.takeRecords()); }

    #refresh(records) {
      preserveExplicitDisables(records);
      const master = [...this.querySelectorAll('ml-choice > ' + masterSelector)]
        .find(field => field.closest('ml-choice-group') === this);
      if (this.#master && this.#master !== master) setUnavailable(this.#master, false);
      this.#master = master;
      if (!master) return;
      const options = this.#members(master);
      master.checked = options.length > 0 && options.every(field => field.checked && !field.indeterminate);
      master.indeterminate = !master.checked && options.some(field => field.checked || field.indeterminate);
      setUnavailable(master, options.length === 0);
    }

    #select = event => {
      const field = event.target;
      if (this.#sending || !field.matches?.('ml-choice > ' + inputSelector) || field.closest('ml-choice-group') !== this) return;
      // Native activation already applied the bulk action during input. Its change
      // event must keep any corrections made by the application's input listeners.
      if (!field.matches(masterSelector) || field.matches(':disabled') || (event.type === 'change' && event.isTrusted)) {
        this.refresh();
        return;
      }
      const checked = field.checked;
      const changed = this.#members(field).filter(option => option.checked !== checked || option.indeterminate);
      for (const option of changed) {
        option.checked = checked;
        option.indeterminate = false;
      }
      this.refresh();
      // Observers see the final selection, including when they listen on an individual option.
      this.#sending = true;
      try {
        for (const option of changed) {
          option.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
          option.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } finally {
        this.#sending = false;
        this.refresh();
      }
    };

    #reset = event => {
      if (!this.#master || (event.target !== this.#master.form && !this.options.some(field => field.form === event.target))) return;
      // Let the browser restore defaultChecked before deriving the mixed indicator.
      setTimeout(() => { if (this.isConnected && !event.defaultPrevented) this.refresh(); }, 0);
    };
  }
  customElements.define('ml-choice-group', ChoiceGroup);
})();
