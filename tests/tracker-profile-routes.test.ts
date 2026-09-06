import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import { createRouteAwareJsonParser } from '../server/jsonBody.js';
import {
  createJoinKeyDeriver,
  createSqliteTrackerProfileRepository,
  createTrackerProfileRouter,
  TRACKER_PROFILE_TABLES_SQL,
  type TrackerScope,
} from '../server/modules/trackerProfile/public.js';
import {
  arenaDraftPick,
  arenaRun,
  battlegroundsMatch,
  collectionSnapshot,
  constructedMatch,
  trackerEvent,
} from './trackerProfileFixtures.js';

const database = new DatabaseSync(':memory:');
database.exec('PRAGMA foreign_keys = ON; CREATE TABLE users (id TEXT PRIMARY KEY);');
database.exec(TRACKER_PROFILE_TABLES_SQL);
database.prepare('INSERT INTO users (id) VALUES (?)').run('user-1');

const TOKEN_SCOPES: Record<string, TrackerScope[]> = {
  'mca_access_write-token-with-sufficient-length-000000': ['tracker.write', 'tracker.read'],
  'mca_access_read-only-token-with-sufficient-length-00': ['tracker.read'],
  'mca_access_profile-token-without-tracker-scopes-0000': [],
};
const WRITE = 'mca_access_write-token-with-sufficient-length-000000';
const READ_ONLY = 'mca_access_read-only-token-with-sufficient-length-00';
const NO_TRACKER = 'mca_access_profile-token-without-tracker-scopes-0000';

const errors: string[] = [];
const app = express();
// The production JSON boundary: 1 MiB everywhere except the route-scoped 5 MiB tracker batch.
app.use(createRouteAwareJsonParser({ defaultLimit: '1mb', adminUploadMaxBytes: 1, galleryUploadMaxBytes: 1 }));
app.use('/api/v1', createTrackerProfileRouter({
  repository: createSqliteTrackerProfileRepository(() => database, { joinKey: createJoinKeyDeriver('secret').derive }),
  accessTokens: {
    authenticate: (token, scopes) => {
      const granted = TOKEN_SCOPES[String(token)];
      if (!granted) return null;
      return scopes.every(scope => granted.includes(scope)) ? { userId: 'user-1' } : 'FORBIDDEN';
    },
  },
  userAuth: request => (request.headers['x-user'] === 'yes' ? { id: 'user-1' } : null),
  now: () => 1_700_000_000_000,
  onError: (scope, error) => errors.push(`${scope}:${String(error)}`),
  rateLimits: { windowMs: 60_000, perIp: 1_000, perUser: 16 },
}));
// Mirrors the production JSON boundary: body-parser errors keep their own status without a stack dump.
app.use((error: { status?: number }, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  response.status(error.status ?? 500).end();
});

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const origin = `http://127.0.0.1:${address.port}/api/v1`;

const post = (body: unknown, token: string | null = WRITE, raw = false) => fetch(`${origin}/tracker/events/batch`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  },
  body: raw ? String(body) : JSON.stringify(body),
});
const get = (path: string, headers: Record<string, string> = {}) => fetch(`${origin}${path}`, { headers });
const json = async (response: Response) => await response.json() as Record<string, any>;
const assertPrivate = (response: Response) => {
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('pragma'), 'no-cache');
};

try {
  // Missing, unknown and under-scoped credentials.
  const anonymous = await post({ events: [] }, null);
  assert.equal(anonymous.status, 401);
  assertPrivate(anonymous);
  assert.equal(anonymous.headers.get('www-authenticate'), 'Bearer realm="Manacost API"');
  assert.equal((await json(anonymous)).error.code, 'INVALID_ACCESS_TOKEN');
  const unknownToken = await post({ events: [] }, 'mca_access_unknown-token-with-sufficient-length-0000');
  assert.equal(unknownToken.status, 401);
  const readOnly = await post({ events: [trackerEvent('arena_run', arenaRun())] }, READ_ONLY);
  assert.equal(readOnly.status, 403);
  assertPrivate(readOnly);
  assert.equal((await json(readOnly)).error.code, 'INSUFFICIENT_SCOPE');
  assert.equal(database.prepare('SELECT COUNT(*) AS total FROM tracker_events').get()?.total, 0);

  // Partial acknowledgement keeps valid events and reports the rest per event.
  const stored = trackerEvent('constructed_match', constructedMatch({ gameJoinEvidence: 'GAME-9' }));
  const unsupported = trackerEvent('constructed_match', constructedMatch(), { schemaVersion: 2 });
  const invalid = trackerEvent('constructed_match', constructedMatch({ turns: 999 }));
  const run = trackerEvent('arena_run', arenaRun());
  const mixed = await post({ events: [stored, unsupported, invalid, run, stored] });
  assert.equal(mixed.status, 200);
  assertPrivate(mixed);
  assert.match(mixed.headers.get('vary') ?? '', /Authorization/);
  assert.ok(mixed.headers.get('ratelimit-limit') || mixed.headers.get('ratelimit'), 'rate limit headers present');
  assert.deepEqual(await json(mixed), {
    accepted: [stored.eventId, run.eventId, stored.eventId],
    rejected: [
      { eventId: unsupported.eventId, code: 'unsupported' },
      { eventId: invalid.eventId, code: 'invalid' },
    ],
  });
  assert.equal(database.prepare('SELECT COUNT(*) AS total FROM tracker_events').get()?.total, 2);
  assert.doesNotMatch(
    JSON.stringify(database.prepare('SELECT * FROM tracker_matches').all()),
    /GAME-9/,
    'raw join handle never stored',
  );

  // Resending the same batch is an idempotent no-op that is still accepted.
  const resent = await post({ events: [stored, run] });
  assert.equal(resent.status, 200);
  assert.deepEqual((await json(resent)).accepted, [stored.eventId, run.eventId]);
  assert.equal(database.prepare('SELECT COUNT(*) AS total FROM tracker_events').get()?.total, 2);

  // Envelope limits: 51 events, empty batches and non-object bodies.
  const tooMany = await post({ events: Array.from({ length: 51 }, () => trackerEvent('arena_run', arenaRun())) });
  assert.equal(tooMany.status, 400);
  assert.equal((await json(tooMany)).error.code, 'INVALID_BATCH');
  assert.equal((await post({ events: [] })).status, 400);
  assert.equal((await post([])).status, 400);
  assert.equal((await post('{"events": [', WRITE, true)).status, 400);

  // Oversize: non-collection payloads stop at 512 KiB, collections at 4 MiB, the batch body at 5 MiB.
  const oversizePayload = trackerEvent('constructed_match', constructedMatch({ gameJoinEvidence: 'x'.repeat(600 * 1024) }));
  const oversize = await post({ events: [oversizePayload] });
  assert.equal(oversize.status, 200);
  assert.deepEqual(await json(oversize), {
    accepted: [],
    rejected: [{ eventId: oversizePayload.eventId, code: 'invalid' }],
  });
  const bigCards = (length: number) => Array.from({ length }, (_, index) => ({
    cardId: `CARD_${String(index).padStart(59, '0')}`,
    normalCount: 1,
    goldenCount: 0,
    signatureCount: 0,
    diamondCount: 0,
  }));
  const megabyteSnapshot = trackerEvent('collection_snapshot', collectionSnapshot({ contentHash: 'c'.repeat(64), cards: bigCards(7_200) }));
  assert.ok(JSON.stringify(megabyteSnapshot).length > 1024 * 1024, 'fixture exceeds the default 1 MiB body limit');
  const megabyte = await post({ events: [megabyteSnapshot] });
  assert.equal(megabyte.status, 200);
  assert.deepEqual(await json(megabyte), { accepted: [megabyteSnapshot.eventId], rejected: [] });
  assert.equal(database.prepare('SELECT card_count FROM tracker_collections WHERE user_id = ?').get('user-1')?.card_count, 7_200);
  const hugeSnapshot = trackerEvent('collection_snapshot', collectionSnapshot({ contentHash: 'd'.repeat(64), cards: bigCards(30_000) }));
  const huge = await post({ events: [hugeSnapshot] });
  assert.equal(huge.status, 200);
  assert.deepEqual(await json(huge), { accepted: [], rejected: [{ eventId: hugeSnapshot.eventId, code: 'invalid' }] });
  const oversizeBody = await post({ events: [trackerEvent('collection_snapshot', collectionSnapshot({ cards: bigCards(40_000) }))] });
  assert.equal(oversizeBody.status, 413);

  // Latest-only collection semantics through the route.
  const snapshot = await post({ events: [trackerEvent('collection_snapshot', collectionSnapshot())] });
  assert.equal(snapshot.status, 200);
  const draftPick = await post({ events: [
    trackerEvent('arena_draft_pick', arenaDraftPick({ runId: run.payload.runId })),
    trackerEvent('battlegrounds_match', battlegroundsMatch()),
  ] });
  assert.equal((await json(draftPick)).rejected.length, 0);

  // Reads accept the browser session or a tracker.read bearer token.
  const anonymousSummary = await get('/tracker/profile/summary');
  assert.equal(anonymousSummary.status, 401);
  assertPrivate(anonymousSummary);
  assert.equal((await json(anonymousSummary)).error.code, 'LOGIN_REQUIRED');
  const forbiddenSummary = await get('/tracker/profile/summary', { Authorization: `Bearer ${NO_TRACKER}` });
  assert.equal(forbiddenSummary.status, 403);
  const invalidSummary = await get('/tracker/profile/summary', { Authorization: 'Bearer mca_access_nope-token-with-sufficient-length-000000' });
  assert.equal(invalidSummary.status, 401);

  const sessionSummary = await get('/tracker/profile/summary', { 'X-User': 'yes' });
  assert.equal(sessionSummary.status, 200);
  assertPrivate(sessionSummary);
  const summary = await json(sessionSummary);
  assert.deepEqual(summary.ranked, {
    games: 1,
    wins: 1,
    losses: 0,
    winrate: 1,
    byFormat: {
      standard: { games: 1, wins: 1, losses: 0, winrate: 1 },
      wild: { games: 0, wins: 0, losses: 0, winrate: null },
    },
  });
  assert.deepEqual(summary.arena, { runs: 1, completedRuns: 1, averageWins: 7 });
  assert.equal(summary.battlegrounds.games, 1);
  assert.equal(summary.battlegrounds.firstPlaceRate, 0);
  assert.deepEqual(summary.collection, {
    cardCount: 2,
    lastSyncedAt: '2026-09-06T08:00:00.000Z',
    contentHash: 'a'.repeat(64),
  });
  const bearerSummary = await get('/tracker/profile/summary', { Authorization: `Bearer ${READ_ONLY}` });
  assert.equal(bearerSummary.status, 200);
  assert.deepEqual(await json(bearerSummary), summary);

  // Matches default to ranked, validate mode and limit, and never leak join evidence.
  const matches = await get('/tracker/profile/matches', { 'X-User': 'yes' });
  assert.equal(matches.status, 200);
  const matchesBody = await json(matches);
  assert.equal(matchesBody.mode, 'ranked');
  assert.equal(matchesBody.matches.length, 1);
  assert.equal(matchesBody.matches[0].matchId, stored.payload.matchId);
  assert.equal(matchesBody.matches[0].opponentDeck.confidence, 'partial');
  assert.doesNotMatch(JSON.stringify(matchesBody), /GAME-9|joinKey|gameJoinEvidence/);
  const battlegrounds = await get('/tracker/profile/matches?mode=battlegrounds&limit=5', { 'X-User': 'yes' });
  assert.equal((await json(battlegrounds)).matches[0].bgMode, 'solo');
  assert.equal((await get('/tracker/profile/matches?mode=casual', { 'X-User': 'yes' })).status, 400);
  assert.equal((await get('/tracker/profile/matches?limit=0', { 'X-User': 'yes' })).status, 400);
  assert.equal((await get('/tracker/profile/matches?limit=51', { 'X-User': 'yes' })).status, 400);
  assert.equal((await get('/tracker/profile/matches?mode=arena')).status, 401);

  const runs = await get('/tracker/profile/arena/runs?limit=10', { Authorization: `Bearer ${WRITE}` });
  assert.equal(runs.status, 200);
  const runsBody = await json(runs);
  assert.equal(runsBody.runs.length, 1);
  assert.equal(runsBody.runs[0].runId, run.payload.runId);
  assert.equal(runsBody.runs[0].picks.length, 1);
  assert.equal((await get('/tracker/profile/arena/runs?limit=abc', { 'X-User': 'yes' })).status, 400);

  // The per-user limiter answers 429 with private cache headers and Retry-After.
  let limited: Response | null = null;
  for (let attempt = 0; attempt < 20 && !limited; attempt += 1) {
    const response = await post({ events: [run] });
    if (response.status === 429) limited = response;
  }
  assert.ok(limited, 'per-user limiter must trigger');
  assertPrivate(limited);
  assert.ok(limited.headers.get('retry-after'));
  assert.equal((await json(limited)).error.code, 'RATE_LIMITED');
  assert.deepEqual(errors, []);
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
  database.close();
}

console.log('tracker profile route contract tests passed');
