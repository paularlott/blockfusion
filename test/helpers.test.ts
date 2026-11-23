import { describe, expect, it } from 'vitest';
import { normaliseContent } from '../src/commands/text';
import { parseAttrText } from '../src/ui/dialogs/settings';

describe('normaliseContent', () => {
	it('unwraps lists from paragraphs, renames strike and drops empty paragraphs', () => {
		const el = document.createElement('div');
		el.innerHTML = '<p></p><p><ul><li>a</li></ul></p><p>x <strike>y</strike></p><p style="">z</p>';
		normaliseContent(el);
		expect(el.innerHTML).toBe('<ul><li>a</li></ul><p>x <s>y</s></p><p>z</p>');
	});
});

describe('custom attribute parsing', () => {
	it('reads name="value" lines', () => {
		expect(parseAttrText('data-a="1"\naria-label=\'Intro\'\nhidden\ndata-b=two')).toEqual({
			extra: { 'data-a': '1', 'aria-label': 'Intro', hidden: '', 'data-b': 'two' },
		});
	});
	it('rejects event handlers and owned attributes', () => {
		expect(parseAttrText('onclick="x()"')).toHaveProperty('error');
		expect(parseAttrText('class="a"')).toHaveProperty('error');
		expect(parseAttrText('bad line here')).toHaveProperty('error');
	});
});
