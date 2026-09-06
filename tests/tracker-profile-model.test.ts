import assert from 'node:assert/strict';
import {
  buildProfileSummary,
  createJoinKeyDeriver,
  deriveJoinKey,
  exposeOpponentDeck,
  parseTrackerBatch,
  TrackerBatchError,
  type ParsedBatchEvent,
} from '../server/modules/trackerProfile/public.js';
import {
  arenaDraftPick,
  arenaMatch,
  arenaRun,
  battlegroundsMatch,
  collectionSnapshot,
  constructedMatch,
  trackerEvent,
} from './trackerProfileFixtures.js';

const single = (event: unknown): ParsedBatchEvent => {
  const parsed = parseTrackerBatch({ events: [event] });
  assert.equal(parsed.length, 1);
  return parsed[0];
};

const expectValid = (event: unknown) => {
  const parsed = single(event);
  assert.equal(parsed.status, 'valid', `expected valid event: ${JSON.stringify(parsed)}`);
  return parsed.status === 'valid' ? parsed.event : assert.fail('unreachable');
};

const bigCollectionCards = (length: number) => Array.from({ length }, (_, index) => ({
  cardId: `CARD_${String(index).padStart(59, '0')}`,
  normalCount: 1,
  goldenCount: 0,
  signatureCount: 0,
  diamondCount: 0,
}));

const expectRejected = (event: unknown, code: 'invalid' | 'unsupported', label: string) => {
  const parsed = single(event);
  assert.equal(parsed.status, 'rejected', `${label}: expected rejection`);
  if (parsed.status === 'rejected') assert.equal(parsed.code, code, label);
};

// Every event type validates and normalizes identifiers and timestamps.
const ranked = expectValid(trackerEvent('constructed_match', constructedMatch({
  matchId: '0192A1B2-C3D4-7000-8000-00000000AAAA',
})));
assert.equal(ranked.type, 'constructed_match');
assert.equal(ranked.occurredAt, Date.parse('2026-09-06T12:00:00.123Z'));
if (ranked.type === 'constructed_match') {
  assert.equal(ranked.payload.matchId, '0192a1b2-c3d4-7000-8000-00000000aaaa');
  assert.equal(ranked.payload.startedAt, Date.parse('2026-09-06T10:00:00Z'));
  assert.equal(ranked.payload.gameJoinEvidence, null);
  assert.deepEqual(ranked.payload.opponentDeck.observedCards, ['CARD_X', 'CARD_Y']);
}
const withEvidence = expectValid(trackerEvent('constructed_match', constructedMatch({ gameJoinEvidence: 'GAME-42' })));
if (withEvidence.type === 'constructed_match') assert.equal(withEvidence.payload.gameJoinEvidence, 'GAME-42');
// The client omits null optional members, so absent keys must equal explicit nulls.
const withoutOptionalKeys = (payload: Record<string, unknown>, keys: string[]) => {
  const copy = { ...payload };
  for (const key of keys) delete copy[key];
  return copy;
};
const sparseRanked = expectValid(trackerEvent('constructed_match', withoutOptionalKeys(constructedMatch(), [
  'playerHeroCardId', 'opponentHeroCardId', 'opponentMulliganReplacedCount', 'gameJoinEvidence', 'hearthstoneBuild', 'scenarioId',
])));
if (sparseRanked.type === 'constructed_match') {
  assert.equal(sparseRanked.payload.playerHeroCardId, null);
  assert.equal(sparseRanked.payload.opponentMulliganReplacedCount, null);
  assert.equal(sparseRanked.payload.gameJoinEvidence, null);
  assert.equal(sparseRanked.payload.scenarioId, null);
}
expectValid(trackerEvent('constructed_match', constructedMatch({
  playerDeck: { confidence: 'unknown' },
  opponentDeck: { observedCards: [], confidence: 'unknown' },
})));
expectValid(trackerEvent('arena_match', withoutOptionalKeys(arenaMatch(), [
  'runId', 'scoreBefore', 'scoreAfter', 'playerHeroCardId', 'opponentHeroCardId', 'opponentMulliganReplacedCount', 'hearthstoneBuild',
])));
expectValid(trackerEvent('arena_run', withoutOptionalKeys(arenaRun(), ['heroCardId', 'endedAt', 'ratingBefore', 'ratingAfter'])));
const sparseBattlegrounds = expectValid(trackerEvent('battlegrounds_match', withoutOptionalKeys(battlegroundsMatch(), [
  'mmrBefore', 'mmrAfter', 'heroCardId', 'placement', 'finalBoard', 'hearthstoneBuild',
])));
if (sparseBattlegrounds.type === 'battlegrounds_match') assert.equal(sparseBattlegrounds.payload.finalBoard, null);
expectValid(trackerEvent('battlegrounds_match', battlegroundsMatch({
  finalBoard: { capturedAt: '2026-09-06T13:24:00Z', turn: 3, minions: [{ slot: 1, attack: 1, health: 1 }], confidence: 'partial' },
})));
expectValid(trackerEvent('collection_snapshot', collectionSnapshot({
  cards: [{ cardId: 'CARD_A', normalCount: 1, goldenCount: 0 }],
})));
expectValid(trackerEvent('arena_match', arenaMatch()));
expectValid(trackerEvent('arena_match', arenaMatch({ runId: '0192a1b2-c3d4-7000-8000-000000000bbb' })));
expectValid(trackerEvent('arena_draft_pick', arenaDraftPick()));
expectValid(trackerEvent('arena_run', arenaRun()));
expectValid(trackerEvent('arena_run', arenaRun({ endedAt: null, isComplete: false })));
const battlegrounds = expectValid(trackerEvent('battlegrounds_match', battlegroundsMatch()));
if (battlegrounds.type === 'battlegrounds_match') {
  assert.equal(battlegrounds.payload.finalBoard?.capturedAt, Date.parse('2026-09-06T13:24:00Z'));
  assert.equal(battlegrounds.payload.finalBoard?.minions[0]?.isGolden, true);
}
expectValid(trackerEvent('battlegrounds_match', battlegroundsMatch({ finalBoard: null, placement: null })));
const collection = expectValid(trackerEvent('collection_snapshot', collectionSnapshot({ contentHash: 'A'.repeat(64) })));
if (collection.type === 'collection_snapshot') assert.equal(collection.payload.contentHash, 'a'.repeat(64));

// Unsupported discriminators are reported per event, never as a batch failure.
expectRejected(trackerEvent('unknown_type', constructedMatch()), 'unsupported', 'unknown type');
expectRejected(trackerEvent('constructed_match', constructedMatch(), { schemaVersion: 2 }), 'unsupported', 'schema 2');
expectRejected(trackerEvent('constructed_match', constructedMatch(), { schemaVersion: '1' }), 'unsupported', 'schema string');

// Invalid payloads: unknown keys, bounds, enums, timestamps and sizes.
const invalidCases: Array<[string, unknown]> = [
  ['unknown payload key', trackerEvent('constructed_match', constructedMatch({ playerName: 'Nope' }))],
  ['unknown envelope key', trackerEvent('constructed_match', constructedMatch(), { extra: 1 })],
  ['bad occurredAt', trackerEvent('constructed_match', constructedMatch(), { occurredAt: '2026-09-06' })],
  ['payload not object', trackerEvent('constructed_match', [])],
  ['turns above 200', trackerEvent('constructed_match', constructedMatch({ turns: 201 }))],
  ['duration above limit', trackerEvent('constructed_match', constructedMatch({ durationSeconds: 21_601 }))],
  ['float turns', trackerEvent('constructed_match', constructedMatch({ turns: 1.5 }))],
  ['bad result', trackerEvent('constructed_match', constructedMatch({ result: 'Won' }))],
  ['bad certainty', trackerEvent('constructed_match', constructedMatch({ resultConfidence: 'sure' }))],
  ['bad game type', trackerEvent('constructed_match', constructedMatch({ gameType: 'casual' }))],
  ['bad format', trackerEvent('constructed_match', constructedMatch({ format: 'twist' }))],
  ['match id not uuid', trackerEvent('constructed_match', constructedMatch({ matchId: 'match-1' }))],
  ['mulligan above 10', trackerEvent('constructed_match', constructedMatch({
    playerMulligan: { initial: Array.from({ length: 11 }, (_, i) => `C${i}`), kept: [], replaced: [], after: [], confidence: 'exact' },
  }))],
  ['observed cards above 64', trackerEvent('constructed_match', constructedMatch({
    opponentDeck: { observedCards: Array.from({ length: 65 }, (_, i) => `C${i}`), deckCode: null, deckHash: null, confidence: 'partial' },
  }))],
  ['card id above 64 chars', trackerEvent('constructed_match', constructedMatch({ playerHeroCardId: 'H'.repeat(65) }))],
  ['join evidence above 256', trackerEvent('constructed_match', constructedMatch({ gameJoinEvidence: 'G'.repeat(257) }))],
  ['replaced count above 10', trackerEvent('constructed_match', constructedMatch({ opponentMulliganReplacedCount: 11 }))],
  ['arena score above 20', trackerEvent('arena_match', arenaMatch({ scoreAfter: 21 }))],
  ['pick index above 40', trackerEvent('arena_draft_pick', arenaDraftPick({ pickIndex: 41 }))],
  ['no offered cards', trackerEvent('arena_draft_pick', arenaDraftPick({ offeredCardIds: [] }))],
  ['nine offered cards', trackerEvent('arena_draft_pick', arenaDraftPick({ offeredCardIds: Array.from({ length: 9 }, (_, i) => `C${i}`) }))],
  ['run wins above 20', trackerEvent('arena_run', arenaRun({ wins: 21 }))],
  ['run deck above 40', trackerEvent('arena_run', arenaRun({ finalDeckCardIds: Array.from({ length: 41 }, (_, i) => `C${i}`) }))],
  ['isComplete not boolean', trackerEvent('arena_run', arenaRun({ isComplete: 'yes' }))],
  ['placement above 16', trackerEvent('battlegrounds_match', battlegroundsMatch({ placement: 17 }))],
  ['bad bg mode', trackerEvent('battlegrounds_match', battlegroundsMatch({ mode: 'trios' }))],
  ['board slot above 7', trackerEvent('battlegrounds_match', battlegroundsMatch({
    finalBoard: { capturedAt: '2026-09-06T13:24:00Z', turn: 1, minions: [{ slot: 8, cardId: null, attack: 1, health: 1, isGolden: null }], confidence: 'exact' },
  }))],
  ['eight minions', trackerEvent('battlegrounds_match', battlegroundsMatch({
    finalBoard: {
      capturedAt: '2026-09-06T13:24:00Z',
      turn: 1,
      minions: Array.from({ length: 8 }, (_, i) => ({ slot: 1, cardId: `M${i}`, attack: 1, health: 1, isGolden: null })),
      confidence: 'exact',
    },
  }))],
  ['content hash not hex', trackerEvent('collection_snapshot', collectionSnapshot({ contentHash: 'z'.repeat(64) }))],
  ['duplicate collection card', trackerEvent('collection_snapshot', collectionSnapshot({
    cards: [
      { cardId: 'CARD_A', normalCount: 1, goldenCount: 0, signatureCount: null, diamondCount: null },
      { cardId: 'CARD_A', normalCount: 1, goldenCount: 0, signatureCount: null, diamondCount: null },
    ],
  }))],
  ['negative count', trackerEvent('collection_snapshot', collectionSnapshot({
    cards: [{ cardId: 'CARD_A', normalCount: -1, goldenCount: 0, signatureCount: null, diamondCount: null }],
  }))],
  ['non-collection payload above 512 KiB', trackerEvent('constructed_match', constructedMatch({
    gameJoinEvidence: 'x'.repeat(600 * 1024),
  }))],
  ['collection payload above 4 MiB', trackerEvent('collection_snapshot', collectionSnapshot({
    cards: bigCollectionCards(30_000),
  }))],
];
for (const [label, event] of invalidCases) expectRejected(event, 'invalid', label);

// A realistic full collection (about 1 MiB) stays within the 4 MiB collection allowance.
const fullCollection = trackerEvent('collection_snapshot', collectionSnapshot({ cards: bigCollectionCards(7_200) }));
assert.ok(JSON.stringify(fullCollection.payload).length > 1024 * 1024);
const parsedCollection = expectValid(fullCollection);
if (parsedCollection.type === 'collection_snapshot') assert.equal(parsedCollection.payload.cards.length, 7_200);

// Envelope defects cannot be attributed to one event and fail the batch.
assert.throws(() => parseTrackerBatch(null), TrackerBatchError);
assert.throws(() => parseTrackerBatch({ events: [] }), TrackerBatchError);
assert.throws(() => parseTrackerBatch({ events: 'nope' }), TrackerBatchError);
assert.throws(
  () => parseTrackerBatch({ events: Array.from({ length: 51 }, () => trackerEvent('arena_run', arenaRun())) }),
  /1\.\.50/,
);
assert.throws(() => parseTrackerBatch({ events: [{ ...trackerEvent('arena_run', arenaRun()), eventId: 'x' }] }), TrackerBatchError);
assert.throws(() => parseTrackerBatch({ events: ['not-an-event'] }), TrackerBatchError);

// A mixed batch keeps per-event verdicts in submission order.
const mixed = parseTrackerBatch({
  events: [
    trackerEvent('arena_run', arenaRun()),
    trackerEvent('mystery', {}),
    trackerEvent('arena_run', arenaRun({ wins: 99 })),
  ],
});
assert.deepEqual(mixed.map(entry => entry.status), ['valid', 'rejected', 'rejected']);

// Join keys are keyed digests; without a secret nothing is derived.
const key = deriveJoinKey('secret', 'GAME-42');
assert.match(key, /^[0-9a-f]{64}$/);
assert.equal(key, deriveJoinKey('secret', '  GAME-42 '));
assert.notEqual(key, deriveJoinKey('other-secret', 'GAME-42'));
assert.notEqual(key, deriveJoinKey('secret', 'GAME-43'));
const disabled = createJoinKeyDeriver(undefined);
assert.equal(disabled.enabled, false);
assert.equal(disabled.derive('GAME-42'), null);
assert.equal(createJoinKeyDeriver('   ').enabled, false);
const enabled = createJoinKeyDeriver('secret');
assert.equal(enabled.enabled, true);
assert.equal(enabled.derive('GAME-42'), key);
assert.equal(enabled.derive('   '), null);

// Opponent exposure never upgrades inferred evidence.
const submitted = { observedCards: ['CARD_X'], deckCode: null, deckHash: null, confidence: 'partial' as const };
assert.deepEqual(exposeOpponentDeck(submitted, null), submitted);
assert.deepEqual(exposeOpponentDeck(submitted, { deckCode: 'AAA', deckHash: 'h', confidence: 'inferred' }), submitted);
assert.deepEqual(exposeOpponentDeck(submitted, { deckCode: null, deckHash: 'h', confidence: 'exact' }), submitted);
assert.deepEqual(
  exposeOpponentDeck(submitted, { deckCode: 'AAA', deckHash: 'h', confidence: 'exact' }),
  { observedCards: ['CARD_X'], deckCode: 'AAA', deckHash: 'h', confidence: 'exact' },
);

// Summary arithmetic excludes ties from the ratio and reports null without data.
const summary = buildProfileSummary({
  ranked: { standard: { games: 3, wins: 2, losses: 1 }, wild: { games: 1, wins: 0, losses: 0 } },
  arena: { runs: 3, completedRuns: 2, completedWins: 15 },
  battlegrounds: { games: 4, placedGames: 3, placementSum: 13, top4: 2, first: 1, mmrKnownGames: 3 },
  collection: { cardCount: 12, observedAt: Date.parse('2026-09-06T08:00:00Z'), contentHash: 'abc' },
});
assert.deepEqual(summary.ranked, {
  games: 4,
  wins: 2,
  losses: 1,
  winrate: 0.6667,
  byFormat: {
    standard: { games: 3, wins: 2, losses: 1, winrate: 0.6667 },
    wild: { games: 1, wins: 0, losses: 0, winrate: null },
  },
});
assert.deepEqual(summary.arena, { runs: 3, completedRuns: 2, averageWins: 7.5 });
assert.deepEqual(summary.battlegrounds, {
  games: 4,
  averagePlacement: 4.3333,
  top4Rate: 0.6667,
  firstPlaceRate: 0.3333,
  mmrKnownGames: 3,
});
assert.deepEqual(summary.collection, { cardCount: 12, lastSyncedAt: '2026-09-06T08:00:00.000Z', contentHash: 'abc' });
const empty = buildProfileSummary({
  ranked: { standard: { games: 0, wins: 0, losses: 0 }, wild: { games: 0, wins: 0, losses: 0 } },
  arena: { runs: 0, completedRuns: 0, completedWins: 0 },
  battlegrounds: { games: 0, placedGames: 0, placementSum: 0, top4: 0, first: 0, mmrKnownGames: 0 },
  collection: null,
});
assert.equal(empty.ranked.winrate, null);
assert.equal(empty.arena.averageWins, null);
assert.equal(empty.battlegrounds.averagePlacement, null);
assert.deepEqual(empty.collection, { cardCount: 0, lastSyncedAt: null, contentHash: null });

console.log('tracker profile model tests passed');
