import { mkdir, readFile, writeFile } from 'node:fs/promises';

// Every public pair works from file:// on its own and uses one glass scene per document.
// Components with bundled actions include the library's buttons.
const here = name => new URL(name, import.meta.url);
const designDir = 'dist/design/';
async function writeChanged(name, content) {
  const target = here(name);
  let previous;
  try { previous = await readFile(target, 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (previous === content) return;
  await mkdir(new URL('.', target), { recursive: true });
  await writeFile(target, content);
}
const components = {
  materials: ['materials'], motion: ['materials', 'motion'],
  switch: ['switch'], button: ['button'], dialog: ['button', 'dialog'], tag: ['tag'],
  select: ['select'], 'multi-select': ['multi-select'], 'hover-card': ['hover-card'], tooltip: ['tooltip'], badge: ['tag', 'badge'], info: ['hover-card', 'info'],
  'file-upload': ['button', 'progress', 'file-upload'],
  form: ['button', 'form'],
  'media-viewer': ['media-viewer'],
  progress: ['progress'], loading: ['materials', 'loading'], feedback: ['feedback'], island: ['island'], input: ['input'], choice: ['choice'],
  list: ['list'], accordion: ['accordion'], menu: ['menu'], 'empty-state': ['button', 'empty-state'],
  slider: ['value-controls', 'slider'], stepper: ['value-controls', 'stepper'],
  'date-range': ['value-controls', 'calendar', 'date-range'],
  'date-picker': ['value-controls', 'calendar', 'picker-field', 'date-picker'],
  'time-picker': ['value-controls', 'picker-field', 'time-picker'],
  pagination: ['pagination'], 'data-table': ['pagination', 'data-table'],
  toolbar: ['toolbar'], sidebar: ['sidebar'], tabs: ['tabs'], breadcrumb: ['breadcrumb'], steps: ['steps'], tree: ['tree'], drawer: ['button', 'dialog', 'drawer'],
};
const iconSheet = (await readFile(here('src/icons.svg'), 'utf8')).trim();
// Embed only the glyphs used by each standalone stylesheet.
const maskIcons = {
  tag: ['tag', 'info', 'check-circle', 'clock', 'warning', 'plus', 'check', 'close'],
  select: ['chevron-down', 'check', 'search'],
  'multi-select': ['close'],
  'file-upload': ['upload', 'file', 'image', 'close'],
  form: ['error-circle'],
  'media-viewer': ['chevron-left', 'chevron-right', 'expand', 'close', 'zoom', 'zoom-out', 'play'],
  feedback: ['info', 'check-circle', 'warning', 'error-circle', 'close'],
  input: ['search', 'close', 'eye', 'eye-off', 'error-circle'],
  choice: ['check'],
  list: ['chevron-down'],
  accordion: ['chevron-down'],
  'empty-state': ['archive', 'search', 'error-circle', 'lock'],
  menu: ['check', 'chevron-down', 'more'],
  calendar: ['calendar', 'chevron-left', 'chevron-right'],
  'time-picker': ['clock'],
  pagination: ['chevron-left', 'chevron-right', 'chevron-down'],
  'data-table': ['sort', 'chevron-up'],
  sidebar: ['sidebar', 'chevron-down'],
  breadcrumb: ['chevron-right', 'home', 'more'],
  steps: ['check', 'warning'],
  tree: ['chevron-right', 'folder', 'file', 'image'],
  drawer: ['close'],
};
function iconMasks(component) {
  return maskIcons[component].map(name => {
    const symbol = iconSheet.match(new RegExp('<symbol id="i-' + name + '"[^>]*>([\\s\\S]*?)</symbol>'));
    if (!symbol) throw new Error('Missing ' + component + ' icon ' + name);
    const strokes = symbol[1].replace(/<[^>]+ data-ml-glass-face="".*?\/>/g, '')
      .replace(/ fill="var\(--ml-icon-(?:pane|lens|alloy), none\)"/g, '');
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + strokes + '</svg>';
    return '  --ml-' + component + '-icon-' + name + ': url("data:image/svg+xml,' + encodeURIComponent(svg) + '");';
  }).join('\n');
}
function motionForBundle(css, parts) {
  return css.split(/(?=^\/\* @component )/m).filter(section => {
    const name = section.match(/^\/\* @component ([\w-]+) \*\//)?.[1];
    return !name || name === 'shared' || parts.includes(name);
  }).join('');
}
const tokenSources = ['src/colors.css', 'src/themes.css', 'src/type-tokens.css', 'src/layout-tokens.css', 'src/material-tiers.css', 'src/motion-tiers.css'];
const foundations = [...tokenSources, 'src/typography.css'];
const resourceSheets = {
  'colors.css': ['src/colors.css'],
  'global.css': [...foundations, 'src/global.css'],
  'typography.css': ['src/type-tokens.css', 'src/typography.css'],
  'tokens.css': tokenSources,
  'themes.css': ['src/colors.css', 'src/themes.css'],
};
for (const [file, sources] of Object.entries(resourceSheets)) {
  const css = await Promise.all(sources.map(async source => {
    const text = await readFile(here(source), 'utf8');
    return (source === 'src/motion-tiers.css' ? motionForBundle(text, []) : text).trimEnd();
  }));
  await writeChanged(designDir + file, '/* Generated from ' + sources.join(', ') + ' by build.mjs. */\n' + css.join('\n\n') + '\n');
}
for (const ext of ['css', 'js']) {
  const sharedSources = ext === 'css' ? [...foundations, 'src/appearance.css'] : ['src/glass-shader.js', 'src/glass.js'];
  const common = await Promise.all(sharedSources.map(source => readFile(here(source), 'utf8')));
  for (const [name, parts] of Object.entries(components)) {
    const directory = ['materials', 'motion'].includes(name) ? designDir : 'dist/components/' + name + '/';
    const file = directory + name + '.' + ext;
    const bundled = ext === 'css' && name === 'multi-select' ? ['select', ...parts] : parts;
    const sources = bundled.map(part => 'src/' + part + '.' + ext);
    const navigation = parts.some(part => ['toolbar', 'sidebar', 'tabs', 'tree'].includes(part));
    const picker = ['select', 'multi-select', 'breadcrumb'].includes(name);
    if (navigation) sources.unshift('src/navigation.' + ext);
    if (ext === 'css' && parts.includes('pagination')) sources.unshift('src/table-controls.css');
    if (ext === 'js' && picker) sources.unshift('src/select-picker.js');
    if (ext === 'js' && (navigation || picker || parts.some(part => ['materials', 'button', 'tag', 'info', 'progress', 'feedback', 'island', 'input', 'choice', 'list', 'accordion', 'menu', 'value-controls', 'pagination', 'steps', 'media-viewer'].includes(part)))) sources.unshift('src/control-glass.js');
    const sections = await Promise.all(sources.map(source => readFile(here(source), 'utf8')));
    if (ext === 'css') {
      for (const part of bundled.filter(part => maskIcons[part])) {
        const index = sources.indexOf('src/' + part + '.css');
        sections[index] = sections[index].replace('  /* Icon masks from icons.svg */', () => iconMasks(part));
      }
    }
    const inputs = [...sharedSources, ...sources];
    const shared = common.map((source, i) => sharedSources[i] === 'src/motion-tiers.css' ? motionForBundle(source, bundled) : source);
    const header = '/* Generated from ' + inputs.join(' and ') + ' by build.mjs. */\n';
    await writeChanged(file, header + [...shared, ...sections].map(section => section.trimEnd()).join('\n\n') + '\n');
  }
}

// Keep the gallery's local <use> references and the standalone script in sync with the SVG sheet.
const iconSources = ['src/glass-shader.js', 'src/glass.js', 'src/icons.js', 'src/icon-motion.js', 'src/icon-material.js'];
const [shader, scene, iconRuntime, iconMotion, iconMaterial] = await Promise.all(iconSources.map(file => readFile(here(file), 'utf8')));
// Keep the embedded Chinese catalog UTF-8 when the host page uses a legacy encoding.
await writeChanged(designDir + 'icons.svg', iconSheet + '\n');
await writeChanged(designDir + 'icons.js', '\uFEFF/* Generated from src/icons.svg and ' + iconSources.join(', ') + ' by build.mjs. */\n' + shader.trimEnd() + '\n\n' + scene.trimEnd() + '\n\n' +
  iconRuntime.replace("/* ICON_SHEET */ ''", () => JSON.stringify(iconSheet))
    .replace('  /* ICON_MOTION */', () => iconMotion.trimEnd().replace(/^.+/gm, line => '  ' + line))
    .replace('  /* ICON_MATERIAL */', () => iconMaterial.trimEnd().replace(/^.+/gm, line => '  ' + line)));

const gallery = await readFile(here('index.html'), 'utf8');
const sprite = /<svg class="icon-defs"[^>]*>[\s\S]*?<\/svg>/;
if (!sprite.test(gallery)) throw new Error('Gallery icon sheet is missing');
const gallerySheet = iconSheet.replace('<svg ', '<svg class="icon-defs" aria-hidden="true" focusable="false" ');
const newline = gallery.includes('\r\n') ? '\r\n' : '\n';
await writeChanged('index.html', gallery.replace(sprite, () => gallerySheet.replace(/\r?\n/g, newline + '  ')));
