/**
 * fusionCSS: `row` with `span-{t,s,m,l,x}N` columns.
 * Breakpoints: t (all widths), s >= 768px, m >= 992px, l >= 1200px,
 * x >= 1600px. The column count follows the site's `@numColumns` build
 * setting; use `fusioncss.withColumns(n)` (or the editor's `columns` option)
 * for a grid other than 12.
 */
import { createGridConverter, spanParser } from './grid';

const BP: Record<string, string> = { base: 't', sm: 's', md: 'm', lg: 'l', xl: 'x' };

export const fusioncss = createGridConverter({
	id: 'fusioncss',
	name: 'fusionCSS',
	breakpoints: ['base', 'sm', 'md', 'lg', 'xl'],
	row: { tokens: ['row'] },
	col: {
		spanClass: (bp, n) => `span-${BP[bp]}${n}`,
		parseSpan: spanParser(/^span-([tsmlx])(\d+)$/, { t: 'base', s: 'sm', m: 'md', l: 'lg', x: 'xl' }),
		base12Implicit: true,
	},
	utilities: {
		// Buttons already use the neutral names (button primary / accent).
		visibility: {
			kind: 'classes',
			hidden: { xs: 'hidden-t', sm: 'hidden-s', md: 'hidden-m', lg: 'hidden-l', xl: 'hidden-x' },
			visible: { xs: 'visible-t', sm: 'visible-s', md: 'visible-m', lg: 'visible-l', xl: 'visible-x' },
		},
	},
});
