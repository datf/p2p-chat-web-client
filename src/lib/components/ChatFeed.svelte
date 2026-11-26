<script lang="ts">
	import { cotilla, formatTime, ui } from '#lib';
	import Icon from './ui/Icon.svelte';
	import SidebarToggleButton from './ui/SidebarToggleButton.svelte';

	let textInput = $state('');
	let fileInputElement = $state<HTMLInputElement | null>(null);
	let messagesContainer = $state<HTMLDivElement | null>(null);

	let activeSession = $derived(
		cotilla.sessions.get(cotilla.activeSessionId) || {
			id: 'main',
			name: 'Group Room',
			isDM: false,
			unreadCount: 0
		}
	);

	let messageList = $derived(cotilla.messages.get(cotilla.activeSessionId) || []);
	let composerLocked = $derived(cotilla.isEvicted && !activeSession.isDM);
	let isActiveDMCall = $derived(
		cotilla.callJoined &&
			cotilla.callIsDM &&
			!!activeSession.roomID &&
			cotilla.callScopeID === activeSession.roomID
	);
	let isActiveGroupCall = $derived(cotilla.callJoined && !cotilla.callIsDM && !activeSession.isDM);

	// Auto-scroll on new message
	$effect(() => {
		if (messageList.length && messagesContainer) {
			const timer = setTimeout(() => {
				if (messagesContainer) {
					messagesContainer.scrollTop = messagesContainer.scrollHeight;
				}
			}, 30);
			return () => clearTimeout(timer);
		}
	});

	function handleSend(e?: SubmitEvent) {
		if (e) e.preventDefault();
		if (composerLocked || !textInput.trim()) return;
		const ok = cotilla.sendMessage(textInput);
		if (ok) {
			textInput = '';
		}
	}

	function handleFileSelect(e: Event) {
		const target = e.target as HTMLInputElement;
		if (target.files && target.files.length > 0) {
			const file = target.files[0];
			void cotilla.sendAttachment(file);
			target.value = '';
		}
	}
</script>

<div class="flex flex-col w-full h-full min-w-0 bg-surface overflow-hidden relative">
	<!-- Sub-Header / Channel Context & Call Controls -->
	<div class="flex-none bg-surface-container-low px-3 sm:px-4 py-2 sm:py-2.5 border-b border-white/5 shadow-sm z-20">
		<div class="flex items-center justify-between gap-2 sm:gap-3">
			<div class="flex items-center gap-2 sm:gap-3 min-w-0">
				<SidebarToggleButton />
				<div class="flex items-center gap-1.5 text-on-surface min-w-0">
					<span class="font-headline text-lg text-primary font-bold shrink-0">
						{activeSession.isDM ? '@' : '#'}
					</span>
					<span class="font-headline text-base font-semibold tracking-tight truncate">
						{activeSession.name}
					</span>
				</div>
				<div class="h-4 w-px bg-surface-variant hidden md:block"></div>
				<span class="font-body text-xs text-on-surface-variant truncate max-w-xs hidden sm:inline">
					{activeSession.isDM
						? 'Zero-knowledge 1:1 direct channel with forward secrecy'
						: 'Ephemeral WebRTC burner room • No persistence'}
				</span>
			</div>

			<div class="flex items-center gap-2 flex-shrink-0">
				{#if isActiveDMCall || isActiveGroupCall}
					<button
						type="button"
						class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 transition-all font-headline text-xs font-semibold cursor-pointer active:scale-95"
						onclick={() => (ui.showCallStage = true)}
					>
						<Icon name="graphic_eq" class="text-[16px] animate-pulse" />
						<span class="hidden xs:inline">Return to Call</span>
					</button>
				{:else if activeSession.isDM}
					<button
						type="button"
						class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-on-primary hover:bg-primary-fixed transition-all font-headline text-xs font-semibold shadow-sm cursor-pointer active:scale-95"
						onclick={() => cotilla.joinDMCall(activeSession.id)}
					>
						<Icon name="call" class="text-[16px]" />
						<span>{cotilla.callJoined ? 'Switch to DM Call' : 'Call'}</span>
					</button>
				{/if}
			</div>
		</div>
	</div>

	{#if composerLocked}
		<div class="flex-none px-4 py-2 bg-error-container/40 border-b border-error/20 flex items-center justify-between gap-2 text-xs text-on-error-container">
			<div class="flex items-center gap-2">
				<Icon name="block" class="text-[16px] text-error" />
				<span>You have been evicted from the group channel. Group input is locked; 1:1 DMs remain isolated.</span>
			</div>
		</div>
	{/if}

	<!-- Messages Scroll Area -->
	<div
		bind:this={messagesContainer}
		class="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 py-2.5 sm:py-3 flex flex-col gap-3 relative"
	>
		<!-- Ephemeral End-to-End Encryption Notice (first message in chat) -->
		<div class="flex flex-col items-start gap-1 max-w-full">
			<div class="flex items-center gap-2 px-1 text-xs text-on-surface-variant">
				<Icon name="lock" class="text-primary text-[14px]" />
				<span class="font-headline font-semibold text-primary">System</span>
				<span class="font-code text-[10px] text-outline">E2EE</span>
			</div>
			<div class="px-3.5 sm:px-4 py-2.5 rounded-2xl w-full max-w-[96%] sm:max-w-[85%] md:max-w-[75%] rounded-tl-sm bg-surface-container-low border border-primary/20 text-xs text-on-surface-variant leading-relaxed shadow-sm">
				<span class="font-headline font-semibold text-primary block mb-0.5">Ephemeral End-to-End Encryption</span>
				Messages and media are end-to-end encrypted with ephemeral forward-secret keys. Zero persistence, zero server logs.
			</div>
		</div>

		{#each messageList as item (item.id)}
			<div class="flex flex-col items-start gap-1 max-w-full">
				<div class="flex items-center gap-2 px-1 text-xs text-on-surface-variant">
					<span class="font-headline font-semibold {item.mine ? 'text-primary' : 'text-on-surface'}">
						{item.mine ? 'You' : item.shortAuthor}
					</span>
					{#if item.type === 'attachment'}
						<span class="px-2 py-0.5 rounded-full text-[10px] font-code {item.isOffer ? 'bg-surface-container-highest text-secondary' : 'bg-primary/10 text-primary border border-primary/20'}">
							{item.isOffer ? 'Available' : 'SHA-256 Verified'}
						</span>
					{/if}
					<span class="font-code text-[10px] text-outline">{formatTime(item.ts)}</span>
				</div>

				{#if item.type === 'text'}
					<div
						class="px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-2xl rounded-tl-sm w-fit max-w-[96%] sm:max-w-[80%] md:max-w-[70%] break-words text-sm leading-relaxed shadow-sm {item.mine
							? 'bg-surface-container-high text-on-surface border-t border-r border-b border-white/5 border-l-4 border-l-primary'
							: 'bg-surface-container-low text-on-surface border border-white/5'}"
					>
						{item.text}
					</div>
				{:else}
					<div
						class="p-3 sm:p-3.5 rounded-2xl rounded-tl-sm bg-surface-container-low flex flex-col gap-2.5 w-full max-w-[96%] sm:w-auto sm:min-w-[260px] sm:max-w-sm shadow-md {item.mine
							? 'border-t border-r border-b border-white/10 border-l-4 border-l-primary'
							: 'border border-white/10'}"
					>
						<div class="flex items-center gap-3">
							<div class="w-10 h-10 rounded-xl bg-surface-container-highest flex items-center justify-center text-primary shrink-0">
								<Icon name="draft" class="text-2xl" />
							</div>
							<div class="flex flex-col min-w-0 flex-1">
								<span class="font-headline text-xs font-semibold text-on-surface truncate" title={item.name}>
									{item.name}
								</span>
								<span class="font-code text-[11px] text-on-surface-variant mt-0.5">
									{item.formattedSize}
								</span>
							</div>
						</div>

						{#if item.progress > 0 && item.progress < 100}
							<div class="flex flex-col gap-1 w-full">
								<div class="w-full bg-surface-container-highest h-1.5 rounded-full overflow-hidden">
									<div class="bg-primary h-full transition-all duration-200" style="width: {item.progress}%"></div>
								</div>
								<div class="flex justify-between text-[10px] font-code text-on-surface-variant">
									<span>Downloading chunks...</span>
									<span>{item.progress}% ({item.receivedChunks}/{item.totalChunks})</span>
								</div>
							</div>
						{/if}

						<div class="pt-1 flex justify-end">
							{#if item.isOffer && !item.mine && item.progress === 0}
								<button
									type="button"
									class="px-3.5 py-1.5 rounded-full bg-primary hover:bg-primary-fixed text-on-primary font-headline text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer"
									onclick={() => cotilla.startDownloadAttachment(item.fileID)}
								>
									<Icon name="download" class="text-[16px]" />
									<span>Download</span>
								</button>
							{:else if item.blobUrl}
								<a
									href={item.blobUrl}
									download={item.name}
									class="px-3.5 py-1.5 rounded-full bg-surface-container-highest hover:bg-surface-bright text-primary font-headline text-xs font-semibold flex items-center gap-1.5 border border-primary/30 transition-all active:scale-95"
								>
									<Icon name="save_alt" class="text-[16px]" />
									<span>Save File</span>
								</a>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		{/each}
	</div>

	<!-- Message Composer -->
	<div class="flex-none p-2.5 sm:p-3 bg-surface-container-low border-t border-white/5 z-20">
		<form onsubmit={handleSend} class="flex items-center gap-2">
			<input
				type="file"
				bind:this={fileInputElement}
				onchange={handleFileSelect}
				disabled={activeSession.isDM || composerLocked}
				class="hidden"
			/>

			<button
				type="button"
				disabled={activeSession.isDM || composerLocked}
				class="w-10 h-10 rounded-xl flex items-center justify-center transition-colors shrink-0 {activeSession.isDM || composerLocked
					? 'text-outline/40 cursor-not-allowed'
					: 'text-outline hover:text-primary hover:bg-surface-container-high cursor-pointer'}"
				onclick={() => fileInputElement?.click()}
				title={activeSession.isDM
					? 'File sharing is only supported in the Group Room'
					: 'Share File (Streamed On-Demand)'}
			>
				<Icon name="attach_file" class="text-xl" />
			</button>

			<input
				type="text"
				bind:value={textInput}
				disabled={composerLocked}
				placeholder={composerLocked
					? '🚫 Evicted from group channel'
					: activeSession.isDM
						? `Send private message to @${activeSession.name.replace('DM: ', '')}...`
						: 'Type an encrypted message...'}
				class="flex-1 min-w-0 h-10 px-4 rounded-xl bg-surface-container text-xs font-body text-on-surface placeholder:text-outline border border-white/5 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/60 transition-all disabled:opacity-50"
			/>

			<button
				type="submit"
				disabled={composerLocked || !textInput.trim()}
				class="w-10 h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary-fixed transition-all shrink-0 cursor-pointer shadow-sm active:scale-95"
				title="Send message"
			>
				<Icon name="send" class="text-lg" />
			</button>
		</form>
	</div>
</div>
