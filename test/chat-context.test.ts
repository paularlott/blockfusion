import { describe, expect, it } from 'vitest';
import { columnText, pageContext } from '../src/assistant/tools';
import type { Editor } from '../src/editor';

const long = 'Our garden — planted in spring — grew well. '.repeat(20).trim();

/** Just what pageContext reads of an editor. */
function fakeEditor(selected = ''): Editor {
	const html = `<h2>Garden news</h2><p>${long}</p><ul><li>Lavender</li><li>Catmint — by the gate</li></ul>`;
	return {
		doc: { rows: [{ id: 'r1', kind: 'grid', cols: [{ id: 'c1', kind: 'rich', span: { base: 12 }, html }] }] },
		activeRow: 'r1',
		activeCol: 'c1',
		canvas: { range: selected ? { collapsed: false, toString: () => selected } : null },
	} as unknown as Editor;
}

describe('chat page context', () => {
	it('writes a column as write_column takes it', () => {
		expect(columnText('<h2>Title</h2><p>One  two</p><ul><li>a</li><li>b</li></ul><div><p>Inner</p></div>')).toBe('# Title\n\nOne two\n\n- a\n- b\n\nInner');
	});

	it('gives a small model short previews', () => {
		const ctx = pageContext(fakeEditor(long));
		expect(ctx).not.toContain('The whole text of that column');
		expect(ctx).toContain('Selected text (the first 300 characters');
	});

	it('gives a large-context model the whole column and selection', () => {
		const ctx = pageContext(fakeEditor(long), true);
		expect(ctx).toContain(`The whole text of that column, in the form write_column takes:\n"""\n# Garden news\n\n${long}\n\n- Lavender\n- Catmint — by the gate\n"""`);
		expect(ctx).toContain(`Selected text (all of it): "${long}"`);
		expect(ctx).toContain('use insert_text');
	});
});
