// See https://svelte.dev/docs/kit/types#app.d.ts
declare const __APP_VERSION__: string;

declare module '#web/wasm_exec.js' {}
declare module '#web/cotilla.js' {}
declare module '#web/sframe-worker.js?raw' {
	const raw: string;
	export default raw;
}

declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	interface Window {
		CotillaClient?: any;
		cotillaClient?: any;
		cotillaApp?: any;
		Go?: any;
		AudioContext?: typeof AudioContext;
		webkitAudioContext?: typeof AudioContext;
	}
}

export {};
