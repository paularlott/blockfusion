/**
 * The neutral document model. It holds structure (rows and columns) and the
 * rich text of each column, independent of any CSS framework. Converters turn
 * it into framework markup and back.
 */

/** Responsive breakpoints the model knows about, smallest first. */
export type Breakpoint = 'base' | 'sm' | 'md' | 'lg';
export const BREAKPOINTS: readonly Breakpoint[] = ['base', 'sm', 'md', 'lg'];

/**
 * Column span on a 12 column grid. `base` applies at every width, and each
 * breakpoint overrides it from that width up. A missing breakpoint inherits
 * the next smaller one.
 */
export interface Span {
	base: number;
	sm?: number;
	md?: number;
	lg?: number;
}

/**
 * Attributes of a row or column element. `className` holds only the classes
 * the converter does not own (grid classes live in the span), already mapped
 * to the neutral utility vocabulary. `extra` holds any other attribute
 * (data-*, aria-*, ...) so nothing is lost.
 */
export interface Attrs {
	className?: string;
	id?: string;
	style?: string;
	tag?: string;
	extra?: Record<string, string>;
}

export interface Col {
	id: string;
	/** 'rich' columns are edited as text; 'raw' columns hold verbatim code. */
	kind: 'rich' | 'raw';
	span: Span;
	/** Rich text (neutral classes) or, for raw columns, verbatim code. */
	html: string;
	attrs?: Attrs;
}

export interface Row {
	id: string;
	/** 'grid' rows hold columns; 'raw' rows hold verbatim code in `raw`. */
	kind: 'grid' | 'raw';
	cols: Col[];
	raw?: string;
	attrs?: Attrs;
}

export interface Doc {
	rows: Row[];
}

export interface Block {
	id: string;
	name: string;
	category?: string;
	thumbnail?: string;
	description?: string;
	/** Neutral rows, or HTML in any framework a registered converter knows. */
	rows: Row[] | string;
}
