/**
 * A popover centred over the editor, just below its toolbar: the block menu
 * and the assistant chat. It sits in the top layer (popover API) with the page
 * dimmed behind, so the editor or host page can't clip it. Escape, the close
 * button, a click on the dimmed page or tabbing away closes it, and focus goes
 * back to where it came from.
 */
import type { Editor } from '../editor';
import { h, nextId } from './dom';

export interface PopoverOptions {
	title: string;
	className?: string;
	/** While true, clicks outside and focus leaving don't close it (a block being dragged). */
	busy?: () => boolean;
	/** Close when focus moves out of it (tabbing away). Default true. */
	closeOnFocusOut?: boolean;
	/** After it closes; `refocus` is true when focus went back (Escape, the close button). */
	onClose?: (refocus: boolean) => void;
}

export class CentredPopover {
	readonly el: HTMLElement;
	/** Where the content goes, below the title bar. */
	readonly body: HTMLElement;
	isOpen = false;
	private returnTo: HTMLElement | null = null;

	constructor(
		private editor: Editor,
		private opts: PopoverOptions,
	) {
		const titleId = nextId('bf-pop');
		const close = h('button', { type: 'button', className: 'bf-btn bf-btn-icon', 'aria-label': `Close ${opts.title.toLowerCase()}` }, '×');
		close.addEventListener('click', () => this.close(true));
		this.body = h('div', { className: 'bf-pop-body' });
		this.el = h(
			'div',
			{ className: 'bf-pop ' + (opts.className ?? ''), role: 'dialog', 'aria-labelledby': titleId, hidden: true },
			h('div', { className: 'bf-pop-head' }, h('h2', { className: 'bf-pop-title', id: titleId }, opts.title), close),
			this.body,
		);
		if ('popover' in this.el) this.el.setAttribute('popover', 'manual');
		this.el.addEventListener('keydown', (e) => {
			if (e.key === 'Escape' && !e.defaultPrevented) {
				e.preventDefault();
				e.stopPropagation();
				this.close(true);
			}
		});
		this.el.addEventListener('focusout', (e) => {
			const to = e.relatedTarget as Node | null;
			if (this.opts.closeOnFocusOut === false || this.opts.busy?.()) return;
			if (to && !this.el.contains(to)) this.close(false);
		});
	}

	/** Open it; `returnTo` gets focus back when it closes. */
	open(returnTo: HTMLElement | null): void {
		this.returnTo = returnTo;
		if (!this.el.isConnected) this.editor.root.append(this.el);
		this.el.hidden = false;
		if (this.el.hasAttribute('popover') && !this.el.matches(':popover-open')) this.el.showPopover();
		this.isOpen = true;
		this.place();
		document.addEventListener('pointerdown', this.onOutside, true);
		this.editor.canvas.doc?.addEventListener('pointerdown', this.onOutside, true);
		window.addEventListener('resize', this.onResize);
		window.addEventListener('scroll', this.onResize, true);
	}

	close(refocus: boolean): void {
		if (!this.isOpen) return;
		this.isOpen = false;
		if (this.el.hasAttribute('popover') && this.el.matches(':popover-open')) this.el.hidePopover();
		this.el.hidden = true;
		document.removeEventListener('pointerdown', this.onOutside, true);
		this.editor.canvas.doc?.removeEventListener('pointerdown', this.onOutside, true);
		window.removeEventListener('resize', this.onResize);
		window.removeEventListener('scroll', this.onResize, true);
		if (refocus && this.returnTo?.isConnected) this.returnTo.focus({ preventScroll: true });
		this.opts.onClose?.(refocus);
	}

	/** The element focus goes back to (it may have gone with a redraw). */
	get opener(): HTMLElement | null {
		return this.returnTo;
	}

	/**
	 * Centred over the editor, just below its toolbar (or the top of the
	 * screen once the toolbar has scrolled away).
	 */
	place(): void {
		if (!this.isOpen) return;
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const box = this.editor.root.getBoundingClientRect();
		const bar = this.editor.root.querySelector('.bf-toolbar')?.getBoundingClientRect();
		// The editor out of view (the page scrolled away): the middle of the screen
		const inView = box.bottom > 120 && box.top < vh - 120 && box.right > 0 && box.left < vw;
		const top = !inView
			? Math.max(8, vh * 0.12)
			: Math.max(8, Math.min(bar && bar.bottom > 0 ? bar.bottom + 8 : box.top + 8, vh - 248));
		this.el.style.maxHeight = `${Math.min(640, vh - top - 8)}px`;
		const w = this.el.getBoundingClientRect().width;
		const mid = inView ? Math.max(box.left, 0) + (Math.min(box.right, vw) - Math.max(box.left, 0)) / 2 : vw / 2;
		this.el.style.left = `${Math.max(8, Math.min(mid - w / 2, vw - w - 8))}px`;
		this.el.style.top = `${top}px`;
	}

	private onOutside = (e: Event) => {
		if (this.opts.busy?.()) return;
		const t = e.target as Node;
		// A click on the dimmed backdrop targets the popover itself, outside its box
		if (t === this.el && e instanceof PointerEvent) {
			const r = this.el.getBoundingClientRect();
			if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) return;
			return this.close(false);
		}
		if (this.el.contains(t) || (this.returnTo && this.returnTo.contains(t))) return;
		this.close(false);
	};

	private onResize = () => {
		if (!this.opts.busy?.()) this.place();
	};
}
