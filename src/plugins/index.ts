/** The built-in plugins, in toolbar order. */
import type { EditorOptions, Plugin } from '../types';
import { blocksPlugin } from './blocks';
import { checkerPlugin } from './checker';
import { dictationPlugin } from './dictation';
import { readAloudPlugin } from './read-aloud';
import { formattingPlugin } from './formatting';
import { helpPlugin } from './help';
import { historyPlugin } from './history';
import { insertPlugin } from './insert';
import { siteThemePlugin } from './site-theme';
import { sourcePlugin } from './source';
import { structurePlugin } from './structure';

/** Plugins added for every editor created afterwards (add-on bundles register here). */
const registered: Plugin[] = [];

/** Add a plugin to every editor created from now on. */
export function registerPlugin(plugin: Plugin): void {
	if (!registered.some((p) => p.id === plugin.id)) registered.push(plugin);
}

export function builtinPlugins(opts: EditorOptions): Plugin[] {
	return [historyPlugin, formattingPlugin, insertPlugin, dictationPlugin(opts), readAloudPlugin(opts), ...registered, blocksPlugin(opts), structurePlugin, siteThemePlugin, sourcePlugin, checkerPlugin, helpPlugin];
}

export { blocksPlugin, checkerPlugin, dictationPlugin, readAloudPlugin, formattingPlugin, helpPlugin, historyPlugin, insertPlugin, siteThemePlugin, sourcePlugin, structurePlugin };
