import { SvelteMap } from 'svelte/reactivity';
import type {
	AttachmentItem,
	ChatMessage,
	DMInvitePayload,
	SessionTab,
	TimelineItem
} from '../types';
import { formatBytes, normalizeAttachmentMeta, short } from '../utils/format';

/** Owns Group & 1:1 DM chat timelines, unread counts, attachments, and deduplication registries. */
export class ChatStore {
	sessions = new SvelteMap<string, SessionTab>();
	activeSessionId = $state('main');
	messages = new SvelteMap<string, TimelineItem[]>();
	pendingDMInvite = $state<DMInvitePayload | null>(null);

	seenAttachments = new Set<string>();
	seenMessageKeys = new Set<string>();
	blobUrls = new Set<string>();

	constructor() {
		this.initSession('main', 'Group Room', false);
	}

	initSession(id: string, name: string, isDM: boolean, peerAddr?: string, roomID?: string, roomKey?: string) {
		this.sessions.set(id, { id, name, isDM, peerAddr, roomID, roomKey, unreadCount: 0 });
		if (!this.messages.has(id)) {
			this.messages.set(id, []);
		}
	}

	ensureDMSession(peerAddr: string, roomID: string, roomKey?: string): SessionTab {
		const existing = this.sessions.get(peerAddr);
		if (!existing) {
			const tab: SessionTab = {
				id: peerAddr,
				name: `DM: ${short(peerAddr)}`,
				isDM: true,
				peerAddr,
				roomID,
				roomKey,
				unreadCount: 0
			};
			this.sessions.set(peerAddr, tab);
			if (!this.messages.has(peerAddr)) {
				this.messages.set(peerAddr, []);
			}
			return tab;
		}

		const next: SessionTab = {
			...existing,
			peerAddr: existing.peerAddr || peerAddr,
			roomID: roomID || existing.roomID,
			roomKey: roomKey || existing.roomKey
		};
		this.sessions.set(peerAddr, next);
		return next;
	}

	findSessionByRoomID(roomID: string): SessionTab | undefined {
		if (!roomID) return undefined;
		for (const sess of this.sessions.values()) {
			if (sess.isDM && sess.roomID === roomID) {
				return sess;
			}
		}
		return undefined;
	}

	switchSession(id: string) {
		this.activeSessionId = id;
		const tab = this.sessions.get(id);
		if (tab && tab.unreadCount > 0) {
			this.sessions.set(id, { ...tab, unreadCount: 0 });
		}
	}

	closeSession(id: string) {
		if (id === 'main') return;
		this.sessions.delete(id);
		if (this.activeSessionId === id) {
			this.activeSessionId = 'main';
		}
	}

	appendChatMessage(msg: ChatMessage) {
		const targetSession = msg.scopeID || 'main';
		if (!this.messages.has(targetSession)) {
			this.messages.set(targetSession, []);
		}
		const list = this.messages.get(targetSession)!;
		this.messages.set(targetSession, [...list, msg]);

		if (targetSession !== this.activeSessionId) {
			const tab = this.sessions.get(targetSession);
			if (tab) {
				this.sessions.set(targetSession, { ...tab, unreadCount: tab.unreadCount + 1 });
			}
		}
	}

	appendSystemMessage(scopeID: string, text: string) {
		this.appendChatMessage({
			id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
			type: 'text',
			author: 'system',
			shortAuthor: 'System',
			text,
			ts: Date.now(),
			mine: false,
			scopeID
		});
	}

	trackBlobUrl(bytesOrData: Uint8Array | ArrayBuffer, mimeType: string): string {
		const blob = new Blob([bytesOrData as BlobPart], { type: mimeType });
		const url = URL.createObjectURL(blob);
		this.blobUrls.add(url);
		return url;
	}

	appendAttachmentOffer(meta: any, mine: boolean, myAddr?: string) {
		const norm = normalizeAttachmentMeta(meta, mine ? myAddr || 'You' : 'Peer');
		if (!norm || this.seenAttachments.has(norm.fileID)) return;
		this.seenAttachments.add(norm.fileID);

		const item: AttachmentItem = {
			id: `attach-${norm.fileID}`,
			type: 'attachment',
			fileID: norm.fileID,
			name: norm.name,
			size: norm.size,
			formattedSize: formatBytes(norm.size),
			mimeType: norm.mimeType,
			author: norm.author,
			shortAuthor: short(norm.author),
			ts: norm.timestamp,
			mine,
			isOffer: !mine,
			progress: 0,
			receivedChunks: 0,
			totalChunks: norm.totalChunks,
			scopeID: 'main'
		};

		if (!this.messages.has('main')) {
			this.messages.set('main', []);
		}
		const list = this.messages.get('main')!;
		this.messages.set('main', [...list, item]);
	}

	updateAttachmentItem(fileID: string, updater: (item: AttachmentItem) => AttachmentItem) {
		for (const [sess, list] of this.messages.entries()) {
			const idx = list.findIndex((m) => m.type === 'attachment' && m.fileID === fileID);
			if (idx !== -1) {
				const current = list[idx] as AttachmentItem;
				const updated = [...list];
				updated[idx] = updater(current);
				this.messages.set(sess, updated);
				break;
			}
		}
	}

	updateAttachmentProgress(fileID: string, received: number, total: number) {
		this.updateAttachmentItem(fileID, (item) => ({
			...item,
			receivedChunks: received,
			totalChunks: total,
			progress: Math.min(100, Math.round((received / Math.max(1, total)) * 100))
		}));
	}

	handleAttachmentCompleted(metaOrNorm: any, bytes?: Uint8Array | ArrayBuffer | null) {
		const norm = normalizeAttachmentMeta(metaOrNorm);
		if (!norm) return;

		let blobUrl = '';
		if (bytes instanceof Uint8Array || bytes instanceof ArrayBuffer) {
			blobUrl = this.trackBlobUrl(bytes, norm.mimeType);
		}

		this.updateAttachmentItem(norm.fileID, (item) => ({
			...item,
			blobUrl: blobUrl || item.blobUrl,
			isOffer: false,
			progress: 100
		}));
	}

	resetForLeave() {
		for (const url of this.blobUrls) {
			try {
				URL.revokeObjectURL(url);
			} catch {}
		}
		this.blobUrls.clear();
		this.seenAttachments.clear();
		this.seenMessageKeys.clear();
		this.pendingDMInvite = null;
		this.activeSessionId = 'main';
		this.sessions.clear();
		this.messages.clear();
		this.initSession('main', 'Group Room', false);
	}
}
