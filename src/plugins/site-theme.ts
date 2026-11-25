/**
 * Site colour mode preview: a toolbar toggle that shows the page in the
 * site's dark mode, using the site's own switch (see the siteTheme option).
 * It appears only when the editor knows how the site switches.
 */
import type { Plugin } from '../types';

export const siteThemePlugin: Plugin = {
	id: 'siteTheme',
	install(editor) {
		editor.registerCommand({
			id: 'colorMode',
			label: 'Preview dark mode',
			icon: 'moon',
			isActive: (ed) => ed.colorMode === 'dark',
			isEnabled: (ed) => !!ed.siteTheme,
			run: (ed) => {
				ed.setColorMode(ed.colorMode === 'dark' ? 'light' : 'dark');
				ed.announce(ed.colorMode === 'dark' ? 'Previewing the site in dark mode' : 'Previewing the site in light mode');
			},
		});
		const item = { type: 'button', id: 'colorMode', command: 'colorMode', toggle: true } as const;
		const sync = () => {
			if (editor.siteTheme) editor.addToolbarItem(item, { after: 'width' });
			else editor.removeToolbarItem('colorMode');
		};
		if (editor.siteTheme) editor.addToolbarItem(item, { after: 'width' });
		return editor.on('sitethemechange', sync);
	},
};
