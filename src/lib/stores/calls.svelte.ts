import { SvelteMap } from 'svelte/reactivity';
import type { AudioProcessorStatus, CallParticipant } from '../types';
import { formatError, short } from '../utils/format';
import { createRmsAudioMeter, type RmsMeterHandle } from '../platform/audioAnalyser';
import {
	combineLocalAudioStreams,
	type LocalAudioMixerHandle
} from '../platform/audioGain';
import {
	createAudioProcessingPipeline,
	requiresNeuralAudioPipeline,
	type AudioProcessingPipeline
} from '../platform/audioProcessing';
import {
	acquireAudioStream,
	acquireScreenStream,
	acquireVideoStream,
	audioHardwareConstraintKey,
	buildAudioTrackConstraints,
	stopMediaStream,
	type AudioConstraintsOptions
} from '../platform/mediaDevices';
import { notifications } from './notifications.svelte';

export interface CallTarget {
	scopeID: string;
	isDM: boolean;
	peerAddr?: string;
}

/** Owns secondary WebRTC call state, local/remote tracks, SFrame call epoch, and speaking meters. */
export class CallStore {
	callJoined = $state(false);
	callScopeID = $state<string | null>(null);
	callIsDM = $state(false);
	callPeerAddr = $state<string | null>(null);
	callEpoch = $state<number | null>(null);
	micEnabled = $state(false);
	camEnabled = $state(false);
	screenSharing = $state(false);
	callDurationSec = $state(0);
	activeSpeakerAddr = $state<string | null>(null);
	callParticipants = new SvelteMap<string, CallParticipant>();

	localStream = $state<MediaStream | null>(null);
	camStream = $state<MediaStream | null>(null);
	screenStream = $state<MediaStream | null>(null);

	peerGains = new SvelteMap<string, number>();
	private lastNonZeroGains = new Map<string, number>();
	private localAudioMixer: LocalAudioMixerHandle | null = null;
	private rawLocalStream: MediaStream | null = null;
	private rawAudioHardwareKey: string | null = null;
	private audioPipeline: AudioProcessingPipeline | null = null;
	private remoteLoopbackStream: MediaStream | null = null;
	private audioPipelineEpoch = 0;
	private statusCallback: ((status: AudioProcessorStatus) => void) | null = null;
	private localScreenStartedAt = 0;
	private callTimerInterval: ReturnType<typeof setInterval> | null = null;
	private audioAnalysers = new Map<string, RmsMeterHandle>();
	private remoteCallPresence = new Map<string, any>();

	setStatusCallback(cb: ((status: AudioProcessorStatus) => void) | null) {
		this.statusCallback = cb;
	}

	setRemoteLoopbackStream(stream: MediaStream | null) {
		this.remoteLoopbackStream = stream;
		this.audioPipeline?.updateLoopbackStream(stream);
	}

	getPeerGain(peerAddr: string): number {
		return this.peerGains.get(peerAddr) ?? 1.0;
	}

	setPeerGain(peerAddr: string, gain: number) {
		const clamped = Math.max(0, Math.min(2, Math.round(gain * 100) / 100));
		this.peerGains.set(peerAddr, clamped);
		if (clamped > 0) {
			this.lastNonZeroGains.set(peerAddr, clamped);
		}
	}

	togglePeerMute(peerAddr: string) {
		const current = this.getPeerGain(peerAddr);
		if (current === 0) {
			const restore = this.lastNonZeroGains.get(peerAddr) ?? 1.0;
			this.setPeerGain(peerAddr, restore);
		} else {
			this.setPeerGain(peerAddr, 0);
		}
	}

	resetPeerGain(peerAddr: string) {
		this.setPeerGain(peerAddr, 1.0);
	}

	clearPeerGains() {
		this.peerGains.clear();
		this.lastNonZeroGains.clear();
	}

	currentCallOptions() {
		const sending = !!this.micEnabled || !!this.camEnabled || !!this.screenStream;
		return {
			listenOnly: !sending,
			audio: !!this.micEnabled,
			video: !!this.camEnabled,
			screen: !!this.screenStream
		};
	}

	private peerPresence(client: any, scopeID: string, peerAddr: string): any {
		const cached = this.remoteCallPresence.get(`${scopeID}::${peerAddr}`);
		if (cached) return cached;
		const call = client?.activeCalls?.get?.(scopeID);
		const p = call?.peers?.get?.(peerAddr);
		if (p) {
			this.remoteCallPresence.set(`${scopeID}::${peerAddr}`, p);
			return p;
		}
		return null;
	}

	async joinCall(client: any, me: { address: string } | null, target: CallTarget) {
		if (!target.scopeID) {
			notifications.notifyError('No active room to join call.');
			return;
		}
		if (!client) return;

		if (this.callJoined && this.callScopeID === target.scopeID) {
			return;
		}
		if (this.callJoined && this.callScopeID && this.callScopeID !== target.scopeID) {
			this.leaveCall(client);
		}

		try {
			this.callJoined = true;
			this.callScopeID = target.scopeID;
			this.callIsDM = target.isDM;
			this.callPeerAddr = target.peerAddr || null;

			const res = await client.joinCall(target.scopeID, target.isDM, this.currentCallOptions());
			if (!this.callJoined || this.callScopeID !== target.scopeID) {
				return;
			}

			this.callEpoch = res?.bundle?.epoch ?? (target.isDM ? 0 : null);
			this.syncLocalCallParticipant(me);

			// Hydrate already-joined peers returned by CotillaClient.joinCall -> activeCalls.peers
			const activeCall = client?.activeCalls?.get?.(target.scopeID);
			if (activeCall?.peers && typeof activeCall.peers.entries === 'function') {
				for (const [peerAddr, p] of activeCall.peers.entries()) {
					if (!peerAddr || (me && peerAddr === me.address)) continue;
					this.remoteCallPresence.set(`${target.scopeID}::${peerAddr}`, p);
					const existing = this.callParticipants.get(peerAddr);
					const screenStartedAt = p?.screen ? existing?.screenStartedAt || Date.now() : undefined;
					this.callParticipants.set(peerAddr, {
						peerAddr,
						shortAddr: short(peerAddr),
						isLocal: false,
						hasAudio: !!p?.audio,
						hasVideo: !!(p?.video || p?.screen),
						isSpeaking: existing?.isSpeaking ?? false,
						videoKind: p?.screen ? 'screen' : 'cam',
						audioStream: existing?.audioStream,
						videoStream: existing?.videoStream,
						screenStartedAt
					});
				}
			}

			this.callDurationSec = 0;
			if (this.callTimerInterval) clearInterval(this.callTimerInterval);
			this.callTimerInterval = setInterval(() => {
				this.callDurationSec++;
			}, 1000);
		} catch (err: unknown) {
			this.leaveCallUIOnly(client);
			notifications.notifyError(`Failed to join call: ${formatError(err)}`);
		}
	}

	leaveCall(client: any) {
		if (this.callScopeID && client) {
			try {
				client.leaveCall(this.callScopeID);
			} catch {}
		}
		this.leaveCallUIOnly(client);
	}

	leaveCallUIOnly(client?: any) {
		this.callJoined = false;
		this.callScopeID = null;
		this.callIsDM = false;
		this.callPeerAddr = null;
		this.callEpoch = null;
		this.micEnabled = false;
		this.camEnabled = false;
		this.screenSharing = false;
		this.localScreenStartedAt = 0;

		if (this.callTimerInterval) {
			clearInterval(this.callTimerInterval);
			this.callTimerInterval = null;
		}
		this.callDurationSec = 0;

		this.teardownLocalMicStream();

		this.clearTrackEndHandler(this.camStream);
		stopMediaStream(this.camStream);
		this.camStream = null;

		this.clearTrackEndHandler(this.screenStream);
		stopMediaStream(this.screenStream);
		this.screenStream = null;

		if (this.localAudioMixer) {
			this.localAudioMixer.destroy();
			this.localAudioMixer = null;
		}

		if (client) {
			try {
				client.setLocalMediaTracks({ audioTrack: null, videoTrack: null, videoKind: null });
			} catch {}
		}

		for (const meter of this.audioAnalysers.values()) {
			meter.stop();
		}
		this.audioAnalysers.clear();
		this.callParticipants.clear();
		this.remoteCallPresence.clear();
		this.activeSpeakerAddr = null;
	}

	private clearTrackEndHandler(stream: MediaStream | null) {
		if (!stream) return;
		try {
			for (const t of stream.getTracks()) {
				t.onended = null;
			}
		} catch {}
	}

	syncLocalCallParticipant(me: { address: string } | null) {
		if (!me) return;
		const existing = this.callParticipants.get(me.address);
		this.callParticipants.set(me.address, {
			peerAddr: me.address,
			shortAddr: 'You',
			isLocal: true,
			hasAudio: this.micEnabled,
			hasVideo: this.camEnabled || this.screenSharing,
			isSpeaking: this.micEnabled ? (existing?.isSpeaking ?? false) : false,
			videoKind: this.screenSharing ? 'screen' : 'cam',
			audioStream: this.localStream || undefined,
			videoStream: this.camStream || this.screenStream || undefined,
			screenStartedAt: this.screenSharing ? this.localScreenStartedAt : undefined
		});
	}

	private async syncAudioTrackToClient(client: any) {
		if (this.localAudioMixer) {
			this.localAudioMixer.destroy();
			this.localAudioMixer = null;
		}

		const micStream = this.micEnabled ? this.localStream : null;
		const combined = combineLocalAudioStreams(micStream, this.screenStream);
		this.localAudioMixer = combined;

		const audioTrack = combined?.track || null;
		if (client) {
			await client.setLocalMediaTracks({ audioTrack });
		}
		if (this.callScopeID && client) {
			await client.updateCallOptions(this.callScopeID, this.currentCallOptions());
		}
	}

	private async syncVideoTrackToClient(client: any) {
		if (!client) return;
		if (this.screenSharing && this.screenStream) {
			const scrTrack = this.screenStream.getVideoTracks()[0] || null;
			await client.setLocalMediaTracks({ videoTrack: scrTrack, videoKind: 'screen' });
		} else if (this.camEnabled && this.camStream) {
			const camTrack = this.camStream.getVideoTracks()[0] || null;
			await client.setLocalMediaTracks({ videoTrack: camTrack, videoKind: 'cam' });
		} else {
			await client.setLocalMediaTracks({ videoTrack: null, videoKind: null });
		}
		if (this.callScopeID) {
			await client.updateCallOptions(this.callScopeID, this.currentCallOptions());
		}
	}

	private teardownLocalMicStream() {
		this.audioPipelineEpoch++;
		this.rawAudioHardwareKey = null;
		if (this.audioPipeline) {
			this.audioPipeline.destroy();
			this.audioPipeline = null;
		}
		if (this.localStream && this.localStream !== this.rawLocalStream) {
			stopMediaStream(this.localStream);
		}
		this.clearTrackEndHandler(this.rawLocalStream);
		stopMediaStream(this.rawLocalStream);
		this.rawLocalStream = null;
		this.localStream = null;
		this.statusCallback?.({ state: 'idle' });
	}

	private setMicTracksEnabled(enabled: boolean) {
		try {
			this.rawLocalStream?.getAudioTracks().forEach((t) => (t.enabled = enabled));
		} catch {}
		if (this.localStream && this.localStream !== this.rawLocalStream) {
			try {
				this.localStream.getAudioTracks().forEach((t) => (t.enabled = enabled));
			} catch {}
		}
	}

	private async applyConstraintsToRawTrack(options: AudioConstraintsOptions) {
		const rawTrack = this.rawLocalStream?.getAudioTracks()[0];
		if (!rawTrack || typeof rawTrack.applyConstraints !== 'function') return;
		try {
			const constraints = buildAudioTrackConstraints(options);
			await rawTrack.applyConstraints(constraints);
		} catch (e) {
			console.warn('Failed to apply live audio processing constraints to track', e);
		}
	}

	private async activateAudioPipeline(
		client: any,
		me: { address: string } | null,
		options: AudioConstraintsOptions
	) {
		const epoch = ++this.audioPipelineEpoch;
		const raw = this.rawLocalStream;
		if (!raw) return;

		const nsMode = options.noiseSuppressionMode ?? 'builtin';
		const ecMode = options.echoCancellationMode ?? 'builtin';
		const needsNeural = requiresNeuralAudioPipeline(nsMode, ecMode);

		if (!needsNeural) {
			if (this.audioPipeline) {
				this.audioPipeline.destroy();
				this.audioPipeline = null;
			}
			if (this.localStream && this.localStream !== raw) {
				stopMediaStream(this.localStream);
			}
			this.localStream = raw;
			this.setMicTracksEnabled(this.micEnabled);
			await this.syncAudioTrackToClient(client);
			if (me?.address && this.micEnabled) {
				this.setupSpeakingMeter(me.address, raw);
			}
			this.syncLocalCallParticipant(me);

			await createAudioProcessingPipeline(raw, {
				noiseSuppressionMode: nsMode,
				echoCancellationMode: ecMode,
				onStatusChange: (s) => this.statusCallback?.(s)
			});
			return;
		}

		// Neural pipeline requested: compile/load without premature track swap to avoid audio dropouts
		const pipeline = await createAudioProcessingPipeline(raw, {
			noiseSuppressionMode: nsMode,
			echoCancellationMode: ecMode,
			getLoopbackStream: () => this.remoteLoopbackStream,
			onStatusChange: (s) => {
				if (epoch === this.audioPipelineEpoch) {
					this.statusCallback?.(s);
				}
			},
			onOverload: () => {
				notifications.notifyInfo(
					'DeepFilterNet3 is using high CPU. Switch to DTLN in Audio Settings for lower CPU load.',
					'High Audio CPU Load'
				);
			}
		});

		if (epoch !== this.audioPipelineEpoch || this.rawLocalStream !== raw || !this.callJoined) {
			pipeline.destroy();
			return;
		}

		if (this.audioPipeline) {
			this.audioPipeline.destroy();
		}
		this.audioPipeline = pipeline;

		const oldLocal = this.localStream;
		this.localStream = pipeline.stream;
		if (oldLocal && oldLocal !== raw && oldLocal !== pipeline.stream) {
			stopMediaStream(oldLocal);
		}
		this.setMicTracksEnabled(this.micEnabled);
		await this.syncAudioTrackToClient(client);
		if (me?.address) {
			if (this.micEnabled) {
				this.setupSpeakingMeter(me.address, this.localStream);
			} else {
				this.stopSpeakingMeter(me.address);
			}
		}
		this.syncLocalCallParticipant(me);
	}

	async applyAudioProcessing(
		client: any,
		me: { address: string } | null,
		options: AudioConstraintsOptions
	) {
		if (!this.rawLocalStream) {
			this.statusCallback?.({ state: 'idle' });
			return;
		}

		const nextKey = audioHardwareConstraintKey(options);
		const hardwareChanged = this.rawAudioHardwareKey !== nextKey;

		if (hardwareChanged) {
			try {
				const newRawStream = await acquireAudioStream(options);
				const oldRawStream = this.rawLocalStream;
				const oldLocalStream = this.localStream;
				this.rawLocalStream = newRawStream;
				this.rawAudioHardwareKey = nextKey;
				const newTrack = newRawStream.getAudioTracks()[0] || null;
				if (newTrack) {
					newTrack.onended = () => {
						void this.handleLocalAudioEnded(client, me);
					};
				}
				this.clearTrackEndHandler(oldRawStream);
				await this.activateAudioPipeline(client, me, options);
				if (oldLocalStream && oldLocalStream !== oldRawStream && oldLocalStream !== this.localStream) {
					stopMediaStream(oldLocalStream);
				}
				stopMediaStream(oldRawStream);
			} catch (err: unknown) {
				console.warn('Failed to re-acquire microphone for updated audio constraints', err);
				await this.applyConstraintsToRawTrack(options);
				await this.activateAudioPipeline(client, me, options);
			}
		} else {
			await this.applyConstraintsToRawTrack(options);
			await this.activateAudioPipeline(client, me, options);
		}
	}

	async toggleMic(
		client: any,
		me: { address: string } | null,
		target: CallTarget,
		audioOpts?: string | AudioConstraintsOptions
	) {
		if (!this.callJoined) {
			await this.joinCall(client, me, target);
			if (!this.callJoined) return;
		}

		if (!this.rawLocalStream) {
			try {
				const resolvedOpts: AudioConstraintsOptions =
					typeof audioOpts === 'string' ? { deviceId: audioOpts } : audioOpts || {};
				const stream = await acquireAudioStream(resolvedOpts);
				this.rawLocalStream = stream;
				this.rawAudioHardwareKey = audioHardwareConstraintKey(resolvedOpts);
				this.micEnabled = true;
				const audioTrack = stream.getAudioTracks()[0] || null;
				if (audioTrack) {
					audioTrack.onended = () => {
						void this.handleLocalAudioEnded(client, me);
					};
				}
				await this.activateAudioPipeline(client, me, resolvedOpts);
			} catch (err: unknown) {
				this.micEnabled = false;
				this.teardownLocalMicStream();
				notifications.notifyError(`Microphone access error: ${formatError(err)}`);
			}
		} else {
			this.micEnabled = !this.micEnabled;
			this.setMicTracksEnabled(this.micEnabled);
			await this.syncAudioTrackToClient(client);
			if (me?.address) {
				if (this.micEnabled && this.localStream) {
					this.setupSpeakingMeter(me.address, this.localStream);
				} else {
					this.stopSpeakingMeter(me.address);
				}
			}
			this.syncLocalCallParticipant(me);
		}
	}

	private async handleLocalAudioEnded(client: any, me: { address: string } | null) {
		this.teardownLocalMicStream();
		this.micEnabled = false;
		if (me?.address) this.stopSpeakingMeter(me.address);
		await this.syncAudioTrackToClient(client);
		this.syncLocalCallParticipant(me);
	}

	async switchAudioInput(
		client: any,
		me: { address: string } | null,
		audioOpts: string | AudioConstraintsOptions
	) {
		if (!this.callJoined || !this.rawLocalStream) return;
		const wasEnabled = this.micEnabled;
		this.teardownLocalMicStream();
		if (me?.address) this.stopSpeakingMeter(me.address);
		if (!wasEnabled) {
			this.micEnabled = false;
			await this.syncAudioTrackToClient(client);
			this.syncLocalCallParticipant(me);
			return;
		}
		this.micEnabled = false;
		await this.toggleMic(
			client,
			me,
			{ scopeID: this.callScopeID || '', isDM: this.callIsDM },
			audioOpts
		);
	}

	async toggleCam(client: any, me: { address: string } | null, target: CallTarget, deviceId?: string) {
		if (!this.callJoined) {
			await this.joinCall(client, me, target);
			if (!this.callJoined) return;
		}

		if (!this.camEnabled) {
			try {
				const stream = await acquireVideoStream(deviceId || undefined);
				this.camStream = stream;
				this.camEnabled = true;
				const videoTrack = stream.getVideoTracks()[0] || null;
				if (videoTrack) {
					videoTrack.onended = () => {
						void this.disableCam(client, me);
					};
				}
				await this.syncVideoTrackToClient(client);
				this.syncLocalCallParticipant(me);
			} catch (err: unknown) {
				this.camEnabled = false;
				notifications.notifyError(`Camera access error: ${formatError(err)}`);
			}
		} else {
			await this.disableCam(client, me);
		}
	}

	private async disableCam(client: any, me: { address: string } | null) {
		this.clearTrackEndHandler(this.camStream);
		stopMediaStream(this.camStream);
		this.camStream = null;
		this.camEnabled = false;
		await this.syncVideoTrackToClient(client);
		this.syncLocalCallParticipant(me);
	}

	async switchVideoInput(client: any, me: { address: string } | null, deviceId: string) {
		if (!this.callJoined || !this.camEnabled) return;
		await this.disableCam(client, me);
		await this.toggleCam(client, me, { scopeID: this.callScopeID || '', isDM: this.callIsDM }, deviceId);
	}

	async toggleScreenShare(client: any, me: { address: string } | null, target: CallTarget) {
		if (!this.callJoined) {
			await this.joinCall(client, me, target);
			if (!this.callJoined) return;
		}

		if (!this.screenSharing) {
			try {
				const stream = await acquireScreenStream();
				this.screenStream = stream;
				this.screenSharing = true;
				this.localScreenStartedAt = Date.now();
				const videoTrack = stream.getVideoTracks()[0] || null;
				if (videoTrack) {
					videoTrack.onended = () => {
						void this.stopScreenShare(client, me);
					};
				}
				await this.syncAudioTrackToClient(client);
				await this.syncVideoTrackToClient(client);
				this.syncLocalCallParticipant(me);
			} catch (err: unknown) {
				console.warn('screenshare error', err);
			}
		} else {
			await this.stopScreenShare(client, me);
		}
	}

	async stopScreenShare(client: any, me: { address: string } | null) {
		this.clearTrackEndHandler(this.screenStream);
		stopMediaStream(this.screenStream);
		this.screenStream = null;
		this.screenSharing = false;
		this.localScreenStartedAt = 0;
		await this.syncAudioTrackToClient(client);
		await this.syncVideoTrackToClient(client);
		this.syncLocalCallParticipant(me);
	}

	handleRemotePresence(meAddr: string | undefined, scopeID: string, peerAddr: string, payload: any) {
		if (!scopeID || !peerAddr || !payload || (meAddr && peerAddr === meAddr)) return;
		const key = `${scopeID}::${peerAddr}`;
		if (payload.action === 'leave') {
			this.remoteCallPresence.delete(key);
			if (this.callScopeID === scopeID) {
				this.removePeerMedia(peerAddr);
			}
			return;
		}

		const prev = this.remoteCallPresence.get(key);
		this.remoteCallPresence.set(key, payload);
		if (!this.callJoined || this.callScopeID !== scopeID) return;

		const existing = this.callParticipants.get(peerAddr);
		let screenStartedAt = existing?.screenStartedAt;
		if (payload.screen && (!prev?.screen || !screenStartedAt)) {
			screenStartedAt = Date.now();
		} else if (!payload.screen) {
			screenStartedAt = undefined;
		}

		this.callParticipants.set(peerAddr, {
			peerAddr,
			shortAddr: existing?.shortAddr || short(peerAddr),
			isLocal: false,
			hasAudio: !!payload.audio,
			hasVideo: !!(payload.video || payload.screen),
			isSpeaking: payload.audio ? (existing?.isSpeaking ?? false) : false,
			videoKind: payload.screen ? 'screen' : 'cam',
			audioStream: existing?.audioStream,
			videoStream: existing?.videoStream,
			screenStartedAt
		});
	}

	handleRemoteTrack(
		client: any,
		scopeID: string,
		peerAddr: string,
		kind: string,
		track: MediaStreamTrack,
		stream?: MediaStream
	) {
		if (!this.callJoined || !this.callScopeID || this.callScopeID !== scopeID) return;
		if (!peerAddr || !track) return;

		const presence = this.peerPresence(client, scopeID, peerAddr);
		const existing = this.callParticipants.get(peerAddr);

		const trackMediaStream =
			typeof window !== 'undefined' && typeof window.MediaStream === 'function'
				? new window.MediaStream([track])
				: stream;

		const isVideoTrack = kind === 'video';
		const audioStream = !isVideoTrack ? trackMediaStream || existing?.audioStream : existing?.audioStream;
		const videoStream = isVideoTrack ? trackMediaStream || existing?.videoStream : existing?.videoStream;

		const hasAudio = presence ? !!presence.audio : (!isVideoTrack ? !track.muted : existing?.hasAudio ?? false);
		const hasVideo = presence
			? !!(presence.video || presence.screen)
			: (isVideoTrack ? !track.muted : existing?.hasVideo ?? false);

		const videoKind: 'cam' | 'screen' = presence?.screen
			? 'screen'
			: (existing?.videoKind || 'cam');
		const screenStartedAt =
			videoKind === 'screen' ? (existing?.screenStartedAt || Date.now()) : undefined;

		this.callParticipants.set(peerAddr, {
			peerAddr,
			shortAddr: existing?.shortAddr || short(peerAddr),
			isLocal: false,
			hasAudio,
			hasVideo,
			isSpeaking: existing?.isSpeaking ?? false,
			videoKind,
			audioStream,
			videoStream,
			screenStartedAt
		});

		if (!isVideoTrack && audioStream) {
			this.setupSpeakingMeter(peerAddr, audioStream);
		}
	}

	handlePeerLeft(scopeID: string | undefined, peerAddr: string | undefined) {
		if (!peerAddr) return;
		if (scopeID) {
			this.remoteCallPresence.delete(`${scopeID}::${peerAddr}`);
		}
		if (!scopeID || scopeID === this.callScopeID) {
			this.removePeerMedia(peerAddr);
		}
	}

	handlePeerClosed(client: any, scopeID: string | undefined, peerAddr: string | undefined) {
		if (!scopeID) return;
		if (!peerAddr) {
			if (this.callJoined && this.callScopeID === scopeID) {
				this.leaveCallUIOnly(client);
			}
			return;
		}
		this.handlePeerLeft(scopeID, peerAddr);
	}

	setSFrameEpoch(scopeID: string | undefined, epoch: number | undefined) {
		if (typeof epoch !== 'number') return;
		if (!scopeID || scopeID === this.callScopeID) {
			this.callEpoch = epoch;
		}
	}

	private stopSpeakingMeter(peerAddr: string) {
		const meter = this.audioAnalysers.get(peerAddr);
		if (meter) {
			meter.stop();
			this.audioAnalysers.delete(peerAddr);
		}
		const p = this.callParticipants.get(peerAddr);
		if (p?.isSpeaking) {
			this.callParticipants.set(peerAddr, { ...p, isSpeaking: false });
		}
		if (this.activeSpeakerAddr === peerAddr) {
			this.activeSpeakerAddr = null;
		}
	}

	private setupSpeakingMeter(peerAddr: string, stream: MediaStream) {
		this.stopSpeakingMeter(peerAddr);

		const meter = createRmsAudioMeter(stream, (level) => {
			if (!this.callJoined || !this.callParticipants.has(peerAddr)) {
				meter.stop();
				this.audioAnalysers.delete(peerAddr);
				return;
			}
			const isSpeaking = level > 5;
			const p = this.callParticipants.get(peerAddr);
			if (p && p.isSpeaking !== isSpeaking) {
				this.callParticipants.set(peerAddr, { ...p, isSpeaking });
				if (isSpeaking) {
					this.activeSpeakerAddr = peerAddr;
				} else if (this.activeSpeakerAddr === peerAddr) {
					this.activeSpeakerAddr = null;
				}
			}
		});

		this.audioAnalysers.set(peerAddr, meter);
	}

	removePeerMedia(peerAddr: string) {
		if (!peerAddr) return;
		this.stopSpeakingMeter(peerAddr);
		this.callParticipants.delete(peerAddr);
	}
}
