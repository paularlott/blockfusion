/** Insert or edit an image: media provider, upload, or URL and alt text. */
import { applyImage } from '../../commands/text';
import type { Editor } from '../../editor';
import type { ImageDialogAddition } from '../../types';
import { checkbox, field, input, openDialog } from '../dialog';
import { h } from '../dom';

/** `suggest`: start Suggest a description as soon as the dialog opens. */
export async function imageDialog(editor: Editor, opts: { suggest?: boolean } = {}): Promise<void> {
	if (!editor.canvas.selectionCol) {
		editor.announce('Place the cursor in a text column first');
		return;
	}
	const existing = editor.selectedImage?.isConnected ? editor.selectedImage : null;

	// A host file manager picks a new image first; the dialog then opens with
	// it filled in, so the image gets alt text (or is marked decorative).
	let picked: { src: string; alt?: string; width?: number; height?: number } | null = null;
	if (!existing && editor.media?.pickImage) {
		picked = await editor.media.pickImage({});
		if (!picked) return;
	}

	const src = input({ required: true, inputmode: 'url', value: existing?.getAttribute('src') ?? picked?.src ?? '' });
	const alt = input({ value: existing?.getAttribute('alt') ?? picked?.alt ?? '' });
	const decorative = checkbox('Decorative image (no alt text)', existing ? existing.getAttribute('alt') === '' : false);
	const width = input({
		type: 'number',
		min: '1',
		inputmode: 'numeric',
		value: existing?.getAttribute('width') ?? (picked?.width ? String(picked.width) : ''),
	});
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
			}, editor.media.pickImageLabel ?? 'Browse images…'),
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
	const altField = field('Alternative text', alt, 'Describe the image for people who cannot see it.');
	body.push(altField);
	// Plugins add their own fields (the assistant's Suggest a description)
	const hooks = editor.imageDialogHooks
		.map((hook) =>
			hook({
				editor,
				src,
				alt,
				setDescribed: () => {
					decorative.input.checked = false;
					sync();
				},
			}),
		)
		.filter((x): x is ImageDialogAddition => !!x);
	for (const x of hooks) if (x.field) body.push(x.field);
	body.push(
		decorative.wrap,
		field('Width in pixels (optional)', width),
	);

	const done = openDialog(editor.root, {
		title: existing ? 'Edit image' : 'Add image',
		body,
		submitLabel: existing ? 'Save image' : 'Add image',
		// A picked image only needs describing
		initialFocus: picked ? alt : null,
		onSubmit: () => {
			const w = Number(width.value) || undefined;
			applyImage(
				editor,
				{
					src: src.value.trim(),
					alt: decorative.input.checked ? '' : alt.value.trim(),
					width: w,
					// The picker's height still fits while the picked image and width are kept
					height: picked && src.value.trim() === picked.src && w === picked.width ? picked.height : undefined,
				},
				existing,
			);
			editor.announce(existing ? 'Image updated' : 'Image added');
		},
	});
	if (opts.suggest) for (const x of hooks) x.start?.();
	await done;
	for (const x of hooks) x.close?.();
}
