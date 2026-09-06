# Tracker profile ingestion v1

## Objective

Accept personal Hearthstone tracker data from the IceCrow desktop companion
and expose it back to the owning user:

- an authenticated, idempotent and validated batch ingestion endpoint;
- per-user persistence of ranked, Arena and Battlegrounds matches, Arena runs
  and draft picks, and the latest collection snapshot;
- read endpoints the profile UI can consume later;
- an opponent-join rule that never turns inferred data into exact data.

The wire contract is frozen: the desktop client already implements it. Raw
`Power.log` content, player names and Battle.net identifiers are never
transmitted or stored.

## Technical context

- Express 4 router in `server/modules/trackerProfile/`, registered by
  `server/app/registerTrackerProfile.ts` directly after the application
  authorization boundary.
- Bearer tokens are issued by the OAuth device flow described in
  `docs/specs/public-api-v1-first-slice.md`. The `manacost-tracker` client
  may request the new `tracker.write` and `tracker.read` scopes.
- Node SQLite persistence with `CREATE TABLE IF NOT EXISTS` tables and
  `ON DELETE CASCADE` foreign keys to `users`.
- `express-rate-limit` per-IP and per-user limiters at the module boundary.
- Optional `TRACKER_JOIN_SECRET` environment variable for opponent joining.

## HTTP contract

Every response carries `Cache-Control: private, no-store`,
`Pragma: no-cache` and `Vary: Authorization, Cookie`.

Errors use the shared Public API shape:

```json
{ "error": { "code": "INVALID_ACCESS_TOKEN", "message": "..." } }
```

Codes: `INVALID_ACCESS_TOKEN` (401, missing, invalid or expired bearer
token), `LOGIN_REQUIRED` (401, read route without any credential),
`INSUFFICIENT_SCOPE` (403), `INVALID_BATCH` (400), `INVALID_QUERY` (400),
`RATE_LIMITED` (429) and `TRACKER_UNAVAILABLE` (503).

### `POST /api/v1/tracker/events/batch`

- requires `Authorization: Bearer <application access token>` with the
  `tracker.write` scope; browser sessions and API keys are rejected;
- JSON body `{ "events": [ ... ] }` with 1..50 events; the route-scoped JSON
  boundary in `server/jsonBody.ts` accepts up to 5 MiB for this path only
  (every other `/api` route keeps 1 MiB) and rejects larger bodies with
  `413` before the router runs;
- every event is `{ eventId, type, schemaVersion, occurredAt, payload }`
  where `eventId` is an RFC 9562 UUID (the client emits version 7),
  `occurredAt` is an ISO-8601 date-time with zone and `payload` is an
  object;
- an envelope that is not an object, has no valid `events` array, exceeds the
  batch size, or contains an event without an object shape or a valid
  `eventId` is rejected as a whole with `400 INVALID_BATCH`;
- unknown `type` or `schemaVersion !== 1` rejects that event with code
  `unsupported`;
- a payload that fails validation, contains unknown keys or exceeds its size
  allowance rejects that event with code `invalid`: `collection_snapshot`
  payloads may be up to 4 MiB (a full Hearthstone collection is roughly 6000
  cards), every other type stays within 512 KiB;
- an `eventId` already stored for the same user is accepted again without
  changing anything (idempotent no-op), including repeats inside one batch;
- the batch is acknowledged partially: valid events are stored even when
  neighbours are rejected.

Response `200`:

```json
{
  "accepted": ["<eventId>", "..."],
  "rejected": [{ "eventId": "<eventId>", "code": "invalid" }]
}
```

The response contains exactly these fields. The desktop client disallows
unmapped members, so additive fields must wait for a new schema version.

Rate limits: 60 requests per 15 minutes per client IP and 120 requests per
15 minutes per authenticated user, both with `RateLimit-*` and `Retry-After`
headers and a `429 RATE_LIMITED` body. The limiters run after the shared
`/api/` limiter.

### `GET /api/v1/tracker/profile/summary`

Requires either a bearer token with `tracker.read` or the existing browser
session cookie. Returns:

```json
{
  "ranked": {
    "games": 0, "wins": 0, "losses": 0, "winrate": null,
    "byFormat": {
      "standard": { "games": 0, "wins": 0, "losses": 0, "winrate": null },
      "wild": { "games": 0, "wins": 0, "losses": 0, "winrate": null }
    }
  },
  "arena": { "runs": 0, "completedRuns": 0, "averageWins": null },
  "battlegrounds": {
    "games": 0, "averagePlacement": null, "top4Rate": null,
    "firstPlaceRate": null, "mmrKnownGames": 0
  },
  "collection": { "cardCount": 0, "lastSyncedAt": null, "contentHash": null }
}
```

- `winrate` is `wins / (wins + losses)` rounded to four decimals; ties and
  unknown results count as games but not in the ratio; `null` without a
  decided game;
- `averageWins` averages `wins` over completed runs;
- placement ratios use only matches with a known placement; `mmrKnownGames`
  counts matches with a non-null `mmrAfter`;
- `cardCount` is the number of distinct card entries in the latest snapshot.

### `GET /api/v1/tracker/profile/matches?mode=&limit=`

Same authorization as the summary. `mode` is `ranked` (default), `arena` or
`battlegrounds`; `limit` is 1..50 (default 20). Any other value returns
`400 INVALID_QUERY`. Matches are returned newest first by `endedAt`, then by
receipt order, as `{ "mode": "...", "matches": [ ... ] }`.

A ranked match echoes the submitted fields (`matchId`, `format`, `result`,
`resultConfidence`, timestamps as ISO strings, `durationSeconds`, `turns`,
hero card ids, `playerDeck`, `playerMulligan`,
`opponentMulliganReplacedCount`, `opponentDeck`, `hearthstoneBuild`,
`scenarioId`). `gameJoinEvidence` and the derived join key are never
returned. Arena and Battlegrounds matches echo their own payload fields; a
Battlegrounds `mode` is exposed as `bgMode` because `mode` names the list.

Opponent deck exposure rule: `opponentDeck` is returned as
`{ observedCards, deckCode, deckHash, confidence: "exact" }` only when
another user's match row has the same non-null join key, the two rows belong
to different users, and that other row's own `playerDeck.confidence` is
`exact`. Otherwise the submitted opponent evidence is returned unchanged.
Inferred or partial evidence is never upgraded.

### `GET /api/v1/tracker/profile/arena/runs?limit=`

Same authorization and `limit` rules. Returns `{ "runs": [ ... ] }` newest
first by `startedAt`. Each run echoes the `arena_run` payload plus `picks`
ordered by `pickIndex`. Picks whose run has not been submitted yet are stored
but not listed until the run arrives.

## Data contract

All enums are camelCase strings. `certainty` is one of `unknown`,
`inferred`, `partial`, `exact`. Card ids are strings of at most 64
characters. Every nullable field may be absent or `null`; the two are
identical everywhere, and the client omits null members entirely
(`WhenWritingNull`). Unknown keys are rejected.

- `deckEvidence`: `{ deckCode?, deckHash?, confidence }`.
- `mulligan`: `{ initial[], kept[], replaced[], after[], confidence }`, each
  list at most 10 card ids.
- `constructed_match`: `matchId` (UUID), `gameType` (`ranked`), `format`
  (`standard` | `wild`), `result` (`unknown` | `won` | `lost` | `tied`),
  `resultConfidence`, `startedAt`, `endedAt`, `durationSeconds` (0..21600),
  `turns` (0..200), `playerHeroCardId?`, `opponentHeroCardId?`,
  `playerDeck`, `playerMulligan`, `opponentMulliganReplacedCount?` (0..10),
  `opponentDeck` `{ observedCards[] (at most 64), deckCode?, deckHash?,
  confidence }`, `gameJoinEvidence?` (string of at most 256 characters or
  null), `hearthstoneBuild?`, `scenarioId?`.
- `arena_match`: `matchId`, `runId?`, `scoreBefore?`, `scoreAfter?`,
  `scoreConfidence`, `result`, `resultConfidence`, hero card ids,
  `startedAt`, `endedAt`, `durationSeconds`, `turns`, `playerMulligan`,
  `opponentMulliganReplacedCount?`, `hearthstoneBuild?`.
- `arena_draft_pick`: `runId`, `pickIndex` (0..40), `offeredCardIds[]`
  (1..8), `chosenCardId`, `observedAt`, `confidence`.
- `arena_run`: `runId`, `heroCardId?`, `finalDeck` (deck evidence),
  `finalDeckCardIds[]` (at most 40), `wins` (0..20), `losses` (0..20),
  `scoreConfidence`, `startedAt`, `endedAt?`, `isComplete`,
  `ratingBefore?`, `ratingAfter?`, `ratingConfidence`.
- `battlegrounds_match`: `matchId`, `mode` (`unknown` | `solo` | `duos`),
  `mmrBefore?`, `mmrAfter?`, `mmrConfidence`, `heroCardId?`, `placement?`
  (1..16), `placementConfidence`, `startedAt`, `endedAt`,
  `durationSeconds`, `finalTurn` (0..200), `finalBoard?`
  `{ capturedAt, turn, minions[] (at most 7 of { slot (1..7), cardId?,
  attack, health, isGolden? }), confidence }`, `hearthstoneBuild?`.
- `collection_snapshot`: `observedAt`, `contentHash` (64 hex characters),
  `cards[]` (at most 20000 of `{ cardId, normalCount, goldenCount,
  signatureCount?, diamondCount? }`). Latest-state semantics: a different
  `contentHash` replaces the stored collection atomically; the same hash is
  accepted as a no-op.

Integer fields accept only safe integers; counts and scores are bounded to
`0..1000000` unless a tighter range is listed.

### Storage

<!-- markdownlint-disable MD013 -->

| Table | Key | Content |
| --- | --- | --- |
| `tracker_events` | `(user_id, event_id)` | type, schema version, `occurred_at`, `received_at`; the idempotency ledger |
| `tracker_matches` | `(user_id, match_id)` | ranked and Arena matches: mode, format, result and confidences, timestamps, duration, turns, heroes, deck code/hash/confidence, `mulligan_json`, `opponent_observed_json`, opponent deck fields, Arena scores, `join_key`, build, `run_id` |
| `tracker_arena_runs` | `(user_id, run_id)` | final deck evidence, deck card ids, wins, losses, timestamps, completion and rating fields |
| `tracker_arena_picks` | `(user_id, run_id, pick_index)` | offered and chosen card ids, `observed_at`, confidence |
| `tracker_battlegrounds_matches` | `(user_id, match_id)` | mode, MMR fields, hero, placement fields, timestamps, `final_turn`, `final_board_json` |
| `tracker_collections` | `user_id` | `content_hash`, `observed_at`, `card_count` |
| `tracker_collection_cards` | `(user_id, card_id)` | per-variant counts, replaced atomically with the snapshot |

<!-- markdownlint-enable MD013 -->

Indexes cover `(user_id, ended_at)`, deck hashes, `(mode, format)`,
`run_id`, `event_id` and `join_key`. Timestamps are stored as epoch
milliseconds and serialized as ISO strings. A repeated `matchId` or `runId`
from the same user replaces the earlier row; every event is committed in its
own transaction so a failed neighbour never blocks a valid event.

### Join key

When `gameJoinEvidence` is present and `TRACKER_JOIN_SECRET` is configured,
`join_key = HMAC-SHA256(secret, rawHandle)` (hex) is stored and the raw
handle is discarded. Without the secret the key is `null`, opponent joining
is disabled, and the server logs one startup warning. The raw handle is
never persisted, logged or returned.

## Threat model

<!-- markdownlint-disable MD013 -->

| Boundary | Abuse case | Control |
| --- | --- | --- |
| Batch endpoint | Request without a user credential | Bearer-only authentication with explicit `tracker.write` scope; cookies and API keys are rejected |
| Batch endpoint | Cross-site cookie mutation | No cookie authentication on the write route, so the CSRF boundary has nothing to protect |
| Batch endpoint | Oversized or unbounded payloads | Route-scoped 5 MiB JSON body limit, 50 events per batch, 512 KiB per payload (4 MiB for a collection), bounded lists and integers |
| Batch endpoint | Replayed uploads after a lost acknowledgement | `(user_id, event_id)` idempotency ledger; duplicates are accepted without changes |
| Batch endpoint | Flooding from one client or many tokens | Per-IP and per-user limiters after the shared `/api/` limiter |
| Storage | Raw game handles reveal cross-user activity | Only a keyed HMAC is stored; the secret lives outside the repository |
| Storage | Raw logs or player names leak through the API | The contract has no such fields; unknown keys are rejected |
| Read routes | One user reads another user's profile | Every query is scoped to the authenticated user id |
| Opponent join | Inferred or partial data presented as exact | Exposure requires two different users, a shared non-null join key and an `exact` own-deck submission |
| Read routes | Shared cache serves private data | `private, no-store` on every response |

<!-- markdownlint-enable MD013 -->

## Verification

- `tests/tracker-profile-model.test.ts`: validation of every event type,
  bounds, unknown keys, schema version handling, batch envelope errors,
  join-key derivation and the opponent exposure policy.
- `tests/tracker-profile-repository.test.ts`: idempotent duplicates, match
  replacement, collection replacement and same-hash no-op, join-key storage
  without the raw handle, opponent exposure with two exact submissions,
  summary aggregates, ordering and limits.
- `tests/tracker-profile-routes.test.ts`: 401, 403, partial acknowledgement,
  51-event batches, an oversize non-collection payload, a 1 MiB collection
  accepted through the route-scoped body limit, rate-limit headers and 429,
  session and bearer read access and cache headers.
- `tests/json-body.test.ts`: the tracker batch path is the only `/api/v1`
  route with the enlarged JSON body limit.
- `npm run test:tracker-profile`, `npm run test:application-auth`,
  `npm run lint`, `npm run lint:architecture`, `npm run security:semgrep`,
  `npm run test:discovery` and `npm run build:server`.

## Rollback

The tables are additive and remain unused after an application rollback.
Removing the registration call in `server/index.ts` disables every tracker
route; the `tracker.*` scopes can stay registered without effect. Stored
rows contain no raw handles, logs or secrets.
