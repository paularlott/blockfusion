/**
 * Read aloud: the browser speaks the selected text, or the column being
 * edited, highlighting each word as it goes. Press Read aloud again, or
 * Escape, to stop. It uses the browser's own speech (speechSynthesis), so
 * nothing is downloaded and nothing leaves the device with most voices.
 *
 * Text is spoken a sentence or so at a time: some browsers cut a long
 * utterance off part way.
 */
import type { Editor } from '../editor';
import type { Plugin, ReadAloudOptions } from '../types';
import { speechLocale } from './dictation';

interface Segment {
	node: Text;
	/** Where this node's text starts in the joined text. */
	start: number;
}

/** The text of a range and where each piece of it lives, so spoken words can be found again. */
function collect(range: Range): { text: string; segments: Segment[] } {
	const root = range.commonAncestorContainer;
	const doc = (root.ownerDocument ?? root) as Document;
	const walker = doc.createTreeWalker(root.nodeType === 3 ? root.parentNode! : root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
	let text = '';
	const segments: Segment[] = [];
	const BLOCK = /^(P|H[1-6]|LI|DIV|BLOCKQUOTE|PRE|TD|TH|TR|BR|DT|DD|FIGCAPTION)$/;
	for (let n = walker.nextNode(); n; n = walker.nextNode()) {
		if (!range.intersectsNode(n)) continue;
		if (n.nodeType === 1) {
			const el = n as Element;
			if (el.classList.contains('bf-dictation')) continue;
			// A pause between blocks, so a heading doesn't run into the next line
			if (BLOCK.test(el.tagName) && text.trim()) text = text.replace(/\s*$/, '') + (/[.!?:;,]$/.test(text.trim()) ? ' ' : '. ');
			if (el.tagName === 'IMG' && (el as HTMLImageElement).alt) text += ` ${(el as HTMLImageElement).alt}. `;
			continue;
		}
		const t = n as Text;
		let value = t.data;
		let from = 0;
		if (t === range.startContainer) from = range.startOffset;
		const to = t === range.endContainer ? range.endOffset : value.length;
		value = value.slice(from, to);
		if (!value) continue;
		segments.push({ node: t, start: text.length - from });
		text += value;
	}
	return { text, segments };
}

/** Split text into chunks of a sentence or two, keeping their offsets. */
function chunks(text: string): Array<{ text: string; at: number }> {
	const out: Array<{ text: string; at: number }> = [];
	const re = /[^.!?\n]+[.!?]*\s*/g;
	let cur = '';
	let at = 0;
	for (let m = re.exec(text); m; m = re.exec(text)) {
		if (!cur) at = m.index;
		cur += m[0];
		if (cur.length > 120) {
			out.push({ text: cur, at });
			cur = '';
		}
	}
	if (cur.trim()) out.push({ text: cur, at });
	return out;
}

/** Pick a voice for the language: the configured one, the exact locale, then the language. */
function pickVoice(lang: string, wanted?: string): SpeechSynthesisVoice | null {
	const voices = speechSynthesis.getVoices();
	if (wanted) {
		const v = voices.find((x) => x.name === wanted);
		if (v) return v;
	}
	const loc = lang.toLowerCase();
	return (
		voices.find((v) => v.lang.toLowerCase() === loc && v.localService) ??
		voices.find((v) => v.lang.toLowerCase() === loc) ??
		voices.find((v) => v.lang.toLowerCase().startsWith(loc.split('-')[0])) ??
		null
	);
}

class Reader {
	private speaking = false;
	private highlightName = 'bf-reading';

	constructor(
		private editor: Editor,
		private opts: ReadAloudOptions,
	) {}

	get active(): boolean {
		return this.speaking;
	}

	start(): void {
		const ed = this.editor;
		ed.clearNotices('read-aloud');
		const range = this.target();
		if (!range) {
			ed.notify('Select some text, or put the cursor in a text column, to have it read aloud.', 'info', { key: 'read-aloud' });
			return;
		}
		const { text, segments } = collect(range);
		if (!text.trim()) {
			ed.notify('There is no text here to read.', 'info', { key: 'read-aloud' });
			return;
		}
		const lang = speechLocale(ed.canvas.doc.documentElement.lang || document.documentElement.lang || '');
		const voice = pickVoice(lang, this.opts.voice);
		speechSynthesis.cancel();
		this.speaking = true;
		ed.toolbar.update();
		try {
			this.speak(text, segments, lang, voice);
		} catch (err) {
			this.stop(false);
			ed.notify(`Read aloud couldn't start (${(err as Error).message}).`, 'error', { key: 'read-aloud' });
			return;
		}
		ed.announce('Reading aloud');
	}

	private speak(text: string, segments: Segment[], lang: string, voice: SpeechSynthesisVoice | null): void {
		const ed = this.editor;
		const parts = chunks(text);
		parts.forEach((part, i) => {
			const u = new SpeechSynthesisUtterance(part.text);
			u.lang = voice?.lang ?? lang;
			if (voice) u.voice = voice;
			u.rate = this.opts.rate ?? 1;
			u.onboundary = (e) => {
				if (e.name && e.name !== 'word') return;
				const from = part.at + e.charIndex;
				const len = e.charLength || (/^\S+/.exec(part.text.slice(e.charIndex))?.[0].length ?? 0);
				this.highlight(segments, from, from + len);
			};
			u.onerror = (e) => {
				if (e.error === 'interrupted' || e.error === 'canceled') return;
				this.stop();
				ed.notify(`Read aloud stopped (${e.error}).`, 'error', { key: 'read-aloud' });
			};
			if (i === parts.length - 1) u.onend = () => this.stop(false);
			speechSynthesis.speak(u);
		});
	}

	stop(announce = true): void {
		if (!this.speaking) return;
		this.speaking = false;
		speechSynthesis.cancel();
		this.clearHighlight();
		if (announce) this.editor.announce('Stopped reading');
		this.editor.toolbar.update();
	}

	/** The selection when there is one, else the whole column the caret is in. */
	private target(): Range | null {
		const ed = this.editor;
		const r = ed.canvas.range;
		if (r && !r.collapsed) return r.cloneRange();
		const colId = ed.canvas.selectionCol ?? ed.activeCol;
		const content = colId ? ed.canvas.content(colId) : null;
		if (!content) return null;
		const all = ed.canvas.doc.createRange();
		all.selectNodeContents(content);
		return all;
	}

	/** Mark the word being spoken (CSS Custom Highlight API, where the browser has it). */
	private highlight(segments: Segment[], from: number, to: number): void {
		const win = this.editor.canvas.doc.defaultView as (Window & { Highlight?: typeof Highlight; CSS: typeof CSS }) | null;
		if (!win?.Highlight || !win.CSS?.highlights) return;
		const seg = [...segments].reverse().find((s) => s.start <= from);
		if (!seg) return;
		const start = from - seg.start;
		const end = Math.min(seg.node.data.length, to - seg.start);
		if (start < 0 || start >= end) return;
		const r = this.editor.canvas.doc.createRange();
		r.setStart(seg.node, start);
		r.setEnd(seg.node, end);
		win.CSS.highlights.set(this.highlightName, new win.Highlight(r));
		const el = seg.node.parentElement;
		const box = r.getBoundingClientRect();
		if (el && (box.top < 0 || box.bottom > win.innerHeight)) el.scrollIntoView({ block: 'center' });
	}

	private clearHighlight(): void {
		const win = this.editor.canvas.doc?.defaultView as (Window & { CSS: typeof CSS }) | null;
		win?.CSS?.highlights?.delete(this.highlightName);
	}
}

export const readAloudPlugin = (opts: { readAloud?: boolean | ReadAloudOptions }): Plugin => ({
	id: 'readAloud',
	install(editor) {
		// Off unless the host turns it on, and only where the browser can speak
		if (!opts.readAloud || typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') return;
		const reader = new Reader(editor, opts.readAloud === true ? {} : opts.readAloud);
		editor.registerCommand({
			id: 'readAloud',
			label: 'Read aloud',
			icon: 'speaker',
			shortcut: 'Mod+Alt+R',
			isActive: () => reader.active,
			run: () => (reader.active ? reader.stop() : reader.start()),
		});
		editor.addToolbarItem({ type: 'button', id: 'readAloud', command: 'readAloud', toggle: true }, { after: editor.commands.has('dictate') ? 'dictate' : 'image' });
		// Voices load late in some browsers; asking early wakes them up
		speechSynthesis.getVoices();
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && reader.active) {
				e.preventDefault();
				e.stopImmediatePropagation();
				reader.stop();
			}
		};
		let doc: Document | null = null;
		const offReady = editor.on('ready', () => {
			doc = editor.canvas.doc;
			doc.addEventListener('keydown', onKey, true);
		});
		editor.root.addEventListener('keydown', onKey, true);
		return () => {
			offReady();
			reader.stop(false);
			doc?.removeEventListener('keydown', onKey, true);
			editor.root.removeEventListener('keydown', onKey, true);
		};
	},
});
