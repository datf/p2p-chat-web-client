<script lang="ts">
	import { onMount } from 'svelte';
	import { cotilla, ui } from '#lib';
	import WelcomeView from '#lib/components/WelcomeView.svelte';
	import AppHeader from '#lib/components/AppHeader.svelte';
	import Sidebar from '#lib/components/Sidebar.svelte';
	import MediaStage from '#lib/components/MediaStage.svelte';
	import ChatFeed from '#lib/components/ChatFeed.svelte';
	import CallAudioSink from '#lib/components/CallAudioSink.svelte';
	import SettingsModal from '#lib/components/SettingsModal.svelte';
	import DMInviteModal from '#lib/components/DMInviteModal.svelte';
	import LeaveConfirmModal from '#lib/components/LeaveConfirmModal.svelte';
	import ToastStack from '#lib/components/ui/ToastStack.svelte';
	import ConfirmDialog from '#lib/components/ui/ConfirmDialog.svelte';
	import PeerInfoModal from '#lib/components/ui/PeerInfoModal.svelte';
	import PeerContextMenu from '#lib/components/ui/PeerContextMenu.svelte';
	import Modal from '#lib/components/ui/Modal.svelte';
	import Button from '#lib/components/ui/Button.svelte';

	onMount(() => {
		void cotilla.init();
		return () => {
			cotilla.destroy();
		};
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (ui.peerContextMenu) {
				e.preventDefault();
				ui.closePeerContextMenu();
				return;
			}
			if (ui.mobileSidebarOpen) {
				e.preventDefault();
				ui.closeMobileSidebar();
			}
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:head>
	<title>{cotilla.inRoom ? `Resonate — #${cotilla.roomID ? cotilla.roomID.slice(0, 8) : 'Room'}` : 'Resonate — Ephemeral E2EE Burner Rooms'}</title>
</svelte:head>

<div class="w-full min-h-dvh bg-surface flex flex-col overflow-hidden text-on-surface">
	{#if !cotilla.inRoom}
		<!-- Landing / Welcome & Join View -->
		<WelcomeView />
	{:else}
		<!-- Persistent remote call audio playback across Chat/Stage/Split transitions -->
		<CallAudioSink />

		<!-- Main Active Burner Room App Shell -->
		<div class="w-full h-dvh flex flex-col overflow-hidden">
			<AppHeader />

			<div class="flex-1 min-h-0 flex overflow-hidden relative">
				<Sidebar />

				<main class="flex-1 min-w-0 flex overflow-hidden relative bg-surface">
					{#if cotilla.callJoined && ui.showCallStage}
						<div class="w-full h-full">
							<MediaStage />
						</div>
					{:else}
						<div class="w-full h-full">
							<ChatFeed />
						</div>
					{/if}
				</main>
			</div>
		</div>
	{/if}

	<!-- Modals and Overlays -->
	<SettingsModal />
	<DMInviteModal />
	<LeaveConfirmModal />

	<!-- Eviction Prompt Dialog -->
	<ConfirmDialog
		open={!!ui.evictTarget}
		title="Evict Member?"
		icon="person_remove"
		message={`Propose forward-secret eviction commit for ${ui.evictTarget?.shortAddr}? This peer will be cryptographically excluded and rotated out.`}
		confirmLabel="Evict Member"
		confirmVariant="danger"
		showInput={true}
		inputPlaceholder="Reason (e.g. policy violation)"
		initialInputValue="policy violation"
		onconfirm={(reason) => {
			if (ui.evictTarget) {
				cotilla.evictPeer(ui.evictTarget.peer, reason || 'policy violation');
				ui.closeEvictDialog();
			}
		}}
		oncancel={() => ui.closeEvictDialog()}
	/>

	<!-- Peer Info Modal -->
	{#if ui.peerInfoTarget}
		<PeerInfoModal
			open={true}
			peer={ui.peerInfoTarget.peer}
			shortAddr={ui.peerInfoTarget.shortAddr}
			isDirect={ui.peerInfoTarget.isDirect}
			invitedBy={ui.peerInfoTarget.invitedBy}
			latencyMs={ui.peerInfoTarget.latencyMs}
			onclose={() => ui.closePeerInfoDialog()}
		/>
	{/if}

	<!-- Eviction Notice Modal (Dismissible so active 1:1 DMs stay usable per DM isolation rules) -->
	<Modal
		open={ui.evictionNoticeOpen}
		title="Removed from Group Room"
		icon="block"
		onclose={() => ui.closeEvictionNotice()}
	>
		<div class="py-2 flex flex-col gap-2">
			<p class="font-body text-xs text-on-surface-variant leading-relaxed">
				You have been evicted from the group channel. Cryptographic ratchet keys have been rotated by remaining peers. Active 1:1 DM sessions remain isolated.
			</p>
		</div>

		{#snippet footer()}
			<Button variant="ghost" size="sm" onclick={() => ui.closeEvictionNotice()}>
				Stay for DMs
			</Button>
			<Button variant="danger" size="sm" onclick={() => cotilla.leaveRoom()}>
				Exit Room
			</Button>
		{/snippet}
	</Modal>

	<!-- Global Floating Peer Context Menu -->
	<PeerContextMenu />

	<!-- Global Toast Notifications Stack -->
	<ToastStack />
</div>
