import type {
	AudioProcessingPrefs,
	EchoCancellationMode,
	NoiseSuppressionMode,
	RecentRoom
} from '../types';

const RECENT_ROOMS_KEY = 'cotilla_recent_rooms';
const SIGNALING_URL_KEY = 'cotilla_signaling_url';
const AUDIO_PROCESSING_KEY = 'cotilla_audio_processing';

const VALID_NS_MODES = new Set<NoiseSuppressionMode>(['off', 'builtin']);
const VALID_EC_MODES = new Set<EchoCancellationMode>(['off', 'builtin']);

export const DEFAULT_AUDIO_PROCESSING_PREFS: AudioProcessingPrefs = {
	noiseSuppressionMode: 'builtin',
	echoCancellationMode: 'builtin',
	autoGainControl: true,
	voiceIsolation: true
};

function getSessionStorage(): Storage | null {
	if (typeof window === 'undefined') return null;
	try {
		return window.sessionStorage || null;
	} catch {
		return null;
	}
}

function getLocalStorage(): Storage | null {
	if (typeof window === 'undefined') return null;
	try {
		return window.localStorage || null;
	} catch {
		return null;
	}
}

export function loadRecentRooms(): RecentRoom[] {
	const storage = getSessionStorage();
	if (!storage) return [];
	try {
		const raw = storage.getItem(RECENT_ROOMS_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed)) {
			return parsed.filter(
				(item) => item && typeof item.roomID === 'string' && typeof item.roomKey === 'string'
			);
		}
	} catch (e) {
		console.warn('Failed to load recent rooms from sessionStorage', e);
	}
	return [];
}

export function saveRecentRooms(rooms: RecentRoom[]): void {
	const storage = getSessionStorage();
	if (!storage) return;
	try {
		storage.setItem(RECENT_ROOMS_KEY, JSON.stringify(rooms.slice(0, 8)));
	} catch (e) {
		console.warn('Failed to save recent rooms to sessionStorage', e);
	}
}

export function clearRecentRoomsStorage(): void {
	const storage = getSessionStorage();
	if (!storage) return;
	try {
		storage.removeItem(RECENT_ROOMS_KEY);
	} catch (e) {
		console.warn('Failed to clear recent rooms from sessionStorage', e);
	}
}

export function getDefaultSignalingUrl(): string {
	if (typeof window !== 'undefined') {
		const bootSig = (window as any).__COTILLA_BOOTSTRAP__?.signalingUrl;
		if (bootSig && typeof bootSig === 'string') return bootSig;
		if (window.location?.host) {
			const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
			return `${proto}//${window.location.host}/ws`;
		}
	}
	return 'ws://localhost:8080/ws';
}

export function resolveSignalingUrl(): string {
	if (typeof window !== 'undefined') {
		try {
			const params = new URLSearchParams(window.location.search || '');
			const querySig = params.get('signaling');
			if (querySig && querySig.trim()) return querySig.trim();

			const storage = getLocalStorage();
			if (storage) {
				const saved = storage.getItem(SIGNALING_URL_KEY);
				if (saved && saved.trim()) return saved.trim();
			}

			return getDefaultSignalingUrl();
		} catch (e) {
			console.warn('Failed to resolve signaling URL from window location', e);
		}
	}
	return 'ws://localhost:8080/ws';
}

export function saveSignalingUrl(url: string): void {
	const storage = getLocalStorage();
	if (!storage) return;
	try {
		if (url && url.trim()) {
			storage.setItem(SIGNALING_URL_KEY, url.trim());
		} else {
			storage.removeItem(SIGNALING_URL_KEY);
		}
	} catch (e) {
		console.warn('Failed to save signaling URL to localStorage', e);
	}
}

export function loadAudioProcessingPrefs(): AudioProcessingPrefs {
	const storage = getLocalStorage();
	if (!storage) return { ...DEFAULT_AUDIO_PROCESSING_PREFS };
	try {
		const raw = storage.getItem(AUDIO_PROCESSING_KEY);
		if (!raw) return { ...DEFAULT_AUDIO_PROCESSING_PREFS };
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_AUDIO_PROCESSING_PREFS };

		const ns = VALID_NS_MODES.has(parsed.noiseSuppressionMode)
			? (parsed.noiseSuppressionMode as NoiseSuppressionMode)
			: DEFAULT_AUDIO_PROCESSING_PREFS.noiseSuppressionMode;
		const ec = VALID_EC_MODES.has(parsed.echoCancellationMode)
			? (parsed.echoCancellationMode as EchoCancellationMode)
			: DEFAULT_AUDIO_PROCESSING_PREFS.echoCancellationMode;

		return {
			noiseSuppressionMode: ns,
			echoCancellationMode: ec,
			autoGainControl:
				typeof parsed.autoGainControl === 'boolean'
					? parsed.autoGainControl
					: DEFAULT_AUDIO_PROCESSING_PREFS.autoGainControl,
			voiceIsolation:
				typeof parsed.voiceIsolation === 'boolean'
					? parsed.voiceIsolation
					: DEFAULT_AUDIO_PROCESSING_PREFS.voiceIsolation
		};
	} catch (e) {
		console.warn('Failed to load audio processing preferences', e);
		return { ...DEFAULT_AUDIO_PROCESSING_PREFS };
	}
}

export function saveAudioProcessingPrefs(prefs: AudioProcessingPrefs): void {
	const storage = getLocalStorage();
	if (!storage) return;
	try {
		storage.setItem(AUDIO_PROCESSING_KEY, JSON.stringify(prefs));
	} catch (e) {
		console.warn('Failed to save audio processing preferences', e);
	}
}
