import { createServer } from 'vite';
import assert from 'node:assert/strict';

async function main() {
	const server = await createServer({ server: { middlewareMode: true } });
	try {
		console.log('Testing utils, platform, and store modules...');
		const {
			short,
			formatBytes,
			formatTime,
			formatDuration,
			formatError,
			normalizeAttachmentMeta,
			parseInviteInput
		} = await server.ssrLoadModule('./src/lib/utils/format.ts');
		const { createRmsAudioMeter } = await server.ssrLoadModule('./src/lib/platform/audioAnalyser.ts');
		const { createCallGainMixer, combineLocalAudioStreams } = await server.ssrLoadModule('./src/lib/platform/audioGain.ts');
		const {
			loadRecentRooms,
			saveRecentRooms,
			clearRecentRoomsStorage,
			getDefaultSignalingUrl,
			loadAudioProcessingPrefs,
			saveAudioProcessingPrefs
		} = await server.ssrLoadModule('./src/lib/platform/storage.ts');
		const { buildAudioTrackConstraints, audioHardwareConstraintKey } = await server.ssrLoadModule('./src/lib/platform/mediaDevices.ts');
		const {
			createAudioProcessingPipeline,
			requiresNeuralAudioPipeline,
			describeActiveAudioModes
		} = await server.ssrLoadModule('./src/lib/platform/audioProcessing.ts');
		const { notifications } = await server.ssrLoadModule('./src/lib/stores/notifications.svelte.ts');
		const { ui } = await server.ssrLoadModule('./src/lib/stores/ui.svelte.ts');
		const { UI_VERSION } = await server.ssrLoadModule('./src/lib/version.ts');

		// 1. Format utilities
		{
			assert.equal(short('0123456789abcdef'), '01234567');
			assert.equal(short('abc'), 'abc');
			assert.equal(short(null), '...');

			assert.equal(formatBytes(0), '0 B');
			assert.equal(formatBytes(1024), '1 KB');
			assert.equal(formatBytes(1024 * 1024 * 2.5), '2.5 MB');

			assert.equal(formatDuration(0), '00:00');
			assert.equal(formatDuration(65), '01:05');
			assert.equal(formatDuration(3600), '60:00');

			assert.equal(formatError('Direct string error'), 'Direct string error');
			assert.equal(formatError(new Error('Object error message')), 'Object error message');
			assert.equal(formatError(null), 'An unexpected error occurred');
			console.log('  ✓ Format utils verified');
		}

		// 2. Attachment normalization
		{
			const rawA = {
				file_id: 'fid-123',
				name: 'doc.pdf',
				size: 5000,
				mime: 'application/pdf',
				author_pub_key: 'author-alice',
				timestamp: 1700000000,
				total_chunks: 5
			};
			const normA = normalizeAttachmentMeta(rawA);
			assert.ok(normA);
			assert.equal(normA.fileID, 'fid-123');
			assert.equal(normA.name, 'doc.pdf');
			assert.equal(normA.size, 5000);
			assert.equal(normA.mimeType, 'application/pdf');
			assert.equal(normA.author, 'author-alice');
			assert.equal(normA.totalChunks, 5);

			const rawB = {
				FileID: 'fid-456',
				Name: 'video.mp4',
				Size: '120000',
				MIME: 'video/mp4',
				Author: 'author-bob',
				chunk_count: 12
			};
			const normB = normalizeAttachmentMeta(rawB);
			assert.ok(normB);
			assert.equal(normB.fileID, 'fid-456');
			assert.equal(normB.totalChunks, 12);
			assert.equal(normB.size, 120000);

			assert.equal(normalizeAttachmentMeta(null), null);
			assert.equal(normalizeAttachmentMeta({}), null);
			console.log('  ✓ normalizeAttachmentMeta verified');
		}

		// 3. Invite token parsing
		{
			const parsedHash = parseInviteInput('#room=rm-789&key=k-abc&inviter=inv-1&epoch=2&exp=999999&sig=sig-xyz');
			assert.equal(parsedHash.room, 'rm-789');
			assert.equal(parsedHash.key, 'k-abc');
			assert.equal(parsedHash.inviter, 'inv-1');
			assert.equal(parsedHash.epoch, 2);
			assert.equal(parsedHash.exp, 999999);
			assert.equal(parsedHash.sig, 'sig-xyz');

			const parsedUrl = parseInviteInput('https://example.com/room/private#room=rm-101&key=k-202');
			assert.equal(parsedUrl.room, 'rm-101');
			assert.equal(parsedUrl.key, 'k-202');

			// Preserve Base64 '+' and '=' characters verbatim instead of converting '+' to space
			const parsedPlus = parseInviteInput(
				'https://chat.cotilla.example/app/#room=rm+plus&key=abc+def/ghi==&inviter=peer+1&epoch=3&exp=123456&sig=sig+val/123=='
			);
			assert.equal(parsedPlus.room, 'rm+plus');
			assert.equal(parsedPlus.key, 'abc+def/ghi==');
			assert.equal(parsedPlus.inviter, 'peer+1');
			assert.equal(parsedPlus.epoch, 3);
			assert.equal(parsedPlus.sig, 'sig+val/123==');

			assert.throws(() => parseInviteInput(''), /Please enter an invite link/);
			assert.throws(() => parseInviteInput('#somethingelse'), /A room ID and decryption key are required/);
			console.log('  ✓ parseInviteInput verified');
		}

		// 4. Notifications store
		{
			notifications.clear();
			assert.equal(notifications.toasts.length, 0);

			const id1 = notifications.notifyInfo('Info message');
			const id2 = notifications.notifyError(new Error('Fatal error'), 'Title Error');
			assert.equal(notifications.toasts.length, 2);
			assert.equal(notifications.toasts[0].id, id1);
			assert.equal(notifications.toasts[0].kind, 'info');
			assert.equal(notifications.toasts[1].id, id2);
			assert.equal(notifications.toasts[1].kind, 'error');
			assert.equal(notifications.toasts[1].message, 'Fatal error');

			notifications.dismiss(id1);
			assert.equal(notifications.toasts.length, 1);
			assert.equal(notifications.toasts[0].id, id2);

			notifications.clear();
			assert.equal(notifications.toasts.length, 0);
			console.log('  ✓ NotificationStore verified');
		}

		// 5. UI store
		{
			ui.openSettings();
			assert.equal(ui.settingsOpen, true);
			ui.closeSettings();
			assert.equal(ui.settingsOpen, false);

			ui.openEvictDialog('peer-bob', 'Bob');
			assert.deepEqual(ui.evictTarget, { peer: 'peer-bob', shortAddr: 'Bob' });
			ui.closeEvictDialog();
			assert.equal(ui.evictTarget, null);

			ui.togglePin('cam:peer-1');
			assert.equal(ui.pinnedViewId, 'cam:peer-1');
			ui.togglePin('cam:peer-1');
			assert.equal(ui.pinnedViewId, null);

			// Mobile sidebar drawer
			assert.equal(ui.mobileSidebarOpen, false);
			ui.openMobileSidebar();
			assert.equal(ui.mobileSidebarOpen, true);
			ui.toggleMobileSidebar();
			assert.equal(ui.mobileSidebarOpen, false);
			ui.toggleMobileSidebar();
			assert.equal(ui.mobileSidebarOpen, true);
			ui.closeMobileSidebar();
			assert.equal(ui.mobileSidebarOpen, false);

			// Fullscreen state
			assert.equal(ui.isFullscreen, false);
			ui.setFullscreen(true);
			assert.equal(ui.isFullscreen, true);
			ui.setFullscreen(false);
			assert.equal(ui.isFullscreen, false);

			// Peer Context Menu
			assert.equal(ui.peerContextMenu, null);
			ui.openPeerContextMenu({
				peerAddr: 'peer-alice',
				shortAddr: 'Alice',
				x: 150,
				y: 200
			});
			assert.ok(ui.peerContextMenu);
			assert.equal(ui.peerContextMenu.peerAddr, 'peer-alice');
			assert.equal(ui.peerContextMenu.x, 150);
			ui.closePeerContextMenu();
			assert.equal(ui.peerContextMenu, null);

			// UI version
			assert.equal(typeof UI_VERSION, 'string');
			assert.ok(UI_VERSION.length > 0);

			console.log('  ✓ UIStore (mobile drawer, context menu, fullscreen) & UI_VERSION verified');
		}

		// 6. createRmsAudioMeter AudioContext cleanup
		{
			let closed = false;
			let disconnected = false;
			class MockAudioContext {
				state = 'running';
				createAnalyser() {
					return {
						fftSize: 256,
						frequencyBinCount: 128,
						getByteTimeDomainData(arr) {
							arr.fill(128);
						},
						disconnect() {
							disconnected = true;
						}
					};
				}
				createMediaStreamSource() {
					return {
						connect() {},
						disconnect() {
							disconnected = true;
						}
					};
				}
				async close() {
					closed = true;
					this.state = 'closed';
				}
			}

			globalThis.window = globalThis.window || {};
			globalThis.window.AudioContext = MockAudioContext;

			const mockStream = { getTracks: () => [] };
			const meter = createRmsAudioMeter(mockStream, () => {});
			meter.stop();

			assert.equal(closed, true, 'AudioContext must be closed when RMS meter stops');
			assert.equal(disconnected, true, 'Source and analyser must be disconnected');
			console.log('  ✓ createRmsAudioMeter disposal & AudioContext cleanup verified');
		}

		// 7. Platform storage & signaling URL defaults
		{
			const memSession = new Map();
			const memLocal = new Map();
			const createMockStorage = (map) => ({
				getItem: (k) => (map.has(k) ? map.get(k) : null),
				setItem: (k, v) => map.set(k, String(v)),
				removeItem: (k) => map.delete(k)
			});

			globalThis.window = {
				sessionStorage: createMockStorage(memSession),
				localStorage: createMockStorage(memLocal),
				location: { protocol: 'https:', host: 'chat.cotilla.test:8443', search: '', pathname: '/', hash: '' }
			};

			assert.equal(getDefaultSignalingUrl(), 'wss://chat.cotilla.test:8443/ws');
			globalThis.window.location.protocol = 'http:';
			globalThis.window.location.host = '127.0.0.1:8080';
			assert.equal(getDefaultSignalingUrl(), 'ws://127.0.0.1:8080/ws');

			saveRecentRooms([{ roomID: 'r1', roomKey: 'k1', createdAt: 100 }]);
			assert.equal(memLocal.size, 0, 'Recent rooms MUST NOT be persisted to localStorage');
			assert.equal(loadRecentRooms().length, 1);
			assert.equal(loadRecentRooms()[0].roomID, 'r1');

			clearRecentRoomsStorage();
			assert.equal(loadRecentRooms().length, 0);

			delete globalThis.window;
			assert.equal(getDefaultSignalingUrl(), 'ws://localhost:8080/ws');
			console.log('  ✓ sessionStorage recent rooms & getDefaultSignalingUrl verified');
		}

		// 8. CallGainMixer & combineLocalAudioStreams
		{
			const mixer = createCallGainMixer();
			assert.ok(mixer);
			const dummyStream = { getAudioTracks: () => [] };
			assert.equal(mixer.attachStream('peer-1', dummyStream, 1.5), dummyStream);
			mixer.setGain('peer-1', 1.8);
			mixer.detachStream('peer-1');
			mixer.destroy();

			assert.equal(combineLocalAudioStreams(null, null), null);
			const dummyTrack = { id: 't1' };
			const singleStream = { getAudioTracks: () => [dummyTrack] };
			const combined = combineLocalAudioStreams(singleStream, null);
			assert.equal(combined.track, dummyTrack);
			combined.destroy();

			console.log('  ✓ createCallGainMixer & combineLocalAudioStreams verified');
		}

		// 9. Audio processing constraints, storage persistence & pipeline fallback
		{
			const offConstraints = buildAudioTrackConstraints({
				noiseSuppressionMode: 'off',
				echoCancellationMode: 'off',
				autoGainControl: false,
				voiceIsolation: false
			});
			assert.equal(offConstraints.noiseSuppression, false);
			assert.equal(offConstraints.echoCancellation, false);
			assert.equal(offConstraints.autoGainControl, false);
			assert.equal(offConstraints.voiceIsolation, false);

			const builtinConstraints = buildAudioTrackConstraints({
				deviceId: 'usb-mic-1',
				noiseSuppressionMode: 'builtin',
				echoCancellationMode: 'builtin',
				autoGainControl: true,
				voiceIsolation: true
			});
			assert.deepEqual(builtinConstraints.deviceId, { exact: 'usb-mic-1' });
			assert.equal(builtinConstraints.noiseSuppression, true);
			assert.equal(builtinConstraints.echoCancellation, true);
			assert.equal(builtinConstraints.autoGainControl, true);
			assert.equal(builtinConstraints.voiceIsolation, true);

			assert.notEqual(
				audioHardwareConstraintKey({ noiseSuppressionMode: 'builtin' }),
				audioHardwareConstraintKey({ noiseSuppressionMode: 'off' })
			);

			const origWindow = globalThis.window;
			const origStorage = globalThis.localStorage;
			const backing = new Map();
			const mockStorage = {
				getItem: (k) => (backing.has(k) ? backing.get(k) : null),
				setItem: (k, v) => backing.set(k, String(v)),
				removeItem: (k) => backing.delete(k)
			};
			globalThis.window = { localStorage: mockStorage };
			globalThis.localStorage = mockStorage;
			try {
				assert.deepEqual(loadAudioProcessingPrefs(), {
					noiseSuppressionMode: 'builtin',
					echoCancellationMode: 'builtin',
					autoGainControl: true,
					voiceIsolation: true
				});
				mockStorage.setItem('cotilla_audio_processing', '{bad json');
				assert.equal(loadAudioProcessingPrefs().noiseSuppressionMode, 'builtin');

				saveAudioProcessingPrefs({
					noiseSuppressionMode: 'off',
					echoCancellationMode: 'off',
					autoGainControl: false,
					voiceIsolation: false
				});
				assert.deepEqual(loadAudioProcessingPrefs(), {
					noiseSuppressionMode: 'off',
					echoCancellationMode: 'off',
					autoGainControl: false,
					voiceIsolation: false
				});
			} finally {
				globalThis.window = origWindow;
				globalThis.localStorage = origStorage;
			}

			assert.equal(requiresNeuralAudioPipeline('builtin', 'builtin'), false);
			assert.equal(requiresNeuralAudioPipeline('off', 'off'), false);
			assert.ok(describeActiveAudioModes('builtin', 'builtin').includes('Built-in NS'));

			const statuses = [];
			const mockRaw = { getAudioTracks: () => [{ id: 't-raw' }] };
			const pass = await createAudioProcessingPipeline(mockRaw, {
				noiseSuppressionMode: 'builtin',
				echoCancellationMode: 'builtin',
				onStatusChange: (s) => statuses.push(s)
			});
			assert.equal(pass.stream, mockRaw);
			assert.equal(pass.isNeural, false);
			assert.equal(statuses.at(-1)?.state, 'active');
			pass.destroy();

			console.log('  ✓ Audio processing constraints, storage persistence & pipeline verified');
		}

		console.log('\n>>> ALL UTILS AND PLATFORM TESTS PASSED! <<<\n');
	} finally {
		await server.close();
	}
}

main().catch((err) => {
	console.error('Test execution failed:', err);
	process.exit(1);
});
