# AGENTS.md

Guidance for coding agents working on BlockFusion. `README.md` is the user-facing reference
(options, API, converters, blocks, plugins, accessibility). `ARCHITECTURE.md` explains the
design. This file covers the conventions and pitfalls that matter when changing the code.

## Commands

```sh
npm run build       # dist/ (esbuild): run after any src change, dist is committed
npm run typecheck   # tsc --noEmit
npm test            # vitest + jsdom
```

All three must pass before a commit. `demo/index.html` runs from `file://` and uses the
built `dist/`, so rebuild before checking anything in a browser.

## How the editor is put together

- **Neutral model is the source of truth** (`src/model`): a `Doc` of rows, each with columns
  and their spans (base/sm/md/lg/xl/xxl). Framework classes exist only at the edges: a
  converter turns them into the neutral model on load (`parse`) and back on save (`render`).
  Never store framework classes in the model, and never branch on the framework outside
  `src/converters`.
- **Never assume 12 columns.** Spans count in the document's grid (`columnsOf(doc)`,
  `editor.columns`). Pass the grid size to the span helpers, and rescale with `scaleSpan` /
  `scaleRows` when content crosses grids.
- **Every change goes through the history.** Structural changes use
  `editor.apply(label, draft => ...)`. Text changes use `editor.runText(label, (doc,
  content, colId) => ...)`, which restores the selection, normalises the content and records
  the undo step. Don't mutate the canvas DOM or `editor.doc` directly.
- **Content is read back through `editor.readCol()`**, which strips editor-only markup and
  normalises semantics: `<b>`/`<i>` become `<strong>`/`<em>`, and `<u>` becomes an underlined
  span (`semanticInline` in `src/commands/text.ts`). Keep that a single place.
- **The canvas is a same-origin iframe** carrying the site's own stylesheets, so content looks
  as it will on the site. Selection lives in the iframe document. Use `canvas.range` (saved
  on selectionchange, so it survives a dialog taking focus) and `canvas.restoreSelection()`.
- **Plugins** register commands, toolbar items and menu items through the editor API:
  `registerCommand`, `addToolbarItem`, and `addHandleAction` for the row and column menus.
  Built-in features are plugins too (`src/plugins`). Add a feature as a plugin, not by
  special-casing the editor.
- **The media provider** (`editor.media`) is optional. Every file-picking feature must still
  work with a typed URL when it's absent.

## Styling

There are two separate style layers. Don't mix them.

- **Editor chrome** (`src/styles/blockfusion.css`): toolbar, menus, dialogs. Classes are
  `bf-*`, colours only through the `--bf-*` tokens, which have light and dark values (OS
  preference, `theme` option or `data-theme`). `test/contrast.test.ts` checks every token
  pairing for AA numerically. Extend it when you add a pairing, and never tune a colour by
  eye.
- **Canvas affordances** (`src/ui/canvas-css.ts`): row and column handles, outlines, the
  "Go to" ring. These sit inside the site's page, so:
  - colours are fixed (they follow the site, not the editor theme) and must meet 3:1
    against both white and black, or carry a light and a dark ring;
  - site CSS is hostile (fusionCSS sets `.row [class*=span-] { position: static }` and
    `button:hover { background: transparent }`), so properties an affordance depends on
    are `!important`;
  - anything the editor draws over content is an overlay outside the column content (see
    `canvas.flash()`), never a class or element added to the content itself. Otherwise it
    can leak into the saved HTML.
- Keep `forced-colors` and `prefers-reduced-motion` rules up to date for anything new in
  either layer.
- The editor's `theme` and the site's colour mode are separate. The canvas iframe's
  `color-scheme` is set from the site colour mode (`canvas.setColorMode`), so a dark editor
  never darkens the page being edited.

## Accessibility (AA or better)

- Every control is a real button or input, reachable by keyboard, with a visible focus ring
  and an accessible name. Toolbar and menus follow the WAI-ARIA toolbar and menu patterns
  already in `src/ui/toolbar.ts` and `src/ui/menu.ts`. Reuse them.
- Dialogs go through `openDialog()` (`src/ui/dialog.ts`). It handles labelling, the focus trap,
  Escape and returning focus (including back into the canvas). Use `field()` and `input()`
  so labels and hints are wired up.
- Announce structural changes with `editor.announce()`: after a move, delete or insert, the
  user must hear what happened.
- Don't use colour as the only signal. Pair it with text (see the contrast status in the
  colour dialog).
- The Contrast checker (`src/plugins/checker.ts`) measures the rendered canvas with
  `src/a11y/contrast.ts`. It is a quick check, not an audit. Don't describe it as more than
  that in UI text.

## Converters

- A converter implements detect, parse and render for one framework. Generic grid behaviour
  lives in `grid.ts` and class mapping in `classmap.ts`. New frameworks reuse them.
- Round trips are tested: framework A → model → framework A must be lossless, and A → B must
  keep the layout. Add the new framework to those tests (`test/converters.test.ts`).
- Breakpoints map by name, not pixel width (see Known limitations in the README). Document
  any new lossy mapping there.

## Testing in a browser

Unit tests run in jsdom, which has no layout. Anything involving layout, computed styles,
selection or handles needs a real browser: open `demo/index.html` (headless Chrome or Edge
over CDP works) and switch frameworks. Handle and overlay bugs often show up under only one
framework's CSS.

## Commits

- `main` branch. Don't push unless asked.
- Messages describe the change for a human reader. No AI or tool attribution lines.
- Commit the rebuilt `dist/` with the source change.
