/**
 * The backend for BlockFusion's completionsAssistant: it checks the caller, adds the model
 * and API key, and passes the chat completions request through to a model
 * server, streaming the reply back. The prompts are built in the browser,
 * so this stays this small. No dependencies; Node 18+.
 *
 *   AI_BASE_URL=http://localhost:11434/v1 AI_MODEL=inkling-2-mini:latest AI_TOKEN=secret \
 *     node examples/relay.mjs
 *
 * Settings (environment): PORT (default 8790), AI_BASE_URL (default Ollama's
 * http://localhost:11434/v1), AI_MODEL (set on every request; empty leaves
 * the page's choice), AI_API_KEY, AI_TOKEN (a bearer token callers must
 * send), ALLOW_ORIGIN (CORS, default *) and AI_IMAGE_HOSTS (below). Requests
 * over 12 MB are refused.
 *
 * Then in the page:
 *   BlockFusionAssistant.completionsAssistant({ url: 'http://localhost:8790/v1/chat/completions',
 *     headers: { Authorization: 'Bearer secret' }, body: { reasoning_effort: 'none' } })
 *
 * Images the page couldn't read itself (on another site, without CORS) come
 * as addresses. Many model servers (Ollama among them) only take image data,
 * so the relay fetches them and passes them on as base64: http(s) only, not
 * from private or local addresses, images only, up to 8 MB and 10 seconds.
 * AI_IMAGE_HOSTS lists hosts that may be fetched even on a private address
 * (your own site on a local network), comma separated.
 *
 * This is an example to build on: in a real app, check the user's session
 * (not a shared token), and add rate and size limits.
 */
import { lookup } from 'node:dns/promises';
import { createServer } from 'node:http';
import { isIP } from 'node:net';

const PORT = Number(process.env.PORT ?? 8790);
const BASE = (process.env.AI_BASE_URL ?? 'http://localhost:11434/v1').replace(/\/$/, '');
const MODEL = process.env.AI_MODEL ?? '';
const KEY = process.env.AI_API_KEY ?? '';
const TOKEN = process.env.AI_TOKEN ?? '';
const ORIGIN = process.env.ALLOW_ORIGIN ?? '*';
const LIMIT = 12 * 1024 * 1024;
const IMAGE_HOSTS = new Set((process.env.AI_IMAGE_HOSTS ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean));

/** Loopback, private, link-local and other non-public addresses. */
function isPrivate(ip) {
	if (isIP(ip) === 6) {
		const v = ip.toLowerCase();
		if (v.startsWith('::ffff:')) return isPrivate(v.slice(7));
		return v === '::' || v === '::1' || /^f[cd]/.test(v) || /^fe[89ab]/.test(v);
	}
	const [a, b] = ip.split('.').map(Number);
	return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

/** An image address as a data URL, or an error saying why not. */
async function imageData(address) {
	const url = new URL(address);
	if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('only http(s) image addresses can be fetched');
	const host = url.hostname.replace(/^\[|\]$/g, '');
	const ips = isIP(host) ? [host] : (await lookup(host, { all: true })).map((r) => r.address);
	if (!ips.length) throw new Error(`${host} could not be found`);
	if (ips.some(isPrivate) && !IMAGE_HOSTS.has(host.toLowerCase()))
		throw new Error(`${host} is a private or local address, so the relay won't fetch from it (list it in AI_IMAGE_HOSTS to allow it)`);
	const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10_000) }).catch((err) => {
		// "fetch failed" alone doesn't say why
		throw new Error(`the image could not be fetched (${err.cause?.code ?? err.cause?.message ?? err.message})`);
	});
	if (!res.ok) throw new Error(`the image could not be fetched (${res.status})`);
	const type = (res.headers.get('Content-Type') ?? '').split(';')[0].trim();
	if (!type.startsWith('image/')) throw new Error('the address is not an image');
	const buf = Buffer.from(await res.arrayBuffer());
	if (buf.length > 8 * 1024 * 1024) throw new Error('the image is over 8 MB');
	return `data:${type};base64,${buf.toString('base64')}`;
}

/** Swap image addresses in the messages for their data. */
async function inlineImages(body) {
	for (const m of body.messages ?? []) {
		if (!Array.isArray(m.content)) continue;
		for (const part of m.content) {
			const u = part?.type === 'image_url' ? part.image_url?.url : null;
			if (typeof u !== 'string' || /^data:image\//i.test(u)) continue;
			if (!/^https?:/i.test(u)) throw new Error('only http(s) image addresses can be fetched');
			part.image_url.url = await imageData(u);
		}
	}
}

function readBody(req) {
	return new Promise((resolve, reject) => {
		let size = 0;
		const chunks = [];
		req.on('data', (c) => {
			size += c.length;
			if (size > LIMIT) reject(new Error('request too large'));
			else chunks.push(c);
		});
		req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
		req.on('error', reject);
	});
}

createServer(async (req, res) => {
	res.setHeader('Access-Control-Allow-Origin', ORIGIN);
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
	if (req.method === 'OPTIONS') return res.writeHead(204).end();
	if (req.method !== 'POST' || req.url !== '/v1/chat/completions') return res.writeHead(404).end();
	if (TOKEN && req.headers.authorization !== `Bearer ${TOKEN}`) {
		res.writeHead(401, { 'Content-Type': 'application/json' });
		return res.end(JSON.stringify({ error: 'not signed in' }));
	}
	try {
		const body = JSON.parse(await readBody(req));
		// The server picks the model unless one was configured to be chosen in the page
		if (MODEL) body.model = MODEL;
		try {
			await inlineImages(body);
		} catch (err) {
			res.writeHead(400, { 'Content-Type': 'application/json' });
			return res.end(JSON.stringify({ error: err.message }));
		}
		const upstream = await fetch(`${BASE}/chat/completions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...(KEY ? { Authorization: `Bearer ${KEY}` } : {}) },
			body: JSON.stringify(body),
		});
		res.writeHead(upstream.status, {
			'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
			'Cache-Control': 'no-store',
		});
		if (!upstream.body) return res.end();
		for await (const chunk of upstream.body) res.write(chunk);
		res.end();
	} catch (err) {
		if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: String(err.message ?? err) }));
	}
})
	.on('error', (err) => {
		if (err.code !== 'EADDRINUSE') throw err;
		console.error(`Port ${PORT} is already in use. Stop the other server, or pick another port: PORT=8791 node examples/relay.mjs`);
		process.exit(1);
	})
	.listen(PORT, () => console.log(`BlockFusion completions relay on http://localhost:${PORT}/v1/chat/completions -> ${BASE}${MODEL ? ` (${MODEL})` : ''}`));
