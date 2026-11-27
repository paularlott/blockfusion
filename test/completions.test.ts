import { afterEach, describe, expect, it, vi } from 'vitest';
import { completionsAssistant } from '../src/assistant/completions';

/** A fetch that answers every request with this body and type. */
function answer(body: string, type: string): void {
	vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200, headers: { 'Content-Type': type } })));
}

const rewrite = () =>
	completionsAssistant({ url: '/ai' }).rewrite!({
		text: 'We has a garden.',
		task: 'fix',
		instruction: 'Fix it.',
		format: 'html',
		lang: 'en',
		signal: new AbortController().signal,
	});

const chat = () =>
	completionsAssistant({ url: '/ai' }).chat!({
		messages: [{ role: 'user', content: 'Add a row' }],
		tools: [],
		context: 'The page is empty.',
		lang: 'en',
		signal: new AbortController().signal,
	});

describe('completionsAssistant replies', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('reads JSON after keep-alive whitespace', async () => {
		answer('      {"choices":[{"message":{"content":"We have a garden."}}]}', 'application/json');
		await expect(rewrite()).resolves.toBe('We have a garden.');
	});

	it('skips keep-alive comments in an event stream', async () => {
		answer(': waiting for the model\n\ndata: {"choices":[{"delta":{"content":"We have"}}]}\n\ndata: {"choices":[{"delta":{"content":" a garden."}}]}\n\ndata: [DONE]\n\n', 'text/event-stream');
		await expect(rewrite()).resolves.toBe('We have a garden.');
	});

	it('fails on an error in a 200 JSON body', async () => {
		answer('   {"error":{"message":"model not found"}}', 'application/json');
		await expect(rewrite()).rejects.toThrow('model not found');
		answer('{"error":{"message":"The provider timed out"}}', 'application/json');
		await expect(chat()).rejects.toThrow('The provider timed out');
	});

	it('fails on an error event in a stream', async () => {
		answer(': waiting for the model\n\ndata: {"error":{"message":"Could not reach the provider"}}\n\n', 'text/event-stream');
		await expect(rewrite()).rejects.toThrow('Could not reach the provider');
	});
});
