/**
 * Loading and converting markup across converters: detect which framework
 * some HTML was written for, parse it with that converter into the neutral
 * model, and render it with another.
 */
import type { Doc } from '../model/types';
import { extractRaw, fragment } from './html';
import { getConverter, listConverters } from './registry';
import type { Converter } from './types';

/** Parse HTML with a given converter, keeping raw code verbatim. */
export function parseWith(converter: Converter, html: string): Doc {
	const { html: body, raws } = extractRaw(html);
	return converter.parse(fragment(body), { raws });
}

/**
 * Find the converter whose markup this is. Ties go to `preferred` (usually
 * the active converter), then to registration order. Returns `preferred`
 * when nothing recognises the markup.
 */
export function detectConverter(html: string, preferred?: Converter): Converter | undefined {
	const root = fragment(extractRaw(html).html);
	let best = preferred;
	let bestScore = preferred ? preferred.detect(root) : -1;
	for (const c of listConverters()) {
		if (c === preferred) continue;
		const score = c.detect(root);
		if (score > bestScore) {
			best = c;
			bestScore = score;
		}
	}
	return bestScore > 0 ? best : (preferred ?? best);
}

/** Load markup written for any known framework into the neutral model. */
export function loadHTML(html: string, preferred?: Converter): Doc {
	const conv = detectConverter(html, preferred);
	if (!conv) throw new Error('BlockFusion: no converters are registered');
	return parseWith(conv, html);
}

/** Convert markup to another framework. `from` is detected when omitted. */
export function convertHTML(html: string, to: string, from?: string): string {
	const target = getConverter(to);
	if (!target) throw new Error(`BlockFusion: unknown converter "${to}"`);
	const source = from ? getConverter(from) : detectConverter(html, target);
	if (!source) throw new Error(`BlockFusion: unknown converter "${from}"`);
	return target.render(parseWith(source, html));
}
