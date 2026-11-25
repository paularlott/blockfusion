/**
 * Foundation 5: `row` with `small-N medium-N large-N columns`.
 * The model's sm/md/lg map to medium/large/xlarge (as the original
 * contentbuilder mapped span-s to medium and span-m to large). Foundation 5
 * has no xlarge grid classes, so an lg span is kept as `xlarge-N`, which
 * round-trips but is not styled by Foundation itself.
 */
import { createGridConverter, spanParser } from './grid';

const BP: Record<string, string> = { base: 'small', sm: 'medium', md: 'large', lg: 'xlarge' };

export const foundationButtons: Array<[string[], string[]]> = [
	[['button', 'primary'], ['button', 'secondary']],
	[['button', 'accent'], ['button', 'primary']],
];

export const foundation5 = createGridConverter({
	id: 'foundation5',
	name: 'Foundation 5',
	row: { tokens: ['row'] },
	col: {
		tokens: ['columns'],
		altTokens: ['column'],
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
				lg: 'hide-for-xlarge-up',
			},
			visible: {
				xs: 'show-for-small-only',
				sm: 'show-for-medium-only',
				md: 'show-for-large-only',
				lg: 'show-for-xlarge-up',
			},
		},
	},
});
