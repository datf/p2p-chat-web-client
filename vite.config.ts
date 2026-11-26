import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
	define: {
		__APP_VERSION__: JSON.stringify(pkg.version || '0.0.1')
	},
	plugins: [
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
