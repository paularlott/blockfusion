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
| `converter` | `'fusioncss'` | Output and editing framework: `fusioncss`, `bootstrap3`, `bootstrap5`, `foundation5`, `foundation6`, `tailwind`, `cssgrid`, or any registered id. |
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
| `theme` | `'auto'` | `'auto'` follows a `data-theme="light\|dark"` attribute on an ancestor, then `prefers-color-scheme`. `'light'` or `'dark'` forces one. |
| `breakpoint` | `'md'` | Breakpoint that new layouts and resizes apply to (`sm`, `md` or `lg`). Columns stack below it. |
| `height` | `'auto'` | `'auto'` grows the canvas with its content. Any CSS length fixes it and scrolls. |
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
ul ol outdent indent quote | alignLeft alignCenter alignRight alignJustify | link image | blocks addRow addRaw width |
source check help
```

## API

```js
const editor = BlockFusion.create(textareaOrElementOrSelector, options);

editor.getHTML();                       // markup from the active converter
editor.setHTML(html);                   // any known framework, converted (undoable)
editor.getDoc(); editor.setDoc(doc);    // the neutral model
editor.setConverter('bootstrap5', { stylesheets: [...], bodyClass: 'container' }); // re-renders
editor.setStylesheets([...]); editor.setBodyClass('...'); editor.setTheme('dark');
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
```

Global helpers on `BlockFusion` include:

- `registerConverter`, `getConverter` and `listConverters`;
- `convertHTML(html, toId, fromId?)` and `detectConverter(html)`;
- `loadHTML(html)`, which parses into the neutral model;
- `cleanPaste(html)` and `textToHtml(text)`;
- `createGridConverter` and `spanParser`;
- `DEFAULT_BLOCKS`, `CSSGRID_STYLESHEET`, `History`;
- `model`, the pure model operations;
- `plugins`, the built-in plugins.

## Converters

The editor holds content as a neutral model:

```ts
interface Doc  { rows: Row[] }
interface Row  { id; kind: 'grid' | 'raw'; cols: Col[]; raw?: string; attrs? }
interface Col  { id; kind: 'rich' | 'raw'; span: Span; html: string; attrs? }
interface Span { base: number; sm?: number; md?: number; lg?: number }   // 1..12
```

`base` applies at every width. Each breakpoint overrides it from that width up.

A converter turns this model into one framework's markup and back:

| Converter | Row | Column classes for base / sm / md / lg |
| --- | --- | --- |
| `fusioncss` | `row` | `span-t` / `span-s` / `span-m` / `span-l` + N |
| `bootstrap3` | `row` | `col-xs-` / `col-sm-` / `col-md-` / `col-lg-` + N |
| `bootstrap5` | `row` | `col-` / `col-sm-` / `col-md-` / `col-lg-` + N |
| `foundation5` | `row` | `columns` + `small-` / `medium-` / `large-` / `xlarge-` + N |
| `foundation6` | `grid-x grid-padding-x` | `cell` + `small-` / `medium-` / `large-` / `xlarge-` + N |
| `tailwind` | `grid grid-cols-12 gap-6` | `col-span-` / `sm:col-span-` / `md:col-span-` / `lg:col-span-` + N |
| `cssgrid` | `bf-grid` | `bf-col-` / `bf-sm-` / `bf-md-` / `bf-lg-` + N |

The CSS grid converter needs a stylesheet:

- The editor adds it to the canvas automatically.
- Sites using it include `dist/blockfusion-grid.css`.

### Utility classes

Converters also map the utility classes the original contentbuilder converter handled:

- **Visibility.** The neutral form is `hidden-xs`, `hidden-sm`, `hidden-md` and `hidden-lg`; "visible only at X" is stored as hidden everywhere else. Each converter writes its own form:
  - fusionCSS: `hidden-t`, `visible-m`;
  - Bootstrap 3: `hidden-xs`, `visible-md`;
  - Bootstrap 5: `d-none d-md-block`;
  - Foundation: `hide-for-small-only`, `show-for-large-only`;
  - Tailwind: `hidden md:block`;
  - CSS grid: `bf-hidden-xs`.
- **Buttons.** The neutral form is `button primary` and `button accent`, as in fusionCSS:
  - Bootstrap 3: `btn btn-default` and `btn btn-primary`, as in the original mapping;
  - Bootstrap 5: `btn btn-secondary` and `btn btn-primary`;
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

```js
{
	id: 'hero',
	name: 'Hero',
	category: 'Headers',            // optional, used by the category filter
	description: 'Large heading…',  // optional, shown and read out
	thumbnail: '/img/hero.png',     // optional; otherwise a schematic preview is drawn
	rows: [ /* neutral rows */ ]    // or a string of HTML in any known framework
}
```

There are three ways to supply blocks:

- the `blocks` option, as an array;
- the `blocksUrl` option, pointing at a JSON array;
- `editor.addBlocks([...])`, from code or a plugin.

The block list updates live. In neutral rows, ids may be empty, because fresh ids are assigned on insert. Use the neutral button and visibility classes so blocks look right in every framework.

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

### Content checker

The "Check accessibility" toolbar button lists problems, each with a "Go to" button:

- images without alt text (or with placeholder alt text);
- skipped or empty heading levels;
- links without text.

The image dialog asks for alt text unless the image is marked decorative.

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

- **Framework CSS.** `node scripts/vendor.mjs [fusionCSS dir] [axe.min.js]` fetches the framework stylesheets into `demo/vendor/` with `npm pack`, builds the Tailwind CSS, and copies fusionCSS from a local checkout. The results are committed.
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
- **Extra breakpoints.** The model has four breakpoints (base, sm, md, lg). Wider ones, such as fusionCSS `x`, Bootstrap `xl`/`xxl` and Tailwind `xl:`, stay as plain classes.
- **Foundation 5 `lg` spans.** Foundation 5 has no xlarge grid. An `lg` span is written as `xlarge-N`, which round-trips but isn't styled by Foundation 5 itself.
- **Bootstrap and Foundation breakpoint names.** These map by name, not by pixel width; for example, Bootstrap 5's `md` is 768px while fusionCSS's `m` is 992px.
- **Tailwind's default gap.** A row whose own class is exactly the default gap (`gap-6`) loses that class on a round trip, since the converter adds it anyway.
- **Comments inside rows.** A row containing HTML comments (other than raw markers) is kept as wrapped markup rather than editable columns, so the comments aren't lost.
