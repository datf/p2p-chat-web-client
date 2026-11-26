import type { ToastItem, ToastKind } from '../types';
import { formatError } from '../utils/format';

class NotificationStore {
	toasts = $state<ToastItem[]>([]);

	notify(kind: ToastKind, message: string, title?: string): string {
		const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
		const toast: ToastItem = { id, kind, message, title };
		this.toasts = [...this.toasts, toast];

		const ttl = kind === 'error' ? 6000 : 4000;
		setTimeout(() => {
			this.dismiss(id);
		}, ttl);

		return id;
	}

	notifyError(err: unknown, title = 'Error'): string {
		const message = formatError(err);
		return this.notify('error', message, title);
	}

	notifyInfo(message: string, title?: string): string {
		return this.notify('info', message, title);
	}

	notifySuccess(message: string, title?: string): string {
		return this.notify('success', message, title);
	}

	dismiss(id: string): void {
		this.toasts = this.toasts.filter((t) => t.id !== id);
	}

	clear(): void {
		this.toasts = [];
	}
}

export const notifications = new NotificationStore();
