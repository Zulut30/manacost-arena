import {
  TRACKER_BATTLEGROUNDS_MODES,
  TRACKER_CERTAINTIES,
  TRACKER_EVENT_TYPES,
  TRACKER_FORMATS,
  TRACKER_LIMITS,
  TRACKER_MATCH_RESULTS,
  TRACKER_SCHEMA_VERSION,
  type ArenaDraftPickPayload,
  type ArenaMatchPayload,
  type ArenaRunPayload,
  type BattlegroundsMatchPayload,
  type CollectionCard,
  type CollectionSnapshotPayload,
  type ConstructedMatchPayload,
  type DeckEvidence,
  type FinalBoard,
  type FinalBoardMinion,
  type MulliganRecord,
  type OpponentDeckEvidence,
  type TrackerEvent,
  type TrackerEventType,
  type TrackerPayloadByType,
} from './model.js';

export type TrackerRejectionCode = 'invalid' | 'unsupported';
export type ParsedBatchEvent = { eventId: string } & (
  | { status: 'valid'; event: TrackerEvent }
  | { status: 'rejected'; code: TrackerRejectionCode }
);

/** The whole batch is malformed; the client treats this as a permanent rejection. */
export class TrackerBatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TrackerBatchError';
  }
}

class PayloadError extends Error {
  constructor(path: string) {
    super(`Invalid tracker payload at ${path}`);
    this.name = 'TrackerPayloadError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const HEX_64 = /^[0-9a-f]{64}$/i;
const ENVELOPE_KEYS = ['eventId', 'type', 'schemaVersion', 'occurredAt', 'payload'];

const fail = (path: string): never => {
  throw new PayloadError(path);
};
/** The client omits null optional members entirely, so absent and null are the same value. */
const present = (value: unknown): boolean => value !== undefined && value !== null;
const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

function record(value: unknown, keys: readonly string[], path: string): Record<string, unknown> {
  if (!isRecord(value)) return fail(path);
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${path}.${key}`);
  return value;
}

function text(value: unknown, path: string, maximumLength: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximumLength) return fail(path);
  return value;
}

const optionalText = (value: unknown, path: string, maximumLength: number): string | null => (
  present(value) ? text(value, path, maximumLength) : null
);

function integer(value: unknown, path: string, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    return fail(path);
  }
  return value;
}

const optionalInteger = (value: unknown, path: string, minimum: number, maximum: number): number | null => (
  present(value) ? integer(value, path, minimum, maximum) : null
);

function option<Value extends string>(value: unknown, path: string, allowed: readonly Value[]): Value {
  if (typeof value !== 'string' || !allowed.includes(value as Value)) return fail(path);
  return value as Value;
}

function timestamp(value: unknown, path: string): number {
  if (typeof value !== 'string' || !ISO_DATE_TIME.test(value)) return fail(path);
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : fail(path);
}

const optionalTimestamp = (value: unknown, path: string): number | null => (
  present(value) ? timestamp(value, path) : null
);

function uuid(value: unknown, path: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) return fail(path);
  return value.toLowerCase();
}

const optionalUuid = (value: unknown, path: string): string | null => (present(value) ? uuid(value, path) : null);

function cardIds(value: unknown, path: string, maximum: number, minimum = 0): string[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) return fail(path);
  return value.map((item, index) => text(item, `${path}[${index}]`, TRACKER_LIMITS.cardIdLength));
}

function boolean(value: unknown, path: string): boolean {
  return typeof value === 'boolean' ? value : fail(path);
}

const optionalBoolean = (value: unknown, path: string): boolean | null => (
  present(value) ? boolean(value, path) : null
);

const certainty = (value: unknown, path: string) => option(value, path, TRACKER_CERTAINTIES);
const count = (value: unknown, path: string) => integer(value, path, 0, TRACKER_LIMITS.count);
const optionalCount = (value: unknown, path: string) => optionalInteger(value, path, 0, TRACKER_LIMITS.count);
const cardId = (value: unknown, path: string) => optionalText(value, path, TRACKER_LIMITS.cardIdLength);

function deckEvidence(value: unknown, path: string): DeckEvidence {
  const source = record(value, ['deckCode', 'deckHash', 'confidence'], path);
  return {
    deckCode: optionalText(source.deckCode, `${path}.deckCode`, TRACKER_LIMITS.deckCodeLength),
    deckHash: optionalText(source.deckHash, `${path}.deckHash`, TRACKER_LIMITS.deckHashLength),
    confidence: certainty(source.confidence, `${path}.confidence`),
  };
}

function mulligan(value: unknown, path: string): MulliganRecord {
  const source = record(value, ['initial', 'kept', 'replaced', 'after', 'confidence'], path);
  const list = (key: 'initial' | 'kept' | 'replaced' | 'after') => (
    cardIds(source[key], `${path}.${key}`, TRACKER_LIMITS.mulliganCards)
  );
  return {
    initial: list('initial'),
    kept: list('kept'),
    replaced: list('replaced'),
    after: list('after'),
    confidence: certainty(source.confidence, `${path}.confidence`),
  };
}

function opponentDeck(value: unknown, path: string): OpponentDeckEvidence {
  const source = record(value, ['observedCards', 'deckCode', 'deckHash', 'confidence'], path);
  const { observedCards, ...evidence } = source;
  return {
    observedCards: cardIds(observedCards, `${path}.observedCards`, TRACKER_LIMITS.observedOpponentCards),
    ...deckEvidence(evidence, path),
  };
}

function matchTiming(source: Record<string, unknown>) {
  return {
    startedAt: timestamp(source.startedAt, 'startedAt'),
    endedAt: timestamp(source.endedAt, 'endedAt'),
    durationSeconds: integer(source.durationSeconds, 'durationSeconds', 0, TRACKER_LIMITS.durationSeconds),
    turns: integer(source.turns, 'turns', 0, TRACKER_LIMITS.turns),
  };
}

function parseConstructedMatch(payload: unknown): ConstructedMatchPayload {
  const source = record(payload, [
    'matchId', 'gameType', 'format', 'result', 'resultConfidence', 'startedAt', 'endedAt',
    'durationSeconds', 'turns', 'playerHeroCardId', 'opponentHeroCardId', 'playerDeck',
    'playerMulligan', 'opponentMulliganReplacedCount', 'opponentDeck', 'gameJoinEvidence',
    'hearthstoneBuild', 'scenarioId',
  ], 'payload');
  return {
    matchId: uuid(source.matchId, 'matchId'),
    gameType: option(source.gameType, 'gameType', ['ranked'] as const),
    format: option(source.format, 'format', TRACKER_FORMATS),
    result: option(source.result, 'result', TRACKER_MATCH_RESULTS),
    resultConfidence: certainty(source.resultConfidence, 'resultConfidence'),
    ...matchTiming(source),
    playerHeroCardId: cardId(source.playerHeroCardId, 'playerHeroCardId'),
    opponentHeroCardId: cardId(source.opponentHeroCardId, 'opponentHeroCardId'),
    playerDeck: deckEvidence(source.playerDeck, 'playerDeck'),
    playerMulligan: mulligan(source.playerMulligan, 'playerMulligan'),
    opponentMulliganReplacedCount: optionalInteger(
      source.opponentMulliganReplacedCount,
      'opponentMulliganReplacedCount',
      0,
      TRACKER_LIMITS.mulliganCards,
    ),
    opponentDeck: opponentDeck(source.opponentDeck, 'opponentDeck'),
    gameJoinEvidence: optionalText(source.gameJoinEvidence, 'gameJoinEvidence', TRACKER_LIMITS.joinEvidenceLength),
    hearthstoneBuild: optionalCount(source.hearthstoneBuild, 'hearthstoneBuild'),
    scenarioId: optionalCount(source.scenarioId, 'scenarioId'),
  };
}

function parseArenaMatch(payload: unknown): ArenaMatchPayload {
  const source = record(payload, [
    'matchId', 'runId', 'scoreBefore', 'scoreAfter', 'scoreConfidence', 'result', 'resultConfidence',
    'playerHeroCardId', 'opponentHeroCardId', 'startedAt', 'endedAt', 'durationSeconds', 'turns',
    'playerMulligan', 'opponentMulliganReplacedCount', 'hearthstoneBuild',
  ], 'payload');
  return {
    matchId: uuid(source.matchId, 'matchId'),
    runId: optionalUuid(source.runId, 'runId'),
    scoreBefore: optionalInteger(source.scoreBefore, 'scoreBefore', 0, TRACKER_LIMITS.arenaScore),
    scoreAfter: optionalInteger(source.scoreAfter, 'scoreAfter', 0, TRACKER_LIMITS.arenaScore),
    scoreConfidence: certainty(source.scoreConfidence, 'scoreConfidence'),
    result: option(source.result, 'result', TRACKER_MATCH_RESULTS),
    resultConfidence: certainty(source.resultConfidence, 'resultConfidence'),
    playerHeroCardId: cardId(source.playerHeroCardId, 'playerHeroCardId'),
    opponentHeroCardId: cardId(source.opponentHeroCardId, 'opponentHeroCardId'),
    ...matchTiming(source),
    playerMulligan: mulligan(source.playerMulligan, 'playerMulligan'),
    opponentMulliganReplacedCount: optionalInteger(
      source.opponentMulliganReplacedCount,
      'opponentMulliganReplacedCount',
      0,
      TRACKER_LIMITS.mulliganCards,
    ),
    hearthstoneBuild: optionalCount(source.hearthstoneBuild, 'hearthstoneBuild'),
  };
}

function parseArenaDraftPick(payload: unknown): ArenaDraftPickPayload {
  const source = record(payload, [
    'runId', 'pickIndex', 'offeredCardIds', 'chosenCardId', 'observedAt', 'confidence',
  ], 'payload');
  return {
    runId: uuid(source.runId, 'runId'),
    pickIndex: integer(source.pickIndex, 'pickIndex', 0, TRACKER_LIMITS.arenaPicks),
    offeredCardIds: cardIds(source.offeredCardIds, 'offeredCardIds', TRACKER_LIMITS.arenaOffers, 1),
    chosenCardId: text(source.chosenCardId, 'chosenCardId', TRACKER_LIMITS.cardIdLength),
    observedAt: timestamp(source.observedAt, 'observedAt'),
    confidence: certainty(source.confidence, 'confidence'),
  };
}

function parseArenaRun(payload: unknown): ArenaRunPayload {
  const source = record(payload, [
    'runId', 'heroCardId', 'finalDeck', 'finalDeckCardIds', 'wins', 'losses', 'scoreConfidence',
    'startedAt', 'endedAt', 'isComplete', 'ratingBefore', 'ratingAfter', 'ratingConfidence',
  ], 'payload');
  return {
    runId: uuid(source.runId, 'runId'),
    heroCardId: cardId(source.heroCardId, 'heroCardId'),
    finalDeck: deckEvidence(source.finalDeck, 'finalDeck'),
    finalDeckCardIds: cardIds(source.finalDeckCardIds, 'finalDeckCardIds', TRACKER_LIMITS.arenaDeckCards),
    wins: integer(source.wins, 'wins', 0, TRACKER_LIMITS.arenaScore),
    losses: integer(source.losses, 'losses', 0, TRACKER_LIMITS.arenaScore),
    scoreConfidence: certainty(source.scoreConfidence, 'scoreConfidence'),
    startedAt: timestamp(source.startedAt, 'startedAt'),
    endedAt: optionalTimestamp(source.endedAt, 'endedAt'),
    isComplete: boolean(source.isComplete, 'isComplete'),
    ratingBefore: optionalCount(source.ratingBefore, 'ratingBefore'),
    ratingAfter: optionalCount(source.ratingAfter, 'ratingAfter'),
    ratingConfidence: certainty(source.ratingConfidence, 'ratingConfidence'),
  };
}

function finalBoardMinion(value: unknown, path: string): FinalBoardMinion {
  const source = record(value, ['slot', 'cardId', 'attack', 'health', 'isGolden'], path);
  return {
    slot: integer(source.slot, `${path}.slot`, 1, TRACKER_LIMITS.boardMinions),
    cardId: cardId(source.cardId, `${path}.cardId`),
    attack: count(source.attack, `${path}.attack`),
    health: count(source.health, `${path}.health`),
    isGolden: optionalBoolean(source.isGolden, `${path}.isGolden`),
  };
}

function finalBoard(value: unknown, path: string): FinalBoard | null {
  if (!present(value)) return null;
  const source = record(value, ['capturedAt', 'turn', 'minions', 'confidence'], path);
  if (!Array.isArray(source.minions) || source.minions.length > TRACKER_LIMITS.boardMinions) {
    return fail(`${path}.minions`);
  }
  return {
    capturedAt: timestamp(source.capturedAt, `${path}.capturedAt`),
    turn: integer(source.turn, `${path}.turn`, 0, TRACKER_LIMITS.turns),
    minions: source.minions.map((minion, index) => finalBoardMinion(minion, `${path}.minions[${index}]`)),
    confidence: certainty(source.confidence, `${path}.confidence`),
  };
}

function parseBattlegroundsMatch(payload: unknown): BattlegroundsMatchPayload {
  const source = record(payload, [
    'matchId', 'mode', 'mmrBefore', 'mmrAfter', 'mmrConfidence', 'heroCardId', 'placement',
    'placementConfidence', 'startedAt', 'endedAt', 'durationSeconds', 'finalTurn', 'finalBoard',
    'hearthstoneBuild',
  ], 'payload');
  return {
    matchId: uuid(source.matchId, 'matchId'),
    mode: option(source.mode, 'mode', TRACKER_BATTLEGROUNDS_MODES),
    mmrBefore: optionalCount(source.mmrBefore, 'mmrBefore'),
    mmrAfter: optionalCount(source.mmrAfter, 'mmrAfter'),
    mmrConfidence: certainty(source.mmrConfidence, 'mmrConfidence'),
    heroCardId: cardId(source.heroCardId, 'heroCardId'),
    placement: optionalInteger(source.placement, 'placement', 1, TRACKER_LIMITS.placement),
    placementConfidence: certainty(source.placementConfidence, 'placementConfidence'),
    startedAt: timestamp(source.startedAt, 'startedAt'),
    endedAt: timestamp(source.endedAt, 'endedAt'),
    durationSeconds: integer(source.durationSeconds, 'durationSeconds', 0, TRACKER_LIMITS.durationSeconds),
    finalTurn: integer(source.finalTurn, 'finalTurn', 0, TRACKER_LIMITS.turns),
    finalBoard: finalBoard(source.finalBoard, 'finalBoard'),
    hearthstoneBuild: optionalCount(source.hearthstoneBuild, 'hearthstoneBuild'),
  };
}

function collectionCard(value: unknown, path: string): CollectionCard {
  const source = record(value, ['cardId', 'normalCount', 'goldenCount', 'signatureCount', 'diamondCount'], path);
  return {
    cardId: text(source.cardId, `${path}.cardId`, TRACKER_LIMITS.cardIdLength),
    normalCount: count(source.normalCount, `${path}.normalCount`),
    goldenCount: count(source.goldenCount, `${path}.goldenCount`),
    signatureCount: optionalCount(source.signatureCount, `${path}.signatureCount`),
    diamondCount: optionalCount(source.diamondCount, `${path}.diamondCount`),
  };
}

function parseCollectionSnapshot(payload: unknown): CollectionSnapshotPayload {
  const source = record(payload, ['observedAt', 'contentHash', 'cards'], 'payload');
  if (typeof source.contentHash !== 'string' || !HEX_64.test(source.contentHash)) fail('contentHash');
  if (!Array.isArray(source.cards) || source.cards.length > TRACKER_LIMITS.collectionCards) fail('cards');
  const cards = (source.cards as unknown[]).map((card, index) => collectionCard(card, `cards[${index}]`));
  if (new Set(cards.map(card => card.cardId)).size !== cards.length) fail('cards');
  return {
    observedAt: timestamp(source.observedAt, 'observedAt'),
    contentHash: String(source.contentHash).toLowerCase(),
    cards,
  };
}

const PARSERS: { [Type in TrackerEventType]: (payload: unknown) => TrackerPayloadByType[Type] } = {
  constructed_match: parseConstructedMatch,
  arena_match: parseArenaMatch,
  arena_draft_pick: parseArenaDraftPick,
  arena_run: parseArenaRun,
  battlegrounds_match: parseBattlegroundsMatch,
  collection_snapshot: parseCollectionSnapshot,
};

function parseBatchEvent(entry: unknown, index: number): ParsedBatchEvent {
  if (!isRecord(entry)) throw new TrackerBatchError(`events[${index}] must be an object`);
  if (typeof entry.eventId !== 'string' || !UUID.test(entry.eventId)) {
    throw new TrackerBatchError(`events[${index}].eventId must be a UUID`);
  }
  const eventId = entry.eventId.toLowerCase();
  const type = TRACKER_EVENT_TYPES.find(candidate => candidate === entry.type);
  if (!type || entry.schemaVersion !== TRACKER_SCHEMA_VERSION) return { eventId, status: 'rejected', code: 'unsupported' };
  try {
    const envelope = record(entry, ENVELOPE_KEYS, 'event');
    const occurredAt = timestamp(envelope.occurredAt, 'occurredAt');
    const payloadLimit = type === 'collection_snapshot'
      ? TRACKER_LIMITS.collectionPayloadBytes
      : TRACKER_LIMITS.payloadBytes;
    if (!isRecord(envelope.payload) || Buffer.byteLength(JSON.stringify(envelope.payload)) > payloadLimit) {
      fail('payload');
    }
    const payload = PARSERS[type](envelope.payload);
    return { eventId, status: 'valid', event: { eventId, type, occurredAt, payload } as TrackerEvent };
  } catch (error) {
    if (error instanceof PayloadError) return { eventId, status: 'rejected', code: 'invalid' };
    throw error;
  }
}

/**
 * Splits a batch into per-event verdicts. Envelope-level defects throw
 * TrackerBatchError because they cannot be attributed to one event id.
 */
export function parseTrackerBatch(body: unknown): ParsedBatchEvent[] {
  if (!isRecord(body)) throw new TrackerBatchError('Request body must be a JSON object');
  const events = body.events;
  if (!Array.isArray(events) || events.length < 1 || events.length > TRACKER_LIMITS.batchEvents) {
    throw new TrackerBatchError(`events must contain 1..${TRACKER_LIMITS.batchEvents} items`);
  }
  return events.map((entry, index) => parseBatchEvent(entry, index));
}
