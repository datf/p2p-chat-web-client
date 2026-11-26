// Web Audio API gain mixer and local audio track combiner for Cotilla calls.

export interface CallGainMixer {
	attachStream: (peerAddr: string, rawStream: MediaStream, initialGain: number) => MediaStream;
	setGain: (peerAddr: string, gain: number) => void;
	detachStream: (peerAddr: string) => void;
	getLoopbackStream: () => MediaStream | null;
	destroy: () => void;
}

interface PeerAudioPipeline {
	source: MediaStreamAudioSourceNode;
	gainNode: GainNode;
	compressor: DynamicsCompressorNode;
	destination: MediaStreamAudioDestinationNode;
	pullAudio: HTMLAudioElement | null;
	currentGain: number;
}

/**
 * Creates a centralized Web Audio mixer for remote call participants.
 * Amplifies (up to 200%) or attenuates (down to 0% / mute) incoming WebRTC audio streams,
 * passing through a soft-knee compressor to avoid harsh clipping at high gain.
 */
export function createCallGainMixer(): CallGainMixer {
	if (typeof window === 'undefined') {
		return {
			attachStream: (_addr, raw) => raw,
			setGain: () => {},
			detachStream: () => {},
			getLoopbackStream: () => null,
			destroy: () => {}
		};
	}

	const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
	if (!AudioContextClass) {
		return {
			attachStream: (_addr, raw) => raw,
			setGain: () => {},
			detachStream: () => {},
			getLoopbackStream: () => null,
			destroy: () => {}
		};
	}

	let audioCtx: AudioContext | null = null;
	const pipelines = new Map<string, PeerAudioPipeline>();
	let loopbackBus: {
		gain: GainNode;
		destination: MediaStreamAudioDestinationNode;
		keepAlive: ConstantSourceNode | null;
	} | null = null;

	function getOrCreateContext(): AudioContext {
		if (!audioCtx || audioCtx.state === 'closed') {
			audioCtx = new AudioContextClass();
		}
		if (audioCtx.state === 'suspended') {
			audioCtx.resume().catch(() => {});
		}
		return audioCtx;
	}

	function getOrCreateLoopbackBus(ctx: AudioContext) {
		if (loopbackBus) return loopbackBus;
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(1, ctx.currentTime);
		const destination = ctx.createMediaStreamDestination();
		gain.connect(destination);

		// Keep the reference track actively clocking zeros even when no remote peer is speaking
		let keepAlive: ConstantSourceNode | null = null;
		try {
			if (typeof ctx.createConstantSource === 'function') {
				keepAlive = ctx.createConstantSource();
				keepAlive.offset.setValueAtTime(0, ctx.currentTime);
				keepAlive.connect(gain);
				keepAlive.start();
			}
		} catch {}

		// Attach any already-active peer compressors
		for (const p of pipelines.values()) {
			try {
				p.compressor.connect(gain);
			} catch {}
		}

		loopbackBus = { gain, destination, keepAlive };
		return loopbackBus;
	}

	function detachPeerPipeline(pipeline: PeerAudioPipeline) {
		if (pipeline.pullAudio) {
			try {
				pipeline.pullAudio.pause();
				pipeline.pullAudio.srcObject = null;
				pipeline.pullAudio.remove();
			} catch {}
			pipeline.pullAudio = null;
		}
		try {
			pipeline.source.disconnect();
			pipeline.gainNode.disconnect();
			pipeline.compressor.disconnect();
		} catch {}
	}

	return {
		attachStream(peerAddr: string, rawStream: MediaStream, initialGain: number): MediaStream {
			if (!rawStream || rawStream.getAudioTracks().length === 0) {
				return rawStream;
			}

			// Clean up any existing pipeline for this peer
			const existing = pipelines.get(peerAddr);
			if (existing) {
				detachPeerPipeline(existing);
				pipelines.delete(peerAddr);
			}

			try {
				const ctx = getOrCreateContext();

				// Hidden muted <audio> element to satisfy Chromium's NetEq jitter buffer
				let pullAudio: HTMLAudioElement | null = null;
				if (typeof document !== 'undefined') {
					try {
						pullAudio = document.createElement('audio');
						pullAudio.srcObject = rawStream;
						pullAudio.muted = true;
						pullAudio.setAttribute('playsinline', 'true');
						pullAudio.style.display = 'none';
						document.body.appendChild(pullAudio);
						pullAudio.play().catch(() => {});
					} catch {}
				}

				const source = ctx.createMediaStreamSource(rawStream);
				const gainNode = ctx.createGain();
				const clampedGain = Math.max(0, Math.min(2, initialGain));
				gainNode.gain.setValueAtTime(clampedGain, ctx.currentTime);

				// Transparent brickwall peak limiter to prevent digital clipping when boosted >100%
				const compressor = ctx.createDynamicsCompressor();
				compressor.threshold.setValueAtTime(-0.5, ctx.currentTime);
				compressor.knee.setValueAtTime(0, ctx.currentTime);
				compressor.ratio.setValueAtTime(20, ctx.currentTime);
				compressor.attack.setValueAtTime(0.001, ctx.currentTime);
				compressor.release.setValueAtTime(0.05, ctx.currentTime);

				const destination = ctx.createMediaStreamDestination();

				source.connect(gainNode);
				gainNode.connect(compressor);
				compressor.connect(destination);
				if (loopbackBus) {
					compressor.connect(loopbackBus.gain);
				}

				pipelines.set(peerAddr, {
					source,
					gainNode,
					compressor,
					destination,
					pullAudio,
					currentGain: clampedGain
				});

				return destination.stream;
			} catch (err) {
				console.warn('Failed to build Web Audio gain pipeline for peer', peerAddr, err);
				return rawStream;
			}
		},

		setGain(peerAddr: string, gain: number) {
			const pipeline = pipelines.get(peerAddr);
			if (!pipeline) return;

			const clamped = Math.max(0, Math.min(2, gain));
			pipeline.currentGain = clamped;

			try {
				if (audioCtx && audioCtx.state !== 'closed') {
					if (audioCtx.state === 'suspended') {
						audioCtx.resume().catch(() => {});
					}
					// Smooth gain transition over 15ms to prevent audio pops/clicks
					pipeline.gainNode.gain.setTargetAtTime(clamped, audioCtx.currentTime, 0.015);
				} else {
					pipeline.gainNode.gain.value = clamped;
				}
			} catch (e) {
				console.warn('Error setting gain on node', e);
			}
		},

		detachStream(peerAddr: string) {
			const pipeline = pipelines.get(peerAddr);
			if (pipeline) {
				detachPeerPipeline(pipeline);
				pipelines.delete(peerAddr);
			}
		},

		getLoopbackStream(): MediaStream | null {
			try {
				const ctx = getOrCreateContext();
				return getOrCreateLoopbackBus(ctx).destination.stream;
			} catch (err) {
				console.warn('Failed to create call loopback stream', err);
				return null;
			}
		},

		destroy() {
			for (const pipeline of pipelines.values()) {
				detachPeerPipeline(pipeline);
			}
			pipelines.clear();

			if (loopbackBus) {
				try {
					loopbackBus.keepAlive?.stop();
					loopbackBus.keepAlive?.disconnect();
					loopbackBus.gain.disconnect();
				} catch {}
				loopbackBus = null;
			}

			if (audioCtx && audioCtx.state !== 'closed') {
				audioCtx.close().catch(() => {});
				audioCtx = null;
			}
		}
	};
}

export interface LocalAudioMixerHandle {
	track: MediaStreamTrack;
	destroy: () => void;
}

/**
 * Mixes microphone audio with shared screen/tab audio (if present) into a single outgoing MediaStreamTrack.
 */
export function combineLocalAudioStreams(
	micStream?: MediaStream | null,
	screenStream?: MediaStream | null
): LocalAudioMixerHandle | null {
	const micTrack = micStream?.getAudioTracks()[0] || null;
	const screenTrack = screenStream?.getAudioTracks()[0] || null;

	if (!micTrack && !screenTrack) {
		return null;
	}
	if (micTrack && !screenTrack) {
		return { track: micTrack, destroy: () => {} };
	}
	if (!micTrack && screenTrack) {
		return { track: screenTrack, destroy: () => {} };
	}

	// Both mic and screen audio are present: mix them via Web Audio API
	if (typeof window === 'undefined') {
		return { track: micTrack!, destroy: () => {} };
	}

	const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
	if (!AudioContextClass) {
		return { track: micTrack!, destroy: () => {} };
	}

	try {
		const ctx = new AudioContextClass();
		if (ctx.state === 'suspended') {
			ctx.resume().catch(() => {});
		}

		const micSource = ctx.createMediaStreamSource(new MediaStream([micTrack!]));
		const screenSource = ctx.createMediaStreamSource(new MediaStream([screenTrack!]));

		const destination = ctx.createMediaStreamDestination();

		micSource.connect(destination);
		screenSource.connect(destination);

		const combinedTrack = destination.stream.getAudioTracks()[0];

		return {
			track: combinedTrack,
			destroy: () => {
				try {
					micSource.disconnect();
					screenSource.disconnect();
				} catch {}
				if (ctx.state !== 'closed') {
					ctx.close().catch(() => {});
				}
			}
		};
	} catch (e) {
		console.warn('Failed to mix local mic + screen audio', e);
		return { track: micTrack!, destroy: () => {} };
	}
}
