# Frameworks and converters

The editor holds content as a neutral model:

```ts
interface Doc  { rows: Row[]; columns?: number }   // grid size, default 12
interface Row  { id; kind: 'grid' | 'raw'; cols: Col[]; raw?: string; attrs? }
interface Col  { id; kind: 'rich' | 'raw'; span: Span; html: string; attrs? }
interface Span { base: number; sm?; md?; lg?; xl?; xxl? }   // 1..columns
```

`base` applies at every width. Each breakpoint overrides it from that width up.

A converter turns this model into one framework's markup and back. Breakpoints map by name; a framework without one leaves that span out and the next smaller one applies:

| Converter | Row | base / sm / md / lg / xl / xxl |
| --- | --- | --- |
| `fusioncss` | `row` | `span-t` / `span-s` / `span-m` / `span-l` / `span-x` / none |
| `bootstrap3` | `row` | `col-xs-` / `col-sm-` / `col-md-` / `col-lg-` / none / none |
| `bootstrap5` | `row` | `col-` / `col-sm-` / `col-md-` / `col-lg-` / `col-xl-` / `col-xxl-` |
| `bootstrap6` | `row` | `col-` / `sm:col-` / `md:col-` / `lg:col-` / `xl:col-` / `2xl:col-` |
| `foundation5` | `row` + `columns` | `small-` / `medium-` / `large-` / `xlarge-` / none / none |
| `foundation6` | `grid-x grid-padding-x` + `cell` | `small-` / `medium-` / `large-` / `xlarge-` / `xxlarge-` / none |
| `tailwind` | `grid grid-cols-12 gap-6` | `col-span-` / `sm:` / `md:` / `lg:` / `xl:` / `2xl:` |
| `cssgrid` | `bf-grid` | `bf-col-` / `bf-sm-` / `bf-md-` / `bf-lg-` / `bf-xl-` / `bf-xxl-` |

Bootstrap 6 is in alpha. Its converter follows the alpha docs (prefix classes, `btn btn-solid theme-*` buttons) and may change when 6.0 ships.

The CSS grid converter needs a stylesheet:

- The editor adds it to the canvas automatically.
- Sites using it include `dist/blockfusion-grid.css` (12 columns) or the CSS from `cssGridStylesheet(n)`,
  as a link or pasted into their own stylesheet.
- It is layout only: the grid, column spans and the `bf-hidden-*` classes. Everything else,
  including the `bf-btn` button classes, comes from the site's own CSS.

## Grid size

Every converter defaults to 12 columns. A site built with another count sets the `columns` option, and the converter is rebuilt for it (`converter.withColumns(24)`):

```js
BlockFusion.create(el, { converter: 'fusioncss', columns: 24 });
```

- Spans, the layout picker, column settings, resizing and announcements all use the grid size. Layout presets appear when they divide it exactly (thirds need a multiple of 3).
- A document records its grid size. Content meeting a different one is rescaled with rounding: switching framework, undo across a switch, `setDoc`, blocks.
- Tailwind writes `grid-cols-N`; CSS grid generates its stylesheet for N.
- A converter without `withColumns` has a fixed grid; the option is ignored with a console warning.

## Utility classes

Converters also map the utility classes the original contentbuilder converter handled:

- **Visibility.** The neutral form is `hidden-xs` to `hidden-xxl`, one per width range; "visible only at X" is stored as hidden everywhere else. A framework's widest range runs on to the widest screens, so Bootstrap 3's `hidden-lg` is neutral `hidden-lg hidden-xl hidden-xxl`. A state a framework can't express (hidden at xl only, in Bootstrap 3) keeps its neutral classes. Each converter writes its own form:
  - fusionCSS: `hidden-t`, `visible-m`;
  - Bootstrap 3: `hidden-xs`, `visible-md`;
  - Bootstrap 5: `d-none d-md-block`;
  - Bootstrap 6: `d-none md:d-block`;
  - Foundation: `hide-for-small-only`, `show-for-large-only`;
  - Tailwind: `hidden md:block`;
  - CSS grid: `bf-hidden-xs`.
- **Buttons.** The neutral form is `button primary` and `button accent`, as in fusionCSS:
  - Bootstrap 3: `btn btn-default` and `btn btn-primary`, as in the original mapping;
  - Bootstrap 5: `btn btn-secondary` and `btn btn-primary`;
  - Bootstrap 6: `btn btn-solid theme-secondary` and `btn btn-solid theme-primary`;
  - Foundation: `button secondary` and `button primary`;
  - Tailwind: a set of utilities;
  - CSS grid: `bf-btn bf-btn-primary` and `bf-btn bf-btn-accent` (styled by the site's CSS).

## Guarantees (all tested)

- **Lossless round trip.** `parse(render(doc))` gives back the same model for every built-in converter, including classes, ids, styles, custom attributes, element names and raw code.
- **Cross-conversion.** Markup from any converter loads into any other. The framework is detected, parsed into the model and rendered again.
- **Nothing is lost.**
  - Markup that isn't recognised, such as a wrapping `div.container` or a row with an auto-width `col`, becomes a full-width column holding it unchanged.
  - Unrecognised markup that contains scripts becomes a raw row.
  - Classes a converter doesn't own stay on the element.
- **Raw code is verbatim.** It's written byte for byte between `<!--bf:raw-->` markers.

## Registering a converter

Most grids can be described declaratively:

```js
BlockFusion.registerConverter(BlockFusion.createGridConverter({
	id: 'mygrid',
	name: 'My grid',
	row: { tokens: ['grid-row'] },
	col: {
		tokens: ['grid-col'],                     // classes every column carries (optional)
		spanClass: (bp, n) => `w-${bp}-${n}`,      // bp is 'base' | 'sm' | 'md' | 'lg'
		// spanParser(regex, map): group 1 is the breakpoint name, group 2 the number.
		parseSpan: BlockFusion.spanParser(/^w-(base|sm|md|lg)-(\d+)$/, { base: 'base', sm: 'sm', md: 'md', lg: 'lg' }),
		base12Implicit: true,                     // a column without a base span is full width
	},
	utilities: {
		buttons: [[['button', 'primary'], ['btn', 'btn-light']], [['button', 'accent'], ['btn', 'btn-brand']]],
		visibility: { kind: 'classes', hidden: { xs: 'hide-xs', sm: 'hide-sm', md: 'hide-md', lg: 'hide-lg' } },
	},
}));
```

`parseSpan(token)` returns `{ bp, n }` or `null`.

You can also implement the full interface yourself:

```ts
interface Converter {
	id: string; name: string; stylesheet?: string;
	detect(root: Element): number;                    // 0..1
	parse(root: Element, ctx?: { raws?: string[] }): Doc;
	render(doc: Doc, opts?: { rawMarkers?: boolean }): string;
	rowClass(row: Row): string;
	colClass(col: Col): string;
	toFramework(tokens: string[]): string[];
	toNeutral(tokens: string[]): string[];
	mapHtml(html: string, direction: 'out' | 'in'): string;
}
```

## Site colour modes

The editor's own `theme` only styles its chrome. The page being edited always shows the site as it is, and when the editor knows how the site switches light and dark, a **Preview dark mode** toggle appears in the toolbar. It changes the canvas only, never the content.

How the site switches comes from, in order:

1. the `siteTheme` option;
2. the converter's convention: Bootstrap 5 and 6 use `data-bs-theme` on `<html>`;
3. a dark theme in the canvas stylesheets (readable, same-origin sheets): `prefers-color-scheme` rules that change colours, or colours written with `light-dark()`. They're previewed with the canvas's `color-scheme`. Rules that only show or hide things, like Foundation 6's `show-for-dark-mode`, don't count.

Frameworks themselves rarely ship a dark theme: Bootstrap 5.3+ and 6 do (`data-bs-theme`); fusionCSS, Bootstrap 3 and Foundation don't. Tailwind builds only the classes a site uses, so a Tailwind site gets the toggle once it uses `dark:` utilities (media strategy) or sets `siteTheme: { className: 'dark' }` (class strategy).

```js
siteTheme: 'media'                                              // prefers-color-scheme / light-dark()
siteTheme: { attribute: 'data-bs-theme', light: 'light', dark: 'dark' }
siteTheme: { attribute: 'data-theme', on: 'body' }               // dark="dark", light removes it
siteTheme: { className: 'dark' }                                 // Tailwind's class strategy
siteTheme: (doc, mode) => doc.documentElement.classList.toggle('night', mode === 'dark')
siteTheme: false                                                 // no preview
```
