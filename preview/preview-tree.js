(() => {
  'use strict';

  function bindTreeBrowser(browser, update = () => {}) {
    const tree = browser.querySelector('ml-tree');
    const name = browser.querySelector('[data-tree-name]');
    const path = browser.querySelector('[data-tree-path]');
    const details = browser.querySelector('[data-tree-details]');
    const label = item => item.querySelector(':scope > .ml-tree-row > .ml-tree-label').textContent.trim();

    function render() {
      const selected = tree.selectedItem;
      const ancestors = [];
      for (let item = selected?.parentElement.closest('li[data-node]'); item; item = item.parentElement.closest('li[data-node]')) {
        ancestors.unshift(label(item));
      }
      const title = selected ? label(selected) : '请选择节点';
      const description = selected?.dataset.description ?? '';
      name.textContent = title;
      path.textContent = ancestors.join(' / ');
      path.hidden = !ancestors.length;
      details.textContent = description;
      details.hidden = !description;
      update(selected ? title : '');
    }

    tree.addEventListener('ml-tree-change', render);
    render();
    return tree;
  }

  window.createTreePreview = function () {
    const specimen = document.querySelector('#tree-specimen');
    const tools = document.querySelector('#tree-tools');
    const source = document.querySelector('#tree-template').content.firstElementChild;
    const example = source.cloneNode(true);
    specimen.append(example);
    const status = document.querySelector('#stage-state');
    let label;

    function show() {
      if (specimen.hidden) return;
      const text = label ? '已选 ' + label : '请选择节点';
      if (status.textContent !== text) status.textContent = text;
      document.querySelector('#state-dot').className = label ? 'state-dot on' : 'state-dot off';
      document.querySelector('#shortcut').hidden = true;
    }

    const tree = bindTreeBrowser(example, title => { label = title; show(); });
    tools.querySelector('[data-tree-open]').addEventListener('click', () => tree.setAllExpanded(true));
    tools.querySelector('[data-tree-close]').addEventListener('click', () => tree.setAllExpanded(false));

    function select(enabled) { tools.hidden = specimen.hidden = !enabled; }

    function code(head, lines) {
      const copy = source.cloneNode(true);
      copy.id = 'tree-browser-sample';
      const sample = copy.querySelector('ml-tree');
      if (tree.value) sample.setAttribute('value', tree.value);
      else sample.removeAttribute('value');
      const open = new Set([...tree.querySelectorAll('li[data-node][data-open]')].map(item => item.dataset.node));
      for (const item of sample.querySelectorAll('li[data-node]')) item.toggleAttribute('data-open', open.has(item.dataset.node));
      lines[2] = lines[2].replace(/>$/, ' data-ml-theme-surface>');
      const style = document.querySelector('#tree-demo-style').textContent.trim();
      return head.concat('<style>', style, '</style>', '', lines, '  ' + copy.outerHTML, '</div>', '', '<script>',
        '  customElements.whenDefined("ml-tree").then(() => {',
        '    (' + bindTreeBrowser.toString() + ')(document.getElementById("tree-browser-sample"));',
        '  });', '</script>').join('\n');
    }
    return { select, show, code };
  };
})();
