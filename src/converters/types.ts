import type { Col, Doc, Row } from '../model/types';

export interface RenderOptions {
	/**
	 * Wrap raw HTML/JavaScript in `<!--bf:raw-->` comments so it is recognised
	 * as raw code when loaded again. Default true.
	 */
	rawMarkers?: boolean;
}

export interface ParseContext {
	/** Verbatim raw code, referenced from `<!--bf:raw:N-->` placeholders. */
	raws?: string[];
}

/**
 * A converter turns the neutral model into one framework's markup and back.
 * Build one with `createGridConverter` or implement the interface directly.
 */
export interface Converter {
	id: string;
	name: string;
	/** CSS the canvas needs for this framework's grid, if it is not a host stylesheet. */
	stylesheet?: string;
	/** 0..1 confidence that the markup under `root` was made for this framework. */
	detect(root: Element): number;
	/** Markup -> model. Unrecognised markup is wrapped, never dropped. */
	parse(root: Element, ctx?: ParseContext): Doc;
	/** Model -> markup. */
	render(doc: Doc, opts?: RenderOptions): string;
	/** Full class attribute for a row element (grid classes plus the row's own). */
	rowClass(row: Row): string;
	/** Full class attribute for a column element (span classes plus the column's own). */
	colClass(col: Col): string;
	/** Map neutral utility classes (visibility, buttons) to this framework's. */
	toFramework(tokens: string[]): string[];
	/** Map this framework's utility classes to the neutral vocabulary. */
	toNeutral(tokens: string[]): string[];
	/** Apply the utility mapping to every element in an HTML fragment. */
	mapHtml(html: string, direction: 'out' | 'in'): string;
}
