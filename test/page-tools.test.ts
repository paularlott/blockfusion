import { describe, expect, it } from 'vitest';
import { addRowTool, evenSplits, pageTools, replaceInHtml, runPageTool } from '../src/assistant/tools';
import { sanitizeHtml } from '../src/assistant/sanitize';
import type { Editor } from '../src/editor';
import type { Doc } from '../src/model/types';

/** An editor stand-in: apply() runs the change on the doc, as one step. */
function fakeEditor(): Editor & { steps: string[] } {
	const doc: Doc = {
		rows: [
			{ id: 'r1', kind: 'grid', cols: [{ id: 'c1', kind: 'rich', span: { base: 12 }, html: '<h2>Intro</h2><p>Plan — then <a href="/go">go</a> — <strong>fast</strong>.</p>' }] },
			{ id: 'r2', kind: 'grid', cols: [
				{ id: 'c2', kind: 'rich', span: { base: 6 }, html: '<p class="lead">Left — side</p>' },
				{ id: 'c3', kind: 'rich', span: { base: 6 }, html: '<p>Right side</p>' },
			] },
			{ id: 'r3', kind: 'raw', cols: [{ id: 'c4', kind: 'raw', span: { base: 12 }, html: '<script>x()</script>' }] },
		],
	} as unknown as Doc;
	const steps: string[] = [];
	return {
		doc,
		steps,
		columns: 12,
		options: { breakpoint: 'md' },
		activeRow: null,
		apply(label: string, fn: (d: Doc) => void) {
			steps.push(label);
			fn(doc);
		},
	} as unknown as Editor & { steps: string[] };
}

describe('page tools', () => {
	it('offers small models a short list and HTML writing only to HTML models', () => {
		const names = (p: { largeContext?: boolean; html?: boolean }) => pageTools(p).map((t) => t.name);
		expect(names({})).toEqual(['add_row', 'write_column', 'insert_text', 'replace_text', 'read_column']);
		expect(names({ largeContext: true })).not.toContain('write_column_html');
		expect(names({ largeContext: true, html: true })).toEqual(['add_row', 'write_column', 'insert_text', 'replace_text', 'write_column_html', 'remove_row', 'move_row', 'read_column', 'read_row', 'read_page']);
	});

	it('replaces text inside the markup, keeping links and formatting', () => {
		const r = replaceInHtml('<p>A — b <a href="/x">c — d</a> <strong>E</strong></p>', ' — ', ', ');
		expect(r).toEqual({ html: '<p>A, b <a href="/x">c, d</a> <strong>E</strong></p>', count: 2 });
		expect(replaceInHtml('<p>Cat cat</p>', 'cat', 'dog', true).html).toBe('<p>Cat dog</p>');
		expect(replaceInHtml('<p>a.b</p>', '.', '!').html).toBe('<p>a!b</p>');
	});

	it('replace_text works across the page in one undo step', () => {
		const ed = fakeEditor();
		const r = runPageTool(ed, { name: 'replace_text', arguments: { find: ' — ', replace: ', ' } });
		expect(r).toMatchObject({ ok: true, report: 'Replaced 3 matches of " — " in 2 columns.' });
		expect(ed.steps).toEqual(['Assistant: replace text']);
		expect(ed.doc.rows[0].cols[0].html).toBe('<h2>Intro</h2><p>Plan, then <a href="/go">go</a>, <strong>fast</strong>.</p>');
		expect(ed.doc.rows[1].cols[0].html).toBe('<p class="lead">Left, side</p>');
		expect(runPageTool(ed, { name: 'replace_text', arguments: { find: 'nowhere', replace: '' } }).ok).toBe(false);
	});

	it('write_column_html keeps classes and links and drops scripts', () => {
		const ed = fakeEditor();
		const html = '<p class="lead">New <a href="/a">link</a></p><script>alert(1)</script><p onclick="x()">B</p>';
		expect(runPageTool(ed, { name: 'write_column_html', arguments: { row: 2, column: 1, html } }).ok).toBe(false);
		const r = runPageTool(ed, { name: 'write_column_html', arguments: { row: 2, column: 1, html } }, { html: true });
		expect(r.ok).toBe(true);
		expect(ed.doc.rows[1].cols[0].html).toBe('<p class="lead">New <a href="/a">link</a></p><p>B</p>');
		expect(runPageTool(ed, { name: 'write_column_html', arguments: { row: 3, column: 1, html: '<p>x</p>' } }, { html: true }).ok).toBe(false);
	});

	it('removes and moves rows, but not HTML code rows', () => {
		const ed = fakeEditor();
		expect(runPageTool(ed, { name: 'remove_row', arguments: { row: 3 } }).ok).toBe(false);
		expect(runPageTool(ed, { name: 'move_row', arguments: { row: 1, to: 2 } }).report).toBe('Moved row 1 to position 2. The rows between moved by one.');
		expect(ed.doc.rows.map((r) => r.id)).toEqual(['r2', 'r1', 'r3']);
		const removed = runPageTool(ed, { name: 'remove_row', arguments: { row: 1 } });
		expect(removed.report).toBe('Removed row 1 ("Left — side Right side"). The rows after it moved up one.');
		expect(ed.doc.rows.map((r) => r.id)).toEqual(['r1', 'r3']);
	});

	it('reads a column or the page without changing anything', () => {
		const ed = fakeEditor();
		const col = runPageTool(ed, { name: 'read_column', arguments: { row: 2, column: 1 } });
		expect(col).toMatchObject({ ok: true, changed: false, note: 'Read row 2, column 1.', report: 'Row 2, column 1:\nLeft — side' });
		expect(runPageTool(ed, { name: 'read_column', arguments: { row: 2, column: 1 } }, { html: true }).report).toBe('Row 2, column 1 (HTML):\n<p class="lead">Left — side</p>');
		const page = runPageTool(ed, { name: 'read_page', arguments: {} });
		expect(page.report).toBe('Row 1, column 1:\n# Intro\n\nPlan — then go — fast.\n\nRow 2, column 1:\nLeft — side\n\nRow 2, column 2:\nRight side\n\nRow 3: HTML code');
		expect(ed.steps).toEqual([]);
	});

	it('sanitises a whole column in block mode', () => {
		const box = document.createElement('div');
		box.append(sanitizeHtml('<h2 style="color:red">T</h2><table><tr><td colspan="2">x</td></tr></table><iframe src="x"></iframe>', document, { blocks: true }));
		expect(box.innerHTML).toBe('<h2 style="color:red">T</h2><table><tbody><tr><td colspan="2">x</td></tr></tbody></table>');
		box.innerHTML = '';
		box.append(sanitizeHtml('<h2>T</h2>', document));
		expect(box.innerHTML).toBe('T');
	});

	it('add_row offers the column counts that fit the grid', () => {
		expect(evenSplits(12)).toEqual([1, 2, 3, 4, 6, 12]);
		expect(evenSplits(16)).toEqual([1, 2, 4, 8, 16]);
		const t = addRowTool(16);
		expect((t.parameters.properties as Record<string, { enum?: number[] }>).columns.enum).toEqual([1, 2, 4, 8, 16]);
		expect(t.description).toContain('[12, 4]');
		expect(addRowTool(12).description).toContain('[8, 4]');
		expect(pageTools({}, 24).find((x) => x.name === 'add_row')!.description).toContain('24 columns wide');
	});

	it('add_row makes equal columns, chosen widths and several rows', () => {
		const spansOf = (ed: Editor, i: number) => ed.doc.rows[i].cols.map((c) => c.span.md ?? c.span.base);
		const ed = fakeEditor();
		expect(runPageTool(ed, { name: 'add_row', arguments: { columns: 6, position: 'end' } }).report).toBe('Added row 4 with 6 empty columns.');
		expect(spansOf(ed, 3)).toEqual([2, 2, 2, 2, 2, 2]);
		expect(runPageTool(ed, { name: 'add_row', arguments: { spans: [3, 6, 3], position: 'start' } }).report).toBe('Added row 1 with 3 empty columns 3 + 6 + 3 wide.');
		expect(spansOf(ed, 0)).toEqual([3, 6, 3]);
		expect(runPageTool(ed, { name: 'add_row', arguments: { columns: 2, rows: 2, position: 'end' } }).report).toBe('Added rows 6, 7, each with 2 empty columns.');
		// The older name for rows still works
		expect(runPageTool(ed, { name: 'add_row', arguments: { columns: 1, count: 2, position: 'end' } }).report).toBe('Added rows 8, 9, each with 1 empty column.');
	});

	it('add_row explains what doesn\'t fit', () => {
		const ed = fakeEditor();
		expect(runPageTool(ed, { name: 'add_row', arguments: { columns: 5 } }).report).toBe("5 equal columns don't fit a 12 column grid. Use one of 1, 2, 3, 4, 6, 12, or give spans for different widths.");
		expect(runPageTool(ed, { name: 'add_row', arguments: { spans: [8, 8] } }).report).toBe("The spans must be whole numbers adding up to 12, the grid's width; [8, 8] adds up to 16.");
		expect(ed.steps).toEqual([]);
	});

	it('read_row gives every column of a row in full', () => {
		const ed = fakeEditor();
		expect(runPageTool(ed, { name: 'read_row', arguments: { row: 2 } })).toMatchObject({
			ok: true,
			changed: false,
			note: 'Read row 2.',
			report: 'Row 2:\nColumn 1:\nLeft — side\n\nColumn 2:\nRight side',
		});
		expect(runPageTool(ed, { name: 'read_row', arguments: { row: 2 } }, { html: true }).report).toBe('Row 2:\nColumn 1 (HTML):\n<p class="lead">Left — side</p>\n\nColumn 2 (HTML):\n<p>Right side</p>');
		expect(runPageTool(ed, { name: 'read_row', arguments: { row: 9 } }).report).toBe('There is no row 9; the page has 3.');
		expect(ed.steps).toEqual([]);
	});
});
