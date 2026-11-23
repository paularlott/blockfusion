/**
 * fusionCSS: `row` with `span-{t,s,m,l}N` columns.
 * Breakpoints: t (all widths), s >= 768px, m >= 992px, l >= 1200px.
 */
import { createGridConverter, spanParser } from './grid';

const BP = { base: 't', sm: 's', md: 'm', lg: 'l' } as const;

export const fusioncss = createGridConverter({
	id: 'fusioncss',
	name: 'fusionCSS',
	row: { tokens: ['row'] },
	col: {
		spanClass: (bp, n) => `span-${BP[bp]}${n}`,
		parseSpan: spanParser(/^span-([tsml])(\d+)$/, { t: 'base', s: 'sm', m: 'md', l: 'lg' }),
		base12Implicit: true,
	},
	utilities: {
		// Buttons already use the neutral names (button primary / accent).
		visibility: {
			kind: 'classes',
			hidden: { xs: 'hidden-t', sm: 'hidden-s', md: 'hidden-m', lg: 'hidden-l' },
			visible: { xs: 'visible-t', sm: 'visible-s', md: 'visible-m', lg: 'visible-l' },
		},
	},
});
