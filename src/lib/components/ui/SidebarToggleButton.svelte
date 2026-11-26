<script lang="ts">
	import { ui } from '#lib';
	import Icon from './Icon.svelte';

	interface Props {
		title?: string;
	}

	let { title = 'Open Channels & Peers' }: Props = $props();
</script>

<button
	type="button"
	class="md:hidden w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer shrink-0 active:scale-95"
	onclick={() => ui.openMobileSidebar()}
	aria-label={title}
	aria-expanded={ui.mobileSidebarOpen}
	{title}
>
	<Icon name="arrow_back" class="text-[20px]" />
</button>
