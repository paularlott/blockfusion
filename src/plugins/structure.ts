/**
 * Rows, columns and raw HTML: the add-row command (with the layout picker),
 * raw code rows, and every action on the row and column handles.
 */
import {
	addColCmd,
	deleteColCmd,
	deleteRowCmd,
	duplicateColCmd,
	duplicateRowCmd,
	insertRaw,
	insertRow,
	moveColBy,
	moveRowBy,
	resizeColBy,
	type InsertAt,
} from '../commands/structure';
import type { Editor } from '../editor';
import { findCol, findRow, spanAt } from '../model/doc';
import type { HandleAction, Plugin } from '../types';
import { codeDialog } from '../ui/dialogs/code';
import { layoutDialog } from '../ui/dialogs/layout';
import { settingsDialog } from '../ui/dialogs/settings';

const WIDTHS = [
	{ name: 'Full width', value: '' },
	{ name: 'Large (1200px)', value: '1200px' },
	{ name: 'Medium (992px)', value: '992px' },
	{ name: 'Small (768px)', value: '768px' },
	{ name: 'Phone (375px)', value: '375px' },
];

async function addRowFlow(editor: Editor, where: InsertAt, title?: string): Promise<void> {
	const spans = await layoutDialog(editor, title);
	if (spans) insertRow(editor, spans, where);
}

async function addRawFlow(editor: Editor, where: InsertAt): Promise<void> {
	const code = await codeDialog(editor, {
		title: 'Add HTML or JavaScript',
		label: 'Code',
		value: '',
		description: 'The code is written to the page exactly as entered. Scripts do not run in the editor; use Preview to try them safely.',
		submitLabel: 'Add',
	});
	if (code !== null) insertRaw(editor, code, where);
}

/** Where new rows go: after the active row, else at the end. */
function defaultWhere(editor: Editor): InsertAt {
	return editor.activeRow && findRow(editor.doc, editor.activeRow) ? { at: 'after', rowId: editor.activeRow } : { at: 'end' };
}

export const structurePlugin: Plugin = {
	id: 'structure',
	install(editor) {
		editor.registerCommand({
			id: 'addRow',
			label: 'Add row',
			icon: 'addRow',
			shortcut: 'Mod+Alt+R',
			run: (ed, arg) => addRowFlow(ed, (arg as InsertAt) ?? defaultWhere(ed)),
		});
		editor.registerCommand({
			id: 'addRaw',
			label: 'Add HTML or JavaScript',
			icon: 'code',
			run: (ed, arg) => addRawFlow(ed, (arg as InsertAt) ?? defaultWhere(ed)),
		});
		editor.registerCommand({
			id: 'editRaw',
			label: 'Edit code',
			run: async (ed, arg) => {
				const { rowId, colId } = arg as { rowId: string; colId?: string };
				const current = colId ? findCol(ed.doc, colId)?.col.html : findRow(ed.doc, rowId)?.raw;
				if (current === undefined) return;
				const code = await codeDialog(ed, {
					title: 'Edit HTML or JavaScript',
					label: 'Code',
					value: current,
					description: 'Written to the page exactly as entered. Scripts do not run in the editor.',
				});
				if (code === null || code === current) return;
				ed.apply(
					'Edit code',
					(d) => {
						if (colId) {
							const ref = findCol(d, colId);
							if (!ref) return false;
							ref.col.html = code;
						} else {
							const row = findRow(d, rowId);
							if (!row) return false;
							row.raw = code;
						}
					},
					{ focus: colId ? { kind: 'col-handle', id: colId } : { kind: 'row-handle', id: rowId }, announce: 'Code saved' },
				);
			},
		});
		editor.addToolbarItem({ type: 'button', id: 'addRow', command: 'addRow' });
		editor.addToolbarItem({ type: 'button', id: 'addRaw', command: 'addRaw' });

		let width = '';
		editor.addToolbarItem({
			type: 'menu',
			id: 'width',
			label: 'Preview width',
			icon: 'width',
			items: (ed) =>
				WIDTHS.map((w) => ({
					label: w.name,
					checked: width === w.value,
					run: () => {
						width = w.value;
						ed.canvas.iframe.style.maxWidth = w.value;
						ed.canvas.iframe.classList.toggle('bf-canvas-narrow', !!w.value);
						ed.canvas.fitHeight();
						ed.announce(`Preview width: ${w.name}`);
					},
				})),
		});

		const rowAct = (a: Omit<HandleAction, 'kind'>) => editor.addHandleAction({ ...a, kind: 'row' });
		const colAct = (a: Omit<HandleAction, 'kind'>) => editor.addHandleAction({ ...a, kind: 'col' });
		const rowPos = (ed: Editor, id: string) => ed.doc.rows.findIndex((r) => r.id === id);
		const isGrid = (ed: Editor, ref: { rowId: string }) => findRow(ed.doc, ref.rowId)?.kind === 'grid';
		const isRaw = (ed: Editor, ref: { rowId: string }) => findRow(ed.doc, ref.rowId)?.kind === 'raw';

		rowAct({ id: 'row-up', label: 'Move row up', shortcut: 'Alt+ArrowUp', disabled: (ed, r) => rowPos(ed, r.rowId) <= 0, run: (ed, r) => moveRowBy(ed, r.rowId, -1) });
		rowAct({
			id: 'row-down',
			label: 'Move row down',
			shortcut: 'Alt+ArrowDown',
			disabled: (ed, r) => rowPos(ed, r.rowId) >= ed.doc.rows.length - 1,
			run: (ed, r) => moveRowBy(ed, r.rowId, 1),
		});
		rowAct({ id: '---1', label: '', run: () => {} });
		rowAct({ id: 'row-edit-code', label: 'Edit code…', visible: isRaw, run: (ed, r) => ed.editRaw(r.rowId) });
		rowAct({ id: 'row-add-col', label: 'Add column', visible: isGrid, disabled: (ed, r) => (findRow(ed.doc, r.rowId)?.cols.length ?? ed.columns) >= ed.columns, run: (ed, r) => addColCmd(ed, r.rowId) });
		rowAct({ id: 'row-above', label: 'Insert row above…', run: (ed, r) => addRowFlow(ed, { at: 'before', rowId: r.rowId }, 'Insert row above') });
		rowAct({ id: 'row-below', label: 'Insert row below…', run: (ed, r) => addRowFlow(ed, { at: 'after', rowId: r.rowId }, 'Insert row below') });
		rowAct({ id: 'row-dup', label: 'Duplicate row', shortcut: 'Mod+D', run: (ed, r) => duplicateRowCmd(ed, r.rowId) });
		rowAct({ id: 'row-settings', label: 'Row settings…', visible: isGrid, run: (ed, r) => settingsDialog(ed, 'row', r.rowId) });
		rowAct({ id: '---2', label: '', run: () => {} });
		rowAct({ id: 'row-delete', label: 'Delete row', shortcut: 'Delete', danger: true, run: (ed, r) => deleteRowCmd(ed, r.rowId) });

		const colPos = (ed: Editor, id?: string) => (id ? findCol(ed.doc, id) : undefined);
		const isRawCol = (ed: Editor, ref: { colId?: string }) => colPos(ed, ref.colId)?.col.kind === 'raw';
		colAct({ id: 'col-left', label: 'Move column left', shortcut: 'Alt+ArrowLeft', disabled: (ed, r) => (colPos(ed, r.colId)?.colIndex ?? 0) <= 0, run: (ed, r) => moveColBy(ed, r.colId!, -1) });
		colAct({
			id: 'col-right',
			label: 'Move column right',
			shortcut: 'Alt+ArrowRight',
			disabled: (ed, r) => {
				const ref = colPos(ed, r.colId);
				return !ref || ref.colIndex >= ref.row.cols.length - 1;
			},
			run: (ed, r) => moveColBy(ed, r.colId!, 1),
		});
		colAct({
			id: 'col-wider',
			label: 'Make wider',
			shortcut: 'Alt+Shift+ArrowRight',
			disabled: (ed, r) => spanAt(colPos(ed, r.colId)?.col.span ?? { base: ed.columns }, ed.options.breakpoint, ed.columns) >= ed.columns,
			run: (ed, r) => resizeColBy(ed, r.colId!, 1),
		});
		colAct({
			id: 'col-narrower',
			label: 'Make narrower',
			shortcut: 'Alt+Shift+ArrowLeft',
			disabled: (ed, r) => spanAt(colPos(ed, r.colId)?.col.span ?? { base: 1 }, ed.options.breakpoint, ed.columns) <= 1,
			run: (ed, r) => resizeColBy(ed, r.colId!, -1),
		});
		colAct({ id: '---3', label: '', run: () => {} });
		colAct({ id: 'col-edit-text', label: 'Edit text', visible: (ed, r) => !isRawCol(ed, r), run: (ed, r) => ed.canvas.focusCol(r.colId!) });
		colAct({ id: 'col-edit-code', label: 'Edit code…', visible: isRawCol, run: (ed, r) => ed.editRaw(r.rowId, r.colId) });
		colAct({ id: 'col-add', label: 'Add column after', run: (ed, r) => addColCmd(ed, r.rowId, r.colId) });
		colAct({ id: 'col-dup', label: 'Duplicate column', shortcut: 'Mod+D', run: (ed, r) => duplicateColCmd(ed, r.colId!) });
		colAct({
			id: 'col-to-raw',
			label: 'Convert to HTML code',
			visible: (ed, r) => !isRawCol(ed, r),
			run: (ed, r) =>
				ed.apply('Convert to HTML', (d) => {
					const ref = findCol(d, r.colId!);
					if (!ref) return false;
					ref.col.kind = 'raw';
				}, { focus: { kind: 'col-handle', id: r.colId! } }),
		});
		colAct({ id: 'col-settings', label: 'Column settings…', run: (ed, r) => settingsDialog(ed, 'col', r.colId!) });
		colAct({ id: '---4', label: '', run: () => {} });
		colAct({ id: 'col-delete', label: 'Delete column', shortcut: 'Delete', danger: true, run: (ed, r) => deleteColCmd(ed, r.colId!) });
	},
};
