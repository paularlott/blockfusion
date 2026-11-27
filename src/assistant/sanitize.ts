/**
 * Sanitise HTML a model wrote before it goes into the page. A rewrite only
 * changes the words of a paragraph, so only text-level markup is allowed
 * (and lists, for a list item's nested list). Anything else is unwrapped to
 * its text, or dropped with its content when it can run code or embed
 * another document. Attributes come from a short list, link addresses are
 * limited to safe schemes, and inline styles can't load anything.
 */

/** Kept, with their content. */
const ALLOWED = new Set([
	'A', 'ABBR', 'B', 'BDI', 'BDO', 'BR', 'CITE', 'CODE', 'DATA', 'DEL', 'DFN', 'EM', 'I', 'IMG', 'INS', 'KBD', 'LI', 'MARK',
	'OL', 'Q', 'S', 'SAMP', 'SMALL', 'SPAN', 'STRONG', 'SUB', 'SUP', 'TIME', 'U', 'UL', 'VAR', 'WBR',
]);
/** Also kept when a whole column is written (blocks, tables). */
const BLOCK_ALLOWED = new Set([
	'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'DIV', 'FIGURE', 'FIGCAPTION', 'HR', 'DL', 'DT', 'DD',
	'TABLE', 'CAPTION', 'COLGROUP', 'COL', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD',
]);
/** Dropped with everything in them. */
const DROPPED = new Set([
	'SCRIPT', 'STYLE', 'IFRAME', 'FRAME', 'FRAMESET', 'OBJECT', 'EMBED', 'APPLET', 'TEMPLATE', 'NOSCRIPT', 'LINK', 'META', 'BASE',
	'FORM', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'SVG', 'MATH', 'CANVAS', 'AUDIO', 'VIDEO', 'SOURCE', 'TRACK', 'TITLE', 'HEAD',
]);
/** Attributes any kept element may have. */
const GLOBAL_ATTRS = new Set(['class', 'style', 'title', 'lang', 'dir', 'id']);
const TAG_ATTRS: Record<string, Set<string>> = {
	A: new Set(['href', 'target', 'rel', 'hreflang']),
	IMG: new Set(['src', 'alt', 'width', 'height', 'loading']),
	ABBR: new Set(['title']),
	DATA: new Set(['value']),
	TIME: new Set(['datetime']),
	TD: new Set(['colspan', 'rowspan']),
	TH: new Set(['colspan', 'rowspan', 'scope']),
	BLOCKQUOTE: new Set(['cite']),
	Q: new Set(['cite']),
	DEL: new Set(['cite', 'datetime']),
	INS: new Set(['cite', 'datetime']),
	OL: new Set(['start', 'reversed', 'type']),
	LI: new Set(['value']),
};

/**
 * Addresses a link or image may use: relative, http(s), mailto, tel, a
 * fragment, or a CMS link tag such as [[~26]].
 */
export function safeUrl(value: string): boolean {
	const v = value.trim().replace(/[\u0000-\u001f\u007f\s]+/g, '');
	if (/^\[\[[^\]]*\]\]/.test(value.trim())) return true;
	const scheme = v.match(/^([a-z][a-z0-9+.-]*):/i);
	return !scheme || ['http', 'https', 'mailto', 'tel'].includes(scheme[1].toLowerCase());
}

/** A style that can't load or run anything (no url(), image-set(), expression(), @import, behaviour). */
function safeStyle(value: string): boolean {
	return !/url\s*\(|image-set|expression\s*\(|@import|behaviou?r\s*:|-moz-binding|javascript:/i.test(value);
}

/**
 * Parse `html` inertly and return its sanitised content. Text-level markup
 * only, or with `blocks` the block markup a column holds too (paragraphs,
 * headings, quotes, tables).
 */
export function sanitizeHtml(html: string, doc: Document, opts: { blocks?: boolean } = {}): DocumentFragment {
	// A template parses without running scripts or loading images
	const tpl = doc.createElement('template');
	tpl.innerHTML = html;
	clean(tpl.content, !!opts.blocks);
	const out = doc.createDocumentFragment();
	out.append(doc.importNode(tpl.content, true));
	return out;
}

function clean(parent: ParentNode, blocks: boolean): void {
	for (const node of Array.from(parent.childNodes)) {
		if (node.nodeType === 3) continue;
		if (node.nodeType !== 1) {
			node.remove();
			continue;
		}
		const el = node as Element;
		const tag = el.tagName.toUpperCase();
		if (DROPPED.has(tag)) {
			el.remove();
			continue;
		}
		clean(el, blocks);
		if (!ALLOWED.has(tag) && !(blocks && BLOCK_ALLOWED.has(tag))) {
			// Unknown or block-level: keep its content, lose the element
			el.replaceWith(...Array.from(el.childNodes));
			continue;
		}
		for (const attr of Array.from(el.attributes)) {
			const name = attr.name.toLowerCase();
			const ok =
				(GLOBAL_ATTRS.has(name) || TAG_ATTRS[tag]?.has(name)) &&
				!((name === 'href' || name === 'src' || name === 'cite') && !safeUrl(attr.value)) &&
				!(name === 'style' && !safeStyle(attr.value));
			if (!ok) el.removeAttribute(attr.name);
		}
		// A link opened in a new tab can't reach back into the page
		if (tag === 'A' && el.getAttribute('target') === '_blank') {
			const rel = new Set((el.getAttribute('rel') ?? '').split(/\s+/).filter(Boolean));
			rel.add('noopener');
			el.setAttribute('rel', [...rel].join(' '));
		}
	}
}
