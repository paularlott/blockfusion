import { describe, expect, it } from 'vitest';
import { cleanPaste, textToHtml } from '../src/paste/clean';

describe('cleanPaste', () => {
	it('strips Word markup, styles and classes but keeps semantics', () => {
		const word = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><style>p.MsoNormal{margin:0}</style></head><body>
<!--StartFragment--><p class="MsoNormal" style="margin:0cm;font-family:Calibri"><b>Bold</b> and <i>italic</i><o:p></o:p></p>
<!--[if !supportLists]--><span style="mso-list:Ignore">1.</span><!--[endif]-->
<h2 class="MsoHeading2" style="color:red">Title</h2><!--EndFragment--></body></html>`;
		expect(cleanPaste(word)).toBe('<p><b>Bold</b> and <i>italic</i></p>\n\n<h2>Title</h2>');
	});

	it('turns Google Docs styled spans into tags and drops the wrapper', () => {
		const gdocs =
			'<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-abc"><p dir="ltr" style="line-height:1.38"><span style="font-weight:700;font-size:11pt">Strong</span><span style="font-style:italic"> slanted</span><span style="text-decoration:underline"> under</span></p></b>';
		expect(cleanPaste(gdocs)).toBe('<p dir="ltr"><strong>Strong</strong><em> slanted</em><u> under</u></p>');
	});

	it('keeps links, images, lists and tables with safe attributes only', () => {
		const html =
			'<ul class="x"><li style="color:red"><a href="https://example.com" onclick="evil()" class="y">link</a></li></ul>' +
			'<img src="/a.png" alt="A" style="width:10px" data-x="1"><table border="1"><tr><td colspan="2" class="z">c</td></tr></table>';
		expect(cleanPaste(html)).toBe(
			'<ul><li><a href="https://example.com">link</a></li></ul><img src="/a.png" alt="A"><table><tbody><tr><td colspan="2">c</td></tr></tbody></table>',
		);
	});

	it('removes scripts, styles, event handlers and javascript: urls', () => {
		const html = '<p>a<script>alert(1)</script><style>p{}</style><a href="javascript:alert(1)">x</a></p><iframe src="x"></iframe>';
		expect(cleanPaste(html)).toBe('<p>ax</p>');
	});

	it('turns divs without blocks into paragraphs and unwraps others', () => {
		expect(cleanPaste('<div>one</div><div><p>two</p></div>')).toBe('<p>one</p><p>two</p>');
	});

	it('drops empty paragraphs and wrappers', () => {
		expect(cleanPaste('<p> </p><p><b></b>text</p>')).toBe('<p>text</p>');
	});

	it('runs paste filters first', () => {
		expect(cleanPaste('<p>foo</p>', [(h) => h.replace('foo', 'bar')])).toBe('<p>bar</p>');
	});
});

describe('textToHtml', () => {
	it('makes paragraphs and line breaks and escapes', () => {
		expect(textToHtml('a <b>\nb\n\nc')).toBe('<p>a &lt;b&gt;<br>b</p><p>c</p>');
	});
});
