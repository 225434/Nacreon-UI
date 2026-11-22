(() => {
  'use strict';
  if (customElements.get('ml-tree')) return;

  const GlassControl = globalThis[Symbol.for('material-lib.glass-control.v1')];
  const { emit } = globalThis[Symbol.for('material-lib.navigation.v1')];
  const nodeSelector = 'li[data-node]';
  const excluded = '[hidden], [inert], [aria-hidden="true"]';
  const normalize = label => label.trim().normalize('NFKC').toLocaleLowerCase();
  let nextId = 0;

  class MaterialTree extends GlassControl {
    static observedAttributes = ['value'];
    #root;
    #nodes = new Map();
    #keys = new Map();
    #visible = [];
    #selected;
    #stop;
    #labelRefs = new WeakMap();
    #prefix = '';
    #typedAt = 0;
    #watch = new MutationObserver(records => {
      if (records.some(({ target, type, attributeName, addedNodes, removedNodes }) => {
        if (target === this) return type === 'childList' && [...addedNodes, ...removedNodes].some(node => node.localName === 'ul');
        if (attributeName === 'hidden' && target.localName === 'ul') return false;
        return target.closest('ml-tree') === this && !target.closest('.ml-optical');
      })) this.refresh();
    });

    get glassContent() { return this.querySelector(':scope > ul'); }
    get value() { return this.#selected?.key ?? ''; }
    set value(value) {
      if (value == null || value === '') this.removeAttribute('value');
      else this.setAttribute('value', String(value));
    }
    get selectedItem() { return this.#selected?.node ?? null; }

    connectedCallback() {
      super.connectedCallback();
      this.addEventListener('click', this.#click);
      this.addEventListener('keydown', this.#key);
      this.addEventListener('focusin', this.#focus);
      this.addEventListener('focusout', this.#blur);
      this.refresh();
      this.#watch.observe(this, { childList: true, subtree: true, attributes: true,
        attributeFilter: ['data-node', 'data-open', 'hidden', 'inert', 'aria-hidden', 'aria-disabled', 'id'] });
    }

    disconnectedCallback() {
      this.#watch.disconnect();
      this.removeEventListener('click', this.#click);
      this.removeEventListener('keydown', this.#key);
      this.removeEventListener('focusin', this.#focus);
      this.removeEventListener('focusout', this.#blur);
      super.disconnectedCallback();
    }

    attributeChangedCallback(name, before, after) {
      if (this.isConnected && before !== after) this.refresh();
    }

    #read(group, level, parent) {
      const entries = [];
      for (const node of group.children) {
        if (!node.matches(nodeSelector) || node.matches(excluded)) continue;
        const row = node.querySelector(':scope > .ml-tree-row');
        const label = row?.querySelector(':scope > .ml-tree-label');
        const key = node.dataset.node;
        if (!label || !key || this.#keys.has(key)) continue;
        const children = node.querySelector(':scope > ul');
        const disabled = parent?.disabled || node.getAttribute('aria-disabled') === 'true';
        const entry = { node, row, label, key, group: children, parent, level, disabled };
        entries.push(entry);
        this.#nodes.set(node, entry);
        this.#keys.set(key, entry);
        entry.children = children ? this.#read(children, level + 1, entry) : [];
      }
      for (const [index, entry] of entries.entries()) {
        entry.node.setAttribute('aria-posinset', String(index + 1));
        entry.node.setAttribute('aria-setsize', String(entries.length));
      }
      return entries;
    }

    #decorate(entry) {
      const { node, row, label, group, level, disabled } = entry;
      node.setAttribute('role', 'treeitem');
      node.setAttribute('aria-level', String(level));
      if (node !== this.#stop && node.getAttribute('tabindex') !== '-1') node.tabIndex = -1;
      node.toggleAttribute('data-ml-tree-disabled', Boolean(disabled));
      row.style.setProperty('--ml-tree-depth', String(level - 1));
      if (!label.id) {
        const scope = label.getRootNode();
        let id;
        do { id = 'ml-tree-label-' + ++nextId; } while (scope.getElementById(id));
        label.id = id;
      }
      const reference = node.getAttribute('aria-labelledby');
      if ((!reference && !node.hasAttribute('aria-label')) || reference === this.#labelRefs.get(node)) {
        node.setAttribute('aria-labelledby', label.id);
        this.#labelRefs.set(node, label.id);
      }
      if (!row.querySelector(':scope > .ml-tree-toggle')) row.insertAdjacentHTML('afterbegin',
        '<span class="ml-tree-toggle" aria-hidden="true"></span><span class="ml-tree-icon" aria-hidden="true"></span>');
      if (group) group.setAttribute('role', 'group');
    }

    #reveal(entry) {
      for (let ancestor = entry.parent; ancestor; ancestor = ancestor.parent) ancestor.node.setAttribute('data-open', '');
    }

    refresh() {
      this.#root = this.glassContent;
      this.#nodes.clear();
      this.#keys.clear();
      if (this.#root) {
        this.#root.setAttribute('role', 'tree');
        this.#root.tabIndex = -1;
        if (!this.#root.hasAttribute('aria-label') && !this.#root.hasAttribute('aria-labelledby')) {
          this.#root.setAttribute('aria-label', '目录');
        }
        this.#read(this.#root, 1);
      }
      const previous = this.#selected;
      const requested = this.#keys.get(this.getAttribute('value'));
      this.#selected = requested && !requested.disabled ? requested : null;
      if (this.#selected && this.#selected.node !== previous?.node) this.#reveal(this.#selected);
      for (const entry of this.#nodes.values()) this.#decorate(entry);
      this.#render();
      if (previous !== undefined && previous?.key !== this.#selected?.key) {
        emit(this, 'ml-tree-change', { value: this.value, previousValue: previous?.key ?? '', item: this.selectedItem });
      }
    }

    #render() {
      const active = this.#nodes.get(this.getRootNode().activeElement);
      this.#visible = [];
      for (const entry of this.#nodes.values()) {
        const { node, parent, children, disabled } = entry;
        entry.expanded = children.length > 0 && node.hasAttribute('data-open');
        entry.visible = !parent || (parent.visible && parent.expanded);
        if (entry.visible && !disabled) this.#visible.push(entry);
        if (children.length) node.setAttribute('aria-expanded', String(entry.expanded));
        else node.removeAttribute('aria-expanded');
        if (disabled) node.removeAttribute('aria-selected');
        else node.setAttribute('aria-selected', String(entry === this.#selected));
      }
      const stop = this.#nearest(active ?? this.#selected);
      this.#setStop(stop);
      const focusMoved = active && stop !== active;
      if (focusMoved) (stop?.node ?? this.#root).focus({ preventScroll: true });
      for (const { group, expanded } of this.#nodes.values()) {
        if (group && group.hidden === expanded) group.hidden = !expanded;
      }
      if (focusMoved) stop?.row.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    #nearest(entry) {
      for (let candidate = entry; candidate; candidate = candidate.parent) {
        if (candidate.visible && !candidate.disabled) return candidate;
      }
      return this.#visible[0];
    }

    #setStop(entry) {
      if (this.#stop && this.#stop !== entry?.node) this.#stop.tabIndex = -1;
      this.#stop = entry?.node;
      if (this.#stop && this.#stop.tabIndex !== 0) this.#stop.tabIndex = 0;
    }

    focus(options) { this.#stop?.focus(options); }

    select(value) {
      const entry = this.#keys.get(String(value));
      if (!entry || entry.disabled) return false;
      if (entry === this.#selected) {
        this.#reveal(entry);
        this.#render();
      } else this.value = entry.key;
      return true;
    }

    setExpanded(value, expanded) {
      const entry = this.#keys.get(String(value));
      if (!entry?.children.length || entry.disabled) return false;
      const next = Boolean(expanded);
      if (entry.expanded === next) return true;
      entry.node.toggleAttribute('data-open', next);
      this.#render();
      emit(this, 'ml-tree-toggle', { value: entry.key, expanded: next, item: entry.node });
      return true;
    }

    setAllExpanded(expanded) {
      for (const entry of this.#nodes.values()) {
        if (entry.children.length && !entry.disabled) entry.node.toggleAttribute('data-open', Boolean(expanded));
      }
      this.#render();
    }

    #focus = event => {
      const entry = this.#nodes.get(event.target);
      if (entry?.visible && !entry.disabled) this.#setStop(entry);
    };

    #blur = event => {
      if (!this.contains(event.relatedTarget)) {
        queueMicrotask(() => {
          if (!this.contains(this.getRootNode().activeElement)) this.#setStop(this.#nearest(this.#selected));
        });
      }
    };

    #click = event => {
      if (event.defaultPrevented || event.button !== 0) return;
      const entry = this.#nodes.get(event.target.closest(nodeSelector));
      if (!entry?.visible || entry.disabled) return;
      const onNode = event.target === entry.node;
      if (!onNode && !entry.row.contains(event.target)) return;
      entry.node.focus({ preventScroll: true });
      if (entry.children.length && (onNode || event.target.closest('.ml-tree-toggle'))) {
        this.setExpanded(entry.key, !entry.expanded);
      } else this.select(entry.key);
    };

    #key = event => {
      if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
      const entry = this.#nodes.get(event.target);
      if (!entry?.visible || entry.disabled) return;
      const index = this.#visible.indexOf(entry);
      let target;
      switch (event.key) {
        case 'ArrowUp': target = this.#visible[index - 1]; break;
        case 'ArrowDown': target = this.#visible[index + 1]; break;
        case 'Home': target = this.#visible[0]; break;
        case 'End': target = this.#visible.at(-1); break;
        case 'ArrowRight':
          if (entry.expanded) target = this.#visible.find(item => item.parent === entry);
          else this.setExpanded(entry.key, true);
          break;
        case 'ArrowLeft':
          if (entry.expanded) this.setExpanded(entry.key, false);
          else target = entry.parent;
          break;
        case 'Enter':
        case ' ': this.select(entry.key); break;
        default:
          if (event.key.length !== 1) return;
          target = this.#typeAhead(event.key, index);
          if (!target) return;
      }
      event.preventDefault();
      if (target) {
        target.node.focus({ preventScroll: true });
        target.row.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    };

    #typeAhead(key, index) {
      const char = normalize(key);
      const now = Date.now();
      this.#prefix = now - this.#typedAt < 550 && this.#prefix !== char ? this.#prefix + char : char;
      this.#typedAt = now;
      const options = this.#visible.slice(index + 1).concat(this.#visible.slice(0, index + 1));
      return options.find(entry => normalize(entry.label.textContent).startsWith(this.#prefix));
    }
  }
  customElements.define('ml-tree', MaterialTree);
})();
