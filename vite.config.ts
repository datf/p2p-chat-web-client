import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import pkg from './package.json' with { type: 'json' };

const require = createRequire(import.meta.url);
const dir = typeof import.meta.dirname !== 'undefined' ? import.meta.dirname : path.dirname(new URL(import.meta.url).pathname);

function firstExisting(paths: string[]): string | undefined {
	return paths.find((p) => fs.existsSync(p));
}

function resolveGoWasmExec(): string {
	const goroot = execFileSync('go', ['env', 'GOROOT'], { encoding: 'utf-8' }).trim();
	const found = firstExisting([
		path.join(goroot, 'lib', 'wasm', 'wasm_exec.js'),
		path.join(goroot, 'misc', 'wasm', 'wasm_exec.js')
	]);
	if (!found) {
		throw new Error(`wasm_exec.js not found in GOROOT (${goroot})`);
	}
	return found;
}

function resolveWasmPath(): string | undefined {
	const candidates: string[] = [];
	if (process.env.COTILLA_WASM_DIR) {
		candidates.push(path.resolve(dir, process.env.COTILLA_WASM_DIR, 'cotilla.wasm'));
	}
	candidates.push(path.resolve(dir, '../dist/wasm/cotilla.wasm'));
	try {
		const pkgDir = path.dirname(require.resolve('@datf/cotilla-wasm/package.json'));
		candidates.push(path.join(pkgDir, 'cotilla.wasm'));
	} catch {
		// Optional npm package fallback for standalone builds
	}
	candidates.push(path.resolve(dir, '../dist/web/cotilla.wasm'));
	return firstExisting(candidates);
}

function resolveWebAsset(filename: string): string | undefined {
	const candidates: string[] = [];
	if (process.env.COTILLA_WEB_DIR) {
		candidates.push(path.resolve(dir, process.env.COTILLA_WEB_DIR, filename));
	}
	candidates.push(path.resolve(dir, '../web', filename));
	candidates.push(path.resolve(dir, '../dist/web', filename));
	return firstExisting(candidates);
}

function syncCotillaStaticAssets(): Plugin {
	const sync = () => {
		const staticDir = path.resolve(dir, 'static');
		fs.mkdirSync(staticDir, { recursive: true });
		const wasmSrc = resolveWasmPath();
		if (wasmSrc) {
			fs.copyFileSync(wasmSrc, path.join(staticDir, 'cotilla.wasm'));
		}
		fs.copyFileSync(resolveGoWasmExec(), path.join(staticDir, 'wasm_exec.js'));
		for (const name of ['cotilla.js', 'sframe-worker.js']) {
			const src = resolveWebAsset(name);
			if (src) {
				fs.copyFileSync(src, path.join(staticDir, name));
			}
		}
	};
	return {
		name: 'sync-cotilla-static-assets',
		buildStart: sync,
		configureServer: sync
	};
}

export default defineConfig({
	define: {
		__APP_VERSION__: JSON.stringify(pkg.version || '0.0.1')
	},
	plugins: [
		syncCotillaStaticAssets(),
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter({
				fallback: 'index.html'
			})
		})
	],
	server: {
		proxy: {
			'/ws': {
				target: (globalThis as any).process?.env?.VITE_SIGNALING_TARGET || 'ws://localhost:8080',
				ws: true,
				changeOrigin: true
			}
		}
	}
});
