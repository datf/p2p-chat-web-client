<script lang="ts">
	import { cotilla, short } from '#lib';
	import Modal from './ui/Modal.svelte';
	import Button from './ui/Button.svelte';
</script>

<Modal
	open={!!cotilla.pendingDMInvite}
	title="1:1 Direct Message Invite"
	icon="forum"
	onclose={() => cotilla.respondDM(false)}
>
	<div class="flex flex-col gap-2 py-2">
		<p class="font-body text-xs text-on-surface-variant leading-relaxed">
			Peer <strong class="text-on-surface font-code">{short(cotilla.pendingDMInvite?.from)}</strong> invited you to an isolated, 2-peer encrypted session.
		</p>
	</div>

	{#snippet footer()}
		<Button variant="ghost" size="sm" onclick={() => cotilla.respondDM(false)}>
			Decline
		</Button>
		<Button variant="primary" size="sm" onclick={() => cotilla.respondDM(true)}>
			Accept &amp; Join
		</Button>
	{/snippet}
</Modal>
