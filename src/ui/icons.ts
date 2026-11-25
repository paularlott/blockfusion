/**
 * Inline SVG icons (24x24 viewBox, stroke based). They are decorative: every
 * control that shows one also has an accessible name.
 */
const P: Record<string, string> = {
	undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
	redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
	bold: '<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/>',
	italic: '<path d="M14 5h-4M14 19h-4M14 5l-4 14"/>',
	underline: '<path d="M7 4v7a5 5 0 0 0 10 0V4M5 20h14"/>',
	strike: '<path d="M5 12h14M16 7a4 3 0 0 0-4-2c-2.5 0-4 1.3-4 3 0 1.4 1 2.3 3 3M8 17a4 3 0 0 0 4 2c2.5 0 4-1.3 4-3"/>',
	sub: '<path d="m4 6 8 10M12 6l-8 10M16 20h4c0-2-4-2.5-4-4.5a2 2 0 0 1 4 0"/>',
	sup: '<path d="m4 8 8 10M12 8l-8 10M16 9h4c0-2-4-2.5-4-4.5a2 2 0 0 1 4 0"/>',
	quote: '<path d="M10 8H6a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2v1a3 3 0 0 1-3 3M20 8h-4a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2v1a3 3 0 0 1-3 3"/>',
	ul: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
	ol: '<path d="M10 6h10M10 12h10M10 18h10M4 4h1v4M4 8h2M4 14.5a1 1 0 0 1 2 0c0 1-2 1.5-2 3.5h2"/>',
	indent: '<path d="M3 5h18M11 10h10M11 14h10M3 19h18M3 9l4 3-4 3z"/>',
	outdent: '<path d="M3 5h18M11 10h10M11 14h10M3 19h18M7 9l-4 3 4 3z"/>',
	alignLeft: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>',
	alignCenter: '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>',
	alignRight: '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>',
	alignJustify: '<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>',
	link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
	image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m3 18 5-5 4 4 3-3 6 6"/>',
	color: '<path d="m6 18 6-14 6 14M8.5 12.5h7"/><path d="M4 21h16" stroke-width="3"/>',
	clear: '<path d="M6 5h12M12 5 8 19M4 20 20 4"/>',
	code: '<path d="m9 8-4 4 4 4M15 8l4 4-4 4"/>',
	source: '<path d="M4 4h16v16H4z"/><path d="m10 9-3 3 3 3M14 9l3 3-3 3"/>',
	addRow: '<rect x="3" y="4" width="18" height="7" rx="1"/><path d="M12 14v7M8.5 17.5h7"/>',
	blocks: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>',
	handle: '<circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/>',
	close: '<path d="M6 6l12 12M18 6 6 18"/>',
	check: '<path d="m5 12 5 5 9-10"/>',
	moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
	width: '<rect x="3" y="5" width="18" height="12" rx="1"/><path d="M8 21h8M12 17v4"/>',
	chevron: '<path d="m7 10 5 5 5-5"/>',
	search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>',
	help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01"/>',
	audit: '<path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/>',
};

export function icon(name: string): string {
	const body = P[name] ?? P.code;
	return `<svg class="bf-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

export function iconEl(name: string, doc: Document = document): HTMLElement {
	const span = doc.createElement('span');
	span.className = 'bf-icon-wrap';
	span.setAttribute('aria-hidden', 'true');
	span.innerHTML = icon(name);
	return span;
}
