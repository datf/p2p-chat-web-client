<script lang="ts">
	import { page } from '$app/state';
	import Button from '#lib/components/ui/Button.svelte';
</script>

<div class="w-full min-h-screen bg-surface flex flex-col items-center justify-center p-6 text-center select-none">
	<div class="w-16 h-16 rounded-3xl bg-surface-container-high flex items-center justify-center text-error mb-4 shadow-xl">
		<span class="material-symbols-outlined text-4xl">error</span>
	</div>

	<h1 class="font-headline text-2xl font-bold text-on-surface mb-2">
		{page.status || 404} — Page Not Found
	</h1>

	<p class="font-body text-xs text-on-surface-variant max-w-sm mb-6 leading-relaxed">
		The burner room or requested view does not exist or has expired.
	</p>

	<a href="/">
		<Button variant="primary" size="md" icon="arrow_back">
			Return to Resonate
		</Button>
	</a>
</div>
