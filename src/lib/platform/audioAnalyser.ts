export interface RmsMeterHandle {
	stop: () => void;
}

export function createRmsAudioMeter(
	stream: MediaStream,
	onSample: (level: number) => void,
	intervalMs = 120
): RmsMeterHandle {
	if (typeof window === 'undefined') {
		return { stop: () => {} };
	}

	const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
	if (!AudioContextClass) {
		return { stop: () => {} };
	}

	let audioCtx: AudioContext | null = null;
	let source: MediaStreamAudioSourceNode | null = null;
	let analyser: AnalyserNode | null = null;
	let timer: ReturnType<typeof setInterval> | null = null;
	let stopped = false;

	try {
		audioCtx = new AudioContextClass();
		analyser = audioCtx.createAnalyser();
		analyser.fftSize = 256;
		source = audioCtx.createMediaStreamSource(stream);
		source.connect(analyser);

		const bufferLength = analyser.frequencyBinCount;
		const data = new Uint8Array(bufferLength);

		timer = setInterval(() => {
			if (stopped || !analyser) return;
			try {
				analyser.getByteTimeDomainData(data);
				let sum = 0;
				for (let i = 0; i < bufferLength; i++) {
					const norm = (data[i] - 128) / 128;
					sum += norm * norm;
				}
				const rms = Math.sqrt(sum / bufferLength);
				const level = Math.min(100, Math.round(rms * 350));
				onSample(level);
			} catch (err) {
				console.warn('RMS metering sampling error', err);
			}
		}, intervalMs);
	} catch (e) {
		console.warn('Failed to initialize AudioContext analyser', e);
	}

	return {
		stop: () => {
			if (stopped) return;
			stopped = true;
			if (timer !== null) {
				clearInterval(timer);
				timer = null;
			}
			if (source) {
				try {
					source.disconnect();
				} catch {}
				source = null;
			}
			if (analyser) {
				try {
					analyser.disconnect();
				} catch {}
				analyser = null;
			}
			if (audioCtx && audioCtx.state !== 'closed') {
				audioCtx.close().catch(() => {});
				audioCtx = null;
			}
		}
	};
}
