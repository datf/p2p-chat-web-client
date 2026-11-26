<script lang="ts">
	import { onDestroy } from 'svelte';
	import { cotilla } from '../../cotilla.svelte';
	import { notifications } from '../../stores/notifications.svelte';
	import Icon from './Icon.svelte';

	interface Props {
		variant?: 'primary' | 'secondary' | 'ghost' | 'icon';
		size?: 'sm' | 'md' | 'lg';
		label?: string;
		class?: string;
	}

	let {
		variant = 'secondary',
		label = 'Invite',
		class: customClass = ''
	}: Props = $props();

	let copied = $state(false);
	let timer: ReturnType<typeof setTimeout> | null = null;

	onDestroy(() => {
		if (timer) clearTimeout(timer);
	});

	async function handleCopy() {
		const ok = await cotilla.copyInviteLink();
		if (ok) {
			copied = true;
			notifications.notifySuccess('Invite link copied to clipboard');
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => {
				copied = false;
			}, 2000);
		} else if (!cotilla.isEvicted) {
			notifications.notifyError('Failed to copy invite link to clipboard');
		}
	}
</script>

<button
	type="button"
	class="inline-flex items-center justify-center gap-1.5 font-headline font-semibold transition-all cursor-pointer select-none active:scale-95 {variant === 'icon' ? 'p-2 rounded-full bg-surface-container-high text-on-surface hover:bg-surface-bright' : variant === 'primary' ? 'h-8 px-3 rounded-xl bg-primary text-on-primary hover:bg-primary-fixed text-xs' : 'h-8 px-3 rounded-xl bg-surface-container-high text-on-surface hover:bg-surface-bright text-xs'} {customClass}"
	onclick={handleCopy}
	title="Copy Burner Room Invite Link"
>
	<Icon name={copied ? 'check' : 'share'} class="text-[16px] {copied ? 'text-primary' : ''}" />
	{#if variant !== 'icon'}
		<span>{copied ? 'Copied' : label}</span>
	{/if}
</button>
