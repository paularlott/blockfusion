import { describe, expect, it } from 'vitest';
import { safeUrl, sanitizeHtml } from '../src/assistant/sanitize';

const clean = (html: string) => {
	const d = document.createElement('div');
	d.append(sanitizeHtml(html, document));
	return d.innerHTML;
};

describe('sanitising a model reply', () => {
	it('keeps text-level markup and its safe attributes', () => {
		const html = 'Get <strong>fast</strong> <a href="[[~26]]" class="cf-link" title="Support">help</a> <span style="color: rgb(26, 95, 122)">today</span>.';
		expect(clean(html)).toBe(html);
	});

	it('drops scripts, handlers and unsafe addresses', () => {
		expect(clean('Hi<script>alert(1)</script> <a href="javascript:alert(1)" onclick="x()">there</a>')).toBe('Hi <a>there</a>');
		expect(clean('<img src="x" onerror="alert(1)">')).toBe('<img src="x">');
		expect(clean('<a href=" JaVa\tScript:alert(1)">x</a>')).toBe('<a>x</a>');
		expect(clean('<img src="data:image/svg+xml,<svg onload=alert(1)>">')).toBe('<img>');
		expect(clean('<iframe src="https://evil"></iframe>ok')).toBe('ok');
	});

	it('drops styles that load things', () => {
		expect(clean('<span style="background: url(https://evil/x.png)">x</span>')).toBe('<span>x</span>');
	});

	it('unwraps block and unknown elements to their text', () => {
		expect(clean('<p>One <b>two</b></p><div>three</div><custom-el>four</custom-el>')).toBe('One <b>two</b>threefour');
	});

	it('keeps new-tab links from reaching the page', () => {
		expect(clean('<a href="https://example.com" target="_blank">x</a>')).toBe('<a href="https://example.com" target="_blank" rel="noopener">x</a>');
	});

	it('knows safe addresses', () => {
		for (const ok of ['/about', 'about', '#top', 'https://a.b', 'mailto:a@b.c', 'tel:+44', '[[~26]]']) expect(safeUrl(ok)).toBe(true);
		for (const bad of ['javascript:x', 'data:text/html,x', 'vbscript:x', 'java\nscript:x']) expect(safeUrl(bad)).toBe(false);
	});
});
