<script lang="ts">
	import { cotilla, short, ui } from '#lib';
	import Icon from './Icon.svelte';

	let menuEl: HTMLDivElement | null = $state(null);
	let target = $derived(ui.peerContextMenu);

	let gain = $derived(target ? cotilla.getPeerGain(target.peerAddr) : 1);
	let percent = $derived(Math.round(gain * 100));

	let isPeerInRoom = $derived(target ? cotilla.peers.has(target.peerAddr) : false);
	let isPinned = $derived(target?.viewId ? ui.pinnedViewId === target.viewId : false);

	// Dynamically clamp menu coordinates inside the viewport
	let menuPos = $derived.by(() => {
		if (!target || typeof window === 'undefined') return { top: 0, left: 0 };
		const menuWidth = 240;
		const menuHeight = target.isLocal ? 100 : 260;

		const top = Math.max(
			8,
			Math.min(target.y, window.innerHeight - menuHeight - 12)
		);
		const left = Math.max(
			8,
			Math.min(target.x, window.innerWidth - menuWidth - 12)
		);
		return { top, left };
	});

	function handleSliderInput(e: Event) {
		e.stopPropagation();
		if (!target) return;
		const val = Number((e.currentTarget as HTMLInputElement).value);
		cotilla.setPeerGain(target.peerAddr, val / 100);
	}

	function handleToggleMute(e: MouseEvent) {
		e.stopPropagation();
		if (!target) return;
		cotilla.togglePeerMute(target.peerAddr);
	}

	function handleResetGain(e: MouseEvent) {
		e.stopPropagation();
		if (!target) return;
		cotilla.resetPeerGain(target.peerAddr);
	}

	function handleTogglePin(e: MouseEvent) {
		e.stopPropagation();
		if (target?.viewId) {
			ui.togglePin(target.viewId);
		}
		ui.closePeerContextMenu();
	}

	function handleStartDM(e: MouseEvent) {
		e.stopPropagation();
		if (!target) return;
		const addr = target.peerAddr;
		ui.closePeerContextMenu();
		ui.showCallStage = false;
		ui.closeMobileSidebar();
		cotilla.startDM(addr);
	}

	function handlePeerInfo(e: MouseEvent) {
		e.stopPropagation();
		if (!target) return;
		const addr = target.peerAddr;
		const shortAddr = target.shortAddr;
		const isDirect = target.isDirect ?? false;
		const invitedBy = cotilla.getInvitedBy(addr) || target.invitedBy;
		const latencyMs = target.latencyMs;
		ui.closePeerContextMenu();
		ui.closeMobileSidebar();
		ui.openPeerInfoDialog({
			peer: addr,
			shortAddr,
			isDirect,
			invitedBy,
			latencyMs
		});
	}

	function handleEvict(e: MouseEvent) {
		e.stopPropagation();
		if (!target) return;
		const addr = target.peerAddr;
		const shortAddr = target.shortAddr;
		ui.closePeerContextMenu();
		ui.closeMobileSidebar();
		ui.openEvictDialog(addr, shortAddr);
	}

	function handleBackdrop(e: MouseEvent) {
		e.stopPropagation();
		ui.closePeerContextMenu();
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape' && target) {
			e.preventDefault();
			ui.closePeerContextMenu();
		}
	}}
/>

{#if target}
	<!-- Dismiss backdrop -->
	<div
		class="fixed inset-0 z-50 bg-black/20 backdrop-blur-xs select-none"
		onclick={handleBackdrop}
		onkeydown={(e) => {
			if (e.key === 'Escape') ui.closePeerContextMenu();
		}}
		oncontextmenu={(e) => {
			e.preventDefault();
			ui.closePeerContextMenu();
		}}
		role="presentation"
	>
		<!-- Floating Glass Menu Panel -->
		<div
			bind:this={menuEl}
			class="fixed w-60 rounded-2xl bg-surface-container-highest/95 border border-white/10 shadow-2xl p-2 z-50 flex flex-col gap-1 backdrop-blur-xl animate-fade-in text-on-surface select-none"
			style="top: {menuPos.top}px; left: {menuPos.left}px;"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => {
				if (e.key === 'Escape') ui.closePeerContextMenu();
			}}
			oncontextmenu={(e) => e.preventDefault()}
			role="menu"
			tabindex="-1"
			aria-label="Participant options"
		>
			<!-- Menu Header -->
			<div class="flex items-center justify-between px-2.5 py-1.5 border-b border-white/5 mb-0.5">
				<div class="flex items-center gap-2 min-w-0">
					<div class="w-6 h-6 rounded-full bg-surface-container-high flex items-center justify-center text-primary shrink-0">
						<Icon name={target.isScreen ? 'present_to_all' : target.isLocal ? 'person' : 'graphic_eq'} class="text-[14px]" />
					</div>
					<div class="flex flex-col min-w-0">
						<span class="font-headline text-xs font-semibold text-on-surface truncate">
							{target.title || target.shortAddr}
						</span>
						<span class="font-code text-[10px] text-on-surface-variant truncate">
							{target.isScreen ? 'Shared Screen' : target.isLocal ? 'You' : target.isDirect ? 'Direct P2P' : 'Relayed Peer'}
						</span>
					</div>
				</div>

				<button
					type="button"
					class="w-6 h-6 rounded-full flex items-center justify-center text-outline hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
					onclick={() => ui.closePeerContextMenu()}
					title="Close Menu"
				>
					<Icon name="close" class="text-[14px]" />
				</button>
			</div>

			<!-- Loudness / Volume Slider (Remote participants with audio capability) -->
			{#if !target.isLocal}
				<div class="px-2.5 py-2 rounded-xl bg-surface-container-low/70 border border-white/5 flex flex-col gap-1.5 my-0.5">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-1.5">
							<button
								type="button"
								class="w-6 h-6 rounded-full flex items-center justify-center transition-colors cursor-pointer {percent === 0
									? 'text-error bg-error-container/20'
									: 'text-primary hover:bg-surface-container-high'}"
								onclick={handleToggleMute}
								title={percent === 0 ? 'Unmute Participant' : 'Mute Participant'}
							>
								<Icon name={percent === 0 ? 'volume_off' : percent > 100 ? 'volume_up' : 'volume_down'} class="text-[15px]" />
							</button>
							<span class="font-headline text-xs font-medium text-on-surface">Loudness</span>
						</div>

						<div class="flex items-center gap-1.5">
							<span class="font-code text-xs font-semibold tabular-nums {percent === 0 ? 'text-error' : percent > 100 ? 'text-primary' : 'text-on-surface'}">
								{percent === 0 ? 'Muted' : `${percent}%`}
							</span>
							{#if percent !== 100}
								<button
									type="button"
									class="px-1.5 py-0.5 rounded text-[10px] font-code text-outline hover:text-primary hover:bg-surface-container-high transition-colors cursor-pointer"
									onclick={handleResetGain}
									title="Reset to 100%"
								>
									Reset
								</button>
							{/if}
						</div>
					</div>

					<input
						type="range"
						min="0"
						max="200"
						step="1"
						value={percent}
						oninput={handleSliderInput}
						onpointerdown={(e) => e.stopPropagation()}
						class="w-full h-1.5 bg-surface-container-high rounded-lg appearance-none cursor-pointer focus:outline-none"
						aria-label="Participant loudness slider"
					/>
				</div>
			{/if}

			<!-- Call Stage Actions (Pin / Unpin) -->
			{#if target.viewId}
				<button
					type="button"
					class="flex items-center gap-2 px-2.5 py-1.5 text-xs font-headline text-left text-on-surface hover:bg-surface-bright rounded-lg transition-colors cursor-pointer"
					onclick={handleTogglePin}
				>
					<Icon name={isPinned ? 'keep_off' : 'push_pin'} class="text-[16px] text-pinned" />
					<span>{isPinned ? 'Unpin from Stage' : 'Pin to Stage'}</span>
				</button>
			{/if}

			<!-- Room Actions (DMs, Details, Eviction) -->
			{#if isPeerInRoom && !target.isLocal}
				<div class="h-px bg-white/5 my-0.5"></div>

				<button
					type="button"
					class="flex items-center gap-2 px-2.5 py-1.5 text-xs font-headline text-left text-on-surface hover:bg-surface-bright rounded-lg transition-colors cursor-pointer"
					onclick={handleStartDM}
				>
					<Icon name="chat" class="text-[16px] text-primary" />
					<span>Direct Message</span>
				</button>

				<button
					type="button"
					class="flex items-center gap-2 px-2.5 py-1.5 text-xs font-headline text-left text-on-surface hover:bg-surface-bright rounded-lg transition-colors cursor-pointer"
					onclick={handlePeerInfo}
				>
					<Icon name="info" class="text-[16px] text-secondary" />
					<span>Peer Details</span>
				</button>

				<button
					type="button"
					class="flex items-center gap-2 px-2.5 py-1.5 text-xs font-headline text-left text-error hover:bg-error-container/20 rounded-lg transition-colors cursor-pointer"
					onclick={handleEvict}
				>
					<Icon name="person_remove" class="text-[16px]" />
					<span>Evict Member</span>
				</button>
			{/if}
		</div>
	</div>
{/if}
