/**
 * completionsAssistant: an AssistantProvider that speaks the OpenAI chat
 * completions format, so the app's backend only has to relay requests to a
 * model server (adding its API key and model, and checking the user is
 * allowed). The prompts, tool calls and image handling live here.
 *
 * It works with anything that serves /v1/chat/completions: OpenAI, Ollama,
 * LM Studio, llama.cpp, vLLM, or a gateway in front of other providers.
 *
 *   BlockFusion.create(el, {
 *     assistant: BlockFusionAssistant.completionsAssistant({
 *       url: '/ai/chat/completions',
 *       headers: async () => ({ Authorization: `Bearer ${await getToken()}` }),
 *     }),
 *     assistantChat: true,
 *   });
 *
 * Or send the requests yourself (another transport, extra signing ...):
 *
 *   completionsAssistant({ send: (body, { signal }) => myApi.post('/ai', body, { signal }) })
 *
 * The reply may be streamed (text/event-stream) or plain JSON. examples/relay.mjs
 * is a small backend to start from. For models in the browser instead, see
 * the blockfusion-ai extension.
 */
import type { AssistantProvider, AssistantTool, AssistantToolCall } from '../types';

/** A chat completions request, as sent to the backend. */
export interface CompletionsRequest {
	/** Set when the options name a model; otherwise the backend chooses. */
	model?: string;
	messages: CompletionsMessage[];
	tools?: Array<{ type: 'function'; function: AssistantTool }>;
	stream?: boolean;
	temperature?: number;
	[extra: string]: unknown;
}

export type CompletionsContent = string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;

export interface CompletionsMessage {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content: CompletionsContent;
	tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
	tool_call_id?: string;
}

export interface CompletionsAssistantOptions {
	/** The backend endpoint that relays to the model server. */
	url?: string;
	/** Headers for `url`, or a function (sync or async) called before every request, for a fresh token. */
	headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>);
	/** Fetch credentials mode for `url`. Default 'same-origin'. */
	credentials?: RequestCredentials;
	/** Instead of `url`: send the request yourself and return the response. */
	send?(body: CompletionsRequest, init: { signal: AbortSignal }): Promise<Response>;
	/** Model names to put in requests. Leave out to let the backend choose. */
	model?: string;
	/** For describing images. Default `model`. */
	visionModel?: string;
	/** For the chat. Default `model`. */
	chatModel?: string;
	/** Extra fields for every request, e.g. { reasoning_effort: 'none' } to keep a thinking model quick. */
	body?: Record<string, unknown>;
	/** Rewrites send and take HTML (the editor sanitises the reply). Default true; false sends Markdown-style marks. */
	html?: boolean;
	/** Offer the chat (the model must support tool calls). Default true. */
	chat?: boolean;
	/**
	 * The model takes long prompts, so the chat sends the whole selection and
	 * the whole text of the cursor's column. Default true; false for a small
	 * model, which gets short previews.
	 */
	largeContext?: boolean;
	/** Describe images (the model must take images). Default true. */
	images?: boolean;
	/** Shown with suggestions. Default "the server". */
	name?: string;
}

function toDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const r = new FileReader();
		r.onload = () => resolve(String(r.result));
		r.onerror = () => reject(r.error);
		r.readAsDataURL(blob);
	});
}

export function completionsAssistant(o: CompletionsAssistantOptions): AssistantProvider {
	if (!o.url && !o.send) throw new Error('completionsAssistant needs a url or a send function');

	const request = async (body: CompletionsRequest, signal: AbortSignal): Promise<Response> => {
		const full = { ...o.body, ...body };
		const res = o.send
			? await o.send(full, { signal })
			: await fetch(o.url!, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Accept: 'text/event-stream, application/json',
						...(typeof o.headers === 'function' ? await o.headers() : o.headers),
					},
					credentials: o.credentials ?? 'same-origin',
					body: JSON.stringify(full),
					signal,
				});
		if (!res.ok) {
			let msg = `${res.status} ${res.statusText}`;
			try {
				const j = await res.json();
				const e = j?.error;
				if (e) msg = String(typeof e === 'object' ? e.message ?? JSON.stringify(e) : e);
			} catch {
				/* not JSON */
			}
			throw new Error(msg);
		}
		return res;
	};

	/**
	 * A backend that starts its response before the model answers (to keep a
	 * proxy from timing out) can only report a later failure in the body: an
	 * `error` in the JSON, or in an event.
	 */
	const failed = (j: { error?: unknown } | null | undefined): void => {
		const e = j?.error;
		if (!e) return;
		throw new Error(String(typeof e === 'object' ? ((e as { message?: string }).message ?? JSON.stringify(e)) : e));
	};

	/** The reply's text: streamed as it comes (event stream) or read whole (JSON). */
	const text = async (body: CompletionsRequest, signal: AbortSignal, onToken?: (t: string) => void): Promise<string> => {
		const res = await request({ ...body, stream: true }, signal);
		if (!(res.headers.get('Content-Type') ?? '').includes('event-stream') || !res.body) {
			const j = await res.json();
			failed(j);
			return String(j?.choices?.[0]?.message?.content ?? '');
		}
		const reader = res.body.getReader();
		const dec = new TextDecoder();
		let buf = '';
		let out = '';
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			buf += dec.decode(value, { stream: true });
			let nl;
			while ((nl = buf.indexOf('\n')) >= 0) {
				const line = buf.slice(0, nl).trim();
				buf = buf.slice(nl + 1);
				if (!line.startsWith('data:') || line === 'data: [DONE]') continue;
				let event: { error?: unknown; choices?: Array<{ delta?: { content?: string } }> } | undefined;
				try {
					event = JSON.parse(line.slice(5));
				} catch {
					/* a partial or foreign line */
				}
				failed(event);
				const delta = event?.choices?.[0]?.delta?.content;
				if (delta) {
					out += delta;
					onToken?.(delta);
				}
			}
		}
		return out;
	};

	const html = o.html ?? true;
	const provider: AssistantProvider = { name: o.name ?? 'the server', html, largeContext: o.largeContext ?? true };

	provider.rewrite = ({ text: input, instruction, format, lang, signal, onToken }) => {
		const reply =
			format === 'html'
				? 'Reply with only the rewritten HTML: no code fences, notes or quotes, and no tags or attributes that were not in the text.'
				: 'Reply with only the rewritten text, no notes or quotes.';
		return text(
			{
				...(o.model ? { model: o.model } : {}),
				temperature: 0.2,
				messages: [
					{ role: 'system', content: `You are a careful copy editor. ${instruction} The text is in the language "${lang}". ${reply}` },
					{ role: 'user', content: input },
				],
			},
			signal,
			onToken,
		);
	};

	if (o.images !== false) {
		provider.describeImage = async ({ src, image, lang, signal }) => {
			const url = image && image.size < 8 * 1024 * 1024 ? await toDataUrl(image) : new URL(src, document.baseURI).href;
			const model = o.visionModel ?? o.model;
			return text(
				{
					...(model ? { model } : {}),
					temperature: 0.2,
					messages: [
						{
							role: 'user',
							content: [
								{
									type: 'text',
									text: `Write alt text for this image for a web page, in the language "${lang}": one or two plain sentences describing what it shows. Don't start with "An image of". Reply with only the alt text.`,
								},
								{ type: 'image_url', image_url: { url } },
							],
						},
					],
				},
				signal,
			);
		};
	}

	if (o.chat !== false) {
		provider.chat = async ({ messages, tools, context, lang, signal }) => {
			const convo: CompletionsMessage[] = [
				{
					role: 'system',
					content: `You are an assistant inside a web page editor, working in the language "${lang}". Change the page by calling the tools; after they run you'll be told what happened and shown the page as it is then. When the request is done, say briefly what you changed. If no change is needed, answer in plain text.`,
				},
			];
			// Each call gets its own result as its answer (a model told every result
			// for every call thinks the work was done several times)
			let n = 0;
			let pending: NonNullable<CompletionsMessage['tool_calls']> = [];
			for (const m of messages) {
				if (m.role === 'assistant' && m.calls?.length) {
					pending = m.calls.map((c) => ({ id: `call_${++n}`, type: 'function' as const, function: { name: c.name, arguments: JSON.stringify(c.arguments ?? {}) } }));
					convo.push({ role: 'assistant', content: m.content || '', tool_calls: pending });
				} else if (m.role === 'tool') {
					pending.forEach((c, i) => convo.push({ role: 'tool', tool_call_id: c.id, content: m.results?.[i] ?? (i ? 'Done.' : m.content) }));
					pending = [];
				} else convo.push({ role: m.role, content: m.content });
			}
			// The page as it is now goes last, after any results, so the model doesn't
			// take its own changes for ones that were there before the request
			const last = convo[convo.length - 1];
			if (last.role === 'tool') last.content = `${last.content}\n\nThe page now. ${context}`;
			else convo[0].content += `\n\n${context}`;
			const model = o.chatModel ?? o.model;
			const res = await request(
				{
					...(model ? { model } : {}),
					temperature: 0.2,
					messages: convo,
					tools: tools.map((t) => ({ type: 'function', function: t })),
				},
				signal,
			);
			const j = await res.json();
			failed(j);
			const msg = j?.choices?.[0]?.message ?? {};
			const calls: AssistantToolCall[] = (msg.tool_calls ?? []).map((c: { function?: { name?: string; arguments?: string } }) => {
				let args: Record<string, unknown> = {};
				try {
					args = JSON.parse(c.function?.arguments || '{}');
				} catch {
					/* leave empty */
				}
				return { name: String(c.function?.name ?? ''), arguments: args };
			});
			return { text: String(msg.content ?? ''), calls: calls.filter((c) => c.name) };
		};
	}

	return provider;
}
