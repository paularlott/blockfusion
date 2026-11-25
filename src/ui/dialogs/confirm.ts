/** A yes/no question before something destructive. */
import type { Editor } from '../../editor';
import { openDialog } from '../dialog';
import { h } from '../dom';

export interface ConfirmOptions {
	title: string;
	message: string;
	/** Label of the confirming button, e.g. "Delete row". */
	confirmLabel: string;
	/** Style the confirming button as destructive. Default true. */
	danger?: boolean;
}

/** Resolves true when confirmed. Escape, Cancel and the close button say no. */
export function confirmDialog(editor: Editor, opts: ConfirmOptions): Promise<boolean> {
	return openDialog(editor.root, {
		title: opts.title,
		body: h('p', { className: 'bf-dialog-message' }, opts.message),
		submitLabel: opts.confirmLabel,
		danger: opts.danger !== false,
	});
}
