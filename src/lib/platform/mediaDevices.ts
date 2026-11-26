import type { EchoCancellationMode, NoiseSuppressionMode } from '../types';

export interface DeviceList {
	audioInputs: MediaDeviceInfo[];
	audioOutputs: MediaDeviceInfo[];
	videoInputs: MediaDeviceInfo[];
}

export async function enumerateDevices(): Promise<DeviceList> {
	if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
		return { audioInputs: [], audioOutputs: [], videoInputs: [] };
	}

	try {
		const devices = await navigator.mediaDevices.enumerateDevices();
		return {
			audioInputs: devices.filter((d) => d.kind === 'audioinput'),
			audioOutputs: devices.filter((d) => d.kind === 'audiooutput'),
			videoInputs: devices.filter((d) => d.kind === 'videoinput')
		};
	} catch (e) {
		console.warn('Failed to enumerate media devices', e);
		return { audioInputs: [], audioOutputs: [], videoInputs: [] };
	}
}

export interface AudioConstraintsOptions {
	deviceId?: string;
	noiseSuppressionMode?: NoiseSuppressionMode;
	echoCancellationMode?: EchoCancellationMode;
	autoGainControl?: boolean;
	voiceIsolation?: boolean;
}

export function audioHardwareConstraintKey(
	optionsOrDeviceId?: string | AudioConstraintsOptions
): string {
	const opts: AudioConstraintsOptions =
		typeof optionsOrDeviceId === 'string'
			? { deviceId: optionsOrDeviceId }
			: optionsOrDeviceId || {};
	const c = buildAudioTrackConstraints(opts);
	return JSON.stringify({
		deviceId: opts.deviceId || '',
		ec: c.echoCancellation,
		ns: c.noiseSuppression,
		agc: c.autoGainControl,
		vi: (c as any).voiceIsolation,
		ch: c.channelCount
	});
}

export function buildAudioTrackConstraints(
	optionsOrDeviceId?: string | AudioConstraintsOptions
): MediaTrackConstraints {
	const opts: AudioConstraintsOptions =
		typeof optionsOrDeviceId === 'string'
			? { deviceId: optionsOrDeviceId }
			: optionsOrDeviceId || {};

	const nsMode: NoiseSuppressionMode = opts.noiseSuppressionMode ?? 'builtin';
	const ecMode: EchoCancellationMode = opts.echoCancellationMode ?? 'builtin';

	const useBrowserNS = nsMode === 'builtin';
	const useBrowserEC = ecMode === 'builtin';
	const useBrowserIsolation = useBrowserNS && (opts.voiceIsolation ?? true);
	const useBrowserAGC = opts.autoGainControl ?? true;
	const constraints: Record<string, any> = {
		echoCancellation: useBrowserEC,
		noiseSuppression: useBrowserNS,
		autoGainControl: useBrowserAGC,
		voiceIsolation: useBrowserIsolation,
		// Explicit booleans so live track.applyConstraints() and getUserMedia take clear flags
		googEchoCancellation: useBrowserEC,
		googNoiseSuppression: useBrowserNS,
		googHighpassFilter: useBrowserNS,
		googTypingNoiseDetection: useBrowserIsolation,
		googAutoGainControl: useBrowserAGC
	};

	if (opts.deviceId) {
		constraints.deviceId = { exact: opts.deviceId };
	}

	return constraints as MediaTrackConstraints;
}

export async function acquireAudioStream(
	optionsOrDeviceId?: string | AudioConstraintsOptions
): Promise<MediaStream> {
	if (typeof window !== 'undefined' && window.isSecureContext === false) {
		throw new Error('Microphone access requires HTTPS or localhost (blocked on insecure HTTP origins).');
	}
	if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
		throw new Error('Microphone access is not supported in this browser.');
	}

	const constraints = buildAudioTrackConstraints(optionsOrDeviceId);

	return navigator.mediaDevices.getUserMedia({ audio: constraints });
}

export async function acquireVideoStream(deviceId?: string): Promise<MediaStream> {
	if (typeof window !== 'undefined' && window.isSecureContext === false) {
		throw new Error('Camera access requires HTTPS or localhost (blocked on insecure HTTP origins).');
	}
	if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
		throw new Error('Camera access is not supported in this browser.');
	}

	const constraints: MediaTrackConstraints = {
		width: { ideal: 1280 },
		height: { ideal: 720 },
		frameRate: { ideal: 30 }
	};

	if (deviceId) {
		constraints.deviceId = { exact: deviceId };
	}

	return navigator.mediaDevices.getUserMedia({ video: constraints });
}

export async function acquireScreenStream(): Promise<MediaStream> {
	if (typeof window !== 'undefined' && window.isSecureContext === false) {
		throw new Error('Screen sharing requires HTTPS or localhost (blocked on insecure HTTP origins).');
	}
	if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
		throw new Error('Screen sharing is not supported in this browser.');
	}

	try {
		return await navigator.mediaDevices.getDisplayMedia({
			video: {
				cursor: 'always',
				displaySurface: 'monitor'
			} as any,
			audio: {
				echoCancellation: false,
				noiseSuppression: false,
				autoGainControl: false,
				systemAudio: 'include'
			} as any
		});
	} catch (err: unknown) {
		// Some browsers fail if audio is requested but unavailable; fallback to video-only
		if (err instanceof Error && err.name !== 'NotAllowedError') {
			try {
				return await navigator.mediaDevices.getDisplayMedia({
					video: {
						cursor: 'always',
						displaySurface: 'monitor'
					} as any,
					audio: false
				});
			} catch {}
		}
		throw err;
	}
}

export function stopMediaStream(stream: MediaStream | null | undefined): void {
	if (!stream) return;
	try {
		for (const track of stream.getTracks()) {
			track.stop();
		}
	} catch (e) {
		console.warn('Error stopping media tracks', e);
	}
}
