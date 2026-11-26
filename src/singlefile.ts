// @ts-expect-error Untyped Go WASM runtime side-effect script bundled via Vite #web alias
import '#web/wasm_exec.js';
// @ts-expect-error Untyped Cotilla JS bridge side-effect script bundled via Vite #web alias
import '#web/cotilla.js';
import sframeWorkerCode from '#web/sframe-worker.js?raw';
import './routes/layout.css';
import { mount } from 'svelte';
import Page from './routes/+page.svelte';

if (typeof window !== 'undefined') {
	(window as any).__COTILLA_BOOTSTRAP__ = (window as any).__COTILLA_BOOTSTRAP__ || {};
	if (!(window as any).__COTILLA_BOOTSTRAP__.createSFrameWorker) {
		(window as any).__COTILLA_BOOTSTRAP__.createSFrameWorker = () => {
			const blob = new Blob([sframeWorkerCode], { type: 'application/javascript' });
			return new Worker(URL.createObjectURL(blob));
		};
	}
}

const target = document.getElementById('app') || document.body;
mount(Page, { target });
