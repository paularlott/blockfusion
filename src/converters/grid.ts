/**
 * A generic converter for row/column grids. Every built-in converter is a
 * configuration of this: which classes mark a row, how a span becomes a class
 * and back, and how utility classes map.
 */
import { cleanAttrs, columnsOf, scaleSpan, uid } from '../model/doc';
import { BREAKPOINTS, DEFAULT_COLUMNS, type Breakpoint, type Col, type Doc, type Row, type Span } from '../model/types';
import { makeClassMapper, type UtilityConfig } from './classmap';
import {
	attrString,
	mapFragmentClasses,
	nodesToHtml,
	RAW_CLOSE,
	RAW_OPEN,
	readAttrs,
	SCRIPTY,
	tokens,
	wrapRaw,
} from './html';
import type { Converter, ParseContext, RenderOptions } from './types';

export interface GridConfig {
	id: string;
	name: string;
	/** Breakpoints with span classes, starting with 'base'. Default base, sm, md, lg. */
	breakpoints?: readonly Breakpoint[];
	stylesheet?: string;
	/**
	 * Classes only this framework uses (e.g. Bootstrap 3's col-xs-). A match
	 * breaks ties between frameworks that share grid class names.
	 */
	signature?: RegExp;
	row: {
		/** Every one of these classes marks a row. */
		tokens: string[];
		/**
		 * Classes added to every row unless the row already has a class of the
		 * same family (e.g. Tailwind's gap-6 unless a gap-* is set).
		 */
		defaults?: Array<{ token: string; family: RegExp }>;
	};
	col: {
		/** Classes every column carries (Foundation's `columns`, `cell`). */
		tokens?: string[];
		/** Other spellings accepted on parse (e.g. `column`). */
		altTokens?: string[];
		/** Class for a span at a breakpoint. */
		spanClass(bp: Breakpoint, n: number): string;
		/** Recognise a span class. */
		parseSpan(token: string): { bp: Breakpoint; n: number } | null;
		/** True when a column without a base span is full width (most floats/flex grids). */
		base12Implicit: boolean;
	};
	utilities?: UtilityConfig;
}

const RAW_PLACEHOLDER = /^bf:raw:(\d+)$/;

/** Put verbatim raw code back where placeholders were left by extractRaw. */
function restoreRaw(html: string, ctx?: ParseContext): string {
	if (!ctx?.raws?.length) return html;
	return html.replace(/<!--bf:raw:(\d+)-->/g, (m, n: string) =>
		ctx.raws![Number(n)] !== undefined ? RAW_OPEN + ctx.raws![Number(n)] + RAW_CLOSE : m,
	);
}

/** Is a node ignorable inside a row (whitespace only)? */
function isBlank(node: Node): boolean {
	return node.nodeType === 3 && !(node.textContent || '').trim();
}

/**
 * If a node list is exactly one raw code region (a placeholder, or a pair of
 * bf:raw comments), return its code.
 */
function rawCode(nodes: Node[], ctx?: ParseContext): string | null {
	const list = nodes.filter((n) => !isBlank(n));
	if (!list.length) return null;
	const first = list[0];
	if (list.length === 1 && first.nodeType === 8) {
		const m = RAW_PLACEHOLDER.exec((first as Comment).data);
		if (m && ctx?.raws?.[Number(m[1])] !== undefined) return ctx.raws[Number(m[1])];
	}
	const last = list[list.length - 1];
	if (
		list.length >= 2 &&
		first.nodeType === 8 &&
		(first as Comment).data === 'bf:raw' &&
		last.nodeType === 8 &&
		(last as Comment).data === '/bf:raw'
	) {
		const start = nodes.indexOf(first);
		const end = nodes.indexOf(last);
		return nodesToHtml(nodes.slice(start + 1, end));
	}
	return null;
}

/**
 * Build a converter from a grid description. Pass a function of the column
 * count when classes or CSS depend on it (Tailwind's grid-cols-12); the
 * converter's `withColumns(n)` then builds the same grid with n columns.
 */
export function createGridConverter(config: GridConfig | ((columns: number) => GridConfig), columns = DEFAULT_COLUMNS): Converter {
	const cfg = typeof config === 'function' ? config(columns) : config;
	const bps = BREAKPOINTS.filter((bp) => (cfg.breakpoints ?? ['base', 'sm', 'md', 'lg']).includes(bp));
	const mapper = makeClassMapper(cfg.utilities ?? {});
	const colTokens = cfg.col.tokens ?? [];
	const colAccept = [...colTokens, ...(cfg.col.altTokens ?? [])];
	const defaults = cfg.row.defaults ?? [];

	const mapHtml = (html: string, dir: 'out' | 'in') =>
		mapFragmentClasses(html, dir === 'out' ? mapper.toFramework : mapper.toNeutral);

	function spanClasses(span: Span): string[] {
		const out: string[] = [];
		const others = bps.filter((bp) => bp !== 'base' && span[bp] !== undefined);
		const skipBase = cfg.col.base12Implicit && span.base === columns && (others.length > 0 || colTokens.length > 0);
		if (!skipBase) out.push(cfg.col.spanClass('base', span.base));
		for (const bp of others) out.push(cfg.col.spanClass(bp, span[bp]!));
		return out;
	}

	function rowClass(row: Row): string {
		const own = mapper.toFramework(tokens(row.attrs?.className));
		const extra = defaults.filter((d) => !own.some((t) => d.family.test(t))).map((d) => d.token);
		return [...cfg.row.tokens, ...extra, ...own].join(' ');
	}

	function colClass(col: Col): string {
		const own = mapper.toFramework(tokens(col.attrs?.className));
		return [...colTokens, ...spanClasses(col.span), ...own].join(' ');
	}

	function isRowEl(el: Element): boolean {
		const cls = tokens(el.getAttribute('class'));
		return cfg.row.tokens.every((t) => cls.includes(t));
	}

	function parseCol(el: Element, ctx?: ParseContext): Col | null {
		const cls = tokens(el.getAttribute('class'));
		const span: Span = { base: columns };
		let hasSpan = false;
		let hasBase = false;
		const rest: string[] = [];
		for (const t of cls) {
			const s = cfg.col.parseSpan(t);
			if (s && bps.includes(s.bp) && s.n <= columns) {
				span[s.bp] = s.n;
				hasSpan = true;
				if (s.bp === 'base') hasBase = true;
			} else if (!colAccept.includes(t)) rest.push(t);
		}
		const marked = colTokens.length > 0 && colTokens.every((t) => cls.includes(t));
		const alt = (cfg.col.altTokens ?? []).some((t) => cls.includes(t));
		if (!hasSpan && !marked && !alt) return null;
		// In a CSS grid a child without a base span covers one track.
		if (!hasBase && !cfg.col.base12Implicit) span.base = 1;

		const className = mapper.toNeutral(rest).join(' ');
		const attrs = cleanAttrs(readAttrs(el, className));
		const nodes = Array.from(el.childNodes);
		const code = rawCode(nodes, ctx);
		const col: Col = { id: uid('c'), kind: 'rich', span, html: '' };
		if (code !== null) {
			col.kind = 'raw';
			col.html = code;
		} else {
			const html = restoreRaw(el.innerHTML.trim(), ctx);
			if (SCRIPTY.test(html)) {
				col.kind = 'raw';
				col.html = html;
			} else col.html = mapHtml(html, 'in');
		}
		if (attrs) col.attrs = attrs;
		return col;
	}

	function parseRow(el: Element, ctx?: ParseContext): Row | null {
		if (!isRowEl(el)) return null;
		const cols: Col[] = [];
		for (const node of Array.from(el.childNodes)) {
			if (isBlank(node)) continue;
			if (node.nodeType !== 1) return null;
			const col = parseCol(node as Element, ctx);
			if (!col) return null;
			cols.push(col);
		}
		if (!cols.length) return null;
		const rest = tokens(el.getAttribute('class')).filter(
			(t) => !cfg.row.tokens.includes(t) && !defaults.some((d) => d.token === t),
		);
		const attrs = cleanAttrs(readAttrs(el, mapper.toNeutral(rest).join(' ')));
		const row: Row = { id: uid('r'), kind: 'grid', cols };
		if (attrs) row.attrs = attrs;
		return row;
	}

	function parse(root: Element, ctx?: ParseContext): Doc {
		const rows: Row[] = [];
		let buffer: Node[] = [];

		const flush = () => {
			const html = restoreRaw(nodesToHtml(buffer).trim(), ctx);
			buffer = [];
			if (!html) return;
			if (SCRIPTY.test(html)) rows.push({ id: uid('r'), kind: 'raw', cols: [], raw: html });
			else
				rows.push({
					id: uid('r'),
					kind: 'grid',
					cols: [{ id: uid('c'), kind: 'rich', span: { base: columns }, html: mapHtml(html, 'in') }],
				});
		};

		const nodes = Array.from(root.childNodes);
		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i];
			if (node.nodeType === 8) {
				const data = (node as Comment).data;
				const m = RAW_PLACEHOLDER.exec(data);
				if (m && ctx?.raws?.[Number(m[1])] !== undefined) {
					flush();
					rows.push({ id: uid('r'), kind: 'raw', cols: [], raw: ctx.raws[Number(m[1])] });
					continue;
				}
				if (data === 'bf:raw') {
					const end = nodes.findIndex((n, j) => j > i && n.nodeType === 8 && (n as Comment).data === '/bf:raw');
					if (end > i) {
						flush();
						rows.push({ id: uid('r'), kind: 'raw', cols: [], raw: nodesToHtml(nodes.slice(i + 1, end)) });
						i = end;
						continue;
					}
				}
				buffer.push(node);
				continue;
			}
			if (node.nodeType === 1) {
				const row = parseRow(node as Element, ctx);
				if (row) {
					flush();
					rows.push(row);
					continue;
				}
			}
			if (buffer.length || !isBlank(node)) buffer.push(node);
		}
		flush();
		return columns === DEFAULT_COLUMNS ? { rows } : { rows, columns };
	}

	function detect(root: Element): number {
		const els = Array.from(root.children);
		if (!els.length) return 0;
		const hits = els.filter((el) => parseRow(el)).length;
		if (!hits) return 0;
		const bonus = cfg.signature?.test(root.innerHTML) ? 0.01 : 0;
		return Math.min(1, hits / els.length - 0.01 + bonus);
	}

	function renderCol(col: Col, markers: boolean): string {
		const tag = col.attrs?.tag || 'div';
		const body = col.kind === 'raw' ? wrapRaw(col.html, markers) : mapHtml(col.html, 'out');
		const open = `\t<${tag}${attrString(colClass(col), col.attrs)}>`;
		return body ? `${open}\n${body}\n\t</${tag}>` : `${open}</${tag}>`;
	}

	function render(doc: Doc, opts: RenderOptions = {}): string {
		const markers = opts.rawMarkers !== false;
		const from = columnsOf(doc);
		return doc.rows
			.map((row) => {
				if (row.kind === 'raw') return wrapRaw(row.raw ?? '', markers);
				const tag = row.attrs?.tag || 'div';
				const cols = row.cols
					.map((c) => renderCol(from === columns ? c : { ...c, span: scaleSpan(c.span, from, columns) }, markers))
					.join('\n');
				return `<${tag}${attrString(rowClass(row), row.attrs)}>\n${cols}\n</${tag}>`;
			})
			.join('\n');
	}

	return {
		id: cfg.id,
		name: cfg.name,
		columns,
		breakpoints: bps,
		withColumns: (n: number) => createGridConverter(config, n),
		stylesheet: cfg.stylesheet,
		detect,
		parse,
		render,
		rowClass,
		colClass,
		toFramework: mapper.toFramework,
		toNeutral: mapper.toNeutral,
		mapHtml,
	};
}

/** Build a span parser from a regular expression with a prefix-to-breakpoint map. */
export function spanParser(re: RegExp, map: Record<string, Breakpoint>) {
	return (token: string) => {
		const m = re.exec(token);
		if (!m) return null;
		const bp = map[m[1] ?? ''];
		const n = Number(m[2]);
		// The upper limit is the grid's column count, checked by the converter.
		if (!bp || !Number.isInteger(n) || n < 1) return null;
		return { bp, n };
	};
}
