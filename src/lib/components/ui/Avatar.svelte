<script lang="ts">
	import Icon from './Icon.svelte';

	interface Props {
		name?: string;
		size?: 'sm' | 'md' | 'lg' | 'xl';
		isSpeaking?: boolean;
		showStatus?: boolean;
		isDirect?: boolean;
		isLocal?: boolean;
		icon?: string;
	}

	let {
		name = '',
		size = 'md',
		isSpeaking = false,
		showStatus = false,
		isDirect = true,
		isLocal = false,
		icon = 'person'
	}: Props = $props();

	let sizeClasses = $derived.by(() => {
		switch (size) {
			case 'sm':
				return 'w-6 h-6 text-[14px]';
			case 'lg':
				return 'w-10 h-10 text-[20px]';
			case 'xl':
				return 'w-16 h-16 text-[32px]';
			case 'md':
			default:
				return 'w-8 h-8 text-[18px]';
		}
	});

	let bgClasses = $derived(
		isLocal ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface'
	);
</script>

<div class="relative shrink-0 flex items-center justify-center">
	<div
		class="rounded-full flex items-center justify-center font-headline font-bold transition-all select-none {sizeClasses} {bgClasses} {isSpeaking ? 'glow-speaking ring-2 ring-primary' : ''}"
		title={name}
	>
		<Icon name={icon} class="text-inherit!" />
	</div>

	{#if showStatus}
		<span
			class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-surface {isDirect ? 'bg-primary' : 'bg-secondary'}"
			title={isDirect ? 'Direct peer connection' : 'Relayed peer connection'}
		></span>
	{/if}
</div>
