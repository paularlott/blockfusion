/** Add, edit or remove a link. */
import { applyLink, linkAtSelection, removeLink } from '../../commands/text';
import type { Editor } from '../../editor';
import type { DialogButton } from '../dialog';
import { checkbox, field, input, openDialog } from '../dialog';
import { h } from '../dom';

export async function linkDialog(editor: Editor): Promise<void> {
	if (!editor.canvas.selectionCol) {
		editor.announce('Place the cursor in a text column first');
		return;
	}
	const existing = linkAtSelection(editor);
	const range = editor.canvas.range;
	const selected = range && !range.collapsed ? range.toString() : '';

	const href = input({ type: 'text', required: true, inputmode: 'url', autocomplete: 'url', value: existing?.getAttribute('href') ?? '' });
	const text = input({ value: existing?.textContent ?? selected });
	const title = input({ value: existing?.getAttribute('title') ?? '' });
	const newTab = checkbox('Open in a new tab', existing?.target === '_blank');
	const body: HTMLElement[] = [field('Address (URL)', href, 'For example https://example.com, /about or mailto:name@example.com')];
	if (editor.media?.pickFile) {
		body.push(
			h(
				'div',
				{ className: 'bf-field' },
				h(
					'button',
					{
						type: 'button',
						className: 'bf-btn',
						onclick: async () => {
							const res = await editor.media!.pickFile!({ current: href.value });
							if (res) {
								href.value = res.href;
								if (!text.value && res.title) text.value = res.title;
							}
							href.focus();
						},
					},
					editor.media.pickFileLabel ?? 'Browse files…',
				),
			),
		);
	}
	// Text can only be set when it is not an existing multi-node selection.
	if (existing || !selected) body.push(field('Link text', text));
	body.push(field('Title (optional)', title), newTab.wrap);

	const extra: DialogButton[] = existing
		? [{ label: 'Remove link', danger: true, onClick: (close) => (close(false), removeLink(editor, existing)) }]
		: [];

	await openDialog(editor.root, {
		title: existing ? 'Edit link' : 'Add link',
		body,
		extra,
		submitLabel: existing ? 'Save link' : 'Add link',
		onSubmit: () => {
			const url = href.value.trim();
			if (/^\s*(javascript|vbscript|data):/i.test(url)) {
				href.setCustomValidity('This kind of address is not allowed.');
				href.reportValidity();
				href.setCustomValidity('');
				return false;
			}
			applyLink(editor, { href: url, text: text.value.trim() || undefined, newTab: newTab.input.checked, title: title.value.trim() || undefined }, existing);
			editor.announce(existing ? 'Link updated' : 'Link added');
		},
	});
}
