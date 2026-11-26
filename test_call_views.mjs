import assert from 'node:assert/strict';
import { buildCallViews, sortCallViews, computeStageLayout } from './src/lib/callViews.ts';

console.log('Testing callViews.ts...');

// 1. Single person test -> 1x1 full pane
{
	const participants = [
		{
			peerAddr: 'alice123',
			shortAddr: 'Alice',
			isLocal: true,
			hasAudio: true,
			hasVideo: true,
			isSpeaking: false,
			videoKind: 'cam'
		}
	];
	const views = buildCallViews(participants);
	assert.equal(views.length, 1);
	const sorted = sortCallViews(views);
	const layout = computeStageLayout(sorted, null);
	assert.equal(layout.isSinglePane, true);
	assert.equal(layout.stageView.id, 'cam:alice123');
	assert.equal(layout.carouselViews.length, 0);
	console.log('  ✓ 1 person -> 1x1 single pane verified');
}

// 2. Two people test -> other person is large on stage, local user small in carousel
{
	const participants = [
		{
			peerAddr: 'alice123',
			shortAddr: 'Alice',
			isLocal: true,
			hasAudio: true,
			hasVideo: true,
			isSpeaking: true, // even if Alice is speaking, remote Bob is the primary view
			videoKind: 'cam'
		},
		{
			peerAddr: 'bob456',
			shortAddr: 'Bob',
			isLocal: false,
			hasAudio: true,
			hasVideo: true,
			isSpeaking: false,
			videoKind: 'cam'
		}
	];
	const views = buildCallViews(participants);
	assert.equal(views.length, 2);
	const sorted = sortCallViews(views);
	const layout = computeStageLayout(sorted, null);
	assert.equal(layout.isSinglePane, false);
	assert.equal(layout.stageView.peerAddr, 'bob456', 'Remote peer Bob should be stage view in 2-person call');
	assert.equal(layout.carouselViews.length, 1);
	assert.equal(layout.carouselViews[0].peerAddr, 'alice123', 'Local user Alice should be in carousel in 2-person call');
	console.log('  ✓ 2 people -> other person on stage, local user in carousel verified');
}

// 3. Multi-peer (3+ peers per AGENTS.md) + concurrent screen shares
// Sorting order: screens (FIFO screenStartedAt), speaking first, alphabetical
{
	const participants = [
		{
			peerAddr: 'addr_dan',
			shortAddr: 'Dan',
			isLocal: false,
			hasAudio: true,
			hasVideo: false,
			isSpeaking: false
		},
		{
			peerAddr: 'addr_alice',
			shortAddr: 'Alice',
			isLocal: true,
			hasAudio: true,
			hasVideo: false,
			isSpeaking: false
		},
		{
			peerAddr: 'addr_charlie',
			shortAddr: 'Charlie',
			isLocal: false,
			hasAudio: true,
			hasVideo: true,
			isSpeaking: true,
			videoKind: 'screen',
			screenStartedAt: 1000,
			videoStream: {},
			audioStream: {}
		},
		{
			peerAddr: 'addr_bob',
			shortAddr: 'Bob',
			isLocal: false,
			hasAudio: true,
			hasVideo: true,
			isSpeaking: false,
			videoKind: 'screen',
			screenStartedAt: 2000,
			videoStream: {}
		}
	];

	const views = buildCallViews(participants);
	// Charlie and Bob have both screen and avatar
	const sorted = sortCallViews(views);

	// First: Charlie's screen (started at 1000)
	assert.equal(sorted[0].id, 'screen:addr_charlie');
	// Second: Bob's screen (started at 2000)
	assert.equal(sorted[1].id, 'screen:addr_bob');
	// Third: Charlie speaking avatar
	assert.equal(sorted[2].id, 'cam:addr_charlie');
	assert.equal(sorted[2].isSpeaking, true);
	// Fourth, Fifth, Sixth: non-speaking participants in alphabetical order: Bob, Dan, You (or Bob, Dan, Alice)
	// Bob, Dan, You
	const nonSpeakingTitles = sorted.slice(3).map((v) => v.title);
	const expectedTitles = [...nonSpeakingTitles].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
	assert.deepEqual(nonSpeakingTitles, expectedTitles);
	assert.equal(sorted[0].stream, sorted.find((v) => v.id === 'screen:addr_charlie').stream);
	assert.ok(sorted[0].stream, 'Screen tile retains videoStream');
	assert.equal(
		sorted.find((v) => v.id === 'cam:addr_charlie').stream,
		undefined,
		'Participant tile keeps avatar when sharing screen with separate audioStream'
	);
	console.log('  ✓ 3+ peers: screens FIFO first, speaking next, alphabetical order verified');
}

// 4. Pinning & Unpinning
{
	const views = [
		{ id: 'cam:alice', peerAddr: 'alice', title: 'You', kind: 'participant', isLocal: true, isSpeaking: false },
		{ id: 'cam:bob', peerAddr: 'bob', title: 'Bob', kind: 'participant', isLocal: false, isSpeaking: false },
		{ id: 'cam:charlie', peerAddr: 'charlie', title: 'Charlie', kind: 'participant', isLocal: false, isSpeaking: false }
	];

	// Pin Bob
	const layoutPinnedBob = computeStageLayout(views, 'cam:bob');
	assert.equal(layoutPinnedBob.stageView.id, 'cam:bob');
	assert.equal(layoutPinnedBob.pinnedViewId, 'cam:bob');
	assert.equal(layoutPinnedBob.carouselViews.length, 3);
	assert.ok(layoutPinnedBob.carouselViews.some((v) => v.id === 'cam:bob'), 'Pinned tile remains in carousel for unpinning');

	// Unpin (pass null or toggle)
	const layoutUnpinned = computeStageLayout(views, null);
	assert.equal(layoutUnpinned.pinnedViewId, null);
	assert.equal(layoutUnpinned.stageView.id, 'cam:bob'); // picked as first remote
	assert.equal(layoutUnpinned.carouselViews.length, 2);
	assert.ok(!layoutUnpinned.carouselViews.some((v) => v.id === layoutUnpinned.stageView.id), 'Unpinned hero stage is not in carousel');

	console.log('  ✓ Pinning and unpinning logic verified');
}

console.log('All callViews tests passed successfully!');
