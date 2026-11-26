# BlockFusion architecture

BlockFusion is a WYSIWYG page-content editor built on rows, columns and blocks. It runs standalone in any web page and plugs into clearFusionCMS as an editor module (like contentbuilder or ckeditor). It has no runtime dependencies.

## Goals

- **True WYSIWYG.** Content is edited inside the site's own styling: theme stylesheets plus any extra stylesheets the host adds, with Bootstrap, fusionCSS and others rendering for real.
- **Layout.** Rows split into columns. Rows move up and down, and columns move left and right and resize.
- **Blocks.** A block is a reusable, predefined set of one or more rows. Inserting a block converts it to the active framework's markup.
- **Pluggable converters.** Each framework's grid markup is handled by a converter: fusionCSS, Bootstrap 3, 5 and 6 (alpha), Foundation 5 and 6, Tailwind and plain CSS grid. More can be registered. The grid size (12 columns by default) is configurable.
- **Pluggable file manager.** clearFusionCMS supplies its file manager (pick and upload). Other hosts can supply their own, or none.
- **Rich text.** Paragraph and heading styles, font family and size, bold, italic, underline, strikethrough, sub/superscript, quote, indent and outdent, bulleted and numbered lists, alignment, links, images, colour, clear formatting, and HTML source view.
- **Raw HTML / JavaScript rows and columns** for embeds.
- **Undo and redo** for every change, both structure and text.
- **Accessibility:** WCAG 2.2 AA or better, light and dark themes, fully keyboard operable.
- **Site colour modes.** When the site has a dark mode, the canvas can preview it, separately from the editor's own theme.
- **Optional extras:** dictation and read aloud with the browser's speech APIs, and an AI assistant (a separate bundle) with models in the browser or on a server.

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
interface Doc   { rows: Row[]; columns?: number }   // grid size, default 12
interface Row   { id: string; kind: 'grid' | 'raw'; cols: Col[]; raw?: string;
                  attrs?: { className?: string; id?: string; style?: string; tag?: string } }
interface Col   { id: string; kind: 'rich' | 'raw'; span: Span; html: string;
                  attrs?: { className?: string; style?: string } }
interface Span  { base: number; sm?; md?; lg?; xl?; xxl? }   // 1..Doc.columns (default 12)
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

- **Built in:** fusionCSS, Bootstrap 3, 5 and 6 (alpha), Foundation 5 and 6, Tailwind and plain CSS grid. The CSS grid converter ships its own small, layout-only stylesheet (`dist/blockfusion-grid.css`).
- **Round trips are tested.** `parse(render(doc))` must give back the same doc for every built-in converter, and loading content made by any converter into another converts it.
- **Unknown markup** becomes a single row holding one rich column, so nothing is lost.

## File manager and media

```ts
interface MediaProvider {
  pickImage?(opts): Promise<{ src: string; alt?: string; width?: number; height?: number } | null>;
  pickFile?(opts): Promise<{ href: string; title?: string } | null>;
  upload?(file: File): Promise<{ src: string; alt?: string }>;   // enables drag & drop / paste upload
  pickImageLabel?: string; pickFileLabel?: string;               // name the picker buttons
}
```

Without a provider the editor asks for a URL and alt text in an accessible dialog. With `pickImage`, the image dialog opens after a new image is picked, for its alt text.

## Plugins

```ts
interface Plugin { id: string; install(editor: Editor): void | (() => void) }
```

Plugins can add toolbar items, commands, panels, row and column menu items, block sources, image dialog fields and paste filters. The built-in features (formatting, blocks, structure, source, the Contrast checker, dictation, read aloud, …) are plugins, and so is the assistant. Converters are registered with `registerConverter`; the media provider is an option (`media`, `setMediaProvider`); a code editor for raw HTML (e.g. Ace) is the `codeEditor` option. A host shows the editor's messages with its own notifications through the `notify` option.

## Undo and redo

- **What a history step holds.** Each structural command is one entry with the document snapshot from before and after. Text typing is merged into one entry per pause or per column.
- **Keys.** Ctrl/Cmd+Z undoes, and Ctrl/Cmd+Shift+Z or Ctrl+Y redoes. Toolbar buttons mirror these, and their accessible labels say which step they would undo or redo.

## Accessibility

- **Toolbar.** The toolbar uses `role=toolbar` with roving tabindex and arrow keys. Each button has a visible label or a tooltip, an `aria-label`, and `aria-pressed` for formatting state.
- **Keyboard and screen readers.** Each row and column has a focusable handle with a menu, so moving, resizing, duplicating, deleting and changing settings never needs the mouse. Results are announced.
- **Dialogs.** Link, image, block picker and raw HTML use labelled dialogs that trap focus and return it to where it came from.
- **Theme and contrast.** Light and dark follow `prefers-color-scheme`, and the host can force either with `data-theme`. Colour tokens meet AA contrast. The editor respects reduced motion and works in forced-colours mode.
- **Contrast checker.** A built-in checker measures text contrast on the rendered canvas (over a gradient, against its worst colour stop), in both of the site's colour modes when it has two, and also warns about images without alt text, skipped headings and empty links. It's a quick check, not an audit.

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

- **Source:** TypeScript in `src/`. esbuild produces `dist/blockfusion.js` (IIFE, global `BlockFusion`), `dist/blockfusion.mjs`, `dist/blockfusion.css`, `dist/blockfusion-grid.css`, and the assistant bundle `dist/blockfusion-assistant.js` (global `BlockFusionAssistant`) and `.mjs`.
- **Tests:** vitest with jsdom for the model, converters and history.
- **Demo:** `demo/index.html` loads every converter and lets you switch framework live; `demo/ai.html` and `demo/ai-server.html` show the assistant with models in the browser and on a server.

## AI assistant

The assistant lives outside `blockfusion.js` (`src/assistant` and `src/plugins/assistant.ts`, built as its own bundle), so a page without AI loads none of it. The editor talks to an `AssistantProvider`: any object with `rewrite`, `chat` and/or `describeImage`.

- **`completionsAssistant`** (assistant bundle) sends OpenAI chat completions requests through the host's backend, which only relays them (`examples/relay.mjs`). Prompts, tool calls and images are built in the page.
- **`localAssistant`** (`extensions/ai`, a separate package) runs small open models in the browser with transformers.js, loaded on first use.
- **Rewrites keep formatting.** A server model gets each paragraph's HTML, sanitised on the way back; a browser model gets Markdown-style marks, with links and styled text rebuilt from the original elements.
- **Chat changes the page through tools** (add a row, write into a column, insert text), each an undo step, with an outline of the page as context.

## clearFusionCMS integration

The CMS module (`system/modules/blockfusion/` in clearFusionCMS) is separate from the editor, which doesn't depend on it.

- **Module:** `blockfusionWYSIWYG extends flFormElementWYSIWYGModule`, with the built files vendored in (`build/update-vendor.sh`).
- **Storage is the theme's framework.** The editor writes the framework set for the site theme directly, so content is stored as the site uses it; other markup is converted when it's opened.
- **File manager:** the media provider opens the manager's file and page pickers.
- **Settings:** stylesheets for the editing area, dictation, read aloud, and the in-browser assistant, whose models the CMS can serve from its own copy.
