/**
 * Bootstrap 5: `row` with `col-N` / `col-{sm,md,lg}-N` columns. Visibility
 * uses the display utilities (`d-none d-md-block`).
 */
import type { Range } from './classmap';
import { createGridConverter, spanParser } from './grid';

export const bootstrap5 = createGridConverter({
	id: 'bootstrap5',
	name: 'Bootstrap 5',
	signature: /class="[^"]*\b(col-\d|col-auto|d-(sm-|md-|lg-)?(none|block)|btn-secondary|g[xy]?-\d|offset-\d)/,
	row: { tokens: ['row'] },
	col: {
		spanClass: (bp, n) => (bp === 'base' ? `col-${n}` : `col-${bp}-${n}`),
		parseSpan: spanParser(/^col-(?:(sm|md|lg)-)?(\d+)$/, { '': 'base', sm: 'sm', md: 'md', lg: 'lg' }),
		base12Implicit: true,
	},
	utilities: {
		buttons: [
			[['button', 'primary'], ['btn', 'btn-secondary']],
			[['button', 'accent'], ['btn', 'btn-primary']],
		],
		visibility: {
			kind: 'display',
			token: (r, d) => (r === 'xs' ? `d-${d}` : `d-${r}-${d}`),
			parse(t) {
				const m = /^d-(?:(sm|md|lg|xl|xxl)-)?(none|inline|inline-block|block|grid|inline-grid|table|table-row|table-cell|flex|inline-flex)$/.exec(t);
				if (!m) return null;
				const r = (m[1] ?? 'xs') as string;
				return { range: ['xs', 'sm', 'md', 'lg'].includes(r) ? (r as Range) : null, display: m[2] };
			},
		},
	},
});
