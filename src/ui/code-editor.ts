/**
 * The default code editor: a plain, labelled textarea. Tab keeps its normal
 * meaning (move focus) so keyboard users are never trapped. Hosts can swap
 * in a richer editor with `editor.setCodeEditor()` (see the Ace example in
 * the README).
 */
import type { CodeEditorFactory } from '../types';

export const textareaCodeEditor: CodeEditorFactory = (host, opts) => {
	const ta = document.createElement('textarea');
	ta.className = 'bf-input bf-code';
	ta.value = opts.value;
	ta.spellcheck = false;
	ta.setAttribute('autocapitalize', 'off');
	ta.setAttribute('autocomplete', 'off');
	ta.setAttribute('aria-labelledby', opts.labelId);
	ta.rows = 16;
	host.appendChild(ta);
	return {
		getValue: () => ta.value,
		focus: () => ta.focus(),
		destroy: () => ta.remove(),
	};
};
