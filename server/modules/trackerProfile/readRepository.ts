import type { DatabaseSync } from 'node:sqlite';
import {
  exposeOpponentDeck,
  isoTimestamp,
  type FinalBoard,
  type MulliganRecord,
  type TrackerArenaMatchView,
  type TrackerArenaPickView,
  type TrackerArenaRunView,
  type TrackerBattlegroundsMatchView,
  type TrackerCertainty,
  type TrackerMatchResult,
  type TrackerProfileRepository,
  type TrackerRankedMatchView,
  type TrackerSummaryCounts,
} from './model.js';

type MatchRow = {
  match_id: string;
  format: string | null;
  run_id: string | null;
  result: TrackerMatchResult;
  result_confidence: TrackerCertainty;
  started_at: number;
  ended_at: number;
  duration_seconds: number;
  turns: number;
  player_hero_card_id: string | null;
  opponent_hero_card_id: string | null;
  player_deck_code: string | null;
  player_deck_hash: string | null;
  player_deck_confidence: TrackerCertainty;
  mulligan_json: string;
  opponent_mulligan_replaced_count: number | null;
  opponent_observed_json: string;
  opponent_deck_code: string | null;
  opponent_deck_hash: string | null;
  opponent_deck_confidence: TrackerCertainty;
  score_before: number | null;
  score_after: number | null;
  score_confidence: TrackerCertainty | null;
  hearthstone_build: number | null;
  scenario_id: number | null;
  counterpart_deck_code: string | null;
  counterpart_deck_hash: string | null;
  counterpart_deck_confidence: TrackerCertainty | null;
};

type BattlegroundsRow = {
  match_id: string;
  mode: TrackerBattlegroundsMatchView['bgMode'];
  mmr_before: number | null;
  mmr_after: number | null;
  mmr_confidence: TrackerCertainty;
  hero_card_id: string | null;
  placement: number | null;
  placement_confidence: TrackerCertainty;
  started_at: number;
  ended_at: number;
  duration_seconds: number;
  final_turn: number;
  final_board_json: string | null;
  hearthstone_build: number | null;
};

type RunRow = {
  run_id: string;
  hero_card_id: string | null;
  final_deck_code: string | null;
  final_deck_hash: string | null;
  final_deck_confidence: TrackerCertainty;
  final_deck_cards_json: string;
  wins: number;
  losses: number;
  score_confidence: TrackerCertainty;
  started_at: number;
  ended_at: number | null;
  is_complete: number;
  rating_before: number | null;
  rating_after: number | null;
  rating_confidence: TrackerCertainty;
};

type PickRow = {
  run_id: string;
  pick_index: number;
  offered_json: string;
  chosen_card_id: string;
  observed_at: number;
  confidence: TrackerCertainty;
};

type CountRow = Record<string, number | null>;

const EMPTY_MULLIGAN: MulliganRecord = { initial: [], kept: [], replaced: [], after: [], confidence: 'unknown' };

function parseJson<Value>(text: string | null, fallback: Value): Value {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as Value;
  } catch {
    return fallback;
  }
}

const number = (value: number | null | undefined): number => Number(value ?? 0);

/** The counterpart columns come from the opponent's own exact row; the raw join key never leaves SQL. */
const MATCH_QUERY = `
  SELECT m.*,
    c.player_deck_code AS counterpart_deck_code,
    c.player_deck_hash AS counterpart_deck_hash,
    c.player_deck_confidence AS counterpart_deck_confidence
  FROM tracker_matches m
  LEFT JOIN tracker_matches c ON c.rowid = (
    SELECT x.rowid FROM tracker_matches x
    WHERE x.join_key = m.join_key
      AND x.user_id <> m.user_id
      AND x.player_deck_confidence = 'exact'
      AND x.player_deck_code IS NOT NULL
    ORDER BY x.received_at ASC, x.rowid ASC
    LIMIT 1
  )
  WHERE m.user_id = ? AND m.mode = ?
  ORDER BY m.ended_at DESC, m.received_at DESC, m.rowid DESC
  LIMIT ?
`;

function rankedView(row: MatchRow): TrackerRankedMatchView {
  return {
    mode: 'ranked',
    matchId: row.match_id,
    format: row.format === 'wild' ? 'wild' : 'standard',
    result: row.result,
    resultConfidence: row.result_confidence,
    startedAt: isoTimestamp(row.started_at),
    endedAt: isoTimestamp(row.ended_at),
    durationSeconds: row.duration_seconds,
    turns: row.turns,
    playerHeroCardId: row.player_hero_card_id,
    opponentHeroCardId: row.opponent_hero_card_id,
    playerDeck: {
      deckCode: row.player_deck_code,
      deckHash: row.player_deck_hash,
      confidence: row.player_deck_confidence,
    },
    playerMulligan: parseJson(row.mulligan_json, EMPTY_MULLIGAN),
    opponentMulliganReplacedCount: row.opponent_mulligan_replaced_count,
    opponentDeck: exposeOpponentDeck(
      {
        observedCards: parseJson<string[]>(row.opponent_observed_json, []),
        deckCode: row.opponent_deck_code,
        deckHash: row.opponent_deck_hash,
        confidence: row.opponent_deck_confidence,
      },
      row.counterpart_deck_confidence
        ? {
          deckCode: row.counterpart_deck_code,
          deckHash: row.counterpart_deck_hash,
          confidence: row.counterpart_deck_confidence,
        }
        : null,
    ),
    hearthstoneBuild: row.hearthstone_build,
    scenarioId: row.scenario_id,
  };
}

function arenaView(row: MatchRow): TrackerArenaMatchView {
  return {
    mode: 'arena',
    matchId: row.match_id,
    runId: row.run_id,
    scoreBefore: row.score_before,
    scoreAfter: row.score_after,
    scoreConfidence: row.score_confidence ?? 'unknown',
    result: row.result,
    resultConfidence: row.result_confidence,
    playerHeroCardId: row.player_hero_card_id,
    opponentHeroCardId: row.opponent_hero_card_id,
    startedAt: isoTimestamp(row.started_at),
    endedAt: isoTimestamp(row.ended_at),
    durationSeconds: row.duration_seconds,
    turns: row.turns,
    playerMulligan: parseJson(row.mulligan_json, EMPTY_MULLIGAN),
    opponentMulliganReplacedCount: row.opponent_mulligan_replaced_count,
    hearthstoneBuild: row.hearthstone_build,
  };
}

function battlegroundsView(row: BattlegroundsRow): TrackerBattlegroundsMatchView {
  const board = parseJson<FinalBoard | null>(row.final_board_json, null);
  return {
    mode: 'battlegrounds',
    matchId: row.match_id,
    bgMode: row.mode,
    mmrBefore: row.mmr_before,
    mmrAfter: row.mmr_after,
    mmrConfidence: row.mmr_confidence,
    heroCardId: row.hero_card_id,
    placement: row.placement,
    placementConfidence: row.placement_confidence,
    startedAt: isoTimestamp(row.started_at),
    endedAt: isoTimestamp(row.ended_at),
    durationSeconds: row.duration_seconds,
    finalTurn: row.final_turn,
    finalBoard: board ? { ...board, capturedAt: isoTimestamp(board.capturedAt) } : null,
    hearthstoneBuild: row.hearthstone_build,
  };
}

const pickView = (row: PickRow): TrackerArenaPickView => ({
  pickIndex: row.pick_index,
  offeredCardIds: parseJson<string[]>(row.offered_json, []),
  chosenCardId: row.chosen_card_id,
  observedAt: isoTimestamp(row.observed_at),
  confidence: row.confidence,
});

function runView(row: RunRow, picks: TrackerArenaPickView[]): TrackerArenaRunView {
  return {
    runId: row.run_id,
    heroCardId: row.hero_card_id,
    finalDeck: {
      deckCode: row.final_deck_code,
      deckHash: row.final_deck_hash,
      confidence: row.final_deck_confidence,
    },
    finalDeckCardIds: parseJson<string[]>(row.final_deck_cards_json, []),
    wins: row.wins,
    losses: row.losses,
    scoreConfidence: row.score_confidence,
    startedAt: isoTimestamp(row.started_at),
    endedAt: row.ended_at === null ? null : isoTimestamp(row.ended_at),
    isComplete: row.is_complete === 1,
    ratingBefore: row.rating_before,
    ratingAfter: row.rating_after,
    ratingConfidence: row.rating_confidence,
    picks,
  };
}

function readSummaryCounts(database: DatabaseSync, userId: string): TrackerSummaryCounts {
  const rankedRows = database.prepare(`
    SELECT format, COUNT(*) AS games, SUM(result = 'won') AS wins, SUM(result = 'lost') AS losses
    FROM tracker_matches WHERE user_id = ? AND mode = 'ranked' GROUP BY format
  `).all(userId) as Array<CountRow & { format: string | null }>;
  const ranked = (format: string) => {
    const row = rankedRows.find(candidate => candidate.format === format);
    return { games: number(row?.games), wins: number(row?.wins), losses: number(row?.losses) };
  };
  const arena = database.prepare(`
    SELECT COUNT(*) AS runs, SUM(is_complete) AS completed_runs,
      SUM(CASE WHEN is_complete = 1 THEN wins ELSE 0 END) AS completed_wins
    FROM tracker_arena_runs WHERE user_id = ?
  `).get(userId) as CountRow;
  const battlegrounds = database.prepare(`
    SELECT COUNT(*) AS games, SUM(placement IS NOT NULL) AS placed_games, SUM(placement) AS placement_sum,
      SUM(placement <= 4) AS top4, SUM(placement = 1) AS first, SUM(mmr_after IS NOT NULL) AS mmr_known_games
    FROM tracker_battlegrounds_matches WHERE user_id = ?
  `).get(userId) as CountRow;
  const collection = database.prepare(
    'SELECT content_hash, observed_at, card_count FROM tracker_collections WHERE user_id = ? LIMIT 1',
  ).get(userId) as { content_hash: string; observed_at: number; card_count: number } | undefined;
  return {
    ranked: { standard: ranked('standard'), wild: ranked('wild') },
    arena: {
      runs: number(arena.runs),
      completedRuns: number(arena.completed_runs),
      completedWins: number(arena.completed_wins),
    },
    battlegrounds: {
      games: number(battlegrounds.games),
      placedGames: number(battlegrounds.placed_games),
      placementSum: number(battlegrounds.placement_sum),
      top4: number(battlegrounds.top4),
      first: number(battlegrounds.first),
      mmrKnownGames: number(battlegrounds.mmr_known_games),
    },
    collection: collection
      ? { cardCount: collection.card_count, observedAt: collection.observed_at, contentHash: collection.content_hash }
      : null,
  };
}

function listArenaRuns(database: DatabaseSync, userId: string, limit: number): TrackerArenaRunView[] {
  const runs = database.prepare(`
    SELECT * FROM tracker_arena_runs WHERE user_id = ?
    ORDER BY started_at DESC, received_at DESC, rowid DESC LIMIT ?
  `).all(userId, limit) as RunRow[];
  if (runs.length === 0) return [];
  const picks = database.prepare(`
    SELECT run_id, pick_index, offered_json, chosen_card_id, observed_at, confidence
    FROM tracker_arena_picks
    WHERE user_id = ? AND run_id IN (${runs.map(() => '?').join(', ')})
    ORDER BY pick_index ASC
  `).all(userId, ...runs.map(run => run.run_id)) as PickRow[];
  return runs.map(run => runView(run, picks.filter(pick => pick.run_id === run.run_id).map(pickView)));
}

export function createTrackerProfileReads(
  getDatabase: () => DatabaseSync,
): Pick<TrackerProfileRepository, 'readSummaryCounts' | 'listMatches' | 'listArenaRuns'> {
  return {
    readSummaryCounts: userId => readSummaryCounts(getDatabase(), userId),
    listMatches(userId, mode, limit) {
      const database = getDatabase();
      if (mode === 'battlegrounds') {
        const rows = database.prepare(`
          SELECT * FROM tracker_battlegrounds_matches WHERE user_id = ?
          ORDER BY ended_at DESC, received_at DESC, rowid DESC LIMIT ?
        `).all(userId, limit) as BattlegroundsRow[];
        return rows.map(battlegroundsView);
      }
      const rows = database.prepare(MATCH_QUERY).all(userId, mode, limit) as MatchRow[];
      return mode === 'arena' ? rows.map(arenaView) : rows.map(rankedView);
    },
    listArenaRuns: (userId, limit) => listArenaRuns(getDatabase(), userId, limit),
  };
}
