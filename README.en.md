# Nacreon UI

**[Live demo](https://ycloud-y.github.io/Nacreon-UI/)** · [简体中文](README.md)

Nacreon UI is a collection of adaptive Web Components with an interactive gallery. It includes form controls, navigation, data display, feedback, typography, themes, icons, and material and motion presets.

## Try the gallery

Download and extract the repository or the release ZIP. Open [index.html](index.html) in a browser. The gallery works offline with its built assets.

Open **导航面板** (Navigation Panel) to browse 45 entries. Search by component name in English or Chinese, use the arrow keys to navigate results, and press Enter to open an entry. Open **示例代码** (Example Code) to copy the current sample with its appearance settings.

The Navigation Panel shows one level at a time in a single column. The list slides left to open a category and right to go back in left-to-right layouts. Back restores the previous level, scroll position and focused row. The default panel keeps its size during navigation and search. Set `density="compact"` for a narrower panel that fits the current list, with a smooth height change between levels. Long lists scroll below the header. Both sizes support inline and modal use. The Preferences sample ends in read-only text. [Preview the Navigation Panel](index.html#navigation-panel)

Load `navigation-panel.css` and `navigation-panel.js` from `dist/components/navigation-panel/`, then place a `nav` inside `<ml-navigation-panel>`. Give each `section` a heading. Nest sections for deeper levels, use `p` with an optional `small` for display text, and use native links for destinations. Mark the current link with `aria-current="page"`. Search includes all levels, text descriptions, `data-en` aliases and `data-keywords`. Results include the parent path. For a modal panel, place it directly inside the native `dialog` in an `<ml-dialog>` wrapper and call the panel’s `showModal(trigger)` method. Its standalone files include the dialog implementation. The earlier `<ml-catalog>` tag, `dist/components/catalog/` files and `#catalog` preview link remain supported.

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

### Bundle several components for an offline page

For a page with filter controls, a data table, and a detail dialog, generate a single CSS and JavaScript pair.

```sh
npm run build -- --components button,input,select,data-table,dialog --name workspace
```

```html
<link rel="stylesheet" href="./dist/bundles/workspace/workspace.css">
<script defer src="./dist/bundles/workspace/workspace.js"></script>
```

List the components in the order you would load their standalone files. The build includes their dependencies, such as pagination for the data table, and shares common code across the selection. Copy both output files into your application. Pass `--out-dir ./public/ui` to write them directly to a different directory.

### Native form ownership

An input outside `<ml-form>` can participate in validation and error-summary navigation through its native `form` attribute. Set it to the ID of the `<form>` inside the component. Wrap the input in `.ml-form-field` for an inline message. An `<ml-file-upload>` accepts a file input inserted after mounting. Replacing it aborts its outstanding uploads and adopts the replacement's native selection.

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
| Navigation and actions | [Toolbar](index.html#toolbar), [Navigation Panel](index.html#navigation-panel), [Sidebar](index.html#sidebar), [Tabs](index.html#tabs), [Breadcrumbs](index.html#breadcrumb), [Steps](index.html#steps), [Tree view](index.html#tree), [Action menu](index.html#menu), [Pagination](index.html#pagination) |
| Content | [Lists](index.html#list), [Accordion](index.html#accordion), [Data table](index.html#data-table), [Information](index.html#info), [Media viewer](index.html#media-viewer), [Empty state](index.html#empty-state), [Hover card](index.html#hover-card) |
| Overlays and feedback | [Dialog](index.html#dialog), [Detail drawer](index.html#drawer), [Tooltip](index.html#tooltip), [Progress bar](index.html#progress), [Loading state](index.html#loading), [Toast and banner](index.html#feedback), [Expandable status panel](index.html#island) |
| Design resources | [Colors](index.html#colors), [Icons](index.html#icons), [Materials](index.html#materials), [Motion](index.html#motion), [Typography](index.html#typography), [Design tokens](index.html#tokens), [Themes](index.html#themes) |

## Appearance and design resources

Set these attributes on a component, a containing section, or the entire page. Components inherit the settings from their nearest configured ancestor.

| Attribute | Values |
| --- | --- |
| `data-ml-theme` | `light`, `warm`, `dark` |
| `data-ml-material` | `base` for mica, `low` for enhanced mica, `medium` for frosted glass, `high` for liquid glass |
| `data-ml-motion` | `base` for immediate updates, `low` for short fades, `medium` for smooth transitions, `high` for spring motion |
| `data-ml-light-source` | `pointer`, `fixed`, or `none` at every motion and material tier |

High motion uses every available browser refresh. Medium motion samples each component animation at up to 90 FPS, including glass, icon lighting, CSS transitions and animations, and effects started by `MaterialMotion`. Load the component's CSS and JavaScript together. Nested scopes can use different motion tiers. Scrolling, native input, and video follow their own clocks.

High material supports a WebGL renderer and an SVG fallback. The two glass tiers share a transparency setting (0–100%, default 60%). All four materials follow the nearest theme, from porcelain and cool gray to ivory and warm gray or dark slate. The mica tiers stay opaque. Frosted glass diffuses the backdrop, and liquid glass reveals the theme tint along its thicker edges. On the material scope set `--ml-material-transparency: 60%` and `--ml-light-intensity: .65` to adjust transmission and lamp strength separately. Use `<ml-material surface="content">` for a denser reading surface. Pointer lighting settles over about 240 ms on viewport exit, window blur, or touch release. Liquid glass returns to its resting light, while frosted glass and mica fade the last highlight in place. Reduced motion converts pointer lighting to fixed lighting. The gallery also supports reduced-motion and forced-colors preferences.

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

To run Chromium tests with an installed Chrome, set `NACREON_CHROMIUM_EXECUTABLE` to its absolute executable path. Firefox tests accept `NACREON_FIREFOX_EXECUTABLE` for a Playwright-compatible Firefox build.

```sh
npx playwright install firefox
node tests/date-time-picker.mjs firefox
```
