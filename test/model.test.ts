import { describe, expect, it } from 'vitest';
import {
	addCol,
	createRow,
	duplicateCol,
	duplicateRow,
	findCol,
	insertRows,
	makeSpan,
	moveCol,
	moveRow,
	normaliseSpan,
	parseLayout,
	removeCol,
	removeRow,
	resizeCol,
	setColAttrs,
	setRowAttrs,
	spanAt,
	spanKeyFor,
} from '../src/model/doc';
import type { Doc } from '../src/model/types';

function doc3(): Doc {
	const d: Doc = { rows: [] };
	insertRows(d, [createRow([12]), createRow([6, 6]), createRow([4, 4, 4])]);
	return d;
}

describe('spans', () => {
	it('makes spans for a layout breakpoint', () => {
		expect(makeSpan(6, 'md')).toEqual({ base: 12, md: 6 });
		expect(makeSpan(12, 'md')).toEqual({ base: 12 });
		expect(makeSpan(4, 'base')).toEqual({ base: 4 });
	});
	it('inherits from smaller breakpoints', () => {
		const s = { base: 12, sm: 6 };
		expect(spanAt(s, 'base')).toBe(12);
		expect(spanAt(s, 'md')).toBe(6);
		expect(spanAt(s, 'lg')).toBe(6);
	});
	it('chooses the key a resize changes', () => {
		expect(spanKeyFor({ base: 12, sm: 6 }, 'md')).toBe('sm');
		expect(spanKeyFor({ base: 12 }, 'md')).toBe('md');
		expect(spanKeyFor({ base: 12, lg: 3 }, 'md')).toBe('md');
	});
	it('normalises redundant breakpoints', () => {
		expect(normaliseSpan({ base: 12, sm: 12, md: 6, lg: 6 })).toEqual({ base: 12, md: 6 });
		expect(normaliseSpan({ base: 20 })).toEqual({ base: 12 });
	});
	it('parses layout descriptions', () => {
		expect(parseLayout('6+6')).toEqual([6, 6]);
		expect(parseLayout('1/3 1/3 1/3')).toEqual([4, 4, 4]);
		expect(parseLayout('2/3, 1/3')).toEqual([8, 4]);
		expect(parseLayout('3 6 3')).toEqual([3, 6, 3]);
		expect(parseLayout('13')).toBeNull();
		expect(parseLayout('1/5')).toBeNull();
		expect(parseLayout('abc')).toBeNull();
	});
});

describe('row operations', () => {
	it('creates rows from layouts', () => {
		const row = createRow([8, 4]);
		expect(row.cols.map((c) => c.span)).toEqual([{ base: 12, md: 8 }, { base: 12, md: 4 }]);
	});
	it('moves rows up and down within bounds', () => {
		const d = doc3();
		const [a, b, c] = d.rows.map((r) => r.id);
		expect(moveRow(d, a, -1)).toBe(false);
		expect(moveRow(d, a, 1)).toBe(true);
		expect(d.rows.map((r) => r.id)).toEqual([b, a, c]);
		expect(moveRow(d, c, 1)).toBe(false);
	});
	it('duplicates a row with fresh ids', () => {
		const d = doc3();
		const copy = duplicateRow(d, d.rows[1].id)!;
		expect(d.rows).toHaveLength(4);
		expect(d.rows[2]).toBe(copy);
		expect(copy.id).not.toBe(d.rows[1].id);
		expect(copy.cols[0].id).not.toBe(d.rows[1].cols[0].id);
		expect(copy.cols.map((c) => c.span)).toEqual(d.rows[1].cols.map((c) => c.span));
	});
	it('removes rows', () => {
		const d = doc3();
		removeRow(d, d.rows[0].id);
		expect(d.rows).toHaveLength(2);
	});
	it('sets row attributes canonically', () => {
		const d = doc3();
		setRowAttrs(d, d.rows[0].id, { className: ' hero ', id: '', tag: 'DIV', style: 'color:red' });
		expect(d.rows[0].attrs).toEqual({ className: 'hero', style: 'color:red' });
		setRowAttrs(d, d.rows[0].id, { tag: 'section' });
		expect(d.rows[0].attrs).toEqual({ tag: 'section' });
	});
});

describe('column operations', () => {
	it('adds columns and rebalances when 12 divides evenly', () => {
		const d = doc3();
		addCol(d, d.rows[1].id);
		expect(d.rows[1].cols.map((c) => spanAt(c.span, 'md'))).toEqual([4, 4, 4]);
		addCol(d, d.rows[1].id);
		expect(d.rows[1].cols.map((c) => spanAt(c.span, 'md'))).toEqual([3, 3, 3, 3]);
		addCol(d, d.rows[1].id);
		expect(d.rows[1].cols).toHaveLength(5);
		expect(spanAt(d.rows[1].cols[4].span, 'md')).toBe(2);
	});
	it('removes columns and the row with the last one', () => {
		const d = doc3();
		const row = d.rows[1];
		removeCol(d, row.cols[0].id);
		expect(row.cols).toHaveLength(1);
		removeCol(d, row.cols[0].id);
		expect(d.rows).toHaveLength(2);
	});
	it('moves columns left and right', () => {
		const d = doc3();
		const ids = d.rows[2].cols.map((c) => c.id);
		expect(moveCol(d, ids[0], -1)).toBe(false);
		expect(moveCol(d, ids[0], 1)).toBe(true);
		expect(d.rows[2].cols.map((c) => c.id)).toEqual([ids[1], ids[0], ids[2]]);
	});
	it('resizes against the neighbour when the row is full', () => {
		const d = doc3();
		const [a, b] = d.rows[1].cols;
		expect(resizeCol(d, a.id, 2)).toBe(8);
		expect(spanAt(a.span, 'md')).toBe(8);
		expect(spanAt(b.span, 'md')).toBe(4);
		// The last column takes from the previous one.
		expect(resizeCol(d, b.id, 1)).toBe(5);
		expect(spanAt(a.span, 'md')).toBe(7);
		// Never below one column for the neighbour.
		expect(resizeCol(d, a.id, 10)).toBe(11);
		expect(spanAt(b.span, 'md')).toBe(1);
		expect(resizeCol(d, a.id, 1)).toBeNull();
	});
	it('resizes a lone column without a neighbour', () => {
		const d = doc3();
		const col = d.rows[0].cols[0];
		expect(resizeCol(d, col.id, -6)).toBe(6);
		expect(col.span).toEqual({ base: 12, md: 6 });
	});
	it('duplicates columns', () => {
		const d = doc3();
		const copy = duplicateCol(d, d.rows[1].cols[0].id)!;
		expect(d.rows[1].cols[1]).toBe(copy);
		expect(findCol(d, copy.id)?.colIndex).toBe(1);
	});
	it('sets column attributes', () => {
		const d = doc3();
		setColAttrs(d, d.rows[0].cols[0].id, { className: 'lead', extra: { 'data-x': '1' } });
		expect(d.rows[0].cols[0].attrs).toEqual({ className: 'lead', extra: { 'data-x': '1' } });
	});
});
