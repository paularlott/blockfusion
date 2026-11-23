/**
 * Rich text operations on the canvas selection. They run inside
 * `editor.runText()` so each is one undo step. Browser editing commands do
 * the heavy lifting; font, size and colour use a marker so the result is a
 * clean <span style> rather than legacy <font> tags.
 */
import { escapeHtml } from '../converters/html';
import type { Editor } from '../editor';

const MARKER = 'bf-marker-7f3a';
const LINK_MARKER = 'https://bf-link-marker.invalid/';

/** Selection node inside a rich column, or null. */
function selectionNode(editor: Editor): Node | null {
	const r = editor.canvas.range;
	if (!r || !editor.canvas.selectionCol) return null;
	return r.startContainer;
}

function elementOf(node: Node | null): Element | null {
	return node ? (node.nodeType === 1 ? (node as Element) : node.parentElement) : null;
}

/** queryCommandState in the canvas, only when the caret is in a column. */
export function commandState(editor: Editor, cmd: string): boolean {
	if (!editor.canvas.selectionCol || !editor.canvas.doc) return false;
	try {
		return editor.canvas.doc.queryCommandState(cmd);
	} catch {
		return false;
	}
}

export function exec(editor: Editor, label: string, cmd: string, value?: string): boolean {
	return editor.runText(label, (d) => d.execCommand(cmd, false, value));
}

const BLOCK_TAGS = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'blockquote', 'li', 'div'];

/** Tag of the block holding the caret ('p', 'h2', 'pre', ...). */
export function currentBlock(editor: Editor): string | null {
	let el = elementOf(selectionNode(editor));
	while (el && !el.hasAttribute('data-bf-content')) {
		const tag = el.tagName.toLowerCase();
		if (BLOCK_TAGS.includes(tag) && tag !== 'blockquote') return tag;
		el = el.parentElement;
	}
	return el ? 'p' : null;
}

export function inBlockquote(editor: Editor): boolean {
	const el = elementOf(selectionNode(editor));
	return !!el?.closest('blockquote') && !!el.closest('[data-bf-content]')?.contains(el.closest('blockquote'));
}

export function setBlock(editor: Editor, tag: string, label: string): boolean {
	return editor.runText(label, (d) => d.execCommand('formatBlock', false, `<${tag}>`));
}

export function toggleBlockquote(editor: Editor): boolean {
	const inside = inBlockquote(editor);
	return editor.runText(inside ? 'Remove quote' : 'Quote', (d, content) => {
		const el = elementOf(d.getSelection()?.anchorNode ?? null);
		const bq = el?.closest('blockquote');
		if (bq && content.contains(bq)) {
			// Unwrap; loose inline content becomes a paragraph.
			const hasBlocks = Array.from(bq.children).some((c) => /^(P|H\d|UL|OL|PRE|DIV|TABLE)$/.test(c.tagName));
			if (!hasBlocks) {
				const p = d.createElement('p');
				while (bq.firstChild) p.appendChild(bq.firstChild);
				bq.replaceWith(p);
			} else {
				while (bq.firstChild) bq.parentNode!.insertBefore(bq.firstChild, bq);
				bq.remove();
			}
		} else d.execCommand('formatBlock', false, '<blockquote>');
	});
}

/** The value of an inline style at the caret (from our spans), or null. */
export function currentStyle(editor: Editor, prop: string): string | null {
	let el = elementOf(selectionNode(editor)) as HTMLElement | null;
	while (el && !el.hasAttribute('data-bf-content')) {
		const v = el.style?.getPropertyValue(prop);
		if (v) return v;
		el = el.parentElement;
	}
	return null;
}

/**
 * Apply an inline style (font-family, font-size, color) to the selection.
 * `value` null removes it.
 */
export function applyInlineStyle(editor: Editor, label: string, prop: string, value: string | null): boolean {
	const r = editor.canvas.range;
	if (!r || r.collapsed) {
		editor.announce('Select some text first');
		return false;
	}
	return editor.runText(label, (d, content) => {
		d.execCommand('styleWithCSS', false, 'false');
		d.execCommand('fontName', false, MARKER);
		const spans: HTMLElement[] = [];
		for (const font of Array.from(content.querySelectorAll(`font[face="${MARKER}"]`))) {
			for (const inner of Array.from(font.querySelectorAll<HTMLElement>('[style]'))) {
				inner.style.removeProperty(prop);
				if (!inner.getAttribute('style')) inner.removeAttribute('style');
			}
			// Spans left with no attributes are just noise.
			for (const inner of Array.from(font.querySelectorAll('span:not([class]):not([style]):not([id])'))) {
				inner.replaceWith(...Array.from(inner.childNodes));
			}
			const span = d.createElement('span');
			if (value) span.style.setProperty(prop, value);
			while (font.firstChild) span.appendChild(font.firstChild);
			if (span.getAttribute('style')) {
				font.replaceWith(span);
				spans.push(span);
			} else font.replaceWith(...Array.from(span.childNodes));
		}
		if (spans.length) {
			const range = d.createRange();
			range.setStartBefore(spans[0]);
			range.setEndAfter(spans[spans.length - 1]);
			const sel = d.getSelection()!;
			sel.removeAllRanges();
			sel.addRange(range);
		}
	});
}

export function linkAtSelection(editor: Editor): HTMLAnchorElement | null {
	const r = editor.canvas.range;
	if (!r || !editor.canvas.selectionCol) return null;
	const a = elementOf(r.commonAncestorContainer)?.closest('a') ?? elementOf(r.startContainer)?.closest('a');
	return a && a.closest('[data-bf-content]') ? (a as HTMLAnchorElement) : null;
}

export interface LinkSpec {
	href: string;
	text?: string;
	newTab?: boolean;
	title?: string;
}

function setLinkAttrs(a: HTMLAnchorElement, spec: LinkSpec): void {
	a.setAttribute('href', spec.href);
	if (spec.newTab) {
		a.target = '_blank';
		a.rel = 'noopener';
	} else {
		a.removeAttribute('target');
		if (a.rel === 'noopener') a.removeAttribute('rel');
	}
	if (spec.title) a.title = spec.title;
	else a.removeAttribute('title');
}

export function applyLink(editor: Editor, spec: LinkSpec, existing: HTMLAnchorElement | null): boolean {
	return editor.runText(existing ? 'Edit link' : 'Insert link', (d, content) => {
		if (existing && content.contains(existing)) {
			setLinkAttrs(existing, spec);
			if (spec.text && spec.text !== existing.textContent) existing.textContent = spec.text;
			return;
		}
		const sel = d.getSelection()!;
		if (sel.isCollapsed) {
			d.execCommand('insertHTML', false, `<a href="${LINK_MARKER}">${escapeHtml(spec.text || spec.href)}</a>`);
		} else d.execCommand('createLink', false, LINK_MARKER);
		for (const a of Array.from(content.querySelectorAll<HTMLAnchorElement>(`a[href="${LINK_MARKER}"]`))) setLinkAttrs(a, spec);
	});
}

export function removeLink(editor: Editor, existing: HTMLAnchorElement | null): boolean {
	return editor.runText('Remove link', (d, content) => {
		if (existing && content.contains(existing)) existing.replaceWith(...Array.from(existing.childNodes));
		else d.execCommand('unlink');
	});
}

export interface ImageSpec {
	src: string;
	alt: string;
	width?: number;
	height?: number;
}

export function applyImage(editor: Editor, spec: ImageSpec, existing: HTMLImageElement | null): boolean {
	return editor.runText(existing ? 'Edit image' : 'Insert image', (d, content) => {
		const target = existing && content.contains(existing) ? existing : d.createElement('img');
		target.setAttribute('src', spec.src);
		target.setAttribute('alt', spec.alt);
		for (const k of ['width', 'height'] as const) {
			if (spec[k]) target.setAttribute(k, String(spec[k]));
			else target.removeAttribute(k);
		}
		if (target !== existing) {
			target.classList.remove('bf-selected');
			d.execCommand('insertHTML', false, target.outerHTML.replace(' class=""', ''));
		}
	});
}

export function clearFormatting(editor: Editor): boolean {
	return editor.runText('Clear formatting', (d, content) => {
		d.execCommand('removeFormat');
		// removeFormat leaves our styled spans behind in some browsers.
		const r = d.getSelection()?.rangeCount ? d.getSelection()!.getRangeAt(0) : null;
		for (const span of Array.from(content.querySelectorAll('span[style]'))) {
			if (!r || r.intersectsNode(span)) span.replaceWith(...Array.from(span.childNodes));
		}
	});
}
