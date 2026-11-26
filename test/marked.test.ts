import { describe, expect, it } from 'vitest';
import { fromMarked, rebuild, refsIn, toMarked } from '../src/assistant/marked';
import { textToContent } from '../src/assistant/tools';

const el = (html: string) => {
	const d = document.createElement('div');
	d.innerHTML = html;
	return d;
};
const back = (text: string, refs: Element[]) => {
	const d = document.createElement('div');
	d.append(fromMarked(text, refs, document));
	return d.innerHTML;
};

describe('marked text for the assistant', () => {
	it('writes inline formatting as marks', () => {
		const m = toMarked(el('We <strong>build</strong> <em>fast</em> sites, see <a href="/work" class="x">our work</a> and <code>a*b</code>.'));
		expect(m.text).toBe('We **build** *fast* sites, see [our work](1) and `a\\*b`.');
		expect(m.refs.map((r) => r.tagName)).toEqual(['A']);
	});

	it('round trips unchanged text exactly', () => {
		const html = 'We <strong>build</strong> <em>fast</em> sites, see <a href="/work" class="x">our work</a>, <span style="color: red">in red</span>.';
		const m = toMarked(el(html));
		expect(back(m.text, m.refs)).toBe(html);
	});

	it('rebuilds a reworded link from the original element', () => {
		const m = toMarked(el('Read <a href="/about" title="About us" target="_blank">about us</a> now.'));
		expect(back('Find out [more about us](1) today.', m.refs)).toBe(
			'Find out <a href="/about" title="About us" target="_blank">more about us</a> today.',
		);
	});

	it('handles nesting', () => {
		const m = toMarked(el('<strong>Call <a href="tel:1">us</a></strong>'));
		expect(m.text).toBe('**Call [us](1)**');
		expect(back(m.text, m.refs)).toBe('<strong>Call <a href="tel:1">us</a></strong>');
	});

	it('keeps elements without text, adding them back if left out', () => {
		const m = toMarked(el('Logo <img src="a.png" alt=""> here<ul><li>one</li></ul>'));
		expect(m.text).toBe('Logo [](1) here[](2)');
		expect(back('Our logo', m.refs)).toBe('Our logo<img src="a.png" alt=""><ul><li>one</li></ul>');
	});

	it('leaves stray marks and unknown refs as text', () => {
		expect(back('2 * 3 = 6 and [this](9) and **open', [])).toBe('2 * 3 = 6 and [this](9) and **open');
	});

	it('turns single line breaks back into <br>', () => {
		const m = toMarked(el('one<br>two'));
		expect(m.text).toBe('one\ntwo');
		expect(back(m.text, m.refs)).toBe('one<br>two');
	});

	it('lists the refs a suggestion kept', () => {
		expect([...refsIn('a [b](1) c [d](3) e \\](2)')]).toEqual([1, 3]);
	});
});

describe('formatting a model dropped', () => {
	const original =
		'Manage your <strong>hosting and domains</strong>, and get help from <a href="/support" class="cf-link">our support team</a>, all in <em>one place</em>.';
	const html = (frag: DocumentFragment) => {
		const d = document.createElement('div');
		d.append(frag);
		return d.innerHTML;
	};

	it('is put back on the same words', () => {
		const m = toMarked(el(original));
		const { frag, lost } = rebuild('Manage your Hosting and  domains and get help from our support team, all in one place.', m, document);
		expect(html(frag)).toBe(
			'Manage your <strong>Hosting and  domains</strong> and get help from <a href="/support" class="cf-link">our support team</a>, all in <em>one place</em>.',
		);
		expect(lost).toEqual([]);
	});

	it('is reported when the words were changed too', () => {
		const m = toMarked(el(original));
		const { frag, lost } = rebuild('Look after your sites and get help from our friendly team in one place.', m, document);
		expect(html(frag)).toBe('Look after your sites and get help from our friendly team in <em>one place</em>.');
		expect(lost).toEqual(['hosting and domains', 'our support team']);
	});

	it('matches whole words only', () => {
		const m = toMarked(el('Read the <strong>art</strong> guide'));
		expect(html(rebuild('Read the smart guide on art', m, document).frag)).toBe('Read the smart guide on <strong>art</strong>');
	});

	it('keeps marks a model did keep, without wrapping twice', () => {
		const m = toMarked(el(original));
		const { frag, lost } = rebuild(m.text, m, document);
		expect(html(frag)).toBe(original);
		expect(lost).toEqual([]);
	});
});

describe('text the chat writes', () => {
	it('keeps bold, italic and code, and escapes everything else', () => {
		expect(textToContent('# Hours\n\nOpen **Saturday**, *10 to 4*.\nCall `0123` <b>now</b>')).toBe(
			'<h2>Hours</h2><p>Open <strong>Saturday</strong>, <em>10 to 4</em>.<br>Call <code>0123</code> &lt;b&gt;now&lt;/b&gt;</p>',
		);
	});
});
