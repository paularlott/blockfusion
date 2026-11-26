// Build the extension: an ES module that loads transformers.js on first use,
// with the ONNX Runtime WebAssembly files beside it (no CDN at run time).
import { build } from 'esbuild';
import { copyFile, mkdir, rm } from 'node:fs/promises';
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
// transformers.js bundles ONNX Runtime's WebGPU build, which loads only the
// asyncify runtime (for WebGPU and WebAssembly alike). The other variants
// (plain, jsep, jspi) are never fetched, so they aren't copied.
await rm('dist/ort', { recursive: true, force: true });
await mkdir('dist/ort', { recursive: true });
for (const f of ['ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm']) await copyFile(join(ort, f), join('dist/ort', f));
console.log('ONNX Runtime -> dist/ort/');
