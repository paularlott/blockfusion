/**
 * Row and column settings: class, id, tag, background, inline style,
 * custom attributes and (for columns) responsive spans.
 */
import type { Editor } from '../../editor';
import { cleanAttrs, findCol, findRow, normaliseSpan } from '../../model/doc';
import type { Attrs, Span } from '../../model/types';
import { field, input, openDialog } from '../dialog';
import { h } from '../dom';

/** Split an inline style into the background parts the form edits and the rest. */
function splitStyle(style = ''): { color: string; image: string; rest: string } {
	const el = document.createElement('div');
	el.setAttribute('style', style);
	const color = el.style.backgroundColor;
	const imgMatch = /url\((['"]?)(.*?)\1\)/.exec(el.style.backgroundImage);
	el.style.removeProperty('background-color');
	el.style.removeProperty('background-image');
	el.style.removeProperty('background');
	return { color, image: imgMatch?.[2] ?? '', rest: el.getAttribute('style') ?? '' };
}

function joinStyle(color: string, image: string, rest: string): string {
	const el = document.createElement('div');
	el.setAttribute('style', rest);
	if (color.trim()) el.style.backgroundColor = color.trim();
	if (image.trim()) {
		el.style.backgroundImage = `url("${image.trim().replace(/"/g, '%22')}")`;
		if (!el.style.backgroundSize) el.style.backgroundSize = 'cover';
	}
	return (el.getAttribute('style') ?? '').trim();
}

function attrsToText(extra?: Record<string, string>): string {
	return Object.entries(extra ?? {})
		.map(([k, v]) => `${k}="${v.replace(/"/g, '&quot;')}"`)
		.join('\n');
}

/** Parse `name="value"` lines. Returns null and a message when invalid. */
export function parseAttrText(text: string): { extra: Record<string, string> } | { error: string } {
	const extra: Record<string, string> = {};
	for (const raw of text.split('\n')) {
		const line = raw.trim();
		if (!line) continue;
		const m = /^([^\s"'>/=]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?$/.exec(line);
		if (!m) return { error: `Could not read "${line}". Use name="value".` };
		const name = m[1].toLowerCase();
		if (['class', 'id', 'style'].includes(name)) return { error: `Use the ${name} field above instead of an attribute line.` };
		if (/^on/.test(name)) return { error: 'Event handler attributes are not allowed. Use an HTML block for scripts.' };
		extra[name] = (m[2] ?? m[3] ?? m[4] ?? '').replace(/&quot;/g, '"');
	}
	return { extra };
}

export async function settingsDialog(editor: Editor, kind: 'row' | 'col', id: string): Promise<void> {
	const row = kind === 'row' ? findRow(editor.doc, id) : findCol(editor.doc, id)?.row;
	const col = kind === 'col' ? findCol(editor.doc, id)?.col : undefined;
	const item = kind === 'row' ? row : col;
	if (!item) return;
	const attrs: Attrs = item.attrs ?? {};
	const style = splitStyle(attrs.style);

	const cls = input({ value: attrs.className ?? '', autocomplete: 'off', spellcheck: 'false' });
	const elId = input({ value: attrs.id ?? '', autocomplete: 'off', spellcheck: 'false', pattern: '[^\\s]*' });
	const tag = h('select', { className: 'bf-input' });
	for (const t of kind === 'row' ? ['div', 'section', 'header', 'footer', 'article', 'aside', 'main'] : ['div', 'section', 'article', 'aside']) {
		tag.append(h('option', { value: t, selected: (attrs.tag ?? 'div') === t }, `<${t}>`));
	}
	const bgColor = input({ value: style.color, autocomplete: 'off' });
	const picker = h('input', { type: 'color', className: 'bf-color', 'aria-label': 'Pick background colour', value: toHexColor(style.color) ?? '#ffffff' });
	picker.addEventListener('input', () => (bgColor.value = picker.value));
	// Keep the picker in step with a typed hex colour
	bgColor.addEventListener('input', () => {
		const hex = toHexColor(bgColor.value);
		if (hex) picker.value = hex;
	});
	const bgImage = input({ value: style.image, inputmode: 'url' });
	const rest = input({ value: style.rest, autocomplete: 'off', spellcheck: 'false' });
	const extra = h('textarea', { className: 'bf-input', rows: '3', spellcheck: 'false' }) as HTMLTextAreaElement;
	extra.value = attrsToText(attrs.extra);
	const error = h('p', { className: 'bf-error', hidden: true, id: 'bf-attr-err-' + id });

	const body: HTMLElement[] = [];
	let spanInputs: Record<keyof Span, HTMLInputElement> | null = null;
	if (kind === 'col' && col) {
		const inputs = {} as Record<keyof Span, HTMLInputElement>;
		spanInputs = inputs;
		const grid = h('div', { className: 'bf-span-grid' });
		const names: Array<[keyof Span, string]> = [
			['base', 'All widths'],
			['sm', 'Small and up'],
			['md', 'Medium and up'],
			['lg', 'Large and up'],
		];
		for (const [bp, label] of names) {
			const inp = input({ type: 'number', min: '1', max: '12', inputmode: 'numeric', value: col.span[bp] !== undefined ? String(col.span[bp]) : '', placeholder: bp === 'base' ? '12' : 'inherit' });
			inputs[bp] = inp;
			grid.append(field(label, inp));
		}
		body.push(h('fieldset', { className: 'bf-fieldset' }, h('legend', { className: 'bf-label' }, 'Width in twelfths (blank inherits the smaller size)'), grid));
	}
	body.push(
		field('CSS classes', cls, 'Separate classes with spaces. Grid classes are managed for you.'),
		field('Element id', elId),
		field('Element', tag),
		colorField(bgColor, picker),
		field('Background image address', bgImage),
		field('Other inline style', rest, 'For example: padding: 2rem 0'),
		field('Custom attributes', extra, 'One per line, e.g. data-section="intro" or aria-label="Intro"'),
		error,
	);

	const where = kind === 'row' ? `Row ${editor.doc.rows.indexOf(row!) + 1}` : `Column ${row!.cols.indexOf(col!) + 1} of row ${editor.doc.rows.indexOf(row!) + 1}`;
	await openDialog(editor.root, {
		title: `${where} settings`,
		body,
		submitLabel: 'Save settings',
		onSubmit: () => {
			const parsed = parseAttrText(extra.value);
			if ('error' in parsed) {
				error.textContent = parsed.error;
				error.hidden = false;
				extra.setAttribute('aria-invalid', 'true');
				extra.setAttribute('aria-errormessage', error.id);
				extra.focus();
				return false;
			}
			const next = cleanAttrs({
				className: cls.value,
				id: elId.value,
				tag: tag.value,
				style: joinStyle(bgColor.value, bgImage.value, rest.value),
				extra: parsed.extra,
			});
			let span: Span | null = null;
			const inputs = spanInputs;
			if (inputs) {
				const read = (bp: keyof Span) => {
					const n = Number(inputs[bp].value);
					return inputs[bp].value.trim() && n >= 1 && n <= 12 ? Math.round(n) : undefined;
				};
				span = normaliseSpan({ base: read('base') ?? 12, sm: read('sm'), md: read('md'), lg: read('lg') });
			}
			editor.apply(
				kind === 'row' ? 'Row settings' : 'Column settings',
				(d) => {
					const target = kind === 'row' ? findRow(d, id) : findCol(d, id)?.col;
					if (!target) return false;
					target.attrs = next;
					if (span && 'span' in target) target.span = span;
				},
				{ focus: { kind: kind === 'row' ? 'row-handle' : 'col-handle', id }, announce: `${where} settings saved` },
			);
		},
	});
}

/** The background colour field: the text box and the picker on one line, the hint under both. */
function colorField(text: HTMLInputElement, picker: HTMLInputElement): HTMLElement {
	const f = field('Background colour', text, 'Any CSS colour, e.g. #f5f7fa');
	const line = h('div', { className: 'bf-input-line' });
	text.replaceWith(line);
	line.append(text, picker);
	return f;
}

let colorCtx: CanvasRenderingContext2D | null | undefined;

/**
 * Any CSS colour (#rgb, rgb(), hsl(), a name, ...) as #rrggbb for the colour
 * picker, or null when it isn't a colour. The browser does the parsing: a
 * canvas context reports a valid fillStyle back in hex. Alpha is dropped, as
 * the picker can't show it.
 */
export function toHexColor(value: string): string | null {
	const v = value.trim();
	if (v === '') return null;
	if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
	if (colorCtx === undefined) colorCtx = document.createElement('canvas').getContext('2d');
	if (!colorCtx) return null;
	// Set two different sentinels first: an invalid value leaves each unchanged
	colorCtx.fillStyle = '#000000';
	colorCtx.fillStyle = v;
	const a = String(colorCtx.fillStyle);
	colorCtx.fillStyle = '#ffffff';
	colorCtx.fillStyle = v;
	const b = String(colorCtx.fillStyle);
	if (a !== b) return null;
	if (/^#[0-9a-f]{6}$/i.test(a)) return a.toLowerCase();
	// Translucent colours come back as rgba(): keep the colour, drop the alpha
	const m = a.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
	return m ? '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('') : null;
}
