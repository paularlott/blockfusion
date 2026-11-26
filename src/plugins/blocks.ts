/**
 * The block library: an insert popover next to where it was opened (the
 * toolbar's Blocks button, or Add block at the end of the page), with search,
 * categories and a grid of blocks. Click or Enter inserts; dragging places a
 * block anywhere. Blocks come from the built-in set, the `blocks` option,
 * `blocksUrl`, or plugins calling `editor.addBlocks()`. Inserting converts to
 * the active framework.
 */
import { DEFAULT_BLOCKS } from '../blocks/defaults';
import { BLOCK_DRAG_TYPE, type Editor } from '../editor';
import type { Block, Row } from '../model/types';
import type { Plugin } from '../types';
import { h, nextId } from '../ui/dom';
import type { InsertAt } from '../commands/structure';
import { findRow } from '../model/doc';
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

/** Where the popover was opened from, and where its blocks go. */
interface OpenArgs {
	anchor?: Element;
	where?: InsertAt;
}

function insertIndex(editor: Editor, where: InsertAt): number {
	if (where.at === 'end') return editor.doc.rows.length;
	const i = editor.doc.rows.findIndex((r) => r.id === where.rowId);
	if (i < 0) return editor.doc.rows.length;
	return where.at === 'after' ? i + 1 : i;
}

class BlockPopover {
	readonly el: HTMLElement;
	private search: HTMLInputElement;
	private cat: HTMLSelectElement;
	private count: HTMLElement;
	private whereLine: HTMLElement;
	private grid: HTMLElement;
	private where: InsertAt = { at: 'end' };
	private anchor: Element | null = null;
	private returnTo: HTMLElement | null = null;
	private dragging = false;
	/** Opened by typing "/": closing without a block types the slash after all. */
	private bySlash = false;
	private picked = false;
	isOpen = false;

	constructor(private editor: Editor) {
		const titleId = nextId('bf-bpop');
		this.search = h('input', { type: 'search', className: 'bf-input', autocomplete: 'off', placeholder: 'Search blocks', 'aria-label': 'Search blocks' }) as HTMLInputElement;
		this.cat = h('select', { className: 'bf-input bf-blockpop-cat', 'aria-label': 'Category' }) as HTMLSelectElement;
		this.count = h('p', { className: 'bf-hint bf-blockpop-count', role: 'status', 'aria-live': 'polite' });
		this.whereLine = h('p', { className: 'bf-hint bf-blockpop-where' });
		this.grid = h('div', { className: 'bf-blockpop-grid', role: 'group', 'aria-label': 'Blocks' });
		const close = h('button', { type: 'button', className: 'bf-btn bf-btn-icon', 'aria-label': 'Close blocks' }, '×');
		close.addEventListener('click', () => this.close(true));
		this.el = h(
			'div',
			{ className: 'bf-blockpop', role: 'dialog', 'aria-labelledby': titleId, hidden: true },
			h('div', { className: 'bf-blockpop-head' }, h('h2', { className: 'bf-blockpop-title', id: titleId }, 'Add a block'), close),
			this.whereLine,
			h('div', { className: 'bf-blockpop-filters' }, this.search, this.cat),
			this.count,
			this.grid,
			h('p', { className: 'bf-hint bf-blockpop-foot' }, 'Enter adds a block here. Or drag one anywhere on the page.'),
		);
		// The top layer (popover API) keeps it above the editor and clear of any
		// overflow; it's positioned against the viewport either way
		if ('popover' in this.el) this.el.setAttribute('popover', 'manual');

		this.search.addEventListener('input', () => this.render());
		this.cat.addEventListener('change', () => this.render());
		this.search.addEventListener('keydown', (e) => {
			if (e.key === 'ArrowDown' || (e.key === 'Enter' && this.buttons()[0])) {
				e.preventDefault();
				if (e.key === 'Enter') this.buttons()[0].click();
				else this.buttons()[0]?.focus();
			}
		});
		this.grid.addEventListener('keydown', (e) => this.onGridKey(e));
		this.el.addEventListener('keydown', (e) => {
			if (e.key === 'Escape' && !e.defaultPrevented) {
				e.preventDefault();
				e.stopPropagation();
				this.close(true);
			}
		});
		this.el.addEventListener('focusout', (e) => {
			const to = e.relatedTarget as Node | null;
			if (!this.dragging && to && !this.el.contains(to)) this.close(false);
		});
	}

	private buttons(): HTMLButtonElement[] {
		return Array.from(this.grid.querySelectorAll<HTMLButtonElement>('.bf-block'));
	}

	/** Arrow keys move through the grid by row and column. */
	private onGridKey(e: KeyboardEvent): void {
		const all = this.buttons();
		const i = all.indexOf(document.activeElement as HTMLButtonElement);
		if (i < 0) return;
		const top = all[0].offsetTop;
		const perRow = Math.max(1, all.filter((b) => b.offsetTop === top).length);
		let next = i;
		if (e.key === 'ArrowRight') next = i + 1;
		else if (e.key === 'ArrowLeft') next = i - 1;
		else if (e.key === 'ArrowDown') next = i + perRow;
		else if (e.key === 'ArrowUp') {
			if (i < perRow) {
				e.preventDefault();
				this.search.focus();
				return;
			}
			next = i - perRow;
		} else if (e.key === 'Home') next = 0;
		else if (e.key === 'End') next = all.length - 1;
		else return;
		e.preventDefault();
		all[Math.max(0, Math.min(all.length - 1, next))].focus();
	}

	render(): void {
		const ed = this.editor;
		const cats = Array.from(new Set(ed.blocks.map((b) => b.category || 'Other'))).sort();
		const keep = this.cat.value;
		this.cat.textContent = '';
		this.cat.append(h('option', { value: '' }, 'All categories'), ...cats.map((c) => h('option', { value: c }, c)));
		this.cat.value = cats.includes(keep) ? keep : '';
		this.cat.hidden = cats.length < 2;
		const q = this.search.value.trim().toLowerCase();
		const shown = ed.blocks.filter(
			(b) =>
				(!this.cat.value || (b.category || 'Other') === this.cat.value) &&
				(!q || `${b.name} ${b.description ?? ''} ${b.category ?? ''}`.toLowerCase().includes(q)),
		);
		this.grid.textContent = '';
		for (const b of shown) {
			const descId = b.description ? nextId('bf-bdesc') : undefined;
			const btn = h(
				'button',
				{ type: 'button', className: 'bf-block', 'aria-describedby': descId, draggable: 'true' },
				blockPreview(ed, b),
				h('span', { className: 'bf-block-name' }, b.name),
				b.description ? h('span', { className: 'bf-block-desc', id: descId! }, b.description) : null,
			);
			btn.addEventListener('click', () => {
				const rows = ed.blockRows(b);
				this.picked = true;
				this.close(true);
				if (!rows.length) return ed.announce(`Block ${b.name} is empty`);
				const at = insertIndex(ed, this.where);
				if (!ed.insertRowsAt(rows, at, `Insert block ${b.name}`)) return;
				// The button that opened it can go with the redraw (Add block on an
				// empty page): carry on in the new block instead
				if (!this.returnTo?.isConnected) {
					const col = ed.doc.rows[at]?.kind !== 'raw' ? ed.doc.rows[at]?.cols[0] : undefined;
					if (col) ed.canvas.content(col.id)?.focus();
				}
			});
			let rowsAtStart = 0;
			btn.addEventListener('dragstart', (e) => {
				rowsAtStart = ed.doc.rows.length;
				ed.draggedBlock = b;
				e.dataTransfer?.setData(BLOCK_DRAG_TYPE, b.id);
				if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
				btn.classList.add('bf-dragging');
				// Let the page under the popover take the drop
				this.dragging = true;
				requestAnimationFrame(() => this.el.classList.add('bf-blockpop-dragging'));
			});
			btn.addEventListener('dragend', (e) => {
				ed.draggedBlock = null;
				ed.canvas.hideDropLine();
				this.dragging = false;
				btn.classList.remove('bf-dragging');
				// Escape, or a drop where blocks can't go: back to the list, on
				// the same block. A drop on the page adds the block, and closes it.
				const dropped = e.dataTransfer?.dropEffect !== 'none' || ed.doc.rows.length !== rowsAtStart;
				if (dropped) return this.close(false);
				this.el.classList.remove('bf-blockpop-dragging');
				btn.focus();
			});
			this.grid.append(btn);
		}
		this.count.textContent = shown.length === 1 ? '1 block' : `${shown.length} blocks`;
		if (!shown.length) this.grid.append(h('p', { className: 'bf-hint' }, 'No blocks match.'));
	}

	open(args: OpenArgs & { bySlash?: boolean }): void {
		const ed = this.editor;
		this.bySlash = !!args.bySlash;
		this.picked = false;
		this.where =
			args.where ?? (ed.activeRow && findRow(ed.doc, ed.activeRow) ? { at: 'after', rowId: ed.activeRow } : { at: 'end' });
		this.anchor = args.anchor ?? ed.root.querySelector('.bf-toolbar [data-id="blocks"]');
		// Opened by typing "/": go back to the text afterwards
		const typing = (ed.canvas.doc?.activeElement as HTMLElement | null)?.closest?.('[data-bf-content]') as HTMLElement | null;
		this.returnTo = (args.where && !args.anchor && typing) || ((this.anchor as HTMLElement | null) ?? null);
		this.search.value = '';
		const i = this.where.at === 'end' ? -1 : ed.doc.rows.findIndex((r) => r.id === (this.where as { rowId: string }).rowId);
		this.whereLine.textContent =
			i < 0 ? 'Adds at the end of the page.' : `Adds ${this.where.at === 'before' ? 'before' : 'after'} row ${i + 1} of ${ed.doc.rows.length}.`;
		this.el.classList.remove('bf-blockpop-dragging');
		if (!this.el.isConnected) ed.root.append(this.el);
		this.render();
		this.el.hidden = false;
		if (this.el.hasAttribute('popover')) this.el.showPopover();
		this.isOpen = true;
		this.place();
		this.search.focus();
		document.addEventListener('pointerdown', this.onOutside, true);
		ed.canvas.doc?.addEventListener('pointerdown', this.onOutside, true);
		window.addEventListener('resize', this.onResize);
		window.addEventListener('scroll', this.onResize, true);
		ed.toolbar.update();
		this.anchor?.setAttribute('aria-expanded', 'true');
	}

	/**
	 * Centred over the editor, just below its toolbar (or the top of the
	 * screen once the toolbar has scrolled away), so it always opens in the
	 * same place whichever button opened it.
	 */
	private place(): void {
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const box = this.editor.root.getBoundingClientRect();
		const bar = this.editor.root.querySelector('.bf-toolbar')?.getBoundingClientRect();
		const top = Math.max(8, Math.min(bar && bar.bottom > 0 ? bar.bottom + 8 : box.top + 8, vh - 248));
		this.el.style.maxHeight = `${Math.min(640, vh - top - 8)}px`;
		const w = this.el.getBoundingClientRect().width;
		const mid = Math.max(box.left, 0) + (Math.min(box.right, vw) - Math.max(box.left, 0)) / 2;
		this.el.style.left = `${Math.max(8, Math.min(mid - w / 2, vw - w - 8))}px`;
		this.el.style.top = `${top}px`;
	}

	private onOutside = (e: Event) => {
		if (this.dragging) return;
		const t = e.target as Node;
		// A click on the dimmed backdrop targets the popover itself, outside its box
		if (t === this.el && e instanceof PointerEvent) {
			const r = this.el.getBoundingClientRect();
			if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) return;
			return this.close(false);
		}
		if (this.el.contains(t) || (this.anchor && this.anchor.contains(t))) return;
		this.close(false);
	};
	private onResize = () => {
		if (this.isOpen && !this.dragging) this.place();
	};

	close(refocus: boolean): void {
		if (!this.isOpen) return;
		this.isOpen = false;
		if (this.el.hasAttribute('popover') && this.el.matches(':popover-open')) this.el.hidePopover();
		this.el.hidden = true;
		document.removeEventListener('pointerdown', this.onOutside, true);
		this.editor.canvas.doc?.removeEventListener('pointerdown', this.onOutside, true);
		window.removeEventListener('resize', this.onResize);
		window.removeEventListener('scroll', this.onResize, true);
		this.anchor?.setAttribute('aria-expanded', 'false');
		if (refocus && this.returnTo?.isConnected) this.returnTo.focus({ preventScroll: true });
		// "/" then Escape (or the close button) types a slash, so an empty line
		// can still start with one
		if (refocus && this.bySlash && !this.picked && !this.dragging) {
			this.editor.canvas.restoreSelection();
			this.editor.canvas.doc?.execCommand('insertText', false, '/');
		}
		this.bySlash = false;
		this.editor.toolbar.update();
	}
}

export const blocksPlugin = (opts: { blocks?: Block[]; blocksUrl?: string; defaultBlocks?: boolean }): Plugin => ({
	id: 'blocks',
	install(editor) {
		if (opts.defaultBlocks !== false) editor.addBlocks(DEFAULT_BLOCKS);
		if (opts.blocks) editor.addBlocks(opts.blocks);
		if (opts.blocksUrl) void editor.loadBlocks(opts.blocksUrl);

		const pop = new BlockPopover(editor);
		editor.registerCommand({
			id: 'blocks',
			label: 'Blocks',
			icon: 'blocks',
			chord: 'b',
			run: (ed, arg) => (pop.isOpen ? pop.close(true) : pop.open((arg as OpenArgs) ?? {})),
			isActive: () => pop.isOpen,
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
				pop.close(false);
				editor.removeToolbarItem('blocks');
			}
		};

		// "/" on an empty line opens the menu (Notion / WordPress style). Plain
		// typing is never a browser shortcut, unlike Cmd+Option+B on a Mac.
		const onSlash = (e: KeyboardEvent) => {
			if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || !hasBlocks(editor) || pop.isOpen) return;
			const target = e.target as HTMLElement;
			const colId = target.getAttribute?.('data-bf-content');
			if (!colId) return;
			const sel = target.ownerDocument.getSelection();
			const node = sel?.anchorNode;
			if (!sel?.isCollapsed || !node) return;
			const el = node.nodeType === 1 ? (node as Element) : node.parentElement;
			const line = el?.closest('p, h1, h2, h3, h4, h5, h6, li, div');
			if (!line || !target.contains(line) || (line.textContent ?? '').trim() !== '') return;
			const row = editor.doc.rows.find((r) => r.kind !== 'raw' && r.cols.some((c) => c.id === colId));
			e.preventDefault();
			pop.open({ where: row ? { at: 'after', rowId: row.id } : { at: 'end' }, bySlash: true });
		};
		let slashDoc: Document | null = null;
		const attachSlash = () => {
			const d = editor.canvas.doc;
			if (!d || d === slashDoc) return;
			slashDoc?.removeEventListener('keydown', onSlash);
			slashDoc = d;
			d.addEventListener('keydown', onSlash);
		};
		attachSlash();
		const offReady = editor.on('ready', attachSlash);

		const off = editor.on('blockschange', () => {
			if (pop.isOpen) pop.render();
			syncButton();
			editor.canvas.updateAddBar();
		});
		return () => {
			off?.();
			offReady?.();
			slashDoc?.removeEventListener('keydown', onSlash);
			pop.close(false);
			pop.el.remove();
		};
	},
});
