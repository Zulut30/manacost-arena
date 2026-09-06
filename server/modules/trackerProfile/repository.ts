import type { DatabaseSync } from 'node:sqlite';
import type {
  ArenaDraftPickPayload,
  ArenaMatchPayload,
  ArenaRunPayload,
  BattlegroundsMatchPayload,
  CollectionSnapshotPayload,
  ConstructedMatchPayload,
  JoinKeyDeriver,
  TrackerEvent,
  TrackerProfileRepository,
} from './model.js';
import { createTrackerProfileReads } from './readRepository.js';

export const TRACKER_PROFILE_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS tracker_events (
    user_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    type TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    occurred_at INTEGER NOT NULL,
    received_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, event_id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_tracker_events_event ON tracker_events(event_id);

  CREATE TABLE IF NOT EXISTS tracker_matches (
    user_id TEXT NOT NULL,
    match_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    format TEXT,
    run_id TEXT,
    result TEXT NOT NULL,
    result_confidence TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER NOT NULL,
    duration_seconds INTEGER NOT NULL,
    turns INTEGER NOT NULL,
    player_hero_card_id TEXT,
    opponent_hero_card_id TEXT,
    player_deck_code TEXT,
    player_deck_hash TEXT,
    player_deck_confidence TEXT NOT NULL,
    mulligan_json TEXT NOT NULL,
    opponent_mulligan_replaced_count INTEGER,
    opponent_observed_json TEXT NOT NULL,
    opponent_deck_code TEXT,
    opponent_deck_hash TEXT,
    opponent_deck_confidence TEXT NOT NULL,
    score_before INTEGER,
    score_after INTEGER,
    score_confidence TEXT,
    join_key TEXT,
    hearthstone_build INTEGER,
    scenario_id INTEGER,
    received_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, match_id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_tracker_matches_user_ended ON tracker_matches(user_id, ended_at);
  CREATE INDEX IF NOT EXISTS idx_tracker_matches_player_deck ON tracker_matches(player_deck_hash);
  CREATE INDEX IF NOT EXISTS idx_tracker_matches_mode_format ON tracker_matches(mode, format);
  CREATE INDEX IF NOT EXISTS idx_tracker_matches_run ON tracker_matches(run_id);
  CREATE INDEX IF NOT EXISTS idx_tracker_matches_join_key ON tracker_matches(join_key);

  CREATE TABLE IF NOT EXISTS tracker_arena_runs (
    user_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    hero_card_id TEXT,
    final_deck_code TEXT,
    final_deck_hash TEXT,
    final_deck_confidence TEXT NOT NULL,
    final_deck_cards_json TEXT NOT NULL,
    wins INTEGER NOT NULL,
    losses INTEGER NOT NULL,
    score_confidence TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    is_complete INTEGER NOT NULL,
    rating_before INTEGER,
    rating_after INTEGER,
    rating_confidence TEXT NOT NULL,
    received_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, run_id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_tracker_arena_runs_user_started ON tracker_arena_runs(user_id, started_at);

  CREATE TABLE IF NOT EXISTS tracker_arena_picks (
    user_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    pick_index INTEGER NOT NULL,
    offered_json TEXT NOT NULL,
    chosen_card_id TEXT NOT NULL,
    observed_at INTEGER NOT NULL,
    confidence TEXT NOT NULL,
    received_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, run_id, pick_index),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_tracker_arena_picks_run ON tracker_arena_picks(run_id);

  CREATE TABLE IF NOT EXISTS tracker_battlegrounds_matches (
    user_id TEXT NOT NULL,
    match_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    mmr_before INTEGER,
    mmr_after INTEGER,
    mmr_confidence TEXT NOT NULL,
    hero_card_id TEXT,
    placement INTEGER,
    placement_confidence TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER NOT NULL,
    duration_seconds INTEGER NOT NULL,
    final_turn INTEGER NOT NULL,
    final_board_json TEXT,
    hearthstone_build INTEGER,
    received_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, match_id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_tracker_battlegrounds_user_ended
    ON tracker_battlegrounds_matches(user_id, ended_at);

  CREATE TABLE IF NOT EXISTS tracker_collections (
    user_id TEXT PRIMARY KEY,
    content_hash TEXT NOT NULL,
    observed_at INTEGER NOT NULL,
    card_count INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tracker_collection_cards (
    user_id TEXT NOT NULL,
    card_id TEXT NOT NULL,
    normal_count INTEGER NOT NULL,
    golden_count INTEGER NOT NULL,
    signature_count INTEGER,
    diamond_count INTEGER,
    PRIMARY KEY (user_id, card_id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`;

type SqlValue = string | number | null;
type WriteContext = { database: DatabaseSync; userId: string; receivedAt: number; joinKey: JoinKeyDeriver };

const MATCH_COLUMNS = [
  'user_id', 'match_id', 'mode', 'format', 'run_id', 'result', 'result_confidence', 'started_at',
  'ended_at', 'duration_seconds', 'turns', 'player_hero_card_id', 'opponent_hero_card_id',
  'player_deck_code', 'player_deck_hash', 'player_deck_confidence', 'mulligan_json',
  'opponent_mulligan_replaced_count', 'opponent_observed_json', 'opponent_deck_code',
  'opponent_deck_hash', 'opponent_deck_confidence', 'score_before', 'score_after',
  'score_confidence', 'join_key', 'hearthstone_build', 'scenario_id', 'received_at',
] as const;
type MatchRow = Record<typeof MATCH_COLUMNS[number], SqlValue>;

function replaceRow(database: DatabaseSync, table: string, columns: readonly string[], row: Record<string, SqlValue>) {
  database.prepare(
    `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
  ).run(...columns.map(column => row[column]));
}

const insertMatch = (context: WriteContext, row: MatchRow) => replaceRow(context.database, 'tracker_matches', MATCH_COLUMNS, row);

/** The raw join handle is hashed here and never reaches a column or a log line. */
function insertConstructedMatch(context: WriteContext, payload: ConstructedMatchPayload): void {
  insertMatch(context, {
    user_id: context.userId,
    match_id: payload.matchId,
    mode: 'ranked',
    format: payload.format,
    run_id: null,
    result: payload.result,
    result_confidence: payload.resultConfidence,
    started_at: payload.startedAt,
    ended_at: payload.endedAt,
    duration_seconds: payload.durationSeconds,
    turns: payload.turns,
    player_hero_card_id: payload.playerHeroCardId,
    opponent_hero_card_id: payload.opponentHeroCardId,
    player_deck_code: payload.playerDeck.deckCode,
    player_deck_hash: payload.playerDeck.deckHash,
    player_deck_confidence: payload.playerDeck.confidence,
    mulligan_json: JSON.stringify(payload.playerMulligan),
    opponent_mulligan_replaced_count: payload.opponentMulliganReplacedCount,
    opponent_observed_json: JSON.stringify(payload.opponentDeck.observedCards),
    opponent_deck_code: payload.opponentDeck.deckCode,
    opponent_deck_hash: payload.opponentDeck.deckHash,
    opponent_deck_confidence: payload.opponentDeck.confidence,
    score_before: null,
    score_after: null,
    score_confidence: null,
    join_key: payload.gameJoinEvidence === null ? null : context.joinKey(payload.gameJoinEvidence),
    hearthstone_build: payload.hearthstoneBuild,
    scenario_id: payload.scenarioId,
    received_at: context.receivedAt,
  });
}

function insertArenaMatch(context: WriteContext, payload: ArenaMatchPayload): void {
  insertMatch(context, {
    user_id: context.userId,
    match_id: payload.matchId,
    mode: 'arena',
    format: null,
    run_id: payload.runId,
    result: payload.result,
    result_confidence: payload.resultConfidence,
    started_at: payload.startedAt,
    ended_at: payload.endedAt,
    duration_seconds: payload.durationSeconds,
    turns: payload.turns,
    player_hero_card_id: payload.playerHeroCardId,
    opponent_hero_card_id: payload.opponentHeroCardId,
    player_deck_code: null,
    player_deck_hash: null,
    player_deck_confidence: 'unknown',
    mulligan_json: JSON.stringify(payload.playerMulligan),
    opponent_mulligan_replaced_count: payload.opponentMulliganReplacedCount,
    opponent_observed_json: '[]',
    opponent_deck_code: null,
    opponent_deck_hash: null,
    opponent_deck_confidence: 'unknown',
    score_before: payload.scoreBefore,
    score_after: payload.scoreAfter,
    score_confidence: payload.scoreConfidence,
    join_key: null,
    hearthstone_build: payload.hearthstoneBuild,
    scenario_id: null,
    received_at: context.receivedAt,
  });
}

function insertArenaPick(context: WriteContext, payload: ArenaDraftPickPayload): void {
  replaceRow(context.database, 'tracker_arena_picks', [
    'user_id', 'run_id', 'pick_index', 'offered_json', 'chosen_card_id', 'observed_at', 'confidence', 'received_at',
  ], {
    user_id: context.userId,
    run_id: payload.runId,
    pick_index: payload.pickIndex,
    offered_json: JSON.stringify(payload.offeredCardIds),
    chosen_card_id: payload.chosenCardId,
    observed_at: payload.observedAt,
    confidence: payload.confidence,
    received_at: context.receivedAt,
  });
}

function insertArenaRun(context: WriteContext, payload: ArenaRunPayload): void {
  replaceRow(context.database, 'tracker_arena_runs', [
    'user_id', 'run_id', 'hero_card_id', 'final_deck_code', 'final_deck_hash', 'final_deck_confidence',
    'final_deck_cards_json', 'wins', 'losses', 'score_confidence', 'started_at', 'ended_at',
    'is_complete', 'rating_before', 'rating_after', 'rating_confidence', 'received_at',
  ], {
    user_id: context.userId,
    run_id: payload.runId,
    hero_card_id: payload.heroCardId,
    final_deck_code: payload.finalDeck.deckCode,
    final_deck_hash: payload.finalDeck.deckHash,
    final_deck_confidence: payload.finalDeck.confidence,
    final_deck_cards_json: JSON.stringify(payload.finalDeckCardIds),
    wins: payload.wins,
    losses: payload.losses,
    score_confidence: payload.scoreConfidence,
    started_at: payload.startedAt,
    ended_at: payload.endedAt,
    is_complete: payload.isComplete ? 1 : 0,
    rating_before: payload.ratingBefore,
    rating_after: payload.ratingAfter,
    rating_confidence: payload.ratingConfidence,
    received_at: context.receivedAt,
  });
}

function insertBattlegroundsMatch(context: WriteContext, payload: BattlegroundsMatchPayload): void {
  replaceRow(context.database, 'tracker_battlegrounds_matches', [
    'user_id', 'match_id', 'mode', 'mmr_before', 'mmr_after', 'mmr_confidence', 'hero_card_id',
    'placement', 'placement_confidence', 'started_at', 'ended_at', 'duration_seconds', 'final_turn',
    'final_board_json', 'hearthstone_build', 'received_at',
  ], {
    user_id: context.userId,
    match_id: payload.matchId,
    mode: payload.mode,
    mmr_before: payload.mmrBefore,
    mmr_after: payload.mmrAfter,
    mmr_confidence: payload.mmrConfidence,
    hero_card_id: payload.heroCardId,
    placement: payload.placement,
    placement_confidence: payload.placementConfidence,
    started_at: payload.startedAt,
    ended_at: payload.endedAt,
    duration_seconds: payload.durationSeconds,
    final_turn: payload.finalTurn,
    final_board_json: payload.finalBoard ? JSON.stringify(payload.finalBoard) : null,
    hearthstone_build: payload.hearthstoneBuild,
    received_at: context.receivedAt,
  });
}

/** Latest-state replacement: an unchanged content hash leaves the stored collection untouched. */
function replaceCollection(context: WriteContext, payload: CollectionSnapshotPayload): void {
  const { database, userId } = context;
  const existing = database.prepare(
    'SELECT content_hash FROM tracker_collections WHERE user_id = ? LIMIT 1',
  ).get(userId) as { content_hash: string } | undefined;
  if (existing?.content_hash === payload.contentHash) return;
  database.prepare('DELETE FROM tracker_collection_cards WHERE user_id = ?').run(userId);
  const insertCard = database.prepare(`
    INSERT INTO tracker_collection_cards (user_id, card_id, normal_count, golden_count, signature_count, diamond_count)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const card of payload.cards) {
    insertCard.run(userId, card.cardId, card.normalCount, card.goldenCount, card.signatureCount, card.diamondCount);
  }
  database.prepare(`
    INSERT OR REPLACE INTO tracker_collections (user_id, content_hash, observed_at, card_count, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, payload.contentHash, payload.observedAt, payload.cards.length, context.receivedAt);
}

function applyEvent(context: WriteContext, event: TrackerEvent): void {
  switch (event.type) {
    case 'constructed_match': return insertConstructedMatch(context, event.payload);
    case 'arena_match': return insertArenaMatch(context, event.payload);
    case 'arena_draft_pick': return insertArenaPick(context, event.payload);
    case 'arena_run': return insertArenaRun(context, event.payload);
    case 'battlegrounds_match': return insertBattlegroundsMatch(context, event.payload);
    case 'collection_snapshot': return replaceCollection(context, event.payload);
    default: return undefined;
  }
}

/**
 * SQLite adapter. Each event commits in its own immediate transaction so the
 * idempotency ledger and the domain row can never disagree.
 */
export function createSqliteTrackerProfileRepository(
  getDatabase: () => DatabaseSync,
  options: { joinKey: JoinKeyDeriver },
): TrackerProfileRepository {
  return {
    recordEvent(userId, event, receivedAt) {
      const database = getDatabase();
      database.exec('BEGIN IMMEDIATE');
      try {
        const inserted = database.prepare(`
          INSERT OR IGNORE INTO tracker_events (user_id, event_id, type, schema_version, occurred_at, received_at)
          VALUES (?, ?, ?, 1, ?, ?)
        `).run(userId, event.eventId, event.type, event.occurredAt, receivedAt);
        if (Number(inserted.changes) !== 1) {
          database.exec('ROLLBACK');
          return 'duplicate';
        }
        applyEvent({ database, userId, receivedAt, joinKey: options.joinKey }, event);
        database.exec('COMMIT');
        return 'stored';
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
    ...createTrackerProfileReads(getDatabase),
  };
}

export function initializeTrackerProfileRepository(getDatabase: () => DatabaseSync): void {
  getDatabase().exec(TRACKER_PROFILE_TABLES_SQL);
}
