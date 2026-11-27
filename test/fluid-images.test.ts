import { beforeAll, describe, expect, it } from 'vitest';
import { fluidImage } from '../src/commands/text';
import { builtinConverters, registerBuiltinConverters } from '../src/converters/index';
import { getConverter } from '../src/converters/registry';

beforeAll(() => registerBuiltinConverters());

/** Each framework's class for an image that fits its column. */
const FLUID: Record<string, string> = {
	fusioncss: 'img-fluid',
	bootstrap3: 'img-responsive',
	bootstrap5: 'img-fluid',
	bootstrap6: 'img-fluid',
	foundation5: 'img-fluid',
	foundation6: 'img-fluid',
	tailwind: 'max-w-full h-auto',
	cssgrid: 'bf-img',
};

describe('fluid images', () => {
	it('covers every built-in framework', () => {
		expect(Object.keys(FLUID).sort()).toEqual(builtinConverters.map((c) => c.id).sort());
	});

	for (const id of Object.keys(FLUID)) {
		it(`${id}: adds the framework's class and keeps the others`, () => {
			const img = document.createElement('img');
			img.className = 'rounded';
			fluidImage(img, getConverter(id)!);
			expect(img.className).toBe(`rounded ${FLUID[id]}`);
		});

		it(`${id}: maps the class to and from the neutral img-fluid`, () => {
			const c = getConverter(id)!;
			const html = `<p><img src="a.jpg" alt="A" class="${FLUID[id]}"></p>`;
			expect(c.mapHtml(html, 'in')).toContain('class="img-fluid"');
			expect(c.mapHtml('<p><img src="a.jpg" alt="A" class="img-fluid"></p>', 'out')).toBe(html);
		});
	}

	it('converts between frameworks', () => {
		const bs3 = getConverter('bootstrap3')!;
		const tw = getConverter('tailwind')!;
		const neutral = bs3.mapHtml('<img src="a.jpg" alt="" class="img-responsive">', 'in');
		expect(tw.mapHtml(neutral, 'out')).toBe('<img src="a.jpg" alt="" class="max-w-full h-auto">');
	});

	it('the CSS grid stylesheet makes bf-img fluid', () => {
		expect(getConverter('cssgrid')!.stylesheet).toContain('.bf-img{max-width:100%;height:auto}');
	});
});
