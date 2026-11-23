/** Text formatting: block styles, fonts, inline styles, lists, alignment, colour. */
import {
	applyInlineStyle,
	clearFormatting,
	commandState,
	currentBlock,
	currentStyle,
	exec,
	inBlockquote,
	indent,
	setBlock,
	toggleBlockquote,
} from '../commands/text';
import type { Editor } from '../editor';
import type { Command, MenuItem, Plugin } from '../types';

const BLOCKS: Array<{ tag: string; name: string; shortcut?: string }> = [
	{ tag: 'p', name: 'Paragraph', shortcut: 'Mod+Alt+0' },
	{ tag: 'h1', name: 'Heading 1', shortcut: 'Mod+Alt+1' },
	{ tag: 'h2', name: 'Heading 2', shortcut: 'Mod+Alt+2' },
	{ tag: 'h3', name: 'Heading 3', shortcut: 'Mod+Alt+3' },
	{ tag: 'h4', name: 'Heading 4', shortcut: 'Mod+Alt+4' },
	{ tag: 'h5', name: 'Heading 5', shortcut: 'Mod+Alt+5' },
	{ tag: 'h6', name: 'Heading 6', shortcut: 'Mod+Alt+6' },
	{ tag: 'pre', name: 'Preformatted' },
];

const BLOCK_STYLE: Record<string, string> = {
	h1: 'font-size:1.6em;font-weight:700',
	h2: 'font-size:1.4em;font-weight:700',
	h3: 'font-size:1.2em;font-weight:700',
	h4: 'font-size:1.1em;font-weight:700',
	h5: 'font-weight:700',
	h6: 'font-weight:700;font-size:.9em',
	pre: 'font-family:ui-monospace,monospace',
};

const hasText = (ed: Editor) => !!ed.canvas.selectionCol;

export const formattingPlugin: Plugin = {
	id: 'formatting',
	install(editor) {
		const add = (cmd: Command, toggle = true) => {
			editor.registerCommand({ text: true, isEnabled: hasText, ...cmd });
			editor.addToolbarItem({ type: 'button', id: cmd.id, command: cmd.id, toggle });
		};
		const simple = (id: string, label: string, icon: string, native: string, shortcut?: string, toggle = true) =>
			add({ id, label, icon, shortcut, run: (ed) => void exec(ed, label, native), isActive: (ed) => commandState(ed, native) }, toggle);

		// Block format menu and its shortcuts.
		for (const b of BLOCKS) {
			editor.registerCommand({
				id: `block-${b.tag}`,
				label: b.name,
				shortcut: b.shortcut,
				text: true,
				isEnabled: hasText,
				run: (ed) => void setBlock(ed, b.tag, b.name),
				isActive: (ed) => currentBlock(ed) === b.tag,
			});
		}
		editor.addToolbarItem({
			type: 'menu',
			id: 'block',
			label: 'Text style',
			minWidth: '9.5rem',
			isEnabled: hasText,
			value: (ed) => BLOCKS.find((b) => b.tag === currentBlock(ed))?.name ?? 'Paragraph',
			items: (ed) => {
				const cur = currentBlock(ed);
				return BLOCKS.map<MenuItem>((b) => ({
					label: b.name,
					checked: cur === b.tag,
					style: BLOCK_STYLE[b.tag],
					run: () => ed.exec(`block-${b.tag}`),
				}));
			},
		});

		const styleMenu = (id: string, label: string, prop: string, list: () => Array<{ name: string; value: string }>, preview: (v: string) => string) => {
			editor.addToolbarItem({
				type: 'menu',
				id,
				label,
				minWidth: '7.5rem',
				isEnabled: hasText,
				value: (ed) => {
					const cur = currentStyle(ed, prop);
					return (cur && list().find((f) => f.value.replace(/\s/g, '') === cur.replace(/\s/g, ''))?.name) || (cur ? 'Custom' : 'Default');
				},
				items: (ed) => {
					const cur = currentStyle(ed, prop)?.replace(/\s/g, '');
					return [
						{ label: 'Default', checked: !cur, run: () => void applyInlineStyle(ed, `Default ${label.toLowerCase()}`, prop, null) },
						...list().map<MenuItem>((f) => ({
							label: f.name,
							checked: cur === f.value.replace(/\s/g, ''),
							style: preview(f.value),
							run: () => void applyInlineStyle(ed, `${label}: ${f.name}`, prop, f.value),
						})),
					];
				},
			});
		};
		styleMenu('font', 'Font', 'font-family', () => editor.options.fonts, (v) => `font-family:${v}`);
		styleMenu('size', 'Size', 'font-size', () => editor.options.fontSizes, (v) => `font-size:${v}`);
		editor.addToolbarItem({ type: 'separator', id: 'sep-style' });

		simple('bold', 'Bold', 'bold', 'bold', 'Mod+B');
		simple('italic', 'Italic', 'italic', 'italic', 'Mod+I');
		simple('underline', 'Underline', 'underline', 'underline', 'Mod+U');
		simple('strike', 'Strikethrough', 'strike', 'strikeThrough', 'Mod+Shift+X');
		simple('subscript', 'Subscript', 'sub', 'subscript', 'Mod+,');
		simple('superscript', 'Superscript', 'sup', 'superscript', 'Mod+.');

		editor.addToolbarItem({
			type: 'menu',
			id: 'color',
			label: 'Text colour',
			icon: 'color',
			isEnabled: hasText,
			items: (ed) => {
				const cur = currentStyle(ed, 'color');
				const norm = (c: string) => {
					const s = document.createElement('span');
					s.style.color = c;
					return s.style.color;
				};
				return [
					{ label: 'Default colour', checked: !cur, run: () => void applyInlineStyle(ed, 'Default colour', 'color', null) },
					...ed.options.colors.map<MenuItem>((c) => ({
						label: c.name,
						swatch: c.value,
						checked: !!cur && norm(cur) === norm(c.value),
						run: () => void applyInlineStyle(ed, `Colour: ${c.name}`, 'color', c.value),
					})),
				];
			},
		});
		add({ id: 'clear', label: 'Clear formatting', icon: 'clear', shortcut: 'Mod+\\', run: (ed) => void clearFormatting(ed) }, false);
		editor.addToolbarItem({ type: 'separator', id: 'sep-inline' });

		simple('ul', 'Bulleted list', 'ul', 'insertUnorderedList', 'Mod+Shift+8');
		simple('ol', 'Numbered list', 'ol', 'insertOrderedList', 'Mod+Shift+7');
		add({ id: 'outdent', label: 'Decrease indent', icon: 'outdent', shortcut: 'Mod+[', run: (ed) => void indent(ed, -1) }, false);
		add({ id: 'indent', label: 'Increase indent', icon: 'indent', shortcut: 'Mod+]', run: (ed) => void indent(ed, 1) }, false);
		add({ id: 'quote', label: 'Quote', icon: 'quote', shortcut: 'Mod+Shift+9', run: (ed) => void toggleBlockquote(ed), isActive: inBlockquote });
		editor.addToolbarItem({ type: 'separator', id: 'sep-lists' });

		simple('alignLeft', 'Align left', 'alignLeft', 'justifyLeft', 'Mod+Shift+L');
		simple('alignCenter', 'Align centre', 'alignCenter', 'justifyCenter', 'Mod+Shift+E');
		simple('alignRight', 'Align right', 'alignRight', 'justifyRight', 'Mod+Shift+R');
		simple('alignJustify', 'Justify', 'alignJustify', 'justifyFull', 'Mod+Shift+J');
		editor.addToolbarItem({ type: 'separator', id: 'sep-align' });
	},
};
