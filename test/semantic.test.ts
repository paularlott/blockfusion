import { describe, expect, it } from 'vitest';
import { semanticInline } from '../src/commands/text';

describe('semanticInline', () => {
	it('turns <b>/<i> into <strong>/<em>, keeping attributes', () => {
		const root = document.createElement('div');
		root.innerHTML = '<p><b>bold</b> <i style="color:red">it</i> <b><i>both</i></b></p>';
		semanticInline(root);
		expect(root.innerHTML).toBe('<p><strong>bold</strong> <em style="color:red">it</em> <strong><em>both</em></strong></p>');
	});
	it('leaves icon elements with a class alone', () => {
		const root = document.createElement('div');
		root.innerHTML = '<p><i class="fa fa-star"></i> star</p>';
		semanticInline(root);
		expect(root.innerHTML).toBe('<p><i class="fa fa-star"></i> star</p>');
	});
});
