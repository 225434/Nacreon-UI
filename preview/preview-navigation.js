(() => {
  'use strict';
  const types = ['toolbar', 'sidebar', 'drawer'];
  const records = [
    { id: 'DEMO-101', name: '山间湖泊', zone: '山野 · 湖泊', date: '2030-11-18', frames: 96, pending: false, saved: false, note: '湖泊组照已核对，原图已收入相册。' },
    { id: 'DEMO-102', name: '海岸峭壁', zone: '海岸 · 峭壁', date: '2030-11-19', frames: 144, pending: true, saved: true, note: '海岸组照已整理完毕，封面照片待选。' },
    { id: 'DEMO-104', name: '城市夜色', zone: '城市 · 夜景', date: '2030-11-12', frames: 128, pending: true, saved: false, note: '这组素材收录了两个取景角度的城市夜景。' },
    { id: 'DEMO-103', name: '沙丘晚照', zone: '沙漠 · 沙丘', date: '2030-11-20', frames: 64, pending: false, saved: false, note: '沙丘细节已选好，补充照片已收入相册。' },
  ];
  const groups = [['all', 'list', '全部记录'], ['pending', 'clock', '待复核'], ['saved', 'bookmark', '已收藏']];
  const icon = name => '<ml-icon name="' + name + '" size="18"></ml-icon>';
  const command = (action, name, label, attrs = '') => '<button type="button" data-action="' + action + '"' + attrs + '>' + icon(name) + '<span class="ml-tool-label">' + label + '</span></button>';
  const recordHead = '<div class="nav-record-head"><span class="nav-record-icon">' + icon('image') + '</span><div><small data-record-id>DEMO-101</small><strong data-record-name>山间湖泊</strong></div></div>';
  function sidebarMarkup() {
    return '<ml-sidebar label="记录导航" value="all"><nav aria-label="素材记录分组">' +
      groups.map(([value, name, label], i) => (i === 0 ? '<section><h3>资料库</h3>' : i === 2 ? '</section><section><h3>个人</h3>' : '') +
        '<button type="button" data-value="' + value + '">' + icon(name) + '<span class="ml-side-label">' + label +
        '</span><span class="ml-side-count" aria-hidden="true"></span></button>').join('') + '</section></nav></ml-sidebar>';
  }
  function drawerContent(record) {
    return '<dialog><header class="ml-drawer-header"><div><small data-detail="id">' + record.id +
      '</small><h2 data-detail="name">' + record.name + '</h2></div></header><div class="ml-drawer-body"><dl class="ml-nav-facts">' +
      [['zone', '所属主题', record.zone], ['date', '记录日期', record.date], ['frames', '照片数量', record.frames + ' 张'], ['status', '复核状态', record.pending ? '待复核' : '已复核']].map(([key, label, value]) =>
        '<div><dt>' + label + '</dt><dd data-detail="' + key + '">' + value + '</dd></div>').join('') +
      '</dl><p data-detail="note">' + record.note + '</p></div><footer class="ml-drawer-footer">' +
      '<ml-button variant="secondary"><button type="button" data-ml-drawer-close value="done">完成</button></ml-button></footer></dialog>';
  }
  const drawerMarkup = '<ml-drawer class="ml-nav-drawer"><div class="nav-card nav-drawer-launch">' + recordHead +
    '<ml-button variant="secondary"><button type="button" data-ml-drawer-open>查看详情</button></ml-button></div>' + drawerContent(records[0]) + '</ml-drawer>';
  const heroMarkup = {
    toolbar: '<div class="nav-card nav-tool-layout"><div>' + recordHead + '<p class="nav-meta" data-record-position></p></div>' +
      '<ml-toolbar aria-label="记录操作"><div role="group" aria-label="浏览记录">' + command('previous', 'chevron-left', '上一条') + command('next', 'chevron-right', '下一条') +
      '</div><div role="group" aria-label="收藏操作">' + command('save', 'bookmark', '收藏', ' aria-pressed="false"') + '</div></ml-toolbar></div>',
    sidebar: '<div class="nav-side-layout" data-ml-sidebar-layout>' + sidebarMarkup() +
      '<section class="nav-card" aria-label="分组内容"><h3 data-group-title>全部记录</h3><ul class="nav-list"></ul></section></div>',
    drawer: drawerMarkup,
  };

  // These two bindings also run in the independent examples produced by “示例代码”.
  function bindToolbar(root, data) {
    const toolbar = root.querySelector('ml-toolbar');
    let index = Math.max(0, data.findIndex(record => record.id === root.dataset.current));
    function render() {
      const record = data[index];
      root.dataset.current = record.id;
      root.querySelector('[data-record-id]').textContent = record.id;
      root.querySelector('[data-record-name]').textContent = record.name;
      root.querySelector('[data-record-position]').textContent = '第 ' + (index + 1) + ' / ' + data.length + ' 条 · ' + (record.saved ? '已收藏' : '未收藏');
      toolbar.querySelector('[data-action="previous"]').disabled = index === 0;
      toolbar.querySelector('[data-action="next"]').disabled = index === data.length - 1;
      toolbar.querySelector('[data-action="save"]').setAttribute('aria-pressed', String(record.saved));
    }
    toolbar.addEventListener('ml-toolbar-action', ({ detail }) => {
      if (detail.action === 'previous') index = Math.max(0, index - 1);
      if (detail.action === 'next') index = Math.min(data.length - 1, index + 1);
      if (detail.action === 'save') data[index].saved = detail.pressed;
      render();
      if (detail.item.disabled) toolbar.querySelector(detail.action === 'next' ? '[data-action="previous"]' : '[data-action="next"]').focus();
    });
    render();
  }
  function bindSidebar(root, data) {
    const side = root.querySelector('ml-sidebar');
    const list = root.querySelector('.nav-list');
    function render() {
      const value = side.getAttribute('value') || 'all';
      const rows = data.filter(record => value === 'all' || record[value]);
      const item = [...side.querySelectorAll('[data-value]')].find(button => button.dataset.value === value);
      root.querySelector('[data-group-title]').textContent = item?.querySelector('.ml-side-label').textContent || '全部记录';
      for (const count of side.querySelectorAll('.ml-side-count')) {
        const group = count.parentElement.dataset.value;
        count.textContent = String(data.filter(record => group === 'all' || record[group]).length);
      }
      list.replaceChildren(...rows.map(record => {
        const row = document.createElement('li'), id = document.createElement('small');
        id.textContent = record.id;
        row.append(record.name, id);
        return row;
      }));
    }
    side.addEventListener('ml-sidebar-change', render);
    render();
  }
  const bindings = { toolbar: bindToolbar, sidebar: bindSidebar };
  const samples = {};
  for (const type of types) {
    const template = document.createElement('template');
    template.innerHTML = '<div class="ml-nav-sample">' + heroMarkup[type] + '</div>';
    const root = template.content.firstElementChild.cloneNode(true);
    const data = records.map(record => ({ ...record }));
    document.getElementById(type + '-specimen').append(root);
    bindings[type]?.(root, data);
    samples[type] = { template, root, data };
  }

  const examples = document.getElementById('navigation-examples');
  const board = examples.querySelector('.ml-nav-board');
  board.innerHTML = sidebarMarkup() + '<section class="nav-board-content"><div class="nav-board-tools"><h4 data-board-title>全部记录</h4>' +
    '<ml-toolbar aria-label="分组记录操作">' + command('oldest', 'sort', '最早优先', ' aria-pressed="false"') +
    command('save', 'bookmark', '收藏', ' aria-pressed="false"') + command('details', 'info', '详情', ' aria-haspopup="dialog"') +
    '</ml-toolbar></div><fieldset class="nav-board-rows"><legend class="sr-only">选择要操作的记录</legend></fieldset>' +
    '<p class="nav-board-empty" hidden>还没有收藏的记录。</p></section><ml-drawer class="ml-nav-drawer">' + drawerContent(records[0]) + '</ml-drawer>';
  const boardSide = board.querySelector('ml-sidebar'), boardToolbar = board.querySelector('ml-toolbar'), boardDrawer = board.querySelector('ml-drawer');
  const rowGroup = board.querySelector('fieldset');
  const boardData = records.map(record => ({ ...record })).sort((a, b) => b.date.localeCompare(a.date));
  const boardRows = new Map();
  let selected = boardData[0], oldest = false;
  for (const record of boardData) {
    const row = document.createElement('div');
    row.className = 'nav-board-row';
    row.innerHTML = '<label><input type="radio" name="nav-board-record" value="' + record.id + '"><span><strong>' + record.name +
      '</strong><small>' + record.id + ' · ' + record.date + '</small></span></label><span class="nav-row-status" data-pending="' + record.pending + '">' +
      (record.pending ? '待复核' : '已复核') + '</span><button type="button" class="nav-row-detail" aria-label="查看' + record.name + '详情" title="查看详情" aria-haspopup="dialog">' + icon('chevron-right') + '</button>';
    row.querySelector('input').addEventListener('change', () => { selected = record; renderBoard(); });
    row.querySelector('button').addEventListener('click', event => { selected = record; renderBoard(); openRecord(event.currentTarget); });
    boardRows.set(record, row);
    rowGroup.append(row);
  }
  function renderBoard() {
    const group = boardSide.value || 'all';
    const visible = boardData.filter(record => group === 'all' || record[group]);
    if (oldest) visible.reverse();
    if (!visible.includes(selected)) selected = visible[0];
    board.querySelector('[data-board-title]').textContent = groups.find(entry => entry[0] === group)[2];
    for (const count of boardSide.querySelectorAll('.ml-side-count')) {
      const key = count.parentElement.dataset.value;
      count.textContent = String(boardData.filter(record => key === 'all' || record[key]).length);
    }
    for (const [record, row] of boardRows) {
      row.hidden = !visible.includes(record);
      row.querySelector('input').checked = record === selected;
    }
    // Keep the radio and its neighboring detail button connected during selection.
    const order = [...visible, ...boardData.filter(record => !visible.includes(record))];
    order.forEach((record, i) => {
      const row = boardRows.get(record), slot = rowGroup.children[i + 1];
      if (row !== slot) rowGroup.insertBefore(row, slot ?? null);
    });
    board.querySelector('.nav-board-empty').hidden = visible.length > 0;
    for (const key of ['save', 'details']) boardToolbar.querySelector('[data-action="' + key + '"]').disabled = !selected;
    boardToolbar.querySelector('[data-action="save"]').setAttribute('aria-pressed', String(Boolean(selected?.saved)));
  }
  function openRecord(trigger) {
    if (!selected) return;
    const values = { ...selected, frames: selected.frames + ' 张', status: selected.pending ? '待复核' : '已复核' };
    for (const field of boardDrawer.querySelectorAll('[data-detail]')) field.textContent = values[field.dataset.detail];
    boardDrawer.showModal(trigger);
  }
  boardSide.addEventListener('ml-sidebar-change', renderBoard);
  boardToolbar.addEventListener('ml-toolbar-action', ({ detail }) => {
    if (detail.action === 'details') { openRecord(detail.item); return; }
    if (detail.action === 'oldest') oldest = detail.pressed;
    if (detail.action === 'save' && selected) selected.saved = detail.pressed;
    renderBoard();
    if (detail.item.disabled) boardToolbar.querySelector('[data-action="oldest"]').focus();
  });
  renderBoard();

  let active;
  function kind(type) { return document.querySelector('#' + type + '-kinds :checked').value; }
  function applyKind(type, root, value) {
    if (type === 'toolbar') {
      const toolbar = root.querySelector('ml-toolbar');
      toolbar.setAttribute('orientation', value === 'vertical' ? 'vertical' : 'horizontal');
      toolbar.toggleAttribute('icons-only', value === 'icons');
    } else if (type === 'sidebar') {
      const side = root.querySelector('ml-sidebar');
      side.setAttribute('layout', value === 'rail' ? 'inline' : value);
      side.toggleAttribute('collapsed', value === 'rail');
    } else root.querySelector('ml-drawer').setAttribute('placement', value);
  }
  function readout() {
    if (!types.includes(active)) return;
    const { root } = samples[active], shortcut = document.querySelector('#shortcut');
    let text, key, instruction;
    if (active === 'toolbar') {
      text = root.querySelector('[data-record-name]').textContent + ' · ' + root.querySelector('[data-record-position]').textContent;
      key = kind(active) === 'vertical' ? '↑ ↓' : '← →'; instruction = '切换工具';
    } else if (active === 'sidebar') {
      text = root.querySelector('[data-group-title]').textContent + ' · ' + root.querySelectorAll('.nav-list li').length + ' 条记录';
      key = '↑ ↓'; instruction = '浏览导航项';
    } else {
      text = root.querySelector('ml-drawer').open ? '正在查看山间湖泊' : '待查看 · 山间湖泊';
      key = 'Esc'; instruction = '关闭详情';
    }
    const status = document.querySelector('#stage-state');
    if (status.textContent !== text) status.textContent = text;
    document.querySelector('#state-dot').className = 'state-dot';
    shortcut.hidden = false;
    shortcut.querySelector('kbd').textContent = key;
    shortcut.querySelector('span').textContent = instruction;
  }
  for (const type of types) {
    document.getElementById(type + '-kinds').addEventListener('change', () => {
      applyKind(type, samples[type].root, kind(type)); readout();
    });
    for (const event of ['ml-toolbar-action', 'ml-sidebar-change', 'ml-drawer-open', 'ml-drawer-close']) samples[type].root.addEventListener(event, readout);
  }
  samples.sidebar.root.addEventListener('ml-sidebar-toggle', ({ detail }) => {
    if (!detail.narrow && !detail.collapsed && kind('sidebar') === 'rail') {
      document.querySelector('#sidebar-kinds [value="auto"]').checked = true;
      samples.sidebar.root.querySelector('ml-sidebar').setAttribute('layout', 'auto');
    }
  });
  function select(next) {
    const changed = next !== active;
    if (changed) {
      for (const drawer of document.querySelectorAll('ml-drawer')) if (drawer.open) drawer.close('navigation');
      for (const side of document.querySelectorAll('ml-sidebar')) side.closeNavigation();
    }
    active = next;
    for (const type of types) {
      document.getElementById(type + '-kinds').hidden = type !== next;
      document.getElementById(type + '-specimen').hidden = type !== next;
    }
    examples.hidden = !types.includes(next);
    examples.id = examples.hidden ? 'navigation-examples' : next + '-examples';
    if (changed && types.includes(next)) applyKind(next, samples[next].root, kind(next));
  }
  function code(type, head, lines, makeIcon) {
    const { template, root, data } = samples[type];
    const sample = template.content.firstElementChild.cloneNode(true);
    sample.id = type + '-example';
    applyKind(type, sample, kind(type));
    if (type === 'toolbar') sample.dataset.current = root.dataset.current;
    if (type === 'sidebar') {
      const liveSide = root.querySelector('ml-sidebar'), copy = sample.querySelector('ml-sidebar');
      copy.setAttribute('value', liveSide.value);
      copy.toggleAttribute('collapsed', liveSide.collapsed);
    }
    for (const icon of sample.querySelectorAll('ml-icon')) icon.replaceWith(makeIcon(icon.getAttribute('name'), { size: icon.getAttribute('size') }));
    const style = document.getElementById('navigation-demo-style').textContent.trimEnd();
    const html = sample.outerHTML.replace(/>(?=<(?:div|section|nav|ml-toolbar|ml-sidebar|ml-drawer|dialog|header|footer|fieldset|button|dl)\b)/g, '>\n    ');
    const result = [...head, '<style>' + style + '\n</style>', '', ...lines, '  ' + html, '</div>'];
    if (bindings[type]) {
      const rows = data.map(({ id, name, saved, pending }) => type === 'toolbar' ? { id, name, saved } : { id, name, saved, pending });
      result.push('', '<script>', '(' + bindings[type].toString() + ')(document.getElementById("' + sample.id + '"), ' + JSON.stringify(rows, null, 2) + ');', '</script>');
    }
    return result.join('\n');
  }
  window.MaterialNavigationPreview = { types, select, readout, code };
})();
