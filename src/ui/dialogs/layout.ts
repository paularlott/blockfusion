/** Column layout picker for new rows. */
import type { Editor } from '../../editor';
import { parseLayout } from '../../model/doc';
import { h, nextId } from '../dom';
import { field, input, openDialog } from '../dialog';

/** Preset layouts, in twelfths; scaled to the grid and offered when they divide exactly. */
export const LAYOUTS: Array<{ name: string; spans: number[] }> = [
	{ name: 'One column', spans: [12] },
	{ name: 'Two halves', spans: [6, 6] },
	{ name: 'Three thirds', spans: [4, 4, 4] },
	{ name: 'Four quarters', spans: [3, 3, 3, 3] },
	{ name: 'Two thirds and one third', spans: [8, 4] },
	{ name: 'One third and two thirds', spans: [4, 8] },
];

/** A small picture of a layout: one box per column, sized by span. */
export function layoutPreview(spans: number[]): HTMLElement {
	const box = h('span', { className: 'bf-layout-preview', 'aria-hidden': 'true' });
	for (const s of spans) box.append(h('span', { style: `flex:${s} 1 0` }));
	return box;
}

/** The presets that fit a grid of `columns`, with spans in that grid. */
export function layoutsFor(columns: number): Array<{ name: string; spans: number[] }> {
	return LAYOUTS.filter((l) => l.spans.every((s) => (s * columns) % 12 === 0)).map((l) => ({
		name: l.name,
		spans: l.spans.map((s) => (s * columns) / 12),
	}));
}

export function layoutDialog(editor: Editor, title = 'Add row'): Promise<number[] | null> {
	const name = nextId('bf-layout');
	const columns = editor.columns;
	const layouts = layoutsFor(columns);
	let result: number[] | null = null;
	const radios: HTMLInputElement[] = [];
	const list = h('div', { className: 'bf-layouts' });
	layouts.forEach((l, i) => {
		const id = `${name}-${i}`;
		const r = h('input', { type: 'radio', name, id, value: String(i), className: 'bf-radio', checked: i === 0 });
		radios.push(r);
		list.append(h('label', { for: id, className: 'bf-layout' }, r, layoutPreview(l.spans), h('span', {}, l.name)));
	});
	const customId = `${name}-custom`;
	const customRadio = h('input', { type: 'radio', name, id: customId, value: 'custom', className: 'bf-radio' });
	radios.push(customRadio);
	list.append(h('label', { for: customId, className: 'bf-layout' }, customRadio, h('span', {}, 'Custom')));

	const custom = input({ placeholder: 'e.g. 3 6 3 or 1/4 3/4', autocomplete: 'off' });
	const error = h('p', { className: 'bf-error', id: nextId('bf-err'), hidden: true });
	custom.addEventListener('input', () => {
		customRadio.checked = true;
		error.hidden = true;
		custom.removeAttribute('aria-invalid');
	});
	const fieldset = h('fieldset', { className: 'bf-fieldset' }, h('legend', { className: 'bf-label' }, 'Columns'), list);
	const customField = field(`Custom spans (out of ${columns})`, custom, `Numbers from 1 to ${columns} separated by spaces or +, or fractions like 1/2.`);
	customField.append(error);

	return openDialog(editor.root, {
		title,
		body: [fieldset, customField],
		submitLabel: 'Add row',
		initialFocus: radios[0],
		onSubmit: () => {
			const chosen = radios.find((r) => r.checked);
			if (!chosen || chosen.value === 'custom') {
				const spans = parseLayout(custom.value, columns);
				if (!spans) {
					error.textContent = `Enter spans from 1 to ${columns}, for example "${columns / 4 === Math.floor(columns / 4) ? `${columns / 4} ${columns / 2} ${columns / 4}` : `${Math.ceil(columns / 2)} ${Math.floor(columns / 2)}`}".`;
					error.hidden = false;
					custom.setAttribute('aria-invalid', 'true');
					custom.setAttribute('aria-errormessage', error.id);
					custom.focus();
					return false;
				}
				result = spans;
			} else result = layouts[Number(chosen.value)].spans;
		},
	}).then((ok) => (ok ? result : null));
}
