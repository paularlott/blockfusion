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

/** Insert a block after the current row (at the end when there is none). */
export function insertBlock(editor: Editor, block: Block): void {
	const rows = editor.blockRows(block);
	if (!rows.length) return editor.announce(`Block ${block.name} is empty`);
	editor.insertRowsAfterActive(rows, `Insert block ${block.name}`);
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
			isEnabled: (ed) => hasBlocks(ed),
		});
		// Blocks are offered when the page has some set up (built-in, the blocks
		// option, blocksUrl even while it loads) or adds them later
		const hasBlocks = (ed: Editor) => ed.blocks.length > 0 || !!opts.blocksUrl;
		const item = { type: 'button', id: 'blocks', command: 'blocks', toggle: true, text: 'Blocks' } as const;
		let shown = hasBlocks(editor);
		if (shown) editor.addToolbarItem(item);
		const syncButton = () => {
			const want = hasBlocks(editor);
			if (want === shown) return;
			shown = want;
			if (want) editor.addToolbarItem(item, { before: 'addRow' });
			else {
				if (editor.openPanel === 'blocks') editor.closePanel();
				editor.removeToolbarItem('blocks');
			}
		};

		let refresh = () => {};
		editor.addPanel({
			id: 'blocks',
			title: 'Blocks',
			render(container, ed) {
				const search = h('input', { type: 'search', className: 'bf-input', id: nextId('bf-bsearch'), autocomplete: 'off', placeholder: 'Search blocks' });
				const cat = h('select', { className: 'bf-input', id: nextId('bf-bcat') });
				const count = h('p', { className: 'bf-hint', role: 'status', 'aria-live': 'polite' });
				const list = h('ul', { className: 'bf-block-list', role: 'list' });
				container.append(
					h('div', { className: 'bf-field' }, h('label', { for: search.id, className: 'bf-label' }, 'Search'), search),
					h('div', { className: 'bf-field' }, h('label', { for: cat.id, className: 'bf-label' }, 'Category'), cat),
					h('p', { className: 'bf-hint' }, 'Click a block to add it after the current row, or drag it onto the page.'),
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
						btn.addEventListener('click', () => insertBlock(ed, b));
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
		return editor.on('blockschange', () => {
			refresh();
			syncButton();
			editor.canvas.updateAddBar();
		});
	},
});
