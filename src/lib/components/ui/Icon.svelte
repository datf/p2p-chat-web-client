<script lang="ts">
	interface Props {
		name: string;
		class?: string;
	}

	let { name, class: customClass = '' }: Props = $props();
</script>

<span class="material-symbols-outlined select-none {customClass}" aria-hidden="true">{name}</span>
