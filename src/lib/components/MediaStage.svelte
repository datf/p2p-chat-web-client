<script lang="ts">
	import {
		cotilla,
		short,
		formatDuration,
		ui,
		buildCallViews,
		sortCallViews,
		computeStageLayout,
		type CallView
	} from '#lib';
	import VideoTile from './VideoTile.svelte';
	import SignalStrengthBadge from './ui/SignalStrengthBadge.svelte';
	import Icon from './ui/Icon.svelte';
	import SidebarToggleButton from './ui/SidebarToggleButton.svelte';

	let participants = $derived(Array.from(cotilla.callParticipants.values()));
	let allViews = $derived(
		sortCallViews(buildCallViews(participants, cotilla.camStream, cotilla.screenStream))
	);
	let layout = $derived(computeStageLayout(allViews, ui.pinnedViewId));

	let callTitle = $derived(
		cotilla.callIsDM
			? `1:1 Private Call${cotilla.callPeerAddr ? ` (@${short(cotilla.callPeerAddr)})` : ''}`
			: `Room: #${cotilla.roomID ? cotilla.roomID.slice(0, 8) : 'Active Call'}`
	);

	let securityBadgeLabel = $derived.by(() => {
		if (import.meta.env.DEV) {
			return cotilla.callIsDM
				? `Encrypted DM (Epoch ${cotilla.callEpoch ?? 0})`
				: `Encrypted (Epoch ${cotilla.callEpoch ?? cotilla.activeEpoch})`;
		}
		return 'Encrypted E2E';
	});

	let controlsVisible = $state(true);
	let dockHovered = $state(false);
	let inactivityTimer: ReturnType<typeof setTimeout> | null = null;

	function clearInactivityTimer() {
		if (inactivityTimer) {
			clearTimeout(inactivityTimer);
			inactivityTimer = null;
		}
	}

	function resetInactivityTimer() {
		clearInactivityTimer();
		controlsVisible = true;
		if (ui.isFullscreen) {
			inactivityTimer = setTimeout(() => {
				if (!dockHovered && !ui.peerContextMenu) {
					controlsVisible = false;
				}
			}, 1500);
		}
	}

	function handleActivity() {
		resetInactivityTimer();
	}

	$effect(() => {
		function onFullscreenChange() {
			if (typeof document === 'undefined') return;
			const isFull = !!document.fullscreenElement;
			ui.setFullscreen(isFull);
			if (!isFull) {
				controlsVisible = true;
				clearInactivityTimer();
			} else {
				resetInactivityTimer();
			}
		}

		if (typeof document !== 'undefined') {
			document.addEventListener('fullscreenchange', onFullscreenChange);
		}
		return () => {
			if (typeof document !== 'undefined') {
				document.removeEventListener('fullscreenchange', onFullscreenChange);
			}
			clearInactivityTimer();
		};
	});

	function handleCarouselClick(viewId: string) {
		ui.togglePin(viewId);
	}

	function openTileMenu(view: CallView, coords: { x: number; y: number }) {
		const peer = cotilla.peers.get(view.peerAddr);
		ui.openPeerContextMenu({
			peerAddr: view.peerAddr,
			shortAddr: peer?.shortAddress || view.title,
			isLocal: view.isLocal,
			isCallParticipant: true,
			isDirect: peer?.isDirect,
			invitedBy: peer?.invitedBy,
			latencyMs: peer?.latencyMs,
			isScreen: view.kind === 'screen',
			viewId: view.id,
			title: view.title,
			x: coords.x,
			y: coords.y
		});
	}

	function toggleFullscreen() {
		ui.toggleFullscreen();
	}
</script>

<svelte:window onpointermove={handleActivity} onkeydown={handleActivity} />

<div
	class="relative flex flex-col w-full h-full min-w-0 bg-surface select-none overflow-hidden {ui.isFullscreen && !controlsVisible ? 'cursor-none' : ''}"
>
	<!-- Stage Sub-Header Bar (Hidden in Fullscreen for immersive video-only experience) -->
	{#if !ui.isFullscreen}
		<div class="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl bg-surface-container-low/80 backdrop-blur-md border border-white/5 shadow-sm m-2 sm:m-3 mb-0">
			<div class="flex items-center gap-2 sm:gap-3 min-w-0">
				<SidebarToggleButton title="Channels & Peers" />
				<div class="flex items-center gap-2 min-w-0">
					<span class="relative flex h-2.5 w-2.5 shrink-0">
						<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
						<span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span>
					</span>
					<span class="font-headline text-sm font-semibold text-on-surface truncate">
						{callTitle}
					</span>
					<span class="px-2 py-0.5 rounded-md bg-surface-container-highest text-primary font-code text-[11px] uppercase tracking-wide shrink-0">
						LIVE
					</span>
				</div>
				<div class="h-4 w-px bg-surface-variant hidden md:block"></div>
				<div class="flex items-center gap-1.5 text-on-surface-variant font-code text-xs shrink-0">
					<Icon name="schedule" class="text-[15px] text-primary" />
					<span class="font-medium text-on-surface">{formatDuration(cotilla.callDurationSec)}</span>
				</div>
			</div>

			<div class="flex items-center gap-1.5 sm:gap-2">
				<SignalStrengthBadge latencyMs={cotilla.latencyMs} />

				<!-- View Layout Selector: Stage View vs Split View -->
				<div class="flex items-center p-0.5 rounded-full bg-surface-container-low border border-white/5">
					<button
						type="button"
						aria-label="Stage view"
						class="p-1.5 rounded-full transition-colors cursor-pointer {ui.layoutMode === 'stage'
							? 'bg-surface-container-high text-primary shadow-sm'
							: 'text-on-surface-variant hover:text-on-surface'}"
						onclick={() => (ui.layoutMode = 'stage')}
						title="Stage View (Speaker on top, carousel at bottom)"
					>
						<Icon name="view_carousel" class="text-[18px]" />
					</button>
					<button
						type="button"
						aria-label="Split view"
						class="p-1.5 rounded-full transition-colors cursor-pointer {ui.layoutMode === 'split'
							? 'bg-surface-container-high text-primary shadow-sm'
							: 'text-on-surface-variant hover:text-on-surface'}"
						onclick={() => (ui.layoutMode = 'split')}
						title="Split Grid View (All cameras and shared screens)"
					>
						<Icon name="grid_view" class="text-[18px]" />
					</button>
				</div>

				<button
					type="button"
					aria-label="Toggle Fullscreen"
					class="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors cursor-pointer"
					onclick={toggleFullscreen}
					title="Enter Fullscreen"
				>
					<Icon name="fullscreen" class="text-[18px]" />
				</button>
			</div>
		</div>
	{/if}

	<!-- Central Stage Viewport -->
	<div class="flex-1 min-h-0 {ui.isFullscreen ? 'p-0' : 'p-2 sm:p-3'} flex flex-col gap-2 sm:gap-3 relative overflow-hidden">
		{#if allViews.length === 0}
			<div class="flex-1 rounded-2xl bg-surface-container-low border border-dashed border-white/10 flex flex-col items-center justify-center gap-2 text-on-surface-variant">
				<Icon name="sensors" class="text-4xl text-primary/40 animate-pulse" />
				<p class="font-headline text-sm font-medium">Connecting to encrypted media stream...</p>
			</div>
		{:else if layout.isSinglePane && layout.stageView}
			<!-- 1 Person Layout: 1x1 full pane -->
			<div class="flex-1 min-h-0 w-full h-full">
				<VideoTile
					view={layout.stageView}
					gain={cotilla.getPeerGain(layout.stageView.peerAddr)}
					onopenmenu={!layout.stageView.isLocal ? (coords) => openTileMenu(layout.stageView!, coords) : undefined}
				/>
			</div>
		{:else if ui.layoutMode === 'split'}
			<!-- Split View: All cameras/avatars and shared screens in a grid -->
			<div class="grid grid-cols-1 {allViews.length === 2 ? 'sm:grid-cols-2' : allViews.length <= 4 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'} gap-2 sm:gap-3 flex-1 min-h-0 auto-rows-fr overflow-y-auto">
				{#each allViews as v (v.id)}
					<VideoTile
						view={v}
						gain={cotilla.getPeerGain(v.peerAddr)}
						onopenmenu={!v.isLocal ? (coords) => openTileMenu(v, coords) : undefined}
					/>
				{/each}
			</div>
		{:else}
			<!-- Stage View: Speaker / Pinned / Screen takes primary large view on top; Carousel at bottom -->
			{#if layout.stageView}
				<div class="flex-1 min-h-0 w-full relative">
					<VideoTile
						view={layout.stageView}
						pinned={layout.pinnedViewId === layout.stageView.id}
						gain={cotilla.getPeerGain(layout.stageView.peerAddr)}
						onopenmenu={!layout.stageView.isLocal ? (coords) => openTileMenu(layout.stageView!, coords) : undefined}
					/>
				</div>
			{/if}

			{#if layout.carouselViews.length > 0}
				<div class="flex items-center gap-2 sm:gap-3 overflow-x-auto pb-1 shrink-0 h-24 sm:h-28 px-1">
					{#each layout.carouselViews as v (v.id)}
						<div class="w-36 sm:w-44 h-full shrink-0">
							<VideoTile
								view={v}
								compact={true}
								pinned={layout.pinnedViewId === v.id}
								gain={cotilla.getPeerGain(v.peerAddr)}
								onclick={() => handleCarouselClick(v.id)}
								onopenmenu={!v.isLocal ? (coords) => openTileMenu(v, coords) : undefined}
							/>
						</div>
					{/each}
				</div>
			{/if}
		{/if}
	</div>

	<!-- Floating HUD Controller Dock (Auto-hides after 1.5s in Fullscreen) -->
	<div
		role="toolbar"
		aria-label="Call controls"
		tabindex="-1"
		class="{ui.isFullscreen
			? 'absolute bottom-4 left-1/2 -translate-x-1/2'
			: 'p-3 pt-0 flex justify-center'} z-40 transition-all duration-300 {ui.isFullscreen && !controlsVisible
			? 'opacity-0 translate-y-3 pointer-events-none'
			: 'opacity-100 translate-y-0 pointer-events-auto'}"
		onmouseenter={() => {
			dockHovered = true;
			controlsVisible = true;
			clearInactivityTimer();
		}}
		onmouseleave={() => {
			dockHovered = false;
			resetInactivityTimer();
		}}
		onfocusin={() => {
			dockHovered = true;
			controlsVisible = true;
			clearInactivityTimer();
		}}
		onfocusout={() => {
			dockHovered = false;
			resetInactivityTimer();
		}}
	>
		<div class="glass-dock px-3 sm:px-4 py-2 rounded-full flex items-center gap-2 sm:gap-3 shadow-2xl">
			<!-- Mic Toggle -->
			<button
				type="button"
				class="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer {cotilla.micEnabled
					? 'bg-primary text-on-primary glow-primary'
					: 'bg-surface-container-highest/80 text-on-surface hover:bg-surface-bright'}"
				onclick={() => cotilla.toggleMic()}
				title={cotilla.micEnabled ? 'Mute Microphone' : 'Enable Microphone'}
			>
				<Icon name={cotilla.micEnabled ? 'mic' : 'mic_off'} class="text-[20px]" />
			</button>

			<!-- Cam Toggle -->
			<button
				type="button"
				class="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer {cotilla.camEnabled
					? 'bg-primary text-on-primary glow-primary'
					: 'bg-surface-container-highest/80 text-on-surface hover:bg-surface-bright'}"
				onclick={() => cotilla.toggleCam()}
				title={cotilla.camEnabled ? 'Turn Off Camera' : 'Turn On Camera'}
			>
				<Icon name={cotilla.camEnabled ? 'videocam' : 'videocam_off'} class="text-[20px]" />
			</button>

			<!-- Screen Share Toggle -->
			<button
				type="button"
				class="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer {cotilla.screenSharing
					? 'bg-secondary text-on-secondary shadow-md'
					: 'bg-surface-container-highest/80 text-on-surface hover:bg-surface-bright'}"
				onclick={() => cotilla.toggleScreenShare()}
				title={cotilla.screenSharing ? 'Stop Screen Share' : 'Share Screen'}
			>
				<Icon name={cotilla.screenSharing ? 'cancel_presentation' : 'present_to_all'} class="text-[20px]" />
			</button>

			<!-- Fullscreen extra controls: Layout Mode Switch -->
			{#if ui.isFullscreen}
				<button
					type="button"
					class="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center bg-surface-container-highest/80 text-on-surface hover:bg-surface-bright transition-all cursor-pointer"
					onclick={() => (ui.layoutMode = ui.layoutMode === 'stage' ? 'split' : 'stage')}
					title={ui.layoutMode === 'stage' ? 'Switch to Split Grid View' : 'Switch to Stage View'}
				>
					<Icon name={ui.layoutMode === 'stage' ? 'grid_view' : 'view_carousel'} class="text-[20px]" />
				</button>
			{/if}

			<div class="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-lowest/80 text-primary border border-primary/20 text-xs font-code">
				<Icon name="lock" class="text-[15px]" />
				<span>{securityBadgeLabel}</span>
			</div>

			<button
				type="button"
				class="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center bg-surface-container-highest/80 text-on-surface hover:bg-surface-bright transition-all cursor-pointer"
				onclick={() => ui.openSettings()}
				title="Device & Audio Settings"
			>
				<Icon name="tune" class="text-[20px]" />
			</button>

			<!-- Fullscreen extra controls: Exit Fullscreen Button -->
			{#if ui.isFullscreen}
				<button
					type="button"
					class="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center bg-surface-container-highest/80 text-on-surface hover:bg-surface-bright transition-all cursor-pointer"
					onclick={() => ui.exitFullscreen()}
					title="Exit Fullscreen"
				>
					<Icon name="fullscreen_exit" class="text-[20px]" />
				</button>
			{/if}

			<div class="h-6 w-px bg-white/10 mx-0.5 sm:mx-1"></div>

			<!-- Disconnect Button -->
			<button
				type="button"
				class="h-10 sm:h-11 px-3 sm:px-4 rounded-full flex items-center gap-1.5 bg-error-container text-on-error-container hover:bg-error hover:text-on-error font-headline text-xs font-semibold tracking-wide uppercase transition-all active:scale-95 cursor-pointer shadow-md"
				onclick={() => cotilla.leaveVoiceCall()}
				title="Disconnect from Call"
			>
				<Icon name="call_end" class="text-[18px]" />
				<span class="hidden sm:inline">Leave</span>
			</button>
		</div>
	</div>
</div>
