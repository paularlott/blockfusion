/**
 * Bootstrap 5: `row` with `col-N` / `col-{sm,md,lg,xl,xxl}-N` columns.
 * Visibility uses the display utilities (`d-none d-md-block`). The column
 * count follows `$grid-columns`.
 */
import type { Range } from './classmap';
import { createGridConverter, spanParser } from './grid';

export const bootstrap5 = createGridConverter({
	id: 'bootstrap5',
	name: 'Bootstrap 5',
	signature: /class="[^"]*\b(col-\d|col-auto|d-(sm-|md-|lg-)?(none|block)|btn-secondary|g[xy]?-\d|offset-\d)/,
	breakpoints: ['base', 'sm', 'md', 'lg', 'xl', 'xxl'],
	siteTheme: { attribute: 'data-bs-theme', light: 'light', dark: 'dark' },
	row: { tokens: ['row'] },
	col: {
		spanClass: (bp, n) => (bp === 'base' ? `col-${n}` : `col-${bp}-${n}`),
		parseSpan: spanParser(/^col-(?:(sm|md|lg|xl|xxl)-)?(\d+)$/, { '': 'base', sm: 'sm', md: 'md', lg: 'lg', xl: 'xl', xxl: 'xxl' }),
		base12Implicit: true,
	},
	utilities: {
		buttons: [
			[['button', 'primary'], ['btn', 'btn-secondary']],
			[['button', 'accent'], ['btn', 'btn-primary']],
		],
		visibility: {
			kind: 'display',
			ranges: ['xs', 'sm', 'md', 'lg', 'xl', 'xxl'],
			token: (r, d) => (r === 'xs' ? `d-${d}` : `d-${r}-${d}`),
			parse(t) {
				const m = /^d-(?:(sm|md|lg|xl|xxl)-)?(none|inline|inline-block|block|grid|inline-grid|table|table-row|table-cell|flex|inline-flex)$/.exec(t);
				if (!m) return null;
				const r = (m[1] ?? 'xs') as string;
				return { range: r as Range, display: m[2] };
			},
		},
	},
});
