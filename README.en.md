# Nacreon UI

**[Live demo](https://225434.github.io/Nacreon-UI/)** · [简体中文](README.md)

Nacreon UI is a collection of adaptive Web Components with an interactive gallery. It includes form controls, navigation, data display, feedback, typography, themes, icons, and material and motion presets.

## Try the gallery

Download and extract the repository or the release ZIP. Open [index.html](index.html) in a browser. The gallery works offline with its built assets.

Open **组件目录** (Component Directory) to browse 44 entries. Search by component name in English or Chinese, use the arrow keys to navigate results, and press Enter to open an entry. Open **示例代码** (Example Code) to copy the current sample with its appearance settings.

## Use a component

Copy the component directory you need from [dist/components](dist/components/) into your project and reference its CSS and JavaScript. The example paths below are relative to the repository root. A component bundle includes its shared styles and required runtime modules.

```html
<link rel="stylesheet" href="./dist/components/button/button.css">
<script defer src="./dist/components/button/button.js"></script>

<form data-ml-theme="warm" data-ml-material="medium" data-ml-motion="low">
  <label>Album name <input name="title" required></label>
  <ml-button variant="primary">
    <button type="submit">Save album</button>
  </ml-button>
  <ml-button variant="secondary">
    <button type="reset">Reset</button>
  </ml-button>
</form>
```

Keep the native elements inside each component, including labels, buttons, links, and inputs. They provide form submission, keyboard interaction, and validation. Add [global.css](dist/design/global.css) once if you want the same theme and typography on surrounding page content.

### Date and time fields

```html
<link rel="stylesheet" href="./dist/components/date-picker/date-picker.css">
<script defer src="./dist/components/date-picker/date-picker.js"></script>
<link rel="stylesheet" href="./dist/components/time-picker/time-picker.css">
<script defer src="./dist/components/time-picker/time-picker.js"></script>

<ml-date-picker>
  <label>Screening date
    <input name="date" type="date" min="2030-11-01" max="2030-11-30" required>
  </label>
</ml-date-picker>
<ml-time-picker>
  <label>Start time
    <input name="time" type="time" min="09:00" max="18:00" step="900">
  </label>
</ml-time-picker>
```

The native inputs accept direct entry. The date picker commits when you choose a day. The time picker uses a 24-hour panel and commits on confirmation. The time step is in seconds. Both components expose `value`, `field`, `openPicker()`, and `closePicker()`.

### Accordion

```html
<link rel="stylesheet" href="./dist/components/accordion/accordion.css">
<script defer src="./dist/components/accordion/accordion.js"></script>

<ml-accordion mode="single" role="group" aria-label="Album details">
  <details open>
    <summary>Dimensions</summary>
    <div class="ml-accordion-panel">1672 × 941 pixels</div>
  </details>
  <details>
    <summary>Notes</summary>
    <div class="ml-accordion-panel"><label>Cover idea <textarea></textarea></label></div>
  </details>
</ml-accordion>
```

With `mode="single"`, opening one section closes the others in its group. With `mode="multiple"`, sections open independently. Collapsing a section preserves inputs inside it. Use Enter or Space to toggle a header and the arrow keys to move between headers.

## Component directory

| Category | Gallery entries |
| --- | --- |
| Basic controls | [Switch](index.html#switch), [Button](index.html#button), [Tag](index.html#tag), [Badges and indicators](index.html#badge) |
| Form controls | [Text field](index.html#input), [Select](index.html#select), [Searchable multi-select](index.html#multi-select), [File upload](index.html#file-upload), [Form](index.html#form), [Checkbox and radio group](index.html#choice), [Slider](index.html#slider), [Stepper](index.html#stepper), [Date picker](index.html#date-picker), [Time picker](index.html#time-picker), [Date range picker](index.html#date-range) |
| Navigation and actions | [Toolbar](index.html#toolbar), [Sidebar](index.html#sidebar), [Tabs](index.html#tabs), [Breadcrumbs](index.html#breadcrumb), [Steps](index.html#steps), [Tree view](index.html#tree), [Action menu](index.html#menu), [Pagination](index.html#pagination) |
| Content | [Lists](index.html#list), [Accordion](index.html#accordion), [Data table](index.html#data-table), [Information](index.html#info), [Media viewer](index.html#media-viewer), [Empty state](index.html#empty-state), [Hover card](index.html#hover-card) |
| Overlays and feedback | [Dialog](index.html#dialog), [Detail drawer](index.html#drawer), [Tooltip](index.html#tooltip), [Progress bar](index.html#progress), [Loading state](index.html#loading), [Toast and banner](index.html#feedback), [Expandable status panel](index.html#island) |
| Design resources | [Colors](index.html#colors), [Icons](index.html#icons), [Materials](index.html#materials), [Motion](index.html#motion), [Typography](index.html#typography), [Design tokens](index.html#tokens), [Themes](index.html#themes) |

## Appearance and design resources

Set these attributes on a component, a containing section, or the entire page. Components inherit the settings from their nearest configured ancestor.

| Attribute | Values |
| --- | --- |
| `data-ml-theme` | `light`, `warm`, `dark` |
| `data-ml-material` | `base` for solid surfaces, `low` for soft shading, `medium` for frosted translucency, `high` for refractive glass |
| `data-ml-motion` | `base` for immediate updates, `low` for short fades, `medium` for smooth transitions, `high` for spring motion and pointer lighting |

High material supports a WebGL renderer and an SVG fallback. High motion lets surfaces on the same page share a pointer light. The gallery also supports reduced-motion and forced-colors preferences.

| Resource | Files |
| --- | --- |
| Page-wide styles | [global.css](dist/design/global.css) |
| Colors and themes | [colors.css](dist/design/colors.css) and [themes.css](dist/design/themes.css) |
| Design tokens and typography | [tokens.css](dist/design/tokens.css) and [typography.css](dist/design/typography.css) |
| Icons | [icons.js](dist/design/icons.js) for `<ml-icon>` and [icons.svg](dist/design/icons.svg) for the SVG sprite |
| Material samples | [materials.css](dist/design/materials.css) and [materials.js](dist/design/materials.js) |
| Motion helpers | [motion.css](dist/design/motion.css) and [motion.js](dist/design/motion.js) |

## Repository layout

| Path | Contents |
| --- | --- |
| [index.html](index.html) | Offline gallery entry point |
| [dist/components](dist/components/) | Built CSS and JS grouped by component |
| [dist/design](dist/design/) | Built themes, design assets, and shared styles |
| [src](src/) | Component source and design resource definitions |
| [preview](preview/) | Gallery scripts, styles, and [sample media](preview/assets/README.md) |
| [tests](tests/) | Browser regression tests |

Starting with v0.2.0, use `dist/components/<name>/` for component imports and `dist/design/` for design resources. Existing gallery fragments still resolve through `index.html`.

## Build and test

Use Node.js 22 or later for development. The build regenerates `dist/` from `src/` and syncs the gallery sprite.

```sh
npm ci
npx playwright install chromium
npm run build
npm test
```

The suite covers keyboard and touch interaction, form integration, offline examples, layout at narrow widths, and combinations of themes, materials, and motion. To run a test that supports Firefox, install that browser and pass `firefox` as the final argument.

```sh
npx playwright install firefox
node tests/date-time-picker.mjs firefox
```
