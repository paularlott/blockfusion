/**
 * The canvas: a same-origin iframe that loads the host's stylesheets and
 * shows the document as real framework markup. Each column's content is a
 * contenteditable region; rows and columns get focusable handles; raw code
 * shows as a placeholder with an optional sandboxed preview.
 */
import type { Converter } from '../converters/types';
import { escapeAttr } from '../converters/html';
import type { Editor } from '../editor';
import type { Col, Doc, Row } from '../model/types';
import type { ColorMode, SiteTheme } from '../types';
import { CANVAS_CSS } from './canvas-css';
import { hIn } from './dom';
import { icon } from './icons';

export interface CanvasConfig {
	stylesheets: string[];
	bodyClass: string;
	canvasCss: string;
	lang: string;
	dir: string;
	title: string;
}

function absolute(url: string): string {
	try {
		return new URL(url, document.baseURI).href;
	} catch {
		return url;
	}
}

export class Canvas {
	readonly iframe: HTMLIFrameElement;
	win!: Window;
	doc!: Document;
	root!: HTMLElement;
	ready: Promise<void>;
	/** Last selection inside a column, restored before text commands. */
	private savedRange: Range | null = null;
	private resizeObs?: ResizeObserver;
	private siteTheme: SiteTheme | null = null;
	private colorMode: ColorMode = 'light';
	private gridStyle!: HTMLStyleElement;

	constructor(
		private editor: Editor,
		host: HTMLElement,
		private config: CanvasConfig,
	) {
		this.iframe = document.createElement('iframe');
		this.iframe.className = 'bf-canvas';
		// The canvas shows the site, not the editor theme: its colour scheme is
		// set here, so a dark editor doesn't turn prefers-color-scheme sites dark.
		this.iframe.style.colorScheme = 'light';
		this.iframe.title = config.title;
		this.iframe.srcdoc = this.srcdoc();
		host.appendChild(this.iframe);
		this.ready = new Promise((resolve) => {
			this.iframe.addEventListener('load', () => {
				this.init();
				resolve();
			}, { once: true });
		});
	}

	private srcdoc(): string {
		const c = this.config;
		const links = c.stylesheets.map((href) => `<link rel="stylesheet" href="${escapeAttr(absolute(href))}">`).join('');
		return (
			`<!doctype html><html lang="${escapeAttr(c.lang)}" dir="${escapeAttr(c.dir)}"><head><meta charset="utf-8">` +
			`<meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeAttr(c.title)}</title>` +
			`<base href="${escapeAttr(document.baseURI)}">${links}<style id="bf-grid-css"></style>` +
			`<style id="bf-canvas-css">${CANVAS_CSS}</style><style id="bf-host-css">${c.canvasCss}</style></head>` +
			`<body class="${escapeAttr(c.bodyClass)}"><div class="bf-root" data-bf-root></div></body></html>`
		);
	}

	private init(): void {
		this.win = this.iframe.contentWindow!;
		this.doc = this.iframe.contentDocument!;
		this.root = this.doc.querySelector('[data-bf-root]') as HTMLElement;
		this.gridStyle = this.doc.getElementById('bf-grid-css') as HTMLStyleElement;
		try {
			this.doc.execCommand('defaultParagraphSeparator', false, 'p');
			this.doc.execCommand('styleWithCSS', false, 'false');
		} catch {
			/* not supported */
		}
		const ed = this.editor;
		const d = this.doc;
		d.addEventListener('input', (e) => ed.onCanvasInput(e as InputEvent));
		d.addEventListener('beforeinput', (e) => ed.onCanvasBeforeInput(e as InputEvent));
		d.addEventListener('keydown', (e) => ed.onCanvasKeyDown(e));
		d.addEventListener('selectionchange', () => this.onSelectionChange());
		d.addEventListener('focusin', (e) => ed.onCanvasFocus(e.target as HTMLElement));
		d.addEventListener('click', (e) => ed.onCanvasClick(e));
		d.addEventListener('paste', (e) => ed.onCanvasPaste(e));
		d.addEventListener('dragover', (e) => ed.onCanvasDragOver(e));
		d.addEventListener('dragleave', (e) => {
			(e.target as HTMLElement).closest?.('.bf-drop-target')?.classList.remove('bf-drop-target');
			// Leaving the canvas altogether (relatedTarget is outside it)
			if (!e.relatedTarget) this.hideDropLine();
		});
		d.addEventListener('drop', (e) => ed.onCanvasDrop(e));
		d.addEventListener('pointerdown', () => ed.onCanvasPointerDown());
		this.applyTheme();
		if (typeof ResizeObserver !== 'undefined') {
			this.resizeObs = new ResizeObserver(() => this.fitHeight());
			this.resizeObs.observe(this.doc.documentElement);
		}
	}

	/** Grow the iframe to fit its content when the editor height is 'auto'. */
	fitHeight(): void {
		if (!this.doc || this.editor.options.height !== 'auto') return;
		const h = Math.ceil(this.root.getBoundingClientRect().bottom + (this.win.scrollY || 0)) + 24;
		const min = 0;
		const want = `${Math.max(min, h)}px`;
		if (this.iframe.style.height !== want) this.iframe.style.height = want;
	}

	setGridStylesheet(css: string): void {
		if (this.gridStyle) this.gridStyle.textContent = css;
	}

	setStylesheets(list: string[]): void {
		this.config.stylesheets = list;
		if (!this.doc) return;
		for (const l of Array.from(this.doc.head.querySelectorAll('link[data-bf-host], link[rel="stylesheet"]'))) l.remove();
		const anchor = this.gridStyle;
		for (const href of list) {
			const link = this.doc.createElement('link');
			link.rel = 'stylesheet';
			link.href = absolute(href);
			link.addEventListener('load', () => {
				this.fitHeight();
				this.editor.refreshSiteTheme();
			});
			this.doc.head.insertBefore(link, anchor);
		}
	}

	setBodyClass(cls: string): void {
		this.config.bodyClass = cls;
		if (this.doc) this.doc.body.className = cls;
		this.applyTheme();
	}

	/* ------------------------------------------------------- colour mode */

	/** Show the site in a colour mode, using the site's own switch. */
	setColorMode(theme: SiteTheme | null, mode: ColorMode): void {
		if (this.doc && this.siteTheme && this.siteTheme !== theme) this.clearTheme(this.siteTheme);
		this.siteTheme = theme;
		this.colorMode = mode;
		this.applyTheme();
	}

	private themeTarget(on?: 'html' | 'body'): HTMLElement {
		return on === 'body' ? this.doc.body : this.doc.documentElement;
	}

	private applyTheme(): void {
		const mode = this.colorMode;
		// Drives prefers-color-scheme and light-dark() inside the canvas
		this.iframe.style.colorScheme = mode;
		const t = this.siteTheme;
		if (!this.doc || !t || t === 'media') return;
		if (typeof t === 'function') t(this.doc, mode);
		else if ('attribute' in t) {
			const el = this.themeTarget(t.on);
			const v = mode === 'dark' ? (t.dark ?? 'dark') : t.light;
			if (v === undefined) el.removeAttribute(t.attribute);
			else el.setAttribute(t.attribute, v);
		} else {
			const el = this.themeTarget(t.on);
			el.classList.toggle(t.className, mode === 'dark');
			if (t.lightClassName) el.classList.toggle(t.lightClassName, mode === 'light');
		}
	}

	private clearTheme(t: SiteTheme): void {
		if (typeof t === 'function') t(this.doc, 'light');
		else if (t !== 'media' && 'attribute' in t) this.themeTarget(t.on).removeAttribute(t.attribute);
		else if (t !== 'media') {
			this.themeTarget(t.on).classList.remove(t.className);
			if (t.lightClassName) this.themeTarget(t.on).classList.remove(t.lightClassName);
		}
	}

	/**
	 * Whether the canvas stylesheets have prefers-color-scheme rules. Sheets
	 * from another origin can't be read and are skipped.
	 */
	usesColorSchemeMedia(): boolean {
		if (!this.doc) return false;
		const scan = (rules: CSSRuleList): boolean => {
			for (const r of Array.from(rules)) {
				const media = (r as CSSMediaRule).media;
				if (media && /prefers-color-scheme/.test(media.mediaText)) return true;
				const inner = (r as CSSGroupingRule).cssRules;
				if (inner && scan(inner)) return true;
			}
			return false;
		};
		for (const sheet of Array.from(this.doc.styleSheets)) {
			if ((sheet.ownerNode as Element | null)?.id === 'bf-canvas-css') continue;
			try {
				if (scan(sheet.cssRules)) return true;
			} catch {
				/* cross-origin */
			}
		}
		return false;
	}

	/* --------------------------------------------------------- rendering */

	render(model: Doc, conv: Converter): void {
		if (!this.doc) return;
		const d = this.doc;
		this.root.textContent = '';
		const n = model.rows.length;
		model.rows.forEach((row, i) => this.root.appendChild(this.renderRow(row, i, n, conv)));
		if (!n) this.root.appendChild(hIn(d, 'p', { className: 'bf-empty' }, 'This page is empty. Add a row or a block to start.'));
		this.root.appendChild(this.renderAddBar());
		this.savedRange = null;
		requestAnimationFrame(() => this.fitHeight());
	}

	private handle(kind: 'row' | 'col', label: string, rowId: string, colId?: string): HTMLElement {
		const b = hIn(this.doc, 'button', {
			type: 'button',
			className: `bf-handle bf-${kind}-handle`,
			contenteditable: 'false',
			'aria-haspopup': 'menu',
			'aria-expanded': 'false',
			'aria-label': label,
			'aria-keyshortcuts': kind === 'row' ? 'Alt+ArrowUp Alt+ArrowDown Delete' : 'Alt+ArrowLeft Alt+ArrowRight Alt+Shift+ArrowLeft Alt+Shift+ArrowRight Delete',
			'data-bf-handle': kind,
			'data-bf-for-row': rowId,
			'data-bf-for-col': colId,
		});
		b.innerHTML = icon('handle');
		b.addEventListener('click', (e) => {
			e.preventDefault();
			this.editor.openHandleMenu(kind, rowId, colId, b);
		});
		b.addEventListener('keydown', (e) => this.editor.onHandleKey(e, kind, rowId, colId));
		return b;
	}

	private renderRow(row: Row, i: number, n: number, conv: Converter): HTMLElement {
		const d = this.doc;
		const label = `Row ${i + 1} of ${n}`;
		if (row.kind === 'raw') {
			const el = hIn(d, 'div', { 'data-bf-row': row.id, className: 'bf-raw-row' });
			el.append(this.handle('row', `${label}, HTML code: actions`, row.id));
			el.append(this.rawBox(row.raw ?? '', `${label}: HTML/JavaScript`, row.id));
			return el;
		}
		const tag = row.attrs?.tag || 'div';
		const el = hIn(d, tag, { 'data-bf-row': row.id, className: conv.rowClass(row) });
		this.applyAttrs(el, row.attrs);
		el.append(this.handle('row', `${label}: actions`, row.id));
		const m = row.cols.length;
		row.cols.forEach((col, j) => el.append(this.renderCol(row, col, i, j, m, conv)));
		return el;
	}

	private renderCol(row: Row, col: Col, i: number, j: number, m: number, conv: Converter): HTMLElement {
		const d = this.doc;
		const tag = col.attrs?.tag || 'div';
		const el = hIn(d, tag, { 'data-bf-col': col.id, className: conv.colClass(col) });
		this.applyAttrs(el, col.attrs);
		const name = `Row ${i + 1}, column ${j + 1} of ${m}`;
		el.append(this.handle('col', `${name}: actions`, row.id, col.id));
		if (col.kind === 'raw') {
			el.append(this.rawBox(col.html, `${name}: HTML/JavaScript`, row.id, col.id));
		} else {
			const content = hIn(d, 'div', {
				className: 'bf-col-content',
				contenteditable: 'true',
				role: 'textbox',
				'aria-multiline': 'true',
				'aria-label': name,
				'data-placeholder': 'Type here…',
				'data-bf-content': col.id,
			});
			content.innerHTML = conv.mapHtml(col.html, 'out') || '<p><br></p>';
			el.append(content);
		}
		return el;
	}

	private applyAttrs(el: HTMLElement, attrs?: Row['attrs']): void {
		if (!attrs) return;
		if (attrs.id) el.id = attrs.id;
		if (attrs.style) el.setAttribute('style', attrs.style);
		for (const [k, v] of Object.entries(attrs.extra ?? {})) {
			// Event handler attributes would run in the canvas; skip them.
			if (/^on/i.test(k)) continue;
			try {
				el.setAttribute(k, v);
			} catch {
				/* invalid attribute name */
			}
		}
	}

	private rawBox(code: string, label: string, rowId: string, colId?: string): HTMLElement {
		const d = this.doc;
		const box = hIn(d, 'div', { className: 'bf-raw-box', role: 'group', 'aria-label': label });
		const summary = code.trim().replace(/\s+/g, ' ').slice(0, 160) || '(empty)';
		const edit = hIn(d, 'button', { type: 'button', className: 'bf-cbtn', 'data-bf-raw-edit': '' });
		edit.innerHTML = icon('code');
		edit.append('Edit code');
		edit.addEventListener('click', () => this.editor.editRaw(rowId, colId));
		const toggle = hIn(d, 'button', { type: 'button', className: 'bf-cbtn', 'aria-pressed': 'false' }, 'Preview');
		let frame: HTMLIFrameElement | null = null;
		toggle.addEventListener('click', () => {
			const on = toggle.getAttribute('aria-pressed') !== 'true';
			toggle.setAttribute('aria-pressed', String(on));
			if (on) {
				// Scripts run only in a sandbox with no access to the editor or the site.
				frame = hIn(d, 'iframe', { className: 'bf-raw-preview', sandbox: 'allow-scripts', title: `Preview of ${label}` }) as HTMLIFrameElement;
				const links = this.config.stylesheets.map((h) => `<link rel="stylesheet" href="${escapeAttr(absolute(h))}">`).join('');
				frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8">${links}</head><body class="${escapeAttr(this.config.bodyClass)}">${code}</body></html>`;
				box.append(frame);
			} else {
				frame?.remove();
				frame = null;
			}
			this.fitHeight();
		});
		box.append(
			hIn(d, 'span', { className: 'bf-raw-title' }, 'HTML / JavaScript'),
			hIn(d, 'code', { className: 'bf-raw-code' }, summary),
			hIn(d, 'div', { className: 'bf-raw-actions' }, edit, toggle),
		);
		return box;
	}

	private renderAddBar(): HTMLElement {
		const d = this.doc;
		const mk = (label: string, ic: string, fn: () => void) => {
			const b = hIn(d, 'button', { type: 'button', className: 'bf-cbtn' });
			b.innerHTML = icon(ic);
			b.append(label);
			b.addEventListener('click', fn);
			return b;
		};
		return hIn(
			d,
			'div',
			{ className: 'bf-addbar', role: 'group', 'aria-label': 'Add content at the end' },
			mk('Add row', 'addRow', () => this.editor.exec('addRow', { at: 'end' })),
			mk('Add block', 'blocks', () => this.editor.exec('blocks')),
			mk('Add HTML', 'code', () => this.editor.exec('addRaw', { at: 'end' })),
		);
	}

	/** Replace one column's content without re-rendering (undo of typing). */
	setColContent(colId: string, html: string, conv: Converter): boolean {
		const el = this.content(colId);
		if (!el) return false;
		el.innerHTML = conv.mapHtml(html, 'out') || '<p><br></p>';
		return true;
	}

	/* --------------------------------------------------------- lookups */

	content(colId: string): HTMLElement | null {
		return this.doc?.querySelector(`[data-bf-content="${CSS.escape(colId)}"]`) ?? null;
	}

	rowEl(rowId: string): HTMLElement | null {
		return this.doc?.querySelector(`[data-bf-row="${CSS.escape(rowId)}"]`) ?? null;
	}

	handleEl(kind: 'row' | 'col', id: string): HTMLElement | null {
		const attr = kind === 'row' ? 'data-bf-for-row' : 'data-bf-for-col';
		return this.doc?.querySelector(`[data-bf-handle="${kind}"][${attr}="${CSS.escape(id)}"]`) ?? null;
	}

	/** The column id whose content contains a node. */
	colOf(node: Node | null): string | null {
		const el = node && (node.nodeType === 1 ? (node as Element) : node.parentElement);
		return el?.closest('[data-bf-content]')?.getAttribute('data-bf-content') ?? null;
	}

	rowOf(node: Node | null): string | null {
		const el = node && (node.nodeType === 1 ? (node as Element) : node.parentElement);
		return el?.closest('[data-bf-row]')?.getAttribute('data-bf-row') ?? null;
	}

	/* --------------------------------------------------------- selection */

	private onSelectionChange(): void {
		const sel = this.doc.getSelection();
		if (sel && sel.rangeCount) {
			const range = sel.getRangeAt(0);
			if (this.colOf(range.commonAncestorContainer)) this.savedRange = range.cloneRange();
		}
		this.editor.onCanvasSelection();
	}

	get range(): Range | null {
		return this.savedRange;
	}

	/** Column holding the saved selection, if it is still in the canvas. */
	get selectionCol(): string | null {
		const r = this.savedRange;
		if (!r || !r.commonAncestorContainer.isConnected) return null;
		return this.colOf(r.commonAncestorContainer);
	}

	/**
	 * Put focus and the saved selection back into the canvas so a toolbar
	 * command applies where the user left the caret. Returns the column id.
	 */
	restoreSelection(): string | null {
		const colId = this.selectionCol;
		if (!colId) return null;
		const el = this.content(colId)!;
		const sel = this.doc.getSelection()!;
		const r = this.savedRange!;
		if (this.doc.activeElement !== el) el.focus({ preventScroll: true });
		sel.removeAllRanges();
		sel.addRange(r);
		return colId;
	}

	/** Place the caret in a column (at the end by default). */
	focusCol(colId: string, atStart = false): boolean {
		const el = this.content(colId);
		if (!el) return false;
		el.focus({ preventScroll: true });
		const r = this.doc.createRange();
		r.selectNodeContents(el);
		r.collapse(atStart);
		const sel = this.doc.getSelection()!;
		sel.removeAllRanges();
		sel.addRange(r);
		this.savedRange = r.cloneRange();
		el.scrollIntoView({ block: 'nearest' });
		return true;
	}

	/**
	 * Select an element inside a column (its text, or the element itself when
	 * it has none, such as an image), scroll it into view and outline it
	 * briefly so it is easy to spot.
	 */
	focusElement(colId: string, target: Element): boolean {
		const content = this.content(colId);
		if (!content || !content.contains(target)) return this.focusCol(colId, true);
		content.focus({ preventScroll: true });
		const r = this.doc.createRange();
		if (target.textContent?.trim()) r.selectNodeContents(target);
		else r.selectNode(target);
		const sel = this.doc.getSelection()!;
		sel.removeAllRanges();
		sel.addRange(r);
		this.savedRange = r.cloneRange();
		target.scrollIntoView({ block: 'center' });
		this.flash(target);
		return true;
	}

	private flashEl: HTMLElement | null = null;
	private flashTimer = 0;

	/**
	 * What to add to a viewport position to place an absolute overlay in the
	 * body: the scroll, or the body's own offset when the site positions it.
	 */
	private overlayOffset(): { ox: number; oy: number } {
		const win = this.doc.defaultView!;
		if (win.getComputedStyle(this.doc.body).position === 'static') return { ox: win.scrollX, oy: win.scrollY };
		const b = this.doc.body.getBoundingClientRect();
		return { ox: -b.left + this.doc.body.clientLeft, oy: -b.top + this.doc.body.clientTop };
	}

	/** Outline an element for a moment, using an overlay outside the content. */
	private flash(target: Element): void {
		const win = this.doc.defaultView!;
		this.flashEl?.remove();
		win.clearTimeout(this.flashTimer);
		const box = target.getBoundingClientRect();
		const { ox, oy } = this.overlayOffset();
		const el = this.doc.createElement('div');
		el.className = 'bf-flash';
		el.setAttribute('aria-hidden', 'true');
		el.style.cssText = `top:${box.top + oy - 4}px;left:${box.left + ox - 4}px;width:${box.width + 8}px;height:${box.height + 8}px`;
		this.doc.body.append(el);
		this.flashEl = el;
		const clear = () => {
			el.remove();
			if (this.flashEl === el) this.flashEl = null;
		};
		this.flashTimer = win.setTimeout(clear, 2500);
		this.doc.addEventListener('keydown', clear, { once: true });
		this.doc.addEventListener('pointerdown', clear, { once: true });
	}

	/* ------------------------------------------------------ block drops */

	private dropLine: HTMLElement | null = null;

	/**
	 * Where a block dropped at viewport y (canvas coordinates) goes: before
	 * the row under the pointer when in its top half, otherwise after it.
	 * Below the last row, or on the empty canvas, it goes at the end.
	 */
	dropIndexAt(y: number): number {
		const rows = Array.from(this.root.querySelectorAll<HTMLElement>(':scope > [data-bf-row]'));
		for (let i = 0; i < rows.length; i++) {
			const r = rows[i].getBoundingClientRect();
			if (y < r.top + r.height / 2) return i;
		}
		return rows.length;
	}

	/** A line between rows showing where a dragged block will go. */
	showDropLine(index: number): void {
		if (!this.doc) return;
		const rows = Array.from(this.root.querySelectorAll<HTMLElement>(':scope > [data-bf-row]'));
		const { ox, oy } = this.overlayOffset();
		let y: number;
		if (!rows.length) y = this.root.getBoundingClientRect().top + 12;
		else if (index < rows.length) {
			const r = rows[index].getBoundingClientRect();
			const prev = index > 0 ? rows[index - 1].getBoundingClientRect().bottom : r.top - 8;
			y = (prev + r.top) / 2;
		} else y = rows[rows.length - 1].getBoundingClientRect().bottom + 4;
		const box = this.root.getBoundingClientRect();
		if (!this.dropLine) {
			this.dropLine = this.doc.createElement('div');
			this.dropLine.className = 'bf-drop-line';
			this.dropLine.setAttribute('aria-hidden', 'true');
			this.doc.body.append(this.dropLine);
		}
		const left = box.left + 40;
		this.dropLine.style.cssText = `top:${y + oy - 2}px;left:${left + ox}px;width:${box.right - left}px`;
	}

	hideDropLine(): void {
		this.dropLine?.remove();
		this.dropLine = null;
	}

	focusHandle(kind: 'row' | 'col', id: string): boolean {
		const el = this.handleEl(kind, id);
		if (!el) return false;
		el.focus({ preventScroll: true });
		el.scrollIntoView({ block: 'nearest' });
		return true;
	}

	/** Mark the row and column containing focus so their handles show. */
	setActive(rowId: string | null, colId: string | null): void {
		if (!this.doc) return;
		for (const el of Array.from(this.doc.querySelectorAll('.bf-active'))) el.classList.remove('bf-active');
		if (rowId) this.rowEl(rowId)?.classList.add('bf-active');
		if (colId) this.doc.querySelector(`[data-bf-col="${CSS.escape(colId)}"]`)?.classList.add('bf-active');
	}

	destroy(): void {
		this.resizeObs?.disconnect();
		this.iframe.remove();
	}
}
