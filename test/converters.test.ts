import { beforeAll, describe, expect, it } from 'vitest';
import { convertHTML, detectConverter, loadHTML, parseWith } from '../src/converters/convert';
import { builtinConverters, registerBuiltinConverters } from '../src/converters/index';
import { getConverter } from '../src/converters/registry';
import { withoutIds } from '../src/model/doc';
import type { Doc } from '../src/model/types';

beforeAll(() => registerBuiltinConverters());

/** A document that exercises every feature the converters must keep. */
function sample(): Doc {
	return {
		rows: [
			{
				id: 'r1',
				kind: 'grid',
				attrs: { className: 'hero hidden-xs', id: 'top', style: 'background-color: #eee', tag: 'section', extra: { 'data-track': 'hero' } },
				cols: [
					{ id: 'c1', kind: 'rich', span: { base: 12 }, html: '<h1>Hello</h1><p>Intro <strong>bold</strong> &amp; more</p>' },
				],
			},
			{
				id: 'r2',
				kind: 'grid',
				cols: [
					{
						id: 'c2',
						kind: 'rich',
						span: { base: 12, sm: 6, md: 4, lg: 3 },
						html: '<p><a class="button accent" href="/go">Go</a> <a class="button primary" href="/more">More</a></p>',
						attrs: { className: 'lead', id: 'first' },
					},
					{ id: 'c3', kind: 'rich', span: { base: 6, md: 8 }, html: '<p class="hidden-xs hidden-sm">Wide only</p>' },
					{ id: 'c4', kind: 'rich', span: { base: 12, md: 12, lg: 9 }, html: '<p class="hidden-xs hidden-sm hidden-lg">Middle only</p>' },
				],
			},
			{ id: 'r3', kind: 'raw', cols: [], raw: '<script>window.x = 1 < 2 && "a";</script>\n<div id=embed></div>' },
			{
				id: 'r4',
				kind: 'grid',
				cols: [
					{ id: 'c5', kind: 'raw', span: { base: 12, md: 6 }, html: '<iframe src="https://example.com/map" title=map></iframe><script>go()</script>' },
					{ id: 'c6', kind: 'rich', span: { base: 12, md: 6 }, html: '<ul><li>One</li><li>Two</li></ul>', attrs: { className: 'hidden-md' } },
				],
			},
			{
				id: 'r5',
				kind: 'grid',
				cols: [{ id: 'c7', kind: 'rich', span: { base: 4 }, html: '' }, { id: 'c8', kind: 'rich', span: { base: 8 }, html: '<pre>  spaced\n  code</pre>' }],
			},
		],
	};
}

/** The md-only part of the sample: shared by frameworks whose classes overlap. */
const ids = builtinConverters.map((c) => c.id);

describe('built-in converters', () => {
	it('are all registered', () => {
		expect(ids).toEqual(['fusioncss', 'bootstrap5', 'bootstrap3', 'foundation6', 'foundation5', 'tailwind', 'cssgrid']);
		for (const id of ids) expect(getConverter(id)).toBeTruthy();
	});

	for (const id of ids) {
		describe(id, () => {
			it('round-trips the model losslessly', () => {
				const conv = getConverter(id)!;
				const html = conv.render(sample());
				expect(withoutIds(parseWith(conv, html))).toEqual(withoutIds(sample()));
			});

			it('renders stably (render -> parse -> render)', () => {
				const conv = getConverter(id)!;
				const html = conv.render(sample());
				expect(conv.render(parseWith(conv, html))).toBe(html);
			});

			it('detects its own markup', () => {
				const conv = getConverter(id)!;
				expect(detectConverter(conv.render(sample()))?.id).toBe(id);
			});

			it('keeps raw code verbatim', () => {
				const conv = getConverter(id)!;
				const html = conv.render(sample());
				expect(html).toContain('<script>window.x = 1 < 2 && "a";</script>\n<div id=embed></div>');
				expect(conv.render(sample(), { rawMarkers: false })).not.toContain('bf:raw');
			});
		});
	}

	describe('cross conversion', () => {
		for (const from of ids) {
			for (const to of ids) {
				if (from === to) continue;
				it(`${from} -> ${to}`, () => {
					const source = getConverter(from)!.render(sample());
					const out = convertHTML(source, to);
					// The result is the target's own rendering of the same model.
					expect(out).toBe(getConverter(to)!.render(sample()));
					expect(withoutIds(loadHTML(out, getConverter(from)))).toEqual(withoutIds(sample()));
				});
			}
		}
	});
});

describe('framework markup', () => {
	const r = (id: string) => getConverter(id)!.render(sample());

	it('fusionCSS uses span-* and fusion visibility', () => {
		const html = r('fusioncss');
		expect(html).toContain('<section class="row hero hidden-t" id="top" style="background-color: #eee" data-track="hero">');
		expect(html).toContain('class="span-s6 span-m4 span-l3 lead" id="first"');
		expect(html).toContain('class="span-t6 span-m8"');
		expect(html).toContain('<p class="visible-m">Middle only</p>');
		expect(html).toContain('<a class="button accent" href="/go">');
		expect(html).toContain('<div class="span-t12">');
	});

	it('Bootstrap 3 uses col-xs/sm/md/lg and btn-default/btn-primary', () => {
		const html = r('bootstrap3');
		expect(html).toContain('class="col-sm-6 col-md-4 col-lg-3 lead"');
		expect(html).toContain('class="col-xs-6 col-md-8"');
		expect(html).toContain('<a class="btn btn-primary" href="/go">');
		expect(html).toContain('<a class="btn btn-default" href="/more">');
		expect(html).toContain('<p class="hidden-xs hidden-sm">');
		expect(html).toContain('<p class="visible-md">');
	});

	it('Bootstrap 5 uses col-N and display utilities', () => {
		const html = r('bootstrap5');
		expect(html).toContain('class="col-6 col-md-8"');
		expect(html).toContain('<p class="d-none d-md-block">Wide only</p>');
		expect(html).toContain('<p class="d-none d-md-block d-lg-none">Middle only</p>');
		expect(html).toContain('class="row hero d-none d-sm-block"');
		expect(html).toContain('<a class="btn btn-secondary" href="/more">');
	});

	it('Foundation 5 uses small/medium/large columns', () => {
		const html = r('foundation5');
		expect(html).toContain('class="columns medium-6 large-4 xlarge-3 lead"');
		expect(html).toContain('<p class="show-for-large-only">');
		expect(html).toContain('<a class="button primary" href="/go">');
		expect(html).toContain('<a class="button secondary" href="/more">');
	});

	it('Foundation 6 uses the XY grid', () => {
		const html = r('foundation6');
		expect(html).toContain('<section class="grid-x grid-padding-x hero hide-for-small-only"');
		expect(html).toContain('class="cell small-6 large-8"');
	});

	it('Tailwind uses grid-cols-12 and col-span with prefixes', () => {
		const html = r('tailwind');
		expect(html).toContain('class="grid grid-cols-12 gap-6"');
		expect(html).toContain('class="col-span-12 sm:col-span-6 md:col-span-4 lg:col-span-3 lead"');
		expect(html).toContain('<p class="hidden md:block lg:hidden">Middle only</p>');
	});

	it('CSS grid uses its own classes and ships a stylesheet', () => {
		const conv = getConverter('cssgrid')!;
		expect(r('cssgrid')).toContain('class="bf-col-6 bf-md-8"');
		expect(conv.stylesheet).toContain('.bf-grid{display:grid');
	});
});

describe('loading foreign and unknown markup', () => {
	it('wraps unrecognised markup in a full width column', () => {
		const doc = loadHTML('<p>Hello</p><div class="container"><p>x</p></div>', getConverter('fusioncss'));
		expect(withoutIds(doc)).toEqual(
			withoutIds({ rows: [{ id: '', kind: 'grid', cols: [{ id: '', kind: 'rich', span: { base: 12 }, html: '<p>Hello</p><div class="container"><p>x</p></div>' }] }] }),
		);
	});

	it('keeps unknown runs between rows in order', () => {
		const html = '<h2>Before</h2><div class="row"><div class="span-s6">a</div><div class="span-s6">b</div></div><p>After</p>';
		const doc = loadHTML(html, getConverter('fusioncss'));
		expect(doc.rows.map((r) => r.cols.map((c) => c.html))).toEqual([['<h2>Before</h2>'], ['a', 'b'], ['<p>After</p>']]);
	});

	it('wraps unknown scripts as raw rows', () => {
		const doc = loadHTML('<p>a</p><script>x()</script>', getConverter('bootstrap5'));
		expect(doc.rows).toHaveLength(1);
		expect(doc.rows[0].kind).toBe('raw');
		expect(doc.rows[0].raw).toBe('<p>a</p><script>x()</script>');
	});

	it('keeps a row with unrecognised children as wrapped markup', () => {
		const html = '<div class="row"><div class="col">auto</div><div class="col-6">x</div></div>';
		const doc = loadHTML(html, getConverter('bootstrap5'));
		expect(doc.rows).toHaveLength(1);
		expect(doc.rows[0].cols[0].html).toBe(html);
		expect(getConverter('bootstrap5')!.render(doc)).toContain(html);
	});

	it('keeps classes it does not own', () => {
		const html = '<div class="row gutter-x"><div class="span-s6 span-s-push6 card" data-a="1">x</div></div>';
		const doc = loadHTML(html, getConverter('fusioncss'));
		expect(doc.rows[0].attrs).toEqual({ className: 'gutter-x' });
		expect(doc.rows[0].cols[0].attrs).toEqual({ className: 'span-s-push6 card', extra: { 'data-a': '1' } });
	});

	it('converts old contentbuilder fusionCSS content to Bootstrap 3 like the PHP mapping', () => {
		const html = '<div class="row"><div class="span-s12"><p><a class="button primary" href="#">x</a></p></div></div>';
		expect(convertHTML(html, 'bootstrap3')).toBe(
			'<div class="row">\n\t<div class="col-sm-12">\n<p><a class="btn btn-default" href="#">x</a></p>\n\t</div>\n</div>',
		);
	});

	it('maps Bootstrap 5 visibility only when it is a plain none/block pattern', () => {
		const b5 = getConverter('bootstrap5')!;
		expect(b5.toNeutral(['d-none', 'd-lg-block'])).toEqual(['hidden-xs', 'hidden-sm', 'hidden-md']);
		expect(b5.toNeutral(['d-none', 'd-md-flex'])).toEqual(['d-none', 'd-md-flex']);
		expect(b5.toNeutral(['d-block'])).toEqual(['d-block']);
	});

	it('maps Foundation show-for classes to hidden sets', () => {
		const f6 = getConverter('foundation6')!;
		expect(f6.toNeutral(['show-for-medium-only', 'x'])).toEqual(['hidden-xs', 'hidden-md', 'hidden-lg', 'x']);
	});
});

describe('custom converters', () => {
	it('a converter built with createGridConverter round-trips and cross-converts', async () => {
		const { createGridConverter, spanParser } = await import('../src/converters/grid');
		const { registerConverter } = await import('../src/converters/registry');
		const mine = createGridConverter({
			id: 'mygrid',
			name: 'My grid',
			row: { tokens: ['grid-row'] },
			col: {
				tokens: ['grid-col'],
				spanClass: (bp, n) => `w-${bp}-${n}`,
				parseSpan: spanParser(/^w-(base|sm|md|lg)-(\d+)$/, { base: 'base', sm: 'sm', md: 'md', lg: 'lg' }),
				base12Implicit: true,
			},
			utilities: {
				buttons: [
					[['button', 'primary'], ['btn', 'btn-light']],
					[['button', 'accent'], ['btn', 'btn-brand']],
				],
				visibility: { kind: 'classes', hidden: { xs: 'hide-xs', sm: 'hide-sm', md: 'hide-md', lg: 'hide-lg' } },
			},
		});
		registerConverter(mine);
		const html = mine.render(sample());
		expect(withoutIds(parseWith(mine, html))).toEqual(withoutIds(sample()));
		expect(withoutIds(loadHTML(convertHTML(html, 'bootstrap5')))).toEqual(withoutIds(sample()));
		expect(detectConverter(html)?.id).toBe('mygrid');
	});
});
