/** Raw HTML/JavaScript editing, and the whole-document source view. */
import type { Editor } from '../../editor';
import { h, nextId } from '../dom';
import { openDialog } from '../dialog';

export interface CodeDialogOptions {
	title: string;
	label: string;
	value: string;
	description?: string;
	submitLabel?: string;
	/** Extra fields shown above the code (e.g. a layout choice). */
	extra?: HTMLElement;
}

/** Edit code with the configured code editor. Resolves with the new code, or null. */
export function codeDialog(editor: Editor, opts: CodeDialogOptions): Promise<string | null> {
	const labelId = nextId('bf-code-label');
	const host = h('div', { className: 'bf-code-host' });
	const wrap = h('div', { className: 'bf-field' }, h('label', { id: labelId, className: 'bf-label' }, opts.label), host);
	const instance = editor.codeEditor(host, { value: opts.value, mode: 'html', label: opts.label, labelId });
	// Clicking the label focuses the editor, whatever it is.
	wrap.querySelector('label')!.addEventListener('click', () => instance.focus());
	let value: string | null = null;
	const done = openDialog(editor.root, {
		title: opts.title,
		description: opts.description,
		body: opts.extra ? [opts.extra, wrap] : wrap,
		wide: true,
		submitLabel: opts.submitLabel ?? 'Save',
		onSubmit: () => {
			value = instance.getValue();
		},
	}).then((ok) => {
		instance.destroy?.();
		return ok ? value : null;
	});
	instance.focus();
	return done;
}
