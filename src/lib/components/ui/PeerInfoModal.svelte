<script lang="ts">
	import Modal from './Modal.svelte';
	import Button from './Button.svelte';
	import { copyTextToClipboard } from '../../platform/clipboard';
	import { notifications } from '../../stores/notifications.svelte';

	interface Props {
		open: boolean;
		peer: string;
		shortAddr: string;
		isDirect: boolean;
		invitedBy?: string;
		latencyMs?: number;
		onclose: () => void;
	}

	let {
		open,
		peer,
		shortAddr,
		isDirect,
		invitedBy,
		latencyMs = 18,
		onclose
	}: Props = $props();

	let copied = $state(false);

	async function handleCopy() {
		const ok = await copyTextToClipboard(peer);
		if (ok) {
			copied = true;
			notifications.notifySuccess('Public key copied to clipboard');
			setTimeout(() => {
				copied = false;
			}, 2000);
		}
	}
</script>

<Modal {open} title={`Peer Details — ${shortAddr}`} icon="badge" onclose={onclose}>
	<div class="flex flex-col gap-4 py-2">
		<!-- Public Key Box -->
		<div class="flex flex-col gap-1.5 p-3 rounded-2xl bg-surface-container border border-white/5">
			<span class="font-headline text-[11px] text-outline font-semibold uppercase tracking-wider">
				Ed25519 Identity Key
			</span>
			<span class="font-code text-xs text-on-surface break-all select-all">
				{peer}
			</span>
		</div>

		<!-- Status Grid -->
		<div class="grid grid-cols-2 gap-2 text-xs">
			<div class="p-3 rounded-2xl bg-surface-container-high/60 border border-white/5 flex flex-col gap-1">
				<span class="text-[10px] text-outline font-headline font-semibold uppercase tracking-wider">
					Connection Path
				</span>
				<div class="flex items-center gap-1.5">
					<span class="w-2 h-2 rounded-full {isDirect ? 'bg-primary' : 'bg-secondary'}"></span>
					<span class="font-headline font-bold text-on-surface">
						{isDirect ? 'Direct P2P' : 'Relayed Mesh'}
					</span>
				</div>
			</div>

			<div class="p-3 rounded-2xl bg-surface-container-high/60 border border-white/5 flex flex-col gap-1">
				<span class="text-[10px] text-outline font-headline font-semibold uppercase tracking-wider">
					Latency
				</span>
				<span class="font-code font-bold text-on-surface">
					~{latencyMs}ms
				</span>
			</div>
		</div>

		{#if invitedBy}
			<div class="p-3 rounded-2xl bg-surface-container border border-white/5 flex flex-col gap-1">
				<span class="text-[10px] text-outline font-headline font-semibold uppercase tracking-wider">
					Invited By
				</span>
				<span class="font-code text-xs text-on-surface-variant break-all">
					{invitedBy}
				</span>
			</div>
		{/if}
	</div>

	{#snippet footer()}
		<Button variant="secondary" size="sm" icon={copied ? 'check' : 'content_copy'} onclick={handleCopy}>
			{copied ? 'Copied' : 'Copy Key'}
		</Button>
		<Button variant="primary" size="sm" onclick={onclose}>
			Done
		</Button>
	{/snippet}
</Modal>
