/**
 * Accessible modal dialogs: labelled, focus kept inside, Escape cancels and
 * focus goes back to where it came from (including inside the canvas).
 */
import { focusables, h, nextId } from './dom';
import { icon } from './icons';

export interface DialogButton {
	label: string;
	onClick: (close: (ok: boolean) => void) => void;
	danger?: boolean;
}

export interface DialogOptions {
	title: string;
	description?: string;
	body: Node | Node[];
	/** Label of the submit button. `null` shows only a Close button. */
	submitLabel?: string | null;
	cancelLabel?: string;
	extra?: DialogButton[];
	wide?: boolean;
	initialFocus?: HTMLElement | null;
	/** Element to focus when the dialog closes; defaults to the one focused before. */
	returnFocus?: HTMLElement | null;
	/** Return false to keep the dialog open (e.g. invalid input). */
	onSubmit?: () => boolean | void | Promise<boolean | void>;
	/** Receives the close function once the dialog is open. */
	onReady?: (close: (ok: boolean) => void) => void;
}

/** The focused element, looking inside same-origin iframes (the canvas). */
export function deepActiveElement(doc: Document = document): HTMLElement | null {
	let el = doc.activeElement as HTMLElement | null;
	while (el && el.tagName === 'IFRAME') {
		try {
			const inner = (el as HTMLIFrameElement).contentDocument?.activeElement as HTMLElement | null;
			if (!inner || inner === inner.ownerDocument.body) break;
			el = inner;
		} catch {
			break;
		}
	}
	return el;
}

export function openDialog(host: HTMLElement, opts: DialogOptions): Promise<boolean> {
	const returnTo = opts.returnFocus ?? deepActiveElement();
	const titleId = nextId('bf-dlg-title');
	const descId = opts.description ? nextId('bf-dlg-desc') : undefined;

	return new Promise<boolean>((resolve) => {
		let done = false;
		const form = h('form', { className: 'bf-dialog-form', method: 'dialog', novalidate: true });
		const dialog = h(
			'dialog',
			{
				className: 'bf-dialog' + (opts.wide ? ' bf-dialog-wide' : ''),
				'aria-labelledby': titleId,
				'aria-describedby': descId,
			},
			form,
		);

		const close = (ok: boolean) => {
			if (done) return;
			done = true;
			if (typeof dialog.close === 'function' && dialog.open) dialog.close();
			dialog.remove();
			if (returnTo && returnTo.isConnected) returnTo.focus({ preventScroll: true });
			resolve(ok);
		};

		const closeBtn = h('button', { type: 'button', className: 'bf-btn bf-btn-icon', 'aria-label': 'Close dialog', onclick: () => close(false) });
		closeBtn.innerHTML = icon('close');

		const header = h('header', { className: 'bf-dialog-header' }, h('h2', { id: titleId, className: 'bf-dialog-title' }, opts.title), closeBtn);
		const body = h('div', { className: 'bf-dialog-body' });
		if (opts.description) body.append(h('p', { id: descId!, className: 'bf-dialog-desc' }, opts.description));
		body.append(...(Array.isArray(opts.body) ? opts.body : [opts.body]));

		const footer = h('footer', { className: 'bf-dialog-footer' });
		const left = h('div', { className: 'bf-dialog-extra' });
		for (const b of opts.extra ?? []) {
			left.append(h('button', { type: 'button', className: 'bf-btn' + (b.danger ? ' bf-btn-danger' : ''), onclick: () => b.onClick(close) }, b.label));
		}
		footer.append(left);
		if (opts.submitLabel === null) {
			footer.append(h('button', { type: 'button', className: 'bf-btn bf-btn-primary', onclick: () => close(false) }, opts.cancelLabel ?? 'Close'));
		} else {
			footer.append(
				h('button', { type: 'button', className: 'bf-btn', onclick: () => close(false) }, opts.cancelLabel ?? 'Cancel'),
				h('button', { type: 'submit', className: 'bf-btn bf-btn-primary' }, opts.submitLabel ?? 'Save'),
			);
		}
		form.append(header, body, footer);

		form.addEventListener('submit', async (e) => {
			e.preventDefault();
			if (!form.checkValidity()) {
				const bad = form.querySelector<HTMLElement>(':invalid');
				bad?.focus();
				form.reportValidity?.();
				return;
			}
			const result = await opts.onSubmit?.();
			if (result !== false) close(true);
		});
		dialog.addEventListener('cancel', (e) => {
			e.preventDefault();
			close(false);
		});
		dialog.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				close(false);
			} else if (e.key === 'Tab') {
				// Keep focus inside the dialog.
				const items = focusables(dialog);
				if (!items.length) return;
				const first = items[0];
				const last = items[items.length - 1];
				const active = document.activeElement;
				if (e.shiftKey && (active === first || !dialog.contains(active))) {
					e.preventDefault();
					last.focus();
				} else if (!e.shiftKey && (active === last || !dialog.contains(active))) {
					e.preventDefault();
					first.focus();
				}
			}
		});

		host.appendChild(dialog);
		if (typeof dialog.showModal === 'function') dialog.showModal();
		else dialog.setAttribute('open', '');
		const target = opts.initialFocus ?? focusables(body)[0] ?? focusables(dialog)[0];
		target?.focus();
		opts.onReady?.(close);
	});
}

/** A labelled form field. */
export function field(label: string, control: HTMLElement, hint?: string): HTMLElement {
	const id = control.id || nextId('bf-field');
	control.id = id;
	const wrap = h('div', { className: 'bf-field' }, h('label', { for: id, className: 'bf-label' }, label), control);
	if (hint) {
		const hintId = nextId('bf-hint');
		control.setAttribute('aria-describedby', hintId);
		wrap.append(h('p', { id: hintId, className: 'bf-hint' }, hint));
	}
	return wrap;
}

export function input(props: Record<string, string | boolean | undefined> = {}): HTMLInputElement {
	return h('input', { className: 'bf-input', type: 'text', ...props });
}

export function checkbox(label: string, checked = false): { wrap: HTMLElement; input: HTMLInputElement } {
	const box = h('input', { type: 'checkbox', className: 'bf-check', id: nextId('bf-cb'), checked });
	return { input: box, wrap: h('div', { className: 'bf-field bf-field-check' }, box, h('label', { for: box.id }, label)) };
}
