import type {
	ChatMessage,
	EchoCancellationMode,
	NoiseSuppressionMode,
	PeerInfo
} from './types';
import { formatError, normalizeAttachmentMeta, parseInviteInput, short } from './utils/format';
import { resolveSignalingUrl, saveSignalingUrl } from './platform/storage';
import { copyTextToClipboard } from './platform/clipboard';
import { type DeviceList } from './platform/mediaDevices';
import { notifications } from './stores/notifications.svelte';
import { ui } from './stores/ui.svelte';
import { RoomStore } from './stores/room.svelte';
import { ChatStore } from './stores/chat.svelte';
import { CallStore, type CallTarget } from './stores/calls.svelte';
import { DeviceStore } from './stores/devices.svelte';

export { short };

/**
 * Coordinates the CotillaClient bridge, lifecycle, and focused reactive domain stores
 * (`room`, `chat`, `calls`, `devices`) for the Svelte UI.
 */
export class CotillaStore {
	readonly room = new RoomStore();
	readonly chat = new ChatStore();
	readonly calls = new CallStore();
	readonly devices = new DeviceStore();

	initialized = $state(false);
	wasmLoading = $state(false);
	wasmReady = $state(false);
	latencyMs = $state(18);
	client: any = null;

	private hashChangeHandler: (() => void) | null = null;
	private initPromise: Promise<void> | null = null;

	constructor() {
		this.calls.setStatusCallback((status) => {
			this.devices.audioProcessorStatus = status;
		});
	}

	// ---- Focused Read Accessors ----
	get inRoom() { return this.room.inRoom; }
	get connected() { return this.room.connected; }
	get statusText() { return this.room.statusText; }
	get me() { return this.room.me; }
	get roomID() { return this.room.roomID; }
	get roomKey() { return this.room.roomKey; }
	get isCreator() { return this.room.isCreator; }
	get isEvicted() { return this.room.isEvicted; }
	get activeEpoch() { return this.room.activeEpoch; }
	get peers() { return this.room.peers; }
	get peerCount() { return this.room.peerCount; }
	get directPeerCount() { return this.room.directPeerCount; }
	get overlayPeerCount() { return this.room.overlayPeerCount; }
	get recentRooms() { return this.room.recentRooms; }
	get currentRoomHash() { return this.room.currentRoomHash; }

	get sessions() { return this.chat.sessions; }
	get activeSessionId() { return this.chat.activeSessionId; }
	get messages() { return this.chat.messages; }
	get pendingDMInvite() { return this.chat.pendingDMInvite; }

	get callJoined() { return this.calls.callJoined; }
	get callScopeID() { return this.calls.callScopeID; }
	get callIsDM() { return this.calls.callIsDM; }
	get callPeerAddr() { return this.calls.callPeerAddr; }
	get callEpoch() { return this.calls.callEpoch; }
	get micEnabled() { return this.calls.micEnabled; }
	get camEnabled() { return this.calls.camEnabled; }
	get screenSharing() { return this.calls.screenSharing; }
	get callDurationSec() { return this.calls.callDurationSec; }
	get activeSpeakerAddr() { return this.calls.activeSpeakerAddr; }
	get callParticipants() { return this.calls.callParticipants; }
	get localStream() { return this.calls.localStream; }
	get camStream() { return this.calls.camStream; }
	get screenStream() { return this.calls.screenStream; }

	get selectedAudioInputId() { return this.devices.selectedAudioInputId; }
	set selectedAudioInputId(id: string) {
		this.devices.selectedAudioInputId = id;
		if (this.calls.callJoined && this.calls.localStream) {
			void this.calls.switchAudioInput(
				this.client,
				this.room.me,
				this.devices.getAudioConstraintsOptions(id)
			);
		}
	}

	get noiseSuppressionMode(): NoiseSuppressionMode {
		return this.devices.noiseSuppressionMode;
	}
	set noiseSuppressionMode(mode: NoiseSuppressionMode) {
		this.devices.noiseSuppressionMode = mode;
		this.devices.persistAudioPrefs();
		void this.applyAudioProcessingConstraints();
	}

	get echoCancellationMode(): EchoCancellationMode {
		return this.devices.echoCancellationMode;
	}
	set echoCancellationMode(mode: EchoCancellationMode) {
		this.devices.echoCancellationMode = mode;
		this.devices.persistAudioPrefs();
		void this.applyAudioProcessingConstraints();
	}

	get autoGainControl() { return this.devices.autoGainControl; }
	set autoGainControl(val: boolean) {
		this.devices.autoGainControl = val;
		this.devices.persistAudioPrefs();
		void this.applyAudioProcessingConstraints();
	}

	get voiceIsolation() { return this.devices.voiceIsolation; }
	set voiceIsolation(val: boolean) {
		this.devices.voiceIsolation = val;
		this.devices.persistAudioPrefs();
		void this.applyAudioProcessingConstraints();
	}

	get audioProcessorStatus() { return this.devices.audioProcessorStatus; }

	async applyAudioProcessingConstraints() {
		await this.calls.applyAudioProcessing(
			this.client,
			this.room.me,
			this.devices.getAudioConstraintsOptions()
		);
	}

	get selectedAudioOutputId() { return this.devices.selectedAudioOutputId; }
	set selectedAudioOutputId(id: string) {
		this.devices.selectedAudioOutputId = id;
	}

	get selectedVideoInputId() { return this.devices.selectedVideoInputId; }
	set selectedVideoInputId(id: string) {
		this.devices.selectedVideoInputId = id;
		if (this.calls.callJoined && this.calls.camEnabled) {
			void this.calls.switchVideoInput(this.client, this.room.me, id);
		}
	}

	get availableAudioInputs() { return this.devices.availableAudioInputs; }
	get availableAudioOutputs() { return this.devices.availableAudioOutputs; }
	get availableVideoInputs() { return this.devices.availableVideoInputs; }

	// ---- Lifecycle & Configuration ----

	private getBaseUrl(): string {
		if (typeof window === 'undefined') return '';
		return `${window.location.origin}${window.location.pathname}`;
	}

	resolveSignalingUrl(): string {
		return resolveSignalingUrl();
	}

	setSignalingUrl(url: string) {
		saveSignalingUrl(url);
		if (this.client?.config) {
			this.client.config.signalingUrl = resolveSignalingUrl();
		}
	}

	async refreshDevices(): Promise<DeviceList> {
		return this.devices.refreshDevices();
	}

	async init() {
		if (this.initialized) return;
		if (this.initPromise) return this.initPromise;

		this.initPromise = this.performInit();
		try {
			await this.initPromise;
		} finally {
			this.initPromise = null;
		}
	}

	private async performInit() {
		this.initialized = true;
		if (typeof window === 'undefined') return;

		await this.devices.refreshDevices();
		this.devices.startListening();

		if (!window.CotillaClient) {
			await new Promise<void>((resolve) => {
				const check = setInterval(() => {
					if (window.CotillaClient) {
						clearInterval(check);
						resolve();
					}
				}, 50);
				setTimeout(() => {
					clearInterval(check);
					resolve();
				}, 3000);
			});
		}

		if (!window.CotillaClient) {
			this.initialized = false;
			console.warn('CotillaClient not found on window object.');
			return;
		}

		const signalingUrl = this.resolveSignalingUrl();
		this.client = new window.CotillaClient({
			signalingUrl,
			wasmUrl: '/cotilla.wasm',
			sframeWorkerUrl: '/sframe-worker.js',
			getBaseUrl: () => this.getBaseUrl()
		});

		window.cotillaClient = this.client;
		window.cotillaApp = this;

		this.setupClientEvents();
		this.attachHashChangeListener();

		this.wasmLoading = true;
		try {
			await this.client.loadWasm();
			this.wasmReady = true;
		} catch (e) {
			console.error('Crypto engine load error:', e);
			notifications.notifyError('Failed to initialize zero-knowledge crypto engine.');
			return;
		} finally {
			this.wasmLoading = false;
		}

		// Auto-join when arriving on an invite URL (#room=...&key=...)
		if (window.location.hash && window.CotillaClient.parseLink?.(window.location.hash)) {
			try {
				await this.joinRoomFromHash(window.location.hash);
			} catch (err: unknown) {
				notifications.notifyError(err, 'Unable to Join Room');
			}
		}
	}

	private attachHashChangeListener() {
		if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
		if (this.hashChangeHandler) return;

		this.hashChangeHandler = () => {
			if (typeof window === 'undefined' || !window.location?.hash) return;
			const parsed = window.CotillaClient?.parseLink?.(window.location.hash);
			if (!parsed) return;
			if (parsed.room !== this.room.roomID || parsed.key !== this.room.roomKey) {
				void this.joinRoomFromHash(window.location.hash).catch((err) => {
					notifications.notifyError(err, 'Invite Link Error');
				});
			}
		};
		window.addEventListener('hashchange', this.hashChangeHandler);
	}

	destroy() {
		this.devices.stopListening();
		if (
			typeof window !== 'undefined' &&
			typeof window.removeEventListener === 'function' &&
			this.hashChangeHandler
		) {
			window.removeEventListener('hashchange', this.hashChangeHandler);
		}
		this.hashChangeHandler = null;
	}

	private setupClientEvents() {
		if (!this.client) return;

		this.client.on('status', (ev: any) => {
			const isOnline = typeof ev?.online === 'boolean' ? ev.online : !!ev?.connected;
			this.room.connected = isOnline;
			this.room.statusText = ev?.text || (isOnline ? 'Connected' : 'Disconnected');
			if (ev?.role) this.room.signalingRole = ev.role;
		});

		this.client.on('sessionStarted', (ev: any) => {
			let epoch = ev.isCreator ? 1 : 0;
			try {
				const wasm = this.client._wasm?.();
				if (wasm && typeof wasm.currentEpoch === 'function') {
					const cur = wasm.currentEpoch();
					if (typeof cur === 'number' && !Number.isNaN(cur)) {
						epoch = cur;
					}
				}
			} catch {}

			this.room.startSession({
				roomID: ev.roomID,
				roomKey: ev.roomKey,
				isCreator: !!ev.isCreator,
				me: ev.me || { address: this.client.me?.address || 'You' },
				epoch
			});

			let inviteHash =
				window.CotillaClient?.buildHash?.(ev.roomID, ev.roomKey, ev.invite) ||
				`#room=${encodeURIComponent(ev.roomID)}&key=${encodeURIComponent(ev.roomKey)}`;
			if (ev.isCreator) {
				try {
					const invData = this.client.getInviteData?.(15 * 60 * 1000);
					if (invData?.hash) {
						inviteHash = invData.hash;
					}
				} catch {}
			}

			this.room.setCurrentRoomHash(inviteHash);
			this.room.addRecentRoom(ev.roomID, ev.roomKey, inviteHash);

			if (typeof window !== 'undefined' && window.location?.hash) {
				window.history?.replaceState?.(null, '', window.location.pathname + (window.location.search || ''));
			}
		});

		this.client.on('sessionLeft', () => {
			this.calls.clearPeerGains();
			this.calls.leaveCallUIOnly(this.client);
			this.chat.resetForLeave();
			this.room.resetForLeave();
			ui.resetForRoomLeave();
		});

		this.client.on('peersChanged', (ev: any) => {
			this.room.updatePeers(ev, (removedAddr) => {
				if (!this.calls.callIsDM) {
					this.calls.removePeerMedia(removedAddr);
				}
			});
		});

		this.client.on('memberEvicted', (ev: any) => {
			const reason = ev?.reason || 'policy violation';
			const evictor = short(ev?.evictor);

			if (ev?.selfEvicted) {
				this.room.isEvicted = true;
				// Close only group call; 1:1 DM calls remain cryptographically isolated per AGENTS.md.
				if (this.calls.callJoined && !this.calls.callIsDM) {
					this.calls.leaveCallUIOnly(this.client);
					if (ui.showCallStage) ui.showCallStage = false;
				}
				this.chat.appendSystemMessage(
					'main',
					`🚫 You were evicted from this burner room by ${evictor}. Reason: ${reason}. Group messaging is locked.`
				);
				ui.openEvictionNotice();
				notifications.notifyError(`You were evicted from room #${short(this.room.roomID)}. Reason: ${reason}`);
				return;
			}

			if (ev?.evictedPeer) {
				this.room.removePeer(ev.evictedPeer);
				if (!this.calls.callIsDM) {
					this.calls.removePeerMedia(ev.evictedPeer);
				}
			}
			if (ev?.epochID) {
				this.room.activeEpoch = ev.epochID;
			}
			this.chat.appendSystemMessage(
				'main',
				import.meta.env.DEV
					? `🚫 Member ${short(ev?.evictedPeer)} was evicted by ${evictor} (${reason}). Rotated to Epoch ${ev?.epochID ?? this.room.activeEpoch}.`
					: `🚫 Member ${short(ev?.evictedPeer)} was evicted by ${evictor} (${reason}). Forward-secret encryption keys rotated.`
			);
		});

		this.client.on('message', (ev: any) => {
			if (this.room.isEvicted) return;
			const key = `${ev.author}:${ev.ts}:${ev.text}`;
			if (this.chat.seenMessageKeys.has(key)) return;
			this.chat.seenMessageKeys.add(key);

			const isMine = this.room.me ? ev.author === this.room.me.address : false;
			this.chat.appendChatMessage({
				id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
				type: 'text',
				author: ev.author,
				shortAuthor: short(ev.author),
				text: ev.text,
				ts: ev.ts || Date.now(),
				mine: isMine,
				scopeID: 'main'
			});
		});

		// DMs stay active even if the user is evicted from the group channel (AGENTS.md DM isolation)
		this.client.on('dmMessage', (ev: any) => {
			const isMine = this.room.me ? ev.author === this.room.me.address : false;
			const byRoom = ev.roomID ? this.chat.findSessionByRoomID(ev.roomID) : undefined;
			let targetSessionId = byRoom?.id;
			if (!targetSessionId) {
				if (!isMine && ev.author) {
					this.chat.ensureDMSession(ev.author, ev.roomID || '');
					targetSessionId = ev.author;
				} else {
					targetSessionId = this.chat.activeSessionId !== 'main' ? this.chat.activeSessionId : ev.author;
				}
			}
			if (!targetSessionId) return;

			this.chat.appendChatMessage({
				id: `dm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
				type: 'text',
				author: ev.author,
				shortAuthor: short(ev.author),
				text: ev.text,
				ts: ev.ts || Date.now(),
				mine: isMine,
				scopeID: targetSessionId
			});
		});

		this.client.on('attachmentOffer', (ev: any) => {
			this.chat.appendAttachmentOffer(ev.meta, false, this.room.me?.address);
		});

		this.client.on('attachmentProgress', (ev: any) => {
			this.chat.updateAttachmentProgress(ev.fileID, ev.received, ev.total);
		});

		this.client.on('attachment', (ev: any) => {
			const norm = normalizeAttachmentMeta(ev.meta);
			if (norm) {
				const bytes = this.client.getAttachmentData?.(norm.fileID) || null;
				this.chat.handleAttachmentCompleted(norm, bytes);
			}
		});

		this.client.on('directInvite', (ev: any) => {
			const from = ev.inv?.from_sign_pub || ev.pay?.from || 'Peer';
			this.chat.pendingDMInvite = {
				from,
				title: ev.pay?.title || 'Private 1:1 Direct Message',
				raw: ev.raw,
				inv: ev.inv,
				pay: ev.pay
			};
		});

		this.client.on('inviteResponse', (ev: any) => {
			const res = ev?.res;
			if (res?.accepted && res.from_sign_pub) {
				this.chat.switchSession(res.from_sign_pub);
				this.chat.appendSystemMessage(
					res.from_sign_pub,
					`Peer ${short(res.from_sign_pub)} accepted DM invite. Private channel active.`
				);
				notifications.notifySuccess(`Peer ${short(res.from_sign_pub)} accepted DM invite.`);
			} else if (res && !res.accepted && res.from_sign_pub) {
				this.chat.appendSystemMessage(
					res.from_sign_pub,
					`Peer ${short(res.from_sign_pub)} declined your DM invite.`
				);
				notifications.notifyInfo(`Peer ${short(res.from_sign_pub)} declined DM invite.`);
			}
		});

		this.client.on('epochCommit', (ev: any) => {
			if (ev?.commit?.epoch_id) {
				this.room.activeEpoch = ev.commit.epoch_id;
			}
		});

		this.client.on('sframeKeysUpdated', (ev: any) => {
			this.calls.setSFrameEpoch(ev?.scopeID, ev?.epoch);
		});

		// Call media events (matching exact CotillaClient event names & payloads)
		this.client.on('callPresence', (ev: any) => {
			const peerAddr = ev?.from || ev?.peerAddr;
			this.calls.handleRemotePresence(this.room.me?.address, ev?.scopeID, peerAddr, ev?.payload);
		});

		this.client.on('callRemoteTrack', (ev: any) => {
			this.calls.handleRemoteTrack(this.client, ev?.scopeID, ev?.peerAddr, ev?.kind, ev?.track, ev?.stream);
		});

		this.client.on('callPeerLeft', (ev: any) => {
			this.calls.handlePeerLeft(ev?.scopeID, ev?.peerAddr);
		});

		this.client.on('callPeerRemoved', (ev: any) => {
			this.calls.handlePeerLeft(ev?.scopeID, ev?.peerAddr);
		});

		this.client.on('callPeerClosed', (ev: any) => {
			this.calls.handlePeerClosed(this.client, ev?.scopeID, ev?.peerAddr);
			if (!ev?.peerAddr && !this.calls.callJoined) {
				ui.showCallStage = false;
			}
		});
	}

	// ---- Room Actions ----

	async createRoom(ttlMs = 15 * 60 * 1000): Promise<any> {
		if (!this.client) await this.init();
		if (!this.client) throw new Error('CotillaClient failed to load.');
		const created = await this.client.createRoom(ttlMs);
		if (created?.hash && this.room.roomID && this.room.roomKey) {
			this.room.setCurrentRoomHash(created.hash);
			this.room.addRecentRoom(this.room.roomID, this.room.roomKey, created.hash);
		}
		return created;
	}

	async joinRoomFromHash(linkOrHash: string): Promise<any> {
		if (!this.client) await this.init();
		if (!this.client) throw new Error('CotillaClient failed to load.');
		const parsed = parseInviteInput(linkOrHash);
		const joined = await this.client.joinRoomFromLink(parsed.rawHash);
		const finalHash = joined?.hash || parsed.rawHash;
		if (this.room.roomID && this.room.roomKey) {
			this.room.setCurrentRoomHash(finalHash);
			this.room.addRecentRoom(this.room.roomID, this.room.roomKey, finalHash);
		}
		return joined;
	}

	leaveRoom() {
		if (this.client) {
			this.client.leaveRoom();
		}
	}

	clearRecentRooms() {
		this.room.clearRecentRooms();
	}

	async copyInviteLink(): Promise<boolean> {
		if (!this.room.roomID || !this.room.roomKey) return false;
		if (this.room.isEvicted) {
			notifications.notifyError('You have been evicted from this burner room and cannot create invite links.');
			return false;
		}

		const baseUrl = this.getBaseUrl();
		const fallbackHash = this.room.currentRoomHash
			? this.room.currentRoomHash.startsWith('#')
				? this.room.currentRoomHash
				: `#${this.room.currentRoomHash}`
			: `#room=${encodeURIComponent(this.room.roomID)}&key=${encodeURIComponent(this.room.roomKey)}`;

		let url = '';
		try {
			const invData = this.client?.getInviteData?.(15 * 60 * 1000);
			if (invData?.url && /^https?:\/\//i.test(invData.url)) {
				url = invData.url;
			} else if (invData?.hash) {
				url = `${baseUrl}${invData.hash}`;
			}
		} catch {}

		if (!url) {
			url = `${baseUrl}${fallbackHash}`;
		}

		return copyTextToClipboard(url);
	}

	rotateKey() {
		if (!this.client) return;
		try {
			const res = this.client.rotateEpochKey();
			const ep = res?.epoch_id || this.room.activeEpoch + 1;
			this.room.activeEpoch = ep;
			this.chat.appendSystemMessage(
				'main',
				import.meta.env.DEV
					? `🔄 Key ratchet advanced to Epoch ${ep}. Distributed forward-secret key to active peers.`
					: `🔄 Forward-secret encryption keys rotated and distributed to active peers.`
			);
			notifications.notifySuccess(
				import.meta.env.DEV ? `Key rotated to Epoch ${ep}.` : 'Encryption keys rotated.'
			);
		} catch (err: unknown) {
			notifications.notifyError(`Failed to rotate encryption key: ${formatError(err)}`);
		}
	}

	evictPeer(peer: string, reason: string) {
		if (!this.client) return;
		if (this.room.isEvicted) {
			notifications.notifyError('You have been evicted and cannot evict other members.');
			return;
		}
		try {
			this.client.evictPeer(peer, reason || 'policy violation');
			this.chat.appendSystemMessage('main', `Proposed eviction of ${short(peer)}. Rotated room key.`);
			notifications.notifySuccess(`Eviction commit proposed for ${short(peer)}.`);
		} catch (err: unknown) {
			notifications.notifyError(`Eviction failed: ${formatError(err)}`);
		}
	}

	getInvitedBy(peerAddr: string): string {
		try {
			return this.client?.invitedBy?.(peerAddr) || '';
		} catch {
			return '';
		}
	}

	getPeerGain(peerAddr: string): number {
		return this.calls.getPeerGain(peerAddr);
	}

	setPeerGain(peerAddr: string, gain: number) {
		this.calls.setPeerGain(peerAddr, gain);
	}

	togglePeerMute(peerAddr: string) {
		this.calls.togglePeerMute(peerAddr);
	}

	resetPeerGain(peerAddr: string) {
		this.calls.resetPeerGain(peerAddr);
	}

	// ---- Messaging & Attachments ----

	sendMessage(text: string): boolean {
		const trimmed = text.trim();
		if (!trimmed || !this.client) return false;

		if (this.chat.activeSessionId === 'main') {
			if (this.room.isEvicted) {
				notifications.notifyError('You have been evicted from this burner room.');
				return false;
			}
			try {
				this.client.sendMessage(trimmed);
				const msg: ChatMessage = {
					id: `mine-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
					type: 'text',
					author: this.room.me?.address || 'You',
					shortAuthor: 'You',
					text: trimmed,
					ts: Date.now(),
					mine: true,
					scopeID: 'main'
				};
				this.chat.appendChatMessage(msg);
				return true;
			} catch (err: unknown) {
				notifications.notifyError(`Failed to send message: ${formatError(err)}`);
				return false;
			}
		}

		// Isolated 1:1 DM session
		const sess = this.chat.sessions.get(this.chat.activeSessionId);
		if (sess?.peerAddr && sess.roomID && sess.roomKey) {
			try {
				this.client.sendDMMessage(sess.peerAddr, sess.roomID, sess.roomKey, trimmed);
				this.chat.appendChatMessage({
					id: `dm-mine-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
					type: 'text',
					author: this.room.me?.address || 'You',
					shortAuthor: 'You',
					text: trimmed,
					ts: Date.now(),
					mine: true,
					scopeID: sess.id
				});
				return true;
			} catch (err: unknown) {
				notifications.notifyError(`Failed to send DM: ${formatError(err)}`);
				return false;
			}
		}
		notifications.notifyError('DM session credentials are incomplete.');
		return false;
	}

	startDownloadAttachment(fileID: string) {
		if (!this.client) return;
		this.chat.updateAttachmentItem(fileID, (item) => ({ ...item, isOffer: false }));
		try {
			this.client.downloadAttachment(fileID);
		} catch (err: unknown) {
			notifications.notifyError(`Failed to download attachment: ${formatError(err)}`);
		}
	}

	async sendAttachment(file: {
		name: string;
		type: string;
		size: number;
		arrayBuffer: () => Promise<ArrayBuffer>;
	}): Promise<boolean> {
		if (!this.client) {
			notifications.notifyError('Cannot send attachment: client is not ready.');
			return false;
		}
		if (this.chat.activeSessionId !== 'main') {
			notifications.notifyError('File attachments are only supported in the Group Room.');
			return false;
		}
		if (this.room.isEvicted) {
			notifications.notifyError('You have been evicted from this burner room.');
			return false;
		}

		try {
			const buffer = await file.arrayBuffer();
			const data = new Uint8Array(buffer);
			const meta = this.client.shareAttachment(file.name, file.type || 'application/octet-stream', data);
			if (meta) {
				this.chat.appendAttachmentOffer(meta, true, this.room.me?.address);
				this.chat.handleAttachmentCompleted(meta, data);
				const fileID = meta.file_id || meta.FileID || meta.fileID;
				if (fileID) {
					this.chat.updateAttachmentProgress(fileID, 1, 1);
				}
			}
			return true;
		} catch (err: unknown) {
			notifications.notifyError(`Failed to send attachment: ${formatError(err)}`);
			return false;
		}
	}

	// ---- Direct Messaging ----

	startDM(peer: string) {
		if (this.chat.sessions.has(peer)) {
			this.chat.switchSession(peer);
			return;
		}
		try {
			const res = this.client?.sendDirectInvite(peer, 'dm', 'Private Chat');
			if (res?.status === 'ok' && res.payload) {
				this.chat.ensureDMSession(peer, res.payload.room_id, res.payload.room_key);
				this.chat.switchSession(peer);
				this.chat.appendSystemMessage(peer, `Direct invite sent to ${short(peer)}. Waiting for response...`);
			} else {
				notifications.notifyError(`Failed to send direct invite: ${res?.error || 'Unknown error'}`);
			}
		} catch (err: unknown) {
			notifications.notifyError(`startDM error: ${formatError(err)}`);
		}
	}

	respondDM(accept: boolean) {
		if (!this.chat.pendingDMInvite || !this.client) return;
		try {
			const { raw, inv, pay } = this.chat.pendingDMInvite;
			this.client.respondDirectInvite(raw, accept);
			if (accept && pay?.room_id && pay.room_key && inv?.from_sign_pub) {
				this.client.registerDMSession(pay.room_id, pay.room_key, inv.from_sign_pub);
				this.chat.ensureDMSession(inv.from_sign_pub, pay.room_id, pay.room_key);
				this.chat.switchSession(inv.from_sign_pub);
			}
		} catch (err: unknown) {
			notifications.notifyError(`respondDM error: ${formatError(err)}`);
		} finally {
			this.chat.pendingDMInvite = null;
		}
	}

	switchSession(id: string) {
		this.chat.switchSession(id);
	}

	closeSession(id: string) {
		const closing = this.chat.sessions.get(id);
		if (closing?.roomID && this.calls.callJoined && this.calls.callScopeID === closing.roomID) {
			this.leaveVoiceCall();
		}
		this.chat.closeSession(id);
	}

	// ---- Calls & Media ----

	currentCallTarget(): CallTarget {
		if (this.chat.activeSessionId !== 'main') {
			const sess = this.chat.sessions.get(this.chat.activeSessionId);
			if (sess?.roomID) {
				return { scopeID: sess.roomID, isDM: true, peerAddr: sess.peerAddr };
			}
		}
		return { scopeID: this.room.roomID || '', isDM: false };
	}

	async joinVoiceCall(targetOverride?: CallTarget) {
		const target = targetOverride || this.currentCallTarget();
		if (!target.isDM && this.room.isEvicted) {
			notifications.notifyError('You have been evicted from the group channel.');
			return;
		}
		await this.calls.joinCall(this.client, this.room.me, target);
		if (this.calls.callJoined) {
			ui.showCallStage = true;
		}
	}

	async joinGroupCall() {
		if (this.room.isEvicted) {
			notifications.notifyError('You have been evicted from the group channel.');
			return;
		}
		this.chat.switchSession('main');
		if (!this.calls.callJoined || this.calls.callIsDM) {
			await this.calls.joinCall(this.client, this.room.me, {
				scopeID: this.room.roomID || '',
				isDM: false
			});
		}
		if (this.calls.callJoined) {
			ui.showCallStage = true;
		}
	}

	async joinDMCall(peerAddr?: string) {
		const sess = peerAddr
			? this.chat.sessions.get(peerAddr)
			: this.chat.sessions.get(this.chat.activeSessionId);
		if (!sess?.isDM || !sess.roomID) {
			notifications.notifyError('No active DM session for call.');
			return;
		}
		this.chat.switchSession(sess.id);
		await this.calls.joinCall(this.client, this.room.me, {
			scopeID: sess.roomID,
			isDM: true,
			peerAddr: sess.peerAddr || sess.id
		});
		if (this.calls.callJoined) {
			ui.showCallStage = true;
		}
	}

	leaveVoiceCall() {
		this.calls.leaveCall(this.client);
		ui.showCallStage = false;
		ui.exitFullscreen();
	}

	async toggleMic() {
		await this.calls.toggleMic(
			this.client,
			this.room.me,
			this.currentCallTarget(),
			this.devices.getAudioConstraintsOptions()
		);
	}

	async toggleCam() {
		await this.calls.toggleCam(
			this.client,
			this.room.me,
			this.currentCallTarget(),
			this.devices.selectedVideoInputId
		);
	}

	async toggleScreenShare() {
		await this.calls.toggleScreenShare(this.client, this.room.me, this.currentCallTarget());
	}

	async stopScreenShare() {
		await this.calls.stopScreenShare(this.client, this.room.me);
	}

	// Exposed for PeerInfo backward access cleanly
	peerList(): PeerInfo[] {
		return Array.from(this.room.peers.values());
	}
}

export const cotilla = new CotillaStore();
