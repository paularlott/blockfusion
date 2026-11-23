import { beforeAll, describe, expect, it } from 'vitest';
import { normalizeBlock, normalizeSpan } from '../src/blocks/normalize';
import { DEFAULT_BLOCKS } from '../src/blocks/defaults';
import { registerBuiltinConverters } from '../src/converters/index';
import { getConverter } from '../src/converters/registry';
import type { Row } from '../src/model/types';

beforeAll(() => registerBuiltinConverters());

describe('block JSON format', () => {
	it('reads a number span as md and up, stacking on phones', () => {
		expect(normalizeSpan(6)).toEqual({ base: 12, md: 6 });
		expect(normalizeSpan(12)).toEqual({ base: 12 });
		expect(normalizeSpan({ base: 12, sm: 6, lg: 4 })).toEqual({ base: 12, sm: 6, lg: 4 });
		expect(normalizeSpan(99)).toEqual({ base: 12 });
		expect(normalizeSpan(undefined)).toEqual({ base: 12 });
	});

	it('fills in ids, kinds and attributes', () => {
		const b = normalizeBlock({
			id: 'x', name: 'X', category: 'Text',
			rows: [{ className: 'highlight', cols: [{ span: 8, html: '<p>a</p>' }, { span: 4, kind: 'raw', html: '<script></script>' }] }, { raw: '<iframe></iframe>' }],
		})!;
		const rows = b.rows as Row[];
		expect(rows[0]).toMatchObject({ kind: 'grid', attrs: { className: 'highlight' } });
		expect(rows[0].cols[0]).toMatchObject({ kind: 'rich', span: { base: 12, md: 8 }, html: '<p>a</p>' });
		expect(rows[0].cols[1]).toMatchObject({ kind: 'raw', html: '<script></script>' });
		expect(rows[1]).toMatchObject({ kind: 'raw', raw: '<iframe></iframe>', cols: [] });
		expect(b.category).toBe('Text');
	});

	it('accepts a single row object and plain string columns', () => {
		const b = normalizeBlock({ id: 'y', name: 'Y', rows: { cols: ['<p>one</p>', '<p>two</p>'] } })!;
		const rows = b.rows as Row[];
		expect(rows).toHaveLength(1);
		expect(rows[0].cols.map((c) => c.html)).toEqual(['<p>one</p>', '<p>two</p>']);
	});

	it('keeps HTML blocks as HTML and drops blocks without an id or name', () => {
		expect(normalizeBlock({ id: 'h', name: 'H', rows: '<div class="row"></div>' })!.rows).toBe('<div class="row"></div>');
		expect(normalizeBlock({ name: 'no id', rows: [] })).toBeNull();
		expect(normalizeBlock({ id: 'no-name', rows: [] })).toBeNull();
	});

	it('leaves the built-in blocks unchanged', () => {
		for (const b of DEFAULT_BLOCKS) expect(normalizeBlock(b)).toEqual(b);
	});

	it('renders the same JSON block in every framework', () => {
		const b = normalizeBlock({ id: 'z', name: 'Z', rows: [{ cols: [{ span: 6, html: '<p>L</p>' }, { span: 6, html: '<p>R</p>' }] }] })!;
		const out = (id: string) => getConverter(id)!.render({ rows: b.rows as Row[] });
		expect(out('bootstrap5')).toContain('col-md-6');
		expect(out('bootstrap3')).toContain('col-md-6');
		expect(out('fusioncss')).toMatch(/span-/);
		expect(out('tailwind')).toContain('md:col-span-6');
		expect(out('foundation6')).toContain('large-6'); // Foundation's large is the neutral md
	});
});
