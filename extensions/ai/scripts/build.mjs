// Build the extension: an ES module that loads transformers.js on first use,
// with the ONNX Runtime WebAssembly files beside it (no CDN at run time).
import { build } from 'esbuild';
import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';

await build({
	entryPoints: ['src/index.ts'],
	outdir: 'dist',
	entryNames: 'blockfusion-ai',
	chunkNames: 'chunks/[name]-[hash]',
	bundle: true,
	splitting: true,
	format: 'esm',
	outExtension: { '.js': '.mjs' },
	minify: true,
	target: ['es2022'],
	banner: { js: '/*! blockfusion-ai | Copyright (c) 2026 Paul Arlott | MIT License. Includes transformers.js (Apache-2.0) and ONNX Runtime Web (MIT). */' },
	logLevel: 'info',
});

const ort = 'node_modules/onnxruntime-web/dist';
await mkdir('dist/ort', { recursive: true });
for (const f of await readdir(ort)) {
	// Each runtime build (CPU, WebGPU via asyncify, JSPI, JSEP); a browser fetches only the one it uses
	if (/^ort-wasm-simd-threaded(\.\w+)?\.(mjs|wasm)$/.test(f)) await copyFile(join(ort, f), join('dist/ort', f));
}
console.log('ONNX Runtime -> dist/ort/');
