/**
 * Plain CSS grid with its own small stylesheet (no framework needed):
 * `bf-grid` rows and `bf-col-N` / `bf-sm-N` ... `bf-xxl-N` columns.
 * Breakpoints match fusionCSS: 768, 992, 1200 and 1600px, plus 1920px.
 * Hosts using this converter on their site include `dist/blockfusion-grid.css`
 * (12 columns) or the CSS from `cssGridStylesheet(n)` for another grid size.
 * The stylesheet is layout only (grid, spans, responsive hiding): everything
 * else, including the `bf-btn` button classes, is styled by the site's own CSS.
 */
import { createGridConverter, spanParser } from './grid';

const BP: Record<string, string> = { base: 'col', sm: 'sm', md: 'md', lg: 'lg', xl: 'xl', xxl: 'xxl' };

/** Min widths of each range above xs; the last range runs on. */
const WIDTHS: Array<[string, number]> = [
	['sm', 768],
	['md', 992],
	['lg', 1200],
	['xl', 1600],
	['xxl', 1920],
];

function spans(prefix: string, columns: number): string {
	let css = '';
	for (let n = 1; n <= columns; n++) css += `.bf-${prefix}-${n}{grid-column:span ${n}}`;
	return css;
}

/** The grid stylesheet for a column count (12 is written to dist/blockfusion-grid.css). */
export function cssGridStylesheet(columns = 12): string {
	const out = [
		`.bf-grid{display:grid;grid-template-columns:repeat(${columns},minmax(0,1fr));gap:var(--bf-grid-gap,1.5rem)}`,
		`.bf-grid>*{grid-column:span ${columns};min-width:0}`,
		spans('col', columns),
		`@media (max-width:${WIDTHS[0][1] - 0.02}px){.bf-hidden-xs{display:none!important}}`,
	];
	WIDTHS.forEach(([name, min], i) => {
		const next = WIDTHS[i + 1];
		out.push(`@media (min-width:${min}px){${spans(name, columns)}}`);
		out.push(next ? `@media (min-width:${min}px) and (max-width:${next[1] - 0.02}px){.bf-hidden-${name}{display:none!important}}` : `@media (min-width:${min}px){.bf-hidden-${name}{display:none!important}}`);
	});
	return out.join('\n');
}

/** The 12 column grid stylesheet. */
export const CSSGRID_STYLESHEET = cssGridStylesheet(12);

export const cssgrid = createGridConverter((columns) => ({
	id: 'cssgrid',
	name: 'CSS grid',
	breakpoints: ['base', 'sm', 'md', 'lg', 'xl', 'xxl'],
	stylesheet: cssGridStylesheet(columns),
	row: { tokens: ['bf-grid'] },
	col: {
		spanClass: (bp, n) => `bf-${BP[bp]}-${n}`,
		parseSpan: spanParser(/^bf-(col|sm|md|lg|xl|xxl)-(\d+)$/, { col: 'base', sm: 'sm', md: 'md', lg: 'lg', xl: 'xl', xxl: 'xxl' }),
		base12Implicit: true,
	},
	utilities: {
		buttons: [
			[['button', 'primary'], ['bf-btn', 'bf-btn-primary']],
			[['button', 'accent'], ['bf-btn', 'bf-btn-accent']],
		],
		visibility: {
			kind: 'classes',
			hidden: { xs: 'bf-hidden-xs', sm: 'bf-hidden-sm', md: 'bf-hidden-md', lg: 'bf-hidden-lg', xl: 'bf-hidden-xl', xxl: 'bf-hidden-xxl' },
		},
	},
}));
