# Public API v1: first production slice

## Objective

Establish the secure, documented foundation for the unified Manacost data API:

- a stable `/api/v1` namespace;
- a protected catalog manifest;
- a public OpenAPI contract;
- administrator-managed, scoped and revocable API keys;
- public developer documentation linked from the site footer;
- same-origin card image delivery backed by the existing local cache;
- OAuth 2.0 device authorization for the desktop tracker;
- a minimal application profile and normalized subscription entitlements;
- the complete collectible Standard and Wild card catalogs;
- allowlisted card details with related tokens and generated-card pools.
- complete aggregate card-statistics snapshots and bounded card history across
  Standard/Wild, supported ranks and supported periods.
- aggregate metagame snapshots plus current, historical and analytical
  archetype statistics.
- current Arena class, card, legendary-card and matchup statistics.
- current Battlegrounds hero, minion, spell, trinket and strategy statistics.

This slice does not expose raw databases and does not yet promise every deck or
individual match record. Card statistics are specified in
`docs/specs/public-api-card-statistics.md`; meta and archetype statistics are
specified in `docs/specs/public-api-meta-statistics.md`; Arena and
Battlegrounds resources are specified in
`docs/specs/public-api-arena-statistics.md` and
`docs/specs/public-api-battleground-statistics.md`. The remaining resources
will be added incrementally behind the same authentication, media and
versioning contracts.

## Technical context

- React 19 and TypeScript 5.8 frontend
- Express 4.21 modular routers
- Node SQLite persistence
- Existing cookie session, administrator authorization and CSRF boundary
- Existing parchment and burgundy visual system

## HTTP contract

### Public documentation

`GET /api/v1/openapi.json`

- requires no credential;
- returns the committed OpenAPI 3.1 contract;
- may be cached for five minutes;
- contains no environment-specific secrets.

### Catalog manifest

`GET /api/v1/catalog/manifest`

- requires `X-API-Key`;
- requires the `catalog.read` scope;
- returns API version, schema version, generation time and the currently
  available resource descriptors;
- sends `ETag` and a short private cache policy only after successful
  authentication, so a shared cache cannot bypass credential checks.

### Card images

`GET /api/v1/cards/{cardId}/images/{variant}.webp`

- requires `X-API-Key` and the `images.read` scope;
- accepts a stable Hearthstone card id or DBF id containing only letters,
  digits and underscores;
- supports `thumb`, `full` and `tile` variants;
- resolves through the same Blizzard-first persistent cache used by the site,
  so API clients never depend directly on Blizzard or HearthstoneJSON hosts;
- returns `image/webp`, `Content-Length`, `ETag` and
  `X-Card-Image-Source`;
- honors `If-None-Match` with an empty `304` response;
- rejects invalid identifiers before filesystem or upstream access;
- validates that the resolved file remains inside the configured image-cache
  root before opening a stream.

The endpoint intentionally reuses the site's binary response pipeline. Cache
generation, path containment, placeholder policy and stream error handling
therefore have one implementation for browser and API consumers.

### Card catalog

`GET /api/v1/cards` requires `catalog.read` and returns the verified
collectible catalog:

- `format=standard|wild`, with Standard as the default;
- optional `query`, `class`, `set`, `type`, `rarity` and `mechanic` filters;
- a default page size of 60 and a hard maximum of 120;
- an opaque, versioned `cursor` for deterministic card-ID pagination;
- total matches, continuation state, dataset version, publication time and
  freshness metadata.

The Wild catalog is the complete collectible Hearthstone catalog, including
cards that are not legal in Standard. Query values are scalar, bounded and
validated before the catalog service runs. Cards are ordered by their stable
Hearthstone card ID, so a client can resume traversal without depending on
translated names or provider ordering.

`GET /api/v1/cards/{cardId}` defaults to the Wild catalog so Standard and
Wild-only cards have the same direct lookup behavior. It returns the same
stable base schema plus:

- grouped related cards, including hero powers, Titan abilities, quest
  rewards and other tokens available in the source;
- generated-card pools;
- `partial`, `warning` and freshness metadata when the service is using a
  verified fallback.

The response is built by an explicit allowlist serializer. It never copies an
upstream record wholesale and deliberately omits card statistics, decks,
subscriptions, users, internal cache state, raw wiki structures and external
media URLs. Card and token images are represented only by the same-origin
`thumb`, `full` and `tile` API URLs.

Localized card text preserves only the limited `b`, `i` and `br` markup used
by Hearthstone. Unknown tags and attributes are discarded. Numeric fields,
identifiers, term arrays and timestamps are normalized and bounded. A missing
authoritative release timestamp is returned as `releasedAt: null` rather than
using an import or scrape date as a false release date.

List and detail responses provide `ETag`, honor `If-None-Match`, use private
authenticated caching and expose bounded `X-Data-Cache` and
`X-Dataset-Version` headers. The existing global HTTP metrics middleware
records these routes by template, status class and latency without including
credentials, card IDs or query values as metric labels.

### Desktop application authorization

The registered public client uses the OAuth 2.0 Device Authorization Grant:

1. `POST /api/v1/oauth/device/code` with `client_id=manacost-tracker` and the
   requested space-delimited scopes.
2. Open the returned `verification_uri_complete` in the system browser.
3. The signed-in user reviews the application, account and scopes on
   `/connect`, then approves or denies the request.
4. Poll `POST /api/v1/oauth/token` no faster than the returned `interval`.
5. Use the 15-minute opaque access token as `Authorization: Bearer …`.
6. Rotate the 30-day refresh token at the same token endpoint. A replayed
   refresh token revokes the complete token family.

The device and user codes expire after ten minutes. The database stores only
SHA-256 digests of device, access and refresh credentials. Raw values exist
only in one-time protocol responses and must be stored by the desktop client
in the operating-system credential vault.

Browser approval requires both the existing authenticated session and the
same-origin CSRF boundary. Device-code creation, inspection, approval, polling
and revocation have independent rate limits. The approval page is
`noindex,nofollow` and never places access or refresh tokens in a URL.

### Application profile

`GET /api/v1/me` requires `profile.read subscription.read` on an application
bearer token. It returns:

- stable internal and public profile identifiers;
- the canonical public profile URL;
- display name, e-mail and avatar initials;
- normalized `hasAccess`, `source`, `checkedAt`, `stale` and entitlement flags.

It deliberately omits password hashes, roles, administration flags, blocked
state, contact fields and the underlying Boosty/Telegram provider payloads.
Subscription reads use the stored status and do not trigger an upstream
provider refresh.

The same bearer token can access catalog and image resources when it includes
`catalog.read` and `images.read`, and aggregate card statistics when it
includes `statistics.read`. Personal tracker ingestion and profile reads use the
`tracker.write` and `tracker.read` scopes specified in
`docs/specs/tracker-profile-ingestion-v1.md`. Server-to-server integrations
may continue to use a scoped `X-API-Key`; API keys never represent an end
user.

### Administrator key management

- `GET /api/admin/api-keys` lists non-secret metadata.
- `POST /api/admin/api-keys` accepts a name and scopes and returns the raw key
  once.
- `DELETE /api/admin/api-keys/:id` revokes a key idempotently.

Every endpoint requires an authenticated full administrator. Cookie-backed
mutations also require the existing `X-CSRF-Request: 1` boundary.

## Data contract

Key metadata contains:

- `id`;
- `name`;
- `prefix`;
- `scopes`;
- `createdAt`;
- `createdBy`;
- `lastUsedAt`;
- `revokedAt`;
- `status`.

It never contains `keyHash` or the raw key. The create response includes an
additional `apiKey` field exactly once.

Errors use:

```json
{
  "error": {
    "code": "INVALID_API_KEY",
    "message": "API key is missing or invalid"
  }
}
```

Error codes are stable, machine-readable values. Messages are safe for display
but clients must branch on `code`, not message text.

## Threat model

<!-- markdownlint-disable MD013 -->

| Boundary | Abuse case | Control |
| --- | --- | --- |
| Admin browser to key API | Non-admin creates or revokes keys | Existing admin session authorization |
| Cookie mutation | Cross-site request creates a key | Existing origin and CSRF-header policy |
| Key creation | Weak, duplicate or leaked key | 256-bit random secret, unique prefix, one-time response |
| Database disclosure | Attacker recovers usable credentials | Only SHA-256 digest and prefix are stored |
| Public API request | Unknown, revoked or under-scoped key reads data | Constant-time verification and explicit scope check |
| Logs and analytics | Credential appears in telemetry | Never log request key or return it after creation |
| High request volume | One key exhausts service capacity | Existing bounded API rate limit plus stable key identity for future per-key quotas |
| Image id traversal | Crafted id reads an arbitrary local file | Strict id grammar and resolved-path containment |
| Upstream asset blocking | Client cannot reach Blizzard or fallback host | Server-side persistent cache and same-origin WebP response |
| Approval request forgery | Another origin approves with a browser cookie | Existing origin, Fetch Metadata and CSRF-header checks |
| User-code guessing | Attacker discovers or repeatedly submits a code | Forty-bit code space, ten-minute expiry and endpoint rate limits |
| Database disclosure | Attacker recovers OAuth bearer credentials | Only SHA-256 token digests are persisted |
| Refresh replay | A copied refresh token is used after rotation | Atomic single-use rotation and family-wide revocation |
| Provider-data disclosure | App reads raw Boosty or Telegram records | Dedicated allowlist serializers for profile and subscription |
| Desktop token theft | Another process reads local application storage | Client contract requires OS credential vault; access tokens live 15 minutes |
| Catalog field disclosure | Provider adds private or internal fields | Explicit v1 allowlist serializer; unknown fields are dropped |
| Catalog query exhaustion | Client requests an unbounded scan response | Scalar bounded filters, maximum page size 120 and existing API rate limit |
| Catalog markup injection | Upstream text contains executable HTML | Only `b`, `i` and `br` survive serialization |
| External media blocking | Related cards point directly to wiki/CDN hosts | Only same-origin versioned image URLs are returned |

<!-- markdownlint-enable MD013 -->

## Developer documentation

Canonical page: `/developers/api/`.

It includes:

- current API status and version;
- authentication example;
- API-key and device-authorization examples;
- card list, card detail, image, profile and catalog endpoint examples;
- bulk card-statistics, current card-statistics and history endpoint examples;
- meta snapshots, archetype history and archetype analysis endpoint examples;
- concrete deck-build statistics list and detail examples;
- Arena class, card, legendary-card and matchup statistics;
- Battlegrounds hero, minion and tier-list statistics;
- error model;
- one-time key handling guidance;
- link to the OpenAPI JSON;
- roadmap labels that clearly distinguish available and planned resources.

The footer link is a normal crawlable anchor. The page uses the existing route
shell, responsive layout and keyboard-visible focus treatment.

## Admin experience

The admin navigation gets a dedicated `API` section. The section supports:

- loading and empty states;
- key name input and explicit `catalog.read`, `images.read` and
  `statistics.read` scope selection;
- one-time secret presentation with copy action and an explicit close action;
- masked key list with status and last-used time;
- revoke confirmation and success/error feedback.

The raw key exists only in component memory and is discarded when the one-time
panel closes or the administrator leaves the section.

## Verification

- Contract tests begin red for key creation, storage, validation, scope checks,
  revocation and response redaction.
- Device-flow tests cover pending, slow-down, denial, expiry, atomic exchange,
  refresh rotation, replay-family revocation, scope enforcement and expiry.
- Profile serializer tests prove that administrative and provider detail cannot
  cross the application boundary.
- Image contract tests cover missing and under-scoped credentials, invalid ids,
  all documented variants, conditional requests and binary response headers.
- Card catalog tests cover authorization-before-loading, Standard and Wild
  membership, bounded filters, cursor traversal, conditional requests,
  allowlist redaction, markup sanitization, related tokens, generated pools,
  invalid input, not-found and fail-closed upstream errors.
- Route tests cover 401, 403, validation failures, one-time secret response and
  no-store headers.
- UI tests cover footer routing and admin empty, success, error and revoke
  states.
- Storybook covers the independently authored key-management states.
- Type checking, architecture lint, React checks, Semgrep, Gitleaks, dependency
  audit, production build and focused regression suites pass.
- Real-browser review covers desktop and mobile developer docs, admin key
  creation, keyboard focus, console, network and accessibility.
- Production smoke checks validate the docs page, OpenAPI response, protected
  manifest rejection without a key and successful health response.

## Rollback

The SQLite table is additive and can remain unused after an application
rollback. The router, documentation page and footer link can be reverted
independently. Revoked or created key records contain no recoverable raw secret.
