/** Links and images (through the media provider when there is one). */
import { linkAtSelection } from '../commands/text';
import type { Plugin } from '../types';
import { imageDialog } from '../ui/dialogs/image';
import { linkDialog } from '../ui/dialogs/link';

export const insertPlugin: Plugin = {
	id: 'insert',
	install(editor) {
		const hasText = () => !!editor.canvas.selectionCol;
		editor.registerCommand({
			id: 'link',
			label: 'Link',
			icon: 'link',
			shortcut: 'Mod+K',
			text: true,
			isEnabled: hasText,
			isActive: (ed) => !!linkAtSelection(ed),
			run: (ed) => linkDialog(ed),
		});
		editor.registerCommand({
			id: 'image',
			label: 'Image',
			icon: 'image',
			text: true,
			isEnabled: hasText,
			isActive: (ed) => !!ed.selectedImage?.isConnected,
			run: (ed, arg) => imageDialog(ed, (arg as { suggest?: boolean } | undefined) ?? {}),
		});
		editor.addToolbarItem({ type: 'button', id: 'link', command: 'link', toggle: true });
		editor.addToolbarItem({ type: 'button', id: 'image', command: 'image' });
		editor.addToolbarItem({ type: 'separator', id: 'sep-insert' });
	},
};
