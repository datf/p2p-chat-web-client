<script lang="ts">
	import { onDestroy } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { cotilla, mediaStream } from '#lib';
	import { createCallGainMixer } from '../platform/audioGain';

	const mixer = createCallGainMixer();
	const processedStreams = new SvelteMap<string, MediaStream>();
	const rawStreams = new Map<string, MediaStream>();

	let remoteAudioParticipants = $derived(
		Array.from(cotilla.callParticipants.values()).filter((p) => !p.isLocal && p.audioStream)
	);

	// Synchronize incoming streams through Web Audio Gain pipeline
	$effect(() => {
		const currentPeers = new Set<string>();

		if (cotilla.callJoined) {
			for (const p of remoteAudioParticipants) {
				currentPeers.add(p.peerAddr);
				if (p.audioStream) {
					const existing = processedStreams.get(p.peerAddr);
					const prevRaw = rawStreams.get(p.peerAddr);
					if (!existing || prevRaw !== p.audioStream) {
						rawStreams.set(p.peerAddr, p.audioStream);
						const processed = mixer.attachStream(
							p.peerAddr,
							p.audioStream,
							cotilla.getPeerGain(p.peerAddr)
						);
						processedStreams.set(p.peerAddr, processed);
					}
				}
			}
		}

		// Detach participants who left or no longer have audio
		for (const [peerAddr] of processedStreams.entries()) {
			if (!currentPeers.has(peerAddr) || !cotilla.callJoined) {
				mixer.detachStream(peerAddr);
				processedStreams.delete(peerAddr);
				rawStreams.delete(peerAddr);
			}
		}
	});

	// Reactively apply gain adjustments from slider to the Web Audio node
	$effect(() => {
		if (!cotilla.callJoined) return;
		for (const p of remoteAudioParticipants) {
			const gain = cotilla.getPeerGain(p.peerAddr);
			mixer.setGain(p.peerAddr, gain);
		}
	});

	onDestroy(() => {
		mixer.destroy();
		processedStreams.clear();
		rawStreams.clear();
	});
</script>

<!-- Headless persistent remote audio sink with per-peer gain amplification & attenuation -->
{#if cotilla.callJoined}
	<div class="hidden" aria-hidden="true">
		{#each remoteAudioParticipants as p (p.peerAddr)}
			{@const hasProcessed = processedStreams.has(p.peerAddr)}
			{@const outStream = processedStreams.get(p.peerAddr) || p.audioStream || null}
			{@const currentGain = cotilla.getPeerGain(p.peerAddr)}
			<audio
				use:mediaStream={{
					stream: outStream,
					sinkId: cotilla.selectedAudioOutputId,
					volume: hasProcessed ? 1.0 : Math.min(1.0, currentGain)
				}}
				autoplay
				playsinline
			></audio>
		{/each}
	</div>
{/if}
