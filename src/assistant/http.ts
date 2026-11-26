/**
 * An assistant that sends work to a server of your own, which runs
 * whatever model it likes. One URL takes every job as a JSON POST:
 *
 *   { "task": "describe-image", "lang": "en-GB", "src": "https://…/photo.jpg", "image": "data:image/jpeg;base64,…" }
 *   { "task": "rewrite", "action": "shorten", "instruction": "Make the text shorter…", "format": "marked", "lang": "en-GB", "text": "…" }
 *   { "task": "chat", "lang": "en-GB", "context": "Page outline: …", "tools": [...], "messages": [...] }
 *
 * `image` is sent when the editor can read the file (same origin, or a
 * data/blob URL) and it is under 8 MB; otherwise the server fetches `src`.
 *
 * The reply is JSON { "text": "…" }, or plain text, which may be streamed
 * (chunked) so words appear as they are written. A chat reply is JSON
 * { "text": "…", "calls": [{ "name": "add_row", "arguments": { … } }] }.
 * Chat is offered only with `chat: true` (and the editor's assistantChat).
 *
 * With `html: true` a rewrite's text is a paragraph's HTML ("format": "html")
 * and the reply should be HTML too, which the editor sanitises. Otherwise the
 * text carries Markdown-style marks (**bold**, [words](1)) for its formatting.
 */
import type { AssistantProvider } from '../types';

export interface HttpAssistantOptions {
	url: string;
	/**
	 * Extra headers, e.g. a CSRF token or Authorization. A function is called
	 * before every request, so it can hand over a fresh (or refreshed) token.
	 */
	headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>);
	/** Fetch credentials mode. Default 'same-origin'. */
	credentials?: RequestCredentials;
	/** Shown with suggestions. Default "the server". */
	name?: string;
	/** The server can chat (handles task "chat"). Default false. */
	chat?: boolean;
	/** Rewrites send and expect HTML (a capable model). Default false: Markdown-style marks. */
	html?: boolean;
}

function toDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const r = new FileReader();
		r.onload = () => resolve(String(r.result));
		r.onerror = () => reject(r.error);
		r.readAsDataURL(blob);
	});
}

const headersOf = async (o: HttpAssistantOptions) => (typeof o.headers === 'function' ? await o.headers() : o.headers ?? {});

async function post(o: HttpAssistantOptions, body: object, signal: AbortSignal, onToken?: (t: string) => void): Promise<string> {
	const res = await fetch(o.url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/plain', ...(await headersOf(o)) },
		credentials: o.credentials ?? 'same-origin',
		body: JSON.stringify(body),
		signal,
	});
	if (!res.ok) {
		let msg = `${res.status} ${res.statusText}`;
		try {
			const j = await res.json();
			if (j?.error) msg = String(j.error);
		} catch {
			/* not JSON */
		}
		throw new Error(msg);
	}
	if ((res.headers.get('Content-Type') ?? '').includes('json')) {
		const j = await res.json();
		return String(j?.text ?? '');
	}
	// Plain text, read as it arrives
	if (!res.body) return res.text();
	const reader = res.body.getReader();
	const dec = new TextDecoder();
	let text = '';
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		const chunk = dec.decode(value, { stream: true });
		text += chunk;
		onToken?.(chunk);
	}
	return text;
}

export function httpAssistant(o: HttpAssistantOptions): AssistantProvider {
	return {
		name: o.name ?? 'the server',
		html: !!o.html,
		async describeImage({ src, image, lang, signal }) {
			const body: Record<string, string> = { task: 'describe-image', lang, src };
			if (image && image.size < 8 * 1024 * 1024) body.image = await toDataUrl(image);
			return post(o, body, signal);
		},
		rewrite({ text, task, instruction, format, lang, signal, onToken }) {
			return post(o, { task: 'rewrite', action: task, instruction, format, lang, text }, signal, onToken);
		},
		...(o.chat
			? {
					async chat({ messages, tools, context, lang, signal }) {
						const res = await fetch(o.url, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(await headersOf(o)) },
							credentials: o.credentials ?? 'same-origin',
							body: JSON.stringify({ task: 'chat', lang, context, tools, messages }),
							signal,
						});
						if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
						const j = await res.json();
						return { text: String(j?.text ?? ''), calls: Array.isArray(j?.calls) ? j.calls : [] };
					},
				}
			: {}),
	};
}
