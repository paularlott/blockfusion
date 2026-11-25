/**
 * blockfusion-assistant: the AI assistant, kept out of the editor so a page
 * that doesn't use AI doesn't download it.
 *
 *   <script src="blockfusion.js"></script>
 *   <script src="blockfusion-assistant.js"></script>   (registers itself)
 *
 * or, as modules:
 *
 *   import * as BlockFusion from './blockfusion.mjs';
 *   import { assistantPlugin } from './blockfusion-assistant.mjs';
 *   BlockFusion.use(assistantPlugin);   // or plugins: [assistantPlugin]
 *
 * Then give editors an `assistant` provider (httpAssistant, or the
 * blockfusion-ai extension for models in the browser).
 */
import { assistantPlugin, DEFAULT_ASSISTANT_ACTIONS } from '../plugins/assistant';
import type { Plugin } from '../types';
import { httpAssistant } from './http';

export { assistantPlugin, DEFAULT_ASSISTANT_ACTIONS, httpAssistant };
export { callKey, pageContext, PAGE_TOOLS, runPageTool } from './tools';

// Loaded as a script after blockfusion.js: register with the editor straight away
const g = globalThis as { BlockFusion?: { use?(p: Plugin): void } };
g.BlockFusion?.use?.(assistantPlugin);
