import { describe, expect, it } from 'vitest';
import { semanticInline, trailingBreaks } from '../src/commands/text';

describe('semanticInline', () => {
	it('turns <b>/<i> into <strong>/<em>, keeping attributes', () => {
		const root = document.createElement('div');
		root.innerHTML = '<p><b>bold</b> <i style="color:red">it</i> <b><i>both</i></b></p>';
		semanticInline(root);
		expect(root.innerHTML).toBe('<p><strong>bold</strong> <em style="color:red">it</em> <strong><em>both</em></strong></p>');
	});
	it('turns <u> into an underlined span', () => {
		const root = document.createElement('div');
		root.innerHTML = '<p><u>under</u> <u style="color: red;">red</u> <u class="spelling">teh</u></p>';
		semanticInline(root);
		expect(root.innerHTML).toBe('<p><span style="text-decoration-line: underline;">under</span> <span style="color: red; text-decoration-line: underline;">red</span> <u class="spelling">teh</u></p>');
	});
	it('leaves icon elements with a class alone', () => {
		const root = document.createElement('div');
		root.innerHTML = '<p><i class="fa fa-star"></i> star</p>';
		semanticInline(root);
		expect(root.innerHTML).toBe('<p><i class="fa fa-star"></i> star</p>');
	});
});

describe('trailingBreaks', () => {
	it('drops a <br> left at the end of a block with text', () => {
		const root = document.createElement('div');
		root.innerHTML = '<p>and the second<br></p><p><br></p><p>line one<br>line two</p><p>gap<br><br></p>';
		trailingBreaks(root);
		expect(root.innerHTML).toBe('<p>and the second</p><p><br></p><p>line one<br>line two</p><p>gap<br><br></p>');
	});
});
