/**
 * The neutral document model. It holds structure (rows and columns) and the
 * rich text of each column, independent of any CSS framework. Converters turn
 * it into framework markup and back.
 */

/**
 * Responsive breakpoints the model knows about, smallest first. They map to
 * a framework's breakpoints by name (Bootstrap 5's xxl, Tailwind's 2xl,
 * fusionCSS's x, ...); a converter declares which ones it supports.
 */
export type Breakpoint = 'base' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';
export const BREAKPOINTS: readonly Breakpoint[] = ['base', 'sm', 'md', 'lg', 'xl', 'xxl'];

/** Names for the breakpoints in the interface. */
export const BREAKPOINT_LABELS: Record<Breakpoint, string> = {
	base: 'All widths',
	sm: 'Small and up',
	md: 'Medium and up',
	lg: 'Large and up',
	xl: 'Extra large and up',
	xxl: 'Extra extra large and up',
};

/** The usual grid size; a document or converter may use another. */
export const DEFAULT_COLUMNS = 12;

/**
 * Column span, in columns of the document's grid (12 unless `Doc.columns`
 * says otherwise). `base` applies at every width, and each breakpoint
 * overrides it from that width up. A missing breakpoint inherits the next
 * smaller one.
 */
export interface Span {
	base: number;
	sm?: number;
	md?: number;
	lg?: number;
	xl?: number;
	xxl?: number;
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
	/** Columns in the grid the spans are counted in. Default 12. */
	columns?: number;
}

export interface Block {
	id: string;
	name: string;
	category?: string;
	thumbnail?: string;
	description?: string;
	/** Neutral rows, or HTML in any framework a registered converter knows. */
	rows: Row[] | string;
	/** Grid size the rows' spans are written for. Default 12; scaled on insert. */
	columns?: number;
}
