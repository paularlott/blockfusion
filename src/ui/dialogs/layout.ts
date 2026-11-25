/** Column layout picker for new rows. */
import type { Editor } from '../../editor';
import { h, nextId } from '../dom';
import { openDialog } from '../dialog';

/** Preset layouts, in twelfths; scaled to the grid and offered when they divide exactly. */
export const LAYOUTS: Array<{ name: string; spans: number[] }> = [
	{ name: 'One column', spans: [12] },
	{ name: 'Two halves', spans: [6, 6] },
	{ name: 'Three thirds', spans: [4, 4, 4] },
	{ name: 'Four quarters', spans: [3, 3, 3, 3] },
	{ name: 'Two thirds and one third', spans: [8, 4] },
	{ name: 'One third and two thirds', spans: [4, 8] },
	{ name: 'Three quarters and one quarter', spans: [9, 3] },
	{ name: 'One quarter and three quarters', spans: [3, 9] },
	{ name: 'Wide centre, narrow sides', spans: [3, 6, 3] },
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
	const fieldset = h('fieldset', { className: 'bf-fieldset' }, h('legend', { className: 'bf-label' }, 'Columns'), list);
	const hint = h('p', { className: 'bf-hint' }, 'Columns can be added, removed and resized afterwards.');

	return openDialog(editor.root, {
		title,
		body: [fieldset, hint],
		submitLabel: 'Add row',
		initialFocus: radios[0],
		onSubmit: () => {
			const chosen = radios.find((r) => r.checked) ?? radios[0];
			result = layouts[Number(chosen.value)].spans;
		},
	}).then((ok) => (ok ? result : null));
}
