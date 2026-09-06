import { createHmac } from 'node:crypto';

export const TRACKER_SCHEMA_VERSION = 1;
export const TRACKER_SCOPES = ['tracker.write', 'tracker.read'] as const;
export type TrackerScope = typeof TRACKER_SCOPES[number];

export const TRACKER_EVENT_TYPES = [
  'constructed_match',
  'arena_match',
  'arena_draft_pick',
  'arena_run',
  'battlegrounds_match',
  'collection_snapshot',
] as const;
export type TrackerEventType = typeof TRACKER_EVENT_TYPES[number];

export const TRACKER_CERTAINTIES = ['unknown', 'inferred', 'partial', 'exact'] as const;
export type TrackerCertainty = typeof TRACKER_CERTAINTIES[number];
export const TRACKER_MATCH_RESULTS = ['unknown', 'won', 'lost', 'tied'] as const;
export type TrackerMatchResult = typeof TRACKER_MATCH_RESULTS[number];
export const TRACKER_FORMATS = ['standard', 'wild'] as const;
export type TrackerFormat = typeof TRACKER_FORMATS[number];
export const TRACKER_BATTLEGROUNDS_MODES = ['unknown', 'solo', 'duos'] as const;
export type TrackerBattlegroundsMode = typeof TRACKER_BATTLEGROUNDS_MODES[number];
export const TRACKER_MATCH_MODES = ['ranked', 'arena', 'battlegrounds'] as const;
export type TrackerMatchMode = typeof TRACKER_MATCH_MODES[number];

/**
 * Wire limits shared with the desktop client; changing one is a contract
 * change. A full collection is the only payload allowed beyond 512 KiB, so the
 * batch body limit covers one 4 MiB snapshot plus ordinary neighbours.
 */
export const TRACKER_LIMITS = {
  batchEvents: 50,
  batchBodyBytes: 5 * 1024 * 1024,
  payloadBytes: 512 * 1024,
  collectionPayloadBytes: 4 * 1024 * 1024,
  cardIdLength: 64,
  deckCodeLength: 512,
  deckHashLength: 128,
  mulliganCards: 10,
  observedOpponentCards: 64,
  boardMinions: 7,
  arenaOffers: 8,
  arenaPicks: 40,
  arenaDeckCards: 40,
  arenaScore: 20,
  collectionCards: 20_000,
  contentHashLength: 64,
  turns: 200,
  durationSeconds: 21_600,
  joinEvidenceLength: 256,
  placement: 16,
  count: 1_000_000,
  readLimit: 50,
  defaultReadLimit: 20,
} as const;

export type DeckEvidence = {
  deckCode: string | null;
  deckHash: string | null;
  confidence: TrackerCertainty;
};

export type MulliganRecord = {
  initial: string[];
  kept: string[];
  replaced: string[];
  after: string[];
  confidence: TrackerCertainty;
};

export type OpponentDeckEvidence = DeckEvidence & { observedCards: string[] };

export type ConstructedMatchPayload = {
  matchId: string;
  gameType: 'ranked';
  format: TrackerFormat;
  result: TrackerMatchResult;
  resultConfidence: TrackerCertainty;
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
  turns: number;
  playerHeroCardId: string | null;
  opponentHeroCardId: string | null;
  playerDeck: DeckEvidence;
  playerMulligan: MulliganRecord;
  opponentMulliganReplacedCount: number | null;
  opponentDeck: OpponentDeckEvidence;
  gameJoinEvidence: string | null;
  hearthstoneBuild: number | null;
  scenarioId: number | null;
};

export type ArenaMatchPayload = {
  matchId: string;
  runId: string | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  scoreConfidence: TrackerCertainty;
  result: TrackerMatchResult;
  resultConfidence: TrackerCertainty;
  playerHeroCardId: string | null;
  opponentHeroCardId: string | null;
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
  turns: number;
  playerMulligan: MulliganRecord;
  opponentMulliganReplacedCount: number | null;
  hearthstoneBuild: number | null;
};

export type ArenaDraftPickPayload = {
  runId: string;
  pickIndex: number;
  offeredCardIds: string[];
  chosenCardId: string;
  observedAt: number;
  confidence: TrackerCertainty;
};

export type ArenaRunPayload = {
  runId: string;
  heroCardId: string | null;
  finalDeck: DeckEvidence;
  finalDeckCardIds: string[];
  wins: number;
  losses: number;
  scoreConfidence: TrackerCertainty;
  startedAt: number;
  endedAt: number | null;
  isComplete: boolean;
  ratingBefore: number | null;
  ratingAfter: number | null;
  ratingConfidence: TrackerCertainty;
};

export type FinalBoardMinion = {
  slot: number;
  cardId: string | null;
  attack: number;
  health: number;
  isGolden: boolean | null;
};

export type FinalBoard = {
  capturedAt: number;
  turn: number;
  minions: FinalBoardMinion[];
  confidence: TrackerCertainty;
};

export type BattlegroundsMatchPayload = {
  matchId: string;
  mode: TrackerBattlegroundsMode;
  mmrBefore: number | null;
  mmrAfter: number | null;
  mmrConfidence: TrackerCertainty;
  heroCardId: string | null;
  placement: number | null;
  placementConfidence: TrackerCertainty;
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
  finalTurn: number;
  finalBoard: FinalBoard | null;
  hearthstoneBuild: number | null;
};

export type CollectionCard = {
  cardId: string;
  normalCount: number;
  goldenCount: number;
  signatureCount: number | null;
  diamondCount: number | null;
};

export type CollectionSnapshotPayload = {
  observedAt: number;
  contentHash: string;
  cards: CollectionCard[];
};

export type TrackerPayloadByType = {
  constructed_match: ConstructedMatchPayload;
  arena_match: ArenaMatchPayload;
  arena_draft_pick: ArenaDraftPickPayload;
  arena_run: ArenaRunPayload;
  battlegrounds_match: BattlegroundsMatchPayload;
  collection_snapshot: CollectionSnapshotPayload;
};

/** One validated event; timestamps are epoch milliseconds after validation. */
export type TrackerEvent = {
  [Type in TrackerEventType]: {
    eventId: string;
    type: Type;
    occurredAt: number;
    payload: TrackerPayloadByType[Type];
  };
}[TrackerEventType];

type Timestamps<Value> = Omit<Value, 'startedAt' | 'endedAt'> & { startedAt: string; endedAt: string };

export type TrackerRankedMatchView = Timestamps<
  Omit<ConstructedMatchPayload, 'gameType' | 'gameJoinEvidence'>
> & { mode: 'ranked' };
export type TrackerArenaMatchView = Timestamps<ArenaMatchPayload> & { mode: 'arena' };
export type TrackerBattlegroundsMatchView = Timestamps<Omit<BattlegroundsMatchPayload, 'mode' | 'finalBoard'>> & {
  mode: 'battlegrounds';
  bgMode: TrackerBattlegroundsMode;
  finalBoard: (Omit<FinalBoard, 'capturedAt'> & { capturedAt: string }) | null;
};
export type TrackerMatchView = TrackerRankedMatchView | TrackerArenaMatchView | TrackerBattlegroundsMatchView;

export type TrackerArenaPickView = Omit<ArenaDraftPickPayload, 'runId' | 'observedAt'> & { observedAt: string };
export type TrackerArenaRunView = Omit<ArenaRunPayload, 'startedAt' | 'endedAt'> & {
  startedAt: string;
  endedAt: string | null;
  picks: TrackerArenaPickView[];
};

export type TrackerResultCounts = { games: number; wins: number; losses: number };
export type TrackerSummaryCounts = {
  ranked: { standard: TrackerResultCounts; wild: TrackerResultCounts };
  arena: { runs: number; completedRuns: number; completedWins: number };
  battlegrounds: {
    games: number;
    placedGames: number;
    placementSum: number;
    top4: number;
    first: number;
    mmrKnownGames: number;
  };
  collection: { cardCount: number; observedAt: number; contentHash: string } | null;
};

type RankedSummary = TrackerResultCounts & { winrate: number | null };
export type TrackerProfileSummary = {
  ranked: RankedSummary & { byFormat: { standard: RankedSummary; wild: RankedSummary } };
  arena: { runs: number; completedRuns: number; averageWins: number | null };
  battlegrounds: {
    games: number;
    averagePlacement: number | null;
    top4Rate: number | null;
    firstPlaceRate: number | null;
    mmrKnownGames: number;
  };
  collection: { cardCount: number; lastSyncedAt: string | null; contentHash: string | null };
};

export type TrackerProfileRepository = {
  /** Stores one validated event atomically; a repeated event id is a no-op. */
  recordEvent: (userId: string, event: TrackerEvent, receivedAt: number) => 'stored' | 'duplicate';
  readSummaryCounts: (userId: string) => TrackerSummaryCounts;
  listMatches: (userId: string, mode: TrackerMatchMode, limit: number) => TrackerMatchView[];
  listArenaRuns: (userId: string, limit: number) => TrackerArenaRunView[];
};

export type JoinKeyDeriver = (rawHandle: string) => string | null;

export const isoTimestamp = (milliseconds: number): string => new Date(milliseconds).toISOString();

const ratio = (numerator: number, denominator: number): number | null => (
  denominator > 0 ? Math.round((numerator / denominator) * 10_000) / 10_000 : null
);

/** Keyed digest of an authoritative game handle; the raw handle must not outlive this call. */
export function deriveJoinKey(secret: string, rawHandle: string): string {
  return createHmac('sha256', secret).update(rawHandle.trim()).digest('hex');
}

/** Without a configured secret every handle maps to null and opponent joining stays disabled. */
export function createJoinKeyDeriver(secret: string | null | undefined): { derive: JoinKeyDeriver; enabled: boolean } {
  const trimmed = String(secret ?? '').trim();
  if (!trimmed) return { derive: () => null, enabled: false };
  return { derive: rawHandle => (rawHandle.trim() ? deriveJoinKey(trimmed, rawHandle) : null), enabled: true };
}

/**
 * The opponent's exact deck is exposed only from the opponent's own exact
 * submission; the reader's inferred or partial evidence is never upgraded.
 */
export function exposeOpponentDeck(
  submitted: OpponentDeckEvidence,
  counterpart: DeckEvidence | null,
): OpponentDeckEvidence {
  if (!counterpart || counterpart.confidence !== 'exact' || !counterpart.deckCode) return submitted;
  return {
    observedCards: submitted.observedCards,
    deckCode: counterpart.deckCode,
    deckHash: counterpart.deckHash,
    confidence: 'exact',
  };
}

const rankedSummary = (counts: TrackerResultCounts): RankedSummary => ({
  ...counts,
  winrate: ratio(counts.wins, counts.wins + counts.losses),
});

export function buildProfileSummary(counts: TrackerSummaryCounts): TrackerProfileSummary {
  const standard = rankedSummary(counts.ranked.standard);
  const wild = rankedSummary(counts.ranked.wild);
  const battlegrounds = counts.battlegrounds;
  return {
    ranked: {
      ...rankedSummary({
        games: standard.games + wild.games,
        wins: standard.wins + wild.wins,
        losses: standard.losses + wild.losses,
      }),
      byFormat: { standard, wild },
    },
    arena: {
      runs: counts.arena.runs,
      completedRuns: counts.arena.completedRuns,
      averageWins: ratio(counts.arena.completedWins, counts.arena.completedRuns),
    },
    battlegrounds: {
      games: battlegrounds.games,
      averagePlacement: ratio(battlegrounds.placementSum, battlegrounds.placedGames),
      top4Rate: ratio(battlegrounds.top4, battlegrounds.placedGames),
      firstPlaceRate: ratio(battlegrounds.first, battlegrounds.placedGames),
      mmrKnownGames: battlegrounds.mmrKnownGames,
    },
    collection: counts.collection
      ? {
        cardCount: counts.collection.cardCount,
        lastSyncedAt: isoTimestamp(counts.collection.observedAt),
        contentHash: counts.collection.contentHash,
      }
      : { cardCount: 0, lastSyncedAt: null, contentHash: null },
  };
}
