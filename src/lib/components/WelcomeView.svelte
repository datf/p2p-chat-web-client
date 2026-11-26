<script lang="ts">
	import { cotilla, short, ui, parseInviteInput, formatError, UI_VERSION } from '#lib';

	let inviteInput = $state('');
	let isCreating = $state(false);
	let isJoining = $state(false);
	let errorMessage = $state<string | null>(null);

	async function handleCreateRoom() {
		isCreating = true;
		errorMessage = null;
		try {
			await cotilla.createRoom();
		} catch (err: unknown) {
			console.error('create room error', err);
			errorMessage = formatError(err);
		} finally {
			isCreating = false;
		}
	}

	async function handleJoinRoom() {
		if (!inviteInput.trim()) return;
		isJoining = true;
		errorMessage = null;
		try {
			const parsed = parseInviteInput(inviteInput);
			await cotilla.joinRoomFromHash(parsed.rawHash);
		} catch (err: unknown) {
			console.error('join room error', err);
			errorMessage = formatError(err);
		} finally {
			isJoining = false;
		}
	}

	async function handleRejoinRoom(link: string) {
		isJoining = true;
		errorMessage = null;
		try {
			await cotilla.joinRoomFromHash(link);
		} catch (err: unknown) {
			console.error('rejoin room error', err);
			errorMessage = formatError(err);
		} finally {
			isJoining = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			handleJoinRoom();
		}
	}
</script>

<div class="relative w-full min-h-screen bg-surface flex flex-col justify-between overflow-x-hidden select-none">
	<!-- Ambient Backdrop Flares -->
	<div class="absolute -top-32 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[140px] pointer-events-none -z-10"></div>
	<div class="absolute bottom-10 right-10 w-[28rem] h-[28rem] bg-secondary-container/15 rounded-full blur-[160px] pointer-events-none -z-10"></div>

	<!-- Top Branding & Status Strip -->
	<header class="w-full max-w-7xl mx-auto px-6 py-6 flex items-center justify-between z-20">
		<div class="flex items-center gap-3">
			<div class="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container shadow-md">
				<span class="material-symbols-outlined text-2xl font-bold">graphic_eq</span>
			</div>
			<div class="flex items-center gap-2">
				<span class="font-headline text-xl font-bold tracking-tight text-on-surface">RESONATE</span>
				<span class="px-2 py-0.5 rounded-full bg-surface-container-highest text-primary font-code text-xs uppercase tracking-wider">
					v{UI_VERSION}
				</span>
			</div>
		</div>

		<div class="flex items-center gap-3">
			<div class="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface-container-low text-on-surface-variant font-code text-xs border border-white/5 shadow-sm">
				<span class="relative flex h-2 w-2">
					<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
					<span class="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
				</span>
				<span>{cotilla.wasmReady ? 'ONLINE' : 'INITIALIZING'}</span>
			</div>

			<button
				type="button"
				class="w-9 h-9 rounded-full bg-surface-container-high hover:bg-surface-bright flex items-center justify-center text-on-surface transition-colors cursor-pointer"
				onclick={() => ui.openSettings()}
				title="Preferences & Audio Settings"
			>
				<span class="material-symbols-outlined text-[20px]">tune</span>
			</button>
		</div>
	</header>

	<!-- Main Dynamic Layout Grid -->
	<main class="w-full max-w-7xl mx-auto px-6 py-4 flex-1 flex flex-col justify-center z-10">
		<div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
			<!-- Left Column: Hero & Instant Code Connect (7 Cols) -->
			<div class="lg:col-span-7 flex flex-col justify-between gap-8 p-8 md:p-10 rounded-3xl bg-surface-container-lowest/80 backdrop-blur-xl border border-white/10 shadow-2xl relative overflow-hidden">
				<!-- Sound Wave Ambient Graphic -->
				<div class="absolute right-0 top-0 opacity-15 pointer-events-none">
					<svg class="text-primary" fill="none" height="200" viewBox="0 0 340 200" width="340">
						<path d="M0 100 C 40 40, 80 160, 120 100 C 160 40, 200 160, 240 100 C 280 40, 320 160, 360 100" stroke="currentColor" stroke-dasharray="4 4" stroke-width="2"></path>
						<path d="M0 100 C 50 20, 90 180, 140 100 C 190 20, 230 180, 280 100 C 330 20, 370 180, 420 100" stroke="currentColor" stroke-width="1.5"></path>
					</svg>
				</div>

				<div class="flex flex-col gap-4 relative z-10">
					<div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary font-headline text-xs font-semibold w-fit">
						<span class="material-symbols-outlined text-[16px]">verified</span>
						<span>ZERO-KNOWLEDGE EPHEMERAL MESH</span>
					</div>

					<h1 class="font-headline text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-on-surface leading-[1.15]">
						Acoustic Spaces &amp; Ephemeral Rooms
					</h1>

					<p class="font-body text-base text-on-surface-variant max-w-xl leading-relaxed">
						End-to-end encrypted WebRTC burner rooms. Zero persistence, zero databases. All conversations live and die entirely in peer RAM.
					</p>

					<!-- Primary Action Trigger -->
					<div class="flex flex-wrap items-center gap-4 pt-2">
						<button
							type="button"
							class="inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-primary text-on-primary font-headline text-sm font-semibold hover:bg-primary-fixed glow-primary transition-all active:scale-[0.98] disabled:opacity-60 cursor-pointer shadow-md"
							onclick={handleCreateRoom}
							disabled={isCreating}
						>
							{#if isCreating}
								<span class="material-symbols-outlined text-lg animate-spin">refresh</span>
								<span>Creating Room...</span>
							{:else}
								<span class="material-symbols-outlined text-lg font-bold">add_circle</span>
								<span>Create Burner Room</span>
							{/if}
						</button>
					</div>
				</div>

				<!-- Direct Invite / Token Interactive Box -->
				<div class="p-6 rounded-2xl bg-surface-container-low border border-white/5 flex flex-col gap-4 z-10 shadow-sm">
					<div class="flex items-center justify-between">
						<div class="flex flex-col">
							<span class="font-headline text-sm text-on-surface font-semibold">Have an invite link or code?</span>
							<span class="font-code text-xs text-on-surface-variant">Paste full invite link or enter room hash</span>
						</div>
						<div class="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-highest font-code text-xs text-primary border border-primary/20">
							<span class="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
							<span>Instant Connect</span>
						</div>
					</div>

					<!-- Input & Connect Button Bar -->
					<div class="flex items-center gap-2">
						<div class="relative flex-1">
							<input
								type="text"
								bind:value={inviteInput}
								onkeydown={handleKeydown}
								placeholder="Paste room link or #room=...&key=..."
								class="w-full h-12 rounded-xl bg-surface-container px-4 pl-10 text-sm font-code text-on-surface placeholder:text-outline border border-white/5 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/60 transition-all"
							/>
							<span class="material-symbols-outlined absolute left-3 top-3 text-[20px] text-outline pointer-events-none">link</span>
						</div>

						<button
							type="button"
							class="h-12 px-6 rounded-xl bg-primary text-on-primary hover:bg-primary-fixed font-headline text-xs font-semibold tracking-wide uppercase transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center gap-1.5 shrink-0 cursor-pointer"
							onclick={handleJoinRoom}
							disabled={!inviteInput.trim() || isJoining}
						>
							{#if isJoining}
								<span class="material-symbols-outlined text-sm animate-spin">refresh</span>
								<span>Joining...</span>
							{:else}
								<span>Connect</span>
								<span class="material-symbols-outlined text-base">arrow_forward</span>
							{/if}
						</button>
					</div>

					{#if errorMessage}
						<div class="p-2.5 rounded-xl bg-error-container/30 border border-error/20 text-error text-xs font-body flex items-center gap-2">
							<span class="material-symbols-outlined text-base">error</span>
							<span>{errorMessage}</span>
						</div>
					{/if}

					<div class="flex items-center gap-2 text-on-surface-variant font-code text-[11px] pt-1">
						<span class="material-symbols-outlined text-primary text-[15px]">verified_user</span>
						<span>End-to-End Encrypted Group &amp; Media Channels</span>
					</div>
				</div>
			</div>

			<!-- Right Column: Recent Channels Panel (5 Cols) -->
			<div class="lg:col-span-5 flex flex-col justify-between p-8 rounded-3xl bg-surface-container-lowest/80 backdrop-blur-xl border border-white/10 shadow-2xl">
				<div class="flex flex-col gap-6">
					<div class="flex items-center justify-between pb-1">
						<div class="flex items-center gap-2">
							<span class="material-symbols-outlined text-primary text-xl">history</span>
							<h2 class="font-headline text-lg font-bold text-on-surface">Recent Spaces</h2>
						</div>

						{#if cotilla.recentRooms.length > 0}
							<button
								type="button"
								class="font-headline text-xs text-on-surface-variant hover:text-error transition-colors flex items-center gap-1 cursor-pointer"
								onclick={() => cotilla.clearRecentRooms()}
							>
								<span class="material-symbols-outlined text-sm">delete_sweep</span>
								<span>Clear</span>
							</button>
						{/if}
					</div>

					<!-- Channels List -->
					<div class="flex flex-col gap-3">
						{#each cotilla.recentRooms as r (r.roomID)}
							<div class="p-4 rounded-2xl bg-surface-container-low hover:bg-surface-container transition-all flex items-center justify-between group border border-white/5 shadow-sm">
								<div class="flex items-center gap-3.5 min-w-0">
									<div class="w-10 h-10 rounded-full bg-surface-container-high flex-shrink-0 flex items-center justify-center text-primary relative">
										<span class="material-symbols-outlined text-xl">meeting_room</span>
										<span class="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-primary ring-2 ring-surface-container-low"></span>
									</div>
									<div class="flex flex-col min-w-0">
										<div class="flex items-center gap-2">
											<span class="font-headline text-xs font-semibold text-on-surface truncate">{r.name}</span>
											<span class="px-1.5 py-0.2 rounded-md bg-surface-container-highest text-primary font-code text-[10px]">
												#{short(r.roomID)}
											</span>
										</div>
										<span class="font-code text-[11px] text-on-surface-variant mt-0.5">
											Burner Room
										</span>
									</div>
								</div>

								<button
									type="button"
									class="px-4 py-2 rounded-xl bg-surface-container-high group-hover:bg-primary group-hover:text-on-primary text-on-surface font-headline text-xs font-semibold transition-all flex items-center gap-1 shadow-sm active:scale-95 cursor-pointer shrink-0"
									onclick={() => handleRejoinRoom(r.link)}
								>
									<span>Rejoin</span>
									<span class="material-symbols-outlined text-sm">arrow_forward</span>
								</button>
							</div>
						{/each}

						{#if cotilla.recentRooms.length === 0}
							<div class="p-8 rounded-2xl bg-surface-container-low/50 border border-dashed border-white/5 flex flex-col items-center justify-center text-center gap-2">
								<div class="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center text-outline">
									<span class="material-symbols-outlined text-xl">history_toggle_off</span>
								</div>
								<span class="font-headline text-xs font-semibold text-on-surface">No recent spaces</span>
								<span class="font-body text-[11px] text-on-surface-variant max-w-[200px]">
									When you create or join burner rooms, they will show up here for quick re-entry.
								</span>
							</div>
						{/if}
					</div>
				</div>

				<div class="pt-6 border-t border-white/5 flex items-center justify-between text-on-surface-variant font-code text-xs">
					<div class="flex items-center gap-2">
						<span class="w-2 h-2 rounded-full {cotilla.connected ? 'bg-primary' : 'bg-outline'}"></span>
						<span>Mesh Node: {short(cotilla.me?.address)}</span>
					</div>
					<button
						type="button"
						class="text-primary hover:underline flex items-center gap-1 cursor-pointer"
						onclick={() => ui.openSettings()}
					>
						<span>Hardware Settings</span>
						<span class="material-symbols-outlined text-[14px]">tune</span>
					</button>
				</div>
			</div>
		</div>
	</main>

	<!-- Footer Strip -->
	<footer class="w-full max-w-7xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between text-outline font-code text-xs gap-3 z-20">
		<div class="flex items-center gap-4">
			<span>RESONATE EPHEMERAL</span>
			<span>•</span>
			<span>ZERO PERSISTENCE</span>
			<span>•</span>
			<span>FORWARD-SECRET P2P</span>
		</div>
		<div class="flex items-center gap-2 text-on-surface-variant">
			<span>Local Crypto Engine</span>
			<span class="w-1.5 h-1.5 rounded-full {cotilla.wasmReady ? 'bg-primary' : 'bg-warning'}"></span>
		</div>
	</footer>
</div>
