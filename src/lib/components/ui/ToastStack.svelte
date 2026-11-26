<script lang="ts">
	import { notifications } from '../../stores/notifications.svelte';

	function getKindClasses(kind: string): string {
		switch (kind) {
			case 'error':
				return 'bg-error-container text-on-error-container border-error/30';
			case 'success':
				return 'bg-surface-container-high text-primary border-primary/30';
			case 'info':
			default:
				return 'bg-surface-container-high text-on-surface border-white/10';
		}
	}

	function getKindIcon(kind: string): string {
		switch (kind) {
			case 'error':
				return 'error';
			case 'success':
				return 'check_circle';
			case 'info':
			default:
				return 'info';
		}
	}
</script>

{#if notifications.toasts.length > 0}
	<div
		class="fixed top-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
		aria-live="polite"
	>
		{#each notifications.toasts as toast (toast.id)}
			<div
				class="pointer-events-auto flex items-start gap-3 p-3.5 rounded-2xl border shadow-xl backdrop-blur-xl animate-slide-down transition-all {getKindClasses(toast.kind)}"
			>
				<span class="material-symbols-outlined text-[20px] shrink-0 mt-0.5">
					{getKindIcon(toast.kind)}
				</span>

				<div class="flex flex-col min-w-0 flex-1">
					{#if toast.title}
						<span class="font-headline text-xs font-bold leading-tight">
							{toast.title}
						</span>
					{/if}
					<span class="font-body text-xs leading-relaxed break-words">
						{toast.message}
					</span>
				</div>

				<button
					type="button"
					class="shrink-0 text-outline hover:text-on-surface p-0.5 rounded-lg transition-colors cursor-pointer"
					onclick={() => notifications.dismiss(toast.id)}
					aria-label="Dismiss notification"
				>
					<span class="material-symbols-outlined text-[16px]">close</span>
				</button>
			</div>
		{/each}
	</div>
{/if}
