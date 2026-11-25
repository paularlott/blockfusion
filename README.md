# BlockFusion

BlockFusion is a WYSIWYG page-content editor built on rows, columns and blocks. It has no runtime dependencies, edits inside the site's own stylesheets, and writes clean grid markup for the CSS framework you choose:

- fusionCSS
- Bootstrap 3
- Bootstrap 5
- Foundation 5
- Foundation 6
- Tailwind CSS
- plain CSS grid

See [ARCHITECTURE.md](ARCHITECTURE.md) for the design.

## Contents

- [Quick start](#quick-start)
- [Options](#options)
- [API](#api)
- [Converters](#converters)
- [Blocks](#blocks)
- [Media provider](#media-provider)
- [Plugins](#plugins)
- [Accessibility](#accessibility)
- [Development](#development)
- [Known limitations](#known-limitations)
- [Contributing](#contributing)
- [Licence](#licence)

## Quick start

Include the built files. They are committed in `dist/`, so you don't need Node to use them.

```html
<link rel="stylesheet" href="dist/blockfusion.css">
<script src="dist/blockfusion.js"></script>

<form method="post">
	<textarea name="content"><div class="row"><div class="span-s12"><p>Hello</p></div></div></textarea>
	<button>Save</button>
</form>

<script>
	const editor = BlockFusion.create(document.querySelector('textarea[name=content]'), {
		converter: 'fusioncss',
		stylesheets: ['/theme/fusioncss.css', '/theme/site.css'],
		bodyClass: 'page-content',
	});
</script>
```

You can also use it as an ES module:

```js
import { create } from './dist/blockfusion.mjs';
const editor = create('#page', { converter: 'bootstrap5', stylesheets: ['/css/bootstrap.min.css'] });
```

### Textarea mode

When created on a `<textarea>`, BlockFusion:

- hides the textarea;
- loads its value as the content;
- keeps the value up to date after each change, and again on `submit` and `formdata`.

Normal form posts therefore just work. On any other element, its current HTML becomes the content.

### What you get

- **WYSIWYG canvas.** It's a same-origin iframe that loads your `stylesheets` and `bodyClass`, so the content looks exactly as it does on the site. The toolbar, panels and dialogs sit outside it, styled by `blockfusion.css` and prefixed `bf-`.
- **Rows and columns.**
  - Add a row with a layout picker: 1, 1/2+1/2, 1/3×3, 1/4×4, 2/3+1/3, 1/3+2/3, or custom spans such as `3 6 3` or `1/4 3/4`.
  - Add, remove, move, resize, duplicate and delete rows and columns.
  - Row and column settings: class, id, element, background, inline style, custom attributes, and spans per breakpoint.
- **Blocks.** A library panel with search and categories. A block is one or more rows, given as neutral rows or as HTML for any known framework. Inserting a block converts it to the active framework.
- **Rich text.**
  - Paragraph, H1–H6 and preformatted.
  - Font family and size.
  - Bold, italic, underline, strikethrough, subscript and superscript.
  - Quote, indent and outdent, bulleted and numbered lists, alignment.
  - Links, images and text colour.
  - Clear formatting, and an HTML source view.
  - Paste cleaning that strips Word and Google Docs markup.
- **Raw HTML/JavaScript** rows and columns.
  - They're written to the output verbatim.
  - In the canvas they show as a labelled placeholder with a sandboxed preview, so scripts never run in the editor.
- **Undo and redo** for structure and text. Typing in a column merges into one step.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `converter` | `'fusioncss'` | Output and editing framework: `fusioncss`, `bootstrap3`, `bootstrap5`, `bootstrap6`, `foundation5`, `foundation6`, `tailwind`, `cssgrid`, or any registered id. |
| `columns` | the converter's (12) | Columns in the site's grid, for a build with another count (fusionCSS `@numColumns`, Bootstrap `$grid-columns`, ...). See [Grid size](#grid-size). |
| `siteTheme` | see [Site colour modes](#site-colour-modes) | How the site switches light/dark, so the canvas can preview both. `false` turns the preview off. |
| `colorMode` | `'light'` | Colour mode the canvas starts in when the site has one. |
| `stylesheets` | `[]` | Stylesheet URLs loaded into the canvas: theme CSS, framework CSS or a Tailwind build. |
| `bodyClass` | `''` | Class for the canvas `<body>`, e.g. `container`. |
| `canvasCss` | `''` | Extra CSS for the canvas, added after the stylesheets. |
| `value` | textarea value or element HTML | Initial HTML. Markup for any known framework is detected and converted. |
| `blocks` | `[]` | Extra blocks (see [Blocks](#blocks)). |
| `blocksUrl` | none | URL of a JSON array of blocks, fetched on start. |
| `defaultBlocks` | `true` | Include the 14 built-in blocks. |
| `media` | none | A [media provider](#media-provider). |
| `fonts` | four defaults | `[{ name, value }]` for the font menu. `value` is a CSS `font-family`. |
| `fontSizes` | five defaults | `[{ name, value }]` for the size menu. `value` is a CSS length. |
| `colors` | ten defaults | `[{ name, value }]` for the text colour menu. The defaults all have at least 4.5:1 contrast on white. |
| `theme` | `'auto'` | The editor's own light/dark. `'auto'` follows a `data-theme="light\|dark"` attribute on an ancestor, then `prefers-color-scheme`. `'light'` or `'dark'` forces one. It doesn't change how the page being edited looks (see `siteTheme`). |
| `breakpoint` | `'md'` | Breakpoint that new layouts and resizes apply to (`sm`, `md`, `lg`, `xl` or `xxl`). Columns stack below it. |
| `height` | `'auto'` | `'auto'` grows the canvas with its content. Any CSS length fixes it and scrolls. |

The toolbar sticks to the top of the window as the page scrolls, and an open side panel stays just below it. A host page with its own sticky bar sets the CSS variable `--bf-sticky-top` (on the editor or an ancestor) to that bar's height, so the toolbar sits below it.
| `minHeight` | `'320px'` | Minimum canvas height in auto mode. |
| `label` | `'Page editor'` | Accessible name of the editor region. |
| `rawMarkers` | `true` | Wrap raw code in `<!--bf:raw-->…<!--/bf:raw-->` so it's recognised again on load. |
| `toolbar` | all items | Toolbar item ids in order, with `'\|'` for a separator. |
| `codeEditor` | textarea | A code editor factory (see [the Ace example](#code-editor-hook-eg-ace)). |
| `plugins` | `[]` | Extra [plugins](#plugins). |
| `lang`, `dir` | page values | Language and direction of the content, set on the canvas. |

The default toolbar ids are:

```
undo redo | block font size | bold italic underline strike subscript superscript color clear |
ul ol outdent indent quote | alignLeft alignCenter alignRight alignJustify | link image | blocks addRow addRaw width colorMode |
source check help

`colorMode` only appears when the editor knows how the site switches light and dark.
```

## API

```js
const editor = BlockFusion.create(textareaOrElementOrSelector, options);

editor.getHTML();                       // markup from the active converter
editor.setHTML(html);                   // any known framework, converted (undoable)
editor.getDoc(); editor.setDoc(doc);    // the neutral model
editor.setConverter('bootstrap5', { stylesheets: [...], bodyClass: 'container' }); // re-renders
editor.setStylesheets([...]); editor.setBodyClass('...'); editor.setTheme('dark');
editor.setColorMode('dark');            // preview the site's dark mode (canvas only)
editor.columns;                         // grid size being edited
editor.undo(); editor.redo();
editor.exec('bold');                    // run any command by id
editor.focus();
editor.announce('Saved');               // screen reader live region
editor.ready.then(() => {});            // canvas loaded
editor.destroy();                       // restores the textarea (or writes the HTML back into the element)

editor.on('change', () => {});
editor.on('ready', () => {});
editor.on('selectionchange', ({ rowId, colId }) => {});
editor.on('converterchange', ({ id }) => {});
editor.on('colormodechange', ({ mode }) => {});
editor.on('sitethemechange', ({ available }) => {});
```

Global helpers on `BlockFusion` include:

- `registerConverter`, `getConverter` and `listConverters`;
- `convertHTML(html, toId, fromId?)` and `detectConverter(html)`;
- `loadHTML(html)`, which parses into the neutral model;
- `cleanPaste(html)` and `textToHtml(text)`;
- `createGridConverter` and `spanParser`;
- `DEFAULT_BLOCKS`, `CSSGRID_STYLESHEET`, `cssGridStylesheet(columns)`, `History`;
- `model`, the pure model operations;
- `plugins`, the built-in plugins.

## Converters

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
- Sites using it include `dist/blockfusion-grid.css` (12 columns) or the CSS from `cssGridStylesheet(n)`.

### Grid size

Every converter defaults to 12 columns. A site built with another count sets the `columns` option, and the converter is rebuilt for it (`converter.withColumns(24)`):

```js
BlockFusion.create(el, { converter: 'fusioncss', columns: 24 });
```

- Spans, the layout picker, column settings, resizing and announcements all use the grid size. Layout presets appear when they divide it exactly (thirds need a multiple of 3).
- A document records its grid size. Content meeting a different one is rescaled with rounding: switching framework, undo across a switch, `setDoc`, blocks.
- Tailwind writes `grid-cols-N`; CSS grid generates its stylesheet for N.
- A converter without `withColumns` has a fixed grid; the option is ignored with a console warning.

### Utility classes

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
  - CSS grid: `bf-btn bf-btn-primary` and `bf-btn bf-btn-accent`.

### Guarantees (all tested)

- **Lossless round trip.** `parse(render(doc))` gives back the same model for every built-in converter, including classes, ids, styles, custom attributes, element names and raw code.
- **Cross-conversion.** Markup from any converter loads into any other. The framework is detected, parsed into the model and rendered again.
- **Nothing is lost.**
  - Markup that isn't recognised, such as a wrapping `div.container` or a row with an auto-width `col`, becomes a full-width column holding it unchanged.
  - Unrecognised markup that contains scripts becomes a raw row.
  - Classes a converter doesn't own stay on the element.
- **Raw code is verbatim.** It's written byte for byte between `<!--bf:raw-->` markers.

### Registering a converter

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

## Blocks

A block is one or more rows of columns, described as data rather than markup, so it is written once and rendered for whichever framework is active when it is inserted:

```json
{
	"id": "text-image",
	"name": "Text and image",
	"category": "Text",
	"description": "Text on the left, image on the right.",
	"thumbnail": "/img/text-image.png",
	"rows": [
		{
			"className": "highlight",
			"cols": [
				{ "span": 6, "html": "<h2>Tell the story</h2><p>…</p>" },
				{ "span": 6, "html": "<img src=\"/img/photo.jpg\" alt=\"…\">" }
			]
		},
		{ "raw": "<iframe src=\"…\" title=\"Map\"></iframe>" }
	]
}
```

- `span`: a number of columns from the md breakpoint up, so columns stack on phones. An object such as `{ "base": 12, "sm": 6, "md": 4 }` sets each breakpoint (`base`, `sm`, `md`, `lg`, `xl`, `xxl`).
- Spans count in a 12 column grid unless the block sets `"columns"` (e.g. `"columns": 24`). They are rescaled to the editor's grid on insert.
- A column with `"kind": "raw"` holds verbatim HTML/JavaScript. A row written as `{ "raw": "…" }` is a raw row.
- `className`, `id`, `style` and `tag` can go on a row or a column, and any other attributes go in `attrs`.
- Ids and kinds are optional. `category`, `description` and `thumbnail` are optional too; without a thumbnail, a schematic preview is drawn.
- `rows` may also be a string of HTML in any known framework. It is detected and converted on insert, which is handy for pasting existing markup, but the JSON form is the one to write by hand.

In the Blocks panel, drag a block onto the page: a line shows where it will go, above or below the row under the pointer. Clicking a block (or pressing Enter on it) inserts it where the panel's **Insert** choice says: below or above the current row, at the top, or at the end.

There are three ways to supply blocks:

- the `blocks` option, as an array;
- the `blocksUrl` option, pointing at a JSON array;
- `editor.addBlocks([...])`, from code or a plugin.

The block list updates live, and fresh ids are assigned on insert. Use the neutral button and visibility classes so blocks look right in every framework.

The 14 built-in blocks are:

- hero
- heading and introduction
- text and image
- image and text
- two text columns
- three features
- four figures
- call to action
- quote
- image gallery
- questions and answers
- pricing
- team
- contact details

## Media provider

```ts
interface MediaProvider {
	pickImage?(opts: { current?: { src: string; alt?: string } }): Promise<{ src; alt?; width?; height? } | null>;
	pickFile?(opts: { current?: string }): Promise<{ href; title? } | null>;
	upload?(file: File): Promise<{ src: string; alt?: string }>;
}
```

- **`pickImage`** replaces the image dialog for new images. It also adds a "Browse images…" button when an image is being edited.
- **`pickFile`** adds "Browse files…" to the link dialog.
- **`upload`**:
  - lets you drop or paste image files into a column, uploading them and inserting them at the caret;
  - adds an upload field to the image dialog.
- **No provider.** The editor asks for a URL and alt text in an accessible dialog. A dropped or pasted image without `upload` opens that dialog instead.

Change the provider at any time with `editor.setMediaProvider(provider)`.

## Plugins

```ts
interface Plugin { id: string; install(editor: Editor): void | (() => void) }
```

Pass plugins in `options.plugins`, or call `editor.use(plugin)`. The function `install` returns, if any, runs on `destroy()`.

The built-in features are plugins themselves (`BlockFusion.plugins`): `historyPlugin`, `formattingPlugin`, `insertPlugin`, `blocksPlugin`, `structurePlugin`, `sourcePlugin`, `checkerPlugin` and `helpPlugin`. A plugin can do the following:

```js
const wordCount = {
	id: 'word-count',
	install(editor) {
		// Commands: run with editor.exec(id); shortcut works in the canvas.
		editor.registerCommand({
			id: 'wordCount',
			label: 'Word count',
			icon: 'audit',
			shortcut: 'Mod+Shift+C',
			run: (ed) => ed.announce(`${ed.canvas.doc.body.innerText.split(/\s+/).filter(Boolean).length} words`),
		});
		// Toolbar items: buttons, menus (with menuitemradio items) and separators.
		editor.addToolbarItem({ type: 'button', id: 'wordCount', command: 'wordCount' }, { after: 'help' });
		// Row/column handle menu actions.
		editor.addHandleAction({ id: 'row-log', kind: 'row', label: 'Log row', run: (ed, { rowId }) => console.log(rowId) });
		// Side panels.
		editor.addPanel({ id: 'notes', title: 'Notes', render: (el) => (el.textContent = 'Hello') });
		// Paste filters run before the built-in cleaning.
		const off = editor.addPasteFilter((html) => html.replace(/foo/g, 'bar'));
		// Blocks.
		editor.addBlocks([{ id: 'x', name: 'X', rows: '<div class="row"><div class="col-12">X</div></div>' }]);
		return off; // cleanup
	},
};
```

Structural changes made in code should go through `editor.apply(label, (draft) => { … })`. That makes the change one undo step and announces it. `editor.runText(label, (doc, content) => { … })` does the same for edits inside the column that has the caret.

### Code editor hook (e.g. Ace)

Raw HTML and the source view use a plain, labelled `<textarea>` by default. To use Ace instead:

```js
editor.setCodeEditor((host, { value, labelId }) => {
	const el = document.createElement('div');
	el.style.height = '24rem';
	host.appendChild(el);
	const ace = window.ace.edit(el, { mode: 'ace/mode/html', value });
	ace.textInput.getElement().setAttribute('aria-labelledby', labelId);
	return { getValue: () => ace.getValue(), focus: () => ace.focus(), destroy: () => ace.destroy() };
});
```

Make sure the code editor you plug in doesn't trap the Tab key: users must be able to leave it with the keyboard.

## Accessibility

BlockFusion targets **WCAG 2.2 AA**.

### Toolbar

- It uses `role=toolbar` with a roving tabindex. Tab enters and leaves it as one stop; Arrow keys, Home and End move within it.
- **Alt+F10** jumps to it from the canvas, and **Escape** goes back.
- Every button has an `aria-label` and a tooltip, shown on hover and keyboard focus and dismissed with Escape.
- Formatting buttons expose `aria-pressed`. Menus use `menuitemradio` with `aria-checked`. Undo and redo are labelled with the step they would take, for example "Undo Insert row".

### Structure from the keyboard

Every row and column has a focusable handle button in the canvas, placed before its content in the tab order. Its menu holds every action:

- move up, down, left or right;
- wider and narrower;
- add, duplicate or delete;
- settings;
- insert a row above or below;
- edit code.

Some actions have shortcuts on the handle:

- **Alt+↑ / Alt+↓** move a row.
- **Alt+← / Alt+→** move a column.
- **Alt+Shift+← / Alt+Shift+→** resize a column.
- **Delete** deletes.

**Escape** in a column's text moves focus to that column's handle. After each structural change, focus stays on the moved or new item.

### Announcements

A polite live region reports what happened, for example:

- "Row moved up, now row 2 of 4"
- "Column is 8 of 12 wide"
- "Undone: Typing"
- "Insert block Hero: row 3 of 5"

### Dialogs

Dialogs are modal `<dialog>` elements that:

- are labelled by their title and described by their help text;
- keep focus inside;
- close with Escape;
- return focus to where it was, including inside the canvas.

Invalid fields are marked with `aria-invalid` and `aria-errormessage`.

### Visual

- **Focus and targets.** Focus is always visible. Every control is at least 24×24px; toolbar buttons are 32px.
- **Themes.** Light and dark follow `prefers-color-scheme`. The host can override this with `theme` or a `data-theme` attribute on an ancestor.
- **Contrast.** `test/contrast.test.ts` checks every colour token pairing numerically for AA, in both themes.
- **Forced colours.** Pressed, focus and disabled states use system colours.
- **Reduced motion.** Transitions are turned off.

### Site colour modes

The editor's own `theme` only styles its chrome. The page being edited always shows the site as it is, and when the editor knows how the site switches light and dark, a **Preview dark mode** toggle appears in the toolbar. It changes the canvas only, never the content.

How the site switches comes from, in order:

1. the `siteTheme` option;
2. the converter's convention: Bootstrap 5 and 6 use `data-bs-theme` on `<html>`;
3. `prefers-color-scheme` rules in the canvas stylesheets (readable, same-origin sheets), which are previewed with the canvas's `color-scheme`. This also covers `light-dark()`.

```js
siteTheme: 'media'                                              // prefers-color-scheme / light-dark()
siteTheme: { attribute: 'data-bs-theme', light: 'light', dark: 'dark' }
siteTheme: { attribute: 'data-theme', on: 'body' }               // dark="dark", light removes it
siteTheme: { className: 'dark' }                                 // Tailwind's class strategy
siteTheme: (doc, mode) => doc.documentElement.classList.toggle('night', mode === 'dark')
siteTheme: false                                                 // no preview
```

### Contrast checker

The "Contrast checker" toolbar button lists problems, each with a "Go to" button:

- text below WCAG AA contrast (4.5:1, or 3:1 for large text), measured on the rendered canvas so theme CSS and row and column backgrounds count; text over a background image or gradient is flagged to check by eye. When the site has a dark mode the editor can preview, contrast is checked in both modes, and "Go to" switches the preview to the mode the problem shows in;
- images without alt text (or with placeholder alt text);
- skipped or empty heading levels;
- links without text.

It is a quick check, not a full accessibility audit. The image dialog asks for alt text unless the image is marked decorative.

### Keyboard shortcuts

**Keyboard help** (Mod+/) lists them all:

| Action | Keys |
| --- | --- |
| Undo / redo | Mod+Z / Mod+Shift+Z, Ctrl+Y |
| Bold, italic, underline | Mod+B, Mod+I, Mod+U |
| Strikethrough, subscript, superscript | Mod+Shift+X, Mod+,, Mod+. |
| Paragraph, Heading 1–6 | Mod+Alt+0, Mod+Alt+1…6 |
| Bulleted / numbered list | Mod+Shift+8 / Mod+Shift+7 |
| Quote | Mod+Shift+9 |
| Indent / outdent | Mod+] / Mod+[ |
| Align left / centre / right / justify | Mod+Shift+L / E / R / J |
| Link | Mod+K |
| Clear formatting | Mod+\ |
| Add row, blocks panel, HTML source | Mod+Alt+R, Mod+Alt+B, Mod+Alt+U |

**Mod** is ⌘ on macOS and Ctrl elsewhere.

## Development

```sh
npm install
npm run build        # dist/blockfusion.js, .mjs, .css, -grid.css (esbuild)
npm run watch        # rebuild on change
npm test             # vitest + jsdom
npm run typecheck    # tsc --noEmit
npm run demo         # serves the repo on http://localhost:8080; open /demo/
```

The demo (`demo/index.html`) runs the editor on a textarea in a form. It has:

- a framework switcher;
- a light/dark toggle;
- a demo media provider, whose uploads become data URLs;
- a "Show output" panel;
- blocks loaded from `demo/blocks.json`.

Everything loads locally:

- **Framework CSS.** `node scripts/vendor.mjs [fusionCSS dir] [axe.min.js]` fetches the framework stylesheets into `demo/vendor/` with `npm pack` (Bootstrap 3, 5 and 6 alpha 2, Foundation 5 and 6), builds the Tailwind CSS, and copies fusionCSS from a local checkout. The results are committed.
- **axe-core.** The script can also copy axe-core into `demo/vendor` for local accessibility testing; that file is git-ignored.

### Source layout

```
src/
  model/        neutral document model and pure operations
  converters/   generic grid converter, the seven frameworks, class mapping, detection
  history/      undo/redo with typing merge
  paste/        paste cleaning
  commands/     text and structure commands
  plugins/      built-in plugins (formatting, insert, blocks, structure, source, checker, help, history)
  ui/           canvas, toolbar, menus, dialogs, live region, icons
  blocks/       built-in blocks
  styles/       editor chrome CSS
  editor.ts     the Editor class
  index.ts      public entry (global BlockFusion)
```

## Known limitations

- Rich text editing uses the browser's editing commands (`document.execCommand`). They work in every current browser but are formally deprecated, and the markup they produce varies slightly between browsers. The editor tidies the common differences.
- **Offsets, push and pull.** These classes (e.g. `span-s-push6`, `col-md-offset-2`) are kept as plain classes. They round-trip within one framework but aren't translated between frameworks.
- **Missing breakpoints.** A span at a breakpoint the target framework lacks (an `xl` span going to Bootstrap 3) is left out, so the next smaller span applies there.
- **Grid size changes round.** Converting 24 column content to a 12 column grid halves the spans; odd spans round, so a 5 + 19 split becomes 3 + 10, which adds up to 13 and wraps. Check such rows after converting.
- **Foundation 5 `lg` spans.** Foundation 5 has no xlarge grid. An `lg` span is written as `xlarge-N`, which round-trips but isn't styled by Foundation 5 itself.
- **Bootstrap and Foundation breakpoint names.** These map by name, not by pixel width; for example, Bootstrap 5's `md` is 768px while fusionCSS's `m` is 992px.
- **Tailwind's default gap.** A row whose own class is exactly the default gap (`gap-6`) loses that class on a round trip, since the converter adds it anyway.
- **Comments inside rows.** A row containing HTML comments (other than raw markers) is kept as wrapped markup rather than editable columns, so the comments aren't lost.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). Pull requests need the shared [Contributor License Agreement](CONTRIBUTOR_LICENSE_AGREEMENT.md), signed once for every project under [github.com/paularlott](https://github.com/paularlott); a GitHub check confirms it on each pull request. Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Licence

BlockFusion is released under the [MIT License](LICENSE.txt). Copyright (c) 2026 Paul Arlott.
