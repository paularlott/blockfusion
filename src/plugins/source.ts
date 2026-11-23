/** HTML source view of the whole document, as the active converter writes it. */
import type { Plugin } from '../types';
import { codeDialog } from '../ui/dialogs/code';

export const sourcePlugin: Plugin = {
	id: 'source',
	install(editor) {
		editor.registerCommand({
			id: 'source',
			label: 'HTML source',
			icon: 'source',
			shortcut: 'Mod+Alt+U',
			run: async (ed) => {
				const current = ed.getHTML();
				const code = await codeDialog(ed, {
					title: 'HTML source',
					label: `HTML (${ed.converter.name})`,
					value: current,
					description: 'Edit the page as HTML. Markup for any supported framework is converted when you apply it.',
					submitLabel: 'Apply',
				});
				if (code !== null && code !== current) {
					ed.setHTML(code, { label: 'Edit HTML source' });
					ed.announce('HTML source applied');
				}
			},
		});
		editor.addToolbarItem({ type: 'separator', id: 'sep-tools' });
		editor.addToolbarItem({ type: 'button', id: 'source', command: 'source' });
	},
};
