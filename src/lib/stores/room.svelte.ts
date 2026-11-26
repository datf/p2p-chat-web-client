import { SvelteMap } from 'svelte/reactivity';
import type { PeerInfo, RecentRoom } from '../types';
import { short } from '../utils/format';
import {
	loadRecentRooms,
	saveRecentRooms,
	clearRecentRoomsStorage
} from '../platform/storage';

/** Owns room identity, signaling status, peer mesh roster, epoch, and session-scoped recent rooms. */
export class RoomStore {
	inRoom = $state(false);
	connected = $state(false);
	statusText = $state('Disconnected');
	signalingRole = $state<string | null>(null);

	me = $state<{ address: string } | null>(null);
	roomID = $state<string | null>(null);
	roomKey = $state<string | null>(null);
	isCreator = $state(false);
	isEvicted = $state(false);
	activeEpoch = $state(0);

	peers = new SvelteMap<string, PeerInfo>();
	peerCount = $state(0);
	directPeerCount = $state(0);
	overlayPeerCount = $state(0);
	latencyMs = $state(18);

	recentRooms = $state<RecentRoom[]>([]);
	currentRoomHash = $state<string>('');

	constructor() {
		this.recentRooms = loadRecentRooms();
	}

	startSession(ev: { roomID: string; roomKey: string; isCreator?: boolean; me?: { address: string } | null; epoch?: number }) {
		this.inRoom = true;
		this.roomID = ev.roomID;
		this.roomKey = ev.roomKey;
		this.isCreator = !!ev.isCreator;
		this.me = ev.me || null;
		this.isEvicted = false;
		this.activeEpoch = typeof ev.epoch === 'number' ? ev.epoch : ev.isCreator ? 1 : 0;
	}

	setCurrentRoomHash(hash: string) {
		this.currentRoomHash = hash.startsWith('#') ? hash : `#${hash}`;
	}

	addRecentRoom(roomID: string, roomKey: string, inviteHash?: string) {
		const link = inviteHash || this.currentRoomHash || `#room=${encodeURIComponent(roomID)}&key=${encodeURIComponent(roomKey)}`;
		const entry: RecentRoom = {
			roomID,
			roomKey,
			name: `Room #${short(roomID)}`,
			link,
			joinedAt: Date.now()
		};
		const filtered = this.recentRooms.filter((r) => r.roomID !== roomID);
		this.recentRooms = [entry, ...filtered].slice(0, 8);
		saveRecentRooms(this.recentRooms);
	}

	clearRecentRooms() {
		this.recentRooms = [];
		clearRecentRoomsStorage();
	}

	updatePeers(
		ev: { peers?: Set<string>; directPeers?: Set<string>; overlayPeers?: Set<string> },
		onPeerRemoved?: (addr: string) => void
	) {
		const rawPeers: Set<string> = ev?.peers || new Set();
		const directPeers: Set<string> = ev?.directPeers || new Set();
		const overlayPeers: Set<string> = ev?.overlayPeers || new Set();

		const myAddr = this.me?.address;
		let count = 0;
		let directCount = 0;
		const currentAddrs = new Set<string>();

		for (const addr of rawPeers) {
			if (myAddr && addr === myAddr) continue;
			currentAddrs.add(addr);
			count++;
			const isDirect = directPeers.has(addr);
			if (isDirect) directCount++;

			const existing = this.peers.get(addr);
			if (!existing) {
				this.peers.set(addr, {
					address: addr,
					shortAddress: short(addr),
					isDirect,
					isSpeaking: false,
					hasAudio: false,
					hasVideo: false,
					latencyMs: 18
				});
			} else if (existing.isDirect !== isDirect) {
				this.peers.set(addr, { ...existing, isDirect });
			}
		}

		this.peerCount = count;
		this.directPeerCount = directCount;
		this.overlayPeerCount = overlayPeers.size;

		for (const addr of Array.from(this.peers.keys())) {
			if (!currentAddrs.has(addr)) {
				this.peers.delete(addr);
				onPeerRemoved?.(addr);
			}
		}
	}

	removePeer(addr: string) {
		this.peers.delete(addr);
		this.peerCount = this.peers.size;
		let directCount = 0;
		for (const p of this.peers.values()) {
			if (p.isDirect) directCount++;
		}
		this.directPeerCount = directCount;
	}

	resetForLeave() {
		this.inRoom = false;
		this.roomID = null;
		this.roomKey = null;
		this.isCreator = false;
		this.isEvicted = false;
		this.me = null;
		this.activeEpoch = 0;
		this.currentRoomHash = '';
		this.peers.clear();
		this.peerCount = 0;
		this.directPeerCount = 0;
		this.overlayPeerCount = 0;
	}
}
