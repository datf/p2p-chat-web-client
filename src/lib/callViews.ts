import type { CallParticipant, CallView } from './types';

export function buildCallViews(
	participants: CallParticipant[],
	localCamStream?: MediaStream | null,
	localScreenStream?: MediaStream | null
): CallView[] {
	const views: CallView[] = [];

	for (const p of participants) {
		if (p.isLocal) {
			// Local participant
			views.push({
				id: `cam:${p.peerAddr}`,
				peerAddr: p.peerAddr,
				title: 'You',
				kind: 'participant',
				isLocal: true,
				hasAudio: p.hasAudio,
				hasVideo: !!(localCamStream && localCamStream.getVideoTracks().length > 0 && p.hasVideo),
				isSpeaking: p.isSpeaking,
				stream: localCamStream || undefined
			});

			if (localScreenStream && localScreenStream.getVideoTracks().length > 0) {
				views.push({
					id: `screen:${p.peerAddr}`,
					peerAddr: p.peerAddr,
					title: 'Your Screen',
					kind: 'screen',
					isLocal: true,
					hasAudio: false,
					hasVideo: true,
					isSpeaking: false,
					stream: localScreenStream,
					screenStartedAt: p.screenStartedAt || 0
				});
			}
		} else {
			// Remote participant
			const isSharingScreen = p.videoKind === 'screen';
			if (isSharingScreen && p.hasVideo && p.videoStream) {
				// Dedicated screen view
				views.push({
					id: `screen:${p.peerAddr}`,
					peerAddr: p.peerAddr,
					title: `${p.shortAddr}'s Screen`,
					kind: 'screen',
					isLocal: false,
					hasAudio: false,
					hasVideo: true,
					isSpeaking: false,
					stream: p.videoStream,
					screenStartedAt: p.screenStartedAt || 0
				});

				// Remote participant avatar tile
				views.push({
					id: `cam:${p.peerAddr}`,
					peerAddr: p.peerAddr,
					title: p.shortAddr,
					kind: 'participant',
					isLocal: false,
					hasAudio: p.hasAudio,
					hasVideo: false,
					isSpeaking: p.isSpeaking,
					stream: undefined
				});
			} else {
				views.push({
					id: `cam:${p.peerAddr}`,
					peerAddr: p.peerAddr,
					title: p.shortAddr,
					kind: 'participant',
					isLocal: false,
					hasAudio: p.hasAudio,
					hasVideo: p.hasVideo && !!p.videoStream,
					isSpeaking: p.isSpeaking,
					stream: p.videoStream
				});
			}
		}
	}

	return views;
}

export function sortCallViews(views: CallView[]): CallView[] {
	return [...views].sort((a, b) => {
		// 1. Screens first (FIFO by who started sharing first)
		if (a.kind === 'screen' && b.kind !== 'screen') return -1;
		if (b.kind === 'screen' && a.kind !== 'screen') return 1;

		if (a.kind === 'screen' && b.kind === 'screen') {
			const timeA = a.screenStartedAt || 0;
			const timeB = b.screenStartedAt || 0;
			if (timeA !== timeB) return timeA - timeB;
			return a.peerAddr.localeCompare(b.peerAddr);
		}

		// 2. Participants: people speaking first
		if (a.isSpeaking && !b.isSpeaking) return -1;
		if (!a.isSpeaking && b.isSpeaking) return 1;

		// 3. Alphabetical order by title
		const cmp = a.title.toLowerCase().localeCompare(b.title.toLowerCase());
		if (cmp !== 0) return cmp;

		return a.peerAddr.localeCompare(b.peerAddr);
	});
}

export interface StageLayoutResult {
	isSinglePane: boolean;
	stageView: CallView | null;
	carouselViews: CallView[];
	pinnedViewId: string | null;
}

export function computeStageLayout(
	sortedViews: CallView[],
	pinnedViewId: string | null
): StageLayoutResult {
	if (sortedViews.length === 0) {
		return {
			isSinglePane: false,
			stageView: null,
			carouselViews: [],
			pinnedViewId: null
		};
	}

	if (sortedViews.length === 1) {
		return {
			isSinglePane: true,
			stageView: sortedViews[0],
			carouselViews: [],
			pinnedViewId: null
		};
	}

	// Check if pinnedViewId exists in current views
	let validPinnedId = pinnedViewId;
	if (validPinnedId && !sortedViews.some((v) => v.id === validPinnedId)) {
		validPinnedId = null;
	}

	let stageView: CallView;
	if (validPinnedId) {
		stageView = sortedViews.find((v) => v.id === validPinnedId)!;
		// When pinned, keep the pinned tile in the carousel with its glowing grey border,
		// and include all other views in the carousel.
		return {
			isSinglePane: false,
			stageView,
			carouselViews: sortedViews,
			pinnedViewId: validPinnedId
		};
	}

	// 2 people or unpinned N people:
	// If 2 people, the other person takes most of the screen, your own user is in the carousel.
	// In general, pick the first remote view (preferring screen, then speaking remote, then alphabetical remote).
	const firstRemote = sortedViews.find((v) => !v.isLocal);
	stageView = firstRemote || sortedViews[0];

	// The remaining views go to the carousel
	const carouselViews = sortedViews.filter((v) => v.id !== stageView.id);

	return {
		isSinglePane: false,
		stageView,
		carouselViews,
		pinnedViewId: null
	};
}
