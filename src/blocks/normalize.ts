/**
 * The block definition format for JSON files and the `blocks` option.
 *
 * Blocks are described as rows of columns, not markup, so they are written
 * once and rendered by whichever converter is active when inserted:
 *
 *   { "id": "text-image", "name": "Text and image", "category": "Text",
 *     "rows": [ { "className": "highlight",
 *                 "cols": [ { "span": 6, "html": "<h2>Title</h2><p>Text</p>" },
 *                           { "span": 6, "html": "<img src=\"…\" alt=\"…\">" } ] } ] }
 *
 * - `span` is a number of columns from the md breakpoint up (columns stack
 *   on phones), or an object { base, sm, md, lg, xl, xxl } for full control.
 * - Spans count in a 12 column grid unless the block sets "columns"; they
 *   are rescaled to the editor's grid on insert.
 * - A column with "kind": "raw" (or a "raw" key) holds verbatim HTML/JS.
 * - A row { "raw": "…" } is a raw HTML/JavaScript row.
 * - className, id, style and other attributes go on the row or column
 *   directly, or in "attrs".
 * - ids and kinds are optional.
 *
 * HTML in any known framework is still accepted for `rows` and converted.
 */
import { BREAKPOINTS, DEFAULT_COLUMNS, type Attrs, type Block, type Col, type Row, type Span } from '../model/types';

type Loose = Record<string, any>;

const clampSpan = (n: unknown, columns: number): number | undefined => {
	const v = Math.round(Number(n));
	return Number.isFinite(v) && v >= 1 && v <= columns ? v : undefined;
};

/** A span from a number (md and up) or a { base, sm, md, lg, xl, xxl } object. */
export function normalizeSpan(s: unknown, columns = DEFAULT_COLUMNS): Span {
	if (typeof s === 'number' || typeof s === 'string') {
		const n = clampSpan(s, columns) ?? columns;
		return n === columns ? { base: columns } : { base: columns, md: n };
	}
	if (s && typeof s === 'object') {
		const o = s as Loose;
		const span: Span = { base: clampSpan(o.base, columns) ?? columns };
		for (const bp of BREAKPOINTS) {
			if (bp === 'base') continue;
			const v = clampSpan(o[bp], columns);
			if (v !== undefined) span[bp] = v;
		}
		return span;
	}
	return { base: columns };
}

function attrsOf(o: Loose): Attrs | undefined {
	const a: Attrs = { ...(o.attrs && typeof o.attrs === 'object' ? o.attrs : {}) };
	for (const k of ['className', 'id', 'style', 'tag'] as const)
		if (typeof o[k] === 'string' && o[k] !== '') (a as Loose)[k] = o[k];
	return Object.keys(a).length ? a : undefined;
}

function normalizeCol(c: unknown, columns: number): Col {
	if (typeof c === 'string') return { id: '', kind: 'rich', span: { base: columns }, html: c };
	const o = (c ?? {}) as Loose;
	const raw = o.kind === 'raw' || typeof o.raw === 'string';
	const col: Col = {
		id: typeof o.id === 'string' ? o.id : '',
		kind: raw ? 'raw' : 'rich',
		span: normalizeSpan(o.span, columns),
		html: String((raw ? o.raw ?? o.html : o.html) ?? ''),
	};
	const attrs = attrsOf(o);
	if (attrs) col.attrs = attrs;
	return col;
}

function normalizeRow(r: unknown, columns: number): Row {
	const o = (r ?? {}) as Loose;
	if (o.kind === 'raw' || (typeof o.raw === 'string' && !Array.isArray(o.cols)))
		return { id: typeof o.id === 'string' ? o.id : '', kind: 'raw', cols: [], raw: String(o.raw ?? '') };
	const cols = Array.isArray(o.cols) && o.cols.length ? o.cols.map((c: unknown) => normalizeCol(c, columns)) : [normalizeCol('', columns)];
	const row: Row = { id: typeof o.id === 'string' ? o.id : '', kind: 'grid', cols };
	const attrs = attrsOf(o);
	if (attrs) row.attrs = attrs;
	return row;
}

/** Fill in the defaults of a block written in the short JSON form. */
export function normalizeBlock(b: unknown): Block | null {
	const o = (b ?? {}) as Loose;
	if (typeof o.id !== 'string' || o.id === '' || typeof o.name !== 'string') return null;
	const columns = Number.isInteger(o.columns) && o.columns > 0 ? (o.columns as number) : DEFAULT_COLUMNS;
	const block: Block = {
		id: o.id,
		name: o.name,
		rows: typeof o.rows === 'string' ? o.rows : (Array.isArray(o.rows) ? o.rows : [o.rows ?? {}]).map((r: unknown) => normalizeRow(r, columns)),
	};
	if (columns !== DEFAULT_COLUMNS) block.columns = columns;
	for (const k of ['category', 'thumbnail', 'description'] as const)
		if (typeof o[k] === 'string') block[k] = o[k];
	return block;
}
