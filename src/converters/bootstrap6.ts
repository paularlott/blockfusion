/**
 * Bootstrap 6 (alpha): `row` with `col-N` columns and responsive prefixes
 * written before the class, `md:col-6`, up to `2xl:` (the model's xxl).
 * Visibility uses `d-none md:d-block`. Buttons follow the alpha's
 * composable form, `btn btn-solid theme-primary`.
 *
 * Bootstrap 6 is still in alpha; this converter tracks the alpha docs and
 * may need updating when 6.0 is released.
 */
import type { Range } from './classmap';
import { createGridConverter, spanParser } from './grid';

const PREFIX: Record<string, string> = { sm: 'sm', md: 'md', lg: 'lg', xl: 'xl', xxl: '2xl' };

export const bootstrap6 = createGridConverter({
	id: 'bootstrap6',
	name: 'Bootstrap 6 (alpha)',
	// The prefix syntax only Bootstrap 6 (and Tailwind, which has no `row`) uses.
	signature: /class="[^"]*\b((sm|md|lg|xl|2xl):(col|d|offset|row-cols)-|btn-solid|theme-(primary|secondary))/,
	breakpoints: ['base', 'sm', 'md', 'lg', 'xl', 'xxl'],
	siteTheme: { attribute: 'data-bs-theme', light: 'light', dark: 'dark' },
	row: { tokens: ['row'] },
	col: {
		spanClass: (bp, n) => (bp === 'base' ? `col-${n}` : `${PREFIX[bp]}:col-${n}`),
		parseSpan: spanParser(/^(?:(sm|md|lg|xl|2xl):)?col-(\d+)$/, { '': 'base', sm: 'sm', md: 'md', lg: 'lg', xl: 'xl', '2xl': 'xxl' }),
		base12Implicit: true,
	},
	utilities: {
		buttons: [
			[['button', 'primary'], ['btn', 'btn-solid', 'theme-secondary']],
			[['button', 'accent'], ['btn', 'btn-solid', 'theme-primary']],
		],
		visibility: {
			kind: 'display',
			ranges: ['xs', 'sm', 'md', 'lg', 'xl', 'xxl'],
			token: (r, d) => (r === 'xs' ? `d-${d}` : `${PREFIX[r]}:d-${d}`),
			parse(t) {
				const m = /^(?:(sm|md|lg|xl|2xl):)?d-(none|inline|inline-block|block|grid|inline-grid|table|table-row|table-cell|flex|inline-flex|flow-root|contents)$/.exec(t);
				if (!m) return null;
				const r = m[1] === '2xl' ? 'xxl' : (m[1] ?? 'xs');
				return { range: r as Range, display: m[2] };
			},
		},
	},
});
