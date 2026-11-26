/**
 * Content checker: text contrast (measured on the rendered canvas, so theme,
 * row and column backgrounds count), images without alt text, skipped and
 * empty headings, and links with no text. Each issue can take you to its
 * column. When the editor can preview the site's dark mode, contrast is
 * checked in both modes. It can't judge everything: meaning, reading order,
 * colour used as the only cue and so on still need a person.
 */
import { formatRatio, textContrast } from '../a11y/contrast';
import type { Editor } from '../editor';
import type { ColorMode, Plugin } from '../types';
import { openDialog } from '../ui/dialog';
import { h } from '../ui/dom';
import { fragment } from '../converters/html';

export interface ContentIssue {
	message: string;
	rowId: string;
	colId: string;
	/** The element in the canvas, when it can be pinned down. */
	el?: Element;
	/** The site colour mode the problem shows in (contrast issues only). */
	mode?: ColorMode;
}

export interface CheckOptions {
	/** Run the structural checks (alt text, headings, links). Default true. */
	structure?: boolean;
	/** Run the contrast check. Default true. */
	contrast?: boolean;
	/** Tag contrast issues with this colour mode. */
	mode?: ColorMode;
}

/** Check the content as the canvas shows it now. */
export function checkContent(editor: Editor, opts: CheckOptions = {}): ContentIssue[] {
	const structure = opts.structure !== false;
	const issues: ContentIssue[] = [];
	let last = 0;
	editor.doc.rows.forEach((row, ri) => {
		row.cols.forEach((col, ci) => {
			if (col.kind !== 'rich') return;
			const where = `row ${ri + 1}, column ${ci + 1}`;
			// Check the live canvas when it is there, so Go to can find the element
			const live = editor.canvas.content(col.id);
			const root = live ?? fragment(col.html);
			const add = (message: string, el?: Element) => issues.push({ message: `${message} (${where})`, rowId: row.id, colId: col.id, el: live ? el : undefined });
			if (live && opts.contrast !== false) {
				checkContrast(
					live,
					(message, el) => issues.push({ message: `${message} (${where})`, rowId: row.id, colId: col.id, el, mode: opts.mode }),
					opts.mode ? ` in ${opts.mode} mode` : '',
				);
			}
			if (!structure) return;
			for (const img of Array.from(root.querySelectorAll('img'))) {
				if (!img.hasAttribute('alt')) add('Image has no alt text', img);
				else if (/^(image|photo|picture|img|describe)/i.test(img.alt.trim())) add(`Image alt text "${img.alt}" may not describe the image`, img);
			}
			for (const el of Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,h6'))) {
				const level = Number(el.tagName[1]);
				if (!el.textContent?.trim()) add(`Empty heading level ${level}`, el);
				if (last && level > last + 1) add(`Heading level ${level} skips from level ${last}`, el);
				last = level;
			}
			for (const a of Array.from(root.querySelectorAll('a'))) {
				if (!a.textContent?.trim() && !a.querySelector('img[alt]:not([alt=""])')) add('Link has no text', a);
			}
		});
	});
	return issues;
}

/** One issue per distinct failing colour pairing in a column, quoting the first text. */
function checkContrast(content: HTMLElement, add: (message: string, el?: Element) => void, inMode = ''): void {
	const seen = new Set<Element>();
	const reported = new Set<string>();
	let unknown: Element | undefined;
	const walker = content.ownerDocument.createTreeWalker(content, NodeFilter.SHOW_TEXT);
	for (let n = walker.nextNode(); n; n = walker.nextNode()) {
		const el = n.parentElement;
		if (!el || seen.has(el) || !n.textContent?.trim()) continue;
		seen.add(el);
		if (!el.getClientRects().length) continue;
		const res = textContrast(el);
		if (!res) {
			unknown ??= el;
			continue;
		}
		if (res.ratio >= res.required) continue;
		const key = formatRatio(res.ratio) + res.required;
		if (reported.has(key)) continue;
		reported.add(key);
		const sample = n.textContent.trim().replace(/\s+/g, ' ');
		const quote = sample.length > 30 ? sample.slice(0, 30) + '…' : sample;
		add(`Low contrast text${inMode} "${quote}": ${formatRatio(res.ratio)}, needs ${res.required}:1`, el);
	}
	if (unknown) add(`Text over a background image${inMode}: check its contrast by eye`, unknown);
}

const frame = (win: Window) => new Promise<void>((r) => win.requestAnimationFrame(() => r()));

/**
 * Check everything, and contrast in each colour mode the site has: the
 * canvas is switched to the other mode, measured and switched back.
 */
export async function checkAllModes(editor: Editor): Promise<ContentIssue[]> {
	if (!editor.siteTheme) return checkContent(editor);
	const start = editor.colorMode;
	const other: ColorMode = start === 'dark' ? 'light' : 'dark';
	const win = editor.canvas.doc.defaultView!;
	const issues = checkContent(editor, { mode: start });
	editor.setColorMode(other);
	try {
		// Let the iframe pick up the new colour scheme before measuring
		await frame(win);
		await frame(win);
		issues.push(...checkContent(editor, { structure: false, mode: other }));
	} finally {
		editor.setColorMode(start);
	}
	return issues;
}

export const checkerPlugin: Plugin = {
	id: 'checker',
	install(editor) {
		editor.registerCommand({
			id: 'check',
			label: 'Contrast checker',
			icon: 'audit',
			run: async (ed) => {
				const issues = await checkAllModes(ed);
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
									go = () => {
										if (issue.mode) ed.setColorMode(issue.mode);
										if (issue.el) ed.canvas.focusElement(issue.colId, issue.el);
										else ed.canvas.focusCol(issue.colId);
									};
									close?.(false);
								},
							}, 'Go to'),
						),
					);
				}
				const modes = ed.siteTheme ? ' in light and dark mode' : '';
				const scope = h('p', { className: 'bf-hint' }, `Checks text contrast${modes}, plus missing image alt text, heading levels and empty links. It isn’t a full accessibility audit.`);
				const body = issues.length ? [list, scope] : [h('p', {}, 'No problems found.'), scope];
				const p = openDialog(ed.root, {
					title: issues.length ? `${issues.length} possible problem${issues.length > 1 ? 's' : ''}` : 'Contrast checker',
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
