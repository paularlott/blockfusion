/**
 * Refresh the framework stylesheets the demo uses, from npm (run once; the
 * results are committed so the demo needs no network):
 *   node scripts/vendor.mjs [path/to/fusionCSS] [path/to/axe.min.js]
 * Packages are fetched with `npm pack` into a temporary folder and only
 * their CSS is copied. The Tailwind build runs the Tailwind CLI over the
 * classes the converter writes. axe-core is copied for local testing only
 * and is git-ignored.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const out = resolve('demo/vendor');
mkdirSync(out, { recursive: true });
const fusionDir = resolve(process.argv[2] ?? join(process.env.HOME ?? '', 'Code/fusionCSS'));
const axe = process.argv[3] ? resolve(process.argv[3]) : null;

const packages = [
	['bootstrap@3.4.1', 'package/dist/css/bootstrap.min.css', 'bootstrap3.min.css'],
	['bootstrap@5.3.9', 'package/dist/css/bootstrap.min.css', 'bootstrap5.min.css'],
	['bootstrap@6.0.0-alpha.2', 'package/dist/css/bootstrap.min.css', 'bootstrap6.min.css'],
	['foundation-sites@5.5.3', 'package/css/foundation.min.css', 'foundation5.min.css'],
	['foundation-sites@6.9.0', 'package/dist/css/foundation.min.css', 'foundation6.min.css'],
];

for (const [spec, file, name] of packages) {
	// Each package goes into its own empty folder and is only read as data.
	const dir = mkdtempSync(join(tmpdir(), 'bf-vendor-'));
	try {
		const tgz = execFileSync('npm', ['pack', spec, '--silent', '--pack-destination', dir], { encoding: 'utf8' }).trim().split('\n').pop();
		execFileSync('tar', ['-xzf', join(dir, tgz), '-C', dir, file]);
		copyFileSync(join(dir, file), join(out, name));
		console.log(`${spec} -> demo/vendor/${name}`);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

if (existsSync(join(fusionDir, 'css/fusioncss.visibility.css'))) {
	copyFileSync(join(fusionDir, 'css/fusioncss.visibility.css'), join(out, 'fusioncss.min.css'));
	console.log('fusionCSS -> demo/vendor/fusioncss.min.css');
} else console.warn('fusionCSS not found at', fusionDir);

// Tailwind: build only the utilities the converter and demo use.
const twDir = mkdtempSync(join(tmpdir(), 'bf-tw-'));
try {
	const input = join(twDir, 'input.css');
	writeFileSync(
		input,
		[
			'@import "tailwindcss";',
			`@source "${resolve('src')}";`,
			`@source "${resolve('demo')}";`,
			'@source inline("{sm:,md:,lg:,}col-span-{1,2,3,4,5,6,7,8,9,10,11,12}");',
			'@source inline("{sm:,md:,lg:,}{hidden,block} grid grid-cols-12 gap-6");',
		].join('\n'),
	);
	execFileSync('npm', ['install', '--silent', '--no-save', '--ignore-scripts', '--prefix', twDir, 'tailwindcss@4.3.5', '@tailwindcss/cli@4.3.5'], { stdio: 'inherit' });
	execFileSync(join(twDir, 'node_modules/.bin/tailwindcss'), ['-i', input, '-o', join(out, 'tailwind.min.css'), '--minify'], { stdio: 'inherit' });
	console.log('tailwind -> demo/vendor/tailwind.min.css');
} finally {
	rmSync(twDir, { recursive: true, force: true });
}

if (axe) {
	copyFileSync(axe, join(out, 'axe.min.js'));
	console.log('axe-core -> demo/vendor/axe.min.js (git-ignored)');
}
