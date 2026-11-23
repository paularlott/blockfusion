# BlockFusion architecture

BlockFusion is a WYSIWYG page-content editor built on rows, columns and blocks. It runs standalone in any web page and plugs into clearFusionCMS as an editor module (like contentbuilder or ckeditor). It has no runtime dependencies.

## Goals

- **True WYSIWYG.** Content is edited inside the site's own styling: theme stylesheets plus any extra stylesheets the host adds, with Bootstrap, fusionCSS and others rendering for real.
- **Layout.** Rows split into columns. Rows move up and down, and columns move left and right and resize.
- **Blocks.** A block is a reusable, predefined set of one or more rows. Inserting a block converts it to the active framework's markup.
- **Pluggable converters.** Each framework's grid markup is handled by a converter: fusionCSS, Bootstrap 3, Bootstrap 5, Foundation 5, Foundation 6, Tailwind and plain CSS grid. More can be registered.
- **Pluggable file manager.** clearFusionCMS supplies its file manager (pick and upload). Other hosts can supply their own, or none.
- **Rich text.** Paragraph and heading styles, font family and size, bold, italic, underline, strikethrough, sub/superscript, quote, indent and outdent, bulleted and numbered lists, alignment, links, images, colour, clear formatting, and HTML source view.
- **Raw HTML / JavaScript rows and columns** for embeds.
- **Undo and redo** for every change, both structure and text.
- **Accessibility:** WCAG 2.2 AA or better, light and dark themes, fully keyboard operable.

## Shape

```
host page
├── chrome (light DOM, styled by blockfusion.css)
│   ├── toolbar            role=toolbar, roving tabindex, text + structure tools
│   ├── side panel         blocks library, row/column settings, outline
│   └── live region        announcements ("Row moved up", "Undo: Insert block")
└── canvas <iframe>        same origin, srcdoc
    ├── <link> host stylesheets (theme CSS, bootstrap, fusionCSS, …)
    ├── canvas.css         editor affordances only (outlines, handles), prefixed bf-
    └── <body class="…">   converter.render(doc) output; one contenteditable per column
```

The canvas is an iframe so the site's CSS applies exactly and can't clash with the editor chrome or the admin UI, and so the editor's CSS can't leak into the content. The chrome lives outside it, so it always follows the editor's own light/dark theme.

## Document model (neutral)

```ts
interface Doc   { rows: Row[] }
interface Row   { id: string; kind: 'grid' | 'raw'; cols: Col[]; raw?: string;
                  attrs?: { className?: string; id?: string; style?: string; tag?: string } }
interface Col   { id: string; kind: 'rich' | 'raw'; span: Span; html: string;
                  attrs?: { className?: string; style?: string } }
interface Span  { base: number; sm?: number; md?: number; lg?: number }   // 1..12
interface Block { id: string; name: string; category?: string; thumbnail?: string;
                  description?: string; rows: Row[] | string /* HTML in any known framework */ }
```

- **The model is the source of truth for structure.** Column `html` holds the rich text of each column, read back from its contenteditable whenever it changes.
- **Output is always produced by a converter**, so switching framework re-renders the same content.

## Converters

```ts
interface Converter {
  id: string; name: string;                 // 'fusioncss', 'bootstrap5', …
  detect(root: Element): number;            // 0..1 confidence the markup is ours
  parse(root: Element): Doc;                // markup -> model
  render(doc: Doc, opts?): string;          // model -> markup
  rowClass(row: Row): string;
  colClass(col: Col): string;               // span -> e.g. "col-md-6", "span-s6"
}
BlockFusion.registerConverter(converter)
```

- **Built in:** fusionCSS, Bootstrap 3, Bootstrap 5, Foundation 5, Foundation 6, Tailwind and plain CSS grid. The CSS grid converter ships its own small stylesheet.
- **Round trips are tested.** `parse(render(doc))` must give back the same doc for every built-in converter, and loading content made by any converter into another converts it.
- **Unknown markup** becomes a single row holding one rich column, so nothing is lost.

## File manager and media

```ts
interface MediaProvider {
  pickImage?(opts): Promise<{ src: string; alt?: string; width?: number; height?: number } | null>;
  pickFile?(opts): Promise<{ href: string; title?: string } | null>;
  upload?(file: File): Promise<{ src: string; alt?: string }>;   // enables drag & drop / paste upload
}
```

Without a provider the editor asks for a URL and alt text in an accessible dialog.

## Plugins

```ts
interface Plugin { id: string; install(editor: Editor): void | (() => void) }
```

Plugins can add toolbar items, commands, panels, block sources, a code editor for raw HTML (e.g. Ace), and paste filters. The converters and the media provider are plugins too.

## Undo and redo

- **What a history step holds.** Each structural command is one entry with the document snapshot from before and after. Text typing is merged into one entry per pause or per column.
- **Keys.** Ctrl/Cmd+Z undoes, and Ctrl/Cmd+Shift+Z or Ctrl+Y redoes. Toolbar buttons mirror these, and their accessible labels say which step they would undo or redo.

## Accessibility

- **Toolbar.** The toolbar uses `role=toolbar` with roving tabindex and arrow keys. Each button has a visible label or a tooltip, an `aria-label`, and `aria-pressed` for formatting state.
- **Keyboard and screen readers.** Each row and column has a focusable handle with a menu, so moving, resizing, duplicating, deleting and changing settings never needs the mouse. Results are announced.
- **Dialogs.** Link, image, block picker and raw HTML use labelled dialogs that trap focus and return it to where it came from.
- **Theme and contrast.** Light and dark follow `prefers-color-scheme`, and the host can force either with `data-theme`. Colour tokens meet AA contrast. The editor respects reduced motion and works in forced-colours mode.
- **Content checks.** An optional built-in checker warns about images without alt text and skipped heading levels.

## API sketch

```js
const editor = BlockFusion.create(textareaOrElement, {
  converter: 'bootstrap5',              // output/editing framework
  stylesheets: ['/theme/site.css'],
  bodyClass: 'page-content',
  blocks: [...],                        // or blocksUrl
  media: myProvider,                    // optional
  fonts: [...], fontSizes: [...], colors: [...],
  theme: 'auto' | 'light' | 'dark',
  plugins: [...],
});
editor.getHTML(); editor.setHTML(html); editor.getDoc(); editor.on('change', fn);
editor.undo(); editor.redo(); editor.destroy();
```

When created on a `<textarea>`, the editor keeps the textarea updated so normal form posts work.

## Build

- **Source:** TypeScript in `src/`. esbuild produces `dist/blockfusion.js` (IIFE, global `BlockFusion`), `dist/blockfusion.mjs` and `dist/blockfusion.css`.
- **Tests:** vitest with jsdom for the model, converters and history.
- **Demo:** `demo/index.html` loads every converter and lets you switch framework live.

## clearFusionCMS integration (separate branch, separate step)

- **Module:** `system/modules/blockfusion/` with `blockfusionWYSIWYG extends flFormElementWYSIWYGModule` and the built dist vendored in.
- **Storage stays fusionCSS.** The editor edits in the theme's framework, and `transformGet`/`transformPut` convert through the converters.
- **File manager:** the media provider uses the manager file browser and its upload endpoint.
- **Settings:** stylesheets, block library and the default framework.
- **Themes:** the theme framework setting gains Bootstrap 5, Foundation 6 (split from 5), Tailwind and CSS grid, and front-end conversion covers the same set.
