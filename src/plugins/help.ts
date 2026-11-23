/** Keyboard help: lists shortcuts and how to edit structure from the keyboard. */
import type { Plugin } from '../types';
import { openDialog } from '../ui/dialog';
import { h } from '../ui/dom';
import { describeShortcut } from '../ui/toolbar';

export const helpPlugin: Plugin = {
	id: 'help',
	install(editor) {
		editor.registerCommand({
			id: 'help',
			label: 'Keyboard help',
			icon: 'help',
			shortcut: 'Mod+/',
			run: (ed) => {
				const rows: Array<[string, string]> = [
					['Move to the toolbar', 'Alt+F10'],
					['Leave text for the column handle', 'Escape'],
					['Open a handle menu', 'Enter, Space or Down arrow'],
					['Move a row', 'Alt+Up / Alt+Down on its handle'],
					['Move a column', 'Alt+Left / Alt+Right on its handle'],
					['Resize a column', 'Alt+Shift+Left / Right on its handle'],
					['Delete a row or column', 'Delete on its handle'],
				];
				for (const cmd of ed.commands.values()) {
					if (cmd.shortcut) rows.push([cmd.label, describeShortcut(cmd.shortcut).text]);
				}
				const table = h(
					'table',
					{ className: 'bf-keys' },
					h('caption', { className: 'bf-sr-only' }, 'Keyboard shortcuts'),
					h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Action'), h('th', { scope: 'col' }, 'Keys'))),
					h('tbody', {}, ...rows.map(([a, k]) => h('tr', {}, h('td', {}, a), h('td', {}, h('kbd', {}, k))))),
				);
				void openDialog(ed.root, { title: 'Keyboard help', body: h('div', { className: 'bf-keys-wrap', tabindex: '0', role: 'region', 'aria-label': 'Shortcut list' }, table), submitLabel: null, wide: true });
			},
		});
		editor.addToolbarItem({ type: 'button', id: 'help', command: 'help' });
	},
};
