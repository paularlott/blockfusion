/**
 * An example assistant server for BlockFusion's httpAssistant: it takes the
 * editor's JSON jobs and passes them to any OpenAI-compatible chat API, such
 * as a local Ollama, llama.cpp or LM Studio. No dependencies; Node 18+.
 *
 *   AI_BASE_URL=http://localhost:11434/v1 AI_MODEL=qwen2.5:1.5b AI_VISION_MODEL=moondream \
 *     node examples/assistant-server/server.mjs
 *
 * Then in the page:
 *   assistant: BlockFusion.httpAssistant({ url: 'http://localhost:8787/assistant', chat: true }),
 *   assistantChat: true,
 *
 * Chat uses the model server's tool calling, so pick a model that supports
 * it (Qwen3, Llama 3.1+, Mistral, …).
 *
 * This is an example to build on, not a production service: add
 * authentication, rate limits and size limits before exposing it.
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT ?? 8787);
const BASE = (process.env.AI_BASE_URL ?? 'http://localhost:11434/v1').replace(/\/$/, '');
const MODEL = process.env.AI_MODEL ?? 'qwen2.5:1.5b';
const VISION = process.env.AI_VISION_MODEL ?? 'moondream';
const CHAT_MODEL = process.env.AI_CHAT_MODEL ?? MODEL;
const KEY = process.env.AI_API_KEY ?? '';
const ORIGIN = process.env.ALLOW_ORIGIN ?? '*';

/** One chat round, not streamed: the reply text and any tool calls. */
async function chatTools(job) {
	const messages = [
		{
			role: 'system',
			content: `You are an assistant inside a web page editor, working in the language "${job.lang}". Change the page by calling the tools; after they run you'll be told what happened. If no change is needed, answer in plain text.\n\n${job.context}`,
		},
	];
	let n = 0;
	let pending = [];
	for (const m of job.messages ?? []) {
		if (m.role === 'assistant' && m.calls?.length) {
			pending = m.calls.map((c) => ({ id: `call_${++n}`, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.arguments ?? {}) } }));
			messages.push({ role: 'assistant', content: m.content || '', tool_calls: pending });
		} else if (m.role === 'tool') {
			// The editor reports a round's results together; answer each call with them
			for (const c of pending) messages.push({ role: 'tool', tool_call_id: c.id, content: m.content });
			pending = [];
		} else messages.push({ role: m.role, content: m.content });
	}
	const res = await fetch(`${BASE}/chat/completions`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...(KEY ? { Authorization: `Bearer ${KEY}` } : {}) },
		body: JSON.stringify({
			model: CHAT_MODEL,
			messages,
			tools: (job.tools ?? []).map((t) => ({ type: 'function', function: t })),
			temperature: 0.2,
		}),
	});
	if (!res.ok) throw new Error(`model server: ${res.status} ${await res.text().catch(() => '')}`);
	const msg = (await res.json()).choices?.[0]?.message ?? {};
	const calls = (msg.tool_calls ?? []).map((c) => {
		let args = {};
		try {
			args = JSON.parse(c.function?.arguments || '{}');
		} catch {
			/* leave empty */
		}
		return { name: c.function?.name, arguments: args };
	});
	return { text: msg.content ?? '', calls };
}

/** Call the chat API, streaming the reply's text to `write` as it comes. */
async function chat(model, messages, write) {
	const res = await fetch(`${BASE}/chat/completions`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...(KEY ? { Authorization: `Bearer ${KEY}` } : {}) },
		body: JSON.stringify({ model, messages, stream: true, temperature: 0.2 }),
	});
	if (!res.ok || !res.body) throw new Error(`model server: ${res.status} ${await res.text().catch(() => '')}`);
	const dec = new TextDecoder();
	let buf = '';
	for await (const part of res.body) {
		buf += dec.decode(part, { stream: true });
		let nl;
		while ((nl = buf.indexOf('\n')) >= 0) {
			const line = buf.slice(0, nl).trim();
			buf = buf.slice(nl + 1);
			if (!line.startsWith('data:') || line === 'data: [DONE]') continue;
			const delta = JSON.parse(line.slice(5)).choices?.[0]?.delta?.content;
			if (delta) write(delta);
		}
	}
}

function readJson(req) {
	return new Promise((resolve, reject) => {
		let size = 0;
		const chunks = [];
		req.on('data', (c) => {
			size += c.length;
			if (size > 12 * 1024 * 1024) reject(new Error('request too large'));
			else chunks.push(c);
		});
		req.on('end', () => {
			try {
				resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
			} catch (e) {
				reject(e);
			}
		});
		req.on('error', reject);
	});
}

createServer(async (req, res) => {
	res.setHeader('Access-Control-Allow-Origin', ORIGIN);
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
	if (req.method === 'OPTIONS') return res.writeHead(204).end();
	if (req.method !== 'POST' || !req.url?.startsWith('/assistant')) return res.writeHead(404).end();
	try {
		const job = await readJson(req);
		if (job.task === 'chat') {
			const out = await chatTools(job);
			res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
			return res.end(JSON.stringify(out));
		}
		res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
		const write = (t) => res.write(t);
		if (job.task === 'describe-image') {
			const url = job.image || job.src;
			await chat(VISION, [
				{
					role: 'user',
					content: [
						{ type: 'text', text: `Write alt text for this image for a web page, in the language "${job.lang}": one or two plain sentences describing what it shows. Don't start with "An image of". Reply with only the alt text.` },
						{ type: 'image_url', image_url: { url } },
					],
				},
			], write);
		} else if (job.task === 'rewrite' && job.instruction) {
			await chat(MODEL, [
				{ role: 'system', content: `You are a careful copy editor. ${job.instruction} The text is in the language "${job.lang}". Reply with only the rewritten text, no notes or quotes.` },
				{ role: 'user', content: String(job.text ?? '') },
			], write);
		} else {
			res.write('');
		}
		res.end();
	} catch (err) {
		if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: String(err.message ?? err) }));
	}
}).listen(PORT, () => console.log(`BlockFusion assistant example on http://localhost:${PORT}/assistant -> ${BASE} (${MODEL}, ${VISION})`));
