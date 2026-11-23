/**
 * Foundation 6 XY grid: `grid-x grid-padding-x` rows with `cell` columns
 * sized by `small-N medium-N large-N xlarge-N`.
 */
import { foundationButtons } from './foundation5';
import { createGridConverter, spanParser } from './grid';

const BP = { base: 'small', sm: 'medium', md: 'large', lg: 'xlarge' } as const;

export const foundation6 = createGridConverter({
	id: 'foundation6',
	name: 'Foundation 6',
	row: {
		tokens: ['grid-x'],
		defaults: [{ token: 'grid-padding-x', family: /^grid-(padding|margin)-x$/ }],
	},
	col: {
		tokens: ['cell'],
		spanClass: (bp, n) => `${BP[bp]}-${n}`,
		parseSpan: spanParser(/^(small|medium|large|xlarge)-(\d+)$/, {
			small: 'base',
			medium: 'sm',
			large: 'md',
			xlarge: 'lg',
		}),
		base12Implicit: true,
	},
	utilities: {
		buttons: foundationButtons,
		visibility: {
			kind: 'classes',
			hidden: {
				xs: 'hide-for-small-only',
				sm: 'hide-for-medium-only',
				md: 'hide-for-large-only',
				lg: 'hide-for-xlarge',
			},
			visible: {
				xs: 'show-for-small-only',
				sm: 'show-for-medium-only',
				md: 'show-for-large-only',
				lg: 'show-for-xlarge',
			},
		},
	},
});
