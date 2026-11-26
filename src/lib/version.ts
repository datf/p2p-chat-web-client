declare const __APP_VERSION__: string | undefined;

export const UI_VERSION: string =
	typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.1';

