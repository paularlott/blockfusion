/**
 * Styles for the editing affordances inside the canvas iframe: handles,
 * outlines, raw code placeholders and the add-row bar. Everything is
 * prefixed bf- and scoped to editor-only elements, so the site's own styles
 * render the content exactly. Colours are fixed (the canvas follows the
 * site's look, not the editor theme) and meet AA against white and black.
 */
export const CANVAS_CSS = `
:root { --bf-c-accent: #0e7490; --bf-c-accent-ink: #ffffff; --bf-c-ring: #0e7490; --bf-c-muted: #475569; --bf-c-line: #7c8797; }
/* The left gutter holds the row handles, clear of every column */
.bf-root { position: relative; padding: 20px 0 8px 40px; min-height: 120px; }
[data-bf-row] { position: relative; outline: 1px dashed transparent; outline-offset: 2px; }
[data-bf-row]:hover, [data-bf-row].bf-active, [data-bf-row]:focus-within { outline-color: var(--bf-c-line); }
[data-bf-col] { position: relative; outline: 1px dashed transparent; outline-offset: -1px; }
[data-bf-col]:hover, [data-bf-col].bf-active { outline-color: var(--bf-c-line); }
[data-bf-col] > .bf-col-content { min-height: 1.6em; outline: none; border-radius: 2px; }
[data-bf-col] > .bf-col-content:focus { box-shadow: 0 0 0 2px var(--bf-c-ring); }
[data-bf-col] > .bf-col-content:empty::before { content: attr(data-placeholder); color: var(--bf-c-muted); }

/* Handles: 28px targets, shown on hover, focus and for the active row; always on touch screens. */
.bf-handle {
	all: unset; box-sizing: border-box; position: absolute !important; z-index: 20;
	width: 28px !important; height: 28px !important; min-width: 0 !important; max-width: none !important;
	padding: 0 !important; margin: 0 !important; flex: none !important; float: none !important;
	display: inline-flex !important; align-items: center; justify-content: center;
	border-radius: 6px; background: var(--bf-c-accent); color: var(--bf-c-accent-ink);
	box-shadow: 0 0 0 2px #ffffff; cursor: pointer; opacity: 0;
	font: 600 12px/1 system-ui, sans-serif;
}
.bf-handle svg { width: 16px; height: 16px; pointer-events: none; }
.bf-row-handle { top: 0; left: -38px; }
.bf-col-handle { top: 2px; right: 2px; background: #ffffff; color: var(--bf-c-accent); box-shadow: 0 0 0 1px var(--bf-c-accent), 0 0 0 3px #ffffff; }
/* Every column's handle shows while its row is hovered, focused or active */
[data-bf-row]:hover > .bf-row-handle, [data-bf-row].bf-active > .bf-row-handle, [data-bf-row]:focus-within > .bf-row-handle,
[data-bf-row]:hover > [data-bf-col] > .bf-col-handle, [data-bf-row].bf-active > [data-bf-col] > .bf-col-handle,
[data-bf-row]:focus-within > [data-bf-col] > .bf-col-handle,
.bf-handle:focus, .bf-handle[aria-expanded="true"] { opacity: 1; }
.bf-handle:focus-visible { outline: 3px solid var(--bf-c-ring); outline-offset: 2px; box-shadow: 0 0 0 2px #ffffff; }
@media (hover: none) { .bf-handle { opacity: 1; } }

/* Raw HTML/JavaScript placeholders. */
.bf-raw-box {
	box-sizing: border-box; margin: 6px 0; padding: 12px; border: 2px dashed var(--bf-c-line); border-radius: 8px;
	background: #f8fafc; color: #0f172a; font: 14px/1.4 system-ui, sans-serif;
}
.bf-raw-title { display: block; font-weight: 700; margin: 0 0 6px; }
.bf-raw-code { display: block; margin: 0 0 8px; color: #334155; font: 12px/1.4 ui-monospace, monospace; white-space: pre-wrap; word-break: break-all; max-height: 4.2em; overflow: hidden; }
.bf-raw-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.bf-cbtn {
	all: unset; box-sizing: border-box; display: inline-flex; align-items: center; gap: 6px; min-height: 28px; min-width: 28px;
	padding: 4px 10px; border-radius: 6px; border: 1px solid var(--bf-c-accent); background: #ffffff; color: #0c4a5c;
	font: 600 13px/1.2 system-ui, sans-serif; cursor: pointer;
}
.bf-cbtn:hover { background: #e3f3f7; }
.bf-cbtn[aria-pressed="true"] { background: var(--bf-c-accent); color: #ffffff; }
.bf-cbtn:focus-visible { outline: 3px solid var(--bf-c-ring); outline-offset: 2px; }
.bf-cbtn svg { width: 16px; height: 16px; }
.bf-raw-preview { display: block; width: 100%; min-height: 120px; margin-top: 8px; border: 1px solid #cbd3dd; background: #ffffff; }

/* Add-row bar at the end of the canvas. */
.bf-addbar { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; padding: 16px 0; margin-top: 8px; border-top: 1px dashed var(--bf-c-line); }
.bf-empty { text-align: center; color: var(--bf-c-muted); font: 15px/1.5 system-ui, sans-serif; margin: 24px 0 0; }
.bf-drop-target { box-shadow: inset 0 0 0 3px var(--bf-c-ring) !important; }
img.bf-selected { outline: 3px solid var(--bf-c-ring); outline-offset: 2px; }

@media (forced-colors: active) {
	.bf-handle, .bf-cbtn { forced-color-adjust: none; background: ButtonFace; color: ButtonText; border: 1px solid ButtonText; opacity: 1; }
	.bf-handle:focus-visible, .bf-cbtn:focus-visible, [data-bf-col] > .bf-col-content:focus { outline: 3px solid Highlight; }
	.bf-cbtn[aria-pressed="true"] { background: Highlight; color: HighlightText; }
	[data-bf-row]:hover, [data-bf-row].bf-active { outline-color: CanvasText; }
	.bf-raw-box { border-color: CanvasText; }
}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; } }
`;
