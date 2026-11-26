export function short(addr: string | null | undefined): string {
	if (!addr) return '...';
	return addr.length > 8 ? addr.slice(0, 8) : addr;
}

export function formatBytes(bytes: number): string {
	if (!bytes || bytes === 0) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function formatTime(ts: number): string {
	const d = new Date(ts);
	return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDuration(sec: number): string {
	const m = Math.floor(sec / 60);
	const s = sec % 60;
	return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function formatError(err: unknown): string {
	if (typeof err === 'string') return err;
	if (err && typeof err === 'object' && 'message' in err && typeof (err as any).message === 'string') {
		return (err as any).message;
	}
	return 'An unexpected error occurred';
}

export interface NormalizedAttachmentMeta {
	fileID: string;
	name: string;
	size: number;
	mimeType: string;
	author: string;
	timestamp: number;
	totalChunks: number;
}

export function normalizeAttachmentMeta(meta: any, fallbackAuthor = 'Peer'): NormalizedAttachmentMeta | null {
	if (!meta || typeof meta !== 'object') return null;
	const fileID = meta.file_id || meta.FileID || meta.fileID;
	if (!fileID) return null;

	const name = meta.name || meta.Name || 'file.bin';
	const size = Number(meta.size || meta.Size || 0);
	const mimeType = meta.mime || meta.MIME || 'application/octet-stream';
	const author = meta.author_pub_key || meta.author || meta.Author || fallbackAuthor;
	const timestamp = Number(meta.timestamp || Date.now());
	const totalChunks = Math.max(1, Number(meta.total_chunks || meta.chunk_count || meta.ChunkCount || 1));

	return {
		fileID,
		name,
		size,
		mimeType,
		author,
		timestamp,
		totalChunks
	};
}

export interface ParsedInviteToken {
	room: string;
	key: string;
	rawHash: string;
	inviter?: string;
	epoch?: number;
	exp?: number;
	sig?: string;
}

export function parseInviteInput(input: string): ParsedInviteToken {
	const token = input.trim();
	if (!token) {
		throw new Error('Please enter an invite link or room token.');
	}

	const hashIndex = token.indexOf('#');
	const queryOrHash = hashIndex !== -1 ? token.slice(hashIndex + 1) : token;

	// Manual query parsing (matching CotillaClient.parseLink) so '+' characters in
	// unencoded base64 keys/signatures are never turned into spaces by URLSearchParams.
	let room: string | null = null;
	let key: string | null = null;
	let inviter: string | undefined;
	let epoch: number | undefined;
	let exp: number | undefined;
	let sig: string | undefined;

	for (const pair of queryOrHash.split('&')) {
		const eq = pair.indexOf('=');
		if (eq === -1) continue;
		let k = pair.slice(0, eq).trim();
		let v = pair.slice(eq + 1).trim();
		try {
			k = decodeURIComponent(k);
		} catch {}
		try {
			v = decodeURIComponent(v);
		} catch {}
		if (k === 'room') room = v;
		else if (k === 'key') key = v;
		else if (k === 'inviter') inviter = v || undefined;
		else if (k === 'epoch') {
			const parsedEpoch = parseInt(v, 10);
			if (!Number.isNaN(parsedEpoch)) epoch = parsedEpoch;
		} else if (k === 'exp') {
			const parsedExp = parseInt(v, 10);
			if (!Number.isNaN(parsedExp)) exp = parsedExp;
		} else if (k === 'sig') sig = v || undefined;
	}

	if (!room || !key) {
		throw new Error(
			'Invalid invite link or token. A room ID and decryption key are required (e.g. #room=...&key=...).'
		);
	}

	const normalizedHash = token.startsWith('#')
		? token
		: hashIndex !== -1
			? token.slice(hashIndex)
			: `#${token}`;

	return {
		room,
		key,
		rawHash: normalizedHash,
		inviter,
		epoch,
		exp,
		sig
	};
}
