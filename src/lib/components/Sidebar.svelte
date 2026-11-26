<script lang="ts">
	import { cotilla, short, ui } from '#lib';
	import type { PeerInfo } from '#lib';
	import Avatar from './ui/Avatar.svelte';
	import CopyInviteButton from './ui/CopyInviteButton.svelte';
	import Icon from './ui/Icon.svelte';

	let sessionList = $derived(Array.from(cotilla.sessions.values()));
	let peerList = $derived(Array.from(cotilla.peers.values()));

	function openPeerMenu(peer: PeerInfo, e: MouseEvent) {
		e.stopPropagation();
		e.preventDefault();
		const inCall = cotilla.callJoined && cotilla.callParticipants.has(peer.address);
		let x = e.clientX;
		let y = e.clientY;
		if (e.currentTarget instanceof HTMLElement && e.type === 'click') {
			const rect = e.currentTarget.getBoundingClientRect();
			x = rect.right;
			y = rect.bottom + 4;
		}
		ui.openPeerContextMenu({
			peerAddr: peer.address,
			shortAddr: peer.shortAddress,
			isDirect: peer.isDirect,
			isCallParticipant: inCall,
			invitedBy: peer.invitedBy,
			latencyMs: peer.latencyMs,
			x,
			y
		});
	}

	let touchStartX = 0;
	function handleTouchStart(e: TouchEvent) {
		touchStartX = e.touches[0].clientX;
	}
	function handleTouchEnd(e: TouchEvent) {
		const touchEndX = e.changedTouches[0].clientX;
		if (touchStartX - touchEndX > 50) {
			ui.closeMobileSidebar();
		}
	}
</script>

<!-- Mobile Scrim Backdrop -->
{#if ui.mobileSidebarOpen && !ui.isFullscreen}
	<div
		class="md:hidden fixed inset-0 z-30 bg-scrim/60 backdrop-blur-xs transition-opacity duration-200"
		onclick={() => ui.closeMobileSidebar()}
		aria-hidden="true"
	></div>
{/if}

<aside
	class="{ui.isFullscreen
		? 'hidden'
		: 'fixed inset-y-0 left-0 z-40 w-[min(18rem,82dvw)] transition-transform duration-200 ease-out bg-surface-container-low border-r border-white/5 flex flex-col justify-between select-none shadow-2xl flex-shrink-0 md:static md:w-64 md:translate-x-0 md:transition-none md:z-auto'} {ui.mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}"
	ontouchstart={handleTouchStart}
	ontouchend={handleTouchEnd}
>
	<div class="flex flex-col flex-1 min-h-0 overflow-y-auto">
		<!-- Mobile Header Strip (md:hidden) -->
		<div class="md:hidden p-3 border-b border-white/5 flex items-center justify-between bg-surface-container">
			<div class="flex items-center gap-2 min-w-0">
				<button
					type="button"
					class="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
					onclick={() => ui.closeMobileSidebar()}
					aria-label="Close sidebar drawer"
				>
					<Icon name="close" class="text-[18px]" />
				</button>
				{#if cotilla.roomID}
					<div class="flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container-highest text-on-surface font-code text-xs border border-white/5">
						<span class="text-primary font-bold">#</span>
						<span>{short(cotilla.roomID)}</span>
					</div>
				{/if}
			</div>

			<div class="flex items-center gap-1.5">
				{#if cotilla.roomID}
					<CopyInviteButton variant="secondary" size="sm" label="Invite" />
				{/if}
				<button
					type="button"
					class="w-8 h-8 rounded-full flex items-center justify-center text-error hover:bg-error-container/20 transition-colors cursor-pointer"
					onclick={() => {
						ui.closeMobileSidebar();
						ui.openLeaveConfirm();
					}}
					title="Leave Room"
				>
					<Icon name="logout" class="text-[18px]" />
				</button>
			</div>
		</div>

		<!-- Channel Spaces Section -->
		<div class="px-4 pt-4 pb-2">
			<span class="font-headline text-[11px] text-outline font-semibold tracking-wider uppercase">
				Channels
			</span>
		</div>

		<nav class="flex flex-col gap-1 px-2">
			<!-- Main Group Channel -->
			<button
				type="button"
				class="flex items-center justify-between px-3 py-2 rounded-xl text-left transition-all cursor-pointer {cotilla.activeSessionId === 'main' && !ui.showCallStage
					? 'bg-surface-container-high text-on-surface shadow-sm'
					: 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'}"
				onclick={() => {
					cotilla.switchSession('main');
					ui.showCallStage = false;
					ui.closeMobileSidebar();
				}}
			>
				<div class="flex items-center gap-2.5 min-w-0">
					<span class="text-primary font-headline font-bold text-base">#</span>
					<span class="font-headline text-sm font-semibold truncate">Group Room</span>
				</div>
				{#if cotilla.callJoined && !cotilla.callIsDM}
					<div class="flex items-center gap-1 text-primary">
						<Icon name="volume_up" class="text-[16px] animate-pulse" />
					</div>
				{/if}
			</button>

			<!-- Group Call Child Channel -->
			<button
				type="button"
				disabled={cotilla.isEvicted}
				class="ml-3 flex items-center justify-between px-3 py-1.5 rounded-xl text-left transition-all {cotilla.isEvicted
					? 'opacity-40 cursor-not-allowed'
					: 'cursor-pointer'} {cotilla.callJoined && !cotilla.callIsDM && ui.showCallStage
					? 'bg-surface-container-high text-primary shadow-sm font-semibold'
					: 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'}"
				onclick={() => {
					cotilla.joinGroupCall();
					ui.closeMobileSidebar();
				}}
			>
				<div class="flex items-center gap-2 min-w-0">
					<Icon
						name="call"
						class="text-[16px] {cotilla.callJoined && !cotilla.callIsDM ? 'text-primary' : 'text-on-surface-variant'}"
					/>
					<span class="font-headline text-xs truncate">Group Call</span>
				</div>
				{#if cotilla.callJoined && !cotilla.callIsDM}
					<span class="px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-code text-[10px]">
						LIVE
					</span>
				{/if}
			</button>

			<!-- 1:1 Direct Message Sessions -->
			{#each sessionList.filter((s) => s.isDM) as sess (sess.id)}
				{@const inThisDMCall = cotilla.callJoined && cotilla.callIsDM && cotilla.callScopeID === sess.roomID}
				<div
					class="group flex items-center justify-between px-3 py-2 rounded-xl text-left transition-all {cotilla.activeSessionId === sess.id && !ui.showCallStage
						? 'bg-surface-container-high text-on-surface shadow-sm'
						: 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'}"
				>
					<button
						type="button"
						class="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
						onclick={() => {
							cotilla.switchSession(sess.id);
							ui.showCallStage = false;
							ui.closeMobileSidebar();
						}}
					>
						<Icon name="forum" class="text-[16px] text-secondary" />
						<span class="font-headline text-xs font-semibold truncate">{sess.name}</span>
					</button>

					<div class="flex items-center gap-1">
						{#if inThisDMCall}
							<button
								type="button"
								class="px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-code text-[10px] cursor-pointer"
								onclick={(e) => {
									e.stopPropagation();
									cotilla.switchSession(sess.id);
									ui.showCallStage = true;
									ui.closeMobileSidebar();
								}}
								title="View Active DM Call"
							>
								LIVE
							</button>
						{/if}
						{#if sess.unreadCount > 0}
							<span class="px-1.5 py-0.2 rounded-full bg-primary text-on-primary font-code text-[10px] font-bold">
								{sess.unreadCount}
							</span>
						{/if}
						<button
							type="button"
							class="w-5 h-5 rounded-full flex items-center justify-center text-outline hover:text-on-surface hover:bg-surface-container-highest transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
							onclick={(e) => {
								e.stopPropagation();
								cotilla.closeSession(sess.id);
							}}
							title="Close DM Tab"
						>
							<Icon name="close" class="text-[14px]" />
						</button>
					</div>
				</div>
			{/each}
		</nav>

		<!-- Connected Peers Section -->
		<div class="px-4 pt-6 pb-2 flex items-center justify-between">
			<span class="font-headline text-[11px] text-outline font-semibold tracking-wider uppercase">
				Room Peers ({cotilla.peerCount})
			</span>
			<span class="w-2 h-2 rounded-full {cotilla.connected ? 'bg-primary' : 'bg-outline-variant'}" title={cotilla.statusText}></span>
		</div>

		<ul class="flex flex-col gap-1 px-2 flex-1">
			{#if cotilla.me}
				<li class="flex items-center justify-between px-3 py-2 rounded-xl bg-surface-container/40">
					<div class="flex items-center gap-2.5 min-w-0">
						<Avatar isLocal={true} size="sm" showStatus={true} isDirect={true} />
						<div class="flex flex-col min-w-0">
							<span class="font-headline text-xs font-semibold text-on-surface truncate">
								{short(cotilla.me.address)} (You)
							</span>
							<span class="font-code text-[10px] text-primary">Local Node</span>
						</div>
					</div>
				</li>
			{/if}

			{#each peerList as peer (peer.address)}
				<li
					class="relative group flex items-center justify-between px-3 py-2 rounded-xl hover:bg-surface-container transition-colors select-none"
					oncontextmenu={(e) => openPeerMenu(peer, e)}
				>
					<div class="flex items-center gap-2.5 min-w-0 flex-1">
						<Avatar isLocal={false} size="sm" showStatus={true} isDirect={peer.isDirect} />
						<div class="flex flex-col min-w-0">
							<span class="font-headline text-xs font-semibold text-on-surface truncate">
								{peer.shortAddress}
							</span>
							<span class="font-code text-[10px] text-on-surface-variant">
								{peer.isDirect ? 'Direct P2P' : 'Relayed'}
							</span>
						</div>
					</div>

					<button
						type="button"
						class="w-7 h-7 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors opacity-70 group-hover:opacity-100 cursor-pointer"
						onclick={(e) => openPeerMenu(peer, e)}
						title="Member actions"
					>
						<Icon name="more_vert" class="text-[18px]" />
					</button>
				</li>
			{/each}

			{#if peerList.length === 0}
				<li class="px-3 py-4 text-center">
					<p class="font-body text-xs text-outline">
						{cotilla.isEvicted ? 'Disconnected from group room' : 'Waiting for peers to join...'}
					</p>
					{#if !cotilla.isEvicted}
						<div class="mt-2 flex justify-center">
							<CopyInviteButton variant="primary" size="sm" label="Copy Link" />
						</div>
					{/if}
				</li>
			{/if}
		</ul>
	</div>

	<!-- Sidebar Footer: Status & Quick Controls -->
	<div class="p-3 bg-surface-container-low border-t border-white/5 flex items-center justify-between">
		<div class="flex items-center gap-2 min-w-0">
			<div class="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center text-primary shrink-0">
				<Icon name="verified_user" class="text-[18px]" />
			</div>
			<div class="flex flex-col min-w-0">
				<span class="font-headline text-xs font-bold text-on-surface truncate">
					{short(cotilla.me?.address)}
				</span>
				<span class="font-code text-[10px] text-primary truncate">
					{#if import.meta.env.DEV}
						Epoch {cotilla.activeEpoch}
					{:else}
						Encrypted E2E
					{/if}
				</span>
			</div>
		</div>

		<div class="flex items-center gap-1">
			<button
				type="button"
				class="w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer {cotilla.micEnabled
					? 'text-primary hover:bg-surface-container-high'
					: 'text-outline hover:text-on-surface hover:bg-surface-container-high'}"
				onclick={() => cotilla.toggleMic()}
				title={cotilla.micEnabled ? 'Mute' : 'Unmute'}
			>
				<Icon name={cotilla.micEnabled ? 'mic' : 'mic_off'} class="text-[18px]" />
			</button>
			<button
				type="button"
				class="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
				onclick={() => {
					ui.closeMobileSidebar();
					ui.openSettings();
				}}
				title="Settings"
			>
				<Icon name="settings" class="text-[18px]" />
			</button>
		</div>
	</div>
</aside>
