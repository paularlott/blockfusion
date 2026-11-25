/**
 * The Editor ties the model, converter, canvas, toolbar, history and plugins
 * together. Structural changes go through `apply()`, text changes through
 * `runText()` or typing, so every change lands in the history.
 */
import { normalizeBlock } from './blocks/normalize';
import { loadHTML } from './converters/convert';
import { getConverter } from './converters/registry';
import type { Converter } from './converters/types';
import { History } from './history/history';
import { clone, columnsOf, emptyDoc, findCol, findRow, insertRows, reId, scaleDoc, scaleRows } from './model/doc';
import { DEFAULT_COLUMNS, type Block, type Breakpoint, type Doc, type Row } from './model/types';
import { cleanPaste, textToHtml, type PasteFilter } from './paste/clean';
import type {
	CodeEditorFactory,
	ColorMode,
	Command,
	EditorOptions,
	HandleAction,
	MediaProvider,
	NamedValue,
	Panel,
	Plugin,
	SiteTheme,
	ToolbarItem,
} from './types';
import { normaliseContent, semanticInline } from './commands/text';
import { Canvas } from './ui/canvas';
import { deepActiveElement } from './ui/dialog';
import { h, isMac } from './ui/dom';
import { icon } from './ui/icons';
import { Announcer } from './ui/live';
import { closeMenus, openMenu } from './ui/menu';
import { Toolbar, describeShortcut } from './ui/toolbar';
import { builtinPlugins } from './plugins/index';
import { textareaCodeEditor } from './ui/code-editor';

export type FocusTarget = { kind: 'row-handle' | 'col-handle' | 'col'; id: string; atStart?: boolean } | null;

export interface ApplyOptions {
	focus?: FocusTarget | ((doc: Doc) => FocusTarget);
	announce?: string | ((doc: Doc) => string);
}

type Listener = (detail?: unknown) => void;

export const DEFAULT_FONTS: NamedValue[] = [
	{ name: 'Sans serif', value: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif' },
	{ name: 'Serif', value: 'Georgia, "Times New Roman", serif' },
	{ name: 'Monospace', value: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
	{ name: 'Rounded', value: '"Trebuchet MS", "Segoe UI", sans-serif' },
];

export const DEFAULT_SIZES: NamedValue[] = [
	{ name: 'Small', value: '0.875rem' },
	{ name: 'Normal', value: '1rem' },
	{ name: 'Large', value: '1.25rem' },
	{ name: 'Larger', value: '1.5rem' },
	{ name: 'Huge', value: '2rem' },
];

/** Text colours with at least 4.5:1 contrast on white. */
export const DEFAULT_COLORS: NamedValue[] = [
	{ name: 'Black', value: '#000000' },
	{ name: 'Slate', value: '#334155' },
	{ name: 'Grey', value: '#4b5563' },
	{ name: 'Red', value: '#b91c1c' },
	{ name: 'Orange', value: '#c2410c' },
	{ name: 'Green', value: '#15803d' },
	{ name: 'Teal', value: '#0e7490' },
	{ name: 'Blue', value: '#1d4ed8' },
	{ name: 'Purple', value: '#7e22ce' },
	{ name: 'Pink', value: '#be185d' },
];

interface ResolvedOptions extends EditorOptions {
	converter: string;
	stylesheets: string[];
	bodyClass: string;
	fonts: NamedValue[];
	fontSizes: NamedValue[];
	colors: NamedValue[];
	theme: 'auto' | 'light' | 'dark';
	breakpoint: Exclude<Breakpoint, 'base'>;
	height: string;
	minHeight: string;
	label: string;
	rawMarkers: boolean;
}

/** Parse "Mod+Shift+7" and test a keyboard event against it. */
export function matchShortcut(shortcut: string, e: KeyboardEvent): boolean {
	const parts = shortcut.split('+');
	const key = parts.pop()!;
	const want = { mod: parts.includes('Mod'), shift: parts.includes('Shift'), alt: parts.includes('Alt') };
	const mod = isMac ? e.metaKey : e.ctrlKey;
	if (mod !== want.mod || e.shiftKey !== want.shift || e.altKey !== want.alt) return false;
	if (isMac && e.ctrlKey && want.mod) return false;
	const codes: Record<string, string> = { '[': 'BracketLeft', ']': 'BracketRight', '\\': 'Backslash', ',': 'Comma', '.': 'Period', '/': 'Slash' };
	let code = codes[key];
	if (!code) code = /^\d$/.test(key) ? 'Digit' + key : /^[a-z]$/i.test(key) ? 'Key' + key.toUpperCase() : key;
	return e.code === code || (e.code === '' && e.key.toLowerCase() === key.toLowerCase());
}

export class Editor {
	readonly root: HTMLElement;
	readonly options: ResolvedOptions;
	readonly history = new History();
	readonly commands = new Map<string, Command>();
	readonly toolbar: Toolbar;
	readonly canvas: Canvas;
	readonly live: Announcer;
	readonly ready: Promise<void>;
	doc: Doc;
	converter: Converter;
	media: MediaProvider | null;
	blocks: Block[] = [];
	handleActions: HandleAction[] = [];
	pasteFilters: PasteFilter[] = [];
	codeEditor: CodeEditorFactory;
	activeRow: string | null = null;
	activeCol: string | null = null;
	selectedImage: HTMLImageElement | null = null;
	isReady = false;
	/** How the site switches light/dark, or null when the preview isn't available. */
	siteTheme: SiteTheme | null = null;
	/** The colour mode the canvas shows the site in. */
	colorMode: ColorMode = 'light';

	private target: HTMLElement;
	private textarea: HTMLTextAreaElement | null = null;
	private listeners = new Map<string, Set<Listener>>();
	private cleanups: Array<() => void> = [];
	private panels = new Map<string, { panel: Panel; el: HTMLElement; built: boolean }>();
	private panelHost: HTMLElement;
	private openPanelId: string | null = null;
	private fitPanel: () => void = () => {};
	private panelReturn: HTMLElement | null = null;
	private suppressInput = 0;
	private syncTimer = 0;
	private destroyed = false;

	constructor(target: HTMLElement, opts: EditorOptions = {}) {
		this.target = target;
		this.options = {
			...opts,
			converter: opts.converter ?? 'fusioncss',
			stylesheets: opts.stylesheets ?? [],
			bodyClass: opts.bodyClass ?? '',
			fonts: opts.fonts ?? DEFAULT_FONTS,
			fontSizes: opts.fontSizes ?? DEFAULT_SIZES,
			colors: opts.colors ?? DEFAULT_COLORS,
			theme: opts.theme ?? 'auto',
			breakpoint: opts.breakpoint ?? 'md',
			height: opts.height ?? 'auto',
			minHeight: opts.minHeight ?? '320px',
			label: opts.label ?? 'Page editor',
			rawMarkers: opts.rawMarkers !== false,
		};
		this.converter = this.resolveConverter(this.options.converter);
		this.media = opts.media ?? null;
		this.codeEditor = opts.codeEditor ?? textareaCodeEditor;

		let initial = opts.value;
		if (target instanceof HTMLTextAreaElement) {
			this.textarea = target;
			initial ??= target.value;
		} else {
			initial ??= target.innerHTML;
		}
		this.doc = this.fitDoc(initial && initial.trim() ? loadHTML(initial, this.converter) : emptyDoc());

		// Chrome: toolbar, then the canvas and side panel, then the live region.
		this.root = h('div', {
			className: 'bf-editor',
			role: 'region',
			'aria-label': this.options.label,
			'data-bf-theme': this.options.theme,
		});
		const header = h('div', { className: 'bf-header' });
		const main = h('div', { className: 'bf-main' });
		const stage = h('div', { className: 'bf-stage' });
		this.panelHost = h('aside', { className: 'bf-panel', hidden: true });
		main.append(stage, this.panelHost);
		this.root.append(header, main);
		this.live = new Announcer(this.root);
		this.toolbar = new Toolbar(this, header, `${this.options.label} toolbar`);

		// The side panel sticks below the toolbar, whose height changes as it
		// wraps (and is 0 when the toolbar scrolls away on narrow screens).
		if (typeof ResizeObserver !== 'undefined') {
			const measure = () => {
				const sticky = getComputedStyle(header).position === 'sticky';
				this.root.style.setProperty('--bf-header-h', `${sticky ? Math.ceil(header.getBoundingClientRect().height) : 0}px`);
			};
			const ro = new ResizeObserver(measure);
			ro.observe(header);
			ro.observe(this.root);
			this.cleanups.push(() => ro.disconnect());
		}

		// Near the end of the editor there is less room below the toolbar than
		// the panel's height: shrink it to fit rather than slide under the toolbar.
		let roomFrame = 0;
		const fitPanel = () => {
			roomFrame = 0;
			if (this.panelHost.hidden) return;
			const below = header.getBoundingClientRect().bottom;
			const end = main.getBoundingClientRect().bottom;
			this.root.style.setProperty('--bf-panel-room', `${Math.max(120, Math.floor(end - Math.max(below, main.getBoundingClientRect().top)))}px`);
		};
		const onScroll = () => {
			if (!roomFrame && !this.panelHost.hidden) roomFrame = requestAnimationFrame(fitPanel);
		};
		document.addEventListener('scroll', onScroll, { capture: true, passive: true });
		window.addEventListener('resize', onScroll, { passive: true });
		this.fitPanel = fitPanel;
		this.cleanups.push(() => {
			document.removeEventListener('scroll', onScroll, { capture: true });
			window.removeEventListener('resize', onScroll);
			cancelAnimationFrame(roomFrame);
		});

		if (this.textarea) {
			this.textarea.hidden = true;
			this.textarea.insertAdjacentElement('afterend', this.root);
			const form = this.textarea.form;
			if (form) {
				const sync = () => this.syncTextarea();
				form.addEventListener('submit', sync, true);
				form.addEventListener('formdata', sync);
				this.cleanups.push(() => {
					form.removeEventListener('submit', sync, true);
					form.removeEventListener('formdata', sync);
				});
			}
		} else {
			target.textContent = '';
			target.appendChild(this.root);
		}

		this.canvas = new Canvas(this, stage, {
			stylesheets: this.options.stylesheets,
			bodyClass: this.options.bodyClass,
			canvasCss: opts.canvasCss ?? '',
			lang: opts.lang ?? document.documentElement.lang ?? 'en',
			dir: opts.dir ?? 'ltr',
			title: `${this.options.label} content`,
		});
		if (this.options.height === 'auto') this.canvas.iframe.style.minHeight = this.options.minHeight;
		else this.canvas.iframe.style.height = this.options.height;

		// Chrome keyboard shortcuts (undo/redo etc.) outside the canvas too.
		this.root.addEventListener('keydown', (e) => this.onChromeKeyDown(e));

		for (const p of [...builtinPlugins(this.options), ...(opts.plugins ?? [])]) this.use(p);
		this.colorMode = opts.colorMode === 'dark' ? 'dark' : 'light';
		this.refreshSiteTheme();
		this.toolbar.build(this.options.toolbar);

		this.ready = this.canvas.ready.then(() => {
			if (this.destroyed) return;
			this.canvas.setGridStylesheet(this.converter.stylesheet ?? '');
			this.renderCanvas();
			this.isReady = true;
			// Stylesheets have loaded: prefers-color-scheme rules can be seen now
			this.refreshSiteTheme();
			this.syncTextarea();
			this.emit('ready');
		});
	}

	/* ================================================== public API */

	/** Install a plugin. */
	use(plugin: Plugin): void {
		const off = plugin.install(this);
		if (typeof off === 'function') this.cleanups.push(off);
	}

	getHTML(): string {
		return this.converter.render(this.doc, { rawMarkers: this.options.rawMarkers });
	}

	/** Replace the content. Markup from any known framework is converted. */
	setHTML(html: string, opts: { label?: string } = {}): void {
		const next = html.trim() ? loadHTML(html, this.converter) : emptyDoc();
		this.replaceDoc(this.fitDoc(next), opts.label ?? 'Replace content');
	}

	getDoc(): Doc {
		return clone(this.doc);
	}

	setDoc(doc: Doc, opts: { label?: string } = {}): void {
		this.replaceDoc(this.fitDoc(clone(doc)), opts.label ?? 'Replace content');
	}

	private replaceDoc(next: Doc, label: string): void {
		const before = this.doc;
		this.doc = next;
		this.history.record(label, before, next);
		this.renderCanvas();
		this.changed();
	}

	/**
	 * Work out how the site switches light/dark: the siteTheme option, the
	 * converter's convention, or prefers-color-scheme rules in the canvas
	 * stylesheets. Emits 'sitethemechange' when that changes.
	 */
	refreshSiteTheme(): void {
		const opt = this.options.siteTheme;
		let next: SiteTheme | null;
		if (opt === false) next = null;
		else if (opt) next = opt;
		else next = this.converter.siteTheme ?? (this.canvas?.usesColorSchemeMedia() ? 'media' : null);
		const changed = next !== this.siteTheme;
		this.siteTheme = next;
		if (!next) this.colorMode = 'light';
		this.canvas?.setColorMode(next, this.colorMode);
		if (changed) this.emit('sitethemechange', { available: !!next });
	}

	/** Preview the site in light or dark mode (only the canvas; content is unchanged). */
	setColorMode(mode: ColorMode): void {
		if (!this.siteTheme || mode === this.colorMode) return;
		this.colorMode = mode;
		this.canvas.setColorMode(this.siteTheme, mode);
		this.canvas.fitHeight();
		this.toolbar.update();
		this.emit('colormodechange', { mode });
	}

	/** Columns in the grid being edited (the converter's, 12 by default). */
	get columns(): number {
		return this.converter.columns ?? DEFAULT_COLUMNS;
	}

	/**
	 * A registered converter, built for the `columns` option when that
	 * differs from the converter's own grid size.
	 */
	private resolveConverter(id: string): Converter {
		const conv = getConverter(id);
		if (!conv) throw new Error(`BlockFusion: unknown converter "${id}"`);
		const want = this.options.columns;
		if (!want || want === (conv.columns ?? DEFAULT_COLUMNS)) return conv;
		if (!conv.withColumns) {
			console.warn(`BlockFusion: converter "${id}" has a fixed grid, ignoring columns: ${want}`);
			return conv;
		}
		return conv.withColumns(want);
	}

	/** Bring a document to the grid size being edited. */
	private fitDoc(doc: Doc): Doc {
		return columnsOf(doc) === this.columns ? doc : scaleDoc(doc, this.columns);
	}

	/**
	 * Switch the output framework. The content is re-rendered in its markup,
	 * and spans are rescaled when the new grid has a different column count.
	 */
	setConverter(id: string, opts: { stylesheets?: string[]; bodyClass?: string } = {}): void {
		const conv = this.resolveConverter(id);
		this.converter = conv;
		this.options.converter = id;
		this.doc = this.fitDoc(this.doc);
		if (opts.stylesheets) this.setStylesheets(opts.stylesheets);
		if (opts.bodyClass !== undefined) this.setBodyClass(opts.bodyClass);
		this.canvas.setGridStylesheet(conv.stylesheet ?? '');
		this.refreshSiteTheme();
		this.renderCanvas();
		this.announce(`Framework changed to ${conv.name}`);
		this.emit('converterchange', { id });
		this.changed();
	}

	setStylesheets(list: string[]): void {
		this.options.stylesheets = list;
		this.canvas.setStylesheets(list);
	}

	setBodyClass(cls: string): void {
		this.options.bodyClass = cls;
		this.canvas.setBodyClass(cls);
	}

	setTheme(theme: 'auto' | 'light' | 'dark'): void {
		this.options.theme = theme;
		this.root.setAttribute('data-bf-theme', theme);
	}

	setMediaProvider(media: MediaProvider | null): void {
		this.media = media;
	}

	setCodeEditor(factory: CodeEditorFactory): void {
		this.codeEditor = factory;
	}

	addPasteFilter(fn: PasteFilter): () => void {
		this.pasteFilters.push(fn);
		return () => (this.pasteFilters = this.pasteFilters.filter((f) => f !== fn));
	}

	on(event: string, fn: Listener): () => void {
		if (!this.listeners.has(event)) this.listeners.set(event, new Set());
		this.listeners.get(event)!.add(fn);
		return () => this.off(event, fn);
	}

	off(event: string, fn: Listener): void {
		this.listeners.get(event)?.delete(fn);
	}

	emit(event: string, detail?: unknown): void {
		for (const fn of Array.from(this.listeners.get(event) ?? [])) {
			try {
				fn(detail);
			} catch (err) {
				console.error(err);
			}
		}
	}

	undo(): void {
		const e = this.history.undo();
		if (!e) return this.announce('Nothing to undo');
		this.restore(e.before, `Undone: ${e.label}`);
	}

	redo(): void {
		const e = this.history.redo();
		if (!e) return this.announce('Nothing to redo');
		this.restore(e.after, `Redone: ${e.label}`);
	}

	announce(message: string): void {
		this.live.say(message);
	}

	/** Focus the editor: the active column, else the first one, else the add bar. */
	focus(): void {
		this.focusCanvas();
	}

	focusCanvas(): void {
		if (this.activeCol && this.canvas.content(this.activeCol)) {
			if (this.canvas.selectionCol === this.activeCol) this.canvas.restoreSelection();
			else this.canvas.focusCol(this.activeCol);
			return;
		}
		const first = this.doc.rows.find((r) => r.cols.some((c) => c.kind === 'rich'));
		const col = first?.cols.find((c) => c.kind === 'rich');
		if (col) this.canvas.focusCol(col.id, true);
		else this.canvas.doc?.querySelector<HTMLElement>('.bf-addbar button, .bf-handle')?.focus();
	}

	exec(id: string, arg?: unknown): void {
		const cmd = this.commands.get(id);
		if (!cmd) {
			console.warn(`BlockFusion: unknown command "${id}"`);
			return;
		}
		if (cmd.isEnabled && !cmd.isEnabled(this)) return;
		void cmd.run(this, arg);
	}

	registerCommand(cmd: Command): void {
		this.commands.set(cmd.id, cmd);
	}

	addToolbarItem(item: ToolbarItem, where?: { before?: string; after?: string }): void {
		this.toolbar.add(item, where);
		if (this.isReady) this.toolbar.build(this.options.toolbar);
	}

	removeToolbarItem(id: string): void {
		this.toolbar.remove(id);
		if (this.isReady) this.toolbar.build(this.options.toolbar);
	}

	addHandleAction(action: HandleAction): void {
		this.handleActions = this.handleActions.filter((a) => a.id !== action.id);
		this.handleActions.push(action);
	}

	addBlocks(input: Block[] | unknown[]): void {
		// Blocks may be written in the short JSON form; fill in the defaults
		const blocks = (input as unknown[]).map(normalizeBlock).filter((b): b is Block => b !== null);
		const ids = new Set(blocks.map((b) => b.id));
		this.blocks = [...this.blocks.filter((b) => !ids.has(b.id)), ...blocks];
		this.emit('blockschange');
	}

	/** Fetch blocks (a JSON array) from a URL and add them. */
	async loadBlocks(url: string): Promise<void> {
		try {
			const res = await fetch(url, { credentials: 'same-origin' });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json();
			this.addBlocks(Array.isArray(data) ? data : data.blocks ?? []);
		} catch (err) {
			console.error('BlockFusion: could not load blocks from', url, err);
			this.announce('The block library could not be loaded');
		}
	}

	/* ------------------------------------------------------ panels */

	addPanel(panel: Panel): void {
		const titleId = `bf-panel-${panel.id}`;
		const closeBtn = h('button', { type: 'button', className: 'bf-btn bf-btn-icon', 'aria-label': `Close ${panel.title}`, onclick: () => this.closePanel() });
		closeBtn.innerHTML = icon('close');
		const el = h(
			'section',
			{ className: 'bf-panel-section', 'aria-labelledby': titleId, hidden: true, 'data-panel': panel.id },
			h('header', { className: 'bf-panel-header' }, h('h2', { id: titleId, className: 'bf-panel-title' }, panel.title), closeBtn),
			h('div', { className: 'bf-panel-body' }),
		);
		el.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				this.closePanel();
			}
		});
		this.panelHost.append(el);
		this.panels.set(panel.id, { panel, el, built: false });
	}

	get openPanel(): string | null {
		return this.openPanelId;
	}

	togglePanel(id: string): void {
		if (this.openPanelId === id) this.closePanel();
		else this.showPanel(id);
	}

	showPanel(id: string): void {
		const p = this.panels.get(id);
		if (!p) return;
		if (this.openPanelId !== id) this.panelReturn = deepActiveElement();
		for (const other of this.panels.values()) other.el.hidden = other !== p;
		if (!p.built) {
			p.panel.render(p.el.querySelector('.bf-panel-body') as HTMLElement, this);
			p.built = true;
		}
		this.panelHost.hidden = false;
		this.root.classList.add('bf-panel-open');
		this.fitPanel();
		this.openPanelId = id;
		p.panel.onOpen?.(this);
		const first = p.el.querySelector<HTMLElement>('.bf-panel-body input, .bf-panel-body select, .bf-panel-body button');
		(first ?? p.el.querySelector<HTMLElement>('button'))?.focus();
		this.toolbar.update();
	}

	closePanel(): void {
		if (!this.openPanelId) return;
		this.panelHost.hidden = true;
		this.root.classList.remove('bf-panel-open');
		this.openPanelId = null;
		this.toolbar.update();
		const back = this.panelReturn;
		this.panelReturn = null;
		if (back?.isConnected) back.focus();
		else this.toolbar.focus();
	}

	destroy(): void {
		if (this.destroyed) return;
		this.syncTextarea();
		this.destroyed = true;
		closeMenus();
		for (const fn of this.cleanups.reverse()) {
			try {
				fn();
			} catch (err) {
				console.error(err);
			}
		}
		this.canvas.destroy();
		this.live.destroy();
		this.root.remove();
		if (this.textarea) this.textarea.hidden = false;
		else this.target.innerHTML = this.getHTML();
		this.emit('destroy');
		this.listeners.clear();
	}

	/* ================================================== changes */

	/**
	 * Run a structural change as one history step. The mutator works on a
	 * draft copy; returning false cancels the change.
	 */
	apply(label: string, mutate: (draft: Doc) => boolean | void, opts: ApplyOptions = {}): boolean {
		this.history.seal();
		const before = this.doc;
		const draft = clone(this.doc);
		if (mutate(draft) === false) return false;
		this.doc = draft;
		this.history.record(label, before, draft);
		this.renderCanvas();
		const focus = typeof opts.focus === 'function' ? opts.focus(draft) : opts.focus;
		if (focus) this.focusTarget(focus);
		const msg = typeof opts.announce === 'function' ? opts.announce(draft) : opts.announce;
		this.announce(msg ?? label);
		this.changed();
		return true;
	}

	/**
	 * Run a text command in the column that last had the caret, as one
	 * history step. `fn` gets the canvas document with the selection restored.
	 */
	runText(label: string, fn: (doc: Document, content: HTMLElement, colId: string) => void): boolean {
		const colId = this.canvas.restoreSelection();
		if (!colId) {
			this.announce('Place the cursor in a text column first');
			return false;
		}
		this.history.seal();
		const before = clone(this.doc);
		this.suppressInput++;
		try {
			const content = this.canvas.content(colId)!;
			fn(this.canvas.doc, content, colId);
			normaliseContent(content);
		} finally {
			this.suppressInput--;
		}
		this.commitCol(colId, label, before);
		this.toolbar.update();
		return true;
	}

	/** Read a column's content from the canvas into the model (neutral classes). */
	readCol(colId: string): string | null {
		const el = this.canvas.content(colId);
		if (!el) return null;
		const copy = el.cloneNode(true) as HTMLElement;
		for (const img of Array.from(copy.querySelectorAll('.bf-selected'))) {
			img.classList.remove('bf-selected');
			if (!img.getAttribute('class')) img.removeAttribute('class');
		}
		semanticInline(copy);
		let html = copy.innerHTML.trim();
		if (/^(<p>)?(<br>)?(<\/p>)?$/.test(html)) html = '';
		return this.converter.mapHtml(html, 'in');
	}

	private commitCol(colId: string, label: string, before: Doc, mergeKey?: string): void {
		const html = this.readCol(colId);
		const ref = findCol(this.doc, colId);
		if (html === null || !ref || ref.col.html === html) return;
		ref.col.html = html;
		this.history.record(label, before, this.doc, { mergeKey });
		this.changed();
	}

	private restore(target: Doc, message: string): void {
		const prev = this.doc;
		this.doc = this.fitDoc(clone(target));
		const active = deepActiveElement();
		const wasHandle = active?.getAttribute?.('data-bf-handle');
		const handleId = wasHandle === 'row' ? active!.getAttribute('data-bf-for-row') : active?.getAttribute?.('data-bf-for-col');
		const strip = (d: Doc) =>
			JSON.stringify(d.rows.map((r) => ({ ...r, cols: r.cols.map((c) => (c.kind === 'rich' ? { ...c, html: '' } : c)) })));

		if (strip(prev) === strip(this.doc)) {
			// Only text changed: update those columns and keep everything else.
			let last: string | null = null;
			for (const row of this.doc.rows) {
				for (const col of row.cols) {
					const old = findCol(prev, col.id);
					if (old && old.col.html !== col.html) {
						this.canvas.setColContent(col.id, col.html, this.converter);
						last = col.id;
					}
				}
			}
			if (last) this.canvas.focusCol(last);
		} else {
			this.renderCanvas();
			if (wasHandle && handleId && this.canvas.focusHandle(wasHandle as 'row' | 'col', handleId)) {
				/* focus kept on the same handle */
			} else if (this.activeCol && this.canvas.content(this.activeCol)) this.canvas.focusCol(this.activeCol);
			else this.focusCanvas();
		}
		this.announce(message);
		this.toolbar.update();
		this.changed();
	}

	focusTarget(t: NonNullable<FocusTarget>): void {
		if (t.kind === 'col') {
			if (!this.canvas.focusCol(t.id, t.atStart)) this.canvas.focusHandle('col', t.id);
		} else this.canvas.focusHandle(t.kind === 'row-handle' ? 'row' : 'col', t.id);
		// Make it the current row and column even if no focus event follows
		// (a closing dialog can hand focus back elsewhere first).
		const el = t.kind === 'col' ? (this.canvas.content(t.id) ?? this.canvas.handleEl('col', t.id)) : this.canvas.handleEl(t.kind === 'row-handle' ? 'row' : 'col', t.id);
		if (el) this.onCanvasFocus(el);
	}

	renderCanvas(): void {
		if (!this.canvas.doc) return;
		this.canvas.render(this.doc, this.converter);
		this.selectedImage = null;
		if (this.activeRow && !findRow(this.doc, this.activeRow)) this.activeRow = null;
		if (this.activeCol && !findCol(this.doc, this.activeCol)) this.activeCol = null;
		this.canvas.setActive(this.activeRow, this.activeCol);
		this.toolbar.update();
	}

	/** Something in the document changed. */
	private changed(): void {
		this.emit('change');
		clearTimeout(this.syncTimer);
		this.syncTimer = window.setTimeout(() => this.syncTextarea(), 120);
	}

	syncTextarea(): void {
		clearTimeout(this.syncTimer);
		if (this.textarea) this.textarea.value = this.getHTML();
	}

	/** Insert rows (e.g. a block) after the active row, or at the end. */
	insertRowsAfterActive(rows: Row[], label: string): boolean {
		const i = this.activeRow ? this.doc.rows.findIndex((r) => r.id === this.activeRow) : -1;
		return this.insertRowsAt(rows, i >= 0 ? i + 1 : this.doc.rows.length, label);
	}

	/** Insert rows at a row index (0 is the top, rows.length the end). */
	insertRowsAt(rows: Row[], index: number, label: string): boolean {
		const fresh = rows.map((r) => reId(clone(r)));
		return this.apply(label, (d) => insertRows(d, fresh, index), {
			announce: (d) => `${label}: row ${d.rows.findIndex((r) => r.id === fresh[0].id) + 1} of ${d.rows.length}`,
		}) && (this.canvas.rowEl(fresh[0].id)?.scrollIntoView({ block: 'nearest' }), true);
	}

	/** The block being dragged from the block panel, if any. */
	draggedBlock: Block | null = null;

	/** Neutral rows for a block. HTML blocks are detected and converted. */
	blockRows(block: Block): Row[] {
		if (typeof block.rows === 'string') {
			const doc = loadHTML(block.rows, this.converter);
			return scaleRows(doc.rows, columnsOf(doc), this.columns);
		}
		return scaleRows(clone(block.rows), block.columns ?? DEFAULT_COLUMNS, this.columns);
	}

	/* ================================================== canvas events */

	onCanvasBeforeInput(e: InputEvent): void {
		if (e.inputType === 'historyUndo' || e.inputType === 'historyRedo') {
			e.preventDefault();
			if (e.inputType === 'historyUndo') this.undo();
			else this.redo();
		}
	}

	onCanvasInput(e: InputEvent): void {
		if (this.suppressInput) return;
		const colId = this.canvas.colOf(e.target as Node);
		if (!colId) return;
		const label = e.inputType?.startsWith('delete') ? 'Delete text' : e.inputType === 'insertFromDrop' ? 'Drop' : 'Typing';
		const before = clone(this.doc);
		this.commitCol(colId, label, before, label === 'Drop' ? undefined : `type:${colId}`);
	}

	onCanvasKeyDown(e: KeyboardEvent): void {
		if (this.handleShortcut(e)) return;
		const target = e.target as HTMLElement;
		if (e.key === 'Escape' && target.hasAttribute?.('data-bf-content')) {
			// Escape leaves the text for the column's handle (keyboard structure editing).
			e.preventDefault();
			this.canvas.focusHandle('col', target.getAttribute('data-bf-content')!);
		}
	}

	private onChromeKeyDown(e: KeyboardEvent): void {
		const t = e.target as HTMLElement;
		// Leave text fields (dialogs, search) their own undo.
		if (t.closest('input, textarea, select, [contenteditable="true"], .bf-dialog')) return;
		this.handleShortcut(e, true);
	}

	/** Global shortcuts: undo/redo, toolbar focus and every command shortcut. */
	private handleShortcut(e: KeyboardEvent, chrome = false): boolean {
		const mod = isMac ? e.metaKey : e.ctrlKey;
		let hit: (() => void) | null = null;
		if (mod && !e.altKey && e.code === 'KeyZ') hit = e.shiftKey ? () => this.redo() : () => this.undo();
		else if (!isMac && e.ctrlKey && !e.shiftKey && !e.altKey && e.code === 'KeyY') hit = () => this.redo();
		else if (e.altKey && e.key === 'F10') hit = () => this.toolbar.focus();
		else if (!chrome) {
			for (const cmd of this.commands.values()) {
				if (cmd.shortcut && matchShortcut(cmd.shortcut, e)) {
					hit = () => this.exec(cmd.id);
					break;
				}
			}
		}
		if (!hit) return false;
		e.preventDefault();
		e.stopPropagation();
		hit();
		return true;
	}

	onCanvasFocus(target: HTMLElement): void {
		const rowId = this.canvas.rowOf(target);
		const colId = target.getAttribute('data-bf-content') ?? target.getAttribute('data-bf-for-col') ?? target.closest?.('[data-bf-col]')?.getAttribute('data-bf-col') ?? null;
		if (colId !== this.activeCol) this.history.seal();
		this.activeRow = rowId;
		this.activeCol = colId;
		this.canvas.setActive(rowId, colId);
		this.toolbar.update();
	}

	onCanvasSelection(): void {
		const colId = this.canvas.selectionCol;
		if (colId && colId !== this.activeCol && this.canvas.doc.activeElement?.getAttribute('data-bf-content') === colId) {
			this.onCanvasFocus(this.canvas.content(colId)!);
		}
		this.toolbar.update();
		this.emit('selectionchange', { rowId: this.activeRow, colId: this.activeCol });
	}

	onCanvasClick(e: MouseEvent): void {
		const t = e.target as HTMLElement;
		if (this.selectedImage && this.selectedImage !== t) {
			this.selectedImage.classList.remove('bf-selected');
			if (!this.selectedImage.getAttribute('class')) this.selectedImage.removeAttribute('class');
			this.selectedImage = null;
		}
		if (t.tagName === 'IMG' && this.canvas.colOf(t)) {
			// Select the image so the image dialog edits it.
			this.selectedImage = t as HTMLImageElement;
			t.classList.add('bf-selected');
			const r = this.canvas.doc.createRange();
			r.selectNode(t);
			const sel = this.canvas.doc.getSelection()!;
			sel.removeAllRanges();
			sel.addRange(r);
		}
		if (t.closest('a') && this.canvas.colOf(t)) e.preventDefault();
	}

	onCanvasPointerDown(e: PointerEvent): void {
		closeMenus();
		// Clicking an HTML code row or column selects it, like a text column,
		// so "after the current row" means the row that was clicked. Text
		// columns select themselves when they take focus.
		const t = e.target as HTMLElement;
		if (this.typeInEmptySpace(e, t)) return;
		if (t.closest?.('[data-bf-row]') && !t.closest('[data-bf-content]')) this.onCanvasFocus(t);
	}

	/**
	 * A click on the empty part of a column (below its text, or beside a short
	 * column in grids where columns don't stretch) puts the caret at the end
	 * of that column's text, so the whole column is a place to type.
	 */
	private typeInEmptySpace(e: PointerEvent, t: HTMLElement): boolean {
		if (e.button !== 0) return false;
		let col: HTMLElement | null = null;
		if (t.matches?.('[data-bf-col]')) col = t;
		else if (t.matches?.('[data-bf-row]')) {
			// The row itself was hit: take the column under the pointer
			col = Array.from(t.querySelectorAll<HTMLElement>(':scope > [data-bf-col]')).find((c) => {
				const r = c.getBoundingClientRect();
				return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top;
			}) ?? null;
		}
		const colId = col?.getAttribute('data-bf-col');
		if (!colId || !this.canvas.content(colId)) return false;
		e.preventDefault();
		this.canvas.focusCol(colId);
		this.onCanvasFocus(this.canvas.content(colId)!);
		return true;
	}

	onCanvasPaste(e: ClipboardEvent): void {
		const colId = this.canvas.colOf(e.target as Node);
		if (!colId || !e.clipboardData) return;
		const files = Array.from(e.clipboardData.files ?? []).filter((f) => f.type.startsWith('image/'));
		e.preventDefault();
		if (files.length) {
			void this.insertImageFiles(files);
			return;
		}
		const html = e.clipboardData.getData('text/html');
		const text = e.clipboardData.getData('text/plain');
		this.runText('Paste', (doc) => {
			if (html) doc.execCommand('insertHTML', false, cleanPaste(html, this.pasteFilters));
			else if (!/\n/.test(text)) doc.execCommand('insertText', false, text);
			else doc.execCommand('insertHTML', false, textToHtml(text));
		});
	}

	onCanvasDragOver(e: DragEvent): void {
		const types = Array.from(e.dataTransfer?.types ?? []);
		// draggedBlock is set only while a drag from the block panel is under way
		if (this.draggedBlock) {
			// A block from the panel: show where it would land between rows
			e.preventDefault();
			e.dataTransfer!.dropEffect = 'copy';
			this.canvas.showDropLine(this.canvas.dropIndexAt(e.clientY));
			return;
		}
		if (!types.includes('Files')) return;
		const content = (e.target as HTMLElement).closest?.('[data-bf-content]');
		if (!content) return;
		e.preventDefault();
		e.dataTransfer!.dropEffect = 'copy';
		content.classList.add('bf-drop-target');
	}

	onCanvasDrop(e: DragEvent): void {
		const block = this.draggedBlock;
		if (block) {
			e.preventDefault();
			const index = this.canvas.dropIndexAt(e.clientY);
			this.canvas.hideDropLine();
			this.draggedBlock = null;
			const rows = this.blockRows(block);
			if (rows.length) this.insertRowsAt(rows, index, `Insert block ${block.name}`);
			return;
		}
		const content = (e.target as HTMLElement).closest?.('[data-bf-content]') as HTMLElement | null;
		content?.classList.remove('bf-drop-target');
		const files = Array.from(e.dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/'));
		if (!content || !files.length) return;
		e.preventDefault();
		// Put the caret where the image was dropped.
		const d = this.canvas.doc as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null };
		let range: Range | null = null;
		if (d.caretRangeFromPoint) range = d.caretRangeFromPoint(e.clientX, e.clientY);
		else if ('caretPositionFromPoint' in d) {
			const pos = (d as unknown as { caretPositionFromPoint(x: number, y: number): { offsetNode: Node; offset: number } | null }).caretPositionFromPoint(e.clientX, e.clientY);
			if (pos) {
				range = d.createRange();
				range.setStart(pos.offsetNode, pos.offset);
			}
		}
		content.focus();
		if (range && content.contains(range.startContainer)) {
			const sel = d.getSelection()!;
			sel.removeAllRanges();
			sel.addRange(range);
		}
		void this.insertImageFiles(files);
	}

	/** Upload image files (drop or paste) and insert them at the caret. */
	async insertImageFiles(files: File[]): Promise<void> {
		if (!this.media?.upload) {
			this.announce('Image upload is not available. Enter an image address instead.');
			this.exec('image');
			return;
		}
		for (const file of files) {
			this.announce(`Uploading ${file.name}`);
			try {
				const res = await this.media.upload(file);
				const alt = res.alt ?? '';
				this.runText('Insert image', (doc) => {
					const img = doc.createElement('img');
					img.src = res.src;
					img.alt = alt;
					doc.execCommand('insertHTML', false, img.outerHTML);
				});
				this.announce(alt ? `Image uploaded: ${alt}` : 'Image uploaded. Add alt text with the image button.');
			} catch (err) {
				console.error(err);
				this.announce(`Upload failed for ${file.name}`);
			}
		}
	}

	/* ================================================== handles */

	openHandleMenu(kind: 'row' | 'col', rowId: string, colId: string | undefined, btn: HTMLElement): void {
		const ref = { rowId, colId };
		const shown = this.handleActions.filter((a) => a.kind === kind && (a.visible ? a.visible(this, ref) : true));
		// No separator at either end or next to another, once hidden items are gone
		const tidy = shown.filter(
			(a, i, arr) => !a.id.startsWith('---') || (i > 0 && i < arr.length - 1 && !arr[i - 1].id.startsWith('---')),
		);
		const items = tidy
			.map((a) =>
				a.id.startsWith('---')
					? { label: '', separator: true }
					: {
							label: a.label,
							shortcut: a.shortcut ? describeShortcut(a.shortcut).text : undefined,
							danger: a.danger,
							disabled: a.disabled?.(this, ref),
							run: () => a.run(this, ref),
						},
			);
		// The handle is in the iframe; translate its box to page coordinates.
		const frame = this.canvas.iframe.getBoundingClientRect();
		const r = btn.getBoundingClientRect();
		const anchor = new DOMRect(frame.left + r.left, frame.top + r.top, r.width, r.height);
		btn.setAttribute('aria-expanded', 'true');
		const row = findRow(this.doc, rowId);
		const label = kind === 'row' ? `Row ${this.doc.rows.indexOf(row!) + 1} actions` : `Column ${(row?.cols.findIndex((c) => c.id === colId) ?? 0) + 1} actions`;
		openMenu(this.root, {
			label,
			items,
			anchor,
			returnFocus: btn,
			onClose: () => btn.setAttribute('aria-expanded', 'false'),
		});
	}

	onHandleKey(e: KeyboardEvent, kind: 'row' | 'col', rowId: string, colId?: string): void {
		const ref = { rowId, colId };
		for (const a of this.handleActions) {
			if (a.kind === kind && a.shortcut && matchKey(a.shortcut, e)) {
				e.preventDefault();
				e.stopPropagation();
				if (!a.disabled?.(this, ref)) a.run(this, ref);
				return;
			}
		}
		if (e.key === 'ArrowDown' && !e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
			e.preventDefault();
			this.openHandleMenu(kind, rowId, colId, e.currentTarget as HTMLElement);
		}
	}

	/** Open the code dialog for a raw row or column. */
	editRaw(rowId: string, colId?: string): void {
		this.exec('editRaw', { rowId, colId });
	}
}

/** The drag data type of a block dragged from the block panel. */
export const BLOCK_DRAG_TYPE = 'application/x-blockfusion-block';

/** Handle-key matching: like shortcuts, but "Alt+ArrowUp" style names use e.key. */
function matchKey(shortcut: string, e: KeyboardEvent): boolean {
	const parts = shortcut.split('+');
	const key = parts.pop()!;
	const want = { shift: parts.includes('Shift'), alt: parts.includes('Alt'), mod: parts.includes('Mod') };
	const mod = isMac ? e.metaKey : e.ctrlKey;
	const same = key.length === 1 ? e.key.toLowerCase() === key.toLowerCase() : e.key === key;
	return same && e.shiftKey === want.shift && e.altKey === want.alt && mod === want.mod;
}
