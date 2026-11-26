export async function copyTextToClipboard(text: string): Promise<boolean> {
	if (typeof window === 'undefined') return false;

	const nav = (typeof navigator !== 'undefined' ? navigator : null) || (window as any).navigator;
	if (nav?.clipboard && typeof nav.clipboard.writeText === 'function') {
		try {
			await nav.clipboard.writeText(text);
			return true;
		} catch (err) {
			console.warn('navigator.clipboard.writeText failed, falling back', err);
		}
	}

	if (typeof document !== 'undefined') {
		try {
			const textarea = document.createElement('textarea');
			textarea.value = text;
			textarea.style.position = 'fixed';
			textarea.style.opacity = '0';
			textarea.style.pointerEvents = 'none';
			document.body.appendChild(textarea);
			textarea.focus();
			textarea.select();
			const ok = document.execCommand('copy');
			document.body.removeChild(textarea);
			return ok;
		} catch (e) {
			console.error('Failed to copy to clipboard', e);
			return false;
		}
	}

	return false;
}
