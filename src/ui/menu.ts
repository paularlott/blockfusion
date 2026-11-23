/**
 * Popup menus (role=menu) for toolbar dropdowns and the row/column handles.
 * Arrow keys, Home/End and first-letter typeahead move between items, Enter
 * or Space runs one, Escape closes and focus returns to the opener.
 */
import { h } from './dom';

export interface MenuItem {
	label: string;
	run?: () => void;
	/** Shown as a radio state (aria-checked) when defined. */
	checked?: boolean;
	disabled?: boolean;
	shortcut?: string;
	/** Inline style for the label (font previews). */
	style?: string;
	/** CSS colour shown as a swatch. */
	swatch?: string;
	separator?: boolean;
	danger?: boolean;
}

export interface MenuOptions {
	label: string;
	items: MenuItem[];
	anchor: DOMRect;
	returnFocus?: HTMLElement | null;
	onClose?: () => void;
	className?: string;
}

let current: { close: (refocus: boolean) => void } | null = null;

export function closeMenus(): void {
	current?.close(false);
}

export function openMenu(host: HTMLElement, opts: MenuOptions): () => void {
	current?.close(false);
	const menu = h('div', { role: 'menu', 'aria-label': opts.label, className: 'bf-menu ' + (opts.className ?? ''), tabindex: '-1' });
	const buttons: HTMLElement[] = [];
	const hasRadio = opts.items.some((i) => i.checked !== undefined);

	for (const item of opts.items) {
		if (item.separator) {
			menu.append(h('div', { role: 'separator', className: 'bf-menu-sep' }));
			continue;
		}
		const btn = h(
			'button',
			{
				type: 'button',
				role: item.checked !== undefined ? 'menuitemradio' : 'menuitem',
				'aria-checked': item.checked !== undefined ? String(item.checked) : null,
				'aria-disabled': item.disabled ? 'true' : null,
				tabindex: '-1',
				className: 'bf-menu-item' + (item.danger ? ' bf-menu-danger' : ''),
			},
			hasRadio ? h('span', { className: 'bf-menu-check', 'aria-hidden': 'true' }, item.checked ? '✓' : '') : null,
			item.swatch ? h('span', { className: 'bf-swatch', style: `background:${item.swatch}`, 'aria-hidden': 'true' }) : null,
			h('span', { className: 'bf-menu-label', style: item.style ?? null }, item.label),
			item.shortcut ? h('span', { className: 'bf-menu-key', 'aria-hidden': 'true' }, item.shortcut) : null,
		);
		btn.addEventListener('click', (e) => {
			e.preventDefault();
			if (item.disabled) return;
			close(true);
			item.run?.();
		});
		buttons.push(btn);
		menu.append(btn);
	}

	const focusAt = (i: number) => {
		const n = buttons.length;
		if (!n) return;
		buttons[((i % n) + n) % n].focus();
	};
	const index = () => buttons.indexOf(document.activeElement as HTMLElement);

	menu.addEventListener('keydown', (e) => {
		switch (e.key) {
			case 'ArrowDown':
				focusAt(index() + 1);
				break;
			case 'ArrowUp':
				focusAt(index() - 1);
				break;
			case 'Home':
				focusAt(0);
				break;
			case 'End':
				focusAt(buttons.length - 1);
				break;
			case 'Escape':
				close(true);
				break;
			case 'Tab':
				close(true);
				break;
			default:
				if (e.key.length === 1 && /\S/.test(e.key)) {
					const k = e.key.toLowerCase();
					const start = index() + 1;
					for (let j = 0; j < buttons.length; j++) {
						const b = buttons[(start + j) % buttons.length];
						if (b.textContent?.trim().toLowerCase().startsWith(k)) {
							b.focus();
							break;
						}
					}
					e.preventDefault();
				}
				return;
		}
		e.preventDefault();
		e.stopPropagation();
	});

	const onDocDown = (e: Event) => {
		if (!menu.contains(e.target as Node)) close(false);
	};
	let closed = false;
	function close(refocus: boolean) {
		if (closed) return;
		closed = true;
		menu.remove();
		document.removeEventListener('pointerdown', onDocDown, true);
		window.removeEventListener('resize', onResize);
		if (current?.close === close) current = null;
		opts.onClose?.();
		if (refocus && opts.returnFocus?.isConnected) opts.returnFocus.focus({ preventScroll: true });
	}
	const onResize = () => close(false);
	current = { close };

	host.appendChild(menu);
	// Position below the anchor, flipping up or left when it would overflow.
	const vw = window.innerWidth;
	const vh = window.innerHeight;
	const rect = menu.getBoundingClientRect();
	let left = Math.min(opts.anchor.left, vw - rect.width - 8);
	let top = opts.anchor.bottom + 4;
	if (top + rect.height > vh - 8 && opts.anchor.top - rect.height - 4 > 8) top = opts.anchor.top - rect.height - 4;
	left = Math.max(8, left);
	menu.style.left = `${left}px`;
	menu.style.top = `${Math.max(8, top)}px`;

	setTimeout(() => {
		document.addEventListener('pointerdown', onDocDown, true);
		window.addEventListener('resize', onResize);
	});
	const checked = opts.items.filter((i) => !i.separator).findIndex((i) => i.checked);
	focusAt(checked >= 0 ? checked : 0);
	return () => close(false);
}
