/**
 * Structural commands: rows and columns. Each is one history step with an
 * announcement, and focus lands on the moved/created item's handle so
 * keyboard users can carry on.
 */
import type { Editor } from '../editor';
import {
	addCol,
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
import type { Doc } from '../model/types';

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

export function insertRaw(editor: Editor, code: string, where: InsertAt): void {
	const row = createRawRow(code);
	editor.apply('Insert HTML', (d) => insertRows(d, [row], insertIndex(d, where)), {
		focus: { kind: 'row-handle', id: row.id },
		announce: (d) => `HTML row inserted, ${position(d, row.id)}`,
	});
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

export function addColCmd(editor: Editor, rowId: string, afterColId?: string): void {
	let id = '';
	editor.apply(
		'Add column',
		(d) => {
			const row = findRow(d, rowId);
			if (!row || row.kind !== 'grid') return false;
			const i = afterColId ? row.cols.findIndex((c) => c.id === afterColId) + 1 : row.cols.length;
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
