import type {
	AudioProcessorStatus,
	EchoCancellationMode,
	NoiseSuppressionMode
} from '../types';

export interface AudioProcessingPipelineOptions {
	noiseSuppressionMode: NoiseSuppressionMode;
	echoCancellationMode: EchoCancellationMode;
	getLoopbackStream?: () => MediaStream | null;
	onStatusChange?: (status: AudioProcessorStatus) => void;
	onOverload?: (load: number) => void;
}

export interface AudioProcessingPipeline {
	stream: MediaStream;
	isNeural: boolean;
	updateLoopbackStream: (stream: MediaStream | null) => void;
	destroy: () => void;
}

export function requiresNeuralAudioPipeline(
	nsMode: NoiseSuppressionMode,
	ecMode: EchoCancellationMode
): boolean {
	return false;
}

export function describeActiveAudioModes(
	nsMode: NoiseSuppressionMode,
	ecMode: EchoCancellationMode
): string {
	const nsLabel: Record<NoiseSuppressionMode, string> = {
		off: 'NS Off',
		builtin: 'Built-in NS'
	};
	const ecLabel: Record<EchoCancellationMode, string> = {
		off: 'AEC Off',
		builtin: 'Built-in AEC'
	};
	return `${nsLabel[nsMode] || 'Built-in NS'} · ${ecLabel[ecMode] || 'Built-in AEC'}`;
}

export async function createAudioProcessingPipeline(
	rawStream: MediaStream,
	options: AudioProcessingPipelineOptions
): Promise<AudioProcessingPipeline> {
	options.onStatusChange?.({
		state: 'active',
		message: describeActiveAudioModes(options.noiseSuppressionMode, options.echoCancellationMode)
	});
	return {
		stream: rawStream,
		isNeural: false,
		updateLoopbackStream: () => {},
		destroy: () => {}
	};
}
