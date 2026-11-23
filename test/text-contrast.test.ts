import { describe, expect, it } from 'vitest';
import { composite, contrastRatio, formatRatio, isLargeText, parseRgb, requiredRatio } from '../src/a11y/contrast';

describe('text contrast maths', () => {
	it('gives 21:1 for black on white and 1:1 for a colour on itself', () => {
		expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
		expect(contrastRatio([176, 23, 23], [176, 23, 23])).toBe(1);
	});
	it('matches a known pairing', () => {
		// #767676 on white is the classic 4.54:1
		expect(contrastRatio([118, 118, 118], [255, 255, 255])).toBeCloseTo(4.54, 2);
	});
	it('rounds down so a near miss never reads as a pass', () => {
		expect(formatRatio(4.499)).toBe('4.49:1');
		expect(formatRatio(1)).toBe('1:1');
		expect(formatRatio(4.5)).toBe('4.5:1');
	});
	it('knows large text', () => {
		expect(isLargeText(24, 400)).toBe(true);
		expect(isLargeText(19, 700)).toBe(true);
		expect(isLargeText(19, 400)).toBe(false);
		expect(requiredRatio(true)).toBe(3);
		expect(requiredRatio(false)).toBe(4.5);
	});
	it('parses computed colours and composites alpha', () => {
		expect(parseRgb('rgb(176, 23, 23)')).toEqual([176, 23, 23, 1]);
		expect(parseRgb('rgba(0, 0, 0, 0.5)')).toEqual([0, 0, 0, 0.5]);
		expect(parseRgb('rgb(0 0 0 / 50%)')).toEqual([0, 0, 0, 0.5]);
		expect(composite([0, 0, 0, 0.5], [255, 255, 255, 1])).toEqual([127.5, 127.5, 127.5, 1]);
	});
});
