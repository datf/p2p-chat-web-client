import type { LayoutMode } from '../types';

export interface EvictTarget {
	peer: string;
	shortAddr: string;
}

export interface PeerInfoTarget {
	peer: string;
	shortAddr: string;
	isDirect: boolean;
	invitedBy?: string;
	latencyMs?: number;
}

export interface PeerContextMenuTarget {
	peerAddr: string;
	shortAddr: string;
	isLocal?: boolean;
	isCallParticipant?: boolean;
	isDirect?: boolean;
	invitedBy?: string;
	latencyMs?: number;
	isScreen?: boolean;
	viewId?: string;
	title?: string;
	x: number;
	y: number;
}

/** Manages modal dialogs, stage vs split call layout mode, mobile sidebar drawer, and fullscreen. */
class UIStore {
	settingsOpen = $state(false);
	leaveConfirmOpen = $state(false);
	evictionNoticeOpen = $state(false);
	evictTarget = $state<EvictTarget | null>(null);
	peerInfoTarget = $state<PeerInfoTarget | null>(null);
	showCallStage = $state(false);
	pinnedViewId = $state<string | null>(null);
	layoutMode = $state<LayoutMode>('stage');
	mobileSidebarOpen = $state(false);
	isFullscreen = $state(false);
	peerContextMenu = $state<PeerContextMenuTarget | null>(null);

	openPeerContextMenu(target: PeerContextMenuTarget) {
		this.peerContextMenu = target;
	}

	closePeerContextMenu() {
		this.peerContextMenu = null;
	}

	openMobileSidebar() {
		this.mobileSidebarOpen = true;
	}

	closeMobileSidebar() {
		this.mobileSidebarOpen = false;
	}

	toggleMobileSidebar() {
		this.mobileSidebarOpen = !this.mobileSidebarOpen;
	}

	setFullscreen(val: boolean) {
		this.isFullscreen = val;
	}

	toggleFullscreen() {
		if (typeof document === 'undefined') return;
		if (!document.fullscreenElement) {
			document.documentElement.requestFullscreen().catch(() => {});
		} else {
			document.exitFullscreen().catch(() => {});
		}
	}

	exitFullscreen() {
		if (typeof document !== 'undefined' && document.fullscreenElement) {
			document.exitFullscreen().catch(() => {});
		}
		this.isFullscreen = false;
	}

	openSettings() {
		this.settingsOpen = true;
	}

	closeSettings() {
		this.settingsOpen = false;
	}

	openLeaveConfirm() {
		this.leaveConfirmOpen = true;
	}

	closeLeaveConfirm() {
		this.leaveConfirmOpen = false;
	}

	openEvictionNotice() {
		this.evictionNoticeOpen = true;
	}

	closeEvictionNotice() {
		this.evictionNoticeOpen = false;
	}

	openEvictDialog(peer: string, shortAddr: string) {
		this.evictTarget = { peer, shortAddr };
	}

	closeEvictDialog() {
		this.evictTarget = null;
	}

	openPeerInfoDialog(info: PeerInfoTarget) {
		this.peerInfoTarget = info;
	}

	closePeerInfoDialog() {
		this.peerInfoTarget = null;
	}

	togglePin(viewId: string) {
		this.pinnedViewId = this.pinnedViewId === viewId ? null : viewId;
	}

	clearPin() {
		this.pinnedViewId = null;
	}

	resetForRoomLeave() {
		this.leaveConfirmOpen = false;
		this.evictionNoticeOpen = false;
		this.evictTarget = null;
		this.peerInfoTarget = null;
		this.showCallStage = false;
		this.pinnedViewId = null;
		this.mobileSidebarOpen = false;
		this.peerContextMenu = null;
		this.exitFullscreen();
	}
}

export const ui = new UIStore();
