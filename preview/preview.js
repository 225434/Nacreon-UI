(() => {
  'use strict';

  const designBundles = new Set(['colors', 'global', 'icons', 'materials', 'motion', 'themes', 'tokens', 'typography']);
  function bundlePath(name, extension) {
    const folder = designBundles.has(name) ? 'design/' : 'components/' + name + '/';
    return './dist/' + folder + name + '.' + extension;
  }
  const stylesheet = name => '<link rel="stylesheet" href="' + bundlePath(name, 'css') + '">';
  const scriptTag = name => '<script defer src="' + bundlePath(name, 'js') + '"></script>';
  const bundleTags = name => [stylesheet(name), scriptTag(name)];

  const root = document.documentElement;
  const stage = document.querySelector('#preview-stage');
  const settings = document.querySelector('.settings');
  const picker = document.querySelector('#use-picker');
  const codeDialog = document.querySelector('#code-dialog');
  const codeSample = document.querySelector('#code-sample');
  const copyStatus = document.querySelector('#copy-status');
  const sampleColor = document.querySelector('#sample-color');
  const sampleColorStatus = document.querySelector('#color-status');
  const sampleColorPrompt = sampleColorStatus.textContent;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const forcedColors = matchMedia('(forced-colors: active)');
  const iconReplay = document.querySelector('#replay-icon-motion');
  const defaults = { theme: 'light', material: 'high', motion: 'high', 'light-source': 'pointer' };
  const materialLevels = customElements.get('ml-material').levels;
  const materialHero = document.querySelector('#material-specimen');
  const materialSurfaces = document.querySelector('#material-surfaces');
  const materialComparison = document.querySelector('#materials-examples');
  const materialHistory = document.querySelector('#material-history');
  const materialSamples = [];
  let chartTheme;
  const notes = {
    material: Object.fromEntries(materialLevels.map(level => [level.value, level.note])),
    motion: Object.fromEntries(window.MaterialMotion.levels.map(level => [level.value, level.name])),
  };
  const pages = {
    overview: { label: '概览', text: '三组风景照片已加入本月相册。' },
    specs: { label: '详情', text: '原图以 JPEG 格式保存，按拍摄顺序排列。' },
    keys: { label: '备注', text: '留一张湖面倒影作为封面。' },
  };
  const storePrefix = 'material-library.switch.';
  const appearance = {};
  const demo = { usage: 'toggle', hints: true, size: 'detail', page: 'overview' };
  const buttonDemo = { variant: 'primary', state: 'ready', count: 0, cleared: false };
  const hero = document.querySelector('#hero-button');
  const heroAction = hero.querySelector('button');
  const variants = document.querySelector('#button-variants');
  const buttonStates = document.querySelector('#button-states');
  const dialogKinds = document.querySelector('#dialog-kinds');
  const inlineDialog = document.querySelector('#dialog-inline');
  const modal = document.querySelector('#gallery-dialog');
  const reopen = document.querySelector('#dialog-reopen');
  const modalTrigger = document.querySelector('#show-modal');
  const dialogDemo = { kind: 'info', name: '未命名样本', status: '画布内预览' };
  const tagKinds = document.querySelector('#tag-kinds');
  const tagSpecimens = document.querySelector('#tag-specimens');
  const filterGroups = [...document.querySelectorAll('[data-tag-filters]')];
  const tokenGroups = [...document.querySelectorAll('[data-tag-tokens]')];
  const sources = [
    { value: 'photo', label: '摄影', asset: '湖面倒影' },
    { value: 'illustration', label: '插画', asset: '海岸手绘' },
    { value: 'film', label: '短片', asset: '沙丘短片' },
  ];
  const tokens = [
    { value: 'mountains', label: '山野', tone: 'info' },
    { value: 'night', label: '夜间' },
    { value: 'archive', label: '已归档', tone: 'success' },
  ];
  const tagDemo = { kind: 'status', filters: new Set(['photo']), removed: [] };
  const selectKinds = document.querySelector('#select-kinds');
  const inputKinds = document.querySelector('#input-kinds');
  const inputSpecimen = document.querySelector('#input-specimen');
  const inputTools = document.querySelector('#input-tools');
  const inputStates = document.querySelector('#input-states');
  const inputVerify = document.querySelector('#input-verify');
  const inputExamples = document.querySelector('#input-examples');
  const inputTemplates = document.querySelector('#input-templates');
  inputSpecimen.append(inputTemplates.content.cloneNode(true));
  let activeInput;
  const choiceKinds = document.querySelector('#choice-kinds');
  const choiceTools = document.querySelector('#choice-tools');
  const choiceLayout = document.querySelector('#choice-layout');
  const choiceStates = document.querySelector('#choice-states');
  const choiceSpecimen = document.querySelector('#choice-specimen');
  const choiceExamples = document.querySelector('#choice-examples');
  const choiceTemplates = document.querySelector('#choice-templates');
  choiceSpecimen.append(choiceTemplates.content.cloneNode(true));
  const listKinds = document.querySelector('#list-kinds');
  const listTools = document.querySelector('#list-tools');
  const listRows = document.querySelector('#list-row-kinds');
  const listDensity = document.querySelector('#list-density');
  const listSpecimen = document.querySelector('#list-specimen');
  const listExamples = document.querySelector('#list-examples');
  const listRecord = document.querySelector('#list-record');
  const listTemplate = document.querySelector('#list-template').content;
  const listSections = listTemplate.firstElementChild.cloneNode(true);
  const listItems = Array.from(listTemplate.querySelectorAll('ml-list-item'), item => item.cloneNode(true));
  listSpecimen.append(listSections, ...listItems);
  const menuKinds = document.querySelector('#menu-kinds');
  const menuEntrance = document.querySelector('#menu-entrance');
  const menuSpecimen = document.querySelector('#menu-specimen');
  const menuExamples = document.querySelector('#menu-examples');
  const menuTemplates = document.querySelector('#menu-templates').content;
  const selectStates = document.querySelector('#select-states');
  const selectSpecimen = document.querySelector('#select-specimen');
  const heroSelect = document.querySelector('#hero-select');
  const areaForm = document.querySelector('#select-area-form');
  const selectSamples = {
    plain: document.querySelector('#sort-select'),
    grouped: document.querySelector('#source-select'),
    search: document.querySelector('#area-select'),
  };
  let selectKind = 'plain';
  const hoverKinds = document.querySelector('#hover-kinds');
  const hoverSpecimen = document.querySelector('#hover-specimen');
  const hoverExamples = document.querySelector('#hover-card-examples');
  const infoKinds = document.querySelector('#info-kinds');
  const infoSpecimen = document.querySelector('#info-specimen');
  const infoExamples = document.querySelector('#info-examples');
  const infoAdvance = document.querySelector('#info-advance');
  const progressKinds = document.querySelector('#progress-kinds');
  const progressSpecimen = document.querySelector('#progress-specimen');
  const progressTools = document.querySelector('#progress-tools');
  const progressExamples = document.querySelector('#progress-examples');
  const heroProgress = progressSpecimen.querySelector('ml-progress');
  const progressAdvance = document.querySelector('#progress-advance');
  const progressPause = document.querySelector('#progress-pause');
  const feedbackKinds = document.querySelector('#feedback-kinds');
  const feedbackSpecimen = document.querySelector('#feedback-specimen');
  const feedbackTools = document.querySelector('#feedback-tools');
  const feedbackTones = document.querySelector('#feedback-tones');
  const feedbackToast = document.querySelector('#feedback-preview-toast');
  const feedbackBanner = document.querySelector('#feedback-preview-banner');
  const feedbackPopup = document.querySelector('#feedback-popup');
  const feedbackRestore = document.querySelector('#feedback-restore');
  const feedbackPlay = document.querySelector('#feedback-play');
  const feedbackExamples = document.querySelector('#feedback-examples');
  const feedbackTone = { toast: 'success', banner: 'warning' };
  const islandDirections = document.querySelector('#island-directions');
  const islandSpecimen = document.querySelector('#island-specimen');
  const heroIsland = document.querySelector('#hero-island');
  const islandTools = document.querySelector('#island-tools');
  const islandContent = document.querySelector('#island-content');
  const islandColors = document.querySelector('#island-colors');
  const islandColor = document.querySelector('#island-custom-color');
  const islandExamples = document.querySelector('#island-examples');
  let feedbackKind = 'toast';
  const feedbackSamples = {
    info: { toast: '已切换至图像预览', title: '有新的素材记录', detail: '本轮新增 2 条记录，可在记录列表中查看。' },
    success: { toast: '素材记录已保存', title: '记录已同步', detail: '本轮 2 条素材记录均已同步完成。' },
    warning: { toast: '还有 2 条记录待同步', title: '记录等待同步', detail: '2 条素材记录已保存在本地。', action: '继续同步' },
    danger: { toast: '同步失败，记录已保留', title: '记录同步失败', detail: '本地副本已保留，可以重试。', action: '重试同步' },
  };
  let infoKind = 'pill';
  const reviewStart = document.querySelector('#info-metric-template').content.querySelector('progress').value;
  let reviewedPoints = reviewStart;
  let hoverKind = 'asset';
  let recordSaved = false;
  const badgeKinds = document.querySelector('#badge-kinds');
  const badgeSpecimens = document.querySelector('#badge-specimens');
  const badgeTools = document.querySelector('#badge-tools');
  const badgeExamples = document.querySelector('#badge-examples');
  const badgeInput = document.querySelector('#badge-tag-name');
  const badgeSamples = [...document.querySelectorAll('ml-badge[data-badge-live]')];
  const lampStates = ['online', 'busy', 'warning', 'error', 'offline'];
  const phases = [['warning', '待复核'], ['info', '复核中'], ['success', '已完成'], ['neutral', '草稿']];
  const badgeDemo = { kind: 'indicator', lamp: 0, count: 12, unread: 3, dot: false, phase: 0, label: '摄影' };
  const paletteGroups = {
    hues: [
      ['blue', '系统蓝', '当前主题的蓝色色样，用于强调图标和交互。'], ['indigo', '靛蓝', '适合与浅青色区分的图表系列。'],
      ['purple', '紫色', '用于分类图标和数据系列。'], ['pink', '粉色', '用于收藏、标记和图例。'],
      ['red', '红色', '醒目的图形与分类标记。'], ['orange', '橙色', '适合需要突出显示的数据。'],
      ['yellow', '黄色', '适合做标记底色，搭配深色文字。'], ['green', '绿色', '用于图形、图例和类别标记。'],
      ['mint', '薄荷绿', '适合区分类别或并列数据。'], ['teal', '蓝绿', '适合连续曲线和分类图标。'],
      ['cyan', '青蓝', '适合与深色背景搭配的图形。'], ['brown', '棕色', '用于区域、材质等类别标记。'],
    ],
    semantic: [
      ['action', '交互', '主要按钮和交互图形的底色。'], ['on-action', '强调面文字', '主要按钮上的文字和图标。'],
      ['focus', '键盘焦点', '标记当前可操作控件的焦点环。'], ['info', '信息', '提示文字、进行中状态和说明图标。'],
      ['success', '成功', '已完成、已保存和正常结果。'], ['warning', '警告', '待复核或需要注意的状态。'],
      ['danger', '危险', '异常、错误和高风险操作说明。'], ['neutral', '中性状态', '草稿、未开始和常规状态。'],
    ],
    interface: [
      ['background', '页面背景', '整页的底色。'], ['surface', '面板', '设置区、卡片和表单的底色。'],
      ['surface-inset', '内嵌表面', '只读字段和内容分组。'], ['surface-raised', '浮层表面', '菜单、对话框和抽屉。'],
      ['control-border', '控件边界', '输入框和可选择字段的轮廓。'], ['selection', '选中底色', '表格行、列表选项和导航的当前项。'],
      ['fill', '填充', '控件底槽和分组容器。'], ['separator', '分隔线', '区分相邻内容的细线。'],
      ['text', '主要文字', '标题和正文。'], ['text-secondary', '次要文字', '说明、摘要和字段名称。'],
      ['text-tertiary', '辅助文字', '时间、单位和其他补充信息。'],
    ],
  };
  const palettePicker = document.querySelector('#palette-groups');
  const foundations = window.createFoundationPreview({
    appearance, paletteGroups, applyTheme: value => applyAppearance('theme', value, true), copyContents, stylesheet, scriptTag, lightAttributes,
  });
  const paletteSpecimen = document.querySelector('#palette-specimen');
  const paletteStrip = document.querySelector('#palette-strip');
  const paletteTools = document.querySelector('#palette-tools');
  const paletteExamples = document.querySelector('#colors-examples');
  const paletteTable = paletteExamples.querySelector('table');
  const paletteSelection = { hues: 'blue', semantic: 'success', interface: 'background' };
  let paletteGroup = 'hues';
  let paletteCopyVersion = 0;
  const valueKinds = document.querySelector('#value-kinds');
  const valueStates = document.querySelector('#value-states');
  const valueSpecimen = document.querySelector('#value-specimen');
  const valueTemplates = document.querySelector('#value-templates').content;
  const valueTypes = { slider: ['连续调节', '分档调节'], stepper: ['整数', '小数'],
    'date-picker': ['自由日期', '限定日期'], 'time-picker': ['按分钟', '15 分钟一档'], 'date-range': ['自由区间', '限定日期'] };
  const singlePickers = ['date-picker', 'time-picker'];
  const valueDemos = new Map();
  const recordTypes = ['data-table', 'pagination'];
  const navigation = window.MaterialNavigationPreview;
  const previews = window.createPreviewPages({
    motion: () => window.createMotionPreview(value => applyAppearance('motion', value, true)),
    'empty-state': window.createEmptyStatePreview, loading: window.createLoadingPreview,
    'navigation-panel': window.createCatalogPreview,
    tabs: () => window.createTabsPreview(inlineSampleIcons), breadcrumb: window.createBreadcrumbPreview,
    steps: () => window.createStepsPreview(bundleTags), tree: window.createTreePreview,
    'media-viewer': window.createMediaViewerPreview, tooltip: window.createTooltipPreview,
    accordion: () => window.createAccordionPreview(inlineSampleIcons), 'multi-select': window.createMultiSelectPreview,
    'file-upload': window.createFileUploadPreview, form: () => window.createFormPreview(bundleTags),
  });
  let currentPreview;
  const recordSource = document.querySelector('#record-table-source').content.firstElementChild;
  const recordTable = recordSource.cloneNode(true);
  document.querySelector('#data-table-specimen').append(recordTable);
  const recordPager = document.querySelector('#pagination-specimen ml-pagination');
  const recordStates = document.querySelector('#records-state');
  const emptyRecords = { 'data-table': false, pagination: false };
  const catalog = document.querySelector('#gallery-catalog');
  const directory = catalog.querySelector('ml-navigation-panel');
  const catalogEntries = new Map(directory.entries.map(({ link, title }) => [
    link.hash.slice(1), { link, title, en: link.dataset.en, lead: link.dataset.lead },
  ]));
  let chosenRoute;
  document.querySelector('#open-catalog').addEventListener('click', event => {
    directory.showModal(event.currentTarget, { focusSearch: event.detail === 0 || !matchMedia('(pointer: coarse)').matches });
  });

  function focusCatalogPage() {
    const title = document.querySelector('#component-title');
    title.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
  catalog.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (link.hash === location.hash) {
      event.preventDefault();
      focusCatalogPage();
    } else chosenRoute = link.hash;
  });
  let component = 'switch';
  let touchShortcut = matchMedia('(pointer: coarse)').matches;

  function stored(name) {
    try { return localStorage.getItem(storePrefix + name); }
    catch { return null; }
  }

  function applyAppearance(name, value, save = false) {
    const inputs = [...settings.querySelectorAll('input[name="' + name + '"]')];
    const input = inputs.find(item => item.value === value) ?? inputs.find(item => item.value === defaults[name]);
    input.checked = true;
    appearance[name] = input.value;
    root.setAttribute('data-ml-' + name, input.value);
    if (save) {
      try { localStorage.setItem(storePrefix + name, input.value); }
      catch { /* Preferences still apply to this preview when storage is unavailable. */ }
    }
    if (name === 'material') syncDensityField();
    if (name !== 'theme') updateMotionNote();
    refreshFacts(document);
    if (component === 'hover-card' && location.hash === '#hover-card') showHover();
    if (component === 'tooltip' && location.hash === '#tooltip' && save) currentPreview.reveal();
    if (component === 'icons' && name !== 'motion') showIcons();
    if (component === 'materials') showMaterials();
    if (component === 'motion' && name === 'theme') currentPreview.show();
    if (name === 'theme' && Object.hasOwn(foundations.titles, component)) foundations.show();
    if (name === 'theme') {
      sampleColor.textContent = paletteHex(getComputedStyle(sampleColor.isConnected ? sampleColor : root), 'blue');
      sampleColorStatus.textContent = sampleColorPrompt;
      if (component === 'colors') showColors();
    }
  }

  function updateMaterialNote() {
    const name = component === 'icons' && !document.querySelector('#icon-selected').hidden
      && document.querySelector('#icon-enlarged').getAttribute('name');
    const note = document.querySelector('#material-note');
    if (name && forcedColors.matches) note.textContent = '系统对比色 · 线稿';
    else if (name && appearance.material === 'high') note.textContent = customElements.get('ml-icon').materialLabel(name);
    else note.textContent = notes.material[appearance.material] ?? '';
  }
  function pointerLightEnabled() {
    return appearance['light-source'] === 'pointer' && appearance['light-intensity'] > 0 && !reduceMotion.matches && !forcedColors.matches;
  }

  function updateMotionNote() {
    updateMaterialNote();
    const mode = appearance['light-source'] || defaults['light-source'];
    document.querySelector('#light-intensity-field').hidden = mode === 'none';
    document.querySelector('#light-note').textContent = forcedColors.matches ? '系统对比色'
      : mode === 'none' || appearance['light-intensity'] === 0 ? '已关闭'
      : mode === 'pointer' && reduceMotion.matches ? '减少动态 · 固定照明' : '';
    const high = { switch: '液面回弹', button: '弹性按压', dialog: '弹性浮入', select: '弹性展开', input: '聚焦回弹',
      choice: '选中回弹', list: '展开回弹', slider: '按住抬起，快拖拉伸', stepper: '按压回弹', 'data-table': '排序回弹',
      tabs: '指示条回弹', drawer: '抽屉滑入', loading: '连续动画', form: '提示弹性浮入', icons: '图标交互动效' };
    const medium = { switch: '平滑滑动', button: '平滑按压', input: '平滑聚焦', select: '平滑展开', slider: '轻轻抬起，平滑复位',
      loading: '平滑循环', form: '提示平滑浮入', tabs: '指示条平滑滑动' };
    const grade = appearance.motion;
    const note = forcedColors.matches ? '系统对比色' : reduceMotion.matches ? '系统已减少动态'
      : grade === 'high' ? high[component] || notes.motion.high : grade === 'medium' ? medium[component] || notes.motion.medium : notes.motion[grade];
    document.querySelector('#motion-note').textContent = note || '';
    if (Object.hasOwn(foundations.titles, component)) foundations.show();
    if (component === 'motion') currentPreview.show();
    if (component === 'icons') updateIconReplay();
    if (component === 'materials') {
      for (const level of materialLevels) {
        const caption = materialComparison.querySelector('[data-ml-material="' + level.value + '"] > span:last-child');
        if (caption) caption.textContent = pointerLightEnabled() ? level.litDescription : level.description;
      }
    }
  }

  // The glass tint is a continuous knob for the high tier, between clear and heavy.
  const densityField = document.querySelector('#glass-density-field');
  const densityInput = document.querySelector('#glass-density');
  const densityNote = document.querySelector('#density-note');
  function applyDensity(value, save = false) {
    const number = Math.max(.4, Math.min(2, Number(value) || 1));
    densityInput.value = String(number);
    densityInput.closest('ml-slider').refresh();
    root.style.setProperty('--ml-glass-density', String(number));
    densityNote.textContent = number < .85 ? '清透' : number > 1.25 ? '浓重' : '适中';
    if (save) {
      try { localStorage.setItem(storePrefix + 'density', String(number)); }
      catch { /* Preferences still apply to this preview when storage is unavailable. */ }
    }
  }
  function syncDensityField() {
    densityField.hidden = appearance.material !== 'high';
    document.getElementById('transparency-field').hidden = !['medium', 'high'].includes(appearance.material);
  }
  const opticalRanges = {
    'material-transparency': { initial: 60, css: n => n + '%' },
    'light-intensity': { initial: 100, css: n => String(n / 100) },
  };
  function applyOpticalRange(name, value, save = false) {
    const range = opticalRanges[name], input = document.getElementById(name);
    const raw = value == null || value === '' ? range.initial : Number(value);
    const number = Number.isFinite(raw) ? Math.max(0, Math.min(100, Math.round(raw))) : range.initial;
    input.value = String(number);
    input.closest('ml-slider').refresh();
    appearance[name] = number;
    root.style.setProperty('--ml-' + name, range.css(number));
    if (name === 'light-intensity') updateMotionNote();
    if (save) {
      try { localStorage.setItem(storePrefix + name, String(number)); }
      catch { /* The setting remains active for this page. */ }
    }
  }
  for (const name of Object.keys(opticalRanges)) {
    applyOpticalRange(name, stored(name));
    document.getElementById(name).addEventListener('input', event => applyOpticalRange(name, event.target.value, true));
  }
  applyDensity(stored('density'));
  densityInput.addEventListener('input', () => applyDensity(densityInput.value, true));

  for (const name of Object.keys(defaults)) applyAppearance(name, stored(name));
  settings.addEventListener('change', event => {
    if (event.target.matches('input[type="radio"]')) applyAppearance(event.target.name, event.target.value, true);
  });
  function resetAppearance() {
    for (const [name, value] of Object.entries(defaults)) applyAppearance(name, value, true);
    for (const name of Object.keys(opticalRanges)) applyOpticalRange(name, null, true);
    applyDensity(1, true);
  }
  document.querySelector('#reset-appearance').addEventListener('click', resetAppearance);
  reduceMotion.addEventListener('change', updateMotionNote);
  forcedColors.addEventListener('change', updateMotionNote);
  window.addEventListener('storage', event => {
    for (const name of Object.keys(defaults)) {
      if (event.key === null || event.key === storePrefix + name) applyAppearance(name, stored(name));
    }
    if (event.key === null || event.key === storePrefix + 'density') applyDensity(stored('density'));
    for (const name of Object.keys(opticalRanges)) {
      if (event.key === null || event.key === storePrefix + name) applyOpticalRange(name, stored(name));
    }
  });

  function setComponent(next) {
    if (component === 'input' && next !== component && activeInput) activeInput.hidden = true;
    if (component === 'feedback' && next !== component) {
      feedbackToast.clear();
      feedbackPopup.clear();
    }
    if ((component === 'hover-card' || component === 'info') && next !== component) {
      for (const card of document.querySelectorAll('ml-hover-card')) card.hide();
    }
    if (next !== 'dialog' && modal.open) modal.close('cancel');
    if (next !== component) {
      if (stageDialog.open) closeStage('navigate');
      for (const picker of document.querySelectorAll(':is(ml-date-range, ml-date-picker, ml-time-picker):has(> dialog[open])')) picker.closePicker(false);
      for (const field of document.querySelectorAll('ml-select[data-ml-select-open]')) field.close();
      for (const panel of document.querySelectorAll('ml-menu-panel[data-ml-menu-shown]')) panel.parentElement.close();
    }
    component = next;
    currentPreview = previews.select(next);
    const buttons = next === 'button';
    const dialogs = next === 'dialog';
    root.dataset.component = next;
    document.querySelector('#shortcut').removeAttribute('title');
    document.querySelector('#shortcut kbd').hidden = false;
    const { link, title, en, lead } = catalogEntries.get(next);
    document.title = title + ' · Nacreon UI';
    document.querySelector('#component-title').textContent = title;
    document.querySelector('#component-en').textContent = en;
    document.querySelector('#component-lead').textContent = lead;
    directory.querySelector('[aria-current="page"]')?.removeAttribute('aria-current');
    link.setAttribute('aria-current', 'page');
    document.querySelector('#catalog-current').textContent = title;
    picker.hidden = next !== 'switch';
    variants.hidden = !buttons;
    hero.hidden = !buttons;
    buttonStates.hidden = !buttons;
    dialogKinds.hidden = !dialogs;
    inlineDialog.hidden = !dialogs;
    reopen.hidden = true;
    modalTrigger.hidden = !dialogs;
    tagKinds.hidden = next !== 'tag';
    tagSpecimens.hidden = next !== 'tag';
    selectKinds.hidden = selectStates.hidden = selectSpecimen.hidden = next !== 'select';
    inputKinds.hidden = inputSpecimen.hidden = inputTools.hidden = inputExamples.hidden = next !== 'input';
    const valuePage = Object.hasOwn(valueTypes, next);
    const recordPage = recordTypes.includes(next);
    navigation.select(next);
    recordStates.hidden = !recordPage;
    for (const type of recordTypes) {
      for (const suffix of ['-kinds', '-specimen', '-examples']) document.getElementById(type + suffix).hidden = type !== next;
    }
    valueKinds.hidden = valueSpecimen.hidden = valueStates.hidden = !valuePage;
    for (const type of Object.keys(valueTypes)) document.getElementById(type + '-examples').hidden = type !== next;
    choiceKinds.hidden = choiceTools.hidden = choiceSpecimen.hidden = choiceExamples.hidden = next !== 'choice';
    listKinds.hidden = listTools.hidden = listSpecimen.hidden = listExamples.hidden = next !== 'list';
    menuKinds.hidden = menuEntrance.hidden = menuSpecimen.hidden = menuExamples.hidden = next !== 'menu';
    hoverKinds.hidden = hoverSpecimen.hidden = hoverExamples.hidden = next !== 'hover-card';
    infoKinds.hidden = infoSpecimen.hidden = infoExamples.hidden = next !== 'info';
    infoAdvance.hidden = true;
    progressKinds.hidden = progressSpecimen.hidden = progressTools.hidden = progressExamples.hidden = next !== 'progress';
    feedbackKinds.hidden = feedbackSpecimen.hidden = feedbackTools.hidden = feedbackExamples.hidden = next !== 'feedback';
    islandDirections.hidden = islandSpecimen.hidden = islandTools.hidden = islandExamples.hidden = next !== 'island';
    badgeKinds.hidden = badgeSpecimens.hidden = badgeTools.hidden = badgeExamples.hidden = next !== 'badge';
    const colors = next === 'colors';
    palettePicker.hidden = paletteSpecimen.hidden = paletteTools.hidden = paletteExamples.hidden = !colors;
    const materials = next === 'materials';
    materialSurfaces.hidden = materialHero.hidden = materialComparison.hidden = materialHistory.hidden = !materials;
    if (!materials) materialHistory.open = false;
    const motion = next === 'motion';
    const foundationPage = foundations.select(next);
    const icons = next === 'icons';
    for (const id of ['icon-options', 'icon-specimen', 'icon-tools', 'icons-examples']) document.getElementById(id).hidden = !icons;
    document.querySelector('#open-code').disabled = false;
    stage.querySelector('[data-tag-undo]').hidden = true;
    document.querySelector('#stage-caption').hidden = next === 'navigation-panel' || foundationPage || navigation.types.includes(next) || recordPage || valuePage || dialogs || next === 'select' || next === 'multi-select' || next === 'file-upload' || next === 'form' || next === 'input' || next === 'choice' || next === 'list' || next === 'accordion' || next === 'tabs' || next === 'breadcrumb' || next === 'steps' || next === 'tree' || next === 'media-viewer' || next === 'tooltip' || next === 'empty-state' || next === 'menu' || next === 'hover-card' || next === 'badge' || next === 'info' || next === 'progress' || next === 'loading' || next === 'feedback' || next === 'island' || colors || icons || materials || motion;
    document.querySelector('#switch-examples').hidden = next !== 'switch';
    document.querySelector('#button-examples').hidden = !buttons;
    document.querySelector('#dialog-examples').hidden = !dialogs;
    document.querySelector('#tag-examples').hidden = next !== 'tag';
    document.querySelector('#select-examples').hidden = next !== 'select';
    const examplesLink = document.querySelector('.examples-link');
    examplesLink.hidden = document.querySelector('#examples').hidden = next === 'navigation-panel' || next === 'breadcrumb' || next === 'tree';
    examplesLink.href = next === 'switch' ? '#examples' : '#' + next + '-examples';
    const examplesLabel = foundationPage ? foundations.titles[next] : colors ? '主题对照' : icons ? '图标目录' : materials ? '四档材质对照' : motion ? '四档动效对照' : next === 'media-viewer' ? '示例素材' : '应用示例';
    examplesLink.querySelector('.top-action-label').textContent = examplesLabel;
    examplesLink.title = examplesLabel;
    document.querySelector('#examples-title').textContent = examplesLabel;
    updateMotionNote();
  }

  function buttonLabel() {
    if (buttonDemo.state === 'busy') return '处理中';
    return buttonDemo.variant === 'danger' ? '清零计数' : '记录一次';
  }

  function showButton() {
    const { variant, state, count, cleared } = buttonDemo;
    hero.setAttribute('variant', variant);
    heroAction.disabled = state !== 'ready';
    if (state === 'busy') heroAction.setAttribute('aria-busy', 'true');
    else heroAction.removeAttribute('aria-busy');
    heroAction.querySelector('use').setAttribute('href', variant === 'danger' ? '#i-trash' : '#i-plus');
    heroAction.querySelector('span').textContent = buttonLabel();
    document.querySelector('#stage-caption').textContent = {
      ready: '聚焦后可按 Enter 或空格键', busy: '操作进行中', disabled: '按钮已停用',
    }[state];
    document.querySelector('#stage-state').textContent = cleared ? '计数已清零' : '已记录 ' + count + ' 次';
    document.querySelector('#state-dot').className = 'state-dot';
    document.querySelector('#shortcut').hidden = true;
  }

  variants.addEventListener('change', event => {
    buttonDemo.variant = event.target.value;
    buttonDemo.cleared = false;
    showButton();
  });
  buttonStates.addEventListener('change', event => {
    buttonDemo.state = event.target.value;
    showButton();
  });
  heroAction.addEventListener('click', () => {
    buttonDemo.cleared = buttonDemo.variant === 'danger';
    buttonDemo.count = buttonDemo.cleared ? 0 : buttonDemo.count + 1;
    showButton();
  });

  function refreshFacts(scope) {
    const levels = { base: '基础', low: '低', medium: '中', high: '高' };
    const facts = { theme: { light: '浅色', warm: '暖色', dark: '深色' }[appearance.theme],
      material: notes.material[appearance.material], motion: levels[appearance.motion] };
    for (const cell of scope.querySelectorAll('[data-fact]')) {
      const value = facts[cell.dataset.fact];
      if (value && cell.textContent !== value) cell.textContent = value;
    }
  }

  function makeDialog(kind, prefix, inline = false) {
    const dialog = document.querySelector('#template-dialog-' + kind).content.firstElementChild.cloneNode(true);
    const title = dialog.querySelector('.ml-dialog-title');
    title.id = prefix + '-title';
    dialog.setAttribute('aria-labelledby', title.id);
    const message = dialog.querySelector('.ml-dialog-body > p');
    if (message) {
      message.id = prefix + '-message';
      dialog.setAttribute('aria-describedby', message.id);
    }
    const input = dialog.querySelector('input');
    if (input) input.defaultValue = dialogDemo.name;
    refreshFacts(dialog);
    if (inline) {
      dialog.querySelector('[autofocus]')?.removeAttribute('autofocus');
      dialog.open = true;
    }
    return dialog;
  }

  function mountDialog(host, kind) {
    const inline = host === inlineDialog;
    const dialog = makeDialog(kind, host.id, inline);
    host.dataset.kind = kind;
    host.toggleAttribute('dismiss-on-backdrop', kind === 'info');
    host.replaceChildren(dialog);
    dialog.addEventListener('close', () => {
      const value = dialog.returnValue;
      if (value === 'restore') {
        resetAppearance();
        dialogDemo.status = '已恢复默认外观';
      } else if (value === 'save') {
        dialogDemo.name = dialog.querySelector('input').value.trim();
        document.querySelector('#dialog-name-status').textContent = '当前样本名为「' + dialogDemo.name + '」。';
        const field = inlineDialog.querySelector('input');
        if (field) field.value = dialogDemo.name;
        dialogDemo.status = '名称已保存';
      } else {
        dialogDemo.status = value === 'ok' ? '已查看外观' : '已取消';
      }
      if (component === 'dialog') {
        showDialog();
        if (inline && !inlineDialog.open && !modal.open) reopen.querySelector('button').focus({ preventScroll: true });
      }
    }, { once: true });
    return dialog;
  }

  function showDialog() {
    if (inlineDialog.dataset.kind !== dialogDemo.kind) mountDialog(inlineDialog, dialogDemo.kind);
    inlineDialog.hidden = !inlineDialog.open;
    reopen.hidden = inlineDialog.open;
    document.querySelector('#stage-state').textContent = dialogDemo.status;
    document.querySelector('#state-dot').className = 'state-dot';
    document.querySelector('#shortcut').hidden = true;
  }

  function selectDialog(kind) {
    dialogDemo.kind = kind;
    dialogDemo.status = '画布内预览';
    dialogKinds.querySelector('input[value="' + kind + '"]').checked = true;
    showDialog();
  }

  function openDialog(kind, trigger) {
    if (modal.open) return;
    const dialog = mountDialog(modal, kind);
    const draft = inlineDialog.querySelector('input');
    if (trigger === modalTrigger && draft && inlineDialog.open && kind === 'form') dialog.querySelector('input').value = draft.value;
    modal.showModal(trigger);
  }
  dialogKinds.addEventListener('change', event => selectDialog(event.target.value));
  modalTrigger.addEventListener('click', () => openDialog(dialogDemo.kind, modalTrigger));
  reopen.addEventListener('click', () => {
    const dialog = mountDialog(inlineDialog, dialogDemo.kind);
    dialogDemo.status = '画布内预览';
    showDialog();
    (dialog.querySelector('input, button') ?? dialog).focus({ preventScroll: true });
  });
  document.querySelector('#dialog-examples').addEventListener('click', event => {
    const trigger = event.target.closest('button[data-open-dialog]');
    if (!trigger) return;
    selectDialog(trigger.dataset.openDialog);
    openDialog(dialogDemo.kind, trigger);
  });

  function makeTag(kind, item) {
    const tag = document.createElement('ml-tag');
    if (kind !== 'status') tag.setAttribute('kind', kind);
    tag.label = item.label;
    if (item.value) tag.value = item.value;
    if (item.tone) tag.setAttribute('tone', item.tone);
    if (kind === 'filter') tag.selected = tagDemo.filters.has(item.value);
    return tag;
  }

  for (const group of filterGroups) group.append(...sources.map(item => makeTag('filter', item)));
  const tokenSets = tokenGroups.map(group => {
    const tags = tokens.map(item => makeTag('removable', item));
    group.append(...tags);
    return tags;
  });
  const results = document.querySelector('#tag-results');
  for (const item of sources) {
    const li = document.createElement('li');
    li.dataset.type = item.value;
    li.textContent = item.asset;
    results.append(li);
  }

  function matchedAssets() {
    return sources.filter(item => !tagDemo.filters.size || tagDemo.filters.has(item.value));
  }

  function showTags() {
    const kind = tagDemo.kind;
    tagKinds.querySelector('input[value="' + kind + '"]').checked = true;
    for (const group of tagSpecimens.children) group.hidden = group.dataset.tagView !== kind;
    const matches = matchedAssets();
    for (const li of results.children) li.hidden = tagDemo.filters.size > 0 && !tagDemo.filters.has(li.dataset.type);
    const count = tokens.length - tagDemo.removed.length;
    const caption = document.querySelector('#stage-caption');
    caption.hidden = kind === 'status' || (kind === 'removable' && count > 0);
    caption.textContent = kind === 'filter' ? matches.map(item => item.asset).join(' · ') : '当前没有标签';
    document.querySelector('#stage-state').textContent = {
      status: '5 种记录状态', filter: '显示 ' + matches.length + ' / ' + sources.length + ' 份素材', removable: '保留 ' + count + ' 个标签',
    }[kind];
    document.querySelector('#state-dot').className = 'state-dot';
    const shortcut = document.querySelector('#shortcut');
    shortcut.hidden = kind === 'status' || (kind === 'removable' && count === 0);
    shortcut.querySelector('kbd').textContent = kind === 'filter' ? 'Space' : 'Delete';
    shortcut.querySelector('span').textContent = kind === 'filter' ? '选择或取消' : '移除标签';
    for (const undo of document.querySelectorAll('[data-tag-undo]')) {
      undo.hidden = !tagDemo.removed.length || (stage.contains(undo) && kind !== 'removable');
    }
  }

  tagKinds.addEventListener('change', event => { tagDemo.kind = event.target.value; showTags(); });
  for (const group of filterGroups) group.addEventListener('ml-change', event => {
    const { value, selected } = event.detail;
    if (selected) tagDemo.filters.add(value); else tagDemo.filters.delete(value);
    for (const instance of filterGroups) {
      const peer = [...instance.children].find(tag => tag.value === value);
      peer.selected = selected;
    }
    tagDemo.kind = 'filter';
    showTags();
  });
  for (const [i, group] of tokenGroups.entries()) group.addEventListener('ml-remove', event => {
    const tag = event.target;
    const index = tokenSets[i].indexOf(tag);
    // Wait for the component's cancelable removal and its native focus handoff.
    queueMicrotask(() => {
      if (index < 0 || event.defaultPrevented || group.contains(tag) || tagDemo.removed.includes(index)) return;
      tagDemo.removed.push(index);
      for (const set of tokenSets) set[index].remove();
      tagDemo.kind = 'removable';
      showTags();
      if (document.activeElement === group) {
        group.closest('.stage, .example-card').querySelector('[data-tag-undo]').focus({ preventScroll: true });
      }
    });
  });
  for (const undo of document.querySelectorAll('[data-tag-undo]')) undo.addEventListener('click', () => {
    const index = tagDemo.removed.pop();
    if (index === undefined) return;
    for (const [i, group] of tokenGroups.entries()) {
      const set = tokenSets[i];
      const next = set.slice(index + 1).find(tag => tag.parentElement === group);
      group.insertBefore(set[index], next ?? null);
    }
    tagDemo.kind = 'removable';
    showTags();
    const group = undo.closest('.stage, .example-card').querySelector('[data-tag-tokens]');
    tokenSets[tokenGroups.indexOf(group)][index].querySelector('button').focus({ preventScroll: true });
  });

  function showSelect() {
    const sample = selectSamples[selectKind];
    const host = heroSelect.parentElement;
    if (selectSpecimen.dataset.kind !== selectKind) {
      host.close();
      selectSpecimen.dataset.kind = selectKind;
      selectSpecimen.querySelector('label').textContent = sample.labels[0].textContent;
      heroSelect.replaceChildren(...Array.from(sample.children, option => option.cloneNode(true)));
      heroSelect.required = sample.required;
      host.toggleAttribute('searchable', sample.parentElement.hasAttribute('searchable'));
      if (host.hasAttribute('searchable')) host.setAttribute('search-label', sample.parentElement.getAttribute('search-label'));
      else host.removeAttribute('search-label');
    }
    selectKinds.querySelector('input[value="' + selectKind + '"]').checked = true;
    heroSelect.disabled = selectStates.querySelector('input:checked').value === 'disabled';
    heroSelect.selectedIndex = sample.selectedIndex;
    document.querySelector('#stage-state').textContent = heroSelect.disabled ? '已禁用'
      : sample.value ? '已选 · ' + sample.selectedOptions[0].label : '等待选择';
    document.querySelector('#state-dot').className = heroSelect.disabled ? 'state-dot off' : 'state-dot';
    const shortcut = document.querySelector('#shortcut');
    shortcut.hidden = heroSelect.disabled;
    shortcut.querySelector('kbd').textContent = '↓';
    shortcut.querySelector('span').textContent = '展开选项';
  }

  const records = [{ name: 'A 区', updated: 2 }, { name: 'B 区', updated: 1 }, { name: 'C 区', updated: 3 }];
  function updateSelectResult(kind) {
    const sample = selectSamples[kind];
    if (kind === 'plain') {
      const ordered = [...records].sort((a, b) => sample.value === 'name' ? a.name.localeCompare(b.name)
        : sample.value === 'recent' ? b.updated - a.updated : a.updated - b.updated);
      document.querySelector('#sort-result').textContent = ordered.map(record => record.name).join(' → ');
    } else if (kind === 'grouped') {
      document.querySelector('#source-result').textContent = sample.selectedOptions[0].dataset.format;
    }
  }
  selectKinds.addEventListener('change', event => { selectKind = event.target.value; showSelect(); });
  selectStates.addEventListener('change', showSelect);
  for (const [kind, sample] of Object.entries(selectSamples)) {
    updateSelectResult(kind);
    sample.addEventListener('change', () => {
      selectKind = kind;
      updateSelectResult(kind);
      showSelect();
    });
  }
  heroSelect.addEventListener('change', () => {
    selectSamples[selectKind].selectedIndex = heroSelect.selectedIndex;
    updateSelectResult(selectKind);
    showSelect();
  });
  areaForm.addEventListener('submit', event => {
    event.preventDefault();
    document.querySelector('#area-result').textContent = '已应用 · ' + new FormData(areaForm).get('area');
  });
  areaForm.addEventListener('reset', () => queueMicrotask(() => {
    document.querySelector('#area-result').textContent = '尚未应用';
    if (component === 'select') showSelect();
  }));

  function makeHover(kind) {
    const card = document.querySelector('#hover-' + kind).content.firstElementChild.cloneNode(true);
    card.querySelector('.ml-hover-action')?.setAttribute('aria-pressed', String(recordSaved));
    return card;
  }

  function makeInfo(kind) {
    return document.getElementById('info-' + kind + '-template').content.firstElementChild.cloneNode(true);
  }

  function updateAdvanceButton(control, button) {
    const bar = control.progress;
    button.disabled = control.getAttribute('state') === 'paused';
    button.textContent = control.getAttribute('state') === 'error' ? '重试上传'
      : bar.position < 0 ? '取得总量' : bar.position === 1 ? '重新开始' : button.dataset.advance;
  }

  function advanceProgress(control, button) {
    const bar = control.progress;
    if (control.getAttribute('state') === 'error') {
      control.removeAttribute('state');
    } else if (bar.position < 0) {
      bar.max = Number(button.dataset.total);
      bar.value = 0;
    } else {
      bar.value = bar.position === 1 ? 0 : Math.min(bar.max, bar.value + Number(button.dataset.step ?? 1));
    }
  }

  function showProgress() {
    const bar = heroProgress.progress;
    const waiting = bar.position < 0;
    const paused = heroProgress.getAttribute('state') === 'paused';
    const kind = waiting ? 'indeterminate' : 'determinate';
    progressKinds.querySelector('input[value="' + kind + '"]').checked = true;
    updateAdvanceButton(heroProgress, progressAdvance);
    progressPause.textContent = paused ? '继续' : '暂停';
    progressPause.disabled = bar.position === 1;
    document.querySelector('#stage-state').textContent = waiting
      ? (paused ? '已暂停统计图像数' : '正在统计图像数') : '已归档 ' + bar.value + ' / ' + bar.max + ' 张';
    document.querySelector('#state-dot').className = paused ? 'state-dot off' : 'state-dot';
    document.querySelector('#shortcut').hidden = true;
  }

  progressKinds.addEventListener('change', event => {
    const bar = heroProgress.progress;
    heroProgress.removeAttribute('state');
    if (event.target.value === 'indeterminate') {
      bar.removeAttribute('value');
      bar.removeAttribute('max');
    } else {
      bar.max = Number(progressAdvance.dataset.total);
      bar.value = 0;
    }
    showProgress();
  });
  progressAdvance.addEventListener('click', () => { advanceProgress(heroProgress, progressAdvance); showProgress(); });
  progressPause.addEventListener('click', () => {
    if (heroProgress.getAttribute('state') === 'paused') heroProgress.removeAttribute('state');
    else heroProgress.setAttribute('state', 'paused');
    showProgress();
  });
  progressExamples.addEventListener('click', event => {
    const button = event.target.closest('button[data-advance]');
    if (!button) return;
    const control = button.closest('article').querySelector('ml-progress');
    advanceProgress(control, button);
    updateAdvanceButton(control, button);
  });

  function inputReadout(message) {
    if (component !== 'input' || !activeInput) return;
    const field = activeInput.control;
    const text = message || (field.disabled ? '已禁用' : field.readOnly ? '只读，可选择并复制' :
      field.getAttribute('aria-invalid') === 'true' ? '请检查输入' : '可直接输入');
    const readout = document.querySelector('#stage-state');
    if (readout.textContent !== text) readout.textContent = text;
    document.querySelector('#state-dot').className = field.disabled ? 'state-dot off' : 'state-dot';
  }
  function showInput() {
    const kind = inputKinds.querySelector(':checked').value;
    for (const host of inputSpecimen.querySelectorAll('ml-input')) {
      host.hidden = host.dataset.inputDemo !== kind;
      if (!host.hidden) activeInput = host;
    }
    const state = inputStates.querySelector(':checked').value;
    activeInput.control.readOnly = state === 'readonly';
    activeInput.control.disabled = state === 'disabled';
    activeInput.refresh();
    inputVerify.hidden = state !== 'editable' || !activeInput.control.required;
    document.querySelector('#shortcut').hidden = true;
    inputReadout();
  }
  inputKinds.addEventListener('change', showInput);
  inputStates.addEventListener('change', showInput);
  inputVerify.querySelector('button').addEventListener('click', () => {
    const valid = activeInput.validate();
    if (!valid) activeInput.control.focus();
    inputReadout(valid ? '输入符合要求' : '请检查输入');
  });
  inputSpecimen.addEventListener('input', () => inputReadout());
  inputSpecimen.addEventListener('focusout', () => inputReadout());

  const codeForm = document.querySelector('#input-code-form');
  const codeResult = document.querySelector('#input-code-result');
  codeForm.addEventListener('submit', event => {
    event.preventDefault();
    const host = codeForm.querySelector('ml-input');
    if (host.validate()) codeResult.value = host.value + ' 格式正确';
    else { codeResult.value = ''; host.control.focus(); }
  });
  codeForm.addEventListener('input', () => { codeResult.value = ''; });

  const recordSearch = document.querySelector('#input-record-search');
  const recordList = document.querySelector('#input-search-list');
  const searchResult = document.querySelector('#input-search-result');
  function filterInputRecords() {
    const query = recordSearch.value.trim().toLowerCase();
    let count = 0;
    for (const row of recordList.children) {
      row.hidden = !row.textContent.toLowerCase().includes(query);
      if (!row.hidden) count++;
    }
    recordList.hidden = count === 0;
    searchResult.classList.toggle('sr-only', count > 0);
    searchResult.textContent = count ? '找到 ' + count + ' 条记录' : '没有匹配的记录';
  }
  recordSearch.addEventListener('input', event => { if (!event.isComposing) filterInputRecords(); });
  recordSearch.addEventListener('compositionend', filterInputRecords);

  // The same three examples run in the gallery and in the portable HTML sample.
  function bindRecordMenu(sample) {
    const row = sample.querySelector('[data-record-row]');
    const removed = sample.querySelector('[data-record-removed]');
    const details = sample.querySelector('[data-record-details]');
    const pin = sample.querySelector('[data-action="pin"]');
    const undo = sample.querySelector('.sample-undo');
    function render() {
      row.hidden = !removed.hidden;
      sample.querySelector('[data-record-pin]').hidden = pin.getAttribute('aria-checked') !== 'true';
      sample.querySelector('[data-action="details"] span').textContent = details.hidden ? '查看详情' : '收起详情';
    }
    sample.addEventListener('ml-menu-action', event => {
      const action = event.detail.action;
      if (action === 'details') details.hidden = !details.hidden;
      if (action === 'remove') { details.hidden = true; removed.hidden = false; }
      render();
      if (action === 'remove') undo.focus();
    });
    undo.addEventListener('click', () => {
      removed.hidden = true;
      render();
      sample.querySelector('ml-menu > button').focus();
    });
    render();
  }

  function bindViewMenu(sample) {
    const fields = [...sample.querySelectorAll('[data-field]')];
    function render() {
      for (const field of fields) {
        const item = sample.querySelector('[data-action="' + field.dataset.field + '"]');
        field.hidden = item.getAttribute('aria-checked') !== 'true';
      }
      sample.querySelector('dl').hidden = fields.every(field => field.hidden);
    }
    sample.addEventListener('ml-menu-action', render);
    render();
  }

  function bindSortMenu(sample) {
    const list = sample.querySelector('ol');
    function render() {
      const option = sample.querySelector('[role="menuitemradio"][aria-checked="true"]');
      const order = option.dataset.action === 'oldest' ? 1 : -1;
      const rows = [...list.children].sort((a, b) => order *
        a.querySelector('time').dateTime.localeCompare(b.querySelector('time').dateTime));
      list.append(...rows);
      sample.querySelector('[data-sort-label]').textContent = option.textContent;
    }
    sample.addEventListener('ml-menu-action', render);
    render();
  }

  const menuBindings = { record: bindRecordMenu, view: bindViewMenu, sort: bindSortMenu };
  for (const source of menuTemplates.children) {
    const kind = source.dataset.menuDemo;
    const exampleSlot = menuExamples.querySelector('[data-menu-example="' + kind + '"]');
    for (const slot of [menuSpecimen, exampleSlot]) {
      const sample = source.cloneNode(true);
      if (slot === exampleSlot && kind === 'record') sample.querySelector('ml-menu').setAttribute('icon-only', '');
      menuBindings[kind](sample);
      slot.append(sample);
    }
  }

  function activeMenuSample() {
    return menuSpecimen.querySelector('[data-menu-demo="' + menuKinds.querySelector(':checked').value + '"]');
  }
  function menuReadout() {
    if (component !== 'menu') return;
    const sample = activeMenuSample();
    let message;
    if (sample.dataset.menuDemo === 'record') {
      message = !sample.querySelector('[data-record-removed]').hidden ? '记录已移除'
        : !sample.querySelector('[data-record-details]').hidden ? '正在查看详情'
        : !sample.querySelector('[data-record-pin]').hidden ? '记录已置顶' : '记录 DEMO-101';
    } else if (sample.dataset.menuDemo === 'view') {
      message = '已显示 ' + sample.querySelectorAll('[data-field]:not([hidden])').length + ' / 2 个字段';
    } else message = '3 条记录 · ' + sample.querySelector('[data-sort-label]').textContent;
    const status = document.querySelector('#stage-state');
    if (status.textContent !== message) status.textContent = message;
    document.querySelector('#state-dot').className = 'state-dot';
    const shortcut = document.querySelector('#shortcut');
    shortcut.hidden = !!sample.querySelector('[data-record-removed]:not([hidden])');
    shortcut.querySelector('kbd').textContent = '↓';
    shortcut.querySelector('span').textContent = '打开菜单';
  }
  function showMenu() {
    const active = activeMenuSample();
    for (const sample of menuSpecimen.children) {
      if (sample !== active) sample.querySelector('ml-menu').close();
      sample.hidden = sample !== active;
    }
    active.querySelector('ml-menu').toggleAttribute('icon-only', menuEntrance.querySelector(':checked').value === 'icon');
    menuReadout();
  }
  menuKinds.addEventListener('change', showMenu);
  menuEntrance.addEventListener('change', showMenu);
  menuSpecimen.addEventListener('ml-menu-action', menuReadout);
  menuSpecimen.addEventListener('click', event => { if (event.target.closest('.sample-undo')) menuReadout(); });

  function activeList() {
    return listKinds.querySelector(':checked').value === 'group' ? listSections
      : listItems.find(item => item.dataset.listRow === listRows.querySelector(':checked').value);
  }

  function listReadout() {
    if (component !== 'list') return;
    const active = activeList();
    const grouped = active === listSections;
    const detail = active.querySelector('details');
    const message = grouped ? active.children.length + ' 组 · ' + active.querySelectorAll('ml-list-item').length + ' 项'
      : detail ? (detail.open ? '详情已展开' : '详情已收起') : active.dataset.listRow === 'link' ? '记录链接' : '信息行';
    const status = document.querySelector('#stage-state');
    if (status.textContent !== message) status.textContent = message;
    document.querySelector('#state-dot').className = 'state-dot';
    const shortcut = document.querySelector('#shortcut');
    shortcut.hidden = grouped || active.dataset.listRow === 'info';
    shortcut.querySelector('kbd').textContent = 'Enter';
    shortcut.querySelector('span').textContent = detail ? '展开或收起' : '打开记录';
  }

  function showList() {
    const active = activeList();
    const density = listDensity.querySelector(':checked').value;
    for (const part of listSpecimen.children) part.hidden = part !== active;
    for (const surface of active === listSections ? listSections.children : [active]) {
      if (density === 'compact') surface.setAttribute('density', density);
      else surface.removeAttribute('density');
    }
    listRows.hidden = active === listSections;
    listReadout();
  }
  listKinds.addEventListener('change', showList);
  listTools.addEventListener('change', showList);
  listSpecimen.addEventListener('toggle', listReadout, true);
  const listBookmark = document.querySelector('#list-bookmark');
  listBookmark.addEventListener('click', () => {
    const added = listBookmark.getAttribute('aria-pressed') !== 'true';
    listBookmark.setAttribute('aria-pressed', String(added));
    listBookmark.querySelector('.ml-list-value').textContent = added ? '已加入' : '未加入';
  });

  function focusListRecord() {
    listRecord.focus({ preventScroll: true });
    listRecord.scrollIntoView({ block: 'nearest' });
  }

  function activeChoice() {
    return choiceSpecimen.querySelector('[data-choice-demo="' + choiceKinds.querySelector(':checked').value + '"]');
  }
  function choiceReadout() {
    if (component !== 'choice') return;
    const group = activeChoice();
    const options = group.options;
    const selected = options.filter(field => field.checked);
    const radio = group.dataset.choiceDemo === 'radio';
    const disabled = group.querySelector('fieldset').disabled;
    const message = radio ? (selected[0]?.labels[0]?.textContent.trim() ?? '尚未选择版式') : '已选 ' + selected.length + ' / ' + options.length + ' 项';
    const readout = document.querySelector('#stage-state');
    const text = (disabled ? '已禁用 · ' : '') + message;
    if (readout.textContent !== text) readout.textContent = text;
    document.querySelector('#state-dot').className = disabled || !selected.length ? 'state-dot off' : 'state-dot';
    const shortcut = document.querySelector('#shortcut');
    shortcut.hidden = disabled;
    shortcut.querySelector('kbd').textContent = radio ? '↑ ↓' : 'Space';
    shortcut.querySelector('span').textContent = radio ? '切换选项' : '选择或取消';
  }
  function showChoices() {
    const active = activeChoice();
    for (const group of choiceSpecimen.children) group.hidden = group !== active;
    active.setAttribute('layout', choiceLayout.querySelector(':checked').value);
    active.querySelector('fieldset').disabled = choiceStates.querySelector(':checked').value === 'disabled';
    active.refresh();
    choiceReadout();
  }
  choiceKinds.addEventListener('change', showChoices);
  choiceLayout.addEventListener('change', showChoices);
  choiceStates.addEventListener('change', showChoices);
  choiceSpecimen.addEventListener('change', choiceReadout);

  const alerts = document.querySelector('#choice-alerts');
  alerts.addEventListener('change', () => {
    const selected = alerts.options.filter(field => field.checked).map(field => field.value);
    document.querySelector('#choice-alerts-result').value = selected.length ? '已订阅' + selected.join('、') : '未订阅提醒';
  });
  document.querySelector('#choice-format').addEventListener('change', event => {
    document.querySelector('#choice-format-result').value = '素材清单.' + event.target.value;
  });
  const handoff = document.querySelector('#choice-handoff');
  const reviewed = handoff.elements.reviewed;
  const handoffResult = document.querySelector('#choice-handoff-result');
  function clearConfirmation() {
    reviewed.removeAttribute('aria-invalid');
    handoffResult.value = '';
  }
  handoff.addEventListener('change', clearConfirmation);
  handoff.addEventListener('reset', clearConfirmation);
  handoff.addEventListener('submit', event => {
    event.preventDefault();
    if (reviewed.checkValidity()) {
      reviewed.removeAttribute('aria-invalid');
      handoffResult.value = '已确认本次交接。';
    } else {
      reviewed.setAttribute('aria-invalid', 'true');
      handoffResult.value = '请先勾选「我已核对交接记录」。';
      reviewed.focus();
    }
  });

  function islandTemplate() {
    return document.getElementById('island-' + islandContent.querySelector(':checked').value + '-template');
  }
  function islandReadout() {
    if (component !== 'island') return;
    const label = { left: '向左', right: '向右', up: '向上', down: '向下' }[heroIsland.direction];
    document.querySelector('#stage-state').textContent = heroIsland.open ? '已' + label + '展开' : '已收起 · 点按展开';
    document.querySelector('#state-dot').className = heroIsland.open ? 'state-dot' : 'state-dot off';
    document.querySelector('#shortcut').hidden = true;
  }
  function showIsland() {
    const direction = islandDirections.querySelector(':checked').value;
    islandSpecimen.dataset.direction = direction;
    heroIsland.direction = direction;
    const panel = heroIsland.querySelector('.ml-island-panel'), template = islandTemplate();
    if (panel.dataset.sample !== template.id) {
      panel.replaceChildren(template.content.cloneNode(true));
      panel.dataset.sample = template.id;
    }
    islandReadout();
  }
  heroIsland.addEventListener('ml-toggle', islandReadout);
  for (const field of [islandDirections, islandContent]) field.addEventListener('change', () => {
    showIsland();
    heroIsland.show();
  });
  islandColors.addEventListener('change', event => {
    if (event.target.name !== 'island-tone') return;
    heroIsland.setAttribute('tone', event.target.value);
    for (const property of ['--ml-island-fill', '--ml-island-ink']) heroIsland.style.removeProperty(property);
    islandColors.removeAttribute('data-custom');
  });
  function useIslandColor() {
    const preset = islandColors.querySelector('input[type="radio"]:checked');
    if (preset) preset.checked = false;
    heroIsland.style.setProperty('--ml-island-fill', islandColor.value);
    heroIsland.style.setProperty('--ml-island-ink', paletteForeground(islandColor.value).color);
    islandColors.setAttribute('data-custom', '');
  }
  islandColor.addEventListener('input', useIslandColor);
  islandColor.addEventListener('change', useIslandColor);
  const islandReview = document.querySelector('#island-review');
  let islandReviewed = 2;
  islandReview.querySelector('.ml-island-action').addEventListener('click', event => {
    islandReviewed = islandReviewed === 6 ? 0 : islandReviewed + 1;
    islandReview.querySelector('.ml-island-value').textContent = islandReviewed + ' / 6';
    islandReview.querySelector(':scope > button').setAttribute('aria-label', '相册复核，已复核 ' + islandReviewed + ' 个，共 6 个');
    islandReview.querySelector('strong').textContent = islandReviewed === 6 ? '本轮复核完成' : '相册复核';
    event.currentTarget.textContent = islandReviewed === 6 ? '重新演示' : '复核下一组';
  });
  const islandNote = document.querySelector('#island-note');
  islandNote.querySelector('.ml-island-action').addEventListener('click', event => {
    const button = event.currentTarget, full = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', String(full));
    islandNote.querySelector('p').textContent = full ? '先挑出山间湖泊的三张封面候选图，再把原片和选片笔记一起存进相册。' : '优先复核山野。';
    button.textContent = full ? '查看简短备注' : '查看完整备注';
  });

  function showFeedback() {
    const isToast = feedbackKind === 'toast';
    const tone = feedbackTone[feedbackKind];
    const sample = feedbackSamples[tone];
    const selectedTone = feedbackTones.querySelector('input[value="' + tone + '"]');
    selectedTone.checked = true;
    feedbackPlay.hidden = !isToast;
    feedbackRestore.hidden = true;
    feedbackRestore.querySelector('button').textContent = isToast ? '重新显示轻提示' : '重新显示横幅';
    feedbackToast.clear();
    feedbackToast.hidden = !isToast;
    if (isToast) {
      feedbackBanner.hidden = true;
      feedbackToast.show(sample.toast, { tone, duration: 0, trigger: selectedTone });
    } else {
      feedbackBanner.setAttribute('tone', tone);
      feedbackBanner.querySelector('strong').textContent = sample.title;
      feedbackBanner.querySelector('p').textContent = sample.detail;
      const action = feedbackBanner.querySelector('.ml-banner-action');
      action.hidden = !sample.action;
      action.textContent = sample.action ?? '';
      feedbackBanner.show(selectedTone);
    }
    document.querySelector('#stage-state').textContent = isToast ? '试播时显示 4 秒' : '持续显示，可手动关闭';
    document.querySelector('#state-dot').className = 'state-dot';
    document.querySelector('#shortcut').hidden = true;
  }

  feedbackKinds.addEventListener('change', event => { feedbackKind = event.target.value; showFeedback(); });
  feedbackTones.addEventListener('change', event => { feedbackTone[feedbackKind] = event.target.value; showFeedback(); });
  feedbackRestore.addEventListener('click', () => {
    feedbackTones.querySelector(':checked').focus();
    showFeedback();
  });
  feedbackSpecimen.addEventListener('ml-toggle', event => {
    if (!event.detail.open && event.detail.reason !== 'clear') feedbackRestore.hidden = false;
  });
  feedbackPlay.querySelector('button').addEventListener('click', event => {
    const tone = feedbackTone.toast;
    feedbackPopup.show(feedbackSamples[tone].toast, { tone, trigger: event.currentTarget });
  });
  feedbackBanner.querySelector('.ml-banner-action').addEventListener('click', () => {
    feedbackTone.banner = 'success';
    showFeedback();
    feedbackTones.querySelector(':checked').focus({ preventScroll: true });
  });
  document.querySelector('#feedback-copy').addEventListener('click', async event => {
    const trigger = event.currentTarget;
    const record = document.querySelector('#feedback-record');
    const copied = await copyContents(record);
    if (component === 'feedback') feedbackPopup.show(copied ? '已复制编号 ' + record.textContent : '编号已选中，可手动复制',
      { tone: copied ? 'success' : 'info', trigger });
  });
  document.querySelector('#feedback-queue').addEventListener('click', event => {
    const trigger = event.currentTarget;
    feedbackPopup.show('示例记录已保存', { tone: 'success', trigger });
    feedbackPopup.show('还有 2 条记录待同步', { tone: 'warning', trigger });
  });
  const retryBanner = document.querySelector('#feedback-retry-banner');
  retryBanner.querySelector('.ml-banner-action').addEventListener('click', event => {
    const done = retryBanner.getAttribute('tone') === 'danger';
    retryBanner.setAttribute('tone', done ? 'success' : 'danger');
    retryBanner.querySelector('strong').textContent = done ? '同步完成' : '同步失败';
    retryBanner.querySelector('p').textContent = done ? '示例记录已同步。' : '记录已保存在本地。';
    event.currentTarget.textContent = done ? '重新演示' : '重试同步';
  });

  function setReviewProgress(card) {
    const progress = card.querySelector('progress');
    progress.value = reviewedPoints;
    progress.textContent = Math.round(progress.position * 100) + '%';
    card.querySelector('.ml-info-value > span').textContent = String(reviewedPoints);
    card.querySelector('dd').textContent = (progress.max - reviewedPoints) + ' 个相册';
  }

  function readInfoState() {
    if (component !== 'info') return;
    const kind = infoSpecimen.dataset.kind;
    const pill = kind === 'pill';
    const disclosure = pill ? infoSpecimen.querySelector('ml-hover-card') : infoSpecimen.querySelector('details');
    const open = disclosure?.open;
    document.querySelector('#stage-state').textContent = pill
      ? (open ? '播放间隔详情已展开' : '悬停或轻点胶囊可查看详情')
      : kind === 'metric' ? '复核完成 ' + infoSpecimen.querySelector('progress').textContent : (open ? '记录详情已展开' : '记录详情已收起');
    document.querySelector('#state-dot').className = disclosure && !open ? 'state-dot off' : 'state-dot';
    const shortcut = document.querySelector('#shortcut');
    shortcut.hidden = !disclosure;
    shortcut.querySelector('kbd').textContent = pill ? (open ? 'Esc' : 'Tab') : 'Enter';
    shortcut.querySelector('span').textContent = pill ? (open ? '收起详情' : '聚焦查看') : '展开或收起';
  }

  function showInfo() {
    if (infoSpecimen.dataset.kind !== infoKind) {
      infoSpecimen.querySelector('ml-hover-card')?.hide();
      infoSpecimen.replaceChildren(makeInfo(infoKind));
      infoSpecimen.dataset.kind = infoKind;
    }
    infoAdvance.hidden = infoKind !== 'metric';
    if (infoKind === 'metric') {
      setReviewProgress(infoSpecimen);
      infoAdvance.querySelector('button').textContent = infoSpecimen.querySelector('progress').position === 1 ? '重新演示' : '复核下一组';
    }
    infoKinds.querySelector('input[value="' + infoKind + '"]').checked = true;
    readInfoState();
  }
  infoExamples.querySelector('.info-pill-list').append(makeInfo('pill'));
  infoKinds.addEventListener('change', event => { infoKind = event.target.value; showInfo(); });
  infoAdvance.querySelector('button').addEventListener('click', () => {
    reviewedPoints = reviewedPoints >= infoSpecimen.querySelector('progress').max ? reviewStart : reviewedPoints + 1;
    showInfo();
  });
  infoSpecimen.addEventListener('ml-toggle', readInfoState);
  infoSpecimen.addEventListener('toggle', readInfoState, true);

  function readHoverState() {
    if (component !== 'hover-card') return;
    const open = hoverSpecimen.firstElementChild?.open;
    document.querySelector('#stage-state').textContent = open ? '卡片已展开' : '卡片已收起';
    document.querySelector('#state-dot').className = open ? 'state-dot' : 'state-dot off';
    const shortcut = document.querySelector('#shortcut');
    shortcut.hidden = false;
    shortcut.querySelector('kbd').textContent = open ? 'Esc' : 'Tab';
    shortcut.querySelector('span').textContent = open ? '收起卡片' : '聚焦查看';
  }

  function showHover(reveal = location.hash === '#hover-card') {
    if (hoverSpecimen.dataset.kind !== hoverKind) {
      hoverSpecimen.dataset.kind = hoverKind;
      hoverSpecimen.replaceChildren(makeHover(hoverKind));
    }
    hoverKinds.querySelector('input[value="' + hoverKind + '"]').checked = true;
    if (reveal) hoverSpecimen.firstElementChild.show();
    readHoverState();
  }
  for (const row of hoverExamples.querySelectorAll('[data-hover-example]')) {
    row.prepend(makeHover(row.dataset.hoverExample));
  }
  hoverKinds.addEventListener('change', event => { hoverKind = event.target.value; showHover(true); });
  hoverSpecimen.addEventListener('ml-toggle', readHoverState);
  hoverExamples.addEventListener('ml-toggle', event => {
    if (!event.detail.open || component !== 'hover-card') return;
    hoverKind = event.target.closest('[data-hover-example]').dataset.hoverExample;
    showHover(false);
  });
  for (const area of [hoverSpecimen, hoverExamples]) area.addEventListener('click', event => {
    const action = event.target.closest('.ml-hover-action');
    if (!action) return;
    recordSaved = action.getAttribute('aria-pressed') !== 'true';
    for (const peer of document.querySelectorAll('ml-hover-card .ml-hover-action')) peer.setAttribute('aria-pressed', String(recordSaved));
    document.querySelector('#hover-saved-status').textContent = recordSaved ? '已收藏' : '未收藏';
  });

  function showBadges() {
    const { kind, lamp, count, unread, dot, phase, label } = badgeDemo;
    badgeKinds.querySelector('input[value="' + kind + '"]').checked = true;
    for (const view of badgeSpecimens.children) view.hidden = view.dataset.badgeView !== kind;
    for (const tools of badgeTools.children) tools.hidden = tools.dataset.badgeTools !== kind;
    for (const badge of badgeSamples) {
      switch (badge.kind) {
        case 'indicator': badge.state = lampStates[lamp]; break;
        case 'count': badge.value = count; break;
        case 'notification': badge.value = unread; badge.dot = dot; break;
        case 'status': badge.tone = phases[phase][0]; badge.label = phases[phase][1]; break;
        case 'tag': badge.label = label; break;
      }
    }
    for (const button of badgeTools.querySelectorAll('[data-badge-op="less"], [data-badge-op="zero"]')) button.disabled = count === 0;
    badgeTools.querySelector('[data-badge-op="dot"]').setAttribute('aria-pressed', String(dot));
    badgeTools.querySelector('[data-badge-op="read"]').disabled = unread === 0;
    for (const bell of document.querySelectorAll('.ml-badge-icon[data-badge-op="read"]')) {
      bell.setAttribute('aria-disabled', String(!unread));
      bell.querySelector('.sr-only').textContent = unread ? '通知中心，标记全部已读' : '通知中心，暂无未读通知';
    }
    if (document.activeElement !== badgeInput && badgeInput.value !== label) {
      badgeInput.value = label;
      badgeInput.setCustomValidity('');
    }
    const lampLabel = badgeSpecimens.querySelector('[data-badge-view="indicator"] [data-badge-live]').label;
    const readout = { indicator: '导入服务 · ' + lampLabel, count: '待复核 ' + count + ' 条',
      notification: unread ? unread + ' 条未读' : '全部已读', status: 'DEMO-107 · ' + phases[phase][1], tag: '类型 · ' + label };
    document.querySelector('#stage-state').textContent = readout[kind];
    document.querySelector('#state-dot').className = 'state-dot';
    document.querySelector('#shortcut').hidden = true;
  }

  badgeKinds.addEventListener('change', event => { badgeDemo.kind = event.target.value; showBadges(); });
  for (const area of [badgeSpecimens, badgeTools, badgeExamples]) area.addEventListener('click', event => {
    const button = event.target.closest('button[data-badge-op]');
    if (!button || button.getAttribute('aria-disabled') === 'true') return;
    const owner = button.closest('[data-badge-view], [data-badge-tools], [data-badge-example]').dataset;
    badgeDemo.kind = owner.badgeView || owner.badgeTools || owner.badgeExample;
    switch (button.dataset.badgeOp) {
      case 'cycle': badgeDemo.lamp = (badgeDemo.lamp + 1) % lampStates.length; break;
      case 'less': badgeDemo.count = Math.max(0, badgeDemo.count - 1); break;
      case 'add': badgeDemo.count++; break;
      case 'hundred': badgeDemo.count += 100; break;
      case 'zero': badgeDemo.count = 0; break;
      case 'notify': badgeDemo.unread++; break;
      case 'read': badgeDemo.unread = 0; break;
      case 'dot': badgeDemo.dot = !badgeDemo.dot; break;
      case 'advance': badgeDemo.phase = (badgeDemo.phase + 1) % phases.length; break;
      case 'change-tag': {
        const types = ['摄影', '插画', '短片'];
        badgeDemo.label = types[(types.indexOf(badgeDemo.label) + 1) % types.length];
        break;
      }
    }
    showBadges();
  });
  badgeInput.addEventListener('input', () => badgeInput.setCustomValidity(''));
  document.querySelector('#badge-tag-form').addEventListener('submit', event => {
    event.preventDefault();
    const label = badgeInput.value.trim();
    if (!label) { badgeInput.setCustomValidity('请输入标签文字'); badgeInput.reportValidity(); return; }
    badgeDemo.label = badgeInput.value = label;
    showBadges();
  });

  function paletteHex(colors, key) {
    return colors.getPropertyValue('--ml-color-' + key).trim().toUpperCase();
  }

  function addMaterialSample(parent) {
    const sample = document.querySelector('#material-sample-template').content.firstElementChild.cloneNode(true);
    if (parent.matches('label')) sample.setAttribute('aria-hidden', 'true');
    const lens = sample.querySelector('ml-material');
    const canvas = sample.querySelector('canvas');
    parent.append(sample);
    lens.backdrop = canvas;
    materialSamples.push({ lens, canvas });
  }

  // Parallel edges make blur and refraction directly comparable on an identical source texture.
  function drawMaterialChart(canvas) {
    const ctx = canvas.getContext('2d'), style = getComputedStyle(canvas);
    const color = key => style.getPropertyValue('--ml-color-' + key).trim();
    const w = canvas.width, h = canvas.height;
    ctx.fillStyle = color('background');
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.transform(1, 0, -.63, 1, 0, 0);
    for (const [x, width, hue, opacity] of [
      [-212, 2, 'separator', .95], [-197, 2, 'separator', .95], [-182, 2, 'separator', .95],
      [-131, 8, 'control-border', .62], [-111, 62, 'separator', 1], [-49, 37, 'fill', 1],
      [-12, 8, 'surface-raised', 1], [-4, 83, 'control-border', .45], [79, 26, 'selection', 1],
      [105, 7, 'surface-raised', 1], [112, 4, 'text-secondary', .65], [130, 2, 'control-border', .75],
      [174, 2, 'separator', .95], [189, 2, 'separator', .95], [204, 2, 'separator', .95],
    ]) {
      ctx.fillStyle = color(hue);
      ctx.globalAlpha = opacity;
      ctx.fillRect(x, -h / 2, width, h);
    }
    ctx.restore();
  }

  materialSurfaces.addEventListener('change', showMaterials);
  materialComparison.addEventListener('change', event => {
    if (event.target.name === 'material-comparison') applyAppearance('material', event.target.value, true);
  });
  materialHistory.addEventListener('toggle', () => {
    const recording = materialHistory.querySelector('video');
    if (!materialHistory.open) recording.pause();
    else if (!recording.hasAttribute('src')) {
      recording.poster = recording.dataset.poster;
      recording.src = recording.dataset.src;
    }
  });

  function showMaterials() {
    if (!materialSamples.length) {
      addMaterialSample(materialHero);
      for (const level of materialLevels) {
        const card = document.createElement('label');
        card.className = 'material-card';
        card.dataset.mlMaterial = level.value;
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'material-comparison';
        radio.value = level.value;
        card.append(radio);
        addMaterialSample(card);
        const title = document.createElement('strong'), caption = document.createElement('span');
        title.textContent = level.label + ' · ' + level.name;
        caption.textContent = pointerLightEnabled() ? level.litDescription : level.description;
        card.append(title, caption);
        materialComparison.append(card);
      }
    }
    const content = materialSurfaces.querySelector('input:checked').value === 'content';
    for (const { lens } of materialSamples) {
      if (content) lens.setAttribute('surface', 'content');
      else lens.removeAttribute('surface');
    }
    if (chartTheme !== appearance.theme) {
      chartTheme = appearance.theme;
      for (const { canvas, lens } of materialSamples) {
        drawMaterialChart(canvas);
        lens.refreshBackdrop();
      }
    }
    const level = materialLevels.find(level => level.value === appearance.material);
    materialComparison.querySelector('input[value="' + level.value + '"]').checked = true;
    document.querySelector('#stage-state').textContent = level.label + ' · ' + level.name;
    document.querySelector('#shortcut').hidden = true;

  }

  function paletteForeground(hex) {
    const rgb = [1, 3, 5].map(start => {
      const s = parseInt(hex.slice(start, start + 2), 16) / 255;
      return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
    });
    const luminance = .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
    const white = 1.05 / (luminance + .05);
    return white >= 4.5 ? { color: '#fff', label: '白字', ratio: white }
      : { color: '#000', label: '黑字', ratio: (luminance + .05) / .05 };
  }

  function buildPaletteGroup(entries) {
    const headings = [...paletteTable.querySelectorAll('thead [data-ml-theme]')];
    const columns = headings.map(cell => ({ theme: cell.dataset.mlTheme, title: cell.textContent, colors: getComputedStyle(cell) }));
    const chipTemplate = document.querySelector('#palette-chip-template').content;
    const valueTemplate = document.querySelector('#palette-value-template').content;
    const body = paletteTable.tBodies[0];
    body.replaceChildren();
    paletteStrip.replaceChildren();
    for (const [key, name] of entries) {
      const property = '--ml-color-' + key;
      const chip = chipTemplate.firstElementChild.cloneNode(true);
      chip.querySelector('input').value = key;
      chip.querySelector('.palette-chip-name').textContent = name;
      chip.style.setProperty('--palette-chip', 'var(' + property + ')');
      paletteStrip.append(chip);

      const row = body.insertRow();
      const heading = document.createElement('th');
      heading.scope = 'row';
      heading.textContent = name;
      row.append(heading);
      for (const column of columns) {
        const cell = row.insertCell();
        cell.dataset.mlTheme = column.theme;
        const button = valueTemplate.firstElementChild.cloneNode(true);
        const hex = paletteHex(column.colors, key);
        button.querySelector('i').style.backgroundColor = 'var(' + property + ')';
        button.querySelector('code').textContent = hex;
        button.setAttribute('aria-label', '复制' + column.title + '主题的' + name + ' ' + hex);
        cell.append(button);
      }
    }
    paletteSpecimen.dataset.group = paletteGroup;
    document.querySelector('#palette-table-status').textContent = '点击色值即可复制。';
  }

  function showColors() {
    const entries = paletteGroups[paletteGroup];
    if (paletteSpecimen.dataset.group !== paletteGroup) buildPaletteGroup(entries);
    const key = paletteSelection[paletteGroup];
    const [, name, usage] = entries.find(entry => entry[0] === key);
    const property = '--ml-color-' + key;
    const colors = getComputedStyle(paletteSpecimen);
    const hex = paletteHex(colors, key);
    const ink = paletteForeground(hex);
    for (const chip of paletteStrip.children) {
      const input = chip.querySelector('input');
      input.checked = input.value === key;
      const swatch = paletteHex(colors, input.value);
      chip.style.setProperty('--palette-on', paletteForeground(swatch).color);
    }
    paletteSpecimen.style.setProperty('--palette-selected', 'var(' + property + ')');
    paletteSpecimen.style.setProperty('--palette-on', ink.color);
    document.querySelector('#palette-name').textContent = name;
    document.querySelector('#palette-hex').textContent = hex;
    document.querySelector('#palette-variable').textContent = 'var(' + property + ')';
    document.querySelector('#palette-contrast').textContent = ink.label + '对比度 ' + ink.ratio.toFixed(2) + ':1';
    document.querySelector('#stage-state').textContent = usage;
    document.querySelector('#shortcut').hidden = true;
    paletteCopyVersion++;
  }

  palettePicker.addEventListener('change', event => { paletteGroup = event.target.value; showColors(); });
  paletteStrip.addEventListener('change', event => { paletteSelection[paletteGroup] = event.target.value; showColors(); });
  async function copyPaletteValue(element, status) {
    const version = ++paletteCopyVersion;
    const value = element.textContent;
    const copied = await copyContents(element);
    if (version === paletteCopyVersion && component === 'colors') status.textContent = copied ? '已复制 ' + value : '已选中 ' + value + '，可手动复制。';
  }
  paletteTools.addEventListener('click', event => {
    const button = event.target.closest('button[data-copy-palette]');
    if (button) copyPaletteValue(document.getElementById(button.dataset.copyPalette), document.querySelector('#stage-state'));
  });
  paletteTable.addEventListener('click', event => {
    const button = event.target.closest('.palette-value');
    if (button) copyPaletteValue(button.querySelector('code'), document.querySelector('#palette-table-status'));
  });

  const Icon = customElements.get('ml-icon');
  const iconGrid = document.querySelector('#icon-grid');
  const iconSearch = document.querySelector('#icon-search');
  const iconCategory = document.querySelector('#icon-category');
  const iconSource = document.querySelector('#icon-copy-source');
  const quickCopy = document.querySelector('#icon-quick-copy');
  const iconButtons = [...document.querySelectorAll('[data-copy-icon], #download-icon')];
  const iconState = { name: 'layers', size: '24', weight: 'regular' };
  let iconMatches;
  for (const [key, label] of new Map(Icon.catalog.map(item => [item.category, item.categoryLabel]))) {
    iconCategory.add(new Option(label, key));
  }

  function buildIconChoices() {
    const words = iconSearch.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    iconMatches = Icon.catalog.filter(item => {
      const text = [item.name, item.label, item.categoryLabel, item.keywords].join(' ').toLowerCase();
      return (iconCategory.value === 'all' || iconCategory.value === item.category) && words.every(word => text.includes(word));
    });
    const query = words.join(' ');
    const exact = iconMatches.find(item => item.name === query || item.label.toLowerCase() === query);
    if (exact) iconState.name = exact.name;
    const fragment = document.createDocumentFragment();
    const template = document.querySelector('#icon-tile-template').content.firstElementChild;
    let section, tiles;
    for (const item of iconMatches) {
      if (section?.dataset.category !== item.category) {
        section = document.createElement('section');
        section.className = 'icon-group';
        section.dataset.category = item.category;
        const title = document.createElement('h3');
        title.textContent = item.categoryLabel;
        tiles = document.createElement('div');
        tiles.className = 'icon-tiles';
        section.append(title, tiles);
        fragment.append(section);
      }
      const tile = template.cloneNode(true);
      tile.querySelector('input').value = item.name;
      tile.querySelector('ml-icon').setAttribute('name', item.name);
      tile.querySelector('.icon-tile-name').textContent = item.label;
      tile.title = item.name;
      tiles.append(tile);
    }
    iconGrid.replaceChildren(fragment);
    document.querySelector('#icon-empty').hidden = iconMatches.length > 0;
    document.querySelector('#icon-result-count').textContent = iconMatches.length + ' 枚图标';
  }

  function showIcons(rebuild = false) {
    if (rebuild || !iconMatches) buildIconChoices();
    const item = iconMatches.find(entry => entry.name === iconState.name) ?? iconMatches[0];
    const ready = !!item;
    document.querySelector('#icon-selected').hidden = !ready;
    document.querySelector('#icon-idle').hidden = ready;
    updateIconReplay();
    document.querySelector('#shortcut').hidden = true;
    for (const button of iconButtons) button.disabled = !ready;
    document.querySelector('#open-code').disabled = !ready;
    quickCopy.querySelector('span').textContent = ready ? '复制' + item.label : '复制所选';
    document.querySelector('#stage-state').textContent = ready ? item.categoryLabel : '可更改搜索词或分类。';
    if (!item) { iconSource.textContent = ''; updateMaterialNote(); return; }
    iconState.name = item.name;
    for (const tile of iconGrid.querySelectorAll('.icon-tile')) {
      const input = tile.querySelector('input');
      input.checked = input.value === item.name;
      const glyph = tile.querySelector('ml-icon');
      if (glyph.getAttribute('weight') !== iconState.weight) glyph.setAttribute('weight', iconState.weight);
    }
    for (const glyph of document.querySelectorAll('#icon-enlarged, #icon-actual')) {
      glyph.setAttribute('name', item.name);
      glyph.setAttribute('weight', iconState.weight);
    }
    document.querySelector('#icon-actual').setAttribute('size', iconState.size);
    document.querySelector('#icon-title').textContent = item.label;
    document.querySelector('#icon-key').textContent = item.name;
    document.querySelector('#icon-dimensions').textContent = '原寸 · ' + iconState.size + ' px';
    updateMaterialNote();
    document.querySelector('.icon-plate button').setAttribute('aria-label', '复制' + item.label + '的 SVG');
    const svg = iconForAppearance(item.name, { size: iconState.size, weight: iconState.weight, label: item.label });
    iconSource.textContent = new XMLSerializer().serializeToString(svg);
  }

  iconSearch.addEventListener('input', () => showIcons(true));
  iconCategory.addEventListener('change', () => showIcons(true));
  function updateIconReplay() {
    const empty = document.querySelector('#icon-selected').hidden;
    iconReplay.disabled = empty || reduceMotion.matches || appearance.motion !== 'high';
    iconReplay.title = empty ? '请先选择图标' : reduceMotion.matches ? '系统已开启减少动态效果'
      : appearance.motion !== 'high' ? '将动态效果设为「高」即可重播' : '重播所选图标的动效';
  }
  function playSelectedIcon() {
    if (!iconReplay.disabled) {
      document.querySelector('#icon-enlarged').playMotion();
      document.querySelector('#icon-actual').playMotion();
    }
  }
  iconReplay.addEventListener('click', playSelectedIcon);
  document.querySelector('#clear-icon-filter').addEventListener('click', () => {
    iconSearch.value = '';
    iconCategory.value = 'all';
    iconCategory.dispatchEvent(new Event('change', { bubbles: true }));
    iconSearch.focus();
  });
  for (const [id, key] of [['icon-weights', 'weight'], ['icon-sizes', 'size'], ['icon-grid', 'name']]) {
    document.getElementById(id).addEventListener('change', event => {
      iconState[key] = event.target.value;
      showIcons();
      if (key === 'name') playSelectedIcon();
    });
  }
  async function copyIcon() {
    const value = iconSource.textContent;
    if (!value) return;
    const copied = await copyContents(iconSource);
    if (component !== 'icons' || iconSource.textContent !== value) return;
    const label = document.querySelector('#icon-title').textContent;
    const feedback = copied ? '已复制' + label + '的 SVG' : 'SVG 已选中，可手动复制。';
    document.querySelector('#stage-state').textContent = feedback;
    if (copied) {
      quickCopy.querySelector('span').textContent = '已复制' + label;
    } else {
      codeSample.textContent = value;
      document.querySelector('#code-title').textContent = '图标 SVG';
      copyStatus.textContent = feedback;
      codeDialog.showModal();
      selectContents(codeSample);
    }
  }
  for (const button of document.querySelectorAll('[data-copy-icon]')) button.addEventListener('click', copyIcon);
  document.querySelector('#download-icon').addEventListener('click', () => {
    if (!iconSource.textContent) return;
    const url = URL.createObjectURL(new Blob([iconSource.textContent], { type: 'image/svg+xml;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = [iconState.name, iconState.size, iconState.weight].join('-') + '.svg';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    document.querySelector('#stage-state').textContent = '已准备下载 ' + link.download;
  });

  function recordReadout() {
    if (!recordTypes.includes(component)) return;
    const isTable = component === 'data-table';
    const empty = emptyRecords[component];
    let text;
    if (empty) text = '暂无记录';
    else if (!isTable) text = '当前第 ' + recordPager.page + ' 页';
    else if (recordTable.hasAttribute('selectable')) text = '已选 ' + recordTable.selectedRows.length + ' 条';
    else {
      const sorted = recordTable.table.tHead.querySelector('th[aria-sort]');
      text = sorted ? sorted.textContent.trim() + (sorted.getAttribute('aria-sort') === 'ascending' ? '升序' : '降序') : '原始顺序';
    }
    const status = document.querySelector('#stage-state');
    if (status.textContent !== text) status.textContent = text;
    document.querySelector('#state-dot').className = empty ? 'state-dot off' : 'state-dot';
    const shortcut = document.querySelector('#shortcut');
    shortcut.hidden = empty;
    shortcut.querySelector('kbd').textContent = isTable ? 'Enter' : '← →';
    shortcut.querySelector('span').textContent = isTable ? '在表头排序' : '在页码间切换';
  }
  function showRecords() {
    const empty = emptyRecords[component];
    recordStates.querySelector('[value="' + (empty ? 'empty' : 'data') + '"]').checked = true;
    const kind = document.querySelector('#' + component + '-kinds :checked').value;
    if (component === 'data-table') {
      recordTable.setAttribute('density', kind === 'compact' ? 'compact' : 'standard');
      recordTable.toggleAttribute('selectable', kind === 'selectable');
      for (const row of recordTable.table.tBodies[0].rows) row.hidden = empty;
      recordTable.refresh();
    } else {
      recordPager.toggleAttribute('compact', kind === 'compact');
      recordPager.toggleAttribute('jump', kind === 'jump');
      recordPager.total = empty ? 0 : 238;
    }
    recordReadout();
  }
  for (const type of recordTypes) document.getElementById(type + '-kinds').addEventListener('change', showRecords);
  recordStates.addEventListener('change', event => { emptyRecords[component] = event.target.value === 'empty'; showRecords(); });
  for (const event of ['ml-sort-change', 'ml-selection-change']) recordTable.addEventListener(event, recordReadout);
  recordPager.addEventListener('ml-page-change', recordReadout);
  document.querySelector('#review-table').addEventListener('ml-selection-change', event => {
    const keys = event.detail.keys;
    document.querySelector('#review-selection').value = '已选 ' + keys.length + ' 条' + (keys.length ? ' · ' + keys.join('、') : '');
  });
  document.querySelector('#large-files-only').addEventListener('change', event => {
    for (const row of document.querySelector('#file-size-table').table.tBodies[0].rows) {
      row.hidden = event.target.checked && !(Number(row.cells[1].dataset.sortValue) > 500);
    }
  });
  function showArchivePage() {
    const { start, end } = document.querySelector('#archive-pager').state;
    [...document.querySelector('#paged-files').children].forEach((item, index) => { item.hidden = index < start - 1 || index >= end; });
  }
  document.querySelector('#archive-pager').addEventListener('ml-page-change', showArchivePage);
  showArchivePage();

  function dateDuration(range) {
    const [start, end] = range.fields;
    if (!start.value || !end.value) return '请选择起止日期';
    if (!start.validity.valid || !end.validity.valid) return '请检查日期范围';
    return (end.valueAsNumber - start.valueAsNumber) / 86400000 + 1 + ' 天';
  }
  function valueReadout() {
    if (!Object.hasOwn(valueTypes, component)) return;
    const host = valueSpecimen.firstElementChild;
    const input = host.querySelector('input');
    const unit = host.getAttribute('unit') || '';
    const message = input.disabled ? '已禁用' : component === 'date-range' ? dateDuration(host)
      : singlePickers.includes(component) ? (!input.validity.valid && input.value ? '请检查输入' : input.value ? '已选 ' + input.value : '尚未选择')
      : '每步 ' + (input.step || 1) + (unit === '张' || unit === '秒' ? ' ' : '') + unit;
    const status = document.querySelector('#stage-state');
    if (status.textContent !== message) status.textContent = message;
    document.querySelector('#state-dot').className = input.disabled ? 'state-dot off' : 'state-dot';
    const shortcut = document.querySelector('#shortcut');
    shortcut.hidden = input.disabled;
    shortcut.querySelector('kbd').textContent = { slider: '← →', stepper: '↑ ↓', 'date-range': '方向键', 'date-picker': '方向键', 'time-picker': '↑ ↓' }[component];
    shortcut.querySelector('span').textContent = component === 'time-picker' ? '在时间列内移动'
      : input.type === 'date' ? '在日历中移动' : '调节数值';
  }
  function showValue() {
    if (!valueDemos.has(component)) {
      const sources = [...valueTemplates.querySelectorAll('ml-' + component)];
      valueDemos.set(component, { index: 0, disabled: false, sources, hosts: sources.map(node => node.cloneNode(true)) });
    }
    const demo = valueDemos.get(component);
    [...valueKinds.querySelectorAll('label')].forEach((label, index) => {
      label.querySelector('span').textContent = valueTypes[component][index];
      label.querySelector('input').checked = index === demo.index;
    });
    valueStates.querySelector('[value="' + (demo.disabled ? 'disabled' : 'enabled') + '"]').checked = true;
    const host = demo.hosts[demo.index];
    if (host !== valueSpecimen.firstElementChild) valueSpecimen.replaceChildren(host);
    for (const field of host.querySelectorAll('input')) field.disabled = demo.disabled;
    host.refresh();
    valueReadout();
  }
  valueKinds.addEventListener('change', event => { valueDemos.get(component).index = Number(event.target.value); showValue(); });
  valueStates.addEventListener('change', event => { valueDemos.get(component).disabled = event.target.value === 'disabled'; showValue(); });
  valueSpecimen.addEventListener('input', valueReadout);

  function updateValueExample(card) {
    const field = card.querySelector('input');
    const output = card.querySelector('output');
    if (field.id === 'reading-size') card.querySelector('#reading-sample').style.fontSize = field.value + 'px';
    else if (field.id === 'playback-rate') output.value = '播放时长 ' + Math.round(60 / field.valueAsNumber) + ' 秒';
    else if (field.id === 'report-copies') output.value = field.value && field.validity.valid ? '共 ' + field.valueAsNumber * 8 + ' 页' : '请输入 1 至 20 的整数';
    else if (field.id === 'capture-interval') output.value = field.value && field.validity.valid ? '每分钟约 ' + Math.round(60 / field.valueAsNumber) + ' 张' : '请输入范围内的播放间隔';
    else if (output) {
      const span = dateDuration(card.querySelector('ml-date-range'));
      output.value = /^\d/.test(span) ? '预约 ' + span : span;
    } else {
      const { start, end } = card.querySelector('ml-date-range').value;
      const rows = [...card.querySelectorAll('li')];
      for (const row of rows) {
        const day = row.querySelector('time').dateTime;
        row.hidden = (start && day < start) || (end && day > end);
      }
      const empty = card.querySelector('#period-empty');
      empty.hidden = rows.some(row => !row.hidden);
      empty.textContent = start && end && start > end ? '请检查日期范围' : '所选区间内没有记录';
    }
  }
  for (const card of document.querySelectorAll('.value-examples .example-card')) {
    updateValueExample(card);
    card.addEventListener('input', () => updateValueExample(card));
  }
  const pickerBooking = document.querySelector('#picker-booking-form');
  const pickerBookingResult = document.querySelector('#picker-booking-result');
  pickerBooking.addEventListener('submit', event => {
    event.preventDefault();
    const booking = new FormData(pickerBooking);
    pickerBookingResult.value = '已预约 ' + booking.get('date') + ' ' + booking.get('time');
    pickerBookingResult.hidden = false;
  });
  for (const event of ['input', 'reset']) pickerBooking.addEventListener(event, () => { pickerBookingResult.hidden = true; });

  function showDemo() {
    const kind = demo.usage;
    picker.querySelector('input[value="' + kind + '"]').checked = true;
    for (const specimen of document.querySelectorAll('[data-specimen]')) {
      specimen.hidden = component !== 'switch' || specimen.dataset.specimen !== kind;
    }
    if (component === 'button') { showButton(); return; }
    if (component === 'dialog') { showDialog(); return; }
    if (component === 'tag') { showTags(); return; }
    if (component === 'select') { showSelect(); return; }
    if (currentPreview) { currentPreview.show(); return; }
    if (component === 'input') { showInput(); return; }
    if (Object.hasOwn(valueTypes, component)) { showValue(); return; }
    if (navigation.types.includes(component)) { navigation.readout(); return; }
    if (recordTypes.includes(component)) { showRecords(); return; }
    if (component === 'choice') { showChoices(); return; }
    if (component === 'list') { showList(); return; }
    if (component === 'menu') { showMenu(); return; }
    if (component === 'hover-card') { showHover(); return; }
    if (component === 'info') { showInfo(); return; }
    if (component === 'progress') { showProgress(); return; }
    if (component === 'feedback') { showFeedback(); return; }
    if (component === 'island') { showIsland(); return; }
    if (component === 'badge') { showBadges(); return; }
    if (component === 'colors') { showColors(); return; }
    if (component === 'materials') { showMaterials(); return; }
    if (Object.hasOwn(foundations.titles, component)) { foundations.show(); return; }
    if (component === 'icons') { showIcons(); return; }
    for (const control of document.querySelectorAll('[data-example="hints"]')) control.checked = demo.hints;
    for (const control of document.querySelectorAll('[data-example="size"]')) control.value = demo.size;
    for (const control of document.querySelectorAll('[data-example="page"]')) control.value = demo.page;
    stage.dataset.size = demo.size;
    const page = pages[demo.page];
    document.querySelector('#page-content').textContent = page.text;
    const display = {
      toggle: { caption: '快捷键提示', state: demo.hints ? '已开启' : '已关闭', key: 'Space', action: '切换状态' },
      mode: { caption: '预览尺寸', state: demo.size === 'actual' ? '实际尺寸' : '细节放大', key: '← →', action: '选择模式' },
      page: { caption: page.text, state: page.label + '页', key: 'Enter', action: '打开页面' },
    }[kind];
    document.querySelector('#stage-caption').textContent = display.caption;
    document.querySelector('#stage-state').textContent = display.state;
    const dot = document.querySelector('#state-dot');
    dot.classList.toggle('off', kind === 'toggle' && !demo.hints);
    dot.classList.toggle('on', kind === 'toggle' && demo.hints);
    document.querySelector('#shortcut').hidden = !demo.hints;
    const key = document.querySelector('#shortcut kbd');
    key.hidden = touchShortcut;
    key.textContent = display.key;
    document.querySelector('#shortcut span').textContent = touchShortcut ? '轻点' + display.action : display.action;
    document.querySelector('#shortcut').title = touchShortcut ? '' : '将键盘焦点移到组件后操作';
  }

  function setShortcutInput(touch) {
    if (touchShortcut === touch) return;
    touchShortcut = touch;
    if (component === 'switch') showDemo();
  }
  document.addEventListener('pointerdown', event => setShortcutInput(event.pointerType !== 'mouse'), { passive: true });
  document.addEventListener('keydown', () => setShortcutInput(false), { capture: true });

  picker.addEventListener('change', event => {
    demo.usage = event.target.value;
    showDemo();
  });
  document.addEventListener('ml-change', event => {
    const example = event.target.dataset.example;
    if (!example) return;
    const { kind, value, checked } = event.detail;
    demo.usage = kind;
    if (example === 'hints') demo.hints = checked;
    if (example === 'size') demo.size = value;
    if (example === 'page') demo.page = value;
    showDemo();
  });
  function readRoute() {
    if (catalog.open) catalog.close();
    if (codeDialog.open) codeDialog.close();
    const match = /^#page-(overview|specs|keys)$/.exec(location.hash);
    const slug = location.hash.slice(1).replace(/-examples$/, '');
    const route = slug === 'catalog' ? 'navigation-panel' : slug;
    setComponent(location.hash === '#list-record' ? 'list' : catalogEntries.has(route) ? route : 'switch');
    if (match) {
      demo.page = match[1];
      demo.usage = 'page';
    } else if (!location.hash) {
      demo.page = 'overview';
    }
    showDemo();
    if (chosenRoute === location.hash) focusCatalogPage();
    chosenRoute = undefined;
    if (location.hash === '#list-record') focusListRecord();
    if (catalogEntries.has(route) && location.hash.endsWith('-examples')) document.querySelector('#examples').scrollIntoView();
  }

  function tagExampleCode() {
    const kind = tagDemo.kind;
    const labels = { status: '记录状态', filter: '筛选素材', removable: '记录标签' };
    const group = '<div class="ml-tag-group" id="sample-tags" role="group" aria-label="' + labels[kind] + '"' +
      (kind === 'removable' ? ' tabindex="-1"' : '') + '>';
    const items = kind === 'status'
      ? [...tagSpecimens.querySelectorAll('[data-tag-view="status"] ml-tag')].map(tag => ({ label: tag.label, tone: tag.getAttribute('tone') }))
      : kind === 'filter' ? sources : tokens;
    const lines = ['  ' + group];
    for (const [index, item] of items.entries()) {
      const tag = makeTag(kind, item);
      if (kind === 'removable') tag.hidden = tagDemo.removed.includes(index);
      lines.push('    ' + tag.outerHTML);
    }
    lines.push('  </div>');
    if (kind === 'status') return lines.concat('</div>');
    if (kind === 'filter') {
      lines.push('  <ul id="sample-results" aria-label="匹配素材">');
      for (const item of sources) lines.push('    <li data-type="' + item.value + '">' + item.asset + '</li>');
      return lines.concat('  </ul>', '</div>', '', '<script>', '  const group = document.getElementById("sample-tags");',
        '  function filterItems() {', '    const selected = [...group.querySelectorAll("ml-tag[selected]")].map(tag => tag.getAttribute("value"));',
        '    for (const item of document.getElementById("sample-results").children) {',
        '      item.hidden = selected.length > 0 && !selected.includes(item.dataset.type);', '    }', '  }',
        '  group.addEventListener("ml-change", filterItems);', '  filterItems();', '</script>');
    }
    return lines.concat('  <button type="button" id="sample-undo"' + (tagDemo.removed.length ? '' : ' hidden') + '>撤销移除</button>',
      '</div>', '', '<script>', '  const group = document.getElementById("sample-tags");',
      '  const undo = document.getElementById("sample-undo");', '  const tags = [...group.children];',
      '  const removed = ' + JSON.stringify(tagDemo.removed) + ';', '  group.addEventListener("ml-remove", event => {',
      '    const tag = event.target;', '    queueMicrotask(() => {', '      if (event.defaultPrevented || group.contains(tag)) return;',
      '      removed.push(tags.indexOf(tag));', '      undo.hidden = false;', '      if (document.activeElement === group) undo.focus();',
      '    });', '  });', '  undo.addEventListener("click", () => {', '    const index = removed.pop();',
      '    if (index === undefined) return;', '    const tag = tags[index];', '    tag.hidden = false;',
      '    const next = tags.slice(index + 1).find(item => item.parentElement === group);', '    group.insertBefore(tag, next ?? null);',
      '    tag.querySelector("button").focus();', '    undo.hidden = removed.length === 0;', '  });', '</script>');
  }

  function lightAttributes(extraStyle = '') {
    const style = '--ml-material-transparency: ' + appearance['material-transparency'] + '%; --ml-light-intensity: '
      + (appearance['light-intensity'] / 100) + '; --ml-glass-density: ' + densityInput.value + ';' + extraStyle;
    return 'data-ml-light-source="' + appearance['light-source'] + '" style="' + style + '"';
  }
  function iconForAppearance(name, options = {}) {
    return Icon.createSVG(name, { ...options, material: appearance.material, theme: appearance.theme,
      lightSource: appearance['light-source'], lightIntensity: appearance['light-intensity'] / 100 });
  }
  function inlineSampleIcons(sample) {
    for (const icon of sample.querySelectorAll('ml-icon')) {
      const svg = iconForAppearance(icon.getAttribute('name'), {
        size: icon.getAttribute('size'), weight: icon.getAttribute('weight'), label: icon.getAttribute('label'),
      });
      if (icon.closest('ml-menu-panel')) svg.classList.add('ml-menu-icon');
      icon.replaceWith(svg);
    }
  }
  function codeForSelection() {
    if (Object.hasOwn(foundations.titles, component)) return foundations.code();
    if (component === 'icons') {
      const icon = document.createElement('ml-icon');
      for (const [key, value] of Object.entries(iconState)) icon.setAttribute(key, value);
      icon.setAttribute('label', document.querySelector('#icon-title').textContent);
      return [scriptTag('icons'), '', '<div data-ml-theme="' + appearance.theme +
        '" data-ml-material="' + appearance.material + '" data-ml-motion="' + appearance.motion + '" ' + lightAttributes() + '>',
        '  ' + icon.outerHTML, '</div>'].join('\n');
    }
    if (component === 'colors') {
      const color = document.querySelector('#palette-variable').textContent;
      const name = document.querySelector('#palette-name').textContent;
      return [stylesheet('colors'), '', '<style>',
        '  .color-chip { display: inline-block; width: 2.5rem; height: 2.5rem; border-radius: .65rem;',
        '    background-color: ' + color + '; border: 1px solid var(--ml-color-separator); }', '</style>', '',
        '<figure data-ml-theme="' + appearance.theme + '" style="color: var(--ml-color-text); background: var(--ml-color-surface); padding: 1rem;">',
        '  <span class="color-chip" aria-hidden="true"></span>', '  <figcaption>' + name + '</figcaption>', '</figure>'].join('\n');
    }
    const head = [...bundleTags(component), ''];
    const lines = ['<div data-ml-theme="' + appearance.theme + '"', '     data-ml-material="' + appearance.material + '"',
      '     data-ml-motion="' + appearance.motion + '" ' + lightAttributes() + '>'];
    if (component === 'materials') {
      const surface = materialSurfaces.querySelector('input:checked').value === 'content' ? ' surface="content"' : '';
      return head.concat(lines, '  <ml-material' + surface + '>表面样本</ml-material>', '</div>').join('\n');
    }
    if (currentPreview) return currentPreview.code(head, lines);
    if (navigation.types.includes(component)) return navigation.code(component, head, lines, iconForAppearance);
    if (recordTypes.includes(component)) {
      const tableMode = component === 'data-table';
      const sample = tableMode ? recordSource.cloneNode(true) : document.createElement('ml-pagination');
      if (tableMode) {
        head.unshift(...bundleTags('empty-state'));
        for (const attr of ['density', 'selectable', 'sort-by', 'sort-direction']) {
          if (recordTable.hasAttribute(attr)) sample.setAttribute(attr, recordTable.getAttribute(attr));
        }
        const keys = new Set(recordTable.selectedRows.map(row => row.dataset.key));
        for (const row of sample.querySelector('tbody').rows) row.toggleAttribute('data-selected', keys.has(row.dataset.key));
        if (emptyRecords[component]) sample.querySelector('tbody').replaceChildren();
      }
      const pager = tableMode ? sample.querySelector('ml-pagination') : sample;
      const live = tableMode ? recordTable.querySelector('ml-pagination') : recordPager;
      for (const attr of ['page', 'page-size', 'page-sizes', 'label', 'compact', 'jump']) {
        if (live.hasAttribute(attr)) pager.setAttribute(attr, live.getAttribute(attr));
      }
      if (!tableMode) pager.setAttribute('total', live.total);
      const html = sample.outerHTML.replace(/\n {14}/g, '\n').split('\n').map(line => '  ' + line);
      return head.concat(lines, html, '</div>').join('\n');
    }
    if (Object.hasOwn(valueTypes, component)) {
      const demo = valueDemos.get(component), sample = demo.sources[demo.index].cloneNode(true);
      const live = demo.hosts[demo.index].querySelectorAll('input');
      [...sample.querySelectorAll('input')].forEach((input, index) => {
        input.setAttribute('value', live[index].value);
        input.toggleAttribute('disabled', live[index].disabled);
      });
      const html = sample.outerHTML.replace(/\n {14}/g, '\n').split('\n').map(line => '  ' + line);
      return head.concat(lines, html, '</div>').join('\n');
    }
    if (component === 'tag') return head.concat(lines, tagExampleCode()).join('\n');
    if (component === 'menu') {
      const active = activeMenuSample(), kind = active.dataset.menuDemo;
      const sample = menuTemplates.querySelector('[data-menu-demo="' + kind + '"]').cloneNode(true);
      sample.removeAttribute('data-menu-demo');
      sample.id = 'menu-example';
      sample.querySelector('ml-menu').toggleAttribute('icon-only', active.querySelector('ml-menu').hasAttribute('icon-only'));
      for (const field of sample.querySelectorAll('[aria-checked]')) {
        const live = active.querySelector('[data-action="' + field.dataset.action + '"]');
        field.setAttribute('aria-checked', live.getAttribute('aria-checked'));
      }
      for (const selector of ['[data-record-removed]', '[data-record-details]']) {
        if (sample.querySelector(selector)) sample.querySelector(selector).hidden = active.querySelector(selector).hidden;
      }
      inlineSampleIcons(sample);
      const layout = document.querySelector('#menu-demo-style').textContent.trimEnd();
      return head.concat('<style>' + layout + '\n</style>', '', lines, '  ' + sample.outerHTML, '</div>', '',
        '<script>', '(' + menuBindings[kind].toString() + ')(document.getElementById("menu-example"));', '</script>').join('\n');
    }
    if (component === 'list') {
      const active = activeList();
      const grouped = active === listSections;
      const source = grouped ? listTemplate.firstElementChild : listTemplate.querySelector('[data-list-row="' + active.dataset.listRow + '"]');
      const example = source.cloneNode(true);
      example.removeAttribute('data-list-row');
      for (const row of example.querySelectorAll('[data-list-row]')) row.removeAttribute('data-list-row');
      for (const surface of grouped ? example.children : [example]) {
        if (listDensity.querySelector(':checked').value === 'compact') surface.setAttribute('density', 'compact');
      }
      const disclosures = active.querySelectorAll('details');
      example.querySelectorAll('details').forEach((entry, index) => { entry.open = disclosures[index].open; });
      inlineSampleIcons(example);
      lines.push('  ' + example.outerHTML);
      if (example.querySelector('a[href="#list-record"]')) {
        const destination = document.createElement('section');
        destination.id = 'list-record';
        destination.tabIndex = -1;
        destination.append(listRecord.querySelector('h3').cloneNode(true), listRecord.querySelector('p').cloneNode(true));
        lines.push('  ' + destination.outerHTML);
      }
      return head.concat(lines, '</div>').join('\n');
    }
    if (component === 'choice') {
      const active = activeChoice();
      const example = choiceTemplates.content.querySelector('[data-choice-demo="' + active.dataset.choiceDemo + '"]').cloneNode(true);
      example.removeAttribute('data-choice-demo');
      if (active.getAttribute('layout') === 'inline') example.setAttribute('layout', 'inline');
      example.querySelector('fieldset').disabled = active.querySelector('fieldset').disabled;
      const fields = active.querySelectorAll('input');
      example.querySelectorAll('input').forEach((field, index) => field.toggleAttribute('checked', fields[index].checked));
      return head.concat(lines, '  ' + example.outerHTML, '</div>').join('\n');
    }
    if (component === 'input') {
      const example = inputTemplates.content.querySelector('[data-input-demo="' + activeInput.dataset.inputDemo + '"]').cloneNode(true);
      example.removeAttribute('data-input-demo');
      const field = example.querySelector('input, textarea');
      field.readOnly = activeInput.control.readOnly;
      field.disabled = activeInput.control.disabled;
      // HTML consumes the first newline after the opening textarea tag.
      if (field.localName === 'textarea') field.textContent = '\n' + activeInput.value;
      else if (field.type !== 'password' && (activeInput.value || field.hasAttribute('value'))) field.setAttribute('value', activeInput.value);
      return head.concat(lines, '  ' + example.outerHTML, '</div>').join('\n');
    }
    if (component === 'island') {
      const dir = heroIsland.direction;
      const place = { left: 'center end', right: 'center start', up: 'end center', down: 'start center' }[dir];
      const custom = heroIsland.style.getPropertyValue('--ml-island-fill');
      const colorStyle = custom ? ' style="--ml-island-fill: ' + custom + '; --ml-island-ink: ' + paletteForeground(custom).color + '"' : '';
      lines[2] = '     data-ml-motion="' + appearance.motion + '" data-ml-island-bounds';
      lines.push('     ' + lightAttributes(' display: grid; place-items: ' + place + '; min-height: 15rem; padding: .75rem;') + '>',
        '  <ml-island direction="' + dir + '" tone="' + heroIsland.getAttribute('tone') + '"' +
          (heroIsland.open ? ' open' : '') + colorStyle + '>',
        '    <button type="button">', '      <span class="ml-island-mark" aria-hidden="true">' + iconForAppearance('archive').outerHTML + '</span>',
        '      图像归档 <span class="ml-island-value">68%</span>', '    </button>', '    <div class="ml-island-panel">',
        ...islandTemplate().innerHTML.trim().split('\n').map(line => '      ' + line.trim()),
        '    </div>', '  </ml-island>', '</div>');
      return head.concat(lines).join('\n');
    }
    if (component === 'feedback') {
      const tone = feedbackTone[feedbackKind];
      const sample = feedbackSamples[tone];
      if (feedbackKind === 'toast') {
        lines.push('  <button type="button" id="show-toast">显示轻提示</button>',
          '  <ml-toast id="messages"></ml-toast>', '</div>', '', '<script>',
          '  document.getElementById("show-toast").addEventListener("click", event => {',
          '    document.getElementById("messages").show(' + JSON.stringify(sample.toast) + ', {',
          '      tone: "' + tone + '", trigger: event.currentTarget', '    });', '  });', '</script>');
      } else {
        lines.push('  <button type="button" id="show-banner">显示消息横幅</button>',
          '  <ml-banner id="notice" tone="' + tone + '" dismissible>',
          '    <div class="ml-banner-content">', '      <strong>' + sample.title + '</strong>',
          '      <p>' + sample.detail + '</p>', '    </div>');
        if (sample.action) lines.push('    <button class="ml-banner-action" type="button">' + sample.action + '</button>');
        lines.push('  </ml-banner>', '</div>', '', '<script>', '  const notice = document.getElementById("notice");',
          '  const trigger = document.getElementById("show-banner");',
          '  trigger.addEventListener("click", () => notice.show(trigger));');
        if (sample.action) lines.push('  notice.querySelector(".ml-banner-action").addEventListener("click", event => {',
          '    notice.setAttribute("tone", "success");',
          '    notice.querySelector("strong").textContent = "同步完成";', '    notice.querySelector("p").textContent = "示例记录已同步。";',
          '    if (document.activeElement === event.currentTarget) trigger.focus();', '    event.currentTarget.hidden = true;', '  });');
        lines.push('</script>');
      }
      return head.concat(lines).join('\n');
    }
    if (component === 'progress') {
      const state = heroProgress.getAttribute('state');
      lines.push('  <ml-progress' + (state ? ' state="' + state + '"' : '') + '>',
        '    ' + heroProgress.progress.outerHTML, '  </ml-progress>', '</div>');
      return head.concat(lines).join('\n');
    }
    if (component === 'info') {
      const copy = makeInfo(infoKind);
      inlineSampleIcons(copy);
      if (infoKind === 'metric') setReviewProgress(copy);
      if (infoKind === 'card') copy.querySelector('details').open = infoSpecimen.querySelector('details').open;
      const markup = copy.outerHTML.replace(/\n {4}/g, '\n').split('\n').map(line => '  ' + line);
      return head.concat(lines, markup, '</div>').join('\n');
    }
    if (component === 'badge') {
      const kind = badgeDemo.kind;
      const specimen = badgeSpecimens.querySelector('[data-badge-view="' + kind + '"] [data-badge-live]');
      const copy = document.createElement('ml-badge');
      for (const attr of ['kind', 'state', 'tone', 'label', 'value', 'max', 'dot']) {
        if (specimen.hasAttribute(attr)) copy.setAttribute(attr, specimen.getAttribute(attr));
      }
      if (kind === 'notification') {
        lines.push('  <button type="button" class="ml-badge-anchor ml-badge-icon" id="sample-inbox">',
          '    <span class="ml-badge-sr">通知中心，标记全部已读</span>',
          '    ' + iconForAppearance('bell').outerHTML,
          '    ' + copy.outerHTML, '  </button>', '</div>', '', '<script>',
          '  const inbox = document.getElementById("sample-inbox");',
          '  inbox.addEventListener("click", () => inbox.querySelector("ml-badge").setAttribute("value", "0"));', '</script>');
      } else {
        if (kind === 'count') copy.label = '待复核记录';
        lines.push('  ' + copy.outerHTML, '</div>');
      }
      return head.concat(lines).join('\n');
    }
    if (component === 'hover-card') {
      const card = makeHover(hoverKind);
      inlineSampleIcons(card);
      card.id = 'sample-hover';
      lines.push(...card.outerHTML.replace(/\n {4}/g, '\n').split('\n').map(line => '  ' + line), '</div>');
      if (hoverKind === 'record') lines.push('', '<script>',
        '  const save = document.querySelector("#sample-hover .ml-hover-action");',
        '  save.addEventListener("click", () => {',
        '    save.setAttribute("aria-pressed", String(save.getAttribute("aria-pressed") !== "true"));',
        '  });', '</script>');
      return head.concat(lines).join('\n');
    }
    if (component === 'select') {
      const sample = selectSamples[selectKind];
      const copy = sample.cloneNode(true);
      copy.id = 'sample-select';
      copy.disabled = heroSelect.disabled;
      for (const attr of ['aria-controls', 'aria-expanded', 'aria-activedescendant']) copy.removeAttribute(attr);
      for (const option of copy.options) {
        option.toggleAttribute('selected', option.index === sample.selectedIndex);
        option.removeAttribute('data-format');
      }
      const field = selectKind === 'search' ? '<ml-select searchable search-label="搜索名称或编号">' : '<ml-select>';
      lines.push('  <div class="ml-select-field">', '    <label for="sample-select">' + sample.labels[0].textContent + '</label>', '    ' + field);
      const markup = copy.outerHTML.split('\n');
      const indent = markup.at(-1).match(/^\s*/)[0].length;
      lines.push(...markup.map((line, index) => '      ' + (index ? line.slice(indent) : line)));
      return head.concat(lines, '    </ml-select>', '  </div>', '</div>').join('\n');
    }
    if (component === 'dialog') {
      const kind = dialogDemo.kind;
      const sample = makeDialog(kind, 'sample-dialog');
      inlineSampleIcons(sample);
      for (const fact of sample.querySelectorAll('[data-fact]')) fact.removeAttribute('data-fact');
      const markup = sample.outerHTML.replace(/\n {4}/g, '\n').split('\n').map(line => '    ' + line);
      lines.push('  <ml-button><button type="button" id="open-sample" aria-haspopup="dialog">打开弹窗</button></ml-button>',
        '  <ml-dialog id="sample-dialog"' + (kind === 'info' ? ' dismiss-on-backdrop' : '') + '>',
        ...markup, '  </ml-dialog>', '</div>', '', '<script>', '  const sample = document.getElementById("sample-dialog");');
      if (kind === 'form') lines.push('  const field = sample.querySelector("input");');
      lines.push('  document.getElementById("open-sample").addEventListener("click", event => {');
      if (kind === 'form') lines.push('    field.value = field.defaultValue;');
      lines.push('    sample.showModal(event.currentTarget);', '  });');
      if (kind === 'form') {
        lines.push('  sample.querySelector("dialog").addEventListener("close", event => {',
          '    if (event.target.returnValue === "save") field.defaultValue = field.value.trim();', '  });');
      } else if (kind === 'confirm') {
        lines.push('  sample.querySelector("dialog").addEventListener("close", event => {',
          '    if (event.target.returnValue !== "restore") return;',
          '    const scope = sample.parentElement;',
          '    Object.assign(scope.dataset, { mlTheme: "light", mlMaterial: "high", mlMotion: "high", mlLightSource: "pointer" });',
          '    scope.style.setProperty("--ml-material-transparency", "60%");',
          '    scope.style.setProperty("--ml-light-intensity", "1");', '    scope.style.setProperty("--ml-glass-density", "1");', '  });');
      }
      return head.concat(lines, '</script>').join('\n');
    } else if (component === 'button') {
      const busy = buttonDemo.state === 'busy';
      const state = busy ? ' disabled aria-busy="true"' : buttonDemo.state === 'disabled' ? ' disabled' : '';
      lines.push('  <ml-button variant="' + buttonDemo.variant + '">', '    <button type="button"' + state + '>');
      if (!busy) lines.push('      ' + iconForAppearance(buttonDemo.variant === 'danger' ? 'trash' : 'plus').outerHTML);
      lines.push('      ' + buttonLabel(), '    </button>', '  </ml-button>');
    } else if (demo.usage === 'toggle') {
      lines.push('  <ml-switch label="快捷键提示"' + (demo.hints ? ' checked' : '') + '></ml-switch>');
    } else if (demo.usage === 'mode') {
      lines.push('  <ml-switch kind="mode" label="预览尺寸" value="' + demo.size + '">',
        '    <button type="button" value="actual">原寸</button>',
        '    <button type="button" value="detail">放大</button>', '  </ml-switch>');
    } else {
      lines.push('  <ml-switch kind="page" label="示例页面" value="' + demo.page + '">');
      for (const [value, page] of Object.entries(pages)) {
        lines.push('    <a href="#page-' + value + '" data-value="' + value + '">' + page.label + '</a>');
      }
      lines.push('  </ml-switch>');
    }
    return head.concat(lines, '</div>').join('\n');
  }
  document.querySelector('#open-code').addEventListener('click', () => {
    document.querySelector('#code-title').textContent = '示例代码';
    codeSample.textContent = codeForSelection();
    copyStatus.textContent = '';
    codeDialog.showModal();
  });
  document.querySelector('#close-code').addEventListener('click', () => codeDialog.close());
  function selectContents(element) {
    const range = document.createRange();
    range.selectNodeContents(element);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  }
  async function copyContents(element) {
    const value = element.textContent;
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      if (!element.isConnected || element.textContent !== value) return false;
      selectContents(element);
      try { return document.execCommand('copy'); } catch { return false; }
    }
  }
  document.querySelector('#copy-code').addEventListener('click', async () => {
    copyStatus.textContent = await copyContents(codeSample) ? '已复制' : '代码已选中，可手动复制';
  });

  const nameInput = document.querySelector('#sample-name');
  nameInput.addEventListener('input', () => nameInput.setCustomValidity(''));
  document.querySelector('#name-form').addEventListener('submit', event => {
    event.preventDefault();
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.setCustomValidity('请输入样本名称');
      nameInput.reportValidity();
      return;
    }
    document.querySelector('#name-status').textContent = '本页样本名已保存为「' + name + '」。';
  });
  const run = document.querySelector('#run-example');
  run.addEventListener('click', () => {
    run.disabled = true;
    run.setAttribute('aria-busy', 'true');
    run.querySelector('span').textContent = '处理中';
    document.querySelector('#task-status').textContent = '示例任务正在运行。';
    setTimeout(() => {
      run.disabled = false;
      run.removeAttribute('aria-busy');
      run.querySelector('span').textContent = '运行示例';
      document.querySelector('#task-status').textContent = '示例任务已完成，可以再次运行。';
    }, 1100);
  });
  document.querySelector('#copy-color').addEventListener('click', async () => {
    const hex = sampleColor.textContent;
    const copied = await copyContents(sampleColor);
    if (sampleColor.textContent === hex) sampleColorStatus.textContent = copied ? '已复制 ' + hex + '。' : '色值已选中，可手动复制。';
  });

  const stageDialog = document.createElement('dialog');
  stageDialog.className = 'stage-dialog';
  stageDialog.setAttribute('aria-label', '放大预览');
  document.body.append(stageDialog);
  const expand = document.querySelector('#expand-stage');
  const place = document.createComment('preview stage');
  stage.before(place);
  listSpecimen.addEventListener('click', event => {
    if (stageDialog.open && !event.defaultPrevented && event.button === 0 &&
        !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey &&
        event.target.closest('a[href="#list-record"]')) closeStage('list-record');
  });

  function expanded(value) {
    expand.setAttribute('aria-pressed', String(value));
    expand.setAttribute('aria-label', value ? '收起预览' : '放大预览');
    expand.closest('ml-tooltip').setAttribute('text', value ? '返回组件与外观设置' : '在更大的画布中查看当前组件');
    expand.querySelector('use').setAttribute('href', value ? '#i-collapse' : '#i-expand');
  }
  expand.addEventListener('click', () => {
    if (stageDialog.open) {
      closeStage();
    } else {
      stageDialog.append(stage);
      expanded(true);
      stageDialog.returnValue = '';
      stageDialog.showModal();
      expand.focus();
      if (component === 'hover-card') showHover(true);
      if (component === 'feedback' && feedbackKind === 'toast' && feedbackRestore.hidden) showFeedback();
    }
  });
  function closeStage(value = '') {
    stageDialog.close(value);
    restoreStage();
  }
  function restoreStage() {
    if (stageDialog.open || stage.parentElement !== stageDialog) return;
    place.after(stage);
    expanded(false);
    if (stageDialog.returnValue === 'navigate') return;
    if (component === 'feedback' && feedbackKind === 'toast' && feedbackRestore.hidden) showFeedback();
    if (stageDialog.returnValue === 'list-record') focusListRecord();
    else expand.focus({ preventScroll: true });
  }
  stageDialog.addEventListener('close', restoreStage);
  for (const dialog of [codeDialog, stageDialog]) {
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) {
        if (dialog === stageDialog) closeStage();
        else dialog.close();
      }
    });
  }
  window.addEventListener('hashchange', readRoute);
  window.addEventListener('pageshow', readRoute);
  readRoute();
})();
