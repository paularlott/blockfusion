/**
 * Paste cleaning. Content from Word, Google Docs and web pages arrives with
 * inline styles, classes, wrapper spans and office markup. Keep the meaning
 * (headings, lists, links, emphasis, tables, images) and drop the rest.
 */
import { escapeHtml, inertDocument } from '../converters/html';

/** Elements kept as they are (their attributes are still filtered). */
const KEEP = new Set([
	'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code',
	'ul', 'ol', 'li', 'dl', 'dt', 'dd',
	'a', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'ins', 'sub', 'sup', 'mark', 'small', 'abbr', 'cite', 'q',
	'br', 'hr', 'img', 'figure', 'figcaption',
	'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
]);

/** Elements removed with everything inside them. */
const DROP = new Set([
	'script', 'style', 'meta', 'link', 'title', 'head', 'noscript', 'template', 'object', 'embed',
	'iframe', 'form', 'input', 'button', 'select', 'textarea', 'svg', 'math', 'xml',
]);

/** Attributes allowed per element ('*' applies to all). */
const ATTRS: Record<string, string[]> = {
	'*': ['title', 'lang', 'dir'],
	a: ['href', 'target', 'rel'],
	img: ['src', 'alt', 'width', 'height'],
	td: ['colspan', 'rowspan', 'scope'],
	th: ['colspan', 'rowspan', 'scope'],
	ol: ['start', 'type', 'reversed'],
	li: ['value'],
	abbr: ['title'],
	q: ['cite'],
	blockquote: ['cite'],
};

const BLOCKS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'ul', 'ol', 'dl', 'table', 'figure', 'hr', 'div']);

function isSafeUrl(url: string): boolean {
	const u = url.trim().toLowerCase().replace(/[\s\u0000-\u001f]/g, '');
	return !(u.startsWith('javascript:') || u.startsWith('vbscript:') || (u.startsWith('data:') && !u.startsWith('data:image/')));
}

/** Turn styled spans (Google Docs) into the semantic tags they stand for. */
function semanticWrappers(el: HTMLElement): string[] {
	const s = el.style;
	const out: string[] = [];
	const weight = s.fontWeight;
	if (weight === 'bold' || weight === 'bolder' || Number(weight) >= 600) out.push('strong');
	if (s.fontStyle === 'italic') out.push('em');
	const deco = `${s.textDecoration} ${s.textDecorationLine}`;
	if (/underline/.test(deco)) out.push('u');
	if (/line-through/.test(deco)) out.push('s');
	if (s.verticalAlign === 'super') out.push('sup');
	if (s.verticalAlign === 'sub') out.push('sub');
	return out;
}

function unwrap(el: Element): void {
	const parent = el.parentNode;
	if (!parent) return;
	while (el.firstChild) parent.insertBefore(el.firstChild, el);
	parent.removeChild(el);
}

function rename(el: Element, tag: string): Element {
	const doc = el.ownerDocument;
	const out = doc.createElement(tag);
	while (el.firstChild) out.appendChild(el.firstChild);
	el.parentNode?.replaceChild(out, el);
	return out;
}

function hasBlockChild(el: Element): boolean {
	return Array.from(el.children).some((c) => BLOCKS.has(c.tagName.toLowerCase()));
}

function cleanNode(node: Node): void {
	for (const child of Array.from(node.childNodes)) {
		if (child.nodeType === 8) {
			child.parentNode?.removeChild(child);
			continue;
		}
		if (child.nodeType !== 1) continue;
		let el = child as HTMLElement;
		const tag = el.tagName.toLowerCase();

		if (DROP.has(tag) || tag.includes(':')) {
			// Office namespaced tags (o:p, w:sdt) carry no content worth keeping
			// apart from text, which o:p never has.
			if (tag.includes(':') && tag !== 'o:p') unwrap(el);
			else el.remove();
			continue;
		}

		// Google Docs wraps the whole paste in <b style="font-weight:normal" id="docs-internal-guid-...">.
		if (tag === 'b' && /^docs-internal-guid/.test(el.id)) {
			cleanNode(el);
			unwrap(el);
			continue;
		}

		const semantic = tag === 'span' || tag === 'font' || tag === 'b' || tag === 'i' ? semanticWrappers(el) : [];
		if (tag === 'b' && el.style.fontWeight && Number(el.style.fontWeight) < 600) {
			el = rename(el, 'span') as HTMLElement;
		}

		cleanNode(el);
		const name = el.tagName.toLowerCase();

		if (name === 'span' || name === 'font') {
			// Rebuild meaningful styling as tags, then drop the wrapper.
			let target: Element = el;
			for (const t of semantic) {
				const w = el.ownerDocument.createElement(t);
				while (target.firstChild) w.appendChild(target.firstChild);
				target.appendChild(w);
				target = w;
			}
			unwrap(el);
			continue;
		}
		if (name === 'div' || name === 'section' || name === 'article' || name === 'main' || name === 'header' || name === 'footer') {
			if (hasBlockChild(el)) unwrap(el);
			else stripAttrs(rename(el, 'p'));
			continue;
		}
		if (!KEEP.has(name)) {
			unwrap(el);
			continue;
		}
		stripAttrs(el);
	}
}

function stripAttrs(el: Element): void {
	const tag = el.tagName.toLowerCase();
	const allowed = new Set([...(ATTRS['*'] ?? []), ...(ATTRS[tag] ?? [])]);
	for (const a of Array.from(el.attributes)) {
		if (!allowed.has(a.name)) el.removeAttribute(a.name);
		else if ((a.name === 'href' || a.name === 'src' || a.name === 'cite') && !isSafeUrl(a.value)) el.removeAttribute(a.name);
	}
}

/** Remove empty inline wrappers and paragraphs made of nothing. */
function prune(root: Element): void {
	for (const el of Array.from(root.querySelectorAll('strong,b,em,i,u,s,sub,sup')).reverse()) {
		if (!el.textContent && !el.querySelector('img,br')) el.remove();
	}
	// A link whose href was unsafe (or missing) is just text.
	for (const el of Array.from(root.querySelectorAll('a:not([href])'))) unwrap(el);
	for (const el of Array.from(root.querySelectorAll('p'))) {
		if (!el.textContent?.replace(/ /g, ' ').trim() && !el.querySelector('img,br')) el.remove();
	}
}

/** Remove Word's conditional comments and fragment markers before parsing. */
function preClean(html: string): string {
	return html
		// Downlevel-revealed blocks hold Word's list bullets and numbers.
		.replace(/<!--\[if [^\]]*\]-->[\s\S]*?<!--\[endif\]-->/gi, '')
		.replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '')
		.replace(/<!--(StartFragment|EndFragment)-->/gi, '')
		.replace(/<\?xml[^>]*>/gi, '');
}

export type PasteFilter = (html: string) => string;

/** Clean pasted HTML down to semantic markup. */
export function cleanPaste(html: string, filters: PasteFilter[] = []): string {
	for (const f of filters) html = f(html);
	const doc = inertDocument();
	const box = doc.createElement('div');
	// Only the body of a full document matters.
	const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html);
	box.innerHTML = preClean(body ? body[1] : html);
	cleanNode(box);
	prune(box);
	return box.innerHTML.replace(/ /g, '&nbsp;').trim();
}

/** Turn pasted plain text into paragraphs and line breaks. */
export function textToHtml(text: string): string {
	const paras = text.replace(/\r\n?/g, '\n').split(/\n{2,}/);
	return paras
		.map((p) => p.trim())
		.filter(Boolean)
		.map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
		.join('');
}
