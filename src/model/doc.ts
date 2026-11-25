/**
 * Pure model operations. Every function mutates the document it is given;
 * the editor works on a clone so the previous state can go to the history.
 */
import { BREAKPOINTS, DEFAULT_COLUMNS, type Attrs, type Breakpoint, type Col, type Doc, type Row, type Span } from './types';

let counter = 0;

/** A short unique id for rows and columns. Ids never reach the output. */
export function uid(prefix = 'n'): string {
	counter = (counter + 1) % 1e9;
	return prefix + Date.now().toString(36) + counter.toString(36) + Math.random().toString(36).slice(2, 6);
}

export function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

export function emptyDoc(): Doc {
	return { rows: [] };
}

/* ------------------------------------------------------------------ spans */

/** The grid size of a document. */
export function columnsOf(doc: Pick<Doc, 'columns'> | undefined): number {
	const n = doc?.columns;
	return n && Number.isInteger(n) && n > 0 ? n : DEFAULT_COLUMNS;
}

export function clampSpan(n: number, columns = DEFAULT_COLUMNS): number {
	return Math.max(1, Math.min(columns, Math.round(n)));
}

/** The span in effect at a breakpoint: its own value or the next smaller one. */
export function spanAt(span: Span, bp: Breakpoint, columns = DEFAULT_COLUMNS): number {
	for (let i = BREAKPOINTS.indexOf(bp); i >= 0; i--) {
		const v = span[BREAKPOINTS[i]];
		if (v !== undefined) return v;
	}
	return columns;
}

/** A span counted in `from` columns, counted in `to` columns instead. */
export function scaleSpan(span: Span, from: number, to: number): Span {
	if (from === to) return { ...span };
	const out = {} as Span;
	for (const bp of BREAKPOINTS) {
		const v = span[bp];
		if (v !== undefined) out[bp] = clampSpan((v * to) / from, to);
	}
	return normaliseSpan(out, to);
}

/** Rescale every span in a list of rows from one grid size to another. */
export function scaleRows(rows: Row[], from: number, to: number): Row[] {
	if (from !== to) for (const row of rows) for (const col of row.cols) col.span = scaleSpan(col.span, from, to);
	return rows;
}

/** Rescale a document to another grid size (returns the same document). */
export function scaleDoc(doc: Doc, to: number): Doc {
	const from = columnsOf(doc);
	scaleRows(doc.rows, from, to);
	if (to === DEFAULT_COLUMNS) delete doc.columns;
	else doc.columns = to;
	return doc;
}

/**
 * Which key of the span a resize at `bp` should change: the largest key that
 * is set at or below `bp`, unless that is `base`, in which case the resize is
 * made at `bp` itself so phones keep stacking.
 */
export function spanKeyFor(span: Span, bp: Breakpoint): Breakpoint {
	for (let i = BREAKPOINTS.indexOf(bp); i > 0; i--) {
		if (span[BREAKPOINTS[i]] !== undefined) return BREAKPOINTS[i];
	}
	return bp;
}

/** Span for a new column of `n` columns laid out at breakpoint `bp`. */
export function makeSpan(n: number, bp: Breakpoint = 'md', columns = DEFAULT_COLUMNS): Span {
	n = clampSpan(n, columns);
	if (bp === 'base' || n === columns) return { base: n };
	return { base: columns, [bp]: n };
}

/** Remove keys that repeat the inherited value, so markup stays minimal. */
export function normaliseSpan(span: Span, columns = DEFAULT_COLUMNS): Span {
	const out: Span = { base: clampSpan(span.base ?? columns, columns) };
	let prev = out.base;
	for (const bp of BREAKPOINTS) {
		if (bp === 'base') continue;
		const v = span[bp];
		if (v !== undefined && clampSpan(v, columns) !== prev) {
			out[bp] = clampSpan(v, columns);
			prev = out[bp]!;
		}
	}
	return out;
}

/**
 * Parse a layout description into spans of a `columns` grid: "6+6",
 * "4 4 4", "1/2+1/2", "2/3, 1/3". Returns null when it is not understood.
 */
export function parseLayout(text: string, columns = DEFAULT_COLUMNS): number[] | null {
	const parts = text.trim().split(/[\s+,|]+/).filter(Boolean);
	if (!parts.length || parts.length > columns) return null;
	const out: number[] = [];
	for (const p of parts) {
		const frac = /^(\d+)\/(\d+)$/.exec(p);
		let n: number;
		if (frac) n = (columns * Number(frac[1])) / Number(frac[2]);
		else if (/^\d+$/.test(p)) n = Number(p);
		else return null;
		if (!Number.isInteger(n) || n < 1 || n > columns) return null;
		out.push(n);
	}
	return out;
}

/* ---------------------------------------------------------- constructors */

export function createCol(span: Span = { base: DEFAULT_COLUMNS }, html = '<p><br></p>', kind: Col['kind'] = 'rich'): Col {
	return { id: uid('c'), kind, span, html };
}

export function createRow(spans?: number[], bp: Breakpoint = 'md', html?: string, columns = DEFAULT_COLUMNS): Row {
	return { id: uid('r'), kind: 'grid', cols: (spans ?? [columns]).map((n) => createCol(makeSpan(n, bp, columns), html)) };
}

export function createRawRow(code = ''): Row {
	return { id: uid('r'), kind: 'raw', cols: [], raw: code };
}

/** Give a row (and its columns) fresh ids, e.g. after duplicating. */
export function reId<T extends Row | Col>(item: T): T {
	item.id = uid((item as Row).cols ? 'r' : 'c');
	if ((item as Row).cols) for (const c of (item as Row).cols) c.id = uid('c');
	return item;
}

/* --------------------------------------------------------------- lookups */

export interface ColRef {
	row: Row;
	col: Col;
	rowIndex: number;
	colIndex: number;
}

export function rowIndex(doc: Doc, rowId: string): number {
	return doc.rows.findIndex((r) => r.id === rowId);
}

export function findRow(doc: Doc, rowId: string): Row | undefined {
	return doc.rows.find((r) => r.id === rowId);
}

export function findCol(doc: Doc, colId: string): ColRef | undefined {
	for (let r = 0; r < doc.rows.length; r++) {
		const row = doc.rows[r];
		const c = row.cols.findIndex((col) => col.id === colId);
		if (c >= 0) return { row, col: row.cols[c], rowIndex: r, colIndex: c };
	}
	return undefined;
}

/* ------------------------------------------------------------ row edits */

export function insertRows(doc: Doc, rows: Row[], index = doc.rows.length): void {
	index = Math.max(0, Math.min(doc.rows.length, index));
	doc.rows.splice(index, 0, ...rows);
}

export function removeRow(doc: Doc, rowId: string): Row | undefined {
	const i = rowIndex(doc, rowId);
	return i < 0 ? undefined : doc.rows.splice(i, 1)[0];
}

/** Move a row by `delta` places. Returns false when it cannot move. */
export function moveRow(doc: Doc, rowId: string, delta: number): boolean {
	const i = rowIndex(doc, rowId);
	const j = i + delta;
	if (i < 0 || j < 0 || j >= doc.rows.length) return false;
	const [row] = doc.rows.splice(i, 1);
	doc.rows.splice(j, 0, row);
	return true;
}

export function duplicateRow(doc: Doc, rowId: string): Row | undefined {
	const i = rowIndex(doc, rowId);
	if (i < 0) return undefined;
	const copy = reId(clone(doc.rows[i]));
	doc.rows.splice(i + 1, 0, copy);
	return copy;
}

export function setRowAttrs(doc: Doc, rowId: string, attrs: Attrs): boolean {
	const row = findRow(doc, rowId);
	if (!row) return false;
	row.attrs = cleanAttrs(attrs);
	return true;
}

/* --------------------------------------------------------- column edits */

/**
 * Spread the columns of a row evenly at `bp` when the grid size divides by
 * the count; otherwise leave existing spans alone.
 */
export function rebalance(row: Row, bp: Breakpoint = 'md', columns = DEFAULT_COLUMNS): void {
	const n = row.cols.length;
	if (!n || columns % n) return;
	for (const col of row.cols) col.span = makeSpan(columns / n, bp, columns);
}

export function addCol(doc: Doc, rowId: string, index?: number, bp: Breakpoint = 'md'): Col | undefined {
	const columns = columnsOf(doc);
	const row = findRow(doc, rowId);
	if (!row || row.kind !== 'grid' || row.cols.length >= columns) return undefined;
	const col = createCol({ base: columns });
	row.cols.splice(index ?? row.cols.length, 0, col);
	const n = row.cols.length;
	if (columns % n === 0) rebalance(row, bp, columns);
	else col.span = makeSpan(Math.max(1, Math.floor(columns / n)), bp, columns);
	return col;
}

/** Remove a column. Removing the last column removes the row too. */
export function removeCol(doc: Doc, colId: string): ColRef | undefined {
	const ref = findCol(doc, colId);
	if (!ref) return undefined;
	ref.row.cols.splice(ref.colIndex, 1);
	if (!ref.row.cols.length) doc.rows.splice(ref.rowIndex, 1);
	return ref;
}

export function moveCol(doc: Doc, colId: string, delta: number): boolean {
	const ref = findCol(doc, colId);
	if (!ref) return false;
	const j = ref.colIndex + delta;
	if (j < 0 || j >= ref.row.cols.length) return false;
	ref.row.cols.splice(ref.colIndex, 1);
	ref.row.cols.splice(j, 0, ref.col);
	return true;
}

export function duplicateCol(doc: Doc, colId: string): Col | undefined {
	const ref = findCol(doc, colId);
	if (!ref || ref.row.cols.length >= columnsOf(doc)) return undefined;
	const copy = reId(clone(ref.col));
	ref.row.cols.splice(ref.colIndex + 1, 0, copy);
	return copy;
}

/**
 * Change a column's span at `bp` by `delta`. When the row fills the grid
 * exactly at that breakpoint, the neighbour (next column, or previous for the last
 * one) gives or takes the difference so the row stays full.
 * Returns the new span at `bp`, or null when nothing changed.
 */
export function resizeCol(doc: Doc, colId: string, delta: number, bp: Breakpoint = 'md'): number | null {
	const ref = findCol(doc, colId);
	if (!ref) return null;
	const columns = columnsOf(doc);
	const { row, col, colIndex } = ref;
	const key = spanKeyFor(col.span, bp);
	const current = spanAt(col.span, bp, columns);
	let next = clampSpan(current + delta, columns);
	if (next === current) return null;

	const total = row.cols.reduce((sum, c) => sum + spanAt(c.span, bp, columns), 0);
	const nb = row.cols.length > 1 ? row.cols[colIndex + 1] ?? row.cols[colIndex - 1] : undefined;
	if (nb && total === columns) {
		const nbKey = spanKeyFor(nb.span, bp);
		const nbCurrent = spanAt(nb.span, bp, columns);
		const nbNext = nbCurrent - (next - current);
		if (nbNext < 1) {
			next = current + (nbCurrent - 1);
			if (next === current) return null;
			nb.span = normaliseSpan({ ...nb.span, [nbKey]: 1 }, columns);
		} else {
			nb.span = normaliseSpan({ ...nb.span, [nbKey]: nbNext }, columns);
		}
	}
	col.span = normaliseSpan({ ...col.span, [key]: next }, columns);
	return next;
}

export function setColSpan(doc: Doc, colId: string, span: Span): boolean {
	const ref = findCol(doc, colId);
	if (!ref) return false;
	ref.col.span = normaliseSpan(span, columnsOf(doc));
	return true;
}

export function setColAttrs(doc: Doc, colId: string, attrs: Attrs): boolean {
	const ref = findCol(doc, colId);
	if (!ref) return false;
	ref.col.attrs = cleanAttrs(attrs);
	return true;
}

export function setColHtml(doc: Doc, colId: string, html: string): boolean {
	const ref = findCol(doc, colId);
	if (!ref || ref.col.html === html) return false;
	ref.col.html = html;
	return true;
}

/** Drop empty attribute values so the model (and tests) stay canonical. */
export function cleanAttrs(attrs: Attrs | undefined): Attrs | undefined {
	if (!attrs) return undefined;
	const out: Attrs = {};
	for (const key of ['className', 'id', 'style', 'tag'] as const) {
		const v = attrs[key]?.trim();
		if (v && !(key === 'tag' && v.toLowerCase() === 'div')) out[key] = key === 'tag' ? v.toLowerCase() : v;
	}
	if (attrs.extra && Object.keys(attrs.extra).length) out.extra = { ...attrs.extra };
	return Object.keys(out).length ? out : undefined;
}

/** Strip ids so two documents can be compared structurally. */
export function withoutIds(doc: Doc): unknown {
	return {
		rows: doc.rows.map((r) => ({
			...r,
			id: undefined,
			cols: r.cols.map((c) => ({ ...c, id: undefined })),
		})),
	};
}
