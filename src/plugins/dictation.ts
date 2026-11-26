/**
 * Dictation: speak into the column being edited. Put the caret in a text
 * column (or select text to replace), press Dictate and talk. Words appear
 * as they are heard (in grey, still changing) and settle into the text.
 * Press Dictate again, or Escape, to stop.
 *
 * Settled text goes in with the browser's insertText, so it is ordinary
 * typing: one undo step per pause, merged like typing. The grey interim text
 * is an editor-only marker that never reaches the saved content.
 *
 * Spoken commands: "new line", "new paragraph", and "delete last" (or
 * "scratch that") to remove the last phrase or break dictated.
 */
import type { Editor } from '../editor';
import type { DictationProvider, DictationSession, Plugin } from '../types';

type RecognitionLike = {
	lang: string;
	continuous: boolean;
	interimResults: boolean;
	start(): void;
	stop(): void;
	abort(): void;
	onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
	onerror: ((e: { error: string }) => void) | null;
	onend: (() => void) | null;
};
type RecognitionCtor = new () => RecognitionLike;

function recognitionCtor(): RecognitionCtor | null {
	const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
	return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ERRORS: Record<string, string> = {
	'not-allowed': 'Microphone access is blocked. Allow it in the browser to dictate.',
	'service-not-allowed': 'Speech recognition is not available in this browser.',
	'audio-capture': 'No microphone was found.',
	network: "This browser couldn't reach its speech recognition service. Some browsers have none they can use (Edge on macOS, Brave and other Chromium browsers); try Chrome or Safari.",
	'language-not-supported': 'Speech recognition does not support this language.',
};

/**
 * A full locale for speech recognition: "en" becomes the browser's own
 * English variant (en-GB, en-US, ...). Some services (Edge's) reject a bare
 * language code.
 */
export function speechLocale(lang: string): string {
	const want = (lang || navigator.language || 'en-US').trim();
	if (want.includes('-')) return want;
	const prefs = navigator.languages?.length ? navigator.languages : [navigator.language];
	return prefs.find((l) => l.toLowerCase().startsWith(want.toLowerCase() + '-')) ?? (want.toLowerCase() === 'en' ? 'en-US' : want);
}

/** The browser's speech recognition (Chrome, Edge, Safari), or null where it doesn't exist. */
export function webSpeechDictation(): DictationProvider | null {
	const Ctor = recognitionCtor();
	if (!Ctor) return null;
	return {
		name: 'browser speech recognition',
		start(h, opts) {
			let stopped = false;
			let heard = false;
			let quickEnds = 0;
			let startedAt = Date.now();
			// Continuous listening first; some browsers (Edge) only manage one
			// phrase at a time, so fall back to that, restarting after each.
			let continuous = true;
			let retried = false;
			const lang = speechLocale(opts.lang);
			let rec: RecognitionLike;
			// Words heard but not yet marked final. Safari often ends a session
			// without finalising them; they're kept rather than lost.
			let pending = '';
			const flush = () => {
				if (pending.trim()) h.onFinal(pending);
				pending = '';
				h.onInterim('');
			};

			const begin = () => {
				rec = new Ctor();
				rec.lang = lang;
				rec.continuous = continuous;
				rec.interimResults = true;
				let lastCount = 0;
				rec.onresult = (e) => {
					heard = true;
					let interim = '';
					let finals = 0;
					for (let i = e.resultIndex; i < e.results.length; i++) {
						const r = e.results[i];
						if (r.isFinal) {
							finals++;
							h.onFinal(r[0].transcript);
						} else interim += r[0].transcript;
					}
					// Safari can drop an utterance without ever finalising it: the
					// interim text goes empty, or the result list starts again. Keep
					// what was heard instead of letting it vanish.
					const restarted = e.results.length < lastCount;
					if (!finals && pending.trim() && (!interim.trim() || restarted)) h.onFinal(pending);
					lastCount = e.results.length;
					pending = interim;
					h.onInterim(interim);
				};
				rec.onerror = (e) => {
					console.warn('BlockFusion dictation:', e.error, { lang, continuous });
					if (e.error === 'no-speech' || e.error === 'aborted') return;
					if (e.error === 'network' && !heard && !retried) {
						// Try once more in single-phrase mode before giving up
						retried = true;
						continuous = false;
						rec.onend = null;
						try {
							rec.abort();
						} catch {
							/* already ended */
						}
						begin();
						return;
					}
					stopped = true;
					h.onError(ERRORS[e.error] ?? `Dictation stopped (${e.error}).`);
				};
				// Browsers end a session after a pause, a phrase or a minute; carry on
				// until stopped. A session that keeps ending at once, having heard
				// nothing, means the browser's recognition isn't working.
				rec.onend = () => {
					flush();
					if (stopped) return h.onEnd();
					quickEnds = !heard && Date.now() - startedAt < 1500 ? quickEnds + 1 : 0;
					if (quickEnds >= 3) {
						stopped = true;
						h.onError('Speech recognition stopped as soon as it started. This browser may not support it; try Chrome or Safari.');
						return h.onEnd();
					}
					try {
						startedAt = Date.now();
						rec.start();
					} catch {
						h.onEnd();
					}
				};
				startedAt = Date.now();
				try {
					rec.start();
				} catch (err) {
					stopped = true;
					queueMicrotask(() => h.onError(`Speech recognition could not start (${(err as Error).message}).`));
				}
			};
			begin();
			return {
				stop() {
					stopped = true;
					// Keep what was said up to now, final or not
					flush();
					rec.onresult = null;
					rec.stop();
				},
			};
		},
	};
}

/** The spoken commands, for help and documentation. */
export const DICTATION_COMMANDS: ReadonlyArray<{ say: string; does: string }> = [
	{ say: 'new line', does: 'A line break within the paragraph' },
	{ say: 'new paragraph', does: 'Start a new paragraph' },
	{ say: 'delete last (or scratch that)', does: 'Remove the last phrase, sentence or break dictated; say it again to keep going back' },
];

/** The dictation in progress for an editor. */
class Dictation {
	private session: DictationSession | null = null;
	private marker: HTMLElement | null = null;
	private colId: string | null = null;
	/** What this session put in, newest last, for "delete last". */
	private inserted: Array<{ kind: 'text'; text: string } | { kind: 'break' }> = [];

	constructor(
		private editor: Editor,
		private provider: DictationProvider,
	) {}

	get active(): boolean {
		return !!this.session;
	}

	start(): void {
		const ed = this.editor;
		// The microphone is only offered to secure pages: https://, or http://localhost
		// A new attempt: earlier dictation messages no longer apply
		ed.clearNotices('dictation');
		if (!window.isSecureContext) {
			ed.notify('Dictation needs a secure page: open the site over https:// (or http://localhost while developing).', 'error', { key: 'dictation' });
			return;
		}
		const colId = ed.canvas.restoreSelection();
		const range = ed.canvas.range;
		if (!colId || !range) {
			ed.notify('Put the cursor in a text column first, then start dictating.', 'info', { key: 'dictation' });
			return;
		}
		const d = ed.canvas.doc;
		// Selected text is replaced by what is said.
		if (!range.collapsed) d.execCommand('delete');
		const at = d.getSelection()!.getRangeAt(0);
		const marker = d.createElement('span');
		marker.className = 'bf-dictation';
		marker.setAttribute('contenteditable', 'false');
		marker.setAttribute('aria-hidden', 'true');
		at.insertNode(marker);
		this.marker = marker;
		this.colId = colId;
		this.inserted = [];
		this.session = this.provider.start(
			{
				onInterim: (t) => this.interim(t),
				onFinal: (t) => this.final(t),
				onError: (m) => {
					this.stop(false);
					ed.notify(m, 'error', { key: 'dictation' });
				},
				// Ended by itself (not by the user): say so
				onEnd: () => {
					if (!this.session) return;
					this.stop(false);
					ed.notify('Dictation stopped.', 'info', { key: 'dictation' });
				},
			},
			{ lang: ed.canvas.doc.documentElement.lang || document.documentElement.lang || 'en' },
		);
		ed.announce('Dictation on. Speak now; press Dictate or Escape to stop.');
		ed.toolbar.update();
	}

	stop(announce = true): void {
		if (!this.session && !this.marker) return;
		const s = this.session;
		this.session = null;
		s?.stop();
		const marker = this.marker;
		this.marker = null;
		if (marker?.isConnected) {
			// Leave the caret where dictation got to.
			const d = this.editor.canvas.doc;
			const r = d.createRange();
			r.setStartBefore(marker);
			r.collapse(true);
			marker.remove();
			const sel = d.getSelection()!;
			sel.removeAllRanges();
			sel.addRange(r);
		}
		if (announce) this.editor.announce('Dictation off');
		this.editor.toolbar.update();
	}

	/** Keep the marker; if the content was re-rendered (undo, a structure change) stop. */
	private alive(): boolean {
		if (this.marker?.isConnected) return true;
		this.stop(false);
		this.editor.notify('Dictation stopped because the text it was writing into changed.', 'info', { key: 'dictation' });
		return false;
	}

	private interim(text: string): void {
		// Late results after dictation was turned off are ignored
		if (!this.marker || !this.alive()) return;
		this.marker!.textContent = text.trim() ? this.spaced(text.trim()) : '';
	}

	private final(text: string): void {
		if (!this.marker || !this.alive() || !this.colId) return;
		const ed = this.editor;
		const d = ed.canvas.doc;
		const content = ed.canvas.content(this.colId);
		if (!content) return;
		const marker = this.marker!;
		marker.textContent = '';
		content.focus({ preventScroll: true });
		// Take the marker out while text goes in, so the browser's editing
		// behaves as it does for typing (a non-editable node next to the caret
		// makes it add extra line breaks); it goes back at the caret after.
		const sel = d.getSelection()!;
		const r = d.createRange();
		r.setStartBefore(marker);
		r.collapse(true);
		marker.remove();
		sel.removeAllRanges();
		sel.addRange(r);
		// Spoken commands (and line breaks some services write for them), then the
		// words between them. Services that punctuate ("New line.") leave a full
		// stop after a command; it's dropped.
		let afterCommand = false;
		for (const part of text.split(/(\bnew paragraph\b|\bnew line\b|\bdelete last\b|\bscratch that\b|\n+)/i)) {
			let p = afterCommand ? part.replace(/^\s*[.,;:!?]+/, '') : part;
			afterCommand = false;
			const word = p.trim() || p;
			if (/^(new paragraph|\n{2,})$/i.test(word)) {
				d.execCommand('insertParagraph');
				this.inserted.push({ kind: 'break' });
				afterCommand = true;
				continue;
			}
			if (/^(new line|\n)$/i.test(word)) {
				d.execCommand('insertLineBreak');
				this.inserted.push({ kind: 'break' });
				afterCommand = true;
				continue;
			}
			if (/^(delete last|scratch that)$/i.test(word)) {
				this.deleteLast(d);
				afterCommand = true;
				continue;
			}
			p = p.trim();
			if (!p) continue;
			const t = this.spaced(p, this.textBeforeCaret(d));
			d.execCommand('insertText', false, t);
			// Services that punctuate send several sentences at once: "delete
			// last" takes back one sentence at a time.
			for (const piece of t.match(/\s*[^.!?]+(?:[.!?]+|$)|\s*[.!?]+/g) ?? [t]) this.inserted.push({ kind: 'text', text: piece });
		}
		const at = sel.rangeCount ? sel.getRangeAt(0) : null;
		if (at && content.contains(at.startContainer)) {
			at.collapse(true);
			at.insertNode(marker);
			// Caret stays just before the marker
			const back = d.createRange();
			back.setStartBefore(marker);
			back.collapse(true);
			sel.removeAllRanges();
			sel.addRange(back);
		} else content.append(marker);
		marker.scrollIntoView({ block: 'nearest' });
	}

	/**
	 * Remove the last phrase or break this session dictated, if it's still
	 * just before the caret (not changed by typing since).
	 */
	private deleteLast(d: Document): void {
		const last = this.inserted.pop();
		if (!last) {
			this.editor.announce('Nothing dictated to delete');
			return;
		}
		if (last.kind === 'break') {
			d.execCommand('delete');
			this.editor.announce('Deleted the line break');
			return;
		}
		const sel = d.getSelection()!;
		const caret = sel.getRangeAt(0);
		let node: Node = caret.startContainer;
		let end = caret.startOffset;
		if (node.nodeType !== 3) {
			// Caret between nodes: use the text node just before it
			const prev = node.childNodes[end - 1];
			if (!prev || prev.nodeType !== 3) return this.cannotDelete(last.text);
			node = prev;
			end = prev.textContent!.length;
		}
		const before = node.textContent!.slice(0, end);
		if (!before.endsWith(last.text)) return this.cannotDelete(last.text);
		const r = d.createRange();
		r.setStart(node, end - last.text.length);
		r.setEnd(node, end);
		sel.removeAllRanges();
		sel.addRange(r);
		d.execCommand('delete');
		this.editor.announce(`Deleted: ${last.text.trim()}`);
	}

	private cannotDelete(text: string): void {
		this.inserted = [];
		this.editor.notify(`Couldn't delete "${text.trim()}": the text has changed since it was dictated.`, 'info', { key: 'dictation' });
	}

	/** A space before the words unless at the start of a line or before punctuation. */
	private spaced(text: string, before = this.textBefore(this.marker!)): string {
		if (!before || /\s$/.test(before) || /^[.,;:!?)]/.test(text)) return text;
		return ' ' + text;
	}

	/** The text just before the caret within its line. */
	private textBeforeCaret(d: Document): string {
		const sel = d.getSelection();
		if (!sel?.rangeCount) return '';
		const r = sel.getRangeAt(0);
		const c = r.startContainer;
		if (c.nodeType === 3) {
			const t = (c.textContent ?? '').slice(0, r.startOffset);
			return t || this.textBefore(c);
		}
		const child = c.childNodes[r.startOffset];
		if (child) return this.textBefore(child);
		const last = c.lastChild;
		return last ? (last.nodeName === 'BR' ? '' : (last.textContent ?? '')) : '';
	}

	/** The text just before a node within its block. */
	private textBefore(node: Node): string {
		let n: Node | null = node.previousSibling;
		while (n) {
			if (n.nodeName === 'BR') return '';
			const t = n.textContent ?? '';
			if (t) return t;
			n = n.previousSibling;
		}
		return '';
	}
}

export const dictationPlugin = (opts: { dictation?: DictationProvider | boolean }): Plugin => ({
	id: 'dictation',
	install(editor) {
		// Off unless the host turns it on
		if (!opts.dictation) return;
		const provider = opts.dictation === true ? webSpeechDictation() : opts.dictation;
		if (!provider) return;
		const dictation = new Dictation(editor, provider);
		editor.registerCommand({
			id: 'dictate',
			label: 'Dictate',
			icon: 'mic',
			chord: 'd',
			isActive: () => dictation.active,
			run: () => (dictation.active ? dictation.stop() : dictation.start()),
		});
		editor.addToolbarItem({ type: 'button', id: 'dictate', command: 'dictate', toggle: true }, { after: 'image' });
		// Escape stops dictation before it does anything else.
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && dictation.active) {
				e.preventDefault();
				e.stopImmediatePropagation();
				dictation.stop();
			}
		};
		// The canvas document exists once the editor is ready (plugins install first)
		let doc: Document | null = null;
		const offReady = editor.on('ready', () => {
			doc = editor.canvas.doc;
			doc.addEventListener('keydown', onKey, true);
		});
		editor.root.addEventListener('keydown', onKey, true);
		return () => {
			offReady();
			dictation.stop(false);
			doc?.removeEventListener('keydown', onKey, true);
			editor.root.removeEventListener('keydown', onKey, true);
		};
	},
});
