# Development

## Building and the demos

```sh
npm install
npm run build        # dist/blockfusion.js, .mjs, .css, -grid.css, -assistant.js and .mjs (esbuild)
npm run watch        # rebuild on change
npm test             # vitest + jsdom
npm run typecheck    # tsc --noEmit
npm run demo         # serves the repo on http://localhost:8080; open /demo/
```

The demo (`demo/index.html`) runs the editor on a textarea in a form. It has:

- a framework switcher (Bootstrap 5 and 6 and the Tailwind build have a dark mode, so the Preview dark mode toggle shows for them);
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
  converters/   generic grid converter, the eight frameworks, class mapping, detection
  history/      undo/redo with typing merge
  paste/        paste cleaning
  commands/     text and structure commands
  plugins/      built-in plugins (formatting, insert, blocks, structure, source, checker, help, history,
                dictation, read aloud, site theme) and the assistant's UI
  assistant/    assistant bundle: completionsAssistant, page tools, formatting marks, sanitising
  a11y/         contrast maths
  ui/           canvas, toolbar, menus, dialogs, live region, icons
  blocks/       built-in blocks
  styles/       editor chrome CSS
  editor.ts     the Editor class
  index.ts      public entry (global BlockFusion)
extensions/ai/  blockfusion-ai: localAssistant, models in the browser
examples/       relay.mjs, a backend for completionsAssistant
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
