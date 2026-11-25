/** Tiny DOM helpers for building the chrome. */

type Child = Node | string | null | undefined | false;
type Props = Record<string, string | number | boolean | null | undefined | EventListener>;

/**
 * Create an element. Props starting with "on" become listeners, `true`
 * becomes an empty attribute and null/false/undefined are skipped.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	props?: Props,
	...children: Array<Child | Child[]>
): HTMLElementTagNameMap[K];
export function h(tag: string, props: Props = {}, ...children: Array<Child | Child[]>): HTMLElement {
	return hIn(document, tag, props, ...children);
}

/** Same as h() but in another document (the canvas iframe). */
export function hIn(doc: Document, tag: string, props: Props = {}, ...children: Array<Child | Child[]>): HTMLElement {
	const el = doc.createElement(tag);
	for (const [k, v] of Object.entries(props)) {
		if (v === null || v === undefined || v === false) continue;
		if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
		else if (k === 'className') el.className = String(v);
		else el.setAttribute(k, v === true ? '' : String(v));
	}
	for (const c of children.flat()) {
		if (c === null || c === undefined || c === false) continue;
		el.append(typeof c === 'string' ? doc.createTextNode(c) : c);
	}
	return el;
}

let seq = 0;
export function nextId(prefix = 'bf'): string {
	// One counter for the page, so add-on bundles (blockfusion-assistant) never repeat an id
	const g = globalThis as { __bfIdSeq?: number };
	g.__bfIdSeq = Math.max(g.__bfIdSeq ?? 0, seq) + 1;
	seq = g.__bfIdSeq;
	return `${prefix}-${seq}`;
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** Focusable descendants, in tab order. */
export function focusables(root: Element): HTMLElement[] {
	const sel =
		'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';
	return Array.from(root.querySelectorAll<HTMLElement>(sel)).filter(
		(el) => !el.closest('[hidden]') && !el.closest('[inert]') && el.getClientRects().length > 0,
	);
}
