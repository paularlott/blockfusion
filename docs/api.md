# API

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
editor.notify('Saved', 'info');         // a toast (also announced), or the host's own with the notify option
editor.clearNotices();                  // remove toasts (all, or those with a key)
editor.ready.then(() => {});            // canvas loaded
editor.destroy();                       // restores the textarea (or writes the HTML back into the element)

editor.setMediaProvider(provider);      // see Media provider
editor.addBlocks(blocks); editor.loadBlocks(url);
editor.refreshSiteTheme();              // re-detect the site's colour mode after its CSS changes
editor.focusCanvas();                   // put the caret back in the content
editor.readCol(colId);                  // a column's content as clean HTML
editor.togglePanel('blocks'); editor.showPanel(id); editor.closePanel();

editor.on('change', () => {});          // editor.off(event, fn) removes a listener
editor.on('ready', () => {});
editor.on('selectionchange', ({ rowId, colId }) => {});
editor.on('converterchange', ({ id }) => {});
editor.on('colormodechange', ({ mode }) => {});
editor.on('sitethemechange', ({ available }) => {});
editor.on('blockschange', () => {});    // blocks added or loaded
editor.on('destroy', () => {});

BlockFusion.use(plugin);                // add a plugin to every editor created from now on
BlockFusion.get(element);               // the editor created on an element
BlockFusion.version;
```

Global helpers on `BlockFusion` include:

- `registerConverter`, `getConverter` and `listConverters`;
- `convertHTML(html, toId, fromId?)` and `detectConverter(html)`;
- `loadHTML(html)`, which parses into the neutral model;
- `cleanPaste(html)` and `textToHtml(text)`;
- `createGridConverter` and `spanParser`;
- `builtinConverters` and `parseWith(converter, html)`;
- `DEFAULT_BLOCKS`, `placeholder(w, h, label)` (an SVG placeholder image for blocks), `CSSGRID_STYLESHEET`, `cssGridStylesheet(columns)`, `History`;
- `checkContent(editor)`, the Contrast checker's findings as data;
- `webSpeechDictation()`, the browser's speech recognition as a dictation provider;
- `model`, the pure model operations;
- `plugins`, the built-in plugins;
- `Editor`, the editor class.
