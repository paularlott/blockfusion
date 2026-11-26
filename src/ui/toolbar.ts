/**
 * The editor toolbar: role=toolbar with a roving tabindex. Tab enters and
 * leaves the toolbar as one stop; arrow keys, Home and End move inside it.
 * Toggle buttons expose their state with aria-pressed.
 */
import type { Editor } from '../editor';
import type { ToolbarItem } from '../types';
import { h, isMac } from './dom';
import { icon } from './icons';
import { openMenu } from './menu';

/** Turn "Mod+Shift+7" into a display string and an aria-keyshortcuts value. */
export function describeShortcut(shortcut: string): { text: string; aria: string } {
	const parts = shortcut.split('+');
	const keys: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Mod: isMac ? '⌘' : 'Ctrl', Alt: isMac ? '⌥' : 'Alt', Shift: isMac ? '⇧' : 'Shift' };
	const text = parts
		.map((p) => keys[p] ?? (p.length === 1 ? p.toUpperCase() : p))
		.join(isMac ? '' : '+');
	const aria = parts.map((p) => (p === 'Mod' ? (isMac ? 'Meta' : 'Control') : p)).join('+');
	return { text, aria };
}

/** How a command is reached from the keyboard, for tooltips and help: "⌘B" or "⌘; then B". */
export function commandKeys(editor: Editor, cmd: { shortcut?: string; chord?: string }): string | null {
	if (cmd.shortcut) return describeShortcut(cmd.shortcut).text;
	const lead = editor.options.chordKey ?? 'Mod+;';
	if (cmd.chord && lead) return `${describeShortcut(lead).text} then ${cmd.chord.toUpperCase()}`;
	return null;
}

interface Entry {
	item: ToolbarItem;
	el: HTMLElement;
}

export class Toolbar {
	readonly el: HTMLElement;
	private items: ToolbarItem[] = [];
	private entries: Entry[] = [];
	private active = 0;

	constructor(
		private editor: Editor,
		host: HTMLElement,
		label: string,
	) {
		this.el = h('div', { role: 'toolbar', 'aria-label': label, className: 'bf-toolbar', 'aria-orientation': 'horizontal' });
		this.el.addEventListener('keydown', (e) => this.onKey(e));
		this.el.addEventListener('focusin', (e) => {
			const i = this.entries.findIndex((x) => x.el === e.target);
			if (i >= 0) this.setActive(i);
			this.el.classList.remove('bf-tips-off');
		});
		host.appendChild(this.el);
	}

	add(item: ToolbarItem, where?: { before?: string; after?: string }): void {
		this.items = this.items.filter((i) => i.id !== item.id);
		let at = this.items.length;
		if (where?.before) {
			const i = this.items.findIndex((x) => x.id === where.before);
			if (i >= 0) at = i;
		} else if (where?.after) {
			const i = this.items.findIndex((x) => x.id === where.after);
			if (i >= 0) at = i + 1;
		}
		this.items.splice(at, 0, item);
	}

	remove(id: string): void {
		this.items = this.items.filter((i) => i.id !== id);
	}

	/** Build the DOM, optionally in the order of `layout` (ids, '|' separators). */
	build(layout?: string[]): void {
		this.el.textContent = '';
		this.entries = [];
		let list = this.items;
		if (layout?.length) {
			list = layout
				.map((id, i) => (id === '|' ? ({ type: 'separator', id: 'sep' + i } as ToolbarItem) : this.items.find((x) => x.id === id)))
				.filter((x): x is ToolbarItem => !!x);
		}
		// Drop separators at the ends or next to each other.
		list = list.filter((it, i, arr) => it.type !== 'separator' || (i > 0 && i < arr.length - 1 && arr[i - 1].type !== 'separator'));

		let group = h('div', { className: 'bf-tgroup', role: 'group' });
		this.el.append(group);
		for (const item of list) {
			if (item.type === 'separator') {
				group = h('div', { className: 'bf-tgroup', role: 'group' });
				this.el.append(h('div', { className: 'bf-tsep', role: 'separator', 'aria-orientation': 'vertical' }), group);
				continue;
			}
			const el = this.buildItem(item);
			group.append(el);
			this.entries.push({ item, el });
		}
		this.setActive(Math.min(this.active, this.entries.length - 1));
		this.update();
	}

	private buildItem(item: Exclude<ToolbarItem, { type: 'separator' }>): HTMLElement {
		if (item.type === 'menu') {
			const btn = h('button', {
				type: 'button',
				className: 'bf-tbtn bf-tbtn-menu',
				'aria-haspopup': 'menu',
				'aria-expanded': 'false',
				'data-tip': item.label,
				'data-id': item.id,
				style: item.minWidth ? `min-width:${item.minWidth}` : null,
			});
			if (item.icon) btn.insertAdjacentHTML('beforeend', icon(item.icon));
			if (item.value) btn.append(h('span', { className: 'bf-tbtn-value' }));
			btn.insertAdjacentHTML('beforeend', icon('chevron').replace('class="bf-icon"', 'class="bf-icon bf-chevron"'));
			btn.addEventListener('click', () => this.openItemMenu(item, btn));
			btn.addEventListener('keydown', (e) => {
				if (e.key === 'ArrowDown') {
					e.preventDefault();
					this.openItemMenu(item, btn);
				}
			});
			return btn;
		}
		const cmd = this.editor.commands.get(item.command);
		const label = item.label ?? cmd?.label ?? item.id;
		const shortcut = cmd?.shortcut ? describeShortcut(cmd.shortcut) : null;
		const keys = cmd ? commandKeys(this.editor, cmd) : null;
		const btn = h('button', {
			type: 'button',
			className: 'bf-tbtn',
			'aria-label': label,
			'data-tip': keys ? `${label} (${keys})` : label,
			'aria-keyshortcuts': shortcut?.aria ?? null,
			'aria-pressed': item.toggle ? 'false' : null,
			'data-id': item.id,
		});
		const ic = item.icon ?? cmd?.icon;
		if (ic) btn.insertAdjacentHTML('beforeend', icon(ic));
		if (item.text || !ic) btn.append(h('span', { className: 'bf-tbtn-text' }, item.text ?? label));
		// Keep the canvas selection when clicking with a mouse.
		btn.addEventListener('mousedown', (e) => e.preventDefault());
		btn.addEventListener('click', () => {
			if (btn.getAttribute('aria-disabled') === 'true') return;
			this.editor.exec(item.command);
		});
		return btn;
	}

	private openItemMenu(item: Extract<ToolbarItem, { type: 'menu' }>, btn: HTMLElement): void {
		if (btn.getAttribute('aria-disabled') === 'true') return;
		btn.setAttribute('aria-expanded', 'true');
		openMenu(this.editor.root, {
			label: item.label,
			items: item.items(this.editor),
			anchor: btn.getBoundingClientRect(),
			returnFocus: btn,
			onClose: () => btn.setAttribute('aria-expanded', 'false'),
		});
	}

	private setActive(i: number): void {
		if (i < 0) return;
		this.active = i;
		this.entries.forEach((e, j) => e.el.setAttribute('tabindex', j === i ? '0' : '-1'));
	}

	private onKey(e: KeyboardEvent): void {
		const n = this.entries.length;
		if (!n) return;
		let i = this.active;
		switch (e.key) {
			case 'ArrowRight':
				i = (i + 1) % n;
				break;
			case 'ArrowLeft':
				i = (i - 1 + n) % n;
				break;
			case 'Home':
				i = 0;
				break;
			case 'End':
				i = n - 1;
				break;
			case 'Escape':
				// Dismiss tooltips (WCAG 1.4.13) and go back to the canvas.
				this.el.classList.add('bf-tips-off');
				this.editor.focusCanvas();
				e.preventDefault();
				return;
			default:
				return;
		}
		e.preventDefault();
		this.setActive(i);
		this.entries[i].el.focus();
	}

	focus(): void {
		this.entries[this.active]?.el.focus();
	}

	/** Refresh pressed, disabled and value states from the editor. */
	update(): void {
		for (const { item, el } of this.entries) {
			if (item.type === 'menu') {
				const v = item.value?.(this.editor);
				const span = el.querySelector('.bf-tbtn-value');
				if (span) span.textContent = v ?? '';
				el.setAttribute('aria-label', v ? `${item.label}: ${v}` : item.label);
				const enabled = item.isEnabled ? item.isEnabled(this.editor) : true;
				el.setAttribute('aria-disabled', String(!enabled));
				continue;
			}
			if (item.type !== 'button') continue;
			const cmd = this.editor.commands.get(item.command);
			if (!cmd) continue;
			const enabled = cmd.isEnabled ? cmd.isEnabled(this.editor) : true;
			el.setAttribute('aria-disabled', String(!enabled));
			if (item.toggle) el.setAttribute('aria-pressed', String(!!cmd.isActive?.(this.editor)));
			// Commands may change their label (undo/redo name the step).
			const label = item.label ?? cmd.label;
			if (el.getAttribute('aria-label') !== label) {
				el.setAttribute('aria-label', label);
				const keys = commandKeys(this.editor, cmd);
				el.setAttribute('data-tip', keys ? `${label} (${keys})` : label);
			}
		}
	}
}
