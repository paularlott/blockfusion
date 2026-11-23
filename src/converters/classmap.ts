/**
 * Utility class mapping between the neutral vocabulary and a framework.
 *
 * Neutral vocabulary (what the model stores):
 *   hidden-xs hidden-sm hidden-md hidden-lg   hidden in that width range only
 *   button primary / button accent            the two standard buttons
 *
 * "Visible only in range X" is stored as hidden in every other range, so each
 * visibility state has exactly one neutral form and round trips are exact.
 */

export type Range = 'xs' | 'sm' | 'md' | 'lg';
export const RANGES: readonly Range[] = ['xs', 'sm', 'md', 'lg'];
export const NEUTRAL_HIDDEN: Record<Range, string> = {
	xs: 'hidden-xs',
	sm: 'hidden-sm',
	md: 'hidden-md',
	lg: 'hidden-lg',
};

/** Visibility done with one class per range (fusionCSS, Bootstrap 3, Foundation). */
export interface ClassVisibility {
	kind: 'classes';
	hidden: Record<Range, string>;
	/** "Visible only in this range" classes, if the framework has them. */
	visible?: Record<Range, string>;
}

/** Visibility done with responsive display utilities (Bootstrap 5, Tailwind). */
export interface DisplayVisibility {
	kind: 'display';
	/** Class that sets `display` (none or block) from a range up. */
	token(range: Range, display: 'none' | 'block'): string;
	/**
	 * Recognise any display class. `range` is null for breakpoints the model
	 * does not know (e.g. xl), which stops the mapping for that element.
	 */
	parse(token: string): { range: Range | null; display: string } | null;
}

export interface UtilityConfig {
	/** [neutral tokens, framework tokens] pairs. */
	buttons?: Array<[string[], string[]]>;
	visibility?: ClassVisibility | DisplayVisibility;
}

export interface ClassMapper {
	toFramework(tokens: string[]): string[];
	toNeutral(tokens: string[]): string[];
}

/**
 * Replace groups of tokens in place: the replacement goes where the first
 * consumed token was, so the order of the other classes is kept.
 */
class Rewriter {
	private used: boolean[];
	private inserts = new Map<number, string[]>();
	constructor(private list: string[]) {
		this.used = list.map(() => false);
	}
	/** Indexes of unconsumed tokens matching every wanted token, or null. */
	find(wanted: string[]): number[] | null {
		const idx: number[] = [];
		for (const w of wanted) {
			const i = this.list.findIndex((t, j) => t === w && !this.used[j] && !idx.includes(j));
			if (i < 0) return null;
			idx.push(i);
		}
		return idx;
	}
	replace(idx: number[], withTokens: string[]): void {
		if (!idx.length) return;
		for (const i of idx) this.used[i] = true;
		const at = Math.min(...idx);
		this.inserts.set(at, [...(this.inserts.get(at) ?? []), ...withTokens]);
	}
	indexWhere(fn: (t: string, i: number) => boolean): number[] {
		return this.list.map((t, i) => (!this.used[i] && fn(t, i) ? i : -1)).filter((i) => i >= 0);
	}
	result(): string[] {
		const out: string[] = [];
		this.list.forEach((t, i) => {
			const ins = this.inserts.get(i);
			if (ins) out.push(...ins);
			if (!this.used[i]) out.push(t);
		});
		return out;
	}
}

function hiddenTokens(hidden: Set<Range>): string[] {
	return RANGES.filter((r) => hidden.has(r)).map((r) => NEUTRAL_HIDDEN[r]);
}

export function makeClassMapper(cfg: UtilityConfig): ClassMapper {
	const buttons = cfg.buttons ?? [];
	const vis = cfg.visibility;

	return {
		toFramework(list) {
			const rw = new Rewriter(list);
			for (const [neutral, fw] of buttons) {
				const idx = rw.find(neutral);
				if (idx) rw.replace(idx, fw);
			}
			if (vis) {
				const idx = rw.indexWhere((t) => RANGES.some((r) => NEUTRAL_HIDDEN[r] === t));
				if (idx.length) {
					const hidden = new Set(RANGES.filter((r) => idx.some((i) => list[i] === NEUTRAL_HIDDEN[r])));
					rw.replace(idx, renderVisibility(vis, hidden));
				}
			}
			return rw.result();
		},

		toNeutral(list) {
			const rw = new Rewriter(list);
			for (const [neutral, fw] of buttons) {
				const idx = rw.find(fw);
				if (idx) rw.replace(idx, neutral);
			}
			if (vis?.kind === 'classes') {
				const hidden = new Set<Range>();
				const visible = new Set<Range>();
				const idx = rw.indexWhere((t) => {
					const h = RANGES.find((r) => vis.hidden[r] === t);
					const v = vis.visible && RANGES.find((r) => vis.visible![r] === t);
					if (h) hidden.add(h);
					if (v) visible.add(v);
					return !!(h || v);
				});
				if (visible.size) for (const r of RANGES) if (!visible.has(r)) hidden.add(r);
				if (idx.length) rw.replace(idx, hiddenTokens(hidden));
			} else if (vis?.kind === 'display') {
				const found: Array<{ i: number; range: Range | null; display: string }> = [];
				rw.indexWhere((t, i) => {
					const p = vis.parse(t);
					if (p) found.push({ i, ...p });
					return !!p;
				});
				const simple = found.every((f) => f.range && (f.display === 'none' || f.display === 'block'));
				if (found.length && simple && found.some((f) => f.display === 'none')) {
					const hidden = new Set<Range>();
					let shown = true;
					for (const r of RANGES) {
						const f = found.find((x) => x.range === r);
						if (f) shown = f.display !== 'none';
						if (!shown) hidden.add(r);
					}
					rw.replace(
						found.map((f) => f.i),
						hiddenTokens(hidden),
					);
				}
			}
			return rw.result();
		},
	};
}

function renderVisibility(vis: ClassVisibility | DisplayVisibility, hidden: Set<Range>): string[] {
	if (vis.kind === 'classes') {
		const shown = RANGES.filter((r) => !hidden.has(r));
		if (vis.visible && shown.length === 1) return [vis.visible[shown[0]]];
		return RANGES.filter((r) => hidden.has(r)).map((r) => vis.hidden[r]);
	}
	const out: string[] = [];
	let shown = true;
	for (const r of RANGES) {
		const want = !hidden.has(r);
		if (want !== shown) out.push(vis.token(r, want ? 'block' : 'none'));
		shown = want;
	}
	return out;
}
