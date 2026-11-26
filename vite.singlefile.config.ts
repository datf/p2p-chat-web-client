import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from '../cotilla-bootstrap/node_modules/vite-plugin-singlefile/dist/esm/index.js';
import { minify } from '../cotilla-bootstrap/node_modules/html-minifier-terser/src/htmlminifier.js';
import path from 'node:path';
import pkg from './package.json' with { type: 'json' };

const dir = typeof import.meta.dirname !== 'undefined' ? import.meta.dirname : path.dirname(new URL(import.meta.url).pathname);

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
		alias: {
			'#lib': path.resolve(dir, 'src/lib'),
			'#web': path.resolve(dir, '../web')
		}
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
