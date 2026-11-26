<script lang="ts">
	import Modal from './Modal.svelte';
	import Button from './Button.svelte';

	interface Props {
		open: boolean;
		title: string;
		message: string;
		icon?: string;
		confirmLabel?: string;
		confirmVariant?: 'primary' | 'danger';
		inputPlaceholder?: string;
		initialInputValue?: string;
		showInput?: boolean;
		onconfirm: (inputValue?: string) => void;
		oncancel: () => void;
	}

	let {
		open,
		title,
		message,
		icon = 'warning',
		confirmLabel = 'Confirm',
		confirmVariant = 'primary',
		inputPlaceholder = '',
		initialInputValue = '',
		showInput = false,
		onconfirm,
		oncancel
	}: Props = $props();

	let inputValue = $state('');

	$effect(() => {
		if (open) {
			inputValue = initialInputValue;
		}
	});

	function handleConfirm() {
		onconfirm(showInput ? inputValue : undefined);
	}
</script>

<Modal {open} {title} {icon} onclose={oncancel}>
	<div class="flex flex-col gap-4 py-2">
		<p class="font-body text-xs text-on-surface-variant leading-relaxed">
			{message}
		</p>

		{#if showInput}
			<input
				type="text"
				bind:value={inputValue}
				placeholder={inputPlaceholder}
				class="w-full h-10 rounded-xl bg-surface-container px-3 text-xs font-body text-on-surface placeholder:text-outline border border-white/5 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/60"
				onkeydown={(e) => {
					if (e.key === 'Enter') handleConfirm();
				}}
			/>
		{/if}
	</div>

	{#snippet footer()}
		<Button variant="ghost" size="sm" onclick={oncancel}>
			Cancel
		</Button>
		<Button variant={confirmVariant} size="sm" onclick={handleConfirm}>
			{confirmLabel}
		</Button>
	{/snippet}
</Modal>
