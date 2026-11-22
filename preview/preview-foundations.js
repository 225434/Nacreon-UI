'use strict';

window.createFoundationPreview = function ({ appearance, paletteGroups, applyTheme, copyContents, stylesheet, scriptTag }) {
  const byId = id => document.getElementById(id);
  const root = document.documentElement;
  const titles = { typography: '排版样式', tokens: '令牌目录', themes: '主题预设' };
  const roles = [
    ['display', '展示标题', '风景手记', 'h1'], ['title', '页面标题', '山野相册概览', 'h1'],
    ['heading', '小节标题', '相册整理进度', 'h2'], ['body', '正文', '山间湖泊的照片已整理完毕，可以开始挑选封面。', 'p'],
    ['label', '字段标签', '记录名称', 'label'], ['caption', '辅助说明', '最近更新 09:41 · 已同步', 'small'],
    ['metric', '数据读数', '128.64 MB', 'span'], ['code', '代码与编号', 'album-demo.json', 'code'],
  ];
  const themes = { light: '浅色', warm: '暖色', dark: '深色' };
  const themeColors = [['background', '画布'], ['surface', '表面'], ['text', '正文'], ['action', '强调']];
  const groups = { space: '间距', shape: '圆角与描边', shadow: '阴影', type: '字体与排版', color: '颜色', material: '材质', motion: '动效' };
  const tokens = [];
  function token(group, key, label, property, kind, format) {
    const name = '--ml-' + key, ref = 'var(' + name + ')';
    tokens.push({ group, name, label, property, kind, ref, expression: format ? format(ref) : ref });
  }
  for (let step = 1; step <= 8; step++) token('space', 'space-' + step, '间距 ' + step, 'gap', 'space');
  for (const [key, label] of [['sm', '小圆角'], ['md', '中圆角'], ['lg', '大圆角'], ['xl', '特大圆角'], ['pill', '胶囊圆角']]) {
    token('shape', 'radius-' + key, label, 'border-radius', 'shape');
  }
  token('shape', 'border-width', '分隔线宽度', 'border-width', 'shape');
  token('shape', 'focus-width', '焦点环宽度', 'outline-width', 'shape');
  token('shape', 'focus-offset', '焦点环间距', 'outline-offset', 'shape');
  token('shadow', 'shadow-raised', '表面阴影', 'box-shadow', 'surface');
  token('shadow', 'shadow-overlay', '浮层阴影', 'box-shadow', 'surface');
  for (const [key, label] of [['sans', '无衬线字族'], ['serif', '衬线字族'], ['mono', '等宽字族']]) token('type', 'font-' + key, label, 'font-family', 'type');
  for (const [key, label] of roles.filter(([key]) => key !== 'code')) token('type', 'size-' + key, label + '字号', 'font-size', 'type');
  for (const [key, label] of [['regular', '常规'], ['medium', '中等'], ['semibold', '半粗'], ['bold', '粗体']]) token('type', 'weight-' + key, label + '字重', 'font-weight', 'type');
  for (const [key, label] of [['tight', '标题'], ['compact', '紧凑'], ['body', '正文']]) token('type', 'leading-' + key, label + '行高', 'line-height', 'type');
  token('type', 'tracking-tight', '紧凑字距', 'letter-spacing', 'type');
  token('type', 'tracking-normal', '标准字距', 'letter-spacing', 'type');
  token('type', 'measure', '正文行宽', 'max-inline-size', 'type');
  for (const [collection, entries] of Object.entries(paletteGroups)) {
    for (const [key, label] of entries) {
      const ink = key.startsWith('text') || (collection === 'semantic' && key !== 'action');
      token('color', 'color-' + key, label, ink ? 'color' : 'background-color', ink ? 'ink' : 'swatch');
    }
  }
  token('material', 'material-fill-opacity', '表面填充比例', 'background-color', 'surface', ref => 'color-mix(in srgb, var(--ml-color-surface) ' + ref + ', transparent)');
  token('material', 'material-border-opacity', '边框着色比例', 'border-color', 'surface', ref => 'color-mix(in srgb, var(--ml-color-text) ' + ref + ', transparent)');
  token('material', 'filter', '背景滤镜', 'backdrop-filter', 'surface');
  token('material', 'skin', '表面纹理', 'background-image', 'surface');
  token('material', 'highlight-relief', '凸面阴影', 'box-shadow', 'surface');
  for (const [key, label] of [['travel', '位移时长'], ['enter-time', '入场时长'], ['exit-time', '退场时长']]) token('motion', key, label, 'transition-duration', 'motion');
  token('motion', 'ease', '运动曲线', 'transition-timing-function', 'motion');

  let active = '', role = roles[1], family = 'auto', scope = 'page', localTheme;
  let selected = tokens.find(t => t.name === '--ml-space-4'), filtered = [], filterKey;
  const cards = [], themeInputs = new Map();
  const rows = new Map(), parts = [...document.querySelectorAll('[data-resource]')];
  const sample = byId('type-live'), textInput = byId('type-text'), art = byId('token-demo');
  const search = byId('token-search'), groupInput = byId('token-group'), themeSample = byId('themes-specimen');
  function node(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function choice(name, value) {
    const input = node('input', 'sr-only');
    input.type = 'radio'; input.name = name; input.value = value;
    return input;
  }
  for (const entry of roles) {
    const [key, label, example] = entry;
    const card = node('label', 'type-card'), input = choice('type-role', key), meta = node('span', 'type-role-meta');
    const specimen = node('span', 'type-role-example', example);
    specimen.dataset.mlType = key;
    meta.append(node('strong', '', label), node('code', 'type-role-key', key));
    card.append(input, meta, specimen);
    byId('typography-examples').append(card);
    cards.push({ input, specimen });
    input.addEventListener('change', () => { role = entry; showType(); });
  }
  function setFont(element) {
    if (family === 'auto') element.removeAttribute('data-ml-font');
    else element.dataset.mlFont = family;
  }
  function typeMetrics() {
    if (active !== 'typography') return;
    const style = getComputedStyle(sample);
    const pixels = value => Number.parseFloat(value).toFixed(1).replace(/\.0$/, '') + ' px';
    byId('type-size').textContent = pixels(style.fontSize);
    byId('type-leading').textContent = pixels(style.lineHeight);
    byId('type-weight').textContent = style.fontWeight;
    byId('type-tracking').textContent = style.letterSpacing === 'normal' ? '0 px' : pixels(style.letterSpacing);
    byId('type-stack').textContent = style.fontFamily;
  }
  function showType() {
    const [key, label, example] = role;
    sample.dataset.mlType = key; setFont(sample);
    sample.textContent = textInput.value || example;
    textInput.placeholder = example;
    byId('type-name').textContent = label;
    for (const { input, specimen } of cards) {
      input.checked = input.value === key;
      setFont(specimen);
    }
    const effective = family === 'auto' ? (key === 'code' ? 'mono' : 'sans') : family;
    byId('stage-state').textContent = { sans: '无衬线字族', serif: '衬线字族', mono: '等宽字族' }[effective];
    typeMetrics();
  }
  textInput.addEventListener('input', () => { sample.textContent = textInput.value || role[2]; });
  byId('type-families').addEventListener('change', e => { family = e.target.value; showType(); });
  window.addEventListener('resize', typeMetrics);

  for (const [key, label] of Object.entries(groups)) groupInput.add(new Option(label, key));
  function selectToken(item) {
    selected = item;
    byId('token-copy-status').textContent = '';
    showTokens();
  }
  function filterTokens() {
    const query = search.value.trim().toLowerCase(), group = groupInput.value;
    const key = [group, query].join('/');
    if (filterKey === key) return;
    filterKey = key;
    const terms = query.split(/\s+/).filter(Boolean);
    filtered = tokens.filter(t => (!group || group === t.group) && terms.every(term =>
      [t.label, t.name, t.property, groups[t.group], t.group].some(word => word.toLowerCase().includes(term))));
    if (!filtered.includes(selected)) selected = filtered[0];
    const list = byId('token-list');
    list.replaceChildren(); rows.clear();
    for (const t of filtered) {
      const button = node('button', 'token-row'), value = node('code');
      button.type = 'button';
      button.append(node('span', '', t.label), node('code', '', t.name), value);
      button.addEventListener('click', () => selectToken(t));
      list.append(button);
      rows.set(t, { button, value });
    }
    list.scrollTop = 0;
    byId('token-count').textContent = filtered.length + ' 项';
    byId('token-copy-status').textContent = '';
  }
  function showArt(t) {
    if (art.dataset.token === t.name) return;
    art.dataset.token = t.name; art.dataset.kind = t.kind;
    art.removeAttribute('style'); art.classList.remove('at-end'); art.replaceChildren();
    let target = art;
    if (t.kind === 'space') art.append(node('i'), node('i'));
    if (t.kind === 'ink' || t.kind === 'type') {
      art.textContent = t.property === 'line-height' || t.property === 'max-inline-size' ? '风景手记 Landscapes\n照片已归档' : '山野相册 Aa 018';
    }
    if (t.kind === 'motion') { target = node('i'); art.append(target); }
    if (t.property.startsWith('outline')) art.style.outline = '2px solid var(--ml-color-info)';
    if (t.property === 'backdrop-filter') art.style.backgroundColor = 'color-mix(in srgb, var(--ml-color-surface) 45%, transparent)';
    target.style.setProperty(t.property, t.expression);
  }
  function showTokens() {
    filterTokens();
    const style = getComputedStyle(root);
    for (const [t, { button, value }] of rows) {
      const resolved = style.getPropertyValue(t.name).trim();
      if (value.textContent !== resolved) { value.textContent = resolved; value.title = resolved; }
      button.setAttribute('aria-pressed', String(t === selected));
    }
    byId('token-empty').hidden = Boolean(selected);
    byId('token-selection').hidden = !selected;
    byId('token-tools').hidden = !selected;
    byId('open-code').disabled = !selected;
    if (!selected) { byId('stage-state').textContent = '没有匹配项'; return; }
    showArt(selected);
    byId('token-title').textContent = selected.label;
    byId('token-group-label').textContent = groups[selected.group];
    byId('token-ref').textContent = selected.ref;
    byId('token-value').textContent = style.getPropertyValue(selected.name).trim();
    byId('token-play').hidden = selected.kind !== 'motion';
    byId('stage-state').textContent = selected.property;
  }
  search.addEventListener('input', showTokens);
  groupInput.addEventListener('change', showTokens);
  byId('token-play').addEventListener('click', () => art.classList.toggle('at-end'));
  byId('copy-token').addEventListener('click', async () => {
    const item = selected, ok = await copyContents(byId('token-ref'));
    if (active === 'tokens' && item === selected) byId('token-copy-status').textContent = ok ? '已复制变量' : '变量已选中，可手动复制';
  });

  for (const [key, label] of Object.entries(themes)) {
    const option = node('label', 'theme-option'), input = choice('theme-preset', key), thumb = node('span', 'theme-thumb');
    thumb.dataset.mlTheme = key; thumb.setAttribute('data-ml-theme-surface', ''); thumb.setAttribute('aria-hidden', 'true');
    const panel = node('span', 'theme-mini-panel');
    panel.append(node('i'), node('i')); thumb.append(panel, node('i'));
    const legend = node('span', 'theme-legend');
    legend.append(node('strong', '', label), node('code', 'theme-key', key));
    option.append(input, thumb, legend); byId('themes-examples').append(option); themeInputs.set(key, input);
    input.addEventListener('change', () => {
      if (scope === 'page') applyTheme(key);
      else { localTheme = key; showTheme(); }
    });
  }
  for (const [key, name] of themeColors) {
    const item = node('span', 'theme-swatch'), chip = node('i', 'theme-chip');
    chip.style.backgroundColor = 'var(--ml-color-' + key + ')';
    item.append(chip, document.createTextNode(name)); byId('theme-swatches').append(item);
  }
  byId('theme-scopes').addEventListener('change', e => {
    scope = e.target.value;
    if (scope === 'local') localTheme ??= appearance.theme;
    showTheme();
  });
  function showTheme() {
    const chosen = scope === 'local' ? localTheme : appearance.theme;
    if (scope === 'local') themeSample.dataset.mlTheme = chosen;
    else themeSample.removeAttribute('data-ml-theme');
    themeInputs.get(chosen).checked = true;
    byId('stage-state').textContent = scope === 'local' ? '整页' + themes[appearance.theme] + ' · 局部' + themes[chosen] : '整页' + themes[chosen];
  }

  function show() {
    if (!active) return;
    byId('shortcut').hidden = true;
    if (active === 'typography') showType();
    if (active === 'tokens') showTokens();
    if (active === 'themes') showTheme();
  }
  function code() {
    if (active === 'typography') {
      const example = node(role[3], '', sample.textContent);
      example.dataset.mlType = role[0]; setFont(example);
      if (role[3] === 'label') example.htmlFor = 'record-name';
      return [stylesheet('typography'), stylesheet('themes'), '', '<section data-ml-theme="' + appearance.theme + '" data-ml-theme-surface data-ml-prose>',
        '  ' + example.outerHTML, ...(role[3] === 'label' ? ['  <input id="record-name">'] : []), '</section>'].join('\n');
    }
    const axes = 'data-ml-theme="' + appearance.theme + '" data-ml-material="' + appearance.material + '" data-ml-motion="' + appearance.motion + '"';
    if (active === 'themes') {
      const theme = scope === 'local' ? ' data-ml-theme="' + localTheme + '"' : '';
      return ['<!doctype html>', '<html lang="zh-CN" ' + axes + '>', '<head>', '  <meta charset="utf-8">',
        '  <meta name="viewport" content="width=device-width, initial-scale=1">', '  <title>相册摘要</title>',
        ...['themes', 'typography', 'switch'].map(name => '  ' + stylesheet(name)), '  ' + scriptTag('switch'), '</head>',
        '<body data-ml-theme-surface>', '  <section' + theme + ' data-ml-theme-surface data-ml-prose style="padding:1.5rem">',
        '    <p data-ml-type="caption">素材记录 · DEMO-101</p>', '    <h1 data-ml-type="heading">山间湖泊选集</h1>',
        '    <p><span data-ml-type="metric">128.64</span> MB</p>',
        '    <p>自动归档 <ml-switch label="自动归档"' + (themeSample.querySelector('ml-switch').checked ? ' checked' : '') + '></ml-switch></p>',
        '  </section>', '</body>', '</html>'].join('\n');
    }
    const t = selected, rule = '    ' + t.property + ': ' + t.expression + ';';
    if (t.kind === 'motion') return [stylesheet('tokens'), '', '<style>', '  .token-demo {',
      '    transition: transform var(--ml-travel) var(--ml-ease);', rule, '  }', '  .token-demo:active { transform: scale(.94); }',
      '  [data-ml-motion="low"] .token-demo { transition-property: opacity; }', '  [data-ml-motion="low"] .token-demo:active { opacity: .65; transform: none; }',
      '  @media (prefers-reduced-motion: reduce) { .token-demo { transition: none; } }', '</style>',
      '<div ' + axes + '><button class="token-demo">按住试用</button></div>'].join('\n');
    const examples = ['  .token-demo {', '    display: flex; align-items: center; padding: 1rem; border: 1px solid var(--ml-color-separator);',
      '    background-color: var(--ml-color-surface); color: var(--ml-color-text); font-family: var(--ml-font-sans);'];
    if (t.property.startsWith('outline')) examples.push('    outline: 2px solid var(--ml-color-info);');
    if (t.property === 'backdrop-filter') examples.push('    background-color: color-mix(in srgb, var(--ml-color-surface) 45%, transparent);');
    return [stylesheet('tokens'), '', '<style>', ...examples, rule, '  }', '</style>', '<div ' + axes + ' data-ml-theme-surface>',
      '  <div class="token-demo"><span>山野相册</span><span>018</span></div>', '</div>'].join('\n');
  }
  return {
    titles, show, code,
    select(next) {
      active = Object.hasOwn(titles, next) ? next : '';
      for (const element of parts) element.hidden = element.dataset.resource !== active;
      return Boolean(active);
    },
  };
};
