/**
 * The Assistant: a chat panel that can change the page (when the provider
 * can chat), and quick actions to improve, correct, shorten or simplify the selected
 * text, or the paragraph the cursor is in. The suggestion is shown first
 * (streamed as it's written), and replaces the text only when accepted, as
 * one undoable step. Image descriptions are in the image dialog.
 *
 * Only plain text goes to the assistant and comes back, so inline
 * formatting inside the replaced text (bold, links) is not kept.
 */
import type { Editor } from '../editor';
import { addAssistantStyles } from '../assistant/styles';
import { PAGE_TOOLS, callKey, pageContext, runPageTool } from '../assistant/tools';
import type { AssistantAction, AssistantMessage, ImageDialogHook, MenuItem, Plugin } from '../types';
import { openDialog } from '../ui/dialog';
import { h, nextId } from '../ui/dom';
import { CentredPopover } from '../ui/popover';

/** The one-shot actions offered when the host doesn't give its own. */
export const DEFAULT_ASSISTANT_ACTIONS: AssistantAction[] = [
	{ id: 'improve', label: 'Improve writing', prompt: 'Rewrite the text to read more clearly and naturally. Keep the meaning, facts, names and language.' },
	{ id: 'fix', label: 'Fix spelling and grammar', prompt: "Rewrite the text with every spelling, grammar and punctuation mistake corrected, including verb forms (we has → we have) and confused words (then/than, to/too, their/they're). Keep the wording otherwise the same." },
	{ id: 'shorten', label: 'Make shorter', prompt: 'Make the text shorter and more direct. Keep the key points, facts and language.' },
	{ id: 'simplify', label: 'Use simpler words', prompt: 'Rewrite the text in plain, simple words that are easy to read. Keep the meaning and language.' },
];

const actionsOf = (editor: Editor) => editor.options.assistantActions ?? DEFAULT_ASSISTANT_ACTIONS;

const BLOCKS = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, td, th, figcaption';

/**
 * The selection, else the block the caret is in (then `block` is set, so the
 * result can go into that element and keep its tag and attributes).
 */
function targetRange(editor: Editor): { range: Range; block: HTMLElement | null } | null {
	const r = editor.canvas.range;
	if (!r) return null;
	if (!r.collapsed) return { range: r.cloneRange(), block: null };
	const node = r.startContainer.nodeType === 1 ? (r.startContainer as Element) : r.startContainer.parentElement;
	const block = node?.closest<HTMLElement>(BLOCKS);
	const content = node?.closest('[data-bf-content]');
	if (!block || !content?.contains(block)) return null;
	const all = editor.canvas.doc.createRange();
	all.selectNodeContents(block);
	return { range: all, block };
}

async function rewriteFlow(editor: Editor, action: AssistantAction): Promise<void> {
	const label = action.label;
	const provider = editor.assistant;
	if (!provider?.rewrite) return;
	const target = targetRange(editor);
	const range = target?.range;
	const original = range?.toString().trim() ?? '';
	if (!target || !range || !original) {
		editor.notify('Select some text, or put the cursor in a paragraph, first.', 'info', { key: 'assistant' });
		return;
	}
	// Show what will be replaced
	const d = editor.canvas.doc;
	const sel = d.getSelection()!;
	sel.removeAllRanges();
	sel.addRange(range);

	const abort = new AbortController();
	let result = '';
	let done = false;
	const status = h('p', { className: 'bf-hint', role: 'status' }, 'Starting…');
	// The suggestion streams in read-only, then the author can edit it before replacing
	const outputId = nextId('bf-suggest');
	const output = h('textarea', { id: outputId, className: 'bf-input bf-assistant-output', rows: '6', readonly: true, 'aria-busy': 'true', spellcheck: 'true' }) as HTMLTextAreaElement;
	const outputField = h('div', { className: 'bf-field' }, h('label', { for: outputId, className: 'bf-label' }, 'Suggestion'), output);
	const before = h('details', { className: 'bf-assistant-original' }, h('summary', {}, 'Original text'), h('p', {}, original));
	let replaceBtn: HTMLButtonElement | null = null;

	const dialog = openDialog(editor.root, {
		title: label,
		body: [status, outputField, before],
		wide: true,
		submitLabel: 'Replace text',
		onReady: () => {
			replaceBtn = editor.root.querySelector<HTMLButtonElement>('dialog[open] button[type="submit"]');
			if (replaceBtn) replaceBtn.disabled = true;
		},
		onSubmit: () => {
			// What's in the box, as the author left it
			result = output.value.trim();
			if (!done || !result) return false;
		},
	});

	const lang = editor.canvas.doc.documentElement.lang || document.documentElement.lang || 'en';
	provider
		.rewrite({
			text: original,
			task: action.id,
			instruction: action.prompt,
			lang,
			signal: abort.signal,
			onToken: (t) => {
				result += t;
				output.value = result;
				status.textContent = 'Writing…';
			},
			onProgress: (p) => {
				status.textContent = p.progress !== undefined ? `${p.text} (${Math.round(p.progress * 100)}%)` : p.text;
			},
		})
		.then((text) => {
			result = text.trim();
			output.value = result;
			output.setAttribute('aria-busy', 'false');
			done = true;
			if (!result) {
				status.textContent = 'No suggestion came back.';
				return;
			}
			output.readOnly = false;
			status.textContent = `Suggested by ${provider.name ?? 'the assistant'}. Check it, edit it if you like, then replace your text.`;
			if (replaceBtn) replaceBtn.disabled = false;
			output.focus();
			editor.announce('Suggestion ready to check and edit');
		})
		.catch((err: Error) => {
			if (err.name === 'AbortError') return;
			output.setAttribute('aria-busy', 'false');
			status.textContent = `The assistant couldn't help: ${err.message}`;
		});

	const ok = await dialog;
	abort.abort();
	if (!ok || !done || !result) return;
	const paras = result.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
	// Change the DOM directly rather than through the browser's editing
	// commands, which can take the paragraph element away with its contents.
	editor.runText(label, (doc) => {
		const block = target.block;
		if (block?.isConnected) {
			// The whole paragraph: its element stays (tag, class, attributes); extra
			// paragraphs follow it (list items in a list)
			block.textContent = paras[0] ?? '';
			let after: Element = block;
			for (const p of paras.slice(1)) {
				const next = doc.createElement(block.tagName === 'LI' ? 'li' : 'p');
				next.textContent = p;
				after.after(next);
				after = next;
			}
			const r = doc.createRange();
			r.selectNodeContents(after);
			r.collapse(false);
			doc.getSelection()!.removeAllRanges();
			doc.getSelection()!.addRange(r);
			return;
		}
		// Part of a paragraph: swap just the selected text
		const node = doc.createTextNode(paras.join(' '));
		range.deleteContents();
		range.insertNode(node);
		const r = doc.createRange();
		r.setStartAfter(node);
		r.collapse(true);
		doc.getSelection()!.removeAllRanges();
		doc.getSelection()!.addRange(r);
	});
	editor.announce('Text replaced. Undo with Control or Command Z.');
}

/** The image file, when the browser lets the editor read it (same origin, data: or blob:). */
async function readImage(src: string): Promise<Blob | null> {
	try {
		const res = await fetch(new URL(src, document.baseURI).href, { credentials: 'same-origin' });
		return res.ok ? await res.blob() : null;
	} catch {
		return null;
	}
}

/** Suggest a description, in the image dialog: fills the alt text for the author to check. */
const describeHook: ImageDialogHook = ({ editor, src, alt, setDescribed }) => {
	const provider = editor.assistant;
	if (!provider?.describeImage) return;
	let abort: AbortController | null = null;
	const status = h('p', { className: 'bf-hint', role: 'status', 'aria-live': 'polite' });
	const suggest = h('button', { type: 'button', className: 'bf-btn' }, 'Suggest a description');
	suggest.addEventListener('click', async () => {
		if (!src.value.trim()) {
			status.textContent = 'Add the image address first.';
			return;
		}
		abort?.abort();
		abort = new AbortController();
		suggest.disabled = true;
		status.textContent = 'Looking at the image…';
		try {
			const text = await provider.describeImage!({
				src: new URL(src.value.trim(), document.baseURI).href,
				image: await readImage(src.value.trim()),
				lang: editor.canvas.doc.documentElement.lang || document.documentElement.lang || 'en',
				signal: abort.signal,
				onProgress: (p) => {
					status.textContent = p.progress !== undefined ? `${p.text} (${Math.round(p.progress * 100)}%)` : p.text;
				},
			});
			const clean = text.trim().replace(/^["“]|["”]$/g, '');
			if (clean) {
				alt.value = clean;
				setDescribed();
				status.textContent = `Suggested by ${provider.name ?? 'the assistant'}. Check it describes the image for this page, and edit it if not.`;
				alt.focus();
				alt.select();
			} else status.textContent = 'No description came back.';
		} catch (err) {
			if ((err as Error).name !== 'AbortError') status.textContent = `Couldn't describe the image: ${(err as Error).message}`;
		} finally {
			suggest.disabled = false;
		}
	});
	return {
		field: h('div', { className: 'bf-field' }, h('div', { className: 'bf-row-buttons' }, suggest), status),
		start: () => suggest.click(),
		close: () => abort?.abort(),
	};
};

/** How many rounds of actions one request may take, so a confused model can't run on. */
const MAX_ROUNDS = 6;

/** The chat: a conversation that can change the page through PAGE_TOOLS. */
function chatPanel(editor: Editor, close?: () => void) {
	const provider = editor.assistant!;
	const history: AssistantMessage[] = [];
	let busy: AbortController | null = null;
	let changes = 0;
	editor.on('change', () => changes++);

	return {
		id: 'assistant',
		title: 'Assistant',
		render(container: HTMLElement, ed: Editor) {
			const intro = h('p', { className: 'bf-hint' }, `Ask for changes or help with this page. Answers come from ${provider.name ?? 'the assistant'} and can be wrong; every change can be undone.`);
			const log = h('div', { className: 'bf-chat-log', role: 'log', 'aria-live': 'polite', 'aria-label': 'Conversation', tabindex: '0' });
			const status = h('p', { className: 'bf-hint bf-chat-status', role: 'status' });
			const inputId = nextId('bf-chat-in');
			const input = h('textarea', { id: inputId, className: 'bf-input bf-chat-input', rows: '3', placeholder: 'e.g. Add a row with 3 columns', autocomplete: 'off' }) as HTMLTextAreaElement;
			const send = h('button', { type: 'submit', className: 'bf-btn bf-btn-primary' }, 'Send');
			const stop = h('button', { type: 'button', className: 'bf-btn', hidden: true }, 'Stop');
			const closeBtn = close ? h('button', { type: 'button', className: 'bf-btn' }, 'Close') : null;
			closeBtn?.addEventListener('click', () => close!());
			const form = h(
				'form',
				{ className: 'bf-chat-form' },
				h('label', { for: inputId, className: 'bf-label' }, 'Ask the assistant'),
				input,
				// Close on the left, Send (or Stop) on the right
				h('div', { className: 'bf-chat-buttons' }, closeBtn, h('span', { className: 'bf-chat-actions' }, stop, send)),
			);
			container.append(intro, log, status, form);

			/** Add to the conversation and bring it into view in the log. */
			const show = (el: HTMLElement) => {
				log.append(el);
				// Only the log scrolls: scrollIntoView would scroll the page behind too
				const reveal = () => {
					log.scrollTop = log.scrollHeight;
				};
				reveal();
				// Again once the layout settles (the status line changing below can move things)
				requestAnimationFrame(reveal);
				return el;
			};
			const bubble = (role: 'user' | 'assistant' | 'note', text: string) =>
				show(h('div', { className: `bf-chat-msg bf-chat-${role}` }, h('span', { className: 'bf-sr-only' }, role === 'user' ? 'You: ' : role === 'assistant' ? 'Assistant: ' : ''), text));

			input.addEventListener('keydown', (e) => {
				// Enter sends; Shift+Enter is a new line
				if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
					e.preventDefault();
					form.requestSubmit();
				}
			});
			stop.addEventListener('click', () => busy?.abort());

			form.addEventListener('submit', async (e) => {
				e.preventDefault();
				const text = input.value.trim();
				if (!text || busy) return;
				input.value = '';
				bubble('user', text);
				history.push({ role: 'user', content: text });
				busy = new AbortController();
				send.hidden = true;
				stop.hidden = false;
				status.textContent = 'Thinking…';
				const startChanges = changes;
				let actions = 0;
				let reply: HTMLElement | null = null;
				// A model repeating itself has lost track: stop rather than run on
				const seen = new Set<string>();
				try {
					for (let round = 0; round < MAX_ROUNDS; round++) {
						let streamed = '';
						reply = null;
						const res = await provider.chat!({
							messages: history,
							tools: PAGE_TOOLS,
							context: pageContext(ed),
							lang: ed.canvas.doc.documentElement.lang || document.documentElement.lang || 'en',
							signal: busy.signal,
							onToken: (t) => {
								streamed += t;
								// Show prose as it comes; action calls are shown as notes once run
								if (!/<tool_call>|^\s*\{/.test(streamed)) {
									reply ??= bubble('assistant', '');
									reply.lastChild!.textContent = streamed;
									// Keep a growing reply in view
									log.scrollTop = log.scrollHeight;
								}
							},
							onProgress: (p) => {
								status.textContent = p.progress !== undefined ? `${p.text} (${Math.round(p.progress * 100)}%)` : p.text;
							},
						});
						// Each distinct action once: small models sometimes repeat a call within a reply too
						const fresh = res.calls.filter((c) => {
							const key = callKey(c);
							if (seen.has(key)) return false;
							seen.add(key);
							return true;
						});
						const repeated = fresh.length < res.calls.length;
						history.push({ role: 'assistant', content: res.text, calls: fresh });
						if (!fresh.length) {
							// The editor's own follow-up text echoed back means the model is done
							// Leftover call markup (a made-up "done" action, say) isn't for the reader
							let said = res.text.replace(/<tool_call>[\s\S]*?(<\/tool_call>|$)/g, '').trim().replace(/^DONE\.?$/i, '');
							if (repeated || /my request was|make the (next )?tool call|reply DONE/i.test(said)) said = '';
							if (reply) (reply as HTMLElement).lastChild!.textContent = said || 'Done.';
							else if (said || !actions) bubble('assistant', said || 'Done.');
							break;
						}
						if (reply) (reply as HTMLElement).remove();
						const reports: string[] = [];
						for (const call of fresh) {
							const r = runPageTool(ed, call);
							actions += r.ok ? 1 : 0;
							reports.push(r.report);
							bubble('note', r.report);
						}
						history.push({ role: 'tool', content: reports.join(' ') });
						status.textContent = 'Working…';
					}
				} catch (err) {
					if ((err as Error).name === 'AbortError') bubble('note', 'Stopped.');
					else bubble('note', `The assistant couldn't help: ${(err as Error).message}`);
				} finally {
					busy = null;
					send.hidden = false;
					stop.hidden = true;
					status.textContent = '';
				}
				if (actions) {
					const made = changes - startChanges;
					const undo = h('button', { type: 'button', className: 'bf-btn bf-btn-sm' }, actions === 1 ? 'Undo this change' : `Undo these ${actions} changes`);
					const at = changes;
					undo.addEventListener('click', () => {
						// Only while nothing else has changed since
						if (changes !== at) {
							ed.notify('The page has changed since; use Undo in the toolbar instead.', 'info', { key: 'assistant' });
							return;
						}
						for (let i = 0; i < made; i++) ed.undo();
						undo.disabled = true;
						undo.textContent = 'Undone';
					});
					show(h('div', { className: 'bf-chat-msg bf-chat-note' }, undo));
				}
				ed.announce('Assistant finished');
				input.focus();
			});
		},
	};
}

/**
 * The chat in a popover centred under the toolbar, like the block menu. The
 * conversation (and a request still running) carries on while it's closed.
 */
function chatPopover(editor: Editor) {
	const panel = chatPanel(editor, () => pop.close(true));
	let built = false;
	const pop: CentredPopover = new CentredPopover(editor, {
		title: 'Assistant',
		className: 'bf-chatpop',
		// Changes the assistant makes can move focus into the page: stay open
		closeOnFocusOut: false,
		onClose: () => editor.toolbar.update(),
	});
	return {
		get isOpen() {
			return pop.isOpen;
		},
		toggle(ed: Editor) {
			if (pop.isOpen) return pop.close(true);
			if (!built) {
				panel.render(pop.body, ed);
				built = true;
			}
			const opener = ed.root.querySelector<HTMLElement>('.bf-toolbar [data-id="assistant"]') ?? (document.activeElement as HTMLElement | null);
			pop.open(opener);
			(pop.body.querySelector('.bf-chat-input') as HTMLElement | null)?.focus();
			ed.toolbar.update();
		},
		destroy() {
			pop.close(false);
			pop.el.remove();
		},
	};
}

export const assistantPlugin: Plugin = {
	id: 'assistant',
	install(editor) {
		const p = editor.assistant;
		const chat = !!(p?.chat && editor.options.assistantChat);
		const actions = p?.rewrite ? actionsOf(editor) : [];
		const describe = !!p?.describeImage;
		if (!p || (!chat && !actions.length && !describe)) return;
		addAssistantStyles();
		const chatPop = chat ? chatPopover(editor) : null;
		if (describe) editor.imageDialogHooks.push(describeHook);
		const inText = (ed: Editor) => !!ed.canvas.selectionCol;
		const image = (ed: Editor) => (ed.selectedImage?.isConnected ? ed.selectedImage : null);
		// The one-shot actions and describing an image, in a menu
		const menuItems = (ed: Editor) => {
			const items: MenuItem[] = [];
			for (const a of actions) items.push({ label: a.label, disabled: !inText(ed), run: () => void rewriteFlow(ed, a) });
			if (describe) {
				if (actions.length) items.push({ label: '', separator: true });
				items.push({
					label: 'Describe the selected image…',
					disabled: !image(ed),
					run: () => void ed.exec('image', { suggest: true }),
				});
			}
			return items;
		};
		// At the end of the toolbar, before Help. Built-in buttons may be added
		// after this plugin installs, so place it once the editor is ready.
		const addItem = (item: Parameters<Editor['addToolbarItem']>[0]) => {
			const put = () => editor.addToolbarItem(item, editor.commands.has('help') ? { before: 'help' } : undefined);
			if (editor.isReady) put();
			else editor.on('ready', put);
		};
		if (chatPop) {
			// Chat (and a shortcut straight to it): the button opens it, and the
			// arrow beside it the actions, when there are any
			editor.registerCommand({
				id: 'assistantChat',
				label: 'Assistant chat',
				icon: 'sparkle',
				chord: 'a',
				run: (ed) => chatPop.toggle(ed),
				isActive: () => chatPop.isOpen,
			});
			if (actions.length || describe) {
				addItem({ type: 'split', id: 'assistant', command: 'assistantChat', label: 'Assistant chat', icon: 'sparkle', menuLabel: 'Assistant actions', items: menuItems });
			} else {
				addItem({ type: 'button', id: 'assistant', command: 'assistantChat', toggle: true });
			}
			return () => chatPop.destroy();
		}
		// No chat: the button is just the menu of actions
		addItem({ type: 'menu', id: 'assistant', label: 'Assistant', icon: 'sparkle', items: menuItems });
	},
};
