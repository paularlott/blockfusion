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

/** The id of a one-shot action (see AssistantAction). */
export type AssistantTask = string;

/**
 * A one-shot action on the selection or paragraph, e.g. "Make shorter".
 * `prompt` is the instruction sent to the provider with the text.
 */
export interface AssistantAction {
	id: string;
	label: string;
	prompt: string;
}

/** Model loading or working; progress 0..1 when known. */
export interface AssistantProgress {
	text: string;
	progress?: number;
}

/** An action the assistant can take on the page (JSON Schema parameters). */
export interface AssistantTool {
	name: string;
	description: string;
	parameters: Record<string, unknown>;
}

export interface AssistantToolCall {
	name: string;
	arguments: Record<string, unknown>;
}

/**
 * The conversation so far. 'tool' messages report what an action did, for
 * the model to carry on from.
 */
export interface AssistantMessage {
	role: 'user' | 'assistant' | 'tool';
	content: string;
	/** On assistant messages: the actions it asked for. */
	calls?: AssistantToolCall[];
}

/**
 * An AI helper, in the browser (a local model) or on your own server.
 * Every method is optional; the editor offers what the provider has.
 */
export interface AssistantProvider {
	/** Shown with suggestions, e.g. "on this device" or "our server". */
	name?: string;
	/** Describe an image for its alt text. `image` is the file when the editor could read it. */
	describeImage?(req: {
		src: string;
		image: Blob | null;
		lang: string;
		signal: AbortSignal;
		onProgress?(p: AssistantProgress): void;
	}): Promise<string>;
	/**
	 * Chat: answer, or ask for actions on the page. `context` describes the
	 * page (rows, columns, the start of their text, the cursor); the editor
	 * runs the actions, reports back as 'tool' messages and asks again until
	 * the reply has no more actions.
	 */
	chat?(req: {
		messages: AssistantMessage[];
		tools: AssistantTool[];
		context: string;
		lang: string;
		signal: AbortSignal;
		onToken?(text: string): void;
		onProgress?(p: AssistantProgress): void;
	}): Promise<{ text: string; calls: AssistantToolCall[] }>;
	/** Rewrite text; may stream with onToken. Resolves with the whole result. */
	rewrite?(req: {
		text: string;
		/** The action's id. */
		task: AssistantTask;
		/** The action's instruction, e.g. "Make the text shorter…". */
		instruction: string;
		lang: string;
		signal: AbortSignal;
		onToken?(text: string): void;
		onProgress?(p: AssistantProgress): void;
	}): Promise<string>;
}

/**
 * Lets a plugin add to the image dialog (the assistant's Suggest a
 * description). Called each time the dialog opens.
 */
export type ImageDialogHook = (ctx: {
	editor: Editor;
	src: HTMLInputElement;
	alt: HTMLInputElement;
	/** Untick "Decorative" and enable the alt field. */
	setDescribed(): void;
}) => ImageDialogAddition | void;

export interface ImageDialogAddition {
	/** Shown under the alt text field. */
	field?: HTMLElement;
	/** Run when the dialog was opened asking for it (exec('image', { suggest: true })). */
	start?(): void;
	/** The dialog closed. */
	close?(): void;
}

export interface ReadAloudOptions {
	/** A voice name from speechSynthesis.getVoices(); default: one for the content's language. */
	voice?: string;
	/** Speaking rate, 0.5 to 2. Default 1. */
	rate?: number;
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
	 * Show the editor's messages (dictation stopped, the assistant couldn't
	 * help, ...) with the host page's own notifications instead of the
	 * editor's toasts. The host shows and announces them. Return a function
	 * that removes the message, so the editor can clear it later
	 * (clearNotices); messages with the same key replace each other.
	 */
	notify?: (message: string, kind: 'info' | 'error', opts: { key?: string }) => void | (() => void);
	/**
	 * Speech to text (the Dictate button). Off by default. true uses the
	 * browser's speech recognition where it exists; a provider uses that.
	 */
	dictation?: DictationProvider | boolean;
	/**
	 * The Read aloud button: the browser speaks the selection or the column.
	 * Off by default; true turns it on, or give a voice name and rate.
	 */
	readAloud?: boolean | ReadAloudOptions;
	/**
	 * An AI assistant: "Suggest a description" for images and an Assistant
	 * menu for text. Off by default. See BlockFusion.httpAssistant for a
	 * server, or the blockfusion-ai extension for a model in the browser.
	 */
	assistant?: AssistantProvider;
	/**
	 * One-shot actions offered on the selection or paragraph (the Assistant
	 * menu, or quick buttons in the chat). Default: improve, fix, shorten,
	 * simplify. An empty list turns them off.
	 */
	assistantActions?: AssistantAction[];
	/** Offer a chat that can change the page, when the provider can chat. Default false. */
	assistantChat?: boolean;
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
