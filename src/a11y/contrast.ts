/**
 * WCAG 2.x colour contrast: luminance and ratio maths (pure), plus helpers
 * that read the real rendered colours from the canvas so theme CSS, row and
 * column backgrounds and inline styles all count.
 */

export type RGBA = [number, number, number, number];

/** Relative luminance of an sRGB colour (0-255 channels). */
export function luminance([r, g, b]: RGBA | [number, number, number]): number {
	const lin = (c: number) => {
		const s = c / 255;
		return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Contrast ratio between two opaque colours, 1 to 21. */
export function contrastRatio(a: RGBA | [number, number, number], b: RGBA | [number, number, number]): number {
	const la = luminance(a);
	const lb = luminance(b);
	return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Paint `top` (possibly translucent) over an opaque `bottom`. */
export function composite(top: RGBA, bottom: RGBA): RGBA {
	const a = top[3];
	return [top[0] * a + bottom[0] * (1 - a), top[1] * a + bottom[1] * (1 - a), top[2] * a + bottom[2] * (1 - a), 1];
}

/** Large text per WCAG: 24px and up, or 18.66px and up when bold. */
export function isLargeText(fontSizePx: number, fontWeight: number): boolean {
	return fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700);
}

export function requiredRatio(large: boolean): number {
	return large ? 3 : 4.5;
}

/** "4.52" style, rounded down so 4.499 never shows as a passing 4.5. */
export function formatRatio(r: number): string {
	return (Math.floor(r * 100) / 100).toFixed(2).replace(/\.?0+$/, '') + ':1';
}

/** Parse rgb()/rgba() as computed styles report them. */
export function parseRgb(value: string): RGBA | null {
	const m = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i);
	if (!m) return null;
	let a = m[4] === undefined ? 1 : parseFloat(m[4]);
	if (m[4]?.endsWith('%')) a /= 100;
	return [+m[1], +m[2], +m[3], a];
}

let ctx: CanvasRenderingContext2D | null | undefined;

/**
 * Any CSS colour as RGBA. rgb() is parsed directly; anything else (oklch(),
 * color(), names) is painted to a 1px canvas and read back.
 */
export function toRGBA(value: string): RGBA | null {
	const v = value.trim();
	if (!v || v === 'transparent') return [0, 0, 0, 0];
	const direct = parseRgb(v);
	if (direct) return direct;
	if (ctx === undefined) {
		try {
			const c = document.createElement('canvas');
			c.width = c.height = 1;
			ctx = c.getContext('2d', { willReadFrequently: true });
		} catch {
			ctx = null;
		}
	}
	if (!ctx) return null;
	ctx.clearRect(0, 0, 1, 1);
	ctx.fillStyle = '#000';
	ctx.fillStyle = v;
	ctx.fillRect(0, 0, 1, 1);
	const d = ctx.getImageData(0, 0, 1, 1).data;
	return [d[0], d[1], d[2], d[3] / 255];
}

const WHITE: RGBA = [255, 255, 255, 1];

/** Colour functions as computed styles write them inside a gradient. */
const COLOUR_FN = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*\)/gi;

/**
 * Every opaque colour that can be behind `el`: its own background and each
 * ancestor's, composited down to the page (white when nothing is set). A
 * gradient counts as each of its colour stops, so contrast can be measured
 * against the worst of them. Null when an image (url()) is in the way, as its
 * colours can't be known.
 */
export function backgroundsBehind(el: Element): RGBA[] | null {
	// Layers from the top down, each a list of the colours it may be
	const layers: RGBA[][] = [];
	for (let n: Element | null = el; n; n = n.parentElement) {
		const cs = n.ownerDocument.defaultView!.getComputedStyle(n);
		const image = cs.backgroundImage;
		let covered = false;
		if (image && image !== 'none') {
			if (/url\(/i.test(image)) return null;
			const stops = (image.match(COLOUR_FN) ?? []).map(toRGBA);
			if (!stops.length || stops.some((c) => !c)) return null;
			const visible = (stops as RGBA[]).filter((c) => c[3] > 0);
			if (visible.length) layers.push(visible);
			covered = stops.every((c) => c![3] >= 1);
		}
		if (covered) break;
		const c = toRGBA(cs.backgroundColor);
		if (!c) return null;
		if (c[3] > 0) layers.push([c]);
		if (c[3] >= 1) break;
	}
	let out: RGBA[] = [WHITE];
	for (let i = layers.length - 1; i >= 0; i--) {
		const next: RGBA[] = [];
		for (const top of layers[i]) for (const below of out) next.push(composite(top, below));
		// Keep the set small: drop repeats, and stop growing past 64 colours
		const seen = new Set<string>();
		out = next.filter((c) => {
			const k = c.slice(0, 3).map(Math.round).join(',');
			return seen.has(k) ? false : (seen.add(k), true);
		}).slice(0, 64);
	}
	return out;
}

/** The single opaque colour behind `el`, or null for a gradient or image. */
export function backgroundBehind(el: Element): RGBA | null {
	const all = backgroundsBehind(el);
	return all && all.length === 1 ? all[0] : null;
}

/** The lowest contrast of `fg` (which may be translucent) over any of `bgs`, and that background. */
export function worstContrast(fg: RGBA, bgs: RGBA[]): { ratio: number; bg: RGBA } {
	let worst = { ratio: Infinity, bg: bgs[0] };
	for (const bg of bgs) {
		const ratio = contrastRatio(composite(fg, bg), bg);
		if (ratio < worst.ratio) worst = { ratio, bg };
	}
	return worst;
}

export interface ContrastResult {
	ratio: number;
	required: number;
	large: boolean;
}

/**
 * Contrast of the text in `el` against what is behind it (the worst part of a
 * gradient), or null if unknown.
 */
export function textContrast(el: Element): ContrastResult | null {
	const cs = el.ownerDocument.defaultView!.getComputedStyle(el);
	const bgs = backgroundsBehind(el);
	const fg = toRGBA(cs.color);
	if (!bgs || !fg) return null;
	const large = isLargeText(parseFloat(cs.fontSize) || 16, parseInt(cs.fontWeight, 10) || 400);
	const opacity = parseFloat(cs.opacity);
	const fgSeen: RGBA = [fg[0], fg[1], fg[2], fg[3] * (opacity < 1 ? opacity : 1)];
	return { ratio: worstContrast(fgSeen, bgs).ratio, required: requiredRatio(large), large };
}
