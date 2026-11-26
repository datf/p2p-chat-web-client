<script lang="ts">
	import { onDestroy } from 'svelte';
	import {
		cotilla,
		ui,
		notifications,
		createRmsAudioMeter,
		stopMediaStream,
		acquireAudioStream,
		createAudioProcessingPipeline,
		describeActiveAudioModes,
		mediaStream,
		copyTextToClipboard,
		getDefaultSignalingUrl,
		UI_VERSION,
		type RmsMeterHandle,
		type AudioProcessingPipeline,
		type AudioProcessorStatus,
		type NoiseSuppressionMode,
		type EchoCancellationMode
	} from '#lib';
	import Modal from './ui/Modal.svelte';
	import Icon from './ui/Icon.svelte';

	type SettingsTab = 'audio' | 'video' | 'security';
	let activeTab = $state<SettingsTab>('audio');

	interface AcousticOption<T extends string> {
		value: T;
		label: string;
		badge?: string;
		description: string;
	}

	const NOISE_SUPPRESSION_OPTIONS: readonly AcousticOption<NoiseSuppressionMode>[] = [
		{
			value: 'off',
			label: 'Off',
			description: 'Raw microphone audio with no background noise filtering'
		},
		{
			value: 'builtin',
			label: 'Built-in Browser DSP',
			badge: 'Default',
			description: 'Hardware-accelerated browser filtering and voice isolation'
		}
	];

	const ECHO_CANCELLATION_OPTIONS: readonly AcousticOption<EchoCancellationMode>[] = [
		{
			value: 'off',
			label: 'Off',
			description: 'Best for headphones when you want zero nonlinear voice gating'
		},
		{
			value: 'builtin',
			label: 'Built-in Browser AEC',
			badge: 'Default',
			description: 'Time-aligned browser echo canceller (recommended for speakers & headsets)'
		}
	];

	let micTesting = $state(false);
	let micTestLevel = $state(0);
	let micTestStatus = $state<AudioProcessorStatus>({ state: 'idle' });
	let monitorHeadphones = $state(false);
	let rawTrackSettings = $state<MediaTrackSettings | null>(null);
	let micMeterHandle: RmsMeterHandle | null = null;
	let micTestRawStream: MediaStream | null = null;
	let micTestStream = $state<MediaStream | null>(null);
	let micTestPipeline: AudioProcessingPipeline | null = null;
	let micTestGeneration = 0;

	let camTesting = $state(false);
	let camTestStream = $state<MediaStream | null>(null);

	let signalingInput = $state(cotilla.resolveSignalingUrl());
	let keyCopied = $state(false);

	$effect(() => {
		if (ui.settingsOpen) {
			signalingInput = cotilla.resolveSignalingUrl();
			cotilla.refreshDevices().then((list) => {
				if (list.audioInputs.length && !cotilla.selectedAudioInputId) {
					cotilla.selectedAudioInputId = list.audioInputs[0].deviceId;
				}
				if (list.audioOutputs.length && !cotilla.selectedAudioOutputId) {
					cotilla.selectedAudioOutputId = list.audioOutputs[0].deviceId;
				}
				if (list.videoInputs.length && !cotilla.selectedVideoInputId) {
					cotilla.selectedVideoInputId = list.videoInputs[0].deviceId;
				}
			});
		} else {
			stopTests();
		}
	});

	onDestroy(() => {
		stopTests();
	});

	function cleanupMicTestHandles() {
		micTestLevel = 0;
		rawTrackSettings = null;
		if (micMeterHandle) {
			micMeterHandle.stop();
			micMeterHandle = null;
		}
		if (micTestPipeline) {
			micTestPipeline.destroy();
			micTestPipeline = null;
		}
		if (micTestStream) {
			stopMediaStream(micTestStream);
			micTestStream = null;
		}
		if (micTestRawStream) {
			stopMediaStream(micTestRawStream);
			micTestRawStream = null;
		}
	}

	async function startMicTest() {
		const gen = ++micTestGeneration;
		cleanupMicTestHandles();
		micTesting = true;
		micTestStatus = { state: 'initializing', message: 'Opening microphone…' };
		try {
			const constraintOpts = cotilla.devices.getAudioConstraintsOptions(
				cotilla.selectedAudioInputId || undefined
			);
			const rawStream = await acquireAudioStream(constraintOpts);
			if (gen !== micTestGeneration || !micTesting || !ui.settingsOpen) {
				stopMediaStream(rawStream);
				return;
			}
			micTestRawStream = rawStream;
			rawTrackSettings = rawStream.getAudioTracks()[0]?.getSettings?.() || null;

			const pipeline = await createAudioProcessingPipeline(rawStream, {
				noiseSuppressionMode: cotilla.noiseSuppressionMode,
				echoCancellationMode: cotilla.echoCancellationMode,
				onStatusChange: (status) => {
					if (gen === micTestGeneration) {
						micTestStatus = status;
					}
				}
			});
			if (gen !== micTestGeneration || !micTesting || !ui.settingsOpen) {
				pipeline.destroy();
				stopMediaStream(rawStream);
				if (micTestRawStream === rawStream) micTestRawStream = null;
				return;
			}
			micTestPipeline = pipeline;
			micTestStream = pipeline.stream;
			micMeterHandle = createRmsAudioMeter(
				pipeline.stream,
				(level) => {
					micTestLevel = level;
				},
				60
			);
		} catch (err: unknown) {
			if (gen === micTestGeneration) {
				stopMicTest();
				notifications.notifyError(err, 'Microphone Test Error');
			}
		}
	}

	async function toggleMicTest() {
		if (micTesting) {
			stopMicTest();
			return;
		}
		await startMicTest();
	}

	function stopMicTest() {
		micTestGeneration += 1;
		micTesting = false;
		monitorHeadphones = false;
		micTestStatus = { state: 'idle' };
		cleanupMicTestHandles();
	}

	const activeAudioStatus = $derived(micTesting ? micTestStatus : cotilla.audioProcessorStatus);
	const activeAudioSummary = $derived(
		describeActiveAudioModes(cotilla.noiseSuppressionMode, cotilla.echoCancellationMode)
	);

	function restartMicTestIfActive() {
		if (!micTesting) return;
		queueMicrotask(() => {
			if (micTesting) void startMicTest();
		});
	}

	async function toggleCamTest() {
		if (camTesting) {
			stopCamTest();
			return;
		}
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				video: cotilla.selectedVideoInputId ? { deviceId: { exact: cotilla.selectedVideoInputId } } : true
			});
			camTestStream = stream;
			camTesting = true;
		} catch (err: unknown) {
			notifications.notifyError(err, 'Camera Test Error');
		}
	}

	function stopCamTest() {
		camTesting = false;
		if (camTestStream) {
			stopMediaStream(camTestStream);
			camTestStream = null;
		}
	}

	function stopTests() {
		stopMicTest();
		stopCamTest();
	}

	function reconnectSignalingIfActive() {
		if (cotilla.client && cotilla.inRoom) {
			cotilla.client.disconnectSignaling?.();
			cotilla.client.connectSignaling?.();
		}
	}

	function handleSaveSignaling() {
		cotilla.setSignalingUrl(signalingInput.trim());
		notifications.notifySuccess('Signaling URL saved.');
		reconnectSignalingIfActive();
	}

	function handleResetSignaling() {
		cotilla.setSignalingUrl('');
		signalingInput = getDefaultSignalingUrl();
		notifications.notifySuccess('Reset signaling URL to host default.');
		reconnectSignalingIfActive();
	}

	async function copyPublicKey() {
		if (!cotilla.me?.address) return;
		const ok = await copyTextToClipboard(cotilla.me.address);
		if (ok) {
			keyCopied = true;
			notifications.notifySuccess('Public key copied to clipboard');
			setTimeout(() => (keyCopied = false), 2000);
		} else {
			notifications.notifyError('Failed to copy public key');
		}
	}
</script>

<Modal open={ui.settingsOpen} maxWidth="max-w-4xl" noPadding={true} onclose={() => ui.closeSettings()}>
	<div class="w-full flex flex-col md:flex-row overflow-hidden max-h-[90dvh] bg-surface-container-lowest">
		<!-- Left Navigation Bar -->
		<aside class="w-full md:w-64 bg-surface-container-low border-b md:border-b-0 md:border-r border-white/5 flex flex-col justify-between p-4 shrink-0">
			<div class="flex flex-col gap-4">
				<div class="flex items-center justify-between">
					<div class="flex flex-col">
						<span class="font-headline text-xs text-outline uppercase tracking-wider font-semibold">Preferences</span>
						<span class="font-headline text-base font-bold text-on-surface">Settings</span>
					</div>
					<span class="font-code text-[10px] px-2 py-0.5 rounded-md bg-surface-container-high text-primary">v{UI_VERSION}</span>
				</div>

				<nav class="flex flex-row md:flex-col gap-1.5 overflow-x-auto pb-1 md:pb-0">
					<button
						type="button"
						class="flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-sm font-headline transition-colors cursor-pointer shrink-0 {activeTab === 'audio'
							? 'bg-surface-container-high text-primary font-semibold shadow-sm'
							: 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'}"
						onclick={() => (activeTab = 'audio')}
					>
						<Icon name="mic" class="text-[18px]" />
						<span>Voice & Audio</span>
					</button>

					<button
						type="button"
						class="flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-sm font-headline transition-colors cursor-pointer shrink-0 {activeTab === 'video'
							? 'bg-surface-container-high text-primary font-semibold shadow-sm'
							: 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'}"
						onclick={() => (activeTab = 'video')}
					>
						<Icon name="videocam" class="text-[18px]" />
						<span>Video & Camera</span>
					</button>

					<button
						type="button"
						class="flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-sm font-headline transition-colors cursor-pointer shrink-0 {activeTab === 'security'
							? 'bg-surface-container-high text-primary font-semibold shadow-sm'
							: 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'}"
						onclick={() => (activeTab = 'security')}
					>
						<Icon name="security" class="text-[18px]" />
						<span>Zero-Knowledge</span>
					</button>
				</nav>
			</div>

			<div class="pt-4 border-t border-white/5 text-[11px] font-code text-outline hidden md:block">
				Resonate E2EE • v{UI_VERSION}
			</div>
		</aside>

		<!-- Right Tab Content -->
		<div class="flex-1 flex flex-col min-h-0 bg-surface-container-lowest">
			<div class="p-4 px-6 border-b border-white/5 flex items-center justify-between">
				<h2 class="font-headline text-lg font-bold text-on-surface">
					{activeTab === 'audio'
						? 'Voice & Audio Preferences'
						: activeTab === 'video'
							? 'Camera & Video Preferences'
							: 'Zero-Knowledge Security & Identity'}
				</h2>
				<button
					type="button"
					class="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
					onclick={() => ui.closeSettings()}
					aria-label="Close settings"
				>
					<Icon name="close" class="text-[20px]" />
				</button>
			</div>

			<div class="p-6 overflow-y-auto flex-1 flex flex-col gap-6">
				{#if activeTab === 'audio'}
					<div class="flex flex-col gap-2">
						<label for="mic-select" class="font-headline text-xs font-semibold text-outline uppercase tracking-wider">
							Input Device (Microphone)
						</label>
						<select
							id="mic-select"
							bind:value={cotilla.selectedAudioInputId}
							onchange={restartMicTestIfActive}
							class="w-full bg-surface-container-low border border-white/10 rounded-xl px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:border-primary"
						>
							{#each cotilla.availableAudioInputs as dev (dev.deviceId)}
								<option value={dev.deviceId}>{dev.label || `Microphone ${dev.deviceId.slice(0, 5)}`}</option>
							{/each}
							{#if cotilla.availableAudioInputs.length === 0}
								<option value="">Default System Microphone</option>
							{/if}
						</select>
					</div>

					<div class="flex flex-col gap-2">
						<label for="speaker-select" class="font-headline text-xs font-semibold text-outline uppercase tracking-wider">
							Output Device (Speakers / Headphones)
						</label>
						<select
							id="speaker-select"
							bind:value={cotilla.selectedAudioOutputId}
							class="w-full bg-surface-container-low border border-white/10 rounded-xl px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:border-primary"
						>
							{#each cotilla.availableAudioOutputs as dev (dev.deviceId)}
								<option value={dev.deviceId}>{dev.label || `Speaker ${dev.deviceId.slice(0, 5)}`}</option>
							{/each}
							{#if cotilla.availableAudioOutputs.length === 0}
								<option value="">Default System Output</option>
							{/if}
						</select>
					</div>

					<div class="p-4 rounded-2xl bg-surface-container-low border border-white/5 flex flex-col gap-3">
						<div class="flex items-center justify-between">
							<div class="flex flex-col">
								<span class="font-headline text-sm font-semibold text-on-surface">Microphone Test</span>
								<span class="font-body text-xs text-on-surface-variant">Check input sensitivity before entering live voice calls</span>
							</div>
							<button
								type="button"
								class="px-4 py-1.5 rounded-full text-xs font-headline font-semibold transition-all cursor-pointer {micTesting
									? 'bg-error text-on-error'
									: 'bg-primary text-on-primary hover:bg-primary-fixed'}"
								onclick={toggleMicTest}
							>
								{micTesting ? 'Stop Test' : 'Test Mic'}
							</button>
						</div>

						<div class="w-full bg-surface-container-highest h-2.5 rounded-full overflow-hidden">
							<div
								class="h-full bg-primary transition-all duration-75 rounded-full"
								style="width: {micTestLevel}%;"
							></div>
						</div>

						{#if micTesting}
							<div class="flex items-center justify-between gap-3 pt-1 flex-wrap">
								<label class="flex items-center gap-2 text-xs text-on-surface-variant cursor-pointer select-none">
									<input
										type="checkbox"
										bind:checked={monitorHeadphones}
										class="accent-primary w-3.5 h-3.5 rounded cursor-pointer"
									/>
									<span>Listen in headphones (local monitor)</span>
								</label>
								{#if rawTrackSettings}
									<span class="text-[11px] font-code text-outline">
										Capture: EC:{rawTrackSettings.echoCancellation ? 'on' : 'off'} NS:{rawTrackSettings.noiseSuppression ? 'on' : 'off'} AGC:{rawTrackSettings.autoGainControl ? 'on' : 'off'}
									</span>
								{/if}
							</div>
							{#if monitorHeadphones && micTestStream}
								<audio
									use:mediaStream={{
										stream: micTestStream,
										sinkId: cotilla.selectedAudioOutputId,
										volume: 1.0
									}}
									autoplay
									playsinline
								></audio>
							{/if}
						{/if}

						{#if micTesting || cotilla.callJoined || activeAudioStatus.state !== 'idle'}
							<div class="flex items-center justify-between gap-2 pt-1 text-xs">
								<span class="font-body text-on-surface-variant truncate">{activeAudioSummary}</span>
								<span
									class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-code text-[11px] shrink-0 {activeAudioStatus.state === 'error'
										? 'bg-error/15 text-error'
										: activeAudioStatus.overloadWarning || activeAudioStatus.state === 'fallback'
											? 'bg-amber-500/15 text-amber-300'
											: activeAudioStatus.state === 'initializing'
												? 'bg-primary/15 text-primary'
												: activeAudioStatus.state === 'active'
													? 'bg-emerald-500/15 text-emerald-300'
													: 'bg-surface-container-high text-on-surface-variant'}"
								>
									<span
										class="w-1.5 h-1.5 rounded-full {activeAudioStatus.state === 'error'
											? 'bg-error'
											: activeAudioStatus.overloadWarning || activeAudioStatus.state === 'fallback'
												? 'bg-amber-400'
												: activeAudioStatus.state === 'initializing'
													? 'bg-primary animate-pulse'
													: activeAudioStatus.state === 'active'
														? 'bg-emerald-400'
														: 'bg-outline'}"
									></span>
									<span>{activeAudioStatus.message || activeAudioStatus.state}</span>
								</span>
							</div>
						{/if}
					</div>

					<fieldset class="flex flex-col gap-2 border-0 p-0 m-0">
						<legend class="font-headline text-xs font-semibold text-outline uppercase tracking-wider mb-2">
							Noise Suppression
						</legend>
						{#each NOISE_SUPPRESSION_OPTIONS as opt (opt.value)}
							{@const optId = `ns-mode-${opt.value}`}
							<div class="flex items-start gap-3 p-3 rounded-xl bg-surface-container-low border border-white/5 hover:border-white/10 has-checked:border-primary/40 has-checked:bg-primary/5 transition-colors">
								<input
									id={optId}
									type="radio"
									name="noise-suppression-mode"
									value={opt.value}
									bind:group={cotilla.noiseSuppressionMode}
									onchange={restartMicTestIfActive}
									class="accent-primary w-4 h-4 mt-0.5 cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
								/>
								<label for={optId} class="flex flex-col flex-1 cursor-pointer select-none">
									<div class="flex items-center gap-2 flex-wrap">
										<span class="font-headline text-sm font-semibold text-on-surface">{opt.label}</span>
										{#if opt.badge}
											<span class="px-2 py-0.5 rounded-full bg-surface-container-high text-[10px] font-code text-on-surface-variant">
												{opt.badge}
											</span>
										{/if}
									</div>
									<span class="font-body text-xs text-on-surface-variant">{opt.description}</span>
								</label>
							</div>
						{/each}

						{#if cotilla.noiseSuppressionMode === 'builtin'}
							<div class="flex items-start gap-3 p-3 rounded-xl bg-surface-container-low/70 border border-white/5 ml-3 hover:border-white/10 transition-colors">
								<input
									id="voice-isolation-toggle"
									type="checkbox"
									bind:checked={cotilla.voiceIsolation}
									onchange={restartMicTestIfActive}
									class="accent-primary w-4 h-4 mt-0.5 rounded cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
								/>
								<label for="voice-isolation-toggle" class="flex flex-col flex-1 cursor-pointer select-none">
									<span class="font-headline text-sm font-semibold text-on-surface">
										Voice Isolation & Typing Detection
									</span>
									<span class="font-body text-xs text-on-surface-variant">
										Enables browser typing-noise suppression and focused speech isolation
									</span>
								</label>
							</div>
						{/if}
					</fieldset>

					<fieldset class="flex flex-col gap-2 border-0 p-0 m-0">
						<legend class="font-headline text-xs font-semibold text-outline uppercase tracking-wider mb-2">
							Echo Cancellation
						</legend>
						{#each ECHO_CANCELLATION_OPTIONS as opt (opt.value)}
							{@const optId = `ec-mode-${opt.value}`}
							<div class="flex items-start gap-3 p-3 rounded-xl bg-surface-container-low border border-white/5 hover:border-white/10 has-checked:border-primary/40 has-checked:bg-primary/5 transition-colors">
								<input
									id={optId}
									type="radio"
									name="echo-cancellation-mode"
									value={opt.value}
									bind:group={cotilla.echoCancellationMode}
									onchange={restartMicTestIfActive}
									class="accent-primary w-4 h-4 mt-0.5 cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
								/>
								<label for={optId} class="flex flex-col flex-1 cursor-pointer select-none">
									<div class="flex items-center gap-2 flex-wrap">
										<span class="font-headline text-sm font-semibold text-on-surface">{opt.label}</span>
										{#if opt.badge}
											<span class="px-2 py-0.5 rounded-full bg-surface-container-high text-[10px] font-code text-on-surface-variant">
												{opt.badge}
											</span>
										{/if}
									</div>
									<span class="font-body text-xs text-on-surface-variant">{opt.description}</span>
								</label>
							</div>
						{/each}

					</fieldset>

					<fieldset class="flex flex-col gap-2 border-0 p-0 m-0">
						<legend class="font-headline text-xs font-semibold text-outline uppercase tracking-wider mb-2">
							Gain & Local Processing
						</legend>
						<div class="flex items-start gap-3 p-3 rounded-xl bg-surface-container-low border border-white/5 hover:border-white/10 transition-colors">
							<input
								id="agc-toggle"
								type="checkbox"
								bind:checked={cotilla.autoGainControl}
								onchange={restartMicTestIfActive}
								class="accent-primary w-4 h-4 mt-0.5 rounded cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
							/>
							<label for="agc-toggle" class="flex flex-col flex-1 cursor-pointer select-none">
								<span class="font-headline text-sm font-semibold text-on-surface">
									Automatic Gain Control
								</span>
								<span class="font-body text-xs text-on-surface-variant">
									Normalizes quiet and loud microphone speech levels
								</span>
							</label>
						</div>
					</fieldset>
				{:else if activeTab === 'video'}
					<div class="flex flex-col gap-2">
						<label for="cam-select" class="font-headline text-xs font-semibold text-outline uppercase tracking-wider">
							Camera Device
						</label>
						<select
							id="cam-select"
							bind:value={cotilla.selectedVideoInputId}
							class="w-full bg-surface-container-low border border-white/10 rounded-xl px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:border-primary"
						>
							{#each cotilla.availableVideoInputs as dev (dev.deviceId)}
								<option value={dev.deviceId}>{dev.label || `Camera ${dev.deviceId.slice(0, 5)}`}</option>
							{/each}
							{#if cotilla.availableVideoInputs.length === 0}
								<option value="">Default Web Camera</option>
							{/if}
						</select>
					</div>

					<div class="flex flex-col gap-3">
						<div class="flex items-center justify-between">
							<span class="font-headline text-sm font-semibold text-on-surface">Video Preview</span>
							<button
								type="button"
								class="px-4 py-1.5 rounded-full text-xs font-headline font-semibold transition-all cursor-pointer {camTesting
									? 'bg-error text-on-error'
									: 'bg-primary text-on-primary hover:bg-primary-fixed'}"
								onclick={toggleCamTest}
							>
								{camTesting ? 'Stop Camera' : 'Test Camera'}
							</button>
						</div>

						<div class="w-full aspect-video rounded-2xl bg-surface-container-low border border-white/10 overflow-hidden flex items-center justify-center relative">
							<video
								use:mediaStream={{ stream: camTestStream }}
								autoplay
								playsinline
								muted
								class="w-full h-full object-cover scale-x-[-1] {camTesting ? 'block' : 'hidden'}"
							></video>
							{#if !camTesting}
								<div class="flex flex-col items-center gap-2 text-on-surface-variant">
									<Icon name="videocam" class="text-4xl text-outline-variant" />
									<span class="font-headline text-xs">Click "Test Camera" to preview feed</span>
								</div>
							{/if}
						</div>
					</div>
				{:else if activeTab === 'security'}
					<div class="flex flex-col gap-2">
						<span class="font-headline text-xs font-semibold text-outline uppercase tracking-wider">
							Your Ed25519 Public Identity Key
						</span>
						<div class="flex items-center gap-2">
							<input
								type="text"
								readonly
								value={cotilla.me?.address || 'Loading...'}
								class="flex-1 bg-surface-container-low border border-white/10 rounded-xl px-3 py-2 font-code text-xs text-primary focus:outline-none select-all"
							/>
							<button
								type="button"
								class="px-4 py-2 rounded-xl bg-surface-container-high hover:bg-surface-bright text-xs font-headline font-semibold text-on-surface transition-colors shrink-0 cursor-pointer"
								onclick={copyPublicKey}
							>
								{keyCopied ? 'Copied!' : 'Copy Key'}
							</button>
						</div>
						<p class="font-body text-xs text-on-surface-variant">
							Used to sign channel invitations and catch-up envelopes. Ephemeral, non-persistent memory seed.
						</p>
					</div>

					<div class="p-4 rounded-2xl bg-surface-container-low border border-white/5 flex flex-col gap-3">
						<div class="flex items-center justify-between">
							<div class="flex flex-col">
								{#if import.meta.env.DEV}
									<span class="font-headline text-sm font-semibold text-on-surface">Epoch Key Ratchet</span>
									<span class="font-body text-xs text-on-surface-variant">
										Active Epoch: <strong class="text-primary font-code">Epoch {cotilla.activeEpoch}</strong>
									</span>
								{:else}
									<span class="font-headline text-sm font-semibold text-on-surface">End-to-End Encryption</span>
									<span class="font-body text-xs text-on-surface-variant">
										Status: <strong class="text-primary font-code">Encrypted E2E</strong>
									</span>
								{/if}
							</div>
							{#if import.meta.env.DEV}
								<button
									type="button"
									class="px-4 py-1.5 rounded-full bg-surface-container-highest hover:bg-surface-bright text-xs font-headline font-semibold text-primary border border-primary/20 transition-all active:scale-95 cursor-pointer"
									onclick={() => cotilla.rotateKey()}
								>
									Rotate Key Now
								</button>
							{/if}
						</div>
						<p class="font-body text-xs text-outline">
							{#if import.meta.env.DEV}
								Advancing the epoch key distributes new forward-secret encryption keys pairwise to admitted active peers.
							{:else}
								All messages and media streams use forward-secret encryption keys distributed pairwise to admitted active peers.
							{/if}
						</p>
					</div>

					<div class="flex flex-col gap-2">
						<label for="sig-url" class="font-headline text-xs font-semibold text-outline uppercase tracking-wider">
							Signaling WebSocket Server URL
						</label>
						<div class="flex items-center gap-2">
							<input
								id="sig-url"
								type="text"
								bind:value={signalingInput}
								placeholder="wss://..."
								class="flex-1 bg-surface-container-low border border-white/10 rounded-xl px-3 py-2 font-code text-xs text-on-surface focus:outline-none focus:border-primary"
							/>
							<button
								type="button"
								class="px-4 py-2 rounded-xl bg-primary text-on-primary hover:bg-primary-fixed text-xs font-headline font-semibold transition-all shrink-0 cursor-pointer"
								onclick={handleSaveSignaling}
							>
								Save
							</button>
							<button
								type="button"
								class="px-3 py-2 rounded-xl bg-surface-container-high hover:bg-surface-bright text-xs font-headline font-semibold text-on-surface transition-all shrink-0 cursor-pointer"
								onclick={handleResetSignaling}
								title="Reset to default signaling server"
							>
								Reset
							</button>
						</div>
					</div>
				{/if}
			</div>

			<div class="p-4 px-6 border-t border-white/5 bg-surface-container-low flex justify-end">
				<button
					type="button"
					class="px-5 py-2 rounded-full bg-primary text-on-primary hover:bg-primary-fixed font-headline text-xs font-semibold tracking-wide uppercase transition-all shadow-sm cursor-pointer active:scale-95"
					onclick={() => ui.closeSettings()}
				>
					Done
				</button>
			</div>
		</div>
	</div>
</Modal>
