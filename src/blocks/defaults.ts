/**
 * Built-in blocks in the neutral format. Spans are laid out at `md`, so
 * columns stack on phones. Buttons use the neutral `button accent` /
 * `button primary` classes, which each converter maps to its framework.
 */
import type { Block, Row, Span } from '../model/types';

/** A light grey placeholder picture with a label, as an SVG data URI. */
export function placeholder(w: number, h: number, label: string): string {
	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
		`<rect width="100%" height="100%" fill="#e2e8f0"/>` +
		`<path d="M0 ${h} L${w * 0.35} ${h * 0.45} L${w * 0.55} ${h * 0.7} L${w * 0.7} ${h * 0.55} L${w} ${h} Z" fill="#cbd5e1"/>` +
		`<text x="50%" y="50%" font-family="sans-serif" font-size="${Math.round(h / 10)}" fill="#475569" text-anchor="middle" dominant-baseline="middle">${label}</text></svg>`;
	return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

const span = (n: number): Span => (n === 12 ? { base: 12 } : { base: 12, md: n });

function row(cols: Array<[number, string]>, className?: string): Row {
	return {
		id: '',
		kind: 'grid',
		cols: cols.map(([n, html]) => ({ id: '', kind: 'rich', span: span(n), html })),
		...(className ? { attrs: { className } } : {}),
	};
}

const img = (w: number, h: number, label: string, alt: string) => `<img src="${placeholder(w, h, label)}" alt="${alt}" width="${w}" height="${h}" class="img-fluid">`;

export const DEFAULT_BLOCKS: Block[] = [
	{
		id: 'hero',
		name: 'Hero',
		category: 'Headers',
		description: 'Large heading, introduction and two buttons.',
		rows: [
			row([
				[
					12,
					'<h1>A clear, confident headline</h1><p>One or two sentences that tell visitors what this page is about and why it matters to them.</p><p><a class="button accent" href="#">Get started</a> <a class="button primary" href="#">Learn more</a></p>',
				],
			]),
		],
	},
	{
		id: 'heading-intro',
		name: 'Heading and introduction',
		category: 'Text',
		description: 'A section heading with a short paragraph.',
		rows: [row([[12, '<h2>Section heading</h2><p>Introduce the section in a sentence or two. Keep it short and specific.</p>']])],
	},
	{
		id: 'text-image',
		name: 'Text and image',
		category: 'Text',
		description: 'Text on the left, image on the right.',
		rows: [
			row([
				[6, '<h2>Tell the story</h2><p>Explain the idea in plain words. Use short paragraphs and lead with what readers care about most.</p><ul><li>A first key point</li><li>A second key point</li></ul>'],
				[6, `<p>${img(600, 400, 'Image', 'Describe this image')}</p>`],
			]),
		],
	},
	{
		id: 'image-text',
		name: 'Image and text',
		category: 'Text',
		description: 'Image on the left, text on the right.',
		rows: [
			row([
				[6, `<p>${img(600, 400, 'Image', 'Describe this image')}</p>`],
				[6, '<h2>Show, then tell</h2><p>Pair a picture with a short explanation. Replace this text with your own.</p><p><a class="button primary" href="#">Read more</a></p>'],
			]),
		],
	},
	{
		id: 'two-columns',
		name: 'Two text columns',
		category: 'Text',
		description: 'Two equal columns of text.',
		rows: [
			row([
				[6, '<h3>First topic</h3><p>A few sentences about the first topic.</p>'],
				[6, '<h3>Second topic</h3><p>A few sentences about the second topic.</p>'],
			]),
		],
	},
	{
		id: 'features-3',
		name: 'Three features',
		category: 'Features',
		description: 'Three columns, each with a heading and text.',
		rows: [
			row([[12, '<h2>Why choose us</h2>']]),
			row([
				[4, '<h3>Fast</h3><p>Describe the first benefit in one or two sentences.</p>'],
				[4, '<h3>Reliable</h3><p>Describe the second benefit in one or two sentences.</p>'],
				[4, '<h3>Friendly</h3><p>Describe the third benefit in one or two sentences.</p>'],
			]),
		],
	},
	{
		id: 'stats-4',
		name: 'Four figures',
		category: 'Features',
		description: 'Four key numbers with labels.',
		rows: [
			row([
				[3, '<p><strong>120+</strong></p><p>Projects delivered</p>'],
				[3, '<p><strong>98%</strong></p><p>Happy clients</p>'],
				[3, '<p><strong>24/7</strong></p><p>Support</p>'],
				[3, '<p><strong>15</strong></p><p>Years of experience</p>'],
			]),
		],
	},
	{
		id: 'cta',
		name: 'Call to action',
		category: 'Calls to action',
		description: 'A short prompt with a button.',
		rows: [
			row([
				[8, '<h2>Ready to begin?</h2><p>Tell visitors what happens next and why they should act now.</p>'],
				[4, '<p><a class="button accent" href="#">Contact us</a></p>'],
			]),
		],
	},
	{
		id: 'quote',
		name: 'Quote',
		category: 'Text',
		description: 'A testimonial or pull quote with its source.',
		rows: [row([[12, '<blockquote><p>“A short quote from a happy customer that shows the value you deliver.”</p></blockquote><p>— Name Surname, Company</p>']])],
	},
	{
		id: 'gallery',
		name: 'Image gallery',
		category: 'Media',
		description: 'Four images in a responsive grid.',
		rows: [
			row([
				[3, `<p>${img(400, 300, 'Photo 1', 'Describe photo 1')}</p>`],
				[3, `<p>${img(400, 300, 'Photo 2', 'Describe photo 2')}</p>`],
				[3, `<p>${img(400, 300, 'Photo 3', 'Describe photo 3')}</p>`],
				[3, `<p>${img(400, 300, 'Photo 4', 'Describe photo 4')}</p>`],
			]),
		],
	},
	{
		id: 'faq',
		name: 'Questions and answers',
		category: 'Text',
		description: 'Frequently asked questions with answers.',
		rows: [
			row([[12, '<h2>Frequently asked questions</h2>']]),
			row([
				[6, '<h3>How do I get started?</h3><p>Answer the question clearly in a sentence or two.</p><h3>How much does it cost?</h3><p>Give a straight answer or link to the pricing page.</p>'],
				[6, '<h3>Can I change my plan later?</h3><p>Explain what changes are possible and when.</p><h3>Who do I contact for help?</h3><p>Say how and when people can reach you.</p>'],
			]),
		],
	},
	{
		id: 'pricing',
		name: 'Pricing',
		category: 'Features',
		description: 'Three plans with prices and a button each.',
		rows: [
			row([
				[4, '<h3>Basic</h3><p><strong>£9</strong> a month</p><ul><li>One site</li><li>Email support</li></ul><p><a class="button primary" href="#">Choose Basic</a></p>'],
				[4, '<h3>Standard</h3><p><strong>£19</strong> a month</p><ul><li>Five sites</li><li>Priority support</li></ul><p><a class="button accent" href="#">Choose Standard</a></p>'],
				[4, '<h3>Premium</h3><p><strong>£49</strong> a month</p><ul><li>Unlimited sites</li><li>Phone support</li></ul><p><a class="button primary" href="#">Choose Premium</a></p>'],
			]),
		],
	},
	{
		id: 'team',
		name: 'Team',
		category: 'People',
		description: 'Three people with photo, name and role.',
		rows: [
			row([
				[4, `<p>${img(300, 300, 'Photo', 'Portrait of Alex Morgan')}</p><h3>Alex Morgan</h3><p>Director</p>`],
				[4, `<p>${img(300, 300, 'Photo', 'Portrait of Sam Patel')}</p><h3>Sam Patel</h3><p>Designer</p>`],
				[4, `<p>${img(300, 300, 'Photo', 'Portrait of Jo Chen')}</p><h3>Jo Chen</h3><p>Developer</p>`],
			]),
		],
	},
	{
		id: 'contact',
		name: 'Contact details',
		category: 'Calls to action',
		description: 'Address, phone and email in three columns.',
		rows: [
			row([
				[4, '<h3>Visit</h3><p>1 Example Street<br>Town, AB1 2CD</p>'],
				[4, '<h3>Call</h3><p><a href="tel:+440000000000">0000 000 000</a></p>'],
				[4, '<h3>Email</h3><p><a href="mailto:hello@example.com">hello@example.com</a></p>'],
			]),
		],
	},
];
