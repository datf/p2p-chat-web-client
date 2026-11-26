<script lang="ts">
	import { cotilla, ui } from '#lib';
	import ConfirmDialog from './ui/ConfirmDialog.svelte';

	function handleConfirm() {
		ui.closeLeaveConfirm();
		cotilla.leaveRoom();
	}

	function handleCancel() {
		ui.closeLeaveConfirm();
	}
</script>

<ConfirmDialog
	open={ui.leaveConfirmOpen}
	title="Leave Room?"
	icon="logout"
	message="Are you sure you want to leave this burner room? All cryptographic keys and messages stored in local RAM will be cleared."
	confirmLabel="Leave Room"
	confirmVariant="danger"
	onconfirm={handleConfirm}
	oncancel={handleCancel}
/>
