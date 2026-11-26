/**
 * The backend for BlockFusion's completionsAssistant: it checks the caller, adds the model
 * and API key, and passes the chat completions request through to a model
 * server, streaming the reply back. The prompts are built in the browser,
 * so this stays this small. No dependencies; Node 18+.
 *
 *   AI_BASE_URL=http://localhost:11434/v1 AI_MODEL=inkling-2-mini:latest AI_TOKEN=secret \
 *     node examples/relay.mjs
 *
 * Then in the page:
 *   BlockFusionAssistant.completionsAssistant({ url: 'http://localhost:8790/v1/chat/completions',
 *     headers: { Authorization: 'Bearer secret' }, body: { reasoning_effort: 'none' } })
 *
 * This is an example to build on: in a real app, check the user's session
 * (not a shared token), and add rate and size limits.
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT ?? 8790);
const BASE = (process.env.AI_BASE_URL ?? 'http://localhost:11434/v1').replace(/\/$/, '');
const MODEL = process.env.AI_MODEL ?? '';
const KEY = process.env.AI_API_KEY ?? '';
const TOKEN = process.env.AI_TOKEN ?? '';
const ORIGIN = process.env.ALLOW_ORIGIN ?? '*';
const LIMIT = 12 * 1024 * 1024;

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
