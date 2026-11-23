/**
 * Content checker: text contrast (measured on the rendered canvas, so theme,
 * row and column backgrounds count), images without alt text, skipped and
 * empty headings, and links with no text. Each issue can take you to its
 * column. It can't judge everything: meaning, reading order, colour used as
 * the only cue and so on still need a person.
 */
import { formatRatio, textContrast } from '../a11y/contrast';
import type { Editor } from '../editor';
import type { Plugin } from '../types';
import { openDialog } from '../ui/dialog';
import { h } from '../ui/dom';
import { fragment } from '../converters/html';

export interface ContentIssue {
	message: string;
	rowId: string;
	colId: string;
}

export function checkContent(editor: Editor): ContentIssue[] {
	const issues: ContentIssue[] = [];
	let last = 0;
	editor.doc.rows.forEach((row, ri) => {
		row.cols.forEach((col, ci) => {
			if (col.kind !== 'rich') return;
			const where = `row ${ri + 1}, column ${ci + 1}`;
			const root = fragment(col.html);
			const add = (message: string) => issues.push({ message: `${message} (${where})`, rowId: row.id, colId: col.id });
			for (const img of Array.from(root.querySelectorAll('img'))) {
				if (!img.hasAttribute('alt')) add('Image has no alt text');
				else if (/^(image|photo|picture|img|describe)/i.test(img.alt.trim())) add(`Image alt text "${img.alt}" may not describe the image`);
			}
			for (const el of Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,h6'))) {
				const level = Number(el.tagName[1]);
				if (!el.textContent?.trim()) add(`Empty heading level ${level}`);
				if (last && level > last + 1) add(`Heading level ${level} skips from level ${last}`);
				last = level;
			}
			for (const a of Array.from(root.querySelectorAll('a'))) {
				if (!a.textContent?.trim() && !a.querySelector('img[alt]:not([alt=""])')) add('Link has no text');
			}
			const live = editor.canvas.content(col.id);
			if (live) checkContrast(live, add);
		});
	});
	return issues;
}

/** One issue per distinct failing colour pairing in a column, quoting the first text. */
function checkContrast(content: HTMLElement, add: (message: string) => void): void {
	const seen = new Set<Element>();
	const reported = new Set<string>();
	let unknown = false;
	const walker = content.ownerDocument.createTreeWalker(content, NodeFilter.SHOW_TEXT);
	for (let n = walker.nextNode(); n; n = walker.nextNode()) {
		const el = n.parentElement;
		if (!el || seen.has(el) || !n.textContent?.trim()) continue;
		seen.add(el);
		if (!el.getClientRects().length) continue;
		const res = textContrast(el);
		if (!res) {
			unknown = true;
			continue;
		}
		if (res.ratio >= res.required) continue;
		const key = formatRatio(res.ratio) + res.required;
		if (reported.has(key)) continue;
		reported.add(key);
		const sample = n.textContent.trim().replace(/\s+/g, ' ');
		const quote = sample.length > 30 ? sample.slice(0, 30) + '…' : sample;
		add(`Low contrast text "${quote}": ${formatRatio(res.ratio)}, needs ${res.required}:1`);
	}
	if (unknown) add('Text over a background image or gradient: check its contrast by eye');
}

export const checkerPlugin: Plugin = {
	id: 'checker',
	install(editor) {
		editor.registerCommand({
			id: 'check',
			label: 'Check accessibility',
			icon: 'audit',
			run: async (ed) => {
				const issues = checkContent(ed);
				const list = h('ul', { className: 'bf-issues' });
				let go: (() => void) | undefined;
				let close: ((ok: boolean) => void) | undefined;
				for (const issue of issues) {
					list.append(
						h(
							'li',
							{},
							h('span', {}, issue.message),
							h('button', {
								type: 'button',
								className: 'bf-btn',
								onclick: () => {
									go = () => ed.canvas.focusCol(issue.colId);
									close?.(false);
								},
							}, 'Go to'),
						),
					);
				}
				const scope = h('p', { className: 'bf-hint' }, 'Checks text contrast, image alt text, headings and link text. Some things still need a person to judge, such as whether alt text is accurate.');
				const body = issues.length ? [list, scope] : [h('p', {}, 'No problems found.'), scope];
				const p = openDialog(ed.root, {
					title: issues.length ? `${issues.length} possible problem${issues.length > 1 ? 's' : ''}` : 'Content check',
					body,
					submitLabel: null,
					onReady: (fn) => (close = fn),
				});
				await p;
				(go as (() => void) | undefined)?.();
				ed.announce(issues.length ? `${issues.length} possible problems found` : 'No problems found');
			},
		});
		editor.addToolbarItem({ type: 'button', id: 'check', command: 'check' });
	},
};
