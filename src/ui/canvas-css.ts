/**
 * Styles for the editing affordances inside the canvas iframe: handles,
 * outlines, raw code placeholders and the add-row bar. Everything is
 * prefixed bf- and scoped to editor-only elements, so the site's own styles
 * render the content exactly. Colours are fixed (the canvas follows the
 * site's look, not the editor theme) and meet AA against white and black.
 *
 * The site's stylesheets load in the same document, and broad rules there
 * (".row [class*=span-] { position: static }", "button:hover { background:
 * transparent }", ...) outrank plain editor rules. So the properties the
 * affordances depend on are !important.
 */
export const CANVAS_CSS = `
:root { --bf-c-accent: #0e7490; --bf-c-accent-ink: #ffffff; --bf-c-ring: #0e7490; --bf-c-muted: #475569; --bf-c-line: #7c8797; }
/* The left gutter holds the row handles, clear of every column */
.bf-root { position: relative; padding: 20px 0 8px 40px; min-height: 120px; }
[data-bf-row] { position: relative !important; outline: 1px dashed transparent; outline-offset: 2px; }
[data-bf-row]:hover, [data-bf-row].bf-active, [data-bf-row]:focus-within { outline-color: var(--bf-c-line); }
[data-bf-col] { position: relative !important; outline: 1px dashed transparent; outline-offset: -1px; }
[data-bf-col]:hover, [data-bf-col].bf-active { outline-color: var(--bf-c-line); }
[data-bf-col] > .bf-col-content { position: relative; min-height: 1.6em; outline: 1px dotted transparent; outline-offset: 1px; border-radius: 2px; }
/* The typing area shows on hover; the column's empty space also takes clicks (see Editor.onCanvasPointerDown) */
[data-bf-col]:hover > .bf-col-content { outline-color: var(--bf-c-line); }
[data-bf-col] > .bf-col-content:focus { outline-color: transparent; box-shadow: 0 0 0 2px var(--bf-c-ring); }
/* An empty column (no text, images or media; kept current by the canvas): outlined, with a prompt */
[data-bf-col] > .bf-col-content.bf-is-empty { outline: 1px dashed var(--bf-c-line); }
[data-bf-col] > .bf-col-content.bf-is-empty::before {
	content: attr(data-placeholder); position: absolute; inset: 0 auto auto 0.25em; pointer-events: none;
	color: var(--bf-c-muted); font: italic 15px/1.4 system-ui, sans-serif;
}
[data-bf-col] > .bf-col-content.bf-is-empty:focus::before { content: none; }

/* Handles: 28px targets, shown on hover, focus and for the active row; always on touch screens. */
.bf-handle {
	all: unset; box-sizing: border-box; position: absolute !important; z-index: 20;
	width: 28px !important; height: 28px !important; min-width: 0 !important; max-width: none !important;
	padding: 0 !important; margin: 0 !important; flex: none !important; float: none !important;
	display: inline-flex !important; align-items: center; justify-content: center;
	border: 0 !important; border-radius: 6px !important; background: var(--bf-c-accent) !important; color: var(--bf-c-accent-ink) !important;
	box-shadow: 0 0 0 2px #ffffff !important; cursor: pointer !important; opacity: 0; visibility: visible !important;
	transform: none !important; text-decoration: none !important;
	font: 600 12px/1 system-ui, sans-serif !important;
}
.bf-handle:hover { background: #0c6278 !important; color: #ffffff !important; }
.bf-handle svg { width: 16px; height: 16px; pointer-events: none; }
.bf-row-handle { top: 0 !important; left: -38px !important; right: auto !important; bottom: auto !important; }
.bf-col-handle { top: 2px !important; right: 2px !important; left: auto !important; bottom: auto !important; background: #ffffff !important; color: var(--bf-c-accent) !important; box-shadow: 0 0 0 1px var(--bf-c-accent), 0 0 0 3px #ffffff !important; }
.bf-col-handle:hover { background: #e3f3f7 !important; color: #0c4a5c !important; }
/* Every column's handle shows while its row is hovered, focused or active */
[data-bf-row]:hover > .bf-row-handle, [data-bf-row].bf-active > .bf-row-handle, [data-bf-row]:focus-within > .bf-row-handle,
[data-bf-row]:hover > [data-bf-col] > .bf-col-handle, [data-bf-row].bf-active > [data-bf-col] > .bf-col-handle,
[data-bf-row]:focus-within > [data-bf-col] > .bf-col-handle,
.bf-handle:focus, .bf-handle[aria-expanded="true"] { opacity: 1; }
.bf-handle:focus-visible { outline: 3px solid var(--bf-c-ring) !important; outline-offset: 2px !important; box-shadow: 0 0 0 2px #ffffff !important; }
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
	padding: 4px 10px; border-radius: 6px !important; border: 1px solid var(--bf-c-accent) !important; background: #ffffff !important; color: #0c4a5c !important;
	box-shadow: none !important; text-decoration: none !important; font: 600 13px/1.2 system-ui, sans-serif !important; cursor: pointer !important;
}
.bf-cbtn:hover { background: #e3f3f7 !important; }
.bf-cbtn[aria-pressed="true"] { background: var(--bf-c-accent) !important; color: #ffffff !important; }
.bf-cbtn:focus-visible { outline: 3px solid var(--bf-c-ring); outline-offset: 2px; }
.bf-cbtn svg { width: 16px; height: 16px; }
.bf-raw-preview { display: block; width: 100%; min-height: 120px; margin-top: 8px; border: 1px solid #cbd3dd; background: #ffffff; }

/* Add-row bar at the end of the canvas. */
.bf-addbar { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; padding: 16px 0; margin-top: 8px; border-top: 1px dashed var(--bf-c-line); }
.bf-empty { text-align: center; color: var(--bf-c-muted); font: 15px/1.5 system-ui, sans-serif; margin: 24px 0 0; }
.bf-drop-target { box-shadow: inset 0 0 0 3px var(--bf-c-ring) !important; }
/* Dictation: words still being recognised, shown in place but never saved */
.bf-dictation { color: var(--bf-c-muted); font-style: italic; border-bottom: 2px dotted var(--bf-c-ring); }
.bf-dictation:empty { display: inline-block; width: 2px; height: 1em; vertical-align: text-bottom; border: 0; background: var(--bf-c-ring); animation: bf-blink 1s steps(1) infinite; }
@keyframes bf-blink { 50% { opacity: 0; } }
/* Read aloud: the word being spoken */
::highlight(bf-reading) { background-color: #fde68a; color: #0f172a; }
img.bf-selected { outline: 3px solid var(--bf-c-ring); outline-offset: 2px; }
/* "Go to" from the checker: a ring around the element, dark and light so it shows on any background. */
.bf-flash { position: absolute !important; z-index: 2147483000; pointer-events: none; box-sizing: border-box; border: 3px solid #b45309; border-radius: 4px; box-shadow: 0 0 0 2px #fff, inset 0 0 0 2px #fff; animation: bf-flash 2.5s ease-out forwards; }
.bf-drop-line { position: absolute !important; z-index: 2147483000; height: 4px; pointer-events: none; border-radius: 2px; background: #0e7490; box-shadow: 0 0 0 2px #fff; }
@keyframes bf-flash { 0%, 70% { opacity: 1; } 100% { opacity: 0; } }

@media (forced-colors: active) {
	.bf-handle, .bf-cbtn { forced-color-adjust: none; background: ButtonFace; color: ButtonText; border: 1px solid ButtonText; opacity: 1; }
	.bf-handle:focus-visible, .bf-cbtn:focus-visible, [data-bf-col] > .bf-col-content:focus { outline: 3px solid Highlight; }
	.bf-cbtn[aria-pressed="true"] { background: Highlight; color: HighlightText; }
	[data-bf-row]:hover, [data-bf-row].bf-active { outline-color: CanvasText; }
	[data-bf-col] > .bf-col-content.bf-is-empty { outline-color: CanvasText; }
	.bf-raw-box { border-color: CanvasText; }
	.bf-flash { forced-color-adjust: none; border-color: Highlight; box-shadow: none; }
	.bf-drop-line { forced-color-adjust: none; background: Highlight; box-shadow: none; }
	::highlight(bf-reading) { background-color: Highlight; color: HighlightText; }
}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; } .bf-flash, .bf-dictation { animation: none; } }
`;
