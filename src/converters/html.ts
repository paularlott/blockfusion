/** Small DOM and string helpers shared by the converters. */
import type { Attrs } from '../model/types';

let inert: Document | null = null;

/**
 * A detached document for parsing. Markup parsed here never loads images or
 * runs scripts, unlike markup set on an element of the live page.
 */
export function inertDocument(): Document {
	if (!inert) inert = document.implementation.createHTMLDocument('');
	return inert;
}

/** Parse an HTML fragment into a detached container element. */
export function fragment(html: string): HTMLElement {
	const root = inertDocument().createElement('div');
	root.innerHTML = html;
	return root;
}

export function tokens(className: string | null | undefined): string[] {
	return (className || '').split(/\s+/).filter(Boolean);
}

export function escapeAttr(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export function escapeHtml(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Same tokens regardless of order and repeats. */
export function sameTokens(a: string[], b: string[]): boolean {
	if (a.length !== b.length) return false;
	const x = [...a].sort();
	const y = [...b].sort();
	return x.every((t, i) => t === y[i]);
}

/** Attributes the editor adds in the canvas; never part of the content. */
const EDITOR_ATTR = /^(data-bf-|contenteditable$|spellcheck$)/;

/** Read id, style, tag and any other attributes (but not class) from an element. */
export function readAttrs(el: Element, className: string): Attrs {
	const attrs: Attrs = {};
	if (className) attrs.className = className;
	const tag = el.tagName.toLowerCase();
	if (tag !== 'div') attrs.tag = tag;
	for (const a of Array.from(el.attributes)) {
		if (a.name === 'class' || EDITOR_ATTR.test(a.name)) continue;
		if (a.name === 'id') attrs.id = a.value;
		else if (a.name === 'style') attrs.style = a.value;
		else (attrs.extra ??= {})[a.name] = a.value;
	}
	return attrs;
}

/** Serialise attributes (class first) for an opening tag. */
export function attrString(className: string, attrs?: Attrs): string {
	let out = className ? ` class="${escapeAttr(className)}"` : '';
	if (attrs?.id) out += ` id="${escapeAttr(attrs.id)}"`;
	if (attrs?.style) out += ` style="${escapeAttr(attrs.style)}"`;
	if (attrs?.extra) {
		for (const [k, v] of Object.entries(attrs.extra)) {
			if (/^[^\s"'>/=]+$/.test(k)) out += ` ${k}="${escapeAttr(v)}"`;
		}
	}
	return out;
}

export function joinClasses(...parts: Array<string | string[] | undefined>): string {
	return parts
		.flatMap((p) => (Array.isArray(p) ? p : tokens(p)))
		.filter(Boolean)
		.join(' ');
}

/* ------------------------------------------------------------ raw code */

export const RAW_OPEN = '<!--bf:raw-->';
export const RAW_CLOSE = '<!--/bf:raw-->';
const RAW_RE = /<!--bf:raw-->([\s\S]*?)<!--\/bf:raw-->/g;

/**
 * Lift raw code out of markup before it is parsed, so it comes back
 * byte for byte. Each block is replaced by a `<!--bf:raw:N-->` placeholder.
 */
export function extractRaw(html: string): { html: string; raws: string[] } {
	const raws: string[] = [];
	const out = html.replace(RAW_RE, (_m, code: string) => {
		raws.push(code);
		return `<!--bf:raw:${raws.length - 1}-->`;
	});
	return { html: out, raws };
}

export function wrapRaw(code: string, markers = true): string {
	return markers ? RAW_OPEN + code + RAW_CLOSE : code;
}

/** Content that must not become editable rich text. */
export const SCRIPTY = /<(script|style|noscript|template|link|object|embed)\b/i;

/** Serialise a list of nodes as HTML. */
export function nodesToHtml(nodes: Node[]): string {
	const box = inertDocument().createElement('div');
	for (const n of nodes) box.appendChild(n.cloneNode(true));
	return box.innerHTML;
}

/**
 * Rewrite the class attribute of every element in a fragment. Returns the
 * input unchanged when no class changes, so markup is not reformatted.
 */
export function mapFragmentClasses(html: string, map: (t: string[]) => string[]): string {
	if (!/\bclass\s*=/i.test(html)) return html;
	const root = fragment(html);
	let changed = false;
	for (const el of Array.from(root.querySelectorAll('[class]'))) {
		const before = tokens(el.getAttribute('class'));
		const after = map(before);
		if (!sameTokens(before, after)) {
			changed = true;
			if (after.length) el.setAttribute('class', after.join(' '));
			else el.removeAttribute('class');
		}
	}
	return changed ? root.innerHTML : html;
}
