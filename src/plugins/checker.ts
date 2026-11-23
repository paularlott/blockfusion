/**
 * Content checker: images without alt text, skipped heading levels, empty
 * headings and links with no text. Each issue can take you to its column.
 */
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
		});
	});
	return issues;
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
				const body = issues.length ? list : h('p', {}, 'No problems found.');
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
