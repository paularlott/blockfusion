/**
 * Custom text colour: any CSS colour, typed or picked, with a live preview
 * on the background behind the selection and its contrast ratio.
 */
import { backgroundBehind, contrastRatio, formatRatio, isLargeText, requiredRatio, toRGBA } from '../../a11y/contrast';
import { applyInlineStyle, currentStyle } from '../../commands/text';
import type { Editor } from '../../editor';
import { input, openDialog } from '../dialog';
import { h } from '../dom';
import { colorField, toHexColor } from './settings';

export async function textColorDialog(editor: Editor): Promise<void> {
	const range = editor.canvas.range;
	if (!range || range.collapsed) {
		editor.announce('Select some text first');
		return;
	}
	const start = range.startContainer;
	const anchor = (start.nodeType === 1 ? start : start.parentElement) as Element | null;
	const win = editor.canvas.doc.defaultView!;
	const bg = anchor ? backgroundBehind(anchor) : null;
	const cs = anchor ? win.getComputedStyle(anchor) : null;
	const large = cs ? isLargeText(parseFloat(cs.fontSize) || 16, parseInt(cs.fontWeight, 10) || 400) : false;
	const need = requiredRatio(large);

	const initial = currentStyle(editor, 'color') ?? (cs ? cs.color : '');
	const text = input({ value: currentStyle(editor, 'color') ?? '', autocomplete: 'off', spellcheck: 'false', required: true });
	const picker = h('input', { type: 'color', className: 'bf-color', 'aria-label': 'Pick text colour', value: toHexColor(initial) ?? '#000000' }) as HTMLInputElement;

	const sample = h('p', { className: 'bf-color-sample', 'aria-hidden': 'true' }, 'Sample text');
	if (bg) sample.style.backgroundColor = `rgb(${bg[0]}, ${bg[1]}, ${bg[2]})`;
	if (cs) {
		sample.style.fontSize = cs.fontSize;
		sample.style.fontWeight = cs.fontWeight;
		sample.style.fontFamily = cs.fontFamily;
	}
	const status = h('p', { className: 'bf-hint bf-contrast', 'aria-live': 'polite' });

	const update = () => {
		const v = text.value.trim();
		const c = v ? toRGBA(v) : null;
		const valid = !!v && !!toHexColor(v);
		sample.style.color = valid ? v : '';
		if (!valid || !c) {
			status.textContent = v ? 'Not a colour the browser understands.' : '';
			status.dataset.state = v ? 'bad' : '';
			return;
		}
		if (!bg) {
			status.textContent = 'The background here is an image or gradient, so contrast can’t be measured. Check it by eye.';
			status.dataset.state = 'warn';
			return;
		}
		const fg = [c[0] * c[3] + bg[0] * (1 - c[3]), c[1] * c[3] + bg[1] * (1 - c[3]), c[2] * c[3] + bg[2] * (1 - c[3])] as [number, number, number];
		const ratio = contrastRatio(fg, bg);
		const ok = ratio >= need;
		status.textContent = `Contrast ${formatRatio(ratio)} with the background: ${ok ? 'passes' : 'too low'} (${large ? 'large' : 'normal'} text needs ${need}:1).`;
		status.dataset.state = ok ? 'ok' : 'bad';
	};
	picker.addEventListener('input', () => {
		text.value = picker.value;
		update();
	});
	text.addEventListener('input', () => {
		const hex = toHexColor(text.value);
		if (hex) picker.value = hex;
		update();
	});
	update();

	await openDialog(editor.root, {
		title: 'Custom text colour',
		body: [colorField(text, picker, 'Colour', 'Any CSS colour, e.g. #1a5f7a or rgb(26 95 122)'), sample, status],
		submitLabel: 'Apply colour',
		initialFocus: text,
		onSubmit: () => {
			const v = text.value.trim();
			if (!toHexColor(v)) {
				text.setCustomValidity(v ? 'Enter a valid CSS colour.' : 'Enter a colour.');
				text.reportValidity();
				text.setCustomValidity('');
				return false;
			}
			applyInlineStyle(editor, `Colour: ${v}`, 'color', v);
		},
	});
}
