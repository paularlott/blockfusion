/** Undo and redo commands; their labels name the step they would take back. */
import type { Plugin } from '../types';

export const historyPlugin: Plugin = {
	id: 'history',
	install(editor) {
		editor.registerCommand({
			id: 'undo',
			get label() {
				const l = editor.history.undoLabel;
				return l ? `Undo ${l}` : 'Undo';
			},
			icon: 'undo',
			shortcut: 'Mod+Z',
			run: (ed) => ed.undo(),
			isEnabled: (ed) => ed.history.canUndo,
		});
		editor.registerCommand({
			id: 'redo',
			get label() {
				const l = editor.history.redoLabel;
				return l ? `Redo ${l}` : 'Redo';
			},
			icon: 'redo',
			shortcut: 'Mod+Shift+Z',
			run: (ed) => ed.redo(),
			isEnabled: (ed) => ed.history.canRedo,
		});
		editor.addToolbarItem({ type: 'button', id: 'undo', command: 'undo' });
		editor.addToolbarItem({ type: 'button', id: 'redo', command: 'redo' });
		editor.addToolbarItem({ type: 'separator', id: 'sep-history' });
		// Keep the labels current as the history changes.
		return editor.on('change', () => editor.toolbar.update());
	},
};
