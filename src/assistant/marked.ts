/**
 * Text with light marks for the assistant, so a rewrite keeps the formatting.
 *
 * Models know Markdown, so inline formatting goes out as marks: **bold**,
 * *italic*, `code`, and [text](n) for a link or any other inline element (a
 * coloured span, underline, sup ...). n points at the original element, which
 * is cloned back on the way in, so a link keeps its address and a span its
 * class and style. Elements without text (an image, a nested list) go out as
 * [](n) and are put back if the model drops them.
 *
 * Small models often drop the marks, so each formatted phrase is also
 * remembered: when its mark is missing, the same words are found in the
 * reply and the formatting is put back on them. Only phrases that were
 * reworded too are lost, and those are reported.
 */

/** Elements that never sit inside a run of text; kept whole. */
const BLOCK = new Set(['ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DIV', 'DL', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'UL']);
/** Elements kept whole (their content isn't text to rewrite). */
const ATOMIC = new Set(['AUDIO', 'CANVAS', 'EMBED', 'IFRAME', 'IMG', 'INPUT', 'MATH', 'OBJECT', 'PICTURE', 'SCRIPT', 'SELECT', 'STYLE', 'SVG', 'TEXTAREA', 'VIDEO']);

/** A formatted phrase in the original: a ref ([..](n)) or a bold, italic or code run. */
export interface Span {
	text: string;
	ref?: number;
	tag?: 'strong' | 'em' | 'code';
}

/** What a rewrite needs to rebuild the formatting; shared across paragraphs. */
export interface Marks {
	/** refs[n - 1] is the element written as [..](n). */
	refs: Element[];
	spans: Span[];
}

export interface Marked extends Marks {
	text: string;
}

const escape = (s: string) => s.replace(/([\\*`[\]])/g, '\\$1');
const words = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Write the content of `root` (an element or fragment) as marked text. Pass
 * `marks` to number on from an earlier call (several paragraphs, one list).
 */
export function toMarked(root: Node, marks: Marks = { refs: [], spans: [] }): Marked {
	const { refs, spans } = marks;
	const walk = (node: Node): string => {
		let out = '';
		for (const n of Array.from(node.childNodes)) {
			if (n.nodeType === 3) out += escape((n.textContent ?? '').replace(/\s+/g, ' '));
			else if (n.nodeType === 1) {
				const el = n as Element;
				const tag = el.tagName.toUpperCase();
				const text = words(el.textContent ?? '');
				if (tag === 'BR') out += '\n';
				else if (tag === 'STRONG' || tag === 'B') {
					if (text) spans.push({ text, tag: 'strong' });
					out += wrap('**', walk(el));
				} else if (tag === 'EM' || tag === 'I') {
					if (text) spans.push({ text, tag: 'em' });
					out += wrap('*', walk(el));
				} else if (tag === 'CODE') {
					if (text) spans.push({ text, tag: 'code' });
					out += wrap('`', escape(el.textContent ?? ''));
				} else if (BLOCK.has(tag) || ATOMIC.has(tag) || !text) out += `[](${refs.push(el)})`;
				else {
					const ref = refs.push(el);
					spans.push({ text, ref });
					out += `[${walk(el)}](${ref})`;
				}
			}
		}
		return out;
	};
	return { text: walk(root).replace(/[ \t]+\n/g, '\n').trim(), refs, spans };
}

/** Marks hug their text: ** text ** becomes ** around "text" with the spaces outside. */
function wrap(mark: string, inner: string): string {
	const m = inner.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
	return m[2] ? `${m[1]}${mark}${m[2]}${mark}${m[3]}` : inner;
}

/** The ref numbers used in marked text. */
export function refsIn(text: string): Set<number> {
	const used = new Set<number>();
	for (const m of text.matchAll(/(?<!\\)\]\((\d+)\)/g)) used.add(Number(m[1]));
	return used;
}

/** Which refs and spans (by index) belong to a paragraph; default all. */
export interface Own {
	refs: number[];
	spans: number[];
}

/**
 * Build DOM from marked text. [text](n) clones refs[n - 1] with the new text
 * as its content (an element without text comes back whole). Anything that
 * doesn't parse stays as plain text. Formatting whose mark is missing is put
 * back on the same words where they can be found; `lost` lists the phrases
 * that couldn't be. Elements without text that the text left out are added
 * at the end, so an image or a nested list isn't lost.
 */
export function rebuild(text: string, marks: Marks, doc: Document, own?: Own): { frag: DocumentFragment; lost: string[] } {
	const { refs, spans } = marks;
	const frag = doc.createDocumentFragment();
	const used = new Set<number>();
	parseInto(frag, text, refs, doc, used);
	const lost: string[] = [];
	for (const i of own?.spans ?? spans.map((_, i) => i)) {
		const span = spans[i];
		if (!span) continue;
		if (span.ref !== undefined) {
			if (used.has(span.ref)) continue;
			const ref = refs[span.ref - 1];
			if (wrapPhrase(frag, doc, span.text, () => ref.cloneNode(false) as Element)) used.add(span.ref);
			else lost.push(span.text);
		} else if (span.tag) {
			if (hasTagWith(frag, span.tag, span.text)) continue;
			const tag = span.tag;
			if (!wrapPhrase(frag, doc, span.text, () => doc.createElement(tag))) lost.push(span.text);
		}
	}
	for (const n of own?.refs ?? refs.map((_, i) => i + 1)) {
		const el = refs[n - 1];
		if (el && !used.has(n) && !hasText(el)) frag.append(el.cloneNode(true));
	}
	return { frag, lost };
}

/** Build DOM from marked text (see rebuild). */
export function fromMarked(text: string, refs: Element[], doc: Document, own?: Iterable<number>): DocumentFragment {
	return rebuild(text, { refs, spans: [] }, doc, own ? { refs: [...own], spans: [] } : undefined).frag;
}

const hasText = (el: Element) => !BLOCK.has(el.tagName.toUpperCase()) && !ATOMIC.has(el.tagName.toUpperCase()) && !!el.textContent?.trim();

function hasTagWith(root: DocumentFragment, tag: string, text: string): boolean {
	const want = text.toLowerCase();
	return Array.from(root.querySelectorAll(tag)).some((el) => words(el.textContent ?? '').toLowerCase() === want);
}

/**
 * Wrap the first plain occurrence of `phrase` (any case, any spacing, as
 * whole words, within one run of text and not inside a link) in make().
 */
function wrapPhrase(root: DocumentFragment, doc: Document, phrase: string, make: () => Element): boolean {
	const parts = phrase.split(' ').map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
	if (!parts[0]) return false;
	const re = new RegExp(`(?<![\\p{L}\\p{N}])${parts.join('\\s+')}(?![\\p{L}\\p{N}])`, 'iu');
	const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
	for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
		if (n.parentElement?.closest('a')) continue;
		const m = re.exec(n.data);
		if (!m) continue;
		const mid = n.splitText(m.index);
		mid.splitText(m[0].length);
		const el = make();
		mid.replaceWith(el);
		el.append(mid);
		return true;
	}
	return false;
}

function parseInto(parent: Node, s: string, refs: Element[], doc: Document, used: Set<number>): void {
	let buf = '';
	const flush = () => {
		if (buf) parent.appendChild(doc.createTextNode(buf));
		buf = '';
	};
	let i = 0;
	while (i < s.length) {
		const c = s[i];
		if (c === '\\' && i + 1 < s.length) {
			buf += s[i + 1];
			i += 2;
			continue;
		}
		if (c === '\n') {
			flush();
			parent.appendChild(doc.createElement('br'));
			i++;
			continue;
		}
		if (c === '*' && s[i + 1] === '*') {
			const end = findClose(s, i + 2, '**');
			if (end > i + 2) {
				flush();
				const el = doc.createElement('strong');
				parseInto(el, s.slice(i + 2, end), refs, doc, used);
				parent.appendChild(el);
				i = end + 2;
				continue;
			}
		} else if (c === '*') {
			const end = findClose(s, i + 1, '*');
			if (end > i + 1) {
				flush();
				const el = doc.createElement('em');
				parseInto(el, s.slice(i + 1, end), refs, doc, used);
				parent.appendChild(el);
				i = end + 1;
				continue;
			}
		} else if (c === '`') {
			const end = findClose(s, i + 1, '`');
			if (end > i + 1) {
				flush();
				const el = doc.createElement('code');
				el.textContent = s.slice(i + 1, end).replace(/\\(.)/g, '$1');
				parent.appendChild(el);
				i = end + 1;
				continue;
			}
		} else if (c === '[') {
			const close = findBracket(s, i + 1);
			const m = close > 0 ? s.slice(close).match(/^\]\((\d+)\)/) : null;
			const ref = m ? refs[Number(m[1]) - 1] : undefined;
			if (m && ref) {
				flush();
				const n = Number(m[1]);
				const inner = s.slice(i + 1, close);
				if (!hasText(ref)) parent.appendChild(ref.cloneNode(true));
				else if (inner.trim()) {
					const el = ref.cloneNode(false) as Element;
					parseInto(el, inner, refs, doc, used);
					parent.appendChild(el);
				}
				used.add(n);
				i = close + m[0].length;
				continue;
			}
		}
		buf += c;
		i++;
	}
	flush();
}

/** Index of the closing mark, skipping escapes (and, for *, a ** pair). -1 when unclosed. */
function findClose(s: string, from: number, mark: string): number {
	for (let i = from; i < s.length; i++) {
		if (s[i] === '\\') {
			i++;
			continue;
		}
		if (s[i] === '\n' && s[i + 1] === '\n') return -1;
		if (mark === '*' && s.startsWith('**', i)) {
			const end = findClose(s, i + 2, '**');
			if (end < 0) return -1;
			i = end + 1;
			continue;
		}
		if (mark === '**' && s[i] === '*' && s[i + 1] !== '*') {
			const end = findClose(s, i + 1, '*');
			if (end > 0) {
				i = end;
				continue;
			}
		}
		if (s.startsWith(mark, i)) return i;
	}
	return -1;
}

/** Index of the ] that closes a [ (nested brackets allowed). -1 when unclosed. */
function findBracket(s: string, from: number): number {
	let depth = 0;
	for (let i = from; i < s.length; i++) {
		if (s[i] === '\\') {
			i++;
			continue;
		}
		if (s[i] === '[') depth++;
		else if (s[i] === ']') {
			if (depth === 0) return i;
			depth--;
		}
	}
	return -1;
}
