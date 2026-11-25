import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

// Every public pair works from file:// on its own and uses one glass scene per document.
// Components with bundled actions include the library's buttons.
const here = name => new URL(name, import.meta.url);
const designDir = 'dist/design/';
const motionSection = /(?=^\/\* @component )/m;
const bundleSections = new Map();
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
  switch: ['switch'], button: ['button'], dialog: ['button', 'dialog'], tag: ['tag'],
  select: ['select'], 'multi-select': ['multi-select'], 'file-upload': ['button', 'progress', 'file-upload'], form: ['button', 'form'],
  'hover-card': ['hover-card'], tooltip: ['tooltip'], badge: ['tag', 'badge'], info: ['hover-card', 'info'],
  progress: ['progress'], loading: ['materials', 'loading'], feedback: ['feedback'], island: ['island'], input: ['input'],
  slider: ['value-controls', 'slider'], stepper: ['value-controls', 'stepper'],
  'date-range': ['value-controls', 'calendar', 'date-range'],
  'date-picker': ['value-controls', 'calendar', 'picker-field', 'date-picker'],
  'time-picker': ['value-controls', 'picker-field', 'time-picker'],
  choice: ['choice'], list: ['list'], accordion: ['accordion'], 'empty-state': ['button', 'empty-state'],
  pagination: ['pagination'], 'data-table': ['pagination', 'data-table'],
  toolbar: ['toolbar'], sidebar: ['sidebar'], 'navigation-panel': ['dialog', 'catalog'], tabs: ['tabs'], breadcrumb: ['breadcrumb'], steps: ['steps'], tree: ['tree'],
  'media-viewer': ['media-viewer'], drawer: ['button', 'dialog', 'drawer'], menu: ['menu'],
  materials: ['materials'], motion: ['materials', 'motion'],
};
function bundlePath(name, ext) {
  const directory = ['global', 'materials', 'motion', 'icons'].includes(name) ? designDir : 'dist/components/' + name + '/';
  return directory + name + '.' + ext;
}
const { values: options } = parseArgs({ options: {
  components: { type: 'string' }, name: { type: 'string' }, 'out-dir': { type: 'string' },
} });
const selection = options.components === undefined ? null :
  [...new Set(options.components.split(',').map(name => name.trim()).map(name => name === 'catalog' ? 'navigation-panel' : name))];
const bundleName = options.name ?? 'nacreon';
if (!selection && (options.name !== undefined || options['out-dir'] !== undefined)) {
  throw new Error('--name and --out-dir require --components');
}
if (selection) {
  for (const name of selection) if (!Object.hasOwn(components, name)) {
    throw new Error('Unknown component "' + name + '". Available: ' + Object.keys(components).join(', '));
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(bundleName)) throw new Error('--name must use lowercase letters, digits or hyphens');
}
const iconSheet = (await readFile(here('src/icons.svg'), 'utf8')).trim();
const smallIconStroke = iconSheet.match(/^<svg\b[^>]*\bdata-small-stroke="([\d.]+)"/)?.[1];
if (!(Number(smallIconStroke) > 0)) throw new Error('Icon sheet requires a positive small-size stroke width');
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
  catalog: [
    'aperture', 'archive', 'arrow-right', 'bell', 'calendar', 'check', 'check-circle', 'chevron-down', 'chevron-right', 'clock', 'close', 'drop', 'edit', 'folder',
    'form', 'gauge', 'grid', 'help-circle', 'image', 'info', 'keyboard', 'layers', 'link', 'list', 'menu', 'modal', 'mode', 'more',
    'page', 'play', 'plus', 'ruler', 'search', 'sidebar', 'signal', 'sliders', 'sun', 'tag', 'timer', 'toggle', 'upload',
  ],
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
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="' + smallIconStroke + '" stroke-linecap="round" stroke-linejoin="round">' + strokes + '</svg>';
    return '  --ml-' + component + '-icon-' + name + ': url("data:image/svg+xml,' + encodeURIComponent(svg) + '");';
  }).join('\n');
}
function motionForBundle(css, parts) {
  return css.split(motionSection).filter(section => {
    const name = section.match(/^\/\* @component ([\w-]+) \*\//)?.[1];
    return !name || name === 'shared' || parts.includes(name);
  }).join('');
}
function markTransitions(css) {
  return css.replace(/(?<![\w-])transition(?:-property)?:\s*([^;{}]+)/g, (declaration, value) => {
    // Component shorthands name the property first. Ignore commas inside easing
    // functions and strip the shared static-mode fallback around the whole list.
    const list = value.trim().replace(/^var\(--ml-static-transition,\s*([\s\S]+)\)$/, '$1');
    const properties = [];
    let start = 0, depth = 0;
    for (let i = 0; i <= list.length; i++) {
      if (list[i] === '(') depth++;
      if (list[i] === ')') depth--;
      if (i === list.length || (!depth && list[i] === ',')) {
        properties.push(list.slice(start, i).trim().split(/\s+/)[0]);
        start = i + 1;
      }
    }
    return '--ml-native-transition: ' + properties.join(' ') + '; ' + declaration;
  });
}
async function writeBundle(file, sources, sections, separator) {
  const header = '/* Generated from ' + sources.join(separator) + ' by build.mjs. */\n';
  const bodies = sections.map(section => section.trimEnd());
  if (!selection) await writeChanged(file, header + bodies.join('\n\n') + '\n');
  bundleSections.set(file, bodies.flatMap((section, i) =>
    sources[i] === 'src/motion-tiers.css' ? section.split(motionSection).map(block => block.trimEnd()) : [section]));
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
for (const [file, sources] of Object.entries(selection ? {} : resourceSheets)) {
  const css = await Promise.all(sources.map(async source => {
    const text = await readFile(here(source), 'utf8');
    return (source === 'src/motion-tiers.css' ? motionForBundle(text, []) : text).trimEnd();
  }));
  await writeBundle(designDir + file, sources, css, ', ');
}
for (const ext of ['css', 'js']) {
  const sharedSources = ext === 'css' ? [...foundations, 'src/appearance.css'] : ['src/motion-frames.js', 'src/glass-shader.js', 'src/glass.js'];
  const common = await Promise.all(sharedSources.map(source => readFile(here(source), 'utf8')));
  for (const [name, parts] of Object.entries(components)) {
    if (selection && !selection.includes(name)) continue;
    const file = bundlePath(name, ext);
    const bundled = ext === 'css' && name === 'multi-select' ? ['select', ...parts] : parts;
    const sources = bundled.map(part => 'src/' + part + '.' + ext);
    const navigation = parts.some(part => ['toolbar', 'sidebar', 'tabs', 'tree'].includes(part));
    const picker = ['select', 'multi-select', 'breadcrumb'].includes(name);
    if (navigation) sources.unshift('src/navigation.' + ext);
    if (ext === 'css' && parts.includes('pagination')) sources.unshift('src/table-controls.css');
    if (ext === 'js' && picker) sources.unshift('src/select-picker.js');
    if (ext === 'js' && (navigation || picker || parts.some(part => ['materials', 'button', 'tag', 'info', 'progress', 'feedback', 'island', 'input', 'choice', 'list', 'accordion', 'catalog', 'menu', 'value-controls', 'pagination', 'steps', 'media-viewer'].includes(part)))) sources.unshift('src/control-glass.js');
    const sections = await Promise.all(sources.map(source => readFile(here(source), 'utf8')));
    if (ext === 'css') {
      // Mark only component rules that declare their own CSS transitions. The marker
      // is non-inherited so authored animations elsewhere in a consuming page keep their timing.
      for (let i = 0; i < sections.length; i++) sections[i] = markTransitions(sections[i]);
      for (const part of bundled.filter(part => maskIcons[part])) {
        const index = sources.indexOf('src/' + part + '.css');
        sections[index] = sections[index].replace('  /* Icon masks from icons.svg */', () => iconMasks(part));
      }
    }
    const inputs = [...sharedSources, ...sources];
    const shared = common.map((source, i) => sharedSources[i] === 'src/motion-tiers.css' ? motionForBundle(source, bundled) : source);
    const output = [...shared, ...sections];
    await writeBundle(file, inputs, output, ' and ');
    // Keep the original standalone URLs usable offline after the public rename.
    if (!selection && name === 'navigation-panel') await writeBundle(bundlePath('catalog', ext), inputs, output, ' and ');
  }
}

// Use the first execution position for scripts and the last cascade position for styles.
function combinedSections(names, ext) {
  const sections = names.flatMap(name => bundleSections.get(bundlePath(name, ext)));
  return ext === 'css' ? [...new Set(sections.toReversed())].reverse() : [...new Set(sections)];
}

if (selection) {
  for (const ext of ['css', 'js']) {
    const file = bundleName + '.' + ext;
    const target = options['out-dir'] ? pathToFileURL(resolve(options['out-dir'], file)) : here('dist/bundles/' + bundleName + '/' + file);
    const header = '/* Nacreon UI: ' + selection.join(', ') + ' */\n';
    await writeChanged(target, header + combinedSections(selection, ext).join('\n\n') + '\n');
    console.log(target.href);
  }
} else {
  await buildGallery();
}

async function buildGallery() {
  // Keep the gallery's local <use> references and the standalone script in sync with the SVG sheet.
  const iconSources = ['src/motion-frames.js', 'src/glass-shader.js', 'src/glass.js', 'src/icons.js', 'src/icon-motion.js', 'src/icon-material.js'];
  const [frames, shader, scene, iconRuntime, iconMotion, iconMaterial] = await Promise.all(iconSources.map(file => readFile(here(file), 'utf8')));
  const icons = iconRuntime.replace("/* ICON_SHEET */ ''", () => JSON.stringify(iconSheet))
    .replace('  /* ICON_MOTION */', () => iconMotion.trimEnd().replace(/^.+/gm, line => '  ' + line))
    .replace('  /* ICON_MATERIAL */', () => iconMaterial.trimEnd().replace(/^.+/gm, line => '  ' + line));
  bundleSections.set(designDir + 'icons.js', [frames.trimEnd(), shader.trimEnd(), scene.trimEnd(), icons.trimEnd()]);
  // Keep the embedded Chinese catalog UTF-8 when the host page uses a legacy encoding.
  await writeChanged(designDir + 'icons.svg', iconSheet + '\n');
  await writeChanged(designDir + 'icons.js', '\uFEFF/* Generated from src/icons.svg and ' + iconSources.join(', ') + ' by build.mjs. */\n' + frames.trimEnd() + '\n\n' + shader.trimEnd() + '\n\n' + scene.trimEnd() + '\n\n' +
    icons);

  const galleryComponents = Object.keys(components).filter(name => name !== 'pagination'); // Included with the data table.
  const galleryScripts = galleryComponents.slice();
  galleryScripts.splice(galleryScripts.indexOf('materials'), 0, 'icons');
  const readPreview = files => Promise.all(files.map(file => readFile(here('preview/' + file), 'utf8')));
  const uniqueStyles = combinedSections(['global', ...galleryComponents], 'css');
  const uniqueScripts = combinedSections(galleryScripts, 'js');
  const controllers = [
    'pages', 'motion', 'foundations', 'navigation', 'catalog', 'empty-state', 'loading', 'tabs', 'breadcrumb', 'steps', 'tree',
    'media-viewer', 'tooltip', 'accordion', 'multi-select', 'file-upload', 'form',
  ].map(name => 'preview-' + name + '.js');
  const galleryAssets = {
    'gallery.css': [...uniqueStyles, ...await readPreview(['preview.css', 'preview-foundations.css'])],
    'components.js': uniqueScripts,
    'gallery.js': await readPreview([...controllers, 'preview.js']),
  };

  let gallery = await readFile(here('index.html'), 'utf8');
  for (const [file, sections] of Object.entries(galleryAssets)) {
    const content = '/* Generated for the gallery by build.mjs. */\n'
      + sections.map(section => section.trimEnd()).join('\n\n') + '\n';
    const path = 'preview/' + file;
    await writeChanged(path, content);
    const revision = createHash('sha256').update(content).digest('hex').slice(0, 12);
    const reference = new RegExp('"' + ('./' + path).replaceAll('.', '\\.') + '(?:\\?v=[\\da-f]+)?"');
    if (!reference.test(gallery)) throw new Error('Missing gallery reference to ' + path);
    gallery = gallery.replace(reference, '"./' + path + '?v=' + revision + '"');
  }
  const sprite = /<svg class="icon-defs"[^>]*>[\s\S]*?<\/svg>/;
  if (!sprite.test(gallery)) throw new Error('Gallery icon sheet is missing');
  const gallerySheet = iconSheet.replace('<svg ', '<svg class="icon-defs" aria-hidden="true" focusable="false" ');
  const newline = gallery.includes('\r\n') ? '\r\n' : '\n';
  await writeChanged('index.html', gallery.replace(sprite, () => gallerySheet.replace(/\r?\n/g, newline + '  ')));
}
