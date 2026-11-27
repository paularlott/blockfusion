/**
 * Bootstrap 3: `row` with `col-{xs,sm,md,lg}-N` columns.
 * Buttons follow the original contentbuilder mapping: fusionCSS
 * `button primary` is `btn btn-default`, `button accent` is `btn btn-primary`.
 */
import { createGridConverter, spanParser } from './grid';

const BP: Record<string, string> = { base: 'xs', sm: 'sm', md: 'md', lg: 'lg' };

export const bootstrap3 = createGridConverter({
	id: 'bootstrap3',
	name: 'Bootstrap 3',
	signature: /class="[^"]*\b(col-xs-|col-(sm|md|lg)-(offset|push|pull)-|btn-default|hidden-(xs|sm|md|lg)|visible-(xs|sm|md|lg))/,
	row: { tokens: ['row'] },
	col: {
		spanClass: (bp, n) => `col-${BP[bp]}-${n}`,
		parseSpan: spanParser(/^col-(xs|sm|md|lg)-(\d+)$/, { xs: 'base', sm: 'sm', md: 'md', lg: 'lg' }),
		base12Implicit: true,
	},
	utilities: {
		buttons: [
			[['button', 'primary'], ['btn', 'btn-default']],
			[['button', 'accent'], ['btn', 'btn-primary']],
		],
		image: ['img-responsive'],
		visibility: {
			kind: 'classes',
			hidden: { xs: 'hidden-xs', sm: 'hidden-sm', md: 'hidden-md', lg: 'hidden-lg' },
			visible: { xs: 'visible-xs', sm: 'visible-sm', md: 'visible-md', lg: 'visible-lg' },
		},
	},
});
