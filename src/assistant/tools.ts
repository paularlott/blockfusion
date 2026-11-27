/**
 * What the chat assistant sees of the page, and the actions it can take.
 * Actions go through the editor's normal commands, so each is one undo step
 * and announced. Reading tools let a model see a column or the page in full
 * when the outline only shows the start of each.
 */
import { rebuild } from './marked';
import { sanitizeHtml } from './sanitize';
import type { Editor } from '../editor';
import { createRow, findCol, insertRows, moveRow, removeRow, setColHtml, spanAt } from '../model/doc';
import type { AssistantProvider, AssistantTool, AssistantToolCall } from '../types';

/** Column counts that split a grid of `grid` columns evenly. */
export function evenSplits(grid: number): number[] {
	return Array.from({ length: grid }, (_, i) => i + 1).filter((n) => grid % n === 0);
}

/** add_row for a grid of `grid` columns: equal columns that divide it, or chosen widths that fill it. */
export function addRowTool(grid: number): AssistantTool {
	const splits = evenSplits(grid);
	// An example of different widths that fits this grid: 2/3 + 1/3, else 3/4 + 1/4, else all but one + 1
	const part = grid % 3 === 0 ? grid / 3 : grid % 4 === 0 ? grid / 4 : 1;
	return {
		name: 'add_row',
		description: `Add a new row of columns to the page. The page's grid is ${grid} columns wide. Either give "columns" for equal columns (${splits.join(', ')}), or give "spans" for columns of different widths that add up to ${grid} (for example [${grid - part}, ${part}]). Use "rows" only when the user asks for several rows the same.`,
		parameters: {
			type: 'object',
			properties: {
				columns: { type: 'integer', enum: splits, description: `How many equal columns: one of ${splits.join(', ')}` },
				spans: { type: 'array', items: { type: 'integer', minimum: 1, maximum: grid }, description: `Widths of the columns, left to right, adding up to ${grid}; instead of "columns"` },
				rows: { type: 'integer', minimum: 1, maximum: 5, description: 'How many identical rows to add, 1 to 5. Default 1' },
				position: { type: 'string', enum: ['after_current', 'before_current', 'start', 'end'], description: 'Where the new rows go. Default after_current' },
			},
		},
	};
}

export const PAGE_TOOLS: AssistantTool[] = [
	addRowTool(12),
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
	{
		name: 'replace_text',
		description:
			'Find and replace text on the page, keeping its formatting and links. Without row and column it works on the whole page. A match must be within a run of text with the same formatting. Use an empty replacement to remove the text.',
		parameters: {
			type: 'object',
			properties: {
				find: { type: 'string', description: 'The exact text to find' },
				replace: { type: 'string', description: 'What to put in its place; empty to remove it' },
				row: { type: 'integer', description: 'Only this row (from 1)' },
				column: { type: 'integer', description: 'Only this column of the row (from 1)' },
				match_case: { type: 'boolean', description: 'Default false' },
			},
			required: ['find', 'replace'],
		},
	},
	{
		name: 'write_column_html',
		description:
			'Replace the content of one column with HTML, keeping formatting: paragraphs, headings, lists, links, bold and the like, tables, and the classes and styles of the original. Read the column first with read_column and change only what was asked.',
		parameters: {
			type: 'object',
			properties: {
				row: { type: 'integer' },
				column: { type: 'integer' },
				html: { type: 'string', description: 'The new HTML for the column' },
			},
			required: ['row', 'column', 'html'],
		},
	},
	{
		name: 'remove_row',
		description: 'Remove one row and its content from the page. Only when the user asks for it.',
		parameters: { type: 'object', properties: { row: { type: 'integer' } }, required: ['row'] },
	},
	{
		name: 'move_row',
		description: 'Move a row to another position. Rows are numbered from 1; the row ends up at position "to".',
		parameters: { type: 'object', properties: { row: { type: 'integer' }, to: { type: 'integer' } }, required: ['row', 'to'] },
	},
	{
		name: 'read_column',
		description: 'Read the whole content of one column (the outline only shows its start). It changes nothing.',
		parameters: { type: 'object', properties: { row: { type: 'integer' }, column: { type: 'integer' } }, required: ['row', 'column'] },
	},
	{
		name: 'read_row',
		description: 'Read the whole content of every column in one row. It changes nothing.',
		parameters: { type: 'object', properties: { row: { type: 'integer' } }, required: ['row'] },
	},
	{
		name: 'read_page',
		description: 'Read the whole text of every column on the page. It changes nothing.',
		parameters: { type: 'object', properties: {} },
	},
];

/** Tools that only read: they change nothing and may be repeated after a change. */
export const READ_TOOLS = new Set(['read_column', 'read_row', 'read_page']);

/**
 * The tools for a provider. Small (in-browser) models get a short list,
 * which they follow more reliably; writing HTML needs a model that takes it.
 */
export function pageTools(provider: Pick<AssistantProvider, 'largeContext' | 'html'>, grid = 12): AssistantTool[] {
	const small = new Set(['add_row', 'write_column', 'insert_text', 'replace_text', 'read_column']);
	return PAGE_TOOLS.map((t) => (t.name === 'add_row' ? addRowTool(grid) : t)).filter((t) => {
		if (t.name === 'write_column_html') return !!provider.html && !!provider.largeContext;
		return provider.largeContext || small.has(t.name);
	});
}

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
	let clipped = false;
	const grid = editor.columns;
	const n = doc.rows.length;
	const lines = [`Page outline: ${n} row${n === 1 ? '' : 's'}, on a grid ${grid} columns wide.`];
	if (!n) lines.push('(the page is empty)');
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
			if (text.length > limit.preview) clipped = true;
			return `[column ${j + 1}] ${text ? `"${clip(text, limit.preview)}"` : '(empty)'}`;
		});
		// The widths at the editor's breakpoint, as add_row's spans would give them
		const widths = row.cols.map((c) => spanAt(c.span, editor.options.breakpoint, grid)).join(' + ');
		lines.push(`Row ${i + 1}, ${row.cols.length} column${row.cols.length > 1 ? 's' : ''} (${widths}): ${cols.join(' ')}`);
	});
	if (clipped) lines.push('Long columns are shown only in part: use read_column to see one in full before changing it.');
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
	// Reading again after a change is fine
	if (READ_TOOLS.has(call.name)) return `${JSON.stringify(call)}:${Math.random()}`;
	if (call.name === 'add_row') return `add_row:${Array.isArray(a.spans) ? (a.spans as unknown[]).join('+') : int(a.columns) || 1}:${int(a.rows ?? a.count) || 1}`;
	return JSON.stringify(call);
}

/** What a tool did: the report goes to the model; `note`, when set, is what the chat shows instead. */
export interface PageToolResult {
	ok: boolean;
	report: string;
	note?: string;
	/** false for tools that only read */
	changed?: boolean;
}

/** Most characters read_page returns. */
const READ_PAGE_LIMIT = 30000;

/** A rich column by its row and column numbers, or why there isn't one. */
function richCol(editor: Editor, r: number, c: number) {
	const row = editor.doc.rows[r - 1];
	const col = row?.cols[c - 1];
	if (!row || row.kind !== 'grid' || !col) return { error: `There is no row ${r}, column ${c}.` };
	if (col.kind !== 'rich') return { error: `Row ${r}, column ${c} is HTML code and can't be changed.` };
	return { col };
}

/** Replace `find` in the text of an HTML fragment, inside its text nodes. Returns the new HTML and the count. */
export function replaceInHtml(html: string, find: string, replace: string, matchCase = false): { html: string; count: number } {
	const tpl = document.createElement('template');
	tpl.innerHTML = html;
	const re = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), matchCase ? 'g' : 'gi');
	let count = 0;
	const walker = document.createTreeWalker(tpl.content, NodeFilter.SHOW_TEXT);
	for (let n = walker.nextNode(); n; n = walker.nextNode()) {
		const t = n.textContent ?? '';
		const next = t.replace(re, () => {
			count++;
			return replace;
		});
		if (next !== t) n.textContent = next;
	}
	return { html: tpl.innerHTML, count };
}

/** Run one action. Returns what happened, for the model and the chat. */
export function runPageTool(editor: Editor, call: AssistantToolCall, provider?: Pick<AssistantProvider, 'html'>): PageToolResult {
	const a = call.arguments ?? {};
	const rowText = (r: number) =>
		(editor.doc.rows[r - 1]?.cols ?? [])
			.map((c) => (c.kind === 'rich' ? columnText(c.html) : ''))
			.join(' ')
			.replace(/\s+/g, ' ')
			.trim();
	if (call.name === 'replace_text') {
		const find = String(a.find ?? '');
		const replace = String(a.replace ?? '');
		if (!find) return { ok: false, report: 'There was no text to find.' };
		const r = a.row !== undefined ? int(a.row) : 0;
		const c = a.column !== undefined ? int(a.column) : 0;
		const targets: Array<{ id: string; html: string }> = [];
		editor.doc.rows.forEach((row, i) => {
			if (row.kind !== 'grid' || (r && i + 1 !== r)) return;
			row.cols.forEach((col, j) => {
				if (col.kind === 'rich' && (!c || j + 1 === c)) targets.push({ id: col.id, html: col.html });
			});
		});
		if (r && !targets.length) return { ok: false, report: `There is no text column at row ${r}${c ? `, column ${c}` : ''}.` };
		let total = 0;
		const changes = targets
			.map((t) => {
				const res = replaceInHtml(t.html, find, replace, a.match_case === true);
				total += res.count;
				return { id: t.id, html: res.html, count: res.count };
			})
			.filter((t) => t.count);
		if (!total) return { ok: false, report: `"${find}" wasn't found${r ? ` in row ${r}${c ? `, column ${c}` : ''}` : ' on the page'}. It may be split by formatting, or written differently.` };
		editor.apply('Assistant: replace text', (d) => {
			for (const ch of changes) setColHtml(d, ch.id, ch.html);
		}, { announce: `Replaced ${total} ${total === 1 ? 'match' : 'matches'}` });
		return { ok: true, report: `Replaced ${total} ${total === 1 ? 'match' : 'matches'} of "${find}" in ${changes.length} ${changes.length === 1 ? 'column' : 'columns'}.` };
	}
	if (call.name === 'write_column_html') {
		if (!provider?.html) return { ok: false, report: 'Writing HTML is not available; use write_column.' };
		const r = int(a.row);
		const c = int(a.column);
		const found = richCol(editor, r, c);
		if (found.error) return { ok: false, report: found.error };
		const box = document.createElement('div');
		box.append(sanitizeHtml(String(a.html ?? ''), document, { blocks: true }));
		const html = box.innerHTML.trim();
		if (!box.textContent?.trim() && !box.querySelector('img')) return { ok: false, report: 'There was no content to write.' };
		editor.apply('Assistant: write column', (d) => setColHtml(d, found.col!.id, html), {
			focus: { kind: 'col', id: found.col!.id },
			announce: `Wrote into row ${r}, column ${c}`,
		});
		return { ok: true, report: `Wrote into row ${r}, column ${c}.` };
	}
	if (call.name === 'remove_row') {
		const r = int(a.row);
		const row = editor.doc.rows[r - 1];
		if (!row) return { ok: false, report: `There is no row ${r}.` };
		if (row.kind === 'raw') return { ok: false, report: `Row ${r} is HTML code; it isn't removed by the assistant.` };
		const text = rowText(r);
		editor.apply('Assistant: remove row', (d) => {
			removeRow(d, row.id);
		}, { announce: `Row ${r} removed` });
		return { ok: true, report: `Removed row ${r}${text ? ` ("${clip(text, 60)}")` : ' (it was empty)'}. The rows after it moved up one.` };
	}
	if (call.name === 'move_row') {
		const r = int(a.row);
		const n = editor.doc.rows.length;
		const to = Math.min(n, Math.max(1, int(a.to)));
		const row = editor.doc.rows[r - 1];
		if (!row) return { ok: false, report: `There is no row ${r}.` };
		if (to === r) return { ok: false, report: `Row ${r} is already at position ${to}.` };
		editor.apply('Assistant: move row', (d) => moveRow(d, row.id, to - r), { announce: `Row moved to position ${to}` });
		return { ok: true, report: `Moved row ${r} to position ${to}. The rows between moved by one.` };
	}
	if (call.name === 'read_column') {
		const r = int(a.row);
		const c = int(a.column);
		const found = richCol(editor, r, c);
		if (found.error) return { ok: false, report: found.error, changed: false };
		const body = provider?.html ? found.col!.html : columnText(found.col!.html);
		return { ok: true, changed: false, report: `Row ${r}, column ${c}${provider?.html ? ' (HTML)' : ''}:\n${body || '(empty)'}`, note: `Read row ${r}, column ${c}.` };
	}
	if (call.name === 'read_row') {
		const r = int(a.row);
		const row = editor.doc.rows[r - 1];
		if (!row) return { ok: false, changed: false, report: `There is no row ${r}; the page has ${editor.doc.rows.length}.` };
		if (row.kind === 'raw') return { ok: true, changed: false, report: `Row ${r} is HTML code.`, note: `Read row ${r}.` };
		const body = row.cols
			.map((col, j) => {
				const content = col.kind !== 'rich' ? '(HTML code)' : provider?.html ? col.html : columnText(col.html);
				return `Column ${j + 1}${provider?.html && col.kind === 'rich' ? ' (HTML)' : ''}:\n${content || '(empty)'}`;
			})
			.join('\n\n');
		return { ok: true, changed: false, report: `Row ${r}:\n${body}`, note: `Read row ${r}.` };
	}
	if (call.name === 'read_page') {
		const parts: string[] = [];
		editor.doc.rows.forEach((row, i) => {
			if (row.kind === 'raw') {
				parts.push(`Row ${i + 1}: HTML code`);
				return;
			}
			row.cols.forEach((col, j) => {
				parts.push(`Row ${i + 1}, column ${j + 1}:\n${col.kind === 'rich' ? columnText(col.html) || '(empty)' : '(HTML code)'}`);
			});
		});
		let text = parts.join('\n\n');
		if (text.length > READ_PAGE_LIMIT) text = `${text.slice(0, READ_PAGE_LIMIT)}\n(The page is longer; read single columns for the rest.)`;
		return { ok: true, changed: false, report: text || '(the page is empty)', note: 'Read the page.' };
	}
	if (call.name === 'add_row') {
		const grid = editor.columns;
		let spans: number[];
		if (Array.isArray(a.spans) && a.spans.length) {
			spans = (a.spans as unknown[]).map(int);
			const sum = spans.reduce((t, n) => t + n, 0);
			if (spans.some((n) => !Number.isInteger(n) || n < 1) || sum !== grid)
				return { ok: false, report: `The spans must be whole numbers adding up to ${grid}, the grid's width; [${spans.join(', ')}] adds up to ${sum}.` };
		} else {
			// One column when neither is given
			const n = int(a.columns) || 1;
			if (grid % n !== 0 || n < 1 || n > grid)
				return { ok: false, report: `${n} equal columns don't fit a ${grid} column grid. Use one of ${evenSplits(grid).join(', ')}, or give spans for different widths.` };
			spans = Array.from({ length: n }, () => grid / n);
		}
		const pos = String(a.position ?? 'after_current');
		// "count" is what this was called before "rows"
		const count = Math.min(5, Math.max(1, int(a.rows ?? a.count) || 1));
		const rows = Array.from({ length: count }, () => createRow(spans, editor.options.breakpoint, '', grid));
		const cur = editor.activeRow ? editor.doc.rows.findIndex((r) => r.id === editor.activeRow) : -1;
		const at = pos === 'start' ? 0 : pos === 'before_current' && cur >= 0 ? cur : pos === 'after_current' && cur >= 0 ? cur + 1 : editor.doc.rows.length;
		editor.apply(count > 1 ? 'Assistant: add rows' : 'Assistant: add row', (d) => insertRows(d, rows, at), {
			focus: { kind: 'col', id: rows[rows.length - 1].cols[0].id, atStart: true },
			announce: count > 1 ? `${count} rows added` : 'Row added',
		});
		const ids = new Set(rows.map((r) => r.id));
		const added = editor.doc.rows.map((r, i) => (ids.has(r.id) ? i + 1 : -1)).filter((i) => i > 0);
		if (!added.length) return { ok: false, report: 'Could not add the row.' };
		const equal = spans.every((n) => n === spans[0]);
		const what = equal ? `${spans.length} empty column${spans.length > 1 ? 's' : ''}` : `${spans.length} empty columns ${spans.join(' + ')} wide`;
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
