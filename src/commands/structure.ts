/**
 * Structural commands: rows and columns. Each is one history step with an
 * announcement, and focus lands on the moved/created item's handle so
 * keyboard users can carry on.
 */
import type { Editor } from '../editor';
import {
	addCol,
	clone,
	columnsOf,
	createRawRow,
	createRow,
	duplicateCol,
	duplicateRow,
	findCol,
	findRow,
	insertRows,
	moveCol,
	moveRow,
	removeCol,
	removeRow,
	resizeCol,
	rowIndex,
	spanAt,
} from '../model/doc';
import type { Doc, Row } from '../model/types';

export type InsertAt = { at: 'end' } | { at: 'before' | 'after'; rowId: string };

function insertIndex(doc: Doc, where: InsertAt): number {
	if (where.at === 'end') return doc.rows.length;
	const i = rowIndex(doc, where.rowId);
	if (i < 0) return doc.rows.length;
	return where.at === 'before' ? i : i + 1;
}

const position = (doc: Doc, rowId: string) => `row ${rowIndex(doc, rowId) + 1} of ${doc.rows.length}`;

export function insertRow(editor: Editor, spans: number[], where: InsertAt): void {
	const row = createRow(spans, editor.options.breakpoint, '', editor.columns);
	editor.apply('Insert row', (d) => insertRows(d, [row], insertIndex(d, where)), {
		focus: { kind: 'col', id: row.cols[0].id, atStart: true },
		announce: (d) => `Row inserted with ${spans.length} column${spans.length > 1 ? 's' : ''}, ${position(d, row.id)}`,
	});
}

/**
 * Insert HTML code as a row. 'grid' puts it in a row and a full width
 * column like any other row, so it follows the page grid and can take more
 * columns; 'custom' writes only the code, with no row or column markup.
 */
export function insertRaw(editor: Editor, code: string, where: InsertAt, layout: 'grid' | 'custom' = 'grid'): void {
	let row: Row;
	if (layout === 'custom') row = createRawRow(code);
	else {
		row = createRow([editor.columns], editor.options.breakpoint, code, editor.columns);
		row.cols[0].kind = 'raw';
	}
	editor.apply('Insert HTML', (d) => insertRows(d, [row], insertIndex(d, where)), {
		focus: { kind: 'row-handle', id: row.id },
		announce: (d) => `${layout === 'custom' ? 'Custom HTML row' : 'HTML row'} inserted, ${position(d, row.id)}`,
	});
}

/** A custom HTML row becomes a row and column holding the same code. */
export function wrapRawRow(editor: Editor, rowId: string): void {
	editor.apply(
		'Wrap in row and column',
		(d) => {
			const i = rowIndex(d, rowId);
			const row = d.rows[i];
			if (!row || row.kind !== 'raw') return false;
			const next = createRow([columnsOf(d)], 'base', row.raw ?? '', columnsOf(d));
			next.id = row.id;
			next.cols[0].kind = 'raw';
			d.rows[i] = next;
		},
		{ focus: { kind: 'row-handle', id: rowId }, announce: 'HTML is now in a row and column' },
	);
}

/**
 * A row whose only column is HTML code becomes a custom HTML row. When the
 * row or column has its own class, id, style or attributes, their markup
 * goes into the code so the page output doesn't change.
 */
export function unwrapRawRow(editor: Editor, rowId: string): void {
	editor.apply(
		'Make custom HTML row',
		(d) => {
			const i = rowIndex(d, rowId);
			const row = d.rows[i];
			if (!row || row.kind !== 'grid' || row.cols.length !== 1 || row.cols[0].kind !== 'raw') return false;
			const col = row.cols[0];
			const code = row.attrs || col.attrs ? editor.converter.render({ rows: [clone(row)], columns: columnsOf(d) }, { rawMarkers: false }) : col.html;
			d.rows[i] = { id: row.id, kind: 'raw', cols: [], raw: code };
		},
		{ focus: { kind: 'row-handle', id: rowId }, announce: 'Now a custom HTML row, without row and column markup' },
	);
}

export function moveRowBy(editor: Editor, rowId: string, delta: number): void {
	const ok = editor.apply(delta < 0 ? 'Move row up' : 'Move row down', (d) => moveRow(d, rowId, delta), {
		focus: { kind: 'row-handle', id: rowId },
		announce: (d) => `Row moved ${delta < 0 ? 'up' : 'down'}, now ${position(d, rowId)}`,
	});
	if (!ok) editor.announce(delta < 0 ? 'Already the first row' : 'Already the last row');
}

export function duplicateRowCmd(editor: Editor, rowId: string): void {
	let id = '';
	editor.apply(
		'Duplicate row',
		(d) => {
			const copy = duplicateRow(d, rowId);
			if (!copy) return false;
			id = copy.id;
		},
		{ focus: () => ({ kind: 'row-handle', id }), announce: (d) => `Row duplicated, copy is ${position(d, id)}` },
	);
}

export function deleteRowCmd(editor: Editor, rowId: string): void {
	let next: string | null = null;
	editor.apply(
		'Delete row',
		(d) => {
			const i = rowIndex(d, rowId);
			if (!removeRow(d, rowId)) return false;
			next = d.rows[Math.min(i, d.rows.length - 1)]?.id ?? null;
		},
		{
			focus: () => (next ? { kind: 'row-handle', id: next } : null),
			announce: (d) => `Row deleted. ${d.rows.length} row${d.rows.length === 1 ? '' : 's'} left. Undo with Control or Command Z.`,
		},
	);
	if (!next) editor.focusCanvas();
}

/** Add a column at the end of a row, or after (or before) a given column. */
export function addColCmd(editor: Editor, rowId: string, nextToColId?: string, side: 'after' | 'before' = 'after'): void {
	let id = '';
	editor.apply(
		'Add column',
		(d) => {
			const row = findRow(d, rowId);
			if (!row || row.kind !== 'grid') return false;
			const at = nextToColId ? row.cols.findIndex((c) => c.id === nextToColId) : -1;
			const i = at < 0 ? row.cols.length : side === 'before' ? at : at + 1;
			const col = addCol(d, rowId, i, editor.options.breakpoint);
			if (!col) return false;
			col.html = '';
			id = col.id;
		},
		{
			focus: () => ({ kind: 'col', id }),
			announce: (d) => {
				const ref = findCol(d, id)!;
				return `Column added, column ${ref.colIndex + 1} of ${ref.row.cols.length}`;
			},
		},
	);
	if (!id) editor.announce(`A row can have at most ${editor.columns} columns`);
}

/**
 * Turn a text column into an HTML code column. It keeps its place and width
 * in the row; the code is the column's markup as the site gets it
 * (framework classes, not neutral ones).
 */
export function convertColToCode(editor: Editor, colId: string): void {
	editor.apply(
		'Convert to HTML code',
		(d) => {
			const ref = findCol(d, colId);
			if (!ref || ref.col.kind !== 'rich') return false;
			ref.col.kind = 'raw';
			ref.col.html = editor.converter.mapHtml(ref.col.html, 'out');
		},
		{ focus: { kind: 'col-handle', id: colId }, announce: 'Column converted to HTML code' },
	);
}

export function deleteColCmd(editor: Editor, colId: string): void {
	let focus: string | null = null;
	let rowGone = false;
	editor.apply(
		'Delete column',
		(d) => {
			const ref = removeCol(d, colId);
			if (!ref) return false;
			rowGone = !ref.row.cols.length;
			focus = rowGone ? d.rows[Math.min(ref.rowIndex, d.rows.length - 1)]?.id ?? null : ref.row.cols[Math.max(0, ref.colIndex - 1)].id;
		},
		{
			focus: () => (focus ? { kind: rowGone ? 'row-handle' : 'col-handle', id: focus } : null),
			announce: rowGone ? 'Column and its empty row deleted' : 'Column deleted',
		},
	);
}

export function moveColBy(editor: Editor, colId: string, delta: number): void {
	const ok = editor.apply(delta < 0 ? 'Move column left' : 'Move column right', (d) => moveCol(d, colId, delta), {
		focus: { kind: 'col-handle', id: colId },
		announce: (d) => {
			const ref = findCol(d, colId)!;
			return `Column moved ${delta < 0 ? 'left' : 'right'}, now column ${ref.colIndex + 1} of ${ref.row.cols.length}`;
		},
	});
	if (!ok) editor.announce(delta < 0 ? 'Already the first column' : 'Already the last column');
}

export function resizeColBy(editor: Editor, colId: string, delta: number): void {
	const bp = editor.options.breakpoint;
	let now: number | null = null;
	const ok = editor.apply(
		delta > 0 ? 'Widen column' : 'Narrow column',
		(d) => {
			now = resizeCol(d, colId, delta, bp);
			return now !== null;
		},
		{
			focus: { kind: 'col-handle', id: colId },
			announce: () => `Column is ${now} of ${editor.columns} wide`,
		},
	);
	if (!ok) {
		const ref = findCol(editor.doc, colId);
		editor.announce(ref ? `Column is ${spanAt(ref.col.span, bp, editor.columns)} of ${editor.columns} wide and cannot change further` : 'Column not found');
	}
}

export function duplicateColCmd(editor: Editor, colId: string): void {
	let id = '';
	editor.apply(
		'Duplicate column',
		(d) => {
			const copy = duplicateCol(d, colId);
			if (!copy) return false;
			id = copy.id;
		},
		{ focus: () => ({ kind: 'col-handle', id }), announce: 'Column duplicated' },
	);
	if (!id) editor.announce(`A row can have at most ${editor.columns} columns`);
}
