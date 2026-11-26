<script lang="ts">
	interface Props {
		latencyMs?: number;
		showText?: boolean;
		size?: 'sm' | 'md';
	}

	let { latencyMs = 18, showText = true }: Props = $props();

	let quality = $derived.by(() => {
		if (latencyMs < 60) return 3;
		if (latencyMs < 150) return 2;
		return 1;
	});
</script>

<div
	class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container-high/60 border border-white/5 select-none"
	title={`WebRTC Mesh Latency: ~${latencyMs}ms`}
>
	<div class="flex items-end gap-0.5 h-3">
		<span class="w-1 rounded-full {quality >= 1 ? 'bg-primary h-1.5' : 'bg-outline/30 h-1.5'}"></span>
		<span class="w-1 rounded-full {quality >= 2 ? 'bg-primary h-2.5' : 'bg-outline/30 h-2.5'}"></span>
		<span class="w-1 rounded-full {quality >= 3 ? 'bg-primary h-3.5' : 'bg-outline/30 h-3.5'}"></span>
	</div>

	{#if showText}
		<span class="font-code text-[11px] text-on-surface-variant font-medium">
			{latencyMs}ms
		</span>
	{/if}
</div>
