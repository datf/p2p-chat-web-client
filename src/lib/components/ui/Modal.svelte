<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	interface Props {
		open: boolean;
		title?: string;
		icon?: string;
		maxWidth?: string;
		noPadding?: boolean;
		onclose: () => void;
		header?: Snippet;
		children?: Snippet;
		footer?: Snippet;
	}

	let {
		open,
		title,
		icon,
		maxWidth = 'max-w-md',
		noPadding = false,
		onclose,
		header,
		children,
		footer
	}: Props = $props();

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) {
			e.preventDefault();
			onclose();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim/70 backdrop-blur-md animate-fade-in"
		role="dialog"
		aria-modal="true"
	>
		<!-- Backdrop click interceptor -->
		<button
			type="button"
			class="absolute inset-0 w-full h-full cursor-default bg-transparent border-0"
			onclick={onclose}
			aria-label="Close modal backdrop"
			tabindex="-1"
		></button>

		<!-- Modal Container -->
		<div
			class="relative w-full {maxWidth} max-h-[90dvh] bg-surface-container-low border border-white/10 rounded-3xl {noPadding ? '' : 'p-6 flex flex-col gap-5'} shadow-2xl z-10 overflow-hidden"
		>
			{#if !noPadding}
				<!-- Header -->
				{#if header}
					{@render header()}
				{:else if title || icon}
					<div class="flex items-center justify-between shrink-0">
						<div class="flex items-center gap-3">
							{#if icon}
								<div class="w-10 h-10 rounded-2xl bg-surface-container-high flex items-center justify-center text-primary">
									<Icon name={icon} class="text-[22px]" />
								</div>
							{/if}
							<div class="flex flex-col">
								<h3 class="font-headline text-base font-bold text-on-surface">{title}</h3>
							</div>
						</div>

						<button
							type="button"
							class="w-8 h-8 rounded-full flex items-center justify-center text-outline hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
							onclick={onclose}
							aria-label="Close"
						>
							<Icon name="close" class="text-[18px]" />
						</button>
					</div>
				{/if}

				<!-- Body -->
				{#if children}
					<div class="flex flex-col min-h-0 overflow-y-auto">
						{@render children()}
					</div>
				{/if}

				<!-- Footer -->
				{#if footer}
					<div class="flex items-center justify-end gap-3 pt-2 border-t border-white/5 shrink-0">
						{@render footer()}
					</div>
				{/if}
			{:else if children}
				{@render children()}
			{/if}
		</div>
	</div>
{/if}
