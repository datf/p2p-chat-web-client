export interface MediaStreamActionOptions {
	stream?: MediaStream | null;
	sinkId?: string | null;
	volume?: number;
}

export function mediaStream(
	node: HTMLMediaElement,
	options: MediaStreamActionOptions = {}
) {
	function apply(opts: MediaStreamActionOptions) {
		const targetStream = opts.stream || null;
		if (node.srcObject !== targetStream) {
			node.srcObject = targetStream;
			if (targetStream) {
				node.play().catch(() => {});
			}
		}

		if (typeof opts.volume === 'number' && !Number.isNaN(opts.volume)) {
			try {
				node.volume = Math.max(0, Math.min(1, opts.volume));
			} catch {}
		}

		if (opts.sinkId && typeof (node as any).setSinkId === 'function') {
			(node as any).setSinkId(opts.sinkId).catch((err: unknown) => {
				console.warn('Failed to set sinkId on media element', err);
			});
		}
	}

	apply(options);

	return {
		update(nextOpts: MediaStreamActionOptions) {
			apply(nextOpts);
		},
		destroy() {
			try {
				node.pause();
				node.srcObject = null;
			} catch {}
		}
	};
}
