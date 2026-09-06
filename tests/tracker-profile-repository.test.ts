import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  buildProfileSummary,
  createJoinKeyDeriver,
  createSqliteTrackerProfileRepository,
  deriveJoinKey,
  parseTrackerBatch,
  TRACKER_PROFILE_TABLES_SQL,
  type TrackerEvent,
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

const database = new DatabaseSync(':memory:');
database.exec('PRAGMA foreign_keys = ON; CREATE TABLE users (id TEXT PRIMARY KEY);');
database.exec(TRACKER_PROFILE_TABLES_SQL);
for (const id of ['user-1', 'user-2', 'user-3']) database.prepare('INSERT INTO users (id) VALUES (?)').run(id);

const SECRET = 'test-join-secret';
const repository = createSqliteTrackerProfileRepository(() => database, { joinKey: createJoinKeyDeriver(SECRET).derive });

const validEvent = (type: string, payload: unknown): TrackerEvent => {
  const [parsed] = parseTrackerBatch({ events: [trackerEvent(type, payload)] });
  if (parsed.status !== 'valid') throw new Error(`fixture is not valid: ${JSON.stringify(parsed)}`);
  return parsed.event;
};

const record = (userId: string, type: string, payload: unknown, receivedAt = 1_000) => {
  const event = validEvent(type, payload);
  return { event, outcome: repository.recordEvent(userId, event, receivedAt) };
};

// Idempotency: the same event id is stored once per user.
const first = record('user-1', 'constructed_match', constructedMatch({ gameJoinEvidence: 'GAME-1' }));
assert.equal(first.outcome, 'stored');
assert.equal(repository.recordEvent('user-1', first.event, 2_000), 'duplicate');
assert.equal(database.prepare('SELECT COUNT(*) AS total FROM tracker_events').get()?.total, 1);
assert.equal(database.prepare('SELECT COUNT(*) AS total FROM tracker_matches').get()?.total, 1);

// The raw join handle is hashed and never persisted anywhere.
const storedMatch = database.prepare('SELECT * FROM tracker_matches WHERE user_id = ?').get('user-1') as Record<string, unknown>;
assert.equal(storedMatch.join_key, deriveJoinKey(SECRET, 'GAME-1'));
for (const table of ['tracker_events', 'tracker_matches']) {
  for (const row of database.prepare(`SELECT * FROM ${table}`).all()) {
    assert.doesNotMatch(JSON.stringify(row), /GAME-1/, `${table} must not contain the raw handle`);
  }
}

// Opponent exposure requires the other user's own exact submission of the same game.
const opponentDeckCode = 'AAECAQcAAA==';
record('user-2', 'constructed_match', constructedMatch({
  gameJoinEvidence: 'GAME-1',
  result: 'lost',
  playerDeck: { deckCode: opponentDeckCode, deckHash: 'deck-hash-2', confidence: 'exact' },
  opponentDeck: { observedCards: ['CARD_A'], deckCode: null, deckHash: null, confidence: 'inferred' },
}), 1_100);
const [userOneView] = repository.listMatches('user-1', 'ranked', 10);
assert.equal(userOneView.mode, 'ranked');
if (userOneView.mode === 'ranked') {
  assert.deepEqual(userOneView.opponentDeck, {
    observedCards: ['CARD_X', 'CARD_Y'],
    deckCode: opponentDeckCode,
    deckHash: 'deck-hash-2',
    confidence: 'exact',
  });
  assert.equal('gameJoinEvidence' in userOneView, false);
  assert.equal('joinKey' in userOneView, false);
}
const [userTwoView] = repository.listMatches('user-2', 'ranked', 10);
if (userTwoView.mode === 'ranked') {
  assert.deepEqual(userTwoView.opponentDeck, {
    observedCards: ['CARD_A'],
    deckCode: 'AAECAf0EAA==',
    deckHash: 'deck-hash-1',
    confidence: 'exact',
  });
}

// Inferred counterpart evidence is never exposed as exact.
record('user-1', 'constructed_match', constructedMatch({
  gameJoinEvidence: 'GAME-2',
  endedAt: '2026-09-06T11:00:00Z',
}), 1_200);
record('user-3', 'constructed_match', constructedMatch({
  gameJoinEvidence: 'GAME-2',
  playerDeck: { deckCode: 'AAECAQIAAA==', deckHash: 'deck-hash-3', confidence: 'inferred' },
}), 1_300);
const [newestUserOne] = repository.listMatches('user-1', 'ranked', 10);
if (newestUserOne.mode === 'ranked') {
  assert.equal(newestUserOne.opponentDeck.confidence, 'partial');
  assert.equal(newestUserOne.opponentDeck.deckCode, null);
}
const [userThreeView] = repository.listMatches('user-3', 'ranked', 10);
if (userThreeView.mode === 'ranked') assert.equal(userThreeView.opponentDeck.confidence, 'exact');

// A second row of the same user with the same join key never exposes to itself.
record('user-2', 'constructed_match', constructedMatch({
  gameJoinEvidence: 'GAME-3',
  endedAt: '2026-09-06T12:00:00Z',
}), 1_400);
record('user-2', 'constructed_match', constructedMatch({
  gameJoinEvidence: 'GAME-3',
  endedAt: '2026-09-06T12:30:00Z',
}), 1_500);
const [selfJoined] = repository.listMatches('user-2', 'ranked', 1);
if (selfJoined.mode === 'ranked') assert.equal(selfJoined.opponentDeck.confidence, 'partial');

// Without a secret the join key stays null and no exposure happens.
const disabledDatabase = new DatabaseSync(':memory:');
disabledDatabase.exec('PRAGMA foreign_keys = ON; CREATE TABLE users (id TEXT PRIMARY KEY);');
disabledDatabase.exec(TRACKER_PROFILE_TABLES_SQL);
for (const id of ['user-1', 'user-2']) disabledDatabase.prepare('INSERT INTO users (id) VALUES (?)').run(id);
const disabledRepository = createSqliteTrackerProfileRepository(
  () => disabledDatabase,
  { joinKey: createJoinKeyDeriver(undefined).derive },
);
disabledRepository.recordEvent('user-1', validEvent('constructed_match', constructedMatch({ gameJoinEvidence: 'GAME-1' })), 1);
disabledRepository.recordEvent('user-2', validEvent('constructed_match', constructedMatch({ gameJoinEvidence: 'GAME-1' })), 2);
assert.equal(disabledDatabase.prepare('SELECT COUNT(*) AS total FROM tracker_matches WHERE join_key IS NOT NULL').get()?.total, 0);
const [disabledView] = disabledRepository.listMatches('user-1', 'ranked', 5);
if (disabledView.mode === 'ranked') assert.equal(disabledView.opponentDeck.confidence, 'partial');
disabledDatabase.close();

// A repeated match id from the same user replaces the earlier row.
const replayed = constructedMatch({ result: 'lost', endedAt: '2026-09-06T13:00:00Z' });
record('user-1', 'constructed_match', replayed, 1_600);
record('user-1', 'constructed_match', { ...replayed, result: 'won' }, 1_700);
assert.equal(
  database.prepare('SELECT result FROM tracker_matches WHERE user_id = ? AND match_id = ?').get('user-1', replayed.matchId)?.result,
  'won',
);

// Collection snapshots replace the stored state only when the hash changes.
record('user-1', 'collection_snapshot', collectionSnapshot(), 2_000);
assert.equal(database.prepare('SELECT COUNT(*) AS total FROM tracker_collection_cards WHERE user_id = ?').get('user-1')?.total, 2);
record('user-1', 'collection_snapshot', collectionSnapshot({
  contentHash: 'b'.repeat(64),
  observedAt: '2026-09-06T09:00:00Z',
  cards: [{ cardId: 'CARD_Z', normalCount: 1, goldenCount: 0, signatureCount: null, diamondCount: null }],
}), 2_100);
assert.deepEqual(
  database.prepare('SELECT card_id FROM tracker_collection_cards WHERE user_id = ?').all('user-1').map(row => row.card_id),
  ['CARD_Z'],
);
const collectionRow = () => database.prepare('SELECT * FROM tracker_collections WHERE user_id = ?').get('user-1') as Record<string, unknown>;
assert.equal(collectionRow().content_hash, 'b'.repeat(64));
assert.equal(collectionRow().updated_at, 2_100);
assert.equal(record('user-1', 'collection_snapshot', collectionSnapshot({
  contentHash: 'b'.repeat(64),
  observedAt: '2026-09-06T09:30:00Z',
  cards: [],
}), 2_200).outcome, 'stored');
assert.equal(collectionRow().updated_at, 2_100, 'same hash must be a no-op');
assert.equal(collectionRow().card_count, 1);

// Arena picks may arrive before their run and are attached in pick order.
const runId = '0192a1b2-c3d4-7000-8000-00000000run1'.replace('run1', '0001');
record('user-1', 'arena_draft_pick', arenaDraftPick({ runId, pickIndex: 1, chosenCardId: 'CARD_3' }), 3_000);
record('user-1', 'arena_draft_pick', arenaDraftPick({ runId, pickIndex: 0 }), 3_100);
assert.deepEqual(repository.listArenaRuns('user-1', 10), []);
record('user-1', 'arena_run', arenaRun({ runId }), 3_200);
record('user-1', 'arena_run', arenaRun({ startedAt: '2026-09-05T09:00:00Z', isComplete: false, endedAt: null, wins: 2, losses: 1 }), 3_300);
const runs = repository.listArenaRuns('user-1', 10);
assert.equal(runs.length, 2);
assert.equal(runs[0].runId, runId);
assert.deepEqual(runs[0].picks.map(pick => [pick.pickIndex, pick.chosenCardId]), [[0, 'CARD_2'], [1, 'CARD_3']]);
assert.equal(runs[0].endedAt, '2026-09-06T12:00:00.000Z');
assert.equal(runs[1].isComplete, false);
assert.equal(runs[1].endedAt, null);
assert.equal(repository.listArenaRuns('user-1', 1).length, 1);

// Arena and Battlegrounds matches are listed by mode, newest first, bounded by limit.
record('user-1', 'arena_match', arenaMatch({ runId, endedAt: '2026-09-06T11:08:00Z' }), 4_000);
record('user-1', 'arena_match', arenaMatch({ runId, endedAt: '2026-09-06T11:30:00Z', result: 'lost' }), 4_100);
const arenaMatches = repository.listMatches('user-1', 'arena', 10);
assert.deepEqual(arenaMatches.map(match => match.mode === 'arena' && match.result), ['lost', 'won']);
assert.equal(repository.listMatches('user-1', 'arena', 1).length, 1);
record('user-1', 'battlegrounds_match', battlegroundsMatch({ placement: 1 }), 5_000);
record('user-1', 'battlegrounds_match', battlegroundsMatch({ placement: 4, endedAt: '2026-09-06T14:00:00Z', finalBoard: null }), 5_100);
record('user-1', 'battlegrounds_match', battlegroundsMatch({ placement: 8, endedAt: '2026-09-06T15:00:00Z', mmrAfter: null }), 5_200);
record('user-1', 'battlegrounds_match', battlegroundsMatch({ placement: null, placementConfidence: 'unknown', endedAt: '2026-09-06T16:00:00Z' }), 5_300);
const battlegroundsMatches = repository.listMatches('user-1', 'battlegrounds', 10);
assert.deepEqual(
  battlegroundsMatches.map(match => match.mode === 'battlegrounds' && match.placement),
  [null, 8, 4, 1],
);
const withBoard = battlegroundsMatches[3];
if (withBoard.mode === 'battlegrounds') {
  assert.equal(withBoard.bgMode, 'solo');
  assert.equal(withBoard.finalBoard?.capturedAt, '2026-09-06T13:24:00.000Z');
  assert.equal(withBoard.finalBoard?.minions[0]?.cardId, 'BG_MINION_01');
}

// Ranked ordering is newest first with the limit applied.
record('user-1', 'constructed_match', constructedMatch({ format: 'wild', result: 'tied', endedAt: '2026-09-07T10:00:00Z' }), 6_000);
record('user-1', 'constructed_match', constructedMatch({ format: 'wild', result: 'won', endedAt: '2026-09-07T11:00:00Z' }), 6_100);
const rankedMatches = repository.listMatches('user-1', 'ranked', 3);
assert.equal(rankedMatches.length, 3);
assert.deepEqual(
  rankedMatches.map(match => match.endedAt),
  ['2026-09-07T11:00:00.000Z', '2026-09-07T10:00:00.000Z', '2026-09-06T13:00:00.000Z'],
);

// Summary aggregates only the owner's rows.
const summary = buildProfileSummary(repository.readSummaryCounts('user-1'));
assert.deepEqual(summary.ranked, {
  games: 5,
  wins: 4,
  losses: 0,
  winrate: 1,
  byFormat: {
    standard: { games: 3, wins: 3, losses: 0, winrate: 1 },
    wild: { games: 2, wins: 1, losses: 0, winrate: 1 },
  },
});
assert.deepEqual(summary.arena, { runs: 2, completedRuns: 1, averageWins: 7 });
assert.deepEqual(summary.battlegrounds, {
  games: 4,
  averagePlacement: 4.3333,
  top4Rate: 0.6667,
  firstPlaceRate: 0.3333,
  mmrKnownGames: 3,
});
assert.deepEqual(summary.collection, {
  cardCount: 1,
  lastSyncedAt: '2026-09-06T09:00:00.000Z',
  contentHash: 'b'.repeat(64),
});
const otherSummary = buildProfileSummary(repository.readSummaryCounts('user-3'));
assert.equal(otherSummary.ranked.games, 1);
assert.equal(otherSummary.battlegrounds.games, 0);
assert.equal(otherSummary.collection.contentHash, null);

// Deleting the user cascades every tracker row.
database.prepare('DELETE FROM users WHERE id = ?').run('user-1');
for (const table of [
  'tracker_events',
  'tracker_matches',
  'tracker_arena_runs',
  'tracker_arena_picks',
  'tracker_battlegrounds_matches',
  'tracker_collections',
  'tracker_collection_cards',
]) {
  assert.equal(database.prepare(`SELECT COUNT(*) AS total FROM ${table} WHERE user_id = ?`).get('user-1')?.total, 0, table);
}

database.close();
console.log('tracker profile SQLite repository tests passed');
