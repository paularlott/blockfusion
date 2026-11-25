/**
 * Build the distributable files:
 *   dist/blockfusion.js       IIFE, global BlockFusion
 *   dist/blockfusion.mjs      ES module
 *   dist/blockfusion.css      editor chrome styles
 *   dist/blockfusion-grid.css stylesheet for sites using the CSS grid converter
 * Pass --watch to rebuild on change.
 */
import * as esbuild from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const watch = process.argv.includes('--watch');
const notice = '/*! BlockFusion | Copyright (c) 2026 Paul Arlott | MIT License */';
const banner = { js: notice, css: notice };
const common = { bundle: true, minify: true, target: ['es2020', 'chrome100', 'firefox100', 'safari15'], banner, logLevel: 'info' };

const configs = [
	{ ...common, entryPoints: ['src/index.ts'], format: 'iife', globalName: 'BlockFusion', outfile: 'dist/blockfusion.js' },
	{ ...common, entryPoints: ['src/index.ts'], format: 'esm', outfile: 'dist/blockfusion.mjs' },
	{ ...common, entryPoints: ['src/styles/blockfusion.css'], outfile: 'dist/blockfusion.css' },
];

async function gridCss() {
	const mod = await import(pathToFileURL(resolve('dist/blockfusion.mjs')).href + '?t=' + Date.now());
	await writeFile('dist/blockfusion-grid.css', banner.css + '\n' + mod.CSSGRID_STYLESHEET + '\n');
}

await mkdir('dist', { recursive: true });
if (watch) {
	for (const c of configs) {
		const ctx = await esbuild.context({
			...c,
			plugins: c.format === 'esm' ? [{ name: 'grid-css', setup: (b) => b.onEnd(() => gridCss().catch(console.error)) }] : [],
		});
		await ctx.watch();
	}
	console.log('Watching for changes…');
} else {
	await Promise.all(configs.map((c) => esbuild.build(c)));
	await gridCss();
}
