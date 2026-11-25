/** Configurable column counts, the xl/xxl breakpoints and Bootstrap 6. */
import { describe, expect, it } from 'vitest';
import { normalizeBlock } from '../src/blocks/normalize';
import { detectConverter, loadHTML, parseWith } from '../src/converters/convert';
import { cssGridStylesheet } from '../src/converters/cssgrid';
import { registerBuiltinConverters } from '../src/converters/index';
import { getConverter } from '../src/converters/registry';
import { parseLayout, scaleSpan, withoutIds } from '../src/model/doc';
import type { Doc } from '../src/model/types';
import { layoutsFor } from '../src/ui/dialogs/layout';

registerBuiltinConverters();
const conv = (id: string) => getConverter(id)!;

const twelve = (): Doc => ({
	rows: [{ id: 'r', kind: 'grid', cols: [
		{ id: 'a', kind: 'rich', span: { base: 12, md: 4 }, html: '<p>a</p>' },
		{ id: 'b', kind: 'rich', span: { base: 12, md: 8 }, html: '<p>b</p>' },
	] }],
});

describe('column count', () => {
	it('defaults to 12', () => {
		for (const id of ['fusioncss', 'bootstrap5', 'tailwind', 'cssgrid']) expect(conv(id).columns).toBe(12);
	});

	it('builds a 24 column fusionCSS that round-trips and keeps its grid size', () => {
		const f24 = conv('fusioncss').withColumns!(24);
		expect(f24.columns).toBe(24);
		const html = '<div class="row">\n\t<div class="span-m16">\n<p>x</p>\n\t</div>\n\t<div class="span-m8">\n<p>y</p>\n\t</div>\n</div>';
		const doc = parseWith(f24, html);
		expect(doc.columns).toBe(24);
		expect(doc.rows[0].cols.map((c) => c.span.md)).toEqual([16, 8]);
		expect(f24.render(doc)).toBe(html);
	});

	it('rescales a 12 column document for a 24 column grid and back', () => {
		const f24 = conv('fusioncss').withColumns!(24);
		const out = f24.render(twelve());
		expect(out).toContain('class="span-m8"');
		expect(out).toContain('class="span-m16"');
		const back = conv('fusioncss').render(parseWith(f24, out));
		expect(back).toBe(conv('fusioncss').render(twelve()));
	});

	it('writes the grid size into Tailwind and CSS grid output', () => {
		expect(conv('tailwind').withColumns!(24).render(twelve())).toContain('class="grid grid-cols-24 gap-6"');
		expect(conv('cssgrid').withColumns!(16).stylesheet).toContain('repeat(16,minmax(0,1fr))');
		expect(cssGridStylesheet(24)).toContain('.bf-md-24{grid-column:span 24}');
	});

	it('keeps a span wider than the grid as a plain class', () => {
		const doc = parseWith(conv('fusioncss'), '<div class="row"><div class="span-m16 span-t12"><p>x</p></div></div>');
		expect(doc.rows[0].cols[0].span).toEqual({ base: 12 });
		expect(doc.rows[0].cols[0].attrs?.className).toBe('span-m16');
	});

	it('scales spans with rounding and keeps them in range', () => {
		expect(scaleSpan({ base: 12, md: 4 }, 12, 24)).toEqual({ base: 24, md: 8 });
		expect(scaleSpan({ base: 16, md: 5 }, 16, 12)).toEqual({ base: 12, md: 4 });
		expect(scaleSpan({ base: 24, md: 1 }, 24, 12)).toEqual({ base: 12, md: 1 });
	});

	it('parses custom layouts and offers presets that fit the grid', () => {
		expect(parseLayout('1/3 2/3', 24)).toEqual([8, 16]);
		expect(parseLayout('20 4', 24)).toEqual([20, 4]);
		expect(parseLayout('13', 12)).toBeNull();
		const names16 = layoutsFor(16).map((l) => l.name);
		expect(names16).toContain('Two halves');
		expect(names16).not.toContain('Three thirds');
		expect(layoutsFor(24).find((l) => l.name === 'Three thirds')?.spans).toEqual([8, 8, 8]);
	});

	it('reads a block grid size from JSON', () => {
		const b = normalizeBlock({ id: 'x', name: 'X', columns: 24, rows: [{ cols: [{ span: 16 }, { span: 8 }] }] })!;
		expect(b.columns).toBe(24);
		expect((b.rows as Doc['rows'])[0].cols.map((c) => c.span)).toEqual([{ base: 24, md: 16 }, { base: 24, md: 8 }]);
	});
});

describe('xl and xxl breakpoints', () => {
	it('round-trips them where the framework has them', () => {
		const html = '<div class="row"><div class="col-12 col-md-6 col-xl-4 col-xxl-3"><p>x</p></div></div>';
		const doc = parseWith(conv('bootstrap5'), html);
		expect(doc.rows[0].cols[0].span).toEqual({ base: 12, md: 6, xl: 4, xxl: 3 });
		expect(conv('tailwind').render(doc)).toContain('class="col-span-12 md:col-span-6 xl:col-span-4 2xl:col-span-3"');
		expect(conv('fusioncss').render(doc)).toContain('class="span-m6 span-x4"');
	});

	it('leaves them out where the framework has none', () => {
		const doc = parseWith(conv('bootstrap5'), '<div class="row"><div class="col-md-6 col-xl-4"><p>x</p></div></div>');
		expect(conv('bootstrap3').render(doc)).toContain('<div class="col-md-6">');
	});

	it('maps visibility through frameworks with fewer ranges', () => {
		const b3 = conv('bootstrap3');
		// Bootstrap 3's lg runs on to the widest screens
		expect(b3.toNeutral(['hidden-lg'])).toEqual(['hidden-lg', 'hidden-xl', 'hidden-xxl']);
		expect(b3.toFramework(['hidden-lg', 'hidden-xl', 'hidden-xxl'])).toEqual(['hidden-lg']);
		// Hidden at xl only can't be said in Bootstrap 3: kept as is
		expect(b3.toFramework(['hidden-xl'])).toEqual(['hidden-xl']);
		expect(conv('bootstrap5').toFramework(['hidden-xl'])).toEqual(['d-xl-none', 'd-xxl-block']);
		expect(conv('tailwind').toNeutral(['hidden', '2xl:block'])).toEqual(['hidden-xs', 'hidden-sm', 'hidden-md', 'hidden-lg', 'hidden-xl']);
	});
});

describe('Bootstrap 6', () => {
	const html =
		'<div class="row">\n\t<div class="col-12 md:col-6 2xl:col-4">\n<p><a class="btn btn-solid theme-primary" href="#">Go</a></p>\n\t</div>\n\t<div class="md:col-6 md:d-none">\n<p>x</p>\n\t</div>\n</div>';

	it('parses prefix classes and round-trips', () => {
		const b6 = conv('bootstrap6');
		const doc = parseWith(b6, html);
		expect(doc.rows[0].cols[0].span).toEqual({ base: 12, md: 6, xxl: 4 });
		expect(doc.rows[0].cols[1].attrs?.className).toBe('hidden-md hidden-lg hidden-xl hidden-xxl');
		expect(doc.rows[0].cols[0].html).toContain('class="button accent"');
		expect(b6.render(doc)).toBe(html.replace('col-12 md:col-6', 'md:col-6'));
	});

	it('is told apart from Bootstrap 5', () => {
		expect(detectConverter(html)?.id).toBe('bootstrap6');
		expect(detectConverter('<div class="row"><div class="col-12 col-md-6"><p>x</p></div></div>')?.id).toBe('bootstrap5');
	});

	it('converts from Bootstrap 5', () => {
		const doc = loadHTML('<div class="row"><div class="col-md-6 d-none d-lg-block"><p>x</p></div></div>');
		expect(conv('bootstrap6').render(doc)).toContain('class="md:col-6 d-none lg:d-block"');
		expect(withoutIds(parseWith(conv('bootstrap6'), conv('bootstrap6').render(doc)))).toEqual(withoutIds(doc));
	});
});
