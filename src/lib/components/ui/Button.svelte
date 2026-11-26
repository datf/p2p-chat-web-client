<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon';
	type ButtonSize = 'sm' | 'md' | 'lg';

	interface Props {
		type?: 'button' | 'submit' | 'reset';
		variant?: ButtonVariant;
		size?: ButtonSize;
		disabled?: boolean;
		loading?: boolean;
		icon?: string;
		title?: string;
		class?: string;
		onclick?: (e: MouseEvent) => void;
		children?: Snippet;
	}

	let {
		type = 'button',
		variant = 'primary',
		size = 'md',
		disabled = false,
		loading = false,
		icon,
		title,
		class: customClass = '',
		onclick,
		children
	}: Props = $props();

	let variantClasses = $derived.by(() => {
		switch (variant) {
			case 'primary':
				return 'bg-primary text-on-primary hover:bg-primary-fixed shadow-md active:scale-95 disabled:opacity-50';
			case 'secondary':
				return 'bg-surface-container-high text-on-surface hover:bg-surface-bright active:scale-95 disabled:opacity-50';
			case 'ghost':
				return 'bg-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high active:scale-95 disabled:opacity-50';
			case 'danger':
				return 'bg-error-container text-on-error-container hover:bg-error hover:text-on-error active:scale-95 disabled:opacity-50';
			case 'icon':
				return 'bg-surface-container-high text-on-surface hover:bg-surface-bright active:scale-95 disabled:opacity-50 p-2 rounded-full';
			default:
				return '';
		}
	});

	let sizeClasses = $derived.by(() => {
		if (variant === 'icon') return '';
		switch (size) {
			case 'sm':
				return 'h-8 px-3 text-xs rounded-xl';
			case 'lg':
				return 'h-12 px-6 text-sm rounded-2xl';
			case 'md':
			default:
				return 'h-10 px-4 text-xs rounded-xl';
		}
	});
</script>

<button
	{type}
	{disabled}
	{title}
	class="inline-flex items-center justify-center gap-2 font-headline font-semibold transition-all cursor-pointer disabled:cursor-not-allowed select-none {variantClasses} {sizeClasses} {customClass}"
	{onclick}
>
	{#if loading}
		<Icon name="refresh" class="text-[16px] animate-spin" />
	{:else if icon}
		<Icon name={icon} class="text-[18px]" />
	{/if}

	{#if children}
		{@render children()}
	{/if}
</button>
