import { createServer } from 'vite';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const cotillaMod = require('./static/cotilla.js');
const CotillaClient = cotillaMod?.CotillaClient || globalThis.CotillaClient;
assert.ok(CotillaClient, 'CotillaClient must be loaded from static/cotilla.js');

function createStorageMock() {
	const map = new Map();
	return {
		_map: map,
		getItem: (k) => (map.has(k) ? map.get(k) : null),
		setItem: (k, v) => map.set(k, String(v)),
		removeItem: (k) => map.delete(k),
		clear: () => map.clear()
	};
}

function setGlobalProperty(target, key, value) {
	const desc = Object.getOwnPropertyDescriptor(target, key);
	if (!desc || desc.writable || desc.configurable) {
		Object.defineProperty(target, key, {
			value,
			writable: true,
			configurable: true,
			enumerable: true
		});
	} else {
		throw new Error(`Cannot override global property ${key}`);
	}
}

class MockTrack {
	constructor(kind, id, label = `${kind}-track`) {
		this.kind = kind;
		this.id = id;
		this.label = label;
		this.enabled = true;
		this.muted = false;
		this.readyState = 'live';
		this.onended = null;
		this.constraints = null;
	}
	async applyConstraints(constraints) {
		this.constraints = constraints;
	}
	stop() {
		this.readyState = 'ended';
	}
}

class MockMediaStream {
	constructor(tracks = []) {
		this._tracks = [...tracks];
	}
	getTracks() {
		return [...this._tracks];
	}
	getAudioTracks() {
		return this._tracks.filter((t) => t.kind === 'audio');
	}
	getVideoTracks() {
		return this._tracks.filter((t) => t.kind === 'video');
	}
	addTrack(track) {
		if (!this._tracks.some((t) => t.id === track.id)) {
			this._tracks.push(track);
		}
	}
	removeTrack(track) {
		this._tracks = this._tracks.filter((t) => t.id !== track.id);
	}
}

class MockAudioContext {
	state = 'running';
	createAnalyser() {
		return {
			fftSize: 256,
			frequencyBinCount: 128,
			getByteTimeDomainData: (arr) => arr.fill(128),
			disconnect() {}
		};
	}
	createMediaStreamSource() {
		return { connect() {}, disconnect() {} };
	}
	async close() {
		this.state = 'closed';
	}
}

class MockWorker {
	static instances = [];
	onmessage = null;
	messages = [];
	constructor(url) {
		this.url = url;
		MockWorker.instances.push(this);
	}
	postMessage(msg) {
		this.messages.push(msg);
		if (msg?.type === 'installBundle' && msg.requestId) {
			queueMicrotask(() => {
				this.onmessage?.({ data: { type: 'ack', requestId: msg.requestId } });
			});
		} else if (msg?.type === 'getStats' && msg.requestId) {
			queueMicrotask(() => {
				this.onmessage?.({ data: { type: 'stats', requestId: msg.requestId, stats: {} } });
			});
		}
	}
	terminate() {}
}

class MockRTCRtpScriptTransform {
	constructor(worker, opts) {
		this.worker = worker;
		this.opts = opts;
	}
}

class MockRTCPeerConnection {
	connectionState = 'connected';
	localDescription = null;
	remoteDescription = null;
	ontrack = null;
	onicecandidate = null;
	onconnectionstatechange = null;
	transceivers = [];

	addTransceiver(trackOrKind, init = {}) {
		const kind = typeof trackOrKind === 'string' ? trackOrKind : trackOrKind.kind;
		const track = typeof trackOrKind === 'string' ? null : trackOrKind;
		const encodings = Array.isArray(init?.sendEncodings) && init.sendEncodings.length > 0
			? init.sendEncodings.map((e) => ({ ...e }))
			: [{}];
		let currentParams = { encodings };
		const tr = {
			mid: kind === 'audio' ? '0' : '1',
			direction: 'sendrecv',
			sender: {
				track,
				replaceTrack: async (newTrack) => {
					tr.sender.track = newTrack;
				},
				getParameters: () => ({
					encodings: currentParams.encodings.map((e) => ({ ...e }))
				}),
				setParameters: async (p) => {
					if (p?.encodings) {
						currentParams = { encodings: p.encodings.map((e) => ({ ...e })) };
					}
				}
			},
			receiver: {
				track: new MockTrack(kind, `remote-${kind}-${Math.random().toString(36).slice(2, 6)}`)
			}
		};
		this.transceivers.push(tr);
		return tr;
	}
	getTransceivers() {
		return this.transceivers;
	}
	async createOffer() {
		return { type: 'offer', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\n' };
	}
	async createAnswer() {
		return { type: 'answer', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\n' };
	}
	async setLocalDescription(desc) {
		this.localDescription = desc;
	}
	async setRemoteDescription(desc) {
		this.remoteDescription = desc;
	}
	async addIceCandidate() {}
	async getStats() {
		return new Map();
	}
	close() {
		this.connectionState = 'closed';
	}
}

class MockWebSocket {
	static CONNECTING = 0;
	static OPEN = 1;
	static CLOSING = 2;
	static CLOSED = 3;
	static sent = [];

	readyState = MockWebSocket.CONNECTING;
	onopen = null;
	onclose = null;
	onmessage = null;
	onerror = null;

	constructor(url) {
		this.url = url;
		queueMicrotask(() => {
			if (this.readyState === MockWebSocket.CONNECTING) {
				this.readyState = MockWebSocket.OPEN;
				this.onopen?.();
			}
		});
	}
	send(data) {
		MockWebSocket.sent.push(data);
	}
	close() {
		this.readyState = MockWebSocket.CLOSED;
	}
}

function createMockWasm() {
	const hooks = {};
	let epoch = 1;
	let currentRoomID = null;
	let currentRoomKey = null;
	const myAddr = 'addr_alice_11111111';
	const attachmentData = new Map();
	const callRoster = new Map();

	const wasm = {
		hooks,
		sentMessages: [],
		sentDMs: [],
		callsJoined: [],
		callsLeft: [],
		callOptsUpdated: [],
		setCallRoster(scopeID, peers) {
			callRoster.set(scopeID, peers);
		},
		init: () => JSON.stringify({ address: myAddr }),
		createRoom: () => {
			currentRoomID = 'room+created';
			currentRoomKey = 'key+created/1==';
			return JSON.stringify({ roomID: currentRoomID, roomKey: currentRoomKey });
		},
		joinRoom: (roomID, roomKey) => {
			currentRoomID = roomID;
			currentRoomKey = roomKey;
			return JSON.stringify({ ok: true });
		},
		setChannelInvite: () => {},
		createChannelInvite: (ttlMs) =>
			JSON.stringify({
				room_id: currentRoomID,
				room_key: currentRoomKey,
				inviter_pub: myAddr,
				epoch_id: epoch,
				expires_at: Date.now() + ttlMs,
				signature: 'sig+base64/ok=='
			}),
		leaveRoom: () => {
			currentRoomID = null;
			currentRoomKey = null;
		},
		currentEpoch: () => epoch,
		addPeer: () => {},
		requestCatchUp: () => {},
		joinChannel: () => {},
		signSignaling: (type) => JSON.stringify({ type, from: myAddr }),
		sendMessage: (text) => {
			wasm.sentMessages.push(text);
			return JSON.stringify({ ok: true });
		},
		sendDirectInvite: (peer, kind, title) =>
			JSON.stringify({
				status: 'ok',
				payload: { room_id: `dm-${peer}`, room_key: `dmkey+${peer}`, kind, title }
			}),
		respondDirectInvite: () => JSON.stringify({ status: 'ok' }),
		registerDMSession: () => JSON.stringify({ status: 'ok' }),
		sendDMMessage: (peer, roomID, roomKey, text) => {
			wasm.sentDMs.push({ peer, roomID, roomKey, text });
			return JSON.stringify({ status: 'ok' });
		},
		shareAttachment: (name, mime, bytes) => {
			const fid = `fid-${name}`;
			attachmentData.set(fid, bytes);
			return JSON.stringify({
				file_id: fid,
				name,
				size: bytes.length,
				mime_type: mime,
				author_pub_key: myAddr,
				timestamp: Date.now(),
				total_chunks: 1
			});
		},
		downloadAttachment: () => JSON.stringify({ ok: true }),
		getAttachmentData: (fid) => attachmentData.get(fid) || null,
		rotateEpochKey: () => {
			epoch += 1;
			return JSON.stringify({ epoch_id: epoch });
		},
		evictPeer: (peer, reason) => {
			epoch += 1;
			hooks.onMemberEvicted?.(peer, myAddr, reason, epoch);
			return JSON.stringify({ epoch_id: epoch });
		},
		invitedBy: () => myAddr,
		joinCall: (scopeID, isDM, opts) => {
			wasm.callsJoined.push({ scopeID, isDM, opts });
			return { status: 'ok', bundle: { epoch: isDM ? 0 : epoch, keys: [] } };
		},
		activeCallPeers: (scopeID) => JSON.stringify(callRoster.get(scopeID) || []),
		updateCallOptions: (scopeID, optsJSON) => {
			wasm.callOptsUpdated.push({ scopeID, opts: JSON.parse(optsJSON) });
			return JSON.stringify({ status: 'ok' });
		},
		leaveCall: (scopeID) => {
			wasm.callsLeft.push(scopeID);
			return JSON.stringify({ status: 'ok' });
		},
		sendCallSignal: () => JSON.stringify({ status: 'ok' }),

		setOnMessage: (fn) => (hooks.onMessage = fn),
		setOnAttachmentOffer: (fn) => (hooks.onAttachmentOffer = fn),
		setOnAttachmentProgress: (fn) => (hooks.onAttachmentProgress = fn),
		setOnAttachment: (fn) => (hooks.onAttachment = fn),
		setOnCallPresence: (fn) => (hooks.onCallPresence = fn),
		setOnCallSignal: (fn) => (hooks.onCallSignal = fn),
		setOnSFrameKeysUpdated: (fn) => (hooks.onSFrameKeysUpdated = fn),
		setOnCallPeerClosed: (fn) => (hooks.onCallPeerClosed = fn),
		setOnDirectInvite: (fn) => (hooks.onDirectInvite = fn),
		setOnInviteResponse: (fn) => (hooks.onInviteResponse = fn),
		setOnDMMessage: (fn) => (hooks.onDMMessage = fn),
		setOnPeerJoined: (fn) => (hooks.onPeerJoined = fn),
		setOnPeerLeft: (fn) => (hooks.onPeerLeft = fn),
		setOnMemberEvicted: (fn) => (hooks.onMemberEvicted = fn),
		setOnEpochCommit: (fn) => (hooks.onEpochCommit = fn),
		setOnAnchorIntro: (fn) => (hooks.onAnchorIntro = fn),
		setOnAnchorDeficit: (fn) => (hooks.onAnchorDeficit = fn),
		setOnAnchorSolicit: (fn) => (hooks.onAnchorSolicit = fn),
		setOnChannelDiscovered: (fn) => (hooks.onChannelDiscovered = fn),
		setOnOpen: (fn) => (hooks.onOpen = fn)
	};
	return wasm;
}

async function main() {
	const server = await createServer({ server: { middlewareMode: true } });
	try {
		console.log('Testing CotillaStore with real CotillaClient (3+ peers)...');

		const sessionStorage = createStorageMock();
		const localStorage = createStorageMock();
		const listeners = new Map();
		const clipboardWritten = [];
		const historyReplaced = [];
		let screenTrackCounter = 0;
		let videoTrackCounter = 0;
		let audioTrackCounter = 0;

		const mockWasm = createMockWasm();

		class MockGo {
			importObject = {};
			run() {
				globalThis.cotilla = mockWasm;
				globalThis.window.cotilla = mockWasm;
			}
		}

		const locationObj = {
			protocol: 'https:',
			host: 'cotilla.example',
			origin: 'https://cotilla.example',
			pathname: '/messenger/',
			search: '',
			hash: '#room=room+init&key=key+init/1==&inviter=addr_bob_22222222&epoch=1&exp=9999999999&sig=sig+init/2=='
		};

		const mediaDevicesObj = {
			enumerateDevices: async () => [
				{ kind: 'audioinput', deviceId: 'mic-1', label: 'Mic 1' },
				{ kind: 'audiooutput', deviceId: 'spk-1', label: 'Speaker 1' },
				{ kind: 'videoinput', deviceId: 'cam-1', label: 'Cam 1' },
				{ kind: 'videoinput', deviceId: 'cam-2', label: 'Cam 2' }
			],
			getUserMedia: async (constraints) => {
				const tracks = [];
				if (constraints?.audio) {
					const t = new MockTrack('audio', `mic-${++audioTrackCounter}`);
					t.constraints = constraints.audio;
					tracks.push(t);
				}
				if (constraints?.video) tracks.push(new MockTrack('video', `cam-${++videoTrackCounter}`));
				return new MockMediaStream(tracks);
			},
			getDisplayMedia: async () =>
				new MockMediaStream([new MockTrack('video', `scr-${++screenTrackCounter}`)]),
			addEventListener() {},
			removeEventListener() {}
		};

		const navObj = {
			mediaDevices: mediaDevicesObj,
			clipboard: {
				writeText: async (text) => {
					clipboardWritten.push(text);
				}
			}
		};

		globalThis.window = {
			CotillaClient,
			location: locationObj,
			sessionStorage,
			localStorage,
			history: {
				replaceState: (_state, _title, url) => {
					historyReplaced.push(url);
					const hashIdx = url.indexOf('#');
					locationObj.hash = hashIdx >= 0 ? url.slice(hashIdx) : '';
				}
			},
			addEventListener: (ev, fn) => listeners.set(ev, fn),
			removeEventListener: (ev) => listeners.delete(ev),
			MediaStream: MockMediaStream,
			AudioContext: MockAudioContext,
			navigator: navObj,
			crypto: globalThis.crypto
		};

		setGlobalProperty(globalThis, 'navigator', navObj);
		setGlobalProperty(globalThis, 'MediaStream', MockMediaStream);
		setGlobalProperty(globalThis, 'WebSocket', MockWebSocket);
		setGlobalProperty(globalThis, 'Worker', MockWorker);
		setGlobalProperty(globalThis, 'RTCPeerConnection', MockRTCPeerConnection);
		setGlobalProperty(globalThis, 'RTCRtpScriptTransform', MockRTCRtpScriptTransform);
		setGlobalProperty(globalThis, 'Go', MockGo);
		setGlobalProperty(globalThis, 'fetch', async () => ({ ok: true }));
		setGlobalProperty(globalThis, 'WebAssembly', {
			instantiateStreaming: async () => ({ instance: {} })
		});

		const { cotilla, ui, parseInviteInput } = await server.ssrLoadModule('./src/lib/index.ts');

		// 1. Init + initial window.location.hash auto-join + URL strip + Worker URL
		await cotilla.init();
		assert.equal(cotilla.wasmReady, true);
		assert.equal(cotilla.inRoom, true, 'Must auto-join room present in initial window.location.hash');
		assert.equal(cotilla.roomID, 'room+init');
		assert.equal(cotilla.roomKey, 'key+init/1==');
		assert.equal(cotilla.client.config.sframeWorkerUrl, '/sframe-worker.js');
		assert.equal(historyReplaced.at(-1), '/messenger/', 'Invite hash must be stripped from URL bar');
		assert.equal(localStorage._map.has('cotilla_recent_rooms'), false, 'Recent rooms must not use localStorage');
		assert.equal(sessionStorage._map.has('cotilla_recent_rooms'), true, 'Recent rooms must be stored in sessionStorage');
		console.log('  ✓ init(), hash auto-join (+ preservation), URL cleanup & sessionStorage verified');

		// 2. Create room + copyInviteLink() full base URL + clipboard promise
		await cotilla.createRoom();
		assert.equal(cotilla.roomID, 'room+created');
		assert.equal(cotilla.isCreator, true);
		const copied = await cotilla.copyInviteLink();
		assert.equal(copied, true);
		const inviteUrl = clipboardWritten.at(-1);
		assert.ok(inviteUrl.startsWith('https://cotilla.example/messenger/#room='));
		const reparsed = parseInviteInput(inviteUrl);
		assert.equal(reparsed.room, 'room+created');
		assert.equal(reparsed.key, 'key+created/1==');
		assert.equal(reparsed.sig, 'sig+base64/ok==');
		console.log('  ✓ createRoom() & full base URL signed copyInviteLink() verified');

		// 3. Connect 3+ peers (Bob, Carol, Dan) & verify status.online + mesh messaging
		const bob = 'addr_bob_22222222';
		const carol = 'addr_carol_33333333';
		const dan = 'addr_dan_44444444';

		mockWasm.hooks.onPeerJoined(bob);
		mockWasm.hooks.onOpen(bob);
		assert.equal(cotilla.connected, true, 'cotilla.connected must reflect status.online');
		mockWasm.hooks.onChannelDiscovered(cotilla.roomID, bob);
		mockWasm.hooks.onPeerJoined(carol);
		mockWasm.hooks.onOpen(carol);
		mockWasm.hooks.onChannelDiscovered(cotilla.roomID, carol);
		mockWasm.hooks.onChannelDiscovered(cotilla.roomID, dan);
		assert.equal(cotilla.peerCount, 3, 'Mesh must track 3+ peers (Bob, Carol, Dan)');
		assert.equal(cotilla.directPeerCount, 2, 'Bob & Carol are direct peers; Dan is multi-hop room peer');

		cotilla.sendMessage('Hello mesh!');
		mockWasm.hooks.onMessage(
			JSON.stringify({ author_pub_key: bob, timestamp: 1700000100 }),
			JSON.stringify({ text: 'Hi Alice from Bob' })
		);
		mockWasm.hooks.onMessage(
			JSON.stringify({ author_pub_key: carol, timestamp: 1700000200 }),
			JSON.stringify({ text: 'Hi all from Carol' })
		);
		const mainMsgs = (cotilla.messages.get('main') || []).filter((m) => m.scopeID === 'main' && m.type === 'text');
		assert.equal(mainMsgs.length, 3);
		console.log('  ✓ 3+ peer mesh status.online, discovery & group messages verified');

		// 4. Concurrent 1:1 DM isolation & attachment gating
		cotilla.startDM(bob);
		assert.equal(cotilla.activeSessionId, bob);
		cotilla.sendMessage('Private to Bob');

		mockWasm.hooks.onDirectInvite(
			JSON.stringify({ from_sign_pub: carol }),
			JSON.stringify({ from: carol, title: 'Carol DM', room_id: `dm-${carol}`, room_key: `dmkey+${carol}` })
		);
		assert.equal(cotilla.pendingDMInvite?.from, carol);
		cotilla.respondDM(true);
		assert.equal(cotilla.activeSessionId, carol);

		mockWasm.hooks.onDMMessage(bob, `dm-${bob}`, 'Bob DM reply');
		mockWasm.hooks.onDMMessage(carol, `dm-${carol}`, 'Carol DM reply');
		assert.ok((cotilla.messages.get(bob) || []).some((m) => m.scopeID === bob && m.text === 'Bob DM reply'));
		assert.ok(!(cotilla.messages.get(carol) || []).some((m) => m.text === 'Bob DM reply'));
		assert.ok(!(cotilla.messages.get('main') || []).some((m) => m.text === 'Bob DM reply'));

		const blockedAttach = await cotilla.sendAttachment({
			name: 'secret.txt',
			type: 'text/plain',
			size: 5,
			arrayBuffer: async () => new Uint8Array([1, 2, 3, 4, 5]).buffer
		});
		assert.equal(blockedAttach, false, 'Group-only attachments must be blocked while in DM tab');

		cotilla.switchSession('main');
		const okAttach = await cotilla.sendAttachment({
			name: 'shared.txt',
			type: 'text/plain',
			size: 5,
			arrayBuffer: async () => new Uint8Array([1, 2, 3, 4, 5]).buffer
		});
		assert.equal(okAttach, true);
		console.log('  ✓ 1:1 DM routing across 3 peers & group-only attachment guard verified');

		// 5. Group Call + SFrame worker + initial hydration + presence/track separation
		cotilla.switchSession(carol);
		mockWasm.setCallRoster(cotilla.roomID, [
			{ address: bob, audio: true, video: false, screen: false, listenOnly: false }
		]);
		await cotilla.joinGroupCall();
		assert.equal(cotilla.activeSessionId, 'main', 'joinGroupCall must switch active session to main');
		assert.equal(ui.showCallStage, true);
		assert.equal(cotilla.callJoined, true);
		assert.equal(cotilla.callIsDM, false);
		assert.equal(cotilla.callScopeID, cotilla.roomID);
		assert.equal(MockWorker.instances[0]?.url, '/sframe-worker.js');
		assert.equal(cotilla.callParticipants.get(bob)?.hasAudio, true, 'Must hydrate existing call roster peers');
		assert.equal(cotilla.callParticipants.get(bob)?.hasVideo, false);

		// Carol joins with audio only first
		mockWasm.hooks.onCallPresence(
			cotilla.roomID,
			false,
			carol,
			JSON.stringify({ audio: true, video: false, screen: false })
		);
		const carolAudioTrack = new MockTrack('audio', 'carol-a1');
		const carolIdleVideoTrack = new MockTrack('video', 'carol-v-idle');
		carolIdleVideoTrack.muted = true;
		const remoteStream = new MockMediaStream([carolAudioTrack, carolIdleVideoTrack]);

		cotilla.client._emit('callRemoteTrack', {
			scopeID: cotilla.roomID,
			peerAddr: carol,
			kind: 'audio',
			track: carolAudioTrack,
			stream: remoteStream
		});
		cotilla.client._emit('callRemoteTrack', {
			scopeID: cotilla.roomID,
			peerAddr: carol,
			kind: 'video',
			track: carolIdleVideoTrack,
			stream: remoteStream
		});

		let carolState = cotilla.callParticipants.get(carol);
		assert.ok(carolState?.audioStream, 'Audio stream must be stored separately');
		assert.ok(carolState?.videoStream, 'Idle video transceiver stream may attach pre-unmute');
		assert.notEqual(carolState.audioStream, carolState.videoStream, 'audioStream and videoStream must be isolated single-track streams');
		assert.deepEqual(carolState.audioStream.getTracks().map((t) => t.kind), ['audio']);
		assert.deepEqual(carolState.videoStream.getTracks().map((t) => t.kind), ['video']);
		assert.equal(carolState?.hasVideo, false, 'Idle video transceiver without presence.video must NOT show video');

		// Carol starts screen share + Dan joins with cam
		mockWasm.hooks.onCallPresence(
			cotilla.roomID,
			false,
			carol,
			JSON.stringify({ audio: true, video: false, screen: true })
		);
		const carolScreenTrack = new MockTrack('video', 'carol-screen');
		carolScreenTrack.muted = false;
		cotilla.client._emit('callRemoteTrack', {
			scopeID: cotilla.roomID,
			peerAddr: carol,
			kind: 'video',
			track: carolScreenTrack,
			stream: new MockMediaStream([carolAudioTrack, carolScreenTrack])
		});
		carolState = cotilla.callParticipants.get(carol);
		assert.equal(carolState?.hasVideo, true);
		assert.equal(carolState?.videoKind, 'screen');
		assert.ok(carolState?.videoStream);

		mockWasm.hooks.onCallPresence(
			cotilla.roomID,
			false,
			dan,
			JSON.stringify({ audio: false, video: true, screen: false })
		);
		assert.equal(cotilla.callParticipants.size, 4, 'Call should track local Alice + Bob, Carol, Dan');

		// Toggle local mic, cam, screen share + audio processing modes + device swap + sframe key epoch update
		assert.equal(cotilla.noiseSuppressionMode, 'builtin', 'Default NS mode should be builtin');
		assert.equal(cotilla.echoCancellationMode, 'builtin', 'Default AEC mode should be builtin');
		assert.equal(cotilla.voiceIsolation, true);
		assert.equal(cotilla.autoGainControl, true);

		await cotilla.toggleMic();
		assert.equal(cotilla.micEnabled, true);

		// Live audio preference changes during 4-participant call
		cotilla.voiceIsolation = false;
		await new Promise((r) => setTimeout(r, 20));
		const savedAudioPrefs = JSON.parse(localStorage.getItem('cotilla_audio_processing') || '{}');
		assert.equal(savedAudioPrefs.voiceIsolation, false);
		assert.equal(cotilla.rawAudioTrack?.constraints?.voiceIsolation ?? cotilla.localStream?.getAudioTracks()[0]?.constraints?.voiceIsolation, false);

		cotilla.noiseSuppressionMode = 'off';
		cotilla.echoCancellationMode = 'off';
		await new Promise((r) => setTimeout(r, 20));
		assert.equal(cotilla.callParticipants.size, 4, 'Audio mode switches must preserve 4-peer call state');
		assert.equal(cotilla.micEnabled, true);

		cotilla.noiseSuppressionMode = 'builtin';
		cotilla.echoCancellationMode = 'builtin';
		cotilla.voiceIsolation = true;
		await new Promise((r) => setTimeout(r, 20));
		assert.equal(cotilla.audioProcessorStatus.state, 'active');

		for (const pcEntry of cotilla.client.callPCs.values()) {
			if (pcEntry.pc?.localDescription?.sdp) {
				assert.equal(pcEntry.pc.localDescription.sdp.includes('usedtx='), false, 'SDP must not be munged with usedtx');
				assert.equal(pcEntry.pc.localDescription.sdp.includes('maxaveragebitrate='), false, 'SDP must not be munged with maxaveragebitrate');
			}
			if (pcEntry.audioSender?.getParameters) {
				const params = pcEntry.audioSender.getParameters();
				assert.equal(params.encodings?.[0]?.maxBitrate, 64000, 'Audio sender maxBitrate must be capped at 64000 via standard W3C parameters');
			}
		}

		await cotilla.toggleCam();
		assert.equal(cotilla.camEnabled, true);
		cotilla.selectedVideoInputId = 'cam-2';
		await new Promise((r) => setTimeout(r, 20));
		assert.equal(cotilla.camEnabled, true);

		await cotilla.toggleScreenShare();
		assert.equal(cotilla.screenSharing, true);
		assert.equal(cotilla.camEnabled, true, 'Local camera state remains active alongside screen share');
		assert.equal(cotilla.client._localVideoKind, 'screen', 'Outgoing video sender switches to screen track');

		mockWasm.hooks.onSFrameKeysUpdated(cotilla.roomID, false, { epoch: 42 });
		assert.equal(cotilla.callEpoch, 42);

		// Browser Stop Sharing button onended handling
		cotilla.screenStream.getVideoTracks()[0].onended?.();
		await new Promise((r) => setTimeout(r, 20));
		assert.equal(cotilla.screenSharing, false);
		assert.equal(cotilla.client._localVideoKind, 'cam', 'Outgoing video sender reverts to active camera track');
		console.log('  ✓ 3+ peer secondary WebRTC calls, presence/track decoupling & device toggles verified');

		// 6. Group -> DM call switch & Eviction isolation
		await cotilla.joinDMCall(bob);
		assert.equal(cotilla.callJoined, true);
		assert.equal(cotilla.callIsDM, true);
		assert.equal(cotilla.callPeerAddr, bob);
		assert.equal(cotilla.callScopeID, `dm-${bob}`);

		// Peer eviction while group peers exist
		cotilla.evictPeer(carol, 'spam');
		assert.equal(cotilla.peers.has(carol), false);

		// Per-peer gain controls (0% to 200%, mute toggle, reset)
		assert.equal(cotilla.getPeerGain(bob), 1.0, 'Default gain must be 1.0 (100%)');
		cotilla.setPeerGain(bob, 1.75);
		assert.equal(cotilla.getPeerGain(bob), 1.75);
		cotilla.setPeerGain(bob, 3.0);
		assert.equal(cotilla.getPeerGain(bob), 2.0, 'Gain must clamp to max 2.0 (200%)');
		cotilla.setPeerGain(bob, -0.5);
		assert.equal(cotilla.getPeerGain(bob), 0.0, 'Gain must clamp to min 0.0 (0%)');
		cotilla.setPeerGain(bob, 1.5);
		cotilla.togglePeerMute(bob);
		assert.equal(cotilla.getPeerGain(bob), 0.0, 'Mute must set gain to 0.0');
		cotilla.togglePeerMute(bob);
		assert.equal(cotilla.getPeerGain(bob), 1.5, 'Unmute must restore previous non-zero gain');
		cotilla.resetPeerGain(bob);
		assert.equal(cotilla.getPeerGain(bob), 1.0, 'Reset must return gain to 1.0');
		cotilla.setPeerGain(bob, 1.8);

		// Self eviction closes group access yet preserves isolated 1:1 DM & DM call!
		mockWasm.hooks.onMemberEvicted('addr_alice_11111111', bob, 'policy test', 9);
		assert.equal(cotilla.isEvicted, true);
		assert.equal(ui.evictionNoticeOpen, true);
		assert.equal(cotilla.callJoined, true, '1:1 DM call MUST remain active after group eviction');
		assert.equal(cotilla.callIsDM, true);
		assert.equal(cotilla.activeSessionId, bob);
		assert.equal(cotilla.sendMessage('Still allowed in DM'), true);

		mockWasm.hooks.onDMMessage(bob, `dm-${bob}`, 'Still receiving DM after group eviction');
		assert.ok((cotilla.messages.get(bob) || []).some((m) => m.scopeID === bob && m.text === 'Still receiving DM after group eviction'));

		cotilla.switchSession('main');
		assert.equal(cotilla.sendMessage('blocked in main'), false, 'Group messaging must be locked after eviction');
		await cotilla.joinGroupCall();
		assert.equal(cotilla.callIsDM, true, 'Group call join must be blocked while evicted without breaking DM call');

		// Full sessionLeft reset + hashchange + destroy
		cotilla.leaveRoom();
		assert.equal(cotilla.inRoom, false);
		assert.equal(cotilla.isEvicted, false);
		assert.equal(ui.evictionNoticeOpen, false);
		assert.equal(cotilla.callJoined, false);
		assert.equal(ui.showCallStage, false);
		assert.equal(ui.mobileSidebarOpen, false);
		assert.equal(ui.isFullscreen, false);
		assert.equal((cotilla.messages.get('main') || []).length, 0);
		assert.equal(cotilla.sessions.size, 1);
		assert.equal(cotilla.peers.size, 0);
		assert.equal(cotilla.getPeerGain(bob), 1.0, 'leaveRoom() must clear peer gains');

		locationObj.hash = '#room=room+hashchange&key=key+hashchange==&inviter=addr_bob_22222222&epoch=1&exp=9999999999&sig=sig+hc==';
		listeners.get('hashchange')?.();
		await new Promise((r) => setTimeout(r, 30));
		assert.equal(cotilla.roomID, 'room+hashchange', 'hashchange event must join the new invite link');

		cotilla.destroy();
		assert.equal(listeners.has('hashchange'), false, 'destroy() must unregister hashchange listener');

		console.log('  ✓ Group->DM switch, self-eviction DM isolation, sessionLeft reset & destroy() verified');
		console.log('\n>>> ALL COTILLA STORE + REAL CLIENT TESTS PASSED! <<<\n');
	} finally {
		await server.close();
	}
}

main().catch((err) => {
	console.error('Store test failed:', err);
	process.exit(1);
});
