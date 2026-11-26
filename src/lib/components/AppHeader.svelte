<script lang="ts">
	import { cotilla, short, ui } from '#lib';
	import CopyInviteButton from './ui/CopyInviteButton.svelte';
</script>

<header class="{ui.isFullscreen ? 'hidden' : 'hidden md:flex'} h-14 px-4 bg-surface-container-low border-b border-white/5 items-center justify-between z-30 select-none shrink-0">
	<!-- Left Branding & Space Tag -->
	<div class="flex items-center gap-3">
		<div class="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container shadow-sm">
			<span class="material-symbols-outlined text-[20px]">graphic_eq</span>
		</div>
		<div class="flex flex-col">
			<div class="flex items-center gap-1.5">
				<span class="font-headline text-base font-bold tracking-tight text-on-surface">Resonate</span>
				<span class="px-1.5 py-0.2 rounded-md bg-surface-container-highest text-primary font-code text-[10px] uppercase tracking-wider">
					E2EE
				</span>
			</div>
		</div>

		<div class="h-4 w-px bg-surface-variant hidden sm:block mx-1"></div>

		<!-- Room ID & Copy Link Chip -->
		{#if cotilla.roomID}
			<div class="flex items-center gap-1.5">
				<div class="flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container text-on-surface font-code text-xs border border-white/5">
					<span class="text-primary font-bold">#</span>
					<span>{short(cotilla.roomID)}</span>
				</div>

				<div class="hidden md:flex">
					<CopyInviteButton variant="secondary" size="sm" label="Invite" />
				</div>

				{#if import.meta.env.DEV}
					<button
						type="button"
						class="hidden lg:flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container-high hover:bg-surface-bright text-on-surface text-xs font-headline font-medium transition-all cursor-pointer active:scale-95"
						onclick={() => cotilla.rotateKey()}
						title="Rotate Forward-Secret Encryption Key"
					>
						<span class="material-symbols-outlined text-[15px] text-tertiary">autorenew</span>
						<span>Rotate Key</span>
					</button>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Right Status & Controls Strip -->
	<div class="flex items-center gap-3">
		<!-- Mesh Network Latency & Quality Readout -->
		<div class="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container text-on-surface-variant text-xs font-code border border-white/5" title={cotilla.statusText}>
			<div class="flex items-end gap-0.5 h-3">
				<span class="w-0.5 h-1.5 {cotilla.connected ? 'bg-primary' : 'bg-outline'} rounded-full"></span>
				<span class="w-0.5 h-2.5 {cotilla.connected ? 'bg-primary' : 'bg-outline'} rounded-full"></span>
				<span class="w-0.5 h-3 {cotilla.connected ? 'bg-primary' : 'bg-outline'} rounded-full"></span>
			</div>
			<span>{cotilla.connected ? `${cotilla.peerCount} online` : cotilla.statusText}</span>
		</div>

		<!-- Action Utility Buttons -->
		<div class="flex items-center gap-1">
			<!-- Settings Modal Trigger -->
			<button
				type="button"
				aria-label="Device settings"
				class="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors cursor-pointer"
				onclick={() => ui.openSettings()}
				title="Device & Audio Preferences"
			>
				<span class="material-symbols-outlined text-[20px]">tune</span>
			</button>

			<!-- Leave Room Button -->
			<button
				type="button"
				class="h-8 px-3 rounded-full flex items-center gap-1 text-xs font-headline font-medium text-error hover:bg-error-container/20 transition-colors cursor-pointer active:scale-95"
				onclick={() => ui.openLeaveConfirm()}
				title="Leave this Burner Room"
			>
				<span class="material-symbols-outlined text-[16px]">logout</span>
				<span class="hidden md:inline">Leave</span>
			</button>
		</div>

		<!-- User Identity Chip -->
		<button
			type="button"
			class="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full bg-surface-container-high text-on-surface cursor-pointer hover:bg-surface-bright transition-colors"
			onclick={() => ui.openSettings()}
			title={`Your Public Key: ${cotilla.me?.address || 'Anonymous'}`}
		>
			<div class="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-on-primary">
				<span class="material-symbols-outlined text-[15px]">person</span>
			</div>
			<span class="font-code text-xs text-on-surface hidden md:inline">
				{short(cotilla.me?.address)}
			</span>
		</button>
	</div>
</header>
