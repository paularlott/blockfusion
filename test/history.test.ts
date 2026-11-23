import { describe, expect, it } from 'vitest';
import { History } from '../src/history/history';
import type { Doc } from '../src/model/types';

const doc = (text: string): Doc => ({
	rows: [{ id: 'r', kind: 'grid', cols: [{ id: 'c', kind: 'rich', span: { base: 12 }, html: text }] }],
});

describe('History', () => {
	it('undoes and redoes in order with labels', () => {
		const h = new History();
		h.record('Insert row', doc('a'), doc('b'));
		h.record('Delete row', doc('b'), doc('c'));
		expect(h.undoLabel).toBe('Delete row');
		expect(h.undo()?.before).toEqual(doc('b'));
		expect(h.undoLabel).toBe('Insert row');
		expect(h.redoLabel).toBe('Delete row');
		expect(h.redo()?.after).toEqual(doc('c'));
		expect(h.canRedo).toBe(false);
	});

	it('clears redo on a new change', () => {
		const h = new History();
		h.record('A', doc('a'), doc('b'));
		h.undo();
		h.record('B', doc('a'), doc('x'));
		expect(h.canRedo).toBe(false);
		expect(h.undoLabel).toBe('B');
	});

	it('merges typing in one column within the window', () => {
		let t = 0;
		const h = new History(200, 1000, () => t);
		h.record('Typing', doc(''), doc('h'), { mergeKey: 'type:c' });
		t = 300;
		h.record('Typing', doc('h'), doc('he'), { mergeKey: 'type:c' });
		t = 600;
		h.record('Typing', doc('he'), doc('hey'), { mergeKey: 'type:c' });
		expect(h.size.undo).toBe(1);
		const e = h.undo()!;
		expect(e.before).toEqual(doc(''));
		expect(e.after).toEqual(doc('hey'));
	});

	it('starts a new step after a pause, a seal or another column', () => {
		let t = 0;
		const h = new History(200, 1000, () => t);
		h.record('Typing', doc(''), doc('a'), { mergeKey: 'type:c' });
		t = 5000;
		h.record('Typing', doc('a'), doc('ab'), { mergeKey: 'type:c' });
		expect(h.size.undo).toBe(2);
		h.seal();
		h.record('Typing', doc('ab'), doc('abc'), { mergeKey: 'type:c' });
		expect(h.size.undo).toBe(3);
		h.record('Typing', doc('abc'), doc('abcd'), { mergeKey: 'type:d' });
		expect(h.size.undo).toBe(4);
	});

	it('does not merge into a structural step', () => {
		const h = new History();
		h.record('Insert row', doc(''), doc('a'));
		h.record('Typing', doc('a'), doc('ab'), { mergeKey: 'type:c' });
		expect(h.size.undo).toBe(2);
	});

	it('keeps snapshots independent of later mutation', () => {
		const h = new History();
		const before = doc('a');
		const after = doc('b');
		h.record('X', before, after);
		after.rows[0].cols[0].html = 'mutated';
		expect(h.undo()!.after).toEqual(doc('b'));
	});

	it('respects the limit', () => {
		const h = new History(3);
		for (let i = 0; i < 5; i++) h.record('S' + i, doc(String(i)), doc(String(i + 1)));
		expect(h.size.undo).toBe(3);
		expect(h.undoLabel).toBe('S4');
	});
});
