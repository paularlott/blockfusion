/**
 * The block library: a side panel with search and categories. Blocks come
 * from the built-in set, the `blocks` option, `blocksUrl`, or plugins
 * calling `editor.addBlocks()`. Inserting converts to the active framework.
 */
import { DEFAULT_BLOCKS } from '../blocks/defaults';
import { BLOCK_DRAG_TYPE, type Editor } from '../editor';
import type { Block, Row } from '../model/types';
import type { Plugin } from '../types';
import { h, nextId } from '../ui/dom';
import { layoutPreview } from '../ui/dialogs/layout';

/** A schematic preview of a block: one bar per row, split by span. */
function blockPreview(editor: Editor, block: Block): HTMLElement {
	if (block.thumbnail) return h('img', { src: block.thumbnail, alt: '', className: 'bf-block-thumb' });
	let rows: Row[] = [];
	try {
		rows = editor.blockRows(block);
	} catch {
		/* unparseable HTML block: no preview */
	}
	const box = h('span', { className: 'bf-block-thumb bf-block-schema', 'aria-hidden': 'true' });
	for (const r of rows.slice(0, 3)) {
		box.append(r.kind === 'raw' ? layoutPreview([1]) : layoutPreview(r.cols.map((c) => c.span.md ?? c.span.sm ?? c.span.base)));
	}
	return box;
}

/** Where a clicked block goes, relative to the row being edited. */
export type BlockPlace = 'below' | 'above' | 'start' | 'end';

export function insertBlock(editor: Editor, block: Block, place: BlockPlace = 'below'): void {
	const rows = editor.blockRows(block);
	if (!rows.length) return editor.announce(`Block ${block.name} is empty`);
	const n = editor.doc.rows.length;
	const active = editor.activeRow ? editor.doc.rows.findIndex((r) => r.id === editor.activeRow) : -1;
	let index: number;
	if (place === 'start') index = 0;
	else if (place === 'end' || active < 0) index = n;
	else index = place === 'above' ? active : active + 1;
	editor.insertRowsAt(rows, index, `Insert block ${block.name}`);
}

export const blocksPlugin = (opts: { blocks?: Block[]; blocksUrl?: string; defaultBlocks?: boolean }): Plugin => ({
	id: 'blocks',
	install(editor) {
		if (opts.defaultBlocks !== false) editor.addBlocks(DEFAULT_BLOCKS);
		if (opts.blocks) editor.addBlocks(opts.blocks);
		if (opts.blocksUrl) void editor.loadBlocks(opts.blocksUrl);

		editor.registerCommand({
			id: 'blocks',
			label: 'Blocks',
			icon: 'blocks',
			shortcut: 'Mod+Alt+B',
			run: (ed) => ed.togglePanel('blocks'),
			isActive: (ed) => ed.openPanel === 'blocks',
		});
		editor.addToolbarItem({ type: 'button', id: 'blocks', command: 'blocks', toggle: true, text: 'Blocks' });

		let refresh = () => {};
		editor.addPanel({
			id: 'blocks',
			title: 'Blocks',
			render(container, ed) {
				const search = h('input', { type: 'search', className: 'bf-input', id: nextId('bf-bsearch'), autocomplete: 'off', placeholder: 'Search blocks' });
				const cat = h('select', { className: 'bf-input', id: nextId('bf-bcat') });
				// Where a clicked block goes; dragging places it directly
				const place = h('select', { className: 'bf-input', id: nextId('bf-bplace') });
				place.append(
					h('option', { value: 'below' }, 'Below the current row'),
					h('option', { value: 'above' }, 'Above the current row'),
					h('option', { value: 'start' }, 'At the top'),
					h('option', { value: 'end' }, 'At the end'),
				);
				const placeHint = nextId('bf-bplace-hint');
				place.setAttribute('aria-describedby', placeHint);
				const count = h('p', { className: 'bf-hint', role: 'status', 'aria-live': 'polite' });
				const list = h('ul', { className: 'bf-block-list', role: 'list' });
				container.append(
					h('div', { className: 'bf-field' }, h('label', { for: search.id, className: 'bf-label' }, 'Search'), search),
					h('div', { className: 'bf-field' }, h('label', { for: cat.id, className: 'bf-label' }, 'Category'), cat),
					h(
						'div',
						{ className: 'bf-field' },
						h('label', { for: place.id, className: 'bf-label' }, 'Insert'),
						place,
						h('p', { className: 'bf-hint', id: placeHint }, 'Or drag a block onto the page, above or below any row.'),
					),
					count,
					list,
				);

				refresh = () => {
					const cats = Array.from(new Set(ed.blocks.map((b) => b.category || 'Other'))).sort();
					const keep = cat.value;
					cat.textContent = '';
					cat.append(h('option', { value: '' }, 'All categories'), ...cats.map((c) => h('option', { value: c }, c)));
					cat.value = cats.includes(keep) ? keep : '';
					const q = search.value.trim().toLowerCase();
					const shown = ed.blocks.filter(
						(b) =>
							(!cat.value || (b.category || 'Other') === cat.value) &&
							(!q || `${b.name} ${b.description ?? ''} ${b.category ?? ''}`.toLowerCase().includes(q)),
					);
					list.textContent = '';
					for (const b of shown) {
						const descId = b.description ? nextId('bf-bdesc') : undefined;
						const btn = h(
							'button',
							{ type: 'button', className: 'bf-block', 'aria-describedby': descId, draggable: 'true' },
							blockPreview(ed, b),
							h('span', { className: 'bf-block-name' }, b.name),
							b.description ? h('span', { className: 'bf-block-desc', id: descId! }, b.description) : null,
						);
						btn.addEventListener('click', () => insertBlock(ed, b, place.value as BlockPlace));
						btn.addEventListener('dragstart', (e) => {
							ed.draggedBlock = b;
							e.dataTransfer?.setData(BLOCK_DRAG_TYPE, b.id);
							if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
							btn.classList.add('bf-dragging');
						});
						btn.addEventListener('dragend', () => {
							ed.draggedBlock = null;
							ed.canvas.hideDropLine();
							btn.classList.remove('bf-dragging');
						});
						list.append(h('li', {}, btn));
					}
					count.textContent = shown.length === 1 ? '1 block' : `${shown.length} blocks`;
				};
				search.addEventListener('input', refresh);
				cat.addEventListener('change', refresh);
				refresh();
			},
		});
		return editor.on('blockschange', () => refresh());
	},
});
