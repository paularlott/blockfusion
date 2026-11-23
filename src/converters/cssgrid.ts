/**
 * Plain CSS grid with its own small stylesheet (no framework needed):
 * `bf-grid` rows and `bf-col-N` / `bf-sm-N` / `bf-md-N` / `bf-lg-N` columns.
 * Hosts using this converter on their site include `dist/blockfusion-grid.css`.
 */
import { createGridConverter, spanParser } from './grid';

const BP = { base: 'col', sm: 'sm', md: 'md', lg: 'lg' } as const;

function spans(prefix: string): string {
	let css = '';
	for (let n = 1; n <= 12; n++) css += `.bf-${prefix}-${n}{grid-column:span ${n}}`;
	return css;
}

/** The grid stylesheet, also written to dist/blockfusion-grid.css by the build. */
export const CSSGRID_STYLESHEET = [
	'.bf-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:var(--bf-grid-gap,1.5rem)}',
	'.bf-grid>*{grid-column:span 12;min-width:0}',
	spans('col'),
	'.bf-btn{display:inline-block;padding:.5rem 1rem;border-radius:.375rem;font-weight:600;text-decoration:none}',
	'.bf-btn-primary{background:#e2e8f0;color:#0f172a}',
	'.bf-btn-accent{background:#0e7490;color:#fff}',
	'@media (max-width:767.98px){.bf-hidden-xs{display:none!important}}',
	`@media (min-width:768px){${spans('sm')}}`,
	'@media (min-width:768px) and (max-width:991.98px){.bf-hidden-sm{display:none!important}}',
	`@media (min-width:992px){${spans('md')}}`,
	'@media (min-width:992px) and (max-width:1199.98px){.bf-hidden-md{display:none!important}}',
	`@media (min-width:1200px){${spans('lg')}.bf-hidden-lg{display:none!important}}`,
].join('\n');

export const cssgrid = createGridConverter({
	id: 'cssgrid',
	name: 'CSS grid',
	stylesheet: CSSGRID_STYLESHEET,
	row: { tokens: ['bf-grid'] },
	col: {
		spanClass: (bp, n) => `bf-${BP[bp]}-${n}`,
		parseSpan: spanParser(/^bf-(col|sm|md|lg)-(\d+)$/, { col: 'base', sm: 'sm', md: 'md', lg: 'lg' }),
		base12Implicit: true,
	},
	utilities: {
		buttons: [
			[['button', 'primary'], ['bf-btn', 'bf-btn-primary']],
			[['button', 'accent'], ['bf-btn', 'bf-btn-accent']],
		],
		visibility: {
			kind: 'classes',
			hidden: { xs: 'bf-hidden-xs', sm: 'bf-hidden-sm', md: 'bf-hidden-md', lg: 'bf-hidden-lg' },
		},
	},
});
