(() => {
  'use strict';

  const pages = [
    { id: 'library', label: '素材档案', detail: '按主题浏览相册和照片。' },
    { id: 'collections', label: '主题目录', detail: '选择要浏览的相册集合。' },
    { id: 'landscapes', label: '风景合集', detail: '浏览专题相册和选片记录。' },
    { id: 'collections-overview', label: '专题相册', detail: '按相册查看照片和笔记。' },
    { id: 'lake-picks', label: '湖泊精选', detail: '相册编号 ALB-01' },
    { id: 'photos', label: '拍摄照片', detail: '3 张拍摄照片 · 09:42 更新', icon: 'image' },
  ];
  const targetId = page => 'breadcrumb-demo-' + page.id;

  function writePath(trail, depth) {
    const doc = trail.ownerDocument;
    const items = pages.slice(0, depth + 1).map((page, index) => {
      const item = doc.createElement('li');
      const entry = doc.createElement(index === depth ? 'span' : 'a');
      entry.textContent = page.label;
      if (index === depth) {
        entry.setAttribute('aria-current', 'page');
        entry.title = page.label;
      } else {
        entry.href = '#' + targetId(page);
        entry.dataset.breadcrumbLevel = index;
        if (index === 0) entry.setAttribute('data-home', '');
      }
      item.append(entry);
      return item;
    });
    trail.replaceChildren(...items);
  }

  window.createBreadcrumbPreview = function () {
    const widths = document.querySelector('#breadcrumb-widths');
    const tools = document.querySelector('#breadcrumb-tools');
    const specimen = document.querySelector('#breadcrumb-specimen');
    const breadcrumb = specimen.querySelector('ml-breadcrumb');
    const title = specimen.querySelector('#breadcrumb-page-title');
    const detail = specimen.querySelector('#breadcrumb-page-detail');
    const child = specimen.querySelector('#breadcrumb-child');
    const icon = specimen.querySelector('ml-icon');
    const status = document.querySelector('#stage-state');
    let depth = pages.length - 1;

    function show() {
      if (specimen.hidden) return;
      const folded = breadcrumb.querySelectorAll('ml-breadcrumb-panel > ol > li').length;
      const message = folded ? '已折叠 ' + folded + ' 级' : '完整路径';
      if (message !== status.textContent) status.textContent = message;
      document.querySelector('#state-dot').className = 'state-dot';
      document.querySelector('#shortcut').hidden = true;
    }

    function go(index, focus = false) {
      depth = index;
      breadcrumb.close();
      writePath(breadcrumb.querySelector('nav > ol'), depth);
      breadcrumb.refresh();
      const page = pages[depth], next = pages[depth + 1];
      title.textContent = page.label;
      detail.textContent = page.detail;
      icon.setAttribute('name', page.icon || 'folder');
      child.hidden = !next;
      if (next) {
        child.href = '#' + targetId(next);
        child.dataset.breadcrumbLevel = depth + 1;
        child.querySelector('span').textContent = '进入' + next.label;
      }
      if (focus) title.focus({ preventScroll: true });
      show();
    }

    specimen.addEventListener('click', event => {
      const link = event.target.closest('a[data-breadcrumb-level]');
      if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      go(Number(link.dataset.breadcrumbLevel), true);
    });
    tools.querySelector('button').addEventListener('click', () => go(pages.length - 1));
    widths.addEventListener('change', () => {
      specimen.toggleAttribute('data-compact', widths.querySelector(':checked').value === 'compact');
    });
    new MutationObserver(show).observe(breadcrumb, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'] });
    go(depth);

    function select(enabled) {
      widths.hidden = tools.hidden = specimen.hidden = !enabled;
      if (!enabled) breadcrumb.close();
    }

    function code(head, lines) {
      const sample = document.createElement('ml-breadcrumb');
      const nav = document.createElement('nav');
      nav.setAttribute('aria-label', '当前位置');
      const trail = document.createElement('ol');
      trail.setAttribute('role', 'list');
      writePath(trail, depth);
      for (const link of trail.querySelectorAll('a')) link.removeAttribute('data-breadcrumb-level');
      nav.append(trail);
      sample.append(nav);
      if (specimen.hasAttribute('data-compact')) sample.style.setProperty('--ml-breadcrumb-width', '17.5rem');
      lines[2] = lines[2].replace(/>$/, ' data-ml-theme-surface>');
      const targets = pages.slice(0, depth + 1).map(page => {
        const section = document.createElement('section'), heading = document.createElement('h2'), detail = document.createElement('p');
        section.id = targetId(page);
        heading.textContent = page.label;
        detail.textContent = page.detail;
        section.append(heading, detail);
        return '  ' + section.outerHTML;
      });
      return head.concat(lines, '  ' + sample.outerHTML, ...targets, '</div>').join('\n');
    }
    return { select, show, code };
  };
})();
