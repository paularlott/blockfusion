# Plugins

```ts
interface Plugin { id: string; install(editor: Editor): void | (() => void) }
```

Pass plugins in `options.plugins`, or call `editor.use(plugin)`. The function `install` returns, if any, runs on `destroy()`.

The built-in features are plugins themselves (`BlockFusion.plugins`): `historyPlugin`, `formattingPlugin`, `insertPlugin`, `dictationPlugin(options)`, `readAloudPlugin(options)`, `blocksPlugin(options)`, `structurePlugin`, `siteThemePlugin`, `sourcePlugin`, `checkerPlugin` and `helpPlugin`. The assistant is a plugin too (`assistantPlugin`, in the assistant bundle). A plugin can do the following:

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
		// Toolbar items: buttons, menus (with menuitemradio items), split buttons
		// ({ type: 'split', command, items }: a command plus a menu) and separators.
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

## Code editor hook (e.g. Ace)

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
