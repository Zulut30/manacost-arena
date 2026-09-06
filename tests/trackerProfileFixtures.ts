let sequence = 0;

/** Deterministic RFC 9562 shaped ids so assertions can name them. */
export function nextUuid(): string {
  sequence += 1;
  return `0192a1b2-c3d4-7000-8000-${String(sequence).padStart(12, '0')}`;
}

type Overrides = Record<string, unknown>;

export const constructedMatch = (overrides: Overrides = {}) => ({
  matchId: nextUuid(),
  gameType: 'ranked',
  format: 'standard',
  result: 'won',
  resultConfidence: 'exact',
  startedAt: '2026-09-06T10:00:00Z',
  endedAt: '2026-09-06T10:12:30Z',
  durationSeconds: 750,
  turns: 12,
  playerHeroCardId: 'HERO_01',
  opponentHeroCardId: 'HERO_02',
  playerDeck: { deckCode: 'AAECAf0EAA==', deckHash: 'deck-hash-1', confidence: 'exact' },
  playerMulligan: {
    initial: ['CARD_A', 'CARD_B', 'CARD_C'],
    kept: ['CARD_A'],
    replaced: ['CARD_B', 'CARD_C'],
    after: ['CARD_A', 'CARD_D', 'CARD_E'],
    confidence: 'exact',
  },
  opponentMulliganReplacedCount: 1,
  opponentDeck: { observedCards: ['CARD_X', 'CARD_Y'], deckCode: null, deckHash: null, confidence: 'partial' },
  gameJoinEvidence: null,
  hearthstoneBuild: 210_000,
  scenarioId: 2,
  ...overrides,
});

export const arenaMatch = (overrides: Overrides = {}) => ({
  matchId: nextUuid(),
  runId: null,
  scoreBefore: 3,
  scoreAfter: 4,
  scoreConfidence: 'exact',
  result: 'won',
  resultConfidence: 'exact',
  playerHeroCardId: 'HERO_03',
  opponentHeroCardId: 'HERO_04',
  startedAt: '2026-09-06T11:00:00Z',
  endedAt: '2026-09-06T11:08:00Z',
  durationSeconds: 480,
  turns: 9,
  playerMulligan: { initial: ['CARD_A'], kept: ['CARD_A'], replaced: [], after: ['CARD_A'], confidence: 'partial' },
  opponentMulliganReplacedCount: null,
  hearthstoneBuild: null,
  ...overrides,
});

export const arenaDraftPick = (overrides: Overrides = {}) => ({
  runId: nextUuid(),
  pickIndex: 0,
  offeredCardIds: ['CARD_1', 'CARD_2', 'CARD_3'],
  chosenCardId: 'CARD_2',
  observedAt: '2026-09-06T09:30:00Z',
  confidence: 'exact',
  ...overrides,
});

export const arenaRun = (overrides: Overrides = {}) => ({
  runId: nextUuid(),
  heroCardId: 'HERO_03',
  finalDeck: { deckCode: null, deckHash: 'arena-hash', confidence: 'partial' },
  finalDeckCardIds: ['CARD_1', 'CARD_2'],
  wins: 7,
  losses: 3,
  scoreConfidence: 'exact',
  startedAt: '2026-09-06T09:00:00Z',
  endedAt: '2026-09-06T12:00:00Z',
  isComplete: true,
  ratingBefore: null,
  ratingAfter: null,
  ratingConfidence: 'unknown',
  ...overrides,
});

export const battlegroundsMatch = (overrides: Overrides = {}) => ({
  matchId: nextUuid(),
  mode: 'solo',
  mmrBefore: 6_000,
  mmrAfter: 6_040,
  mmrConfidence: 'exact',
  heroCardId: 'BG_HERO_01',
  placement: 2,
  placementConfidence: 'exact',
  startedAt: '2026-09-06T13:00:00Z',
  endedAt: '2026-09-06T13:25:00Z',
  durationSeconds: 1_500,
  finalTurn: 14,
  finalBoard: {
    capturedAt: '2026-09-06T13:24:00Z',
    turn: 14,
    minions: [{ slot: 1, cardId: 'BG_MINION_01', attack: 10, health: 12, isGolden: true }],
    confidence: 'exact',
  },
  hearthstoneBuild: 210_000,
  ...overrides,
});

export const collectionSnapshot = (overrides: Overrides = {}) => ({
  observedAt: '2026-09-06T08:00:00Z',
  contentHash: 'a'.repeat(64),
  cards: [
    { cardId: 'CARD_A', normalCount: 2, goldenCount: 0, signatureCount: null, diamondCount: null },
    { cardId: 'CARD_B', normalCount: 1, goldenCount: 1, signatureCount: 0, diamondCount: 0 },
  ],
  ...overrides,
});

export const trackerEvent = <Payload>(type: string, payload: Payload, overrides: Overrides = {}) => ({
  eventId: nextUuid(),
  type,
  schemaVersion: 1,
  occurredAt: '2026-09-06T12:00:00.1234567+00:00',
  payload,
  ...overrides,
});
