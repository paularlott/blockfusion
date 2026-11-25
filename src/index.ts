/**
 * BlockFusion: a dependency-free WYSIWYG page-content editor built on rows,
 * columns and blocks. This module is the public entry point (the global
 * `BlockFusion` in the IIFE build).
 */
import { DEFAULT_BLOCKS, placeholder } from './blocks/defaults';
import { convertHTML, detectConverter, loadHTML, parseWith } from './converters/convert';
import { createGridConverter, spanParser } from './converters/grid';
import { builtinConverters, registerBuiltinConverters } from './converters/index';
import { getConverter, listConverters, registerConverter } from './converters/registry';
import { CSSGRID_STYLESHEET, cssGridStylesheet } from './converters/cssgrid';
import { Editor } from './editor';
import { History } from './history/history';
import * as model from './model/doc';
import { cleanPaste, textToHtml } from './paste/clean';
import * as plugins from './plugins/index';
import { checkContent } from './plugins/checker';
import { webSpeechDictation } from './plugins/dictation';
import type { EditorOptions } from './types';

registerBuiltinConverters();

export const version = '0.1.0';

const instances = new WeakMap<HTMLElement, Editor>();

/**
 * Create an editor on a <textarea> (kept in sync for form posts) or on any
 * element (its content becomes the initial value). `target` may be a selector.
 */
export function create(target: HTMLElement | string, options: EditorOptions = {}): Editor {
	const el = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target;
	if (!el) throw new Error(`BlockFusion: target "${String(target)}" not found`);
	instances.get(el)?.destroy();
	const editor = new Editor(el, options);
	instances.set(el, editor);
	editor.on('destroy', () => instances.delete(el));
	return editor;
}

/** The editor created on an element, if any. */
export function get(el: HTMLElement): Editor | undefined {
	return instances.get(el);
}

export {
	builtinConverters,
	checkContent,
	cleanPaste,
	convertHTML,
	createGridConverter,
	CSSGRID_STYLESHEET,
	cssGridStylesheet,
	DEFAULT_BLOCKS,
	detectConverter,
	Editor,
	getConverter,
	History,
	listConverters,
	loadHTML,
	model,
	parseWith,
	placeholder,
	plugins,
	registerConverter,
	spanParser,
	textToHtml,
	webSpeechDictation,
};

export type * from './types';
export type { Attrs, Block, Breakpoint, Col, Doc, Row, Span } from './model/types';
export type { Converter, ParseContext, RenderOptions } from './converters/types';
export type { GridConfig } from './converters/grid';
