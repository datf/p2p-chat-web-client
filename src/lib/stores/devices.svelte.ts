import type {
	AudioProcessorStatus,
	EchoCancellationMode,
	NoiseSuppressionMode
} from '../types';
import {
	enumerateDevices,
	type AudioConstraintsOptions,
	type DeviceList
} from '../platform/mediaDevices';
import { loadAudioProcessingPrefs, saveAudioProcessingPrefs } from '../platform/storage';

/** Manages audio/video hardware enumeration, active device selections, and DSP mode prefs. */
export class DeviceStore {
	private initialPrefs = loadAudioProcessingPrefs();

	selectedAudioInputId = $state('');
	selectedAudioOutputId = $state('');
	selectedVideoInputId = $state('');

	availableAudioInputs = $state<MediaDeviceInfo[]>([]);
	availableAudioOutputs = $state<MediaDeviceInfo[]>([]);
	availableVideoInputs = $state<MediaDeviceInfo[]>([]);

	noiseSuppressionMode = $state<NoiseSuppressionMode>(this.initialPrefs.noiseSuppressionMode);
	echoCancellationMode = $state<EchoCancellationMode>(this.initialPrefs.echoCancellationMode);
	autoGainControl = $state(this.initialPrefs.autoGainControl);
	voiceIsolation = $state(this.initialPrefs.voiceIsolation);

	audioProcessorStatus = $state<AudioProcessorStatus>({ state: 'idle' });

	private deviceChangeListener: (() => void) | null = null;

	getAudioConstraintsOptions(deviceIdOverride?: string): AudioConstraintsOptions {
		const deviceId =
			deviceIdOverride !== undefined
				? deviceIdOverride || undefined
				: this.selectedAudioInputId || undefined;
		return {
			deviceId,
			noiseSuppressionMode: this.noiseSuppressionMode,
			echoCancellationMode: this.echoCancellationMode,
			autoGainControl: this.autoGainControl,
			voiceIsolation: this.voiceIsolation
		};
	}

	persistAudioPrefs() {
		saveAudioProcessingPrefs({
			noiseSuppressionMode: this.noiseSuppressionMode,
			echoCancellationMode: this.echoCancellationMode,
			autoGainControl: this.autoGainControl,
			voiceIsolation: this.voiceIsolation
		});
	}

	async refreshDevices(): Promise<DeviceList> {
		const list = await enumerateDevices();
		this.availableAudioInputs = list.audioInputs;
		this.availableAudioOutputs = list.audioOutputs;
		this.availableVideoInputs = list.videoInputs;

		if (
			this.selectedAudioInputId &&
			list.audioInputs.length > 0 &&
			!list.audioInputs.some((d) => d.deviceId === this.selectedAudioInputId)
		) {
			this.selectedAudioInputId = list.audioInputs[0].deviceId;
		}
		if (
			this.selectedAudioOutputId &&
			list.audioOutputs.length > 0 &&
			!list.audioOutputs.some((d) => d.deviceId === this.selectedAudioOutputId)
		) {
			this.selectedAudioOutputId = list.audioOutputs[0].deviceId;
		}
		if (
			this.selectedVideoInputId &&
			list.videoInputs.length > 0 &&
			!list.videoInputs.some((d) => d.deviceId === this.selectedVideoInputId)
		) {
			this.selectedVideoInputId = list.videoInputs[0].deviceId;
		}

		return list;
	}

	startListening() {
		if (typeof navigator === 'undefined' || !navigator.mediaDevices?.addEventListener) return;
		if (this.deviceChangeListener) return;
		this.deviceChangeListener = () => {
			void this.refreshDevices();
		};
		navigator.mediaDevices.addEventListener('devicechange', this.deviceChangeListener);
	}

	stopListening() {
		if (
			typeof navigator !== 'undefined' &&
			navigator.mediaDevices?.removeEventListener &&
			this.deviceChangeListener
		) {
			navigator.mediaDevices.removeEventListener('devicechange', this.deviceChangeListener);
		}
		this.deviceChangeListener = null;
	}
}
