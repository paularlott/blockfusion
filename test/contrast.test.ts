/**
 * Checks the chrome colour tokens numerically against WCAG 2.2 AA for every
 * pairing the stylesheet uses, in both themes.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/styles/blockfusion.css'), 'utf8');

function block(selectorStart: string): Record<string, string> {
	const i = css.indexOf(selectorStart);
	if (i < 0) throw new Error('missing ' + selectorStart);
	const body = css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i));
	const out: Record<string, string> = {};
	for (const m of body.matchAll(/--bf-([\w-]+):\s*(#[0-9a-f]{6})/gi)) out[m[1]] = m[2];
	return out;
}

function luminance(hex: string): number {
	const [r, g, b] = [1, 3, 5].map((i) => {
		const c = parseInt(hex.slice(i, i + 2), 16) / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function ratio(a: string, b: string): number {
	const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
	return (x + 0.05) / (y + 0.05);
}

const themes = {
	light: block('.bf-editor {\n\t--bf-bg'),
	dark: block('.bf-editor[data-bf-theme="dark"]'),
	'dark (system)': block('.bf-editor[data-bf-theme="auto"] {'),
	'light (host data-theme)': block('[data-theme="light"] .bf-editor'),
};

const surfaces = ['bg', 'surface', 'surface-2', 'surface-3'];
const pairs: Array<[string, string[], number]> = [
	['fg', surfaces, 4.5],
	['fg-muted', surfaces, 4.5],
	['fg-subtle', surfaces, 4.5],
	['primary', ['bg', 'surface', 'surface-2', 'primary-soft'], 4.5],
	['danger', ['bg', 'surface', 'surface-2', 'danger-soft'], 4.5],
	['fg', ['primary-soft', 'danger-soft'], 4.5],
	['on-solid', ['primary-solid', 'primary-solid-hover', 'danger-solid'], 4.5],
	// Tooltips invert fg and surface.
	['surface', ['fg'], 4.5],
	['control', surfaces, 3],
	['focus', [...surfaces, 'primary-soft'], 3],
	['primary', ['primary-soft'], 3],
];

describe('colour tokens meet WCAG AA', () => {
	for (const [name, tokens] of Object.entries(themes)) {
		describe(name, () => {
			for (const [fg, bgs, min] of pairs) {
				for (const bg of bgs) {
					it(`${fg} on ${bg} >= ${min}:1`, () => {
						expect(tokens[fg], fg).toBeTruthy();
						expect(tokens[bg], bg).toBeTruthy();
						expect(ratio(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(min);
					});
				}
			}
		});
	}

	it('the system dark theme matches the forced dark theme', () => {
		expect(themes['dark (system)']).toEqual(themes.dark);
		expect(themes['light (host data-theme)']).toEqual(themes.light);
	});

	it('canvas handle colours meet AA', () => {
		expect(ratio('#ffffff', '#0e7490')).toBeGreaterThanOrEqual(4.5);
		expect(ratio('#0c4a5c', '#ffffff')).toBeGreaterThanOrEqual(4.5);
		expect(ratio('#0c4a5c', '#e3f3f7')).toBeGreaterThanOrEqual(4.5);
		expect(ratio('#475569', '#f8fafc')).toBeGreaterThanOrEqual(4.5);
		expect(ratio('#0e7490', '#ffffff')).toBeGreaterThanOrEqual(3);
	});
});
