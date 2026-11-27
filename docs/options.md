# Options

| Option | Default | Description |
| --- | --- | --- |
| `converter` | `'fusioncss'` | Output and editing framework: `fusioncss`, `bootstrap3`, `bootstrap5`, `bootstrap6`, `foundation5`, `foundation6`, `tailwind`, `cssgrid`, or any registered id. |
| `columns` | the converter's (12) | Columns in the site's grid, for a build with another count (fusionCSS `@numColumns`, Bootstrap `$grid-columns`, ...). See [Grid size](frameworks.md#grid-size). |
| `siteTheme` | see [Site colour modes](frameworks.md#site-colour-modes) | How the site switches light/dark, so the canvas can preview both. `false` turns the preview off. |
| `colorMode` | `'light'` | Colour mode the canvas starts in when the site has one. |
| `stylesheets` | `[]` | Stylesheet URLs loaded into the canvas: theme CSS, framework CSS or a Tailwind build. |
| `bodyClass` | `''` | Class for the canvas `<body>`, e.g. `container`. |
| `canvasCss` | `''` | Extra CSS for the canvas, added after the stylesheets. |
| `value` | textarea value or element HTML | Initial HTML. Markup for any known framework is detected and converted. |
| `blocks` | `[]` | Extra blocks (see [Blocks](blocks.md)). |
| `blocksUrl` | none | URL of a JSON array of blocks, fetched on start. |
| `defaultBlocks` | `true` | Include the 14 built-in blocks. |
| `media` | none | A [media provider](media.md). |
| `fonts` | four defaults | `[{ name, value }]` for the font menu. `value` is a CSS `font-family`. |
| `fontSizes` | five defaults | `[{ name, value }]` for the size menu. `value` is a CSS length. |
| `colors` | ten defaults | `[{ name, value }]` for the text colour menu. The defaults all have at least 4.5:1 contrast on white. |
| `theme` | `'auto'` | The editor's own light/dark. `'auto'` follows a `data-theme="light\|dark"` attribute on an ancestor, then `prefers-color-scheme`. `'light'` or `'dark'` forces one. It doesn't change how the page being edited looks (see `siteTheme`). |
| `chordKey` | `'Mod+;'` | First key of the two-step shortcuts (Mod+; then B opens the block menu). `false` turns them off. |
| `breakpoint` | `'md'` | Breakpoint that new layouts and resizes apply to (`sm`, `md`, `lg`, `xl` or `xxl`). Columns stack below it. |
| `height` | `'auto'` | `'auto'` grows the canvas with its content. Any CSS length fixes it and scrolls. |
| `minHeight` | `'320px'` | Minimum canvas height in auto mode. |
| `label` | `'Page editor'` | Accessible name of the editor region. |
| `rawMarkers` | `true` | Wrap raw code in `<!--bf:raw-->…<!--/bf:raw-->` so it's recognised again on load. |
| `fluidImages` | `true` | Give inserted, uploaded and edited images the framework's fluid image class (`img-fluid`, `img-responsive`, `bf-img`, ...) so a large image shrinks to fit its column. See [Frameworks](frameworks.md). |
| `toolbar` | all items | Toolbar item ids in order, with `'\|'` for a separator. |
| `codeEditor` | textarea | A code editor factory (see [the Ace example](plugins.md#code-editor-hook-eg-ace)). |
| `plugins` | `[]` | Extra [plugins](plugins.md). |
| `lang`, `dir` | page values | Language and direction of the content, set on the canvas. |
| `notify` | the editor's toasts | `(message, kind, { key }) => remove?`: show the editor's messages with the page's own notifications. Return a function that removes the message. |
| `dictation` | `false` | `true`, or a speech provider, for the microphone button (see [Dictation](speech.md#dictation)). |
| `readAloud` | `false` | `true`, or `{ voice, rate }`, for the Read aloud button (see [Read aloud](speech.md#read-aloud)). |
| `assistant` | none | An AI [assistant provider](ai-assistant.md). Needs the assistant bundle. |
| `assistantActions` | four defaults | The assistant's one-shot actions, `[{ id, label, prompt }]`; `[]` for none. |
| `assistantChat` | `false` | Offer the assistant's chat, when the provider can chat. |

The toolbar sticks to the top of the window as the page scrolls, and an open side panel stays just below it. A host page with its own sticky bar sets the CSS variable `--bf-sticky-top` (on the editor or an ancestor) to that bar's height, so the toolbar sits below it.

The default toolbar ids are:

```
undo redo | block font size | bold italic underline strike subscript superscript color clear |
ul ol outdent indent quote | alignLeft alignCenter alignRight alignJustify | link image dictate readAloud | blocks addRow addRaw width colorMode |
source check assistant help
```

`width` is Preview width (see how the page looks at each breakpoint). `dictate`, `readAloud` and `assistant` appear only when turned on; the assistant adds its button before `help`. `colorMode` only appears when the editor knows how the site switches light and dark, and `blocks` (with the canvas's Add block button) only when blocks are set up: the built-in ones, the `blocks` option or `blocksUrl` (shown straight away, while it loads), or blocks added with `addBlocks()`.
