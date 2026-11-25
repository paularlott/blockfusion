/** Public types: options, plugins, commands, toolbar items and media. */
import type { Converter } from './converters/types';
import type { Breakpoint, Block } from './model/types';
import type { PasteFilter } from './paste/clean';
import type { Editor } from './editor';
import type { MenuItem } from './ui/menu';

export type { Block, Converter, MenuItem, PasteFilter };

export interface ImageResult {
	src: string;
	alt?: string;
	width?: number;
	height?: number;
}

export interface FileResult {
	href: string;
	title?: string;
}

/** Supplied by the host to connect its file manager. Every method is optional. */
export interface MediaProvider {
	pickImage?(opts: { current?: ImageResult }): Promise<ImageResult | null>;
	pickFile?(opts: { current?: string }): Promise<FileResult | null>;
	/** Enables drag-and-drop and paste of image files. */
	upload?(file: File): Promise<{ src: string; alt?: string }>;
}

/** Callbacks a dictation session reports to. */
export interface DictationHandlers {
	/** Words heard so far that may still change; replaces the previous interim text. */
	onInterim(text: string): void;
	/** Words that are settled and go into the content. */
	onFinal(text: string): void;
	/** A problem the user should hear about (microphone blocked, no service). */
	onError(message: string): void;
	/** The session ended on its own (not by stop()). */
	onEnd(): void;
}

export interface DictationSession {
	stop(): void;
}

/**
 * Speech to text. The built-in provider uses the browser's speech
 * recognition (Web Speech API); a host can supply its own (a server-side
 * model, a desktop app, ...).
 */
export interface DictationProvider {
	/** Shown in the button's tooltip, e.g. "browser speech recognition". */
	name?: string;
	start(handlers: DictationHandlers, opts: { lang: string }): DictationSession;
}

/** A code editor for raw HTML and source view (e.g. an Ace adapter). */
export interface CodeEditorInstance {
	getValue(): string;
	focus(): void;
	destroy?(): void;
}
export type CodeEditorFactory = (
	host: HTMLElement,
	opts: { value: string; mode: 'html'; label: string; labelId: string },
) => CodeEditorInstance;

export interface Plugin {
	id: string;
	/** Return a function to undo anything the plugin set up. */
	install(editor: Editor): void | (() => void);
}

export interface Command {
	id: string;
	label: string;
	icon?: string;
	/** e.g. "Mod+B", "Mod+Shift+7", "Mod+Alt+1". Mod is Cmd on Mac, Ctrl elsewhere. */
	shortcut?: string;
	/** Whether the command needs a caret in a rich column. */
	text?: boolean;
	run(editor: Editor, arg?: unknown): void | Promise<void>;
	isActive?(editor: Editor): boolean;
	isEnabled?(editor: Editor): boolean;
}

export type ToolbarItem =
	| { type: 'button'; id: string; command: string; label?: string; icon?: string; toggle?: boolean; text?: string }
	| {
			type: 'menu';
			id: string;
			label: string;
			icon?: string;
			/** Text shown on the button (e.g. the current font); also part of its name. */
			value?: (editor: Editor) => string;
			items: (editor: Editor) => MenuItem[];
			minWidth?: string;
			isEnabled?: (editor: Editor) => boolean;
	  }
	| { type: 'separator'; id: string };

export interface Panel {
	id: string;
	title: string;
	/** Build the panel content; called once, the first time it opens. */
	render(container: HTMLElement, editor: Editor): void;
	onOpen?(editor: Editor): void;
}

/** An action in a row or column handle menu. */
export interface HandleAction {
	id: string;
	label: string;
	kind: 'row' | 'col';
	shortcut?: string;
	danger?: boolean;
	/** Return false to hide the action for this row/column. */
	visible?(editor: Editor, ref: { rowId: string; colId?: string }): boolean;
	disabled?(editor: Editor, ref: { rowId: string; colId?: string }): boolean;
	run(editor: Editor, ref: { rowId: string; colId?: string }): void;
}

export interface NamedValue {
	name: string;
	value: string;
}

/** A site colour mode to preview in the canvas. */
export type ColorMode = 'light' | 'dark';

/**
 * How the site being edited switches between light and dark, so the canvas
 * can preview both:
 * - 'media': the site follows prefers-color-scheme (also covers light-dark()).
 * - { attribute }: an attribute on <html> (or <body> with on: 'body'), e.g.
 *   Bootstrap's data-bs-theme. `dark` defaults to "dark"; `light` is the
 *   light value, or the attribute is removed when omitted.
 * - { className }: a class present in dark mode (Tailwind's `dark`), with an
 *   optional lightClassName for light mode.
 * - a function that applies a mode to the canvas document itself.
 */
export type SiteTheme =
	| 'media'
	| { attribute: string; light?: string; dark?: string; on?: 'html' | 'body' }
	| { className: string; lightClassName?: string; on?: 'html' | 'body' }
	| ((doc: Document, mode: ColorMode) => void);

export interface EditorOptions {
	/** Converter id for output and editing. Default 'fusioncss'. */
	converter?: string;
	/**
	 * How the site switches light/dark, for the canvas preview toggle.
	 * Defaults to the converter's convention (Bootstrap 5 and 6 use
	 * data-bs-theme), else 'media' when the site's stylesheets have
	 * prefers-color-scheme rules. false turns the preview off.
	 */
	siteTheme?: SiteTheme | false;
	/** Colour mode the canvas starts in. Default 'light'. */
	colorMode?: ColorMode;
	/**
	 * Speech to text (the Dictate button). Off by default. true uses the
	 * browser's speech recognition where it exists; a provider uses that.
	 */
	dictation?: DictationProvider | boolean;
	/**
	 * Columns in the site's grid when it isn't built with the converter's
	 * default (12), e.g. 24 for a fusionCSS or Bootstrap build with
	 * `@numColumns` / `$grid-columns` set to 24.
	 */
	columns?: number;
	/** Stylesheet URLs loaded into the canvas (theme CSS, framework CSS). */
	stylesheets?: string[];
	/** Class for the canvas <body>, e.g. "container" or "page-content". */
	bodyClass?: string;
	/** Inline CSS added to the canvas after the stylesheets. */
	canvasCss?: string;
	/** Initial HTML. Defaults to the textarea value or the element's content. */
	value?: string;
	blocks?: Block[];
	blocksUrl?: string;
	/** Include the built-in blocks. Default true. */
	defaultBlocks?: boolean;
	media?: MediaProvider;
	fonts?: NamedValue[];
	fontSizes?: NamedValue[];
	colors?: NamedValue[];
	theme?: 'auto' | 'light' | 'dark';
	plugins?: Plugin[];
	/** Breakpoint new layouts and resizes apply to. Default 'md'. */
	breakpoint?: Exclude<Breakpoint, 'base'>;
	/** 'auto' grows with the content; any CSS length fixes the canvas height. */
	height?: string;
	minHeight?: string;
	/** Accessible name of the editor. */
	label?: string;
	/** Write raw-code markers in the output so raw blocks are recognised again. Default true. */
	rawMarkers?: boolean;
	/** Toolbar item ids in order ('|' for a separator). Defaults to all items. */
	toolbar?: string[];
	codeEditor?: CodeEditorFactory;
	/** Language of the content, set on the canvas <html>. */
	lang?: string;
	dir?: 'ltr' | 'rtl';
}
