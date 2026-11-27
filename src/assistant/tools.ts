/**
 * What the chat assistant sees of the page, and the actions it can take.
 * Actions go through the editor's normal commands, so each is undoable and
 * announced. There's no delete action: a misunderstanding can't remove work.
 */
import { rebuild } from './marked';
import type { Editor } from '../editor';
import { createRow, findCol, insertRows, setColHtml } from '../model/doc';
import type { AssistantTool, AssistantToolCall } from '../types';

export const PAGE_TOOLS: AssistantTool[] = [
	{
		name: 'add_row',
		description: 'Add one new row of equal columns to the page. Call it once per request; use count only when the user asks for several rows.',
		parameters: {
			type: 'object',
			properties: {
				columns: { type: 'integer', minimum: 1, maximum: 4, description: 'Number of equal columns in the row, 1 to 4' },
				count: { type: 'integer', minimum: 1, maximum: 5, description: 'How many such rows to add. Default 1' },
				position: { type: 'string', enum: ['after_current', 'before_current', 'start', 'end'], description: 'Where the row goes; default after_current' },
			},
			required: ['columns'],
		},
	},
	{
		name: 'write_column',
		description: 'Replace the content of one column with new text. Rows and columns are numbered from 1.',
		parameters: {
			type: 'object',
			properties: {
				row: { type: 'integer' },
				column: { type: 'integer' },
				text: { type: 'string', description: 'The new content as text; blank lines separate paragraphs; a first line starting "# " is a heading; **bold**, *italic* and `code` are kept as formatting' },
			},
			required: ['row', 'column', 'text'],
		},
	},
	{
		name: 'insert_text',
		description: 'Insert text at the cursor, replacing any selected text.',
		parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
	},
];

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** How much text the chat context carries: short previews, or whole texts for a model that takes long prompts. */
const LIMITS = {
	small: { preview: 90, selection: 300, column: 0 },
	large: { preview: 200, selection: 8000, column: 8000 },
};

/**
 * A column's text in the form write_column takes: paragraphs separated by
 * blank lines, headings as "# ", list items as "- ".
 */
export function columnText(html: string): string {
	const box = document.createElement('div');
	box.innerHTML = html;
	const out: string[] = [];
	const words = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
	const walk = (node: Element) => {
		for (const el of Array.from(node.children)) {
			const tag = el.tagName;
			if (/^H[1-6]$/.test(tag)) out.push(`# ${words(el)}`);
			else if (tag === 'UL' || tag === 'OL') out.push(Array.from(el.children).map((li) => `- ${words(li)}`).join('\n'));
			else if (tag === 'DIV' || tag === 'SECTION' || tag === 'ARTICLE' || tag === 'BLOCKQUOTE') walk(el);
			else out.push(words(el));
		}
	};
	walk(box);
	if (!box.children.length) out.push(words(box));
	return out.filter(Boolean).join('\n\n');
}

/**
 * A description of the page for the model: rows, columns, their text (the
 * start of it, or with `large` the whole of the cursor's column), the cursor
 * and the selection.
 */
export function pageContext(editor: Editor, large = false): string {
	const limit = large ? LIMITS.large : LIMITS.small;
	const doc = editor.doc;
	const lines = ['Page outline:'];
	if (!doc.rows.length) lines.push('(the page is empty)');
	doc.rows.forEach((row, i) => {
		if (row.kind === 'raw') {
			lines.push(`Row ${i + 1}: HTML code (not editable by you)`);
			return;
		}
		const cols = row.cols.map((c, j) => {
			if (c.kind === 'raw') return `[column ${j + 1}] (HTML code)`;
			const el = document.createElement('div');
			el.innerHTML = c.html;
			const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
			return `[column ${j + 1}] ${text ? `"${clip(text, limit.preview)}"` : '(empty)'}`;
		});
		lines.push(`Row ${i + 1}, ${row.cols.length} column${row.cols.length > 1 ? 's' : ''}: ${cols.join(' ')}`);
	});
	const rowIdx = editor.activeRow ? doc.rows.findIndex((r) => r.id === editor.activeRow) : -1;
	const colRef = editor.activeCol ? findCol(doc, editor.activeCol) : undefined;
	if (colRef) {
		lines.push(`The cursor is in row ${colRef.rowIndex + 1}, column ${colRef.colIndex + 1}.`);
		const col = colRef.col;
		if (limit.column && col.kind !== 'raw') {
			const text = columnText(col.html);
			if (text) {
				const cut = text.length > limit.column;
				lines.push(`The whole text of that column${cut ? ` (its first ${limit.column} characters; it is longer)` : ''}, in the form write_column takes:\n"""\n${cut ? text.slice(0, limit.column) : text}\n"""`);
			}
		}
	}
	else if (rowIdx >= 0) lines.push(`The current row is row ${rowIdx + 1}.`);
	else lines.push('No row is selected; new rows go at the end.');
	const sel = editor.canvas.range;
	const selected = sel && !sel.collapsed ? sel.toString().trim() : '';
	if (selected) {
		if (selected.length > limit.selection) lines.push(`Selected text (the first ${limit.selection} characters; the selection is longer): "${selected.slice(0, limit.selection)}"`);
		else lines.push(`Selected text${large ? ' (all of it)' : ''}: "${selected}"`);
		lines.push('To change only the selected text, use insert_text: it replaces the selection.');
	}
	return lines.join('\n');
}

/** Text with **bold**, *italic* and `code` marks as safe inline HTML (no links: there's no original to rebuild). */
function inline(text: string): string {
	const box = document.createElement('div');
	box.append(rebuild(text, { refs: [], spans: [] }, document).frag);
	return box.innerHTML;
}

/** Plain text to simple content: paragraphs, a "# " heading, and **bold**, *italic* and `code` marks. */
export function textToContent(text: string): string {
	return text
		.trim()
		.split(/\n{2,}/)
		.map((p) => p.trim())
		.filter(Boolean)
		.map((p) => {
			const hm = /^(#{1,3})\s+(.*)$/s.exec(p);
			if (hm) return `<h${hm[1].length + 1}>${inline(hm[2].trim())}</h${hm[1].length + 1}>`;
			return `<p>${inline(p)}</p>`;
		})
		.join('');
}

const int = (v: unknown) => (typeof v === 'number' ? Math.round(v) : Number.parseInt(String(v), 10));

/**
 * What makes two calls the same action, for dropping repeats: adding a row
 * is the same whatever position a confused model gives each copy.
 */
export function callKey(call: AssistantToolCall): string {
	const a = call.arguments ?? {};
	if (call.name === 'add_row') return `add_row:${int(a.columns) || 1}:${int(a.count) || 1}`;
	return JSON.stringify(call);
}

/** Run one action. Returns what happened, for the model and the chat. */
export function runPageTool(editor: Editor, call: AssistantToolCall): { ok: boolean; report: string } {
	const a = call.arguments ?? {};
	if (call.name === 'add_row') {
		const n = Math.min(4, Math.max(1, int(a.columns) || 1));
		const cols = editor.columns;
		const span = Math.floor(cols / n);
		const spans = Array.from({ length: n }, () => span);
		const pos = String(a.position ?? 'after_current');
		const count = Math.min(5, Math.max(1, int(a.count) || 1));
		const rows = Array.from({ length: count }, () => createRow(spans, editor.options.breakpoint, '', cols));
		const cur = editor.activeRow ? editor.doc.rows.findIndex((r) => r.id === editor.activeRow) : -1;
		const at = pos === 'start' ? 0 : pos === 'before_current' && cur >= 0 ? cur : pos === 'after_current' && cur >= 0 ? cur + 1 : editor.doc.rows.length;
		editor.apply(count > 1 ? 'Assistant: add rows' : 'Assistant: add row', (d) => insertRows(d, rows, at), {
			focus: { kind: 'col', id: rows[rows.length - 1].cols[0].id, atStart: true },
			announce: count > 1 ? `${count} rows added` : 'Row added',
		});
		const ids = new Set(rows.map((r) => r.id));
		const added = editor.doc.rows.map((r, i) => (ids.has(r.id) ? i + 1 : -1)).filter((i) => i > 0);
		if (!added.length) return { ok: false, report: 'Could not add the row.' };
		const what = `${n} empty column${n > 1 ? 's' : ''}`;
		return {
			ok: true,
			report: added.length === 1 ? `Added row ${added[0]} with ${what}.` : `Added rows ${added.join(', ')}, each with ${what}.`,
		};
	}
	if (call.name === 'write_column') {
		const r = int(a.row);
		const c = int(a.column);
		const row = editor.doc.rows[r - 1];
		const col = row?.cols[c - 1];
		if (!row || row.kind !== 'grid' || !col) return { ok: false, report: `There is no row ${r}, column ${c}.` };
		if (col.kind !== 'rich') return { ok: false, report: `Row ${r}, column ${c} is HTML code and can't be written.` };
		const html = textToContent(String(a.text ?? ''));
		if (!html) return { ok: false, report: 'There was no text to write.' };
		editor.apply('Assistant: write column', (d) => setColHtml(d, col.id, html), {
			focus: { kind: 'col', id: col.id },
			announce: `Wrote into row ${r}, column ${c}`,
		});
		return { ok: true, report: `Wrote into row ${r}, column ${c}.` };
	}
	if (call.name === 'insert_text') {
		const text = String(a.text ?? '');
		if (!text) return { ok: false, report: 'There was no text to insert.' };
		const ok = editor.runText('Assistant: insert text', (d) => d.execCommand('insertText', false, text));
		return ok ? { ok: true, report: 'Inserted the text at the cursor.' } : { ok: false, report: 'There is no cursor in a text column to insert at.' };
	}
	return { ok: false, report: `Unknown action ${call.name}.` };
}
