/**
 * blockfusion-ai: an AssistantProvider that runs small open models in the
 * browser, with transformers.js (Apache-2.0):
 *
 *   images: Florence-2-base (MIT), describes an image for its alt text
 *   text and chat: Qwen3-0.6B (Apache-2.0), rewrites a paragraph, and talks
 *                  and changes the page through tools (one download for both)
 *
 * Nothing loads until it's first used. The models download once (a few
 * hundred MB each; the browser caches them), from Hugging Face or from
 * `modelHost`. WebGPU is used where the browser has it, else WebAssembly
 * on the CPU (slower). Nothing leaves the device.
 *
 *   import { localAssistant } from './blockfusion-ai/blockfusion-ai.mjs';
 *   BlockFusion.create(el, { assistant: localAssistant() });
 */
import type { AssistantProgress, AssistantProvider, AssistantToolCall } from '../../../src/types';

export interface LocalAssistantOptions {
	/**
	 * Model for the one-shot text actions (a Hugging Face id with ONNX weights).
	 * Default Qwen3-0.6B, the same as the chat, so one download serves both;
	 * false turns them off.
	 */
	textModel?: string | false;
	/**
	 * Model for the chat that changes the page. Default Qwen3-0.6B (Apache-2.0,
	 * about 570 MB); false turns chat off. The editor shows the chat only
	 * with its assistantChat option. It can be the same model as textModel.
	 */
	chatModel?: string | false;
	/** Image model (Florence-2 family). Default Florence-2-base; false turns image descriptions off. */
	imageModel?: string | false;
	/**
	 * Where models are downloaded from: Hugging Face by default, or your own
	 * copy, laid out as `${modelHost}${model}/resolve/main/…`. A relative path is
	 * resolved against the page. Your server should answer ranged GET requests
	 * (a plain 200 is fine).
	 */
	modelHost?: string;
	/** 'auto' (WebGPU when available), 'webgpu' or 'wasm'. */
	device?: 'auto' | 'webgpu' | 'wasm';
	/** Shown with suggestions. Default "a model on this device". */
	name?: string;
}

type TJ = typeof import('@huggingface/transformers');

let lib: Promise<TJ> | null = null;

/** Load transformers.js on first use, with its WebAssembly runtime from beside this file. */
function load(o: LocalAssistantOptions): Promise<TJ> {
	lib ??= import('@huggingface/transformers').then((t) => {
		const wasm = t.env.backends.onnx.wasm;
		if (wasm) wasm.wasmPaths = new URL('./ort/', import.meta.url).href;
		// transformers.js only probes absolute http(s) URLs (a relative host makes
		// it think the tokenizer is missing), so resolve the host against the page.
		if (o.modelHost) t.env.remoteHost = new URL(o.modelHost, document.baseURI).href;
		t.env.allowLocalModels = false;
		return t;
	});
	return lib;
}

async function pickDevice(o: LocalAssistantOptions): Promise<'webgpu' | 'wasm'> {
	if (o.device === 'webgpu' || o.device === 'wasm') return o.device;
	const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
	try {
		return gpu && (await gpu.requestAdapter()) ? 'webgpu' : 'wasm';
	} catch {
		return 'wasm';
	}
}

/** Turn transformers.js per-file download reports into one overall figure. */
function progressReporter(what: string, report?: (p: AssistantProgress) => void) {
	const files = new Map<string, { loaded: number; total: number }>();
	return (e: { status: string; file?: string; loaded?: number; total?: number }) => {
		if (!report) return;
		if (e.status === 'progress' && e.file && e.total) {
			files.set(e.file, { loaded: e.loaded ?? 0, total: e.total });
			let loaded = 0;
			let total = 0;
			for (const f of files.values()) {
				loaded += f.loaded;
				total += f.total;
			}
			report({ text: `Downloading the ${what} model, ${Math.round(total / 1e6)} MB, once`, progress: total ? loaded / total : undefined });
		} else if (e.status === 'ready') report({ text: `Starting the ${what} model…` });
	};
}

const PAGE_TOOL_NAMES = (tools: Array<{ name: string }>) => new Set(tools.map((t) => t.name));

/** Tool calls in a reply: tagged, missing a closing tag, or bare JSON. Small models vary. */
export function parseCalls(out: string): AssistantToolCall[] {
	const calls: AssistantToolCall[] = [];
	const re = /\{\s*"name"\s*:\s*"(\w+)"\s*,\s*"arguments"\s*:\s*(\{[\s\S]*?\})\s*\}/g;
	for (const m of out.matchAll(re)) {
		try {
			calls.push({ name: m[1], arguments: JSON.parse(m[2]) });
		} catch {
			/* not valid JSON: skip */
		}
	}
	return calls;
}

/**
 * Alt text shouldn't start "In this image we can see…" or "The image shows…":
 * screen readers already say it's an image. Drop those openings.
 */
export function tidyCaption(text: string): string {
	let t = text.trim().replace(/\s+/g, ' ');
	t = t.replace(/^(in this (image|picture|photo),? (we can see|there is|there are|i can see)|this (image|picture|photo) (shows|is of|contains|depicts)|the (image|picture|photo) (shows|is of|contains|depicts)|an? (image|picture|photo) of)\s*/i, '');
	return t ? t[0].toUpperCase() + t.slice(1) : t;
}



export function localAssistant(o: LocalAssistantOptions = {}): AssistantProvider {
	const textModel = o.textModel === false ? null : (o.textModel ?? 'onnx-community/Qwen3-0.6B-ONNX');
	const imageModel = o.imageModel === false ? null : (o.imageModel ?? 'onnx-community/Florence-2-base-ft');

	const chatModel = o.chatModel === false ? null : (o.chatModel ?? 'onnx-community/Qwen3-0.6B-ONNX');
	let vision: Promise<{ model: any; processor: any; tokenizer: any }> | null = null;
	// Language models by id, so the text and chat jobs share one when it's the same
	const lms = new Map<string, Promise<{ model: any; tokenizer: any }>>();
	const loadLM = (t: TJ, id: string, what: string, onProgress?: (p: AssistantProgress) => void) => {
		let lm = lms.get(id);
		if (!lm) {
			lm = (async () => {
				const device = await pickDevice(o);
				const progress_callback = progressReporter(what, onProgress);
				const [tokenizer, model] = await Promise.all([
					t.AutoTokenizer.from_pretrained(id, { progress_callback }),
					t.AutoModelForCausalLM.from_pretrained(id, { dtype: device === 'webgpu' ? 'q4f16' : 'q8', device, progress_callback }),
				]);
				return { tokenizer, model };
			})().catch((err) => {
				lms.delete(id);
				throw err;
			});
			lms.set(id, lm);
		}
		return lm;
	};

	/** Generate a reply, streaming text; stops early when the signal aborts. */
	const generate = async (t: TJ, lm: { model: any; tokenizer: any }, messages: Array<{ role: string; content: string }>, maxTokens: number, signal: AbortSignal, onToken?: (s: string) => void) => {
		// enable_thinking: Qwen3 answers directly instead of reasoning aloud first; other templates ignore it
		const inputs = lm.tokenizer.apply_chat_template(messages, { add_generation_prompt: true, return_dict: true, enable_thinking: false });
		let out = '';
		const streamer = new t.TextStreamer(lm.tokenizer, {
			skip_prompt: true,
			skip_special_tokens: true,
			callback_function: (chunk: string) => {
				out += chunk;
				onToken?.(chunk);
			},
		});
		const stopping = new t.StoppingCriteriaList();
		stopping.push(new (class extends t.StoppingCriteria {
			override _call(ids: number[][]) {
				return ids.map(() => signal.aborted);
			}
		})());
		await lm.model.generate({ ...inputs, max_new_tokens: maxTokens, do_sample: false, streamer, stopping_criteria: stopping });
		signal.throwIfAborted();
		return out.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
	};

	const provider: AssistantProvider = { name: o.name ?? 'a model on this device' };

	if (imageModel) {
		provider.describeImage = async ({ src, image, signal, onProgress }) => {
			const t = await load(o);
			vision ??= (async () => {
				const device = await pickDevice(o);
				const progress_callback = progressReporter('image', onProgress);
				// fp16 needs a GPU; on the CPU 8-bit weights are the quick ones
				const dtype = device === 'webgpu'
					? { embed_tokens: 'fp16', vision_encoder: 'fp16', encoder_model: 'q4', decoder_model_merged: 'q4' }
					: 'q8';
				const [model, processor, tokenizer] = await Promise.all([
					t.Florence2ForConditionalGeneration.from_pretrained(imageModel, { dtype: dtype as any, device, progress_callback }),
					t.AutoProcessor.from_pretrained(imageModel, { progress_callback }),
					t.AutoTokenizer.from_pretrained(imageModel, { progress_callback }),
				]);
				return { model, processor, tokenizer };
			})().catch((err) => {
				vision = null;
				throw err;
			});
			const { model, processor, tokenizer } = await vision;
			signal.throwIfAborted();
			onProgress?.({ text: 'Looking at the image…' });
			const raw = image ? await t.RawImage.fromBlob(image) : await t.RawImage.fromURL(src);
			const task = '<DETAILED_CAPTION>';
			const prompts = processor.construct_prompts(task);
			const inputs = await processor(raw, prompts);
			const ids = await model.generate({ ...inputs, max_new_tokens: 80 });
			signal.throwIfAborted();
			const text = tokenizer.batch_decode(ids, { skip_special_tokens: false })[0];
			const parsed = processor.post_process_generation(text, task, raw.size);
			return tidyCaption(String(parsed[task] ?? ''));
		};
	}

	if (textModel) {
		provider.rewrite = async ({ text, instruction, signal, onToken, onProgress }) => {
			const t = await load(o);
			const lm = await loadLM(t, textModel, 'writing', onProgress);
			signal.throwIfAborted();
			onProgress?.({ text: 'Writing…' });
			return generate(
				t,
				lm,
				[
					{ role: 'system', content: `You are a careful copy editor. ${instruction} Reply with only the rewritten text, no notes or quotes.` },
					{ role: 'user', content: text },
				],
				Math.min(1024, Math.ceil(text.length / 2) + 64),
				signal,
				onToken,
			);
		};
	}

	if (chatModel) {
		provider.chat = async ({ messages, tools, context, signal, onToken, onProgress }) => {
			const t = await load(o);
			const lm = await loadLM(t, chatModel, 'chat', onProgress);
			signal.throwIfAborted();
			onProgress?.({ text: 'Thinking…' });
			const system = `You are an assistant inside a web page editor. You change the page by calling tools.
${context}

Available tools:
${JSON.stringify(tools)}

To call tools, reply with one line per call, each exactly in this form:
<tool_call>{"name": "tool_name", "arguments": {...}}</tool_call>
Call tools in the order they should happen. After tools run you'll be told what happened; then make the next call, or reply DONE when the request is complete. If no change to the page is needed, answer in plain text.`;
			// Tool reports go back as user turns, which small models follow best,
			// with the request repeated so the model checks it rather than carrying on
			const convo = [{ role: 'system', content: system }];
			let asked = '';
			for (const m of messages) {
				if (m.role === 'user') asked = m.content;
				if (m.role === 'tool')
					convo.push({
						role: 'user',
						content: `${m.content}\nMy request was: "${asked}". If everything I asked for is now done, reply DONE. Only if part of my request is still missing, make the tool call for that part.`,
					});
				else if (m.role === 'assistant' && m.calls?.length) convo.push({ role: 'assistant', content: m.calls.map((c) => `<tool_call>${JSON.stringify(c)}</tool_call>`).join('\n') });
				else convo.push({ role: m.role, content: m.content });
			}
			const out = await generate(t, lm, convo, 512, signal, onToken);
			// "done" isn't a tool: small models sometimes call it to say they've finished
			const calls = parseCalls(out).filter((c) => PAGE_TOOL_NAMES(tools).has(c.name));
			return { text: calls.length ? '' : out, calls };
		};
	}

	return provider;
}
