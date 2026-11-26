<script lang="ts">
	import type { CallView } from '#lib';
	import { mediaStream } from '#lib';
	import Icon from './ui/Icon.svelte';

	interface Props {
		view: CallView;
		pinned?: boolean;
		compact?: boolean;
		gain?: number;
		onclick?: () => void;
		onopenmenu?: (coords: { x: number; y: number }) => void;
	}

	let {
		view,
		pinned = false,
		compact = false,
		gain = 1,
		onclick,
		onopenmenu
	}: Props = $props();

	let longPressTimer: ReturnType<typeof setTimeout> | null = null;

	function handleContextMenu(e: MouseEvent) {
		if (onopenmenu) {
			e.preventDefault();
			e.stopPropagation();
			onopenmenu({ x: e.clientX, y: e.clientY });
		}
	}

	function handlePointerDown(e: PointerEvent) {
		if (e.pointerType === 'touch' && onopenmenu) {
			const x = e.clientX;
			const y = e.clientY;
			longPressTimer = setTimeout(() => {
				onopenmenu({ x, y });
			}, 450);
		}
	}

	function handlePointerUpOrLeave() {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
	}

	function handleMenuButtonClick(e: MouseEvent) {
		e.stopPropagation();
		e.preventDefault();
		if (onopenmenu) {
			const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
			onopenmenu({ x: rect.right, y: rect.bottom + 4 });
		}
	}

	let containerClasses = $derived.by(() => {
		const base =
			'relative rounded-2xl overflow-hidden bg-surface-container-low flex items-center justify-center group shadow-md transition-all duration-300 w-full h-full select-none';
		if (pinned) {
			return `${base} glow-pinned ring-2 ring-pinned`;
		}
		if (view.isSpeaking) {
			return `${base} glow-speaking ring-2 ring-primary`;
		}
		return `${base} border border-white/5`;
	});
</script>

{#snippet tileContent()}
	<!-- Video Stream when active (audio rendered persistently in CallAudioSink) -->
	{#if view.hasVideo && view.stream}
		<video
			use:mediaStream={{ stream: view.stream }}
			autoplay
			playsinline
			muted={true}
			class="absolute inset-0 w-full h-full {view.kind === 'screen' ? 'object-contain bg-scrim' : 'object-cover'} {view.isLocal && view.kind !== 'screen' ? 'scale-x-[-1]' : ''}"
		></video>
		<div class="absolute inset-0 bg-gradient-to-t from-surface-container-lowest/80 via-transparent to-transparent pointer-events-none"></div>
	{:else}
		<!-- Acoustic Avatar when Camera is off -->
		<div class="flex flex-col items-center justify-center gap-2 p-2 select-none w-full">
			<div
				class="relative {compact ? 'w-10 h-10' : 'w-16 h-16'} rounded-full flex items-center justify-center bg-surface-container-high transition-transform duration-300 {view.isSpeaking
					? 'scale-105 glow-speaking ring-2 ring-primary'
					: 'border border-white/10'}"
			>
				<Icon
					name={view.isLocal ? 'person' : 'graphic_eq'}
					class="{compact ? 'text-xl' : 'text-3xl'} text-primary font-bold"
				/>
				{#if view.isSpeaking}
					<span class="absolute -top-1 -right-1 flex h-3.5 w-3.5">
						<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
						<span class="relative inline-flex rounded-full h-3.5 w-3.5 bg-primary"></span>
					</span>
				{/if}
			</div>
			<span class="font-headline {compact ? 'text-[11px]' : 'text-xs'} font-semibold text-on-surface tracking-wide truncate max-w-[120px]">
				{view.title}
			</span>
		</div>
	{/if}

	<!-- Pinned Badge Indicator -->
	{#if pinned}
		<div class="absolute top-2 left-2 z-10 flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-highest/90 border border-pinned/40 text-pinned text-[10px] font-headline font-semibold shadow-md backdrop-blur-md">
			<Icon name="push_pin" class="text-[13px]" />
			<span>PINNED</span>
		</div>
	{/if}

	<!-- Custom Gain / Muted Indicator Badge (when gain is not 100%) -->
	{#if !view.isLocal && gain !== 1}
		<button
			type="button"
			class="absolute top-2 {pinned ? 'left-20' : 'left-2'} z-10 flex items-center gap-1 px-2 py-0.5 rounded-full {gain === 0
				? 'bg-error-container/80 text-error border-error/30'
				: 'bg-surface-container-highest/90 text-primary border-primary/30'} border text-[10px] font-code font-semibold shadow-md backdrop-blur-md pointer-events-auto cursor-pointer"
			onclick={handleMenuButtonClick}
			title="Volume: {Math.round(gain * 100)}%"
		>
			<Icon name={gain === 0 ? 'volume_off' : gain > 1 ? 'volume_up' : 'volume_down'} class="text-[12px]" />
			<span>{gain === 0 ? 'MUTED' : `${Math.round(gain * 100)}%`}</span>
		</button>
	{/if}

	<!-- Visible Options Context Button (⋮) over picture for mobile and quick desktop access -->
	{#if onopenmenu}
		<button
			type="button"
			class="absolute top-2 right-2 z-20 w-7 h-7 rounded-full flex items-center justify-center bg-surface-container-lowest/80 backdrop-blur-md text-on-surface hover:text-primary hover:bg-surface-container-high transition-all shadow-sm border border-white/10 opacity-70 group-hover:opacity-100 cursor-pointer pointer-events-auto"
			onclick={handleMenuButtonClick}
			title="Participant options & volume"
			aria-label="Participant options & volume"
		>
			<Icon name="more_vert" class="text-[17px]" />
		</button>
	{/if}

	<!-- Top-Right Audio Waveform when Speaking -->
	{#if view.isSpeaking}
		<div class="absolute top-2 {onopenmenu ? 'right-10' : 'right-2'} flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-lowest/85 backdrop-blur-md shadow-sm border border-primary/20 z-10">
			<span class="w-0.5 h-2.5 bg-primary rounded-full animate-audio-bar-1"></span>
			<span class="w-0.5 h-4 bg-primary rounded-full animate-audio-bar-2"></span>
			<span class="w-0.5 h-2 bg-primary rounded-full animate-audio-bar-3"></span>
			<span class="w-0.5 h-3 bg-primary rounded-full animate-audio-bar-4"></span>
		</div>
	{/if}

	<!-- Bottom Info Bar -->
	<div class="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none z-10">
		<div class="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-container-lowest/85 backdrop-blur-md pointer-events-auto border border-white/5 max-w-[80%]">
			<span class="w-1.5 h-1.5 rounded-full shrink-0 {view.isSpeaking ? 'bg-primary' : 'bg-outline'}"></span>
			<span class="font-headline {compact ? 'text-[10px]' : 'text-xs'} text-on-surface font-semibold truncate">{view.title}</span>
			{#if view.kind === 'participant'}
				<Icon
					name={view.hasAudio ? 'mic' : 'mic_off'}
					class="text-[13px] shrink-0 {view.hasAudio ? 'text-primary' : 'text-outline'}"
				/>
			{:else}
				<Icon name="present_to_all" class="text-[13px] text-secondary shrink-0" />
			{/if}
		</div>

		{#if !compact}
			<div class="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-container-highest/80 backdrop-blur-sm text-on-surface-variant font-code text-[10px] pointer-events-auto">
				<span>{view.hasVideo ? (view.kind === 'screen' ? 'Screen' : '720p') : 'Audio'}</span>
			</div>
		{/if}
	</div>
{/snippet}

{#if onclick}
	<button
		type="button"
		{onclick}
		oncontextmenu={handleContextMenu}
		onpointerdown={handlePointerDown}
		onpointerup={handlePointerUpOrLeave}
		onpointerleave={handlePointerUpOrLeave}
		class="{containerClasses} cursor-pointer hover:brightness-105 active:scale-[0.99] text-left p-0"
	>
		{@render tileContent()}
	</button>
{:else}
	<div
		class={containerClasses}
		oncontextmenu={handleContextMenu}
		onpointerdown={handlePointerDown}
		onpointerup={handlePointerUpOrLeave}
		onpointerleave={handlePointerUpOrLeave}
		role="region"
		aria-label="{view.title} media tile"
	>
		{@render tileContent()}
	</div>
{/if}
