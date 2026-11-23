/**
 * Tailwind CSS: `grid grid-cols-12 gap-6` rows with `col-span-N` and
 * responsive `sm:` / `md:` / `lg:` prefixes. In a CSS grid an item without a
 * span covers one track, so the base span is always written.
 */
import type { Range } from './classmap';
import { createGridConverter, spanParser } from './grid';

/** Utility sets used for the two standard buttons. */
export const TAILWIND_BUTTON = ['inline-block', 'rounded-md', 'px-4', 'py-2', 'font-semibold', 'no-underline'];
export const TAILWIND_PRIMARY = [...TAILWIND_BUTTON, 'bg-slate-200', 'text-slate-900'];
export const TAILWIND_ACCENT = [...TAILWIND_BUTTON, 'bg-sky-700', 'text-white'];

export const tailwind = createGridConverter({
	id: 'tailwind',
	name: 'Tailwind CSS',
	row: {
		tokens: ['grid', 'grid-cols-12'],
		defaults: [{ token: 'gap-6', family: /^gap-/ }],
	},
	col: {
		spanClass: (bp, n) => (bp === 'base' ? `col-span-${n}` : `${bp}:col-span-${n}`),
		parseSpan: spanParser(/^(?:(sm|md|lg):)?col-span-(\d+)$/, { '': 'base', sm: 'sm', md: 'md', lg: 'lg' }),
		base12Implicit: false,
	},
	utilities: {
		buttons: [
			[['button', 'primary'], TAILWIND_PRIMARY],
			[['button', 'accent'], TAILWIND_ACCENT],
		],
		visibility: {
			kind: 'display',
			token: (r, d) => {
				const v = d === 'none' ? 'hidden' : 'block';
				return r === 'xs' ? v : `${r}:${v}`;
			},
			parse(t) {
				const m = /^(?:(sm|md|lg|xl|2xl):)?(hidden|block|inline|inline-block|flex|inline-flex|grid|inline-grid|table|contents)$/.exec(t);
				if (!m) return null;
				const r = (m[1] ?? 'xs') as string;
				return {
					range: ['xs', 'sm', 'md', 'lg'].includes(r) ? (r as Range) : null,
					display: m[2] === 'hidden' ? 'none' : m[2],
				};
			},
		},
	},
});
