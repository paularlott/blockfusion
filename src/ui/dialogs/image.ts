/** Insert or edit an image: media provider, upload, or URL and alt text. */
import { applyImage } from '../../commands/text';
import type { Editor } from '../../editor';
import { checkbox, field, input, openDialog } from '../dialog';
import { h } from '../dom';

export async function imageDialog(editor: Editor): Promise<void> {
	if (!editor.canvas.selectionCol) {
		editor.announce('Place the cursor in a text column first');
		return;
	}
	const existing = editor.selectedImage?.isConnected ? editor.selectedImage : null;

	// A host file manager replaces the dialog for new images.
	if (!existing && editor.media?.pickImage) {
		const res = await editor.media.pickImage({});
		if (res) {
			applyImage(editor, { src: res.src, alt: res.alt ?? '', width: res.width, height: res.height }, null);
			if (!res.alt) editor.announce('Image inserted without alt text. Select it and use the image button to describe it.');
		}
		return;
	}

	const src = input({ required: true, inputmode: 'url', value: existing?.getAttribute('src') ?? '' });
	const alt = input({ value: existing?.getAttribute('alt') ?? '' });
	const decorative = checkbox('Decorative image (no alt text)', existing ? existing.getAttribute('alt') === '' : false);
	const width = input({ type: 'number', min: '1', inputmode: 'numeric', value: existing?.getAttribute('width') ?? '' });
	const sync = () => {
		alt.disabled = decorative.input.checked;
		alt.required = !decorative.input.checked;
	};
	decorative.input.addEventListener('change', sync);
	sync();

	const body: HTMLElement[] = [field('Image address (URL)', src)];
	const tools = h('div', { className: 'bf-field bf-row-buttons' });
	if (editor.media?.pickImage) {
		tools.append(
			h('button', {
				type: 'button',
				className: 'bf-btn',
				onclick: async () => {
					const res = await editor.media!.pickImage!({ current: { src: src.value, alt: alt.value } });
					if (res) {
						src.value = res.src;
						if (res.alt) alt.value = res.alt;
					}
					src.focus();
				},
			}, 'Browse images…'),
		);
	}
	if (editor.media?.upload) {
		const file = h('input', { type: 'file', accept: 'image/*', className: 'bf-file', id: 'bf-upload-' + Date.now() });
		file.addEventListener('change', async () => {
			const f = file.files?.[0];
			if (!f) return;
			editor.announce(`Uploading ${f.name}`);
			try {
				const res = await editor.media!.upload!(f);
				src.value = res.src;
				if (res.alt && !alt.value) alt.value = res.alt;
				editor.announce('Upload complete');
			} catch {
				editor.announce('Upload failed');
			}
		});
		tools.append(h('label', { for: file.id, className: 'bf-label' }, 'Upload a file'), file);
	}
	if (tools.childNodes.length) body.push(tools);
	body.push(
		field('Alternative text', alt, 'Describe the image for people who cannot see it.'),
		decorative.wrap,
		field('Width in pixels (optional)', width),
	);

	await openDialog(editor.root, {
		title: existing ? 'Edit image' : 'Add image',
		body,
		submitLabel: existing ? 'Save image' : 'Add image',
		onSubmit: () => {
			applyImage(
				editor,
				{
					src: src.value.trim(),
					alt: decorative.input.checked ? '' : alt.value.trim(),
					width: Number(width.value) || undefined,
				},
				existing,
			);
			editor.announce(existing ? 'Image updated' : 'Image added');
		},
	});
}
