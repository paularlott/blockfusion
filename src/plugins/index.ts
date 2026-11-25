/** The built-in plugins, in toolbar order. */
import type { EditorOptions, Plugin } from '../types';
import { blocksPlugin } from './blocks';
import { checkerPlugin } from './checker';
import { formattingPlugin } from './formatting';
import { helpPlugin } from './help';
import { historyPlugin } from './history';
import { insertPlugin } from './insert';
import { siteThemePlugin } from './site-theme';
import { sourcePlugin } from './source';
import { structurePlugin } from './structure';

export function builtinPlugins(opts: EditorOptions): Plugin[] {
	return [historyPlugin, formattingPlugin, insertPlugin, blocksPlugin(opts), structurePlugin, siteThemePlugin, sourcePlugin, checkerPlugin, helpPlugin];
}

export { blocksPlugin, checkerPlugin, formattingPlugin, helpPlugin, historyPlugin, insertPlugin, siteThemePlugin, sourcePlugin, structurePlugin };
