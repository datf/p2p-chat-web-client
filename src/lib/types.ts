export type LayoutMode = 'stage' | 'split';

export interface PeerInfo {
	address: string;
	shortAddress: string;
	isDirect: boolean;
	isSpeaking: boolean;
	hasAudio: boolean;
	hasVideo: boolean;
	invitedBy?: string;
	latencyMs?: number;
}

export interface ChatMessage {
	id: string;
	type: 'text';
	author: string;
	shortAuthor: string;
	text: string;
	ts: number;
	mine: boolean;
	scopeID: string;
}

export interface AttachmentItem {
	id: string;
	type: 'attachment';
	fileID: string;
	name: string;
	size: number;
	formattedSize: string;
	mimeType: string;
	author: string;
	shortAuthor: string;
	ts: number;
	mine: boolean;
	isOffer: boolean;
	blobUrl?: string;
	progress: number;
	receivedChunks: number;
	totalChunks: number;
	scopeID: string;
}

export type TimelineItem = ChatMessage | AttachmentItem;

export interface CallParticipant {
	peerAddr: string;
	shortAddr: string;
	isLocal: boolean;
	hasAudio: boolean;
	hasVideo: boolean;
	isSpeaking: boolean;
	videoKind?: 'cam' | 'screen';
	audioStream?: MediaStream;
	videoStream?: MediaStream;
	screenStartedAt?: number;
}

export interface CallView {
	id: string; // "cam:<peerAddr>" or "screen:<peerAddr>"
	peerAddr: string;
	title: string;
	kind: 'participant' | 'screen';
	isLocal: boolean;
	hasAudio: boolean;
	hasVideo: boolean;
	isSpeaking: boolean;
	stream?: MediaStream;
	screenStartedAt?: number;
}

export interface SessionTab {
	id: string; // "main" or peer address
	name: string;
	isDM: boolean;
	peerAddr?: string;
	roomID?: string;
	roomKey?: string;
	unreadCount: number;
}

export interface RecentRoom {
	roomID: string;
	roomKey: string;
	name: string;
	link: string;
	joinedAt: number;
}

export interface DMInvitePayload {
	from: string;
	title: string;
	raw: unknown;
	inv?: {
		from_sign_pub?: string;
		[key: string]: any;
	};
	pay?: {
		from?: string;
		room_id?: string;
		room_key?: string;
		title?: string;
		[key: string]: any;
	};
}

export type ToastKind = 'info' | 'error' | 'success';

export interface ToastItem {
	id: string;
	kind: ToastKind;
	message: string;
	title?: string;
}

export type NoiseSuppressionMode = 'off' | 'builtin';
export type EchoCancellationMode = 'off' | 'builtin';

export type AudioProcessorStatusState = 'idle' | 'initializing' | 'active' | 'fallback' | 'error';

export interface AudioProcessorStatus {
	state: AudioProcessorStatusState;
	message?: string;
	overloadWarning?: boolean;
}

export interface AudioProcessingPrefs {
	noiseSuppressionMode: NoiseSuppressionMode;
	echoCancellationMode: EchoCancellationMode;
	autoGainControl: boolean;
	voiceIsolation: boolean;
}
