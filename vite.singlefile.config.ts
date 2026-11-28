import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { minify } from 'html-minifier-terser';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import pkg from './package.json' with { type: 'json' };

const dir = typeof import.meta.dirname !== 'undefined' ? import.meta.dirname : path.dirname(new URL(import.meta.url).pathname);

function resolveWasmExec(): string {
	const goroot = execFileSync('go', ['env', 'GOROOT'], { encoding: 'utf-8' }).trim();
	const found = [
		path.join(goroot, 'lib', 'wasm', 'wasm_exec.js'),
		path.join(goroot, 'misc', 'wasm', 'wasm_exec.js')
	].find((p) => fs.existsSync(p));
	if (!found) {
		throw new Error(`wasm_exec.js not found in GOROOT (${goroot})`);
	}
	return found;
}

const minifyHtml = (): Plugin => ({
	name: 'html-minifier',
	enforce: 'post',
	async transformIndexHtml(html: string) {
		return await minify(html, {
			collapseWhitespace: true,
			removeComments: true,
			removeRedundantAttributes: true,
			removeOptionalTags: true,
			minifyCSS: true,
			minifyJS: true
		});
	}
});

export default defineConfig({
	root: dir,
	plugins: [
		tailwindcss(),
		svelte({
			compilerOptions: {
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			}
		}),
		viteSingleFile(),
		minifyHtml()
	],
	define: {
		__APP_VERSION__: JSON.stringify(pkg.version || '0.0.1')
	},
	resolve: {
		alias: [
			{ find: '#lib', replacement: path.resolve(dir, 'src/lib') },
			{ find: '#web/wasm_exec.js', replacement: resolveWasmExec() },
			{ find: '#web', replacement: path.resolve(dir, '../web') }
		]
	},
	build: {
		target: 'esnext',
		assetsInlineLimit: 100_000_000,
		outDir: 'dist-singlefile',
		emptyOutDir: true,
		rollupOptions: {
			input: path.resolve(dir, 'singlefile.html')
		}
	}
});
