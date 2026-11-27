/**
 * Rich text operations on the canvas selection. They run inside
 * `editor.runText()` so each is one undo step. Browser editing commands do
 * the heavy lifting; font, size and colour use a marker so the result is a
 * clean <span style> rather than legacy <font> tags.
 */
import { NEUTRAL_FLUID_IMAGE } from '../converters/classmap';
import type { Converter } from '../converters/types';
import { escapeHtml } from '../converters/html';
import type { Editor } from '../editor';

const MARKER = 'bf-marker-7f3a';
const LINK_MARKER = 'https://bf-link-marker.invalid/';

/** Selection node inside a rich column, or null. */
function selectionNode(editor: Editor): Node | null {
	const r = editor.canvas.range;
	if (!r || !editor.canvas.selectionCol) return null;
	// A selection set around elements (e.g. after styling) starts at a child.
	if (!r.collapsed && r.startContainer.nodeType === 1) {
		const child = r.startContainer.childNodes[r.startOffset];
		if (child) return child;
	}
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

/**
 * Tidy what browser editing commands leave behind: lists wrapped in <p>
 * (Chrome), obsolete <strike>, and empty style attributes.
 */
/**
 * Browsers' bold, italic and underline commands write <b>, <i> and <u>.
 * Store <strong> and <em>, and underline as a styled span, since <u> means
 * an annotation (such as a misspelling) rather than decoration. Elements
 * with a class are left alone: <i> is often an icon (<i class="fa fa-star">)
 * and a classed <u> is likely a deliberate annotation.
 */
export function semanticInline(root: HTMLElement): void {
	const map: Record<string, string> = { B: 'strong', I: 'em', U: 'span' };
	const found = Array.from(root.querySelectorAll('b:not([class]), i:not([class]), u:not([class])'));
	if (!found.length) return;
	// Keep the selection: children move across unchanged, so a boundary on a
	// replaced element maps to the same offset in its replacement.
	const sel = root.ownerDocument.getSelection();
	const range = sel && sel.rangeCount && root.contains(sel.getRangeAt(0).commonAncestorContainer) ? sel.getRangeAt(0) : null;
	const saved = range && [range.startContainer, range.startOffset, range.endContainer, range.endOffset] as const;
	const swapped = new Map<Node, Node>();
	for (const el of found) {
		const out = root.ownerDocument.createElement(map[el.tagName]);
		for (const a of Array.from(el.attributes)) out.setAttribute(a.name, a.value);
		if (el.tagName === 'U') {
			const deco = out.style.textDecorationLine;
			if (!/underline/.test(deco)) out.style.textDecorationLine = deco && deco !== 'none' ? deco + ' underline' : 'underline';
		}
		while (el.firstChild) out.appendChild(el.firstChild);
		el.replaceWith(out);
		swapped.set(el, out);
	}
	if (saved && sel) {
		const r = root.ownerDocument.createRange();
		r.setStart(swapped.get(saved[0]) ?? saved[0], saved[1]);
		r.setEnd(swapped.get(saved[2]) ?? saved[2], saved[3]);
		sel.removeAllRanges();
		sel.addRange(r);
	}
}

/**
 * Drop a <br> left at the end of a block that has other content (browsers
 * add one as a placeholder and leave it behind); it renders nothing.
 */
export function trailingBreaks(root: HTMLElement): void {
	for (const br of Array.from(root.querySelectorAll('br'))) {
		const block = br.parentElement;
		if (!block || block === root || !/^(P|H[1-6]|LI|DIV|BLOCKQUOTE|PRE|TD|TH)$/.test(block.tagName)) continue;
		let next = br.nextSibling;
		while (next && next.nodeType === 3 && !next.textContent) next = next.nextSibling;
		if (next) continue;
		let prev = br.previousSibling;
		while (prev && prev.nodeType === 3 && !prev.textContent) prev = prev.previousSibling;
		// Keep it when it's all the block has, or when it ends a run of breaks (a blank line)
		if (!prev || prev.nodeName === 'BR' || !(block.textContent ?? '').trim()) continue;
		br.remove();
	}
}

export function normaliseContent(root: HTMLElement): void {
	semanticInline(root);
	for (const list of Array.from(root.querySelectorAll('p > ul, p > ol'))) {
		const p = list.parentElement!;
		const others = Array.from(p.childNodes).filter((n) => n !== list && !(n.nodeType === 3 && !n.textContent!.trim()) && (n as Element).tagName !== 'BR');
		if (!others.length) p.replaceWith(list);
		else p.after(list);
	}
	for (const el of Array.from(root.querySelectorAll('strike'))) {
		const s = root.ownerDocument.createElement('s');
		while (el.firstChild) s.appendChild(el.firstChild);
		el.replaceWith(s);
	}
	for (const el of Array.from(root.querySelectorAll('[style=""]'))) el.removeAttribute('style');
	// formatBlock can leave completely empty paragraphs (no <br>) around the
	// block it changed; they are invisible and cannot hold the caret.
	for (const el of Array.from(root.querySelectorAll('p:empty'))) el.remove();
}

const INDENT_STEP = 40;
const INDENTABLE = 'p,h1,h2,h3,h4,h5,h6,pre,blockquote,div';

/** Top-level blocks of a column that the range touches. */
function blocksInRange(content: HTMLElement, range: Range): HTMLElement[] {
	const out: HTMLElement[] = [];
	for (const el of Array.from(content.children) as HTMLElement[]) {
		if (el.matches(INDENTABLE) && range.intersectsNode(el)) out.push(el);
	}
	return out;
}

/**
 * Indent or outdent: list items nest (browser command); other blocks get a
 * left margin in 40px steps rather than Chrome's styled blockquote.
 */
export function indent(editor: Editor, delta: 1 | -1): boolean {
	const label = delta > 0 ? 'Increase indent' : 'Decrease indent';
	return editor.runText(label, (d, content) => {
		const sel = d.getSelection();
		if (!sel?.rangeCount) return;
		const range = sel.getRangeAt(0);
		const start = elementOf(range.startContainer);
		if (start?.closest('li') && content.contains(start.closest('li'))) {
			d.execCommand(delta > 0 ? 'indent' : 'outdent');
			return;
		}
		for (const block of blocksInRange(content, range)) {
			const now = parseFloat(block.style.marginLeft) || 0;
			const next = Math.max(0, now + delta * INDENT_STEP);
			if (next) block.style.marginLeft = `${next}px`;
			else block.style.removeProperty('margin-left');
			if (!block.getAttribute('style')) block.removeAttribute('style');
		}
	});
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
			// Styling exactly the text of an existing styled span: merge into it.
			const parent = font.parentElement;
			const alone = parent && parent.tagName === 'SPAN' && parent !== content && Array.from(parent.childNodes).every((n) => n === font || (n.nodeType === 3 && !n.textContent));
			if (alone && parent.hasAttribute('style')) {
				if (value) parent.style.setProperty(prop, value);
				else parent.style.removeProperty(prop);
				font.replaceWith(...Array.from(font.childNodes));
				if (!parent.getAttribute('style')) parent.replaceWith(...Array.from(parent.childNodes));
				else spans.push(parent);
				continue;
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

/**
 * Let an image shrink to fit its column: the framework's fluid image class
 * (img-fluid, img-responsive, max-w-full h-auto, bf-img, ...).
 */
export function fluidImage(img: HTMLImageElement, converter: Converter): void {
	for (const c of converter.toFramework([NEUTRAL_FLUID_IMAGE])) img.classList.add(c);
}

/**
 * Insert an image at the caret. Chrome's insertHTML copies the surrounding
 * text's computed style onto it (style="font-size: 1rem"), so the image goes
 * in marked and gets back exactly the style it was given.
 */
export function insertImage(d: Document, content: Element, img: HTMLImageElement): void {
	const style = img.getAttribute('style');
	img.setAttribute('data-bf-new', '');
	d.execCommand('insertHTML', false, img.outerHTML.replace(' class=""', ''));
	for (const el of Array.from(content.querySelectorAll('img[data-bf-new]'))) {
		el.removeAttribute('data-bf-new');
		if (style) el.setAttribute('style', style);
		else el.removeAttribute('style');
	}
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
		if (editor.options.fluidImages) fluidImage(target as HTMLImageElement, editor.converter);
		if (target !== existing) {
			target.classList.remove('bf-selected');
			insertImage(d, content, target as HTMLImageElement);
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
