import { BATTLEGROUND_STATISTICS_SCHEMAS } from './battlegroundSchemas.js';
export const PUBLIC_API_OPENAPI = {
  openapi: '3.1.0',
  info: {
    title: 'Manacost Public API',
    version: '1.7.0',
    description: 'Versioned Hearthstone data API for approved applications.',
  },
  servers: [{ url: '/', description: 'Current Manacost environment' }],
  tags: [
    { name: 'Authorization', description: 'OAuth 2.0 device authorization for the desktop tracker.' },
    { name: 'Profile', description: 'The authorized user and cached subscription status.' },
    { name: 'Catalog', description: 'Available Manacost data resources.' },
    { name: 'Images', description: 'Same-origin cached Hearthstone card images.' },
    { name: 'Statistics', description: 'Aggregated Constructed, Arena and Battlegrounds statistics and history.' },
    { name: 'Administration', description: 'Administrator-only API key lifecycle.' },
  ],
  paths: {
    '/api/v1/openapi.json': {
      get: {
        summary: 'Get the OpenAPI contract',
        operationId: 'getPublicApiOpenApi',
        responses: { '200': { description: 'OpenAPI 3.1 document' } },
      },
    },
    '/api/v1/oauth/device/code': {
      post: {
        summary: 'Start desktop application authorization',
        description: 'Starts the OAuth 2.0 Device Authorization Grant for the registered public client.',
        operationId: 'startDeviceAuthorization',
        tags: ['Authorization'],
        requestBody: {
          required: true,
          content: {
            'application/x-www-form-urlencoded': {
              schema: { $ref: '#/components/schemas/DeviceAuthorizationInput' },
            },
          },
        },
        responses: {
          '200': {
            description: 'A short-lived device authorization was created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DeviceAuthorization' },
              },
            },
          },
          '400': { description: 'Unknown client or unsupported scope' },
          '429': { description: 'Too many authorization attempts' },
          '503': { description: 'Authorization service is temporarily unavailable' },
        },
      },
    },
    '/api/v1/oauth/device/authorization': {
      get: {
        summary: 'Inspect a device authorization in the browser',
        operationId: 'inspectDeviceAuthorization',
        tags: ['Authorization'],
        parameters: [{
          name: 'user_code',
          in: 'query',
          required: true,
          schema: { type: 'string', pattern: '^[A-Z2-9]{4}-[A-Z2-9]{4}$' },
        }],
        responses: {
          '200': { description: 'Pending authorization details' },
          '401': { description: 'A signed-in browser session is required' },
          '404': { description: 'Authorization is invalid, completed or expired' },
        },
      },
    },
    '/api/v1/oauth/device/approve': {
      post: {
        summary: 'Approve or deny a device authorization',
        description: 'Requires an authenticated same-origin browser session and CSRF header.',
        operationId: 'decideDeviceAuthorization',
        tags: ['Authorization'],
        parameters: [{
          name: 'X-CSRF-Request',
          in: 'header',
          required: true,
          schema: { type: 'string', const: '1' },
        }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/DeviceAuthorizationDecision' },
            },
          },
        },
        responses: {
          '200': { description: 'The decision was recorded' },
          '400': { description: 'Authorization is invalid, completed or expired' },
          '401': { description: 'A signed-in browser session is required' },
          '403': { description: 'CSRF validation failed' },
        },
      },
    },
    '/api/v1/oauth/token': {
      post: {
        summary: 'Exchange a device code or rotate a refresh token',
        operationId: 'exchangeApplicationToken',
        tags: ['Authorization'],
        requestBody: {
          required: true,
          content: {
            'application/x-www-form-urlencoded': {
              schema: { $ref: '#/components/schemas/ApplicationTokenInput' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Short-lived bearer token and rotating refresh token',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApplicationTokenPair' },
              },
            },
          },
          '400': { description: 'OAuth token error such as authorization_pending or invalid_grant' },
          '429': { description: 'Polling or refresh rate limit reached' },
        },
      },
    },
    '/api/v1/oauth/revoke': {
      post: {
        summary: 'Revoke a refresh-token family',
        operationId: 'revokeApplicationToken',
        tags: ['Authorization'],
        requestBody: {
          required: true,
          content: {
            'application/x-www-form-urlencoded': {
              schema: {
                type: 'object',
                required: ['token'],
                properties: { token: { type: 'string', writeOnly: true } },
              },
            },
          },
        },
        responses: { '200': { description: 'Revocation is idempotent' } },
      },
    },
    '/api/v1/me': {
      get: {
        summary: 'Get the authorized user and subscription status',
        operationId: 'getApplicationProfile',
        tags: ['Profile'],
        security: [{ ApplicationBearer: [] }],
        responses: {
          '200': {
            description: 'Minimal user profile and cached subscription status',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApplicationProfile' },
              },
            },
          },
          '401': { $ref: '#/components/responses/InvalidBearerToken' },
          '403': { $ref: '#/components/responses/InsufficientScope' },
        },
      },
    },
    '/api/v1/catalog/manifest': {
      get: {
        summary: 'Get the public data catalog manifest',
        operationId: 'getCatalogManifest',
        tags: ['Catalog'],
        security: [{ ApiKeyAuth: [] }, { ApplicationBearer: [] }],
        responses: {
          '200': {
            description: 'Catalog manifest',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CatalogManifest' },
              },
            },
          },
          '401': { $ref: '#/components/responses/InvalidCredential' },
          '403': { $ref: '#/components/responses/InsufficientScope' },
        },
      },
    },
    '/api/v1/cards': {
      get: {
        summary: 'List Hearthstone cards',
        description: 'Returns an allowlisted view of the verified Standard or Wild catalog with stable cursor pagination.',
        operationId: 'listCards',
        tags: ['Catalog'],
        security: [{ ApiKeyAuth: [] }, { ApplicationBearer: [] }],
        parameters: [
          {
            name: 'format',
            in: 'query',
            required: false,
            description: 'Defaults to standard.',
            schema: { type: 'string', enum: ['standard', 'wild'], default: 'standard' },
          },
          {
            name: 'query',
            in: 'query',
            required: false,
            schema: { type: 'string', maxLength: 120 },
          },
          ...['class', 'set', 'type', 'rarity', 'mechanic'].map(name => ({
            name,
            in: 'query' as const,
            required: false,
            schema: { type: 'string' as const, pattern: '^[A-Za-z0-9_]{1,80}$' },
          })),
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: 120, default: 60 },
          },
          {
            name: 'cursor',
            in: 'query',
            required: false,
            schema: { type: 'string', minLength: 4, maxLength: 128 },
          },
          {
            name: 'If-None-Match',
            in: 'header',
            required: false,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'A deterministic page of cards',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CardListResponse' },
              },
            },
          },
          '304': { description: 'The representation has not changed' },
          '400': { description: 'Invalid filter, format, limit or cursor' },
          '401': { $ref: '#/components/responses/InvalidCredential' },
          '403': { $ref: '#/components/responses/InsufficientScope' },
          '503': { description: 'No verified catalog is currently available' },
        },
      },
    },
    '/api/v1/cards/{cardId}': {
      get: {
        summary: 'Get one Hearthstone card',
        description: 'Returns the stable card schema plus related tokens and generated-card pools. Format defaults to wild.',
        operationId: 'getCard',
        tags: ['Catalog'],
        security: [{ ApiKeyAuth: [] }, { ApplicationBearer: [] }],
        parameters: [
          {
            name: 'cardId',
            in: 'path',
            required: true,
            schema: { type: 'string', pattern: '^[A-Za-z0-9_]{2,80}$' },
          },
          {
            name: 'format',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['standard', 'wild'], default: 'wild' },
          },
          {
            name: 'If-None-Match',
            in: 'header',
            required: false,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Card details and related cards',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CardDetailResponse' },
              },
            },
          },
          '304': { description: 'The representation has not changed' },
          '400': { description: 'Invalid card id or format' },
          '401': { $ref: '#/components/responses/InvalidCredential' },
          '403': { $ref: '#/components/responses/InsufficientScope' },
          '404': { description: 'The card does not exist in the selected catalog' },
          '503': { description: 'Card details cannot be resolved authoritatively' },
        },
      },
    },
    '/api/v1/card-statistics': {
      get: {
        summary: 'List the complete card-statistics snapshot',
        description: 'Returns a deterministic page for one format, rank and period. Requires statistics.read.',
        operationId: 'listCardStatistics',
        tags: ['Statistics'],
        security: [{ ApiKeyAuth: [] }, { ApplicationBearer: [] }],
        parameters: [
          {
            name: 'format',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['standard', 'wild'], default: 'standard' },
          },
          {
            name: 'rank',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              enum: ['legend', 'diamond_4_1', 'diamond', 'platinum'],
              default: 'legend',
            },
          },
          {
            name: 'period',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              enum: ['1d', '3d', '7d', '14d', 'patch'],
              default: '1d',
            },
          },
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: 500, default: 120 },
          },
          {
            name: 'cursor',
            in: 'query',
            required: false,
            schema: { type: 'string', minLength: 8, maxLength: 240 },
          },
          {
            name: 'If-None-Match',
            in: 'header',
            required: false,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'One page of the selected aggregate statistics snapshot',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CardStatisticsListResponse' },
              },
            },
          },
          '304': { description: 'The representation has not changed' },
          '400': { description: 'Invalid format, rank, period, limit or cursor' },
          '401': { $ref: '#/components/responses/InvalidCredential' },
          '403': { $ref: '#/components/responses/InsufficientScope' },
          '503': { description: 'No authoritative or last-known-good statistics are available' },
        },
      },
    },
    '/api/v1/cards/{cardId}/statistics': {
      get: {
        summary: 'Get current statistics for one card',
        description: 'Returns nullable aggregate metrics for one format, rank and period. Requires statistics.read.',
        operationId: 'getCardStatistics',
        tags: ['Statistics'],
        security: [{ ApiKeyAuth: [] }, { ApplicationBearer: [] }],
        parameters: [
          {
            name: 'cardId',
            in: 'path',
            required: true,
            schema: { type: 'string', pattern: '^[A-Za-z0-9_]{2,80}$' },
          },
          {
            name: 'format',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['standard', 'wild'], default: 'standard' },
          },
          {
            name: 'rank',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              enum: ['legend', 'diamond_4_1', 'diamond', 'platinum'],
              default: 'legend',
            },
          },
          {
            name: 'period',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              enum: ['1d', '3d', '7d', '14d', 'patch'],
              default: '1d',
            },
          },
          {
            name: 'If-None-Match',
            in: 'header',
            required: false,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Current aggregate metrics for the card',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CardStatisticsDetailResponse' },
              },
            },
          },
          '304': { description: 'The representation has not changed' },
          '400': { description: 'Invalid card id, format, rank or period' },
          '401': { $ref: '#/components/responses/InvalidCredential' },
          '403': { $ref: '#/components/responses/InsufficientScope' },
          '404': { description: 'Card is not in the selected catalog' },
          '503': { description: 'Card statistics are temporarily unavailable' },
        },
      },
    },
    '/api/v1/cards/{cardId}/statistics/history': {
      get: {
        summary: 'Get card-statistics history',
        description: 'Returns up to 1,000 chronological aggregate points. Requires statistics.read.',
        operationId: 'getCardStatisticsHistory',
        tags: ['Statistics'],
        security: [{ ApiKeyAuth: [] }, { ApplicationBearer: [] }],
        parameters: [
          {
            name: 'cardId',
            in: 'path',
            required: true,
            schema: { type: 'string', pattern: '^[A-Za-z0-9_]{2,80}$' },
          },
          {
            name: 'format',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['standard', 'wild'], default: 'standard' },
          },
          {
            name: 'rank',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              enum: ['legend', 'diamond_4_1', 'diamond', 'platinum'],
              default: 'legend',
            },
          },
          {
            name: 'period',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              enum: ['1d', '3d', '7d', '14d', 'patch'],
              default: '1d',
            },
          },
          {
            name: 'days',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 7, maximum: 365, default: 90 },
          },
          {
            name: 'If-None-Match',
            in: 'header',
            required: false,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Chronological card-statistics points',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CardStatisticsHistoryResponse' },
              },
            },
          },
          '304': { description: 'The representation has not changed' },
          '400': { description: 'Invalid card id, slice dimension or day range' },
          '401': { $ref: '#/components/responses/InvalidCredential' },
          '403': { $ref: '#/components/responses/InsufficientScope' },
          '404': { description: 'Card is not in the selected catalog' },
          '503': { description: 'Card statistics are temporarily unavailable' },
        },
      },
    },
    '/api/v1/meta-statistics': {
      get: {
        summary: 'List the current constructed meta',
        description: 'Returns a bounded aggregate archetype snapshot for one format, rank and period. Requires statistics.read.',
        operationId: 'listMetaStatistics',
        tags: ['Statistics'],
        security: [{ ApiKeyAuth: [] }, { ApplicationBearer: [] }],
        parameters: [
          {
            name: 'format',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['standard', 'wild'], default: 'standard' },
          },
          {
            name: 'rank',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              enum: [
                'all', 'diamond_4_1', 'diamond_to_legend', 'legend',
                'top_5000', 'top_1000',
              ],
              default: 'legend',
            },
          },
          {
            name: 'period',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              enum: ['1d', '3d', '7d', '14d', 'patch'],
              default: '1d',
            },
          },
          {
            name: 'minGames',
            in: 'query',
            required: false,
            schema: {
              type: 'integer',
              enum: [100, 250, 500, 1000, 2500, 5000],
              default: 100,
            },
          },
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
          },
          {
            name: 'cursor',
            in: 'query',
            required: false,
            schema: { type: 'string', minLength: 12, maxLength: 500 },
          },
          {
            name: 'If-None-Match',
            in: 'header',
            required: false,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'One page of the selected meta snapshot',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/MetaStatisticsListResponse' },
              },
            },
          },
          '304': { description: 'The representation has not changed' },
          '400': { description: 'Invalid format, rank, period, sample floor, limit or cursor' },
          '401': { $ref: '#/components/responses/InvalidCredential' },
          '403': { $ref: '#/components/responses/InsufficientScope' },
          '503': { description: 'No authoritative meta snapshot is currently available' },
        },
      },
    },
    '/api/v1/archetypes/{slug}/statistics': {
      get: {
        summary: 'Get current aggregate statistics for one archetype',
        operationId: 'getArchetypeStatistics',
        tags: ['Statistics'],
        security: [{ ApiKeyAuth: [] }, { ApplicationBearer: [] }],
        parameters: [
          {
            name: 'slug',
            in: 'path',
            required: true,
            schema: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,89}$' },
          },
          {
            name: 'format',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['standard', 'wild'], default: 'standard' },
          },
          {
            name: 'If-None-Match',
            in: 'header',
            required: false,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Current normalized archetype metrics',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ArchetypeStatisticsResponse' },
              },
            },
          },
          '304': { description: 'The representation has not changed' },
          '400': { description: 'Invalid format or archetype slug' },
          '401': { $ref: '#/components/responses/InvalidCredential' },
          '403': { $ref: '#/components/responses/InsufficientScope' },
          '404': { description: 'Archetype is not present in the selected format' },
          '503': { description: 'Archetype statistics are temporarily unavailable' },
        },
      },
    },
    '/api/v1/archetypes/{slug}/statistics/history': {
      get: {
        summary: 'Get aggregate history for one archetype',
        description: 'Returns up to 1,000 chronological points from the selected trailing window.',
        operationId: 'getArchetypeStatisticsHistory',
        tags: ['Statistics'],
        security: [{ ApiKeyAuth: [] }, { ApplicationBearer: [] }],
        parameters: [
          {
            name: 'slug',
            in: 'path',
            required: true,
            schema: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,89}$' },
          },
          {
            name: 'format',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['standard', 'wild'], default: 'standard' },
          },
          {
            name: 'days',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 7, maximum: 365, default: 90 },
          },
          {
            name: 'If-None-Match',
            in: 'header',
            required: false,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Chronological archetype aggregate points',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ArchetypeStatisticsHistoryResponse' },
              },
            },
          },
          '304': { description: 'The representation has not changed' },
          '400': { description: 'Invalid format, archetype slug or day range' },
          '401': { $ref: '#/components/responses/InvalidCredential' },
          '403': { $ref: '#/components/responses/InsufficientScope' },
          '404': { description: 'Archetype is not present in the selected format' },
          '503': { description: 'Archetype history is temporarily unavailable' },
        },
      },
    },
    '/api/v1/archetypes/{slug}/analysis': {
      get: {
        summary: 'Get matchup and card-impact analysis for one archetype',
        description: 'Returns the available Legend/7-day aggregate analysis without provider URLs.',
        operationId: 'getArchetypeAnalysis',
        tags: ['Statistics'],
        security: [{ ApiKeyAuth: [] }, { ApplicationBearer: [] }],
        parameters: [
          {
            name: 'slug',
            in: 'path',
            required: true,
            schema: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,89}$' },
          },
          {
            name: 'format',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['standard', 'wild'], default: 'standard' },
          },
          {
            name: 'If-None-Match',
            in: 'header',
            required: false,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Class matchups and per-card aggregate impact metrics',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ArchetypeAnalysisResponse' },
              },
            },
          },
          '304': { description: 'The representation has not changed' },
          '400': { description: 'Invalid format or archetype slug' },
          '401': { $ref: '#/components/responses/InvalidCredential' },
          '403': { $ref: '#/components/responses/InsufficientScope' },
          '404': { description: 'No analysis is available for this archetype' },
          '503': { description: 'Archetype analysis is temporarily unavailable' },
        },
      },
    },
    '/api/v1/deck-statistics': {
      get: {
        summary: 'List aggregate statistics for concrete deck builds',
        description: 'Returns bounded current build aggregates, portable deck codes and first-party resource links without provider URLs. Requires statistics.read.',
        operationId: 'listDeckStatistics',
        tags: ['Statistics'],
        security: [{ ApiKeyAuth: [] }, { ApplicationBearer: [] }],
        parameters: [
          {
            name: 'format',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['standard', 'wild'], default: 'standard' },
          },
          {
            name: 'archetype',
            in: 'query',
            required: false,
            schema: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,89}$' },
          },
          {
            name: 'minGames',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 0, maximum: 10000000, default: 0 },
          },
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
          },
          {
            name: 'cursor',
            in: 'query',
            required: false,
            schema: { type: 'string', minLength: 12, maxLength: 500 },
          },
          {
            name: 'If-None-Match',
            in: 'header',
            required: false,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'One page of normalized deck-build aggregates',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DeckStatisticsListResponse' },
              },
            },
          },
          '304': { description: 'The representation has not changed' },
          '400': { description: 'Invalid format, archetype, sample floor, limit or cursor' },
          '401': { $ref: '#/components/responses/InvalidCredential' },
          '403': { $ref: '#/components/responses/InsufficientScope' },
          '503': { description: 'Deck statistics are temporarily unavailable' },
        },
      },
    },
    '/api/v1/decks/{deckId}/statistics': {
      get: {
        summary: 'Get current aggregate statistics for one deck build',
        operationId: 'getDeckStatistics',
        tags: ['Statistics'],
        security: [{ ApiKeyAuth: [] }, { ApplicationBearer: [] }],
        parameters: [
          {
            name: 'deckId',
            in: 'path',
            required: true,
            schema: { type: 'string', pattern: '^deck_[a-f0-9]{32}$' },
          },
          {
            name: 'format',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['standard', 'wild'], default: 'standard' },
          },
          {
            name: 'If-None-Match',
            in: 'header',
            required: false,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Current normalized metrics for the selected build',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DeckStatisticsResponse' },
              },
            },
          },
          '304': { description: 'The representation has not changed' },
          '400': { description: 'Invalid format or deck identifier' },
          '401': { $ref: '#/components/responses/InvalidCredential' },
          '403': { $ref: '#/components/responses/InsufficientScope' },
          '404': { description: 'Deck build is not present in the selected format' },
          '503': { description: 'Deck statistics are temporarily unavailable' },
        },
      },
    },
    '/api/v1/arena/statistics/classes': {
      get: {
        summary: 'List Arena class performance',
        description: 'Returns current Arena class win rates and game samples. Requires statistics.read.',
        operationId: 'listArenaClassStatistics',
        tags: ['Statistics'],
        security: [{ ApiKeyAuth: [] }, { ApplicationBearer: [] }],
        parameters: [
          {
            name: 'source',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['hsreplay', 'firestone'], default: 'hsreplay' },
          },
          {
            name: 'If-None-Match',
            in: 'header',
            required: false,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Current normalized class statistics',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ArenaClassStatisticsResponse' },
              },
            },
          },
          '304': { description: 'The representation has not changed' },
          '400': { description: 'Invalid source' },
          '401': { $ref: '#/components/responses/InvalidCredential' },
          '403': { $ref: '#/components/responses/InsufficientScope' },
          '503': { description: 'Arena statistics are temporarily unavailable' },
        },
      },
    },
    '/api/v1/arena/statistics/cards': {
      get: {
        summary: 'List Arena card performance',
        description: 'Returns a bounded Arena card snapshot without provider URLs or media fields. Requires statistics.read.',
        operationId: 'listArenaCardStatistics',
        tags: ['Statistics'],
        security: [{ ApiKeyAuth: [] }, { ApplicationBearer: [] }],
        parameters: [
          {
            name: 'source',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              enum: ['hsreplay', 'firestone', 'heartharena'],
              default: 'hsreplay',
            },
          },
          {
            name: 'class',
            in: 'query',
            required: false,
            schema: { $ref: '#/components/schemas/ArenaClassId' },
          },
          {
            name: 'tier',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              enum: ['S', 'A', 'B', 'C', 'D', 'E', 'F', 'NO-DATA'],
            },
          },
          {
            name: 'minGames',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 0, maximum: 100000000, default: 0 },
          },
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
          },
          {
            name: 'cursor',
            in: 'query',
            required: false,
            schema: { type: 'string', minLength: 12, maxLength: 500 },
          },
          {
            name: 'If-None-Match',
            in: 'header',
            required: false,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'One page of normalized Arena card statistics',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ArenaCardStatisticsResponse' },
              },
            },
          },
          '304': { description: 'The representation has not changed' },
          '400': { description: 'Invalid source, class, tier, sample, limit or cursor' },
          '401': { $ref: '#/components/responses/InvalidCredential' },
          '403': { $ref: '#/components/responses/InsufficientScope' },
          '503': { description: 'Arena statistics are temporarily unavailable' },
        },
      },
    },
    '/api/v1/arena/statistics/legendaries': {
      get: {
        summary: 'List Arena legendary-card performance',
        description: 'Returns key-card aggregates and stable related-card ids. Requires statistics.read.',
        operationId: 'listArenaLegendaryStatistics',
        tags: ['Statistics'],
        security: [{ ApiKeyAuth: [] }, { ApplicationBearer: [] }],
        parameters: [
          {
            name: 'source',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['hsreplay', 'firestone'], default: 'hsreplay' },
          },
          {
            name: 'class',
            in: 'query',
            required: false,
            schema: { $ref: '#/components/schemas/ArenaClassId' },
          },
          {
            name: 'minGames',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 0, maximum: 100000000, default: 0 },
          },
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
          },
          {
            name: 'cursor',
            in: 'query',
            required: false,
            schema: { type: 'string', minLength: 12, maxLength: 500 },
          },
        ],
        responses: {
          '200': {
            description: 'One page of normalized Arena legendary statistics',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ArenaLegendaryStatisticsResponse' },
              },
            },
          },
          '400': { description: 'Invalid source, class, sample, limit or cursor' },
          '401': { $ref: '#/components/responses/InvalidCredential' },
          '403': { $ref: '#/components/responses/InsufficientScope' },
          '503': { description: 'Arena statistics are temporarily unavailable' },
        },
      },
    },
    '/api/v1/arena/statistics/matchups': {
      get: {
        summary: 'List Arena class matchups',
        operationId: 'listArenaMatchupStatistics',
        tags: ['Statistics'],
        security: [{ ApiKeyAuth: [] }, { ApplicationBearer: [] }],
        parameters: [
          {
            name: 'source',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              enum: ['hsreplay', 'firestone'],
              default: 'hsreplay',
            },
          },
          {
            name: 'class',
            in: 'query',
            required: false,
            schema: { $ref: '#/components/schemas/ArenaClassId' },
          },
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
          },
          {
            name: 'cursor',
            in: 'query',
            required: false,
            schema: { type: 'string', minLength: 12, maxLength: 500 },
          },
        ],
        responses: {
          '200': {
            description: 'Directed Arena class matchup aggregates',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ArenaMatchupStatisticsResponse' },
              },
            },
          },
          '400': { description: 'Invalid class, limit or cursor' },
          '401': { $ref: '#/components/responses/InvalidCredential' },
          '403': { $ref: '#/components/responses/InsufficientScope' },
          '503': { description: 'Arena statistics are temporarily unavailable' },
        },
      },
    },
    '/api/v1/battlegrounds/statistics/heroes': {
      get: {
        summary: 'List Battlegrounds hero performance',
        operationId: 'listBattlegroundHeroStatistics',
        tags: ['Statistics'],
        security: [{ ApiKeyAuth: [] }, { ApplicationBearer: [] }],
        parameters: [
          {
            name: 'mode',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['solo', 'duos'], default: 'solo' },
          },
          {
            name: 'mmr',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              enum: ['TOP_50_PERCENT', 'TOP_20_PERCENT', 'TOP_5_PERCENT', 'TOP_1_PERCENT'],
              default: 'TOP_50_PERCENT',
            },
          },
          {
            name: 'timeRange',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              enum: ['CURRENT_BATTLEGROUNDS_PATCH', 'LAST_7_DAYS'],
              default: 'CURRENT_BATTLEGROUNDS_PATCH',
            },
          },
          {
            name: 'tier',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['S', 'A', 'B', 'C', 'D'] },
          },
          {
            name: 'minPickRate',
            in: 'query',
            required: false,
            schema: { type: 'number', minimum: 0, maximum: 100, default: 0 },
          },
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
          },
          {
            name: 'cursor',
            in: 'query',
            required: false,
            schema: { type: 'string', minLength: 12, maxLength: 500 },
          },
        ],
        responses: {
          '200': {
            description: 'One page of normalized hero statistics',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BattlegroundHeroStatisticsResponse' },
              },
            },
          },
          '400': { description: 'Invalid tier, pick-rate floor, limit or cursor' },
          '401': { $ref: '#/components/responses/InvalidCredential' },
          '403': { $ref: '#/components/responses/InsufficientScope' },
          '503': { description: 'Battlegrounds statistics are temporarily unavailable' },
        },
      },
    },
    '/api/v1/battlegrounds/statistics/heroes/{heroId}': {
      get: {
        summary: 'Get complete Battlegrounds hero statistics',
        description: 'Returns tavern-up, hero-power, combat, composition, lineup and final-form statistics.',
        operationId: 'getBattlegroundHeroStatistics',
        tags: ['Statistics'],
        security: [{ ApiKeyAuth: [] }, { ApplicationBearer: [] }],
        parameters: [
          {
            name: 'heroId',
            in: 'path',
            required: true,
            schema: { type: 'string', pattern: '^\\d{1,12}$' },
          },
          {
            name: 'mode',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['solo', 'duos'], default: 'solo' },
          },
          {
            name: 'mmr',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              enum: ['TOP_50_PERCENT', 'TOP_20_PERCENT', 'TOP_5_PERCENT', 'TOP_1_PERCENT'],
              default: 'TOP_50_PERCENT',
            },
          },
          {
            name: 'timeRange',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              enum: ['CURRENT_BATTLEGROUNDS_PATCH', 'LAST_7_DAYS'],
              default: 'CURRENT_BATTLEGROUNDS_PATCH',
            },
          },
        ],
        responses: {
          '200': {
            description: 'Complete normalized hero statistics',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BattlegroundHeroDetailResponse' },
              },
            },
          },
          '400': { description: 'Invalid hero id or sample' },
          '401': { $ref: '#/components/responses/InvalidCredential' },
          '403': { $ref: '#/components/responses/InsufficientScope' },
          '404': { description: 'Hero statistics were not found' },
          '503': { description: 'Battlegrounds statistics are temporarily unavailable' },
        },
      },
    },
    '/api/v1/battlegrounds/statistics/minions': {
      get: {
        summary: 'List Battlegrounds minion performance',
        operationId: 'listBattlegroundMinionStatistics',
        tags: ['Statistics'],
        security: [{ ApiKeyAuth: [] }, { ApplicationBearer: [] }],
        parameters: [
          {
            name: 'tavernTier',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: 7 },
          },
          {
            name: 'minGames',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 0, maximum: 100000000, default: 0 },
          },
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
          },
          {
            name: 'cursor',
            in: 'query',
            required: false,
            schema: { type: 'string', minLength: 12, maxLength: 500 },
          },
        ],
        responses: {
          '200': {
            description: 'One page of normalized minion statistics',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BattlegroundMinionStatisticsResponse' },
              },
            },
          },
          '400': { description: 'Invalid tavern tier, sample, limit or cursor' },
          '401': { $ref: '#/components/responses/InvalidCredential' },
          '403': { $ref: '#/components/responses/InsufficientScope' },
          '503': { description: 'Battlegrounds statistics are temporarily unavailable' },
        },
      },
    },
    '/api/v1/battlegrounds/statistics/minions/{dbfId}/history': {
      get: {
        summary: 'Get complete Battlegrounds minion history',
        operationId: 'getBattlegroundMinionStatisticsHistory',
        tags: ['Statistics'],
        security: [{ ApiKeyAuth: [] }, { ApplicationBearer: [] }],
        parameters: [
          {
            name: 'dbfId',
            in: 'path',
            required: true,
            schema: { type: 'string', pattern: '^\\d{1,12}$' },
          },
          {
            name: 'days',
            in: 'query',
            required: false,
            description: 'Optional trailing window. Omit it to return all stored history.',
            schema: { type: 'integer', minimum: 0, maximum: 3650 },
          },
        ],
        responses: {
          '200': {
            description: 'All stored normalized history points in the selected window',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BattlegroundMinionHistoryResponse' },
              },
            },
          },
          '400': { description: 'Invalid DBF id or history window' },
          '401': { $ref: '#/components/responses/InvalidCredential' },
          '403': { $ref: '#/components/responses/InsufficientScope' },
          '404': { description: 'Minion history was not found' },
          '503': { description: 'Battlegrounds statistics are temporarily unavailable' },
        },
      },
    },
    '/api/v1/battlegrounds/statistics/spells': {
      get: {
        summary: 'List complete Battlegrounds Tavern spell statistics',
        operationId: 'listBattlegroundSpellStatistics',
        tags: ['Statistics'],
        security: [{ ApiKeyAuth: [] }, { ApplicationBearer: [] }],
        parameters: [
          {
            name: 'tavernTier',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: 7 },
          },
          {
            name: 'minGames',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 0, maximum: 100000000, default: 0 },
          },
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
          },
          {
            name: 'cursor',
            in: 'query',
            required: false,
            schema: { type: 'string', minLength: 12, maxLength: 500 },
          },
        ],
        responses: {
          '200': {
            description: 'One page of Tavern spell statistics',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BattlegroundSpellStatisticsResponse' },
              },
            },
          },
          '400': { description: 'Invalid tavern tier, sample, limit or cursor' },
          '401': { $ref: '#/components/responses/InvalidCredential' },
          '403': { $ref: '#/components/responses/InsufficientScope' },
          '503': { description: 'Battlegrounds statistics are temporarily unavailable' },
        },
      },
    },
    '/api/v1/battlegrounds/statistics/tier-lists/{kind}': {
      get: {
        summary: 'List a Battlegrounds statistical tier list',
        description: 'Kinds cover heroes, minions, Tavern spells, trinkets and strategies.',
        operationId: 'listBattlegroundTierListStatistics',
        tags: ['Statistics'],
        security: [{ ApiKeyAuth: [] }, { ApplicationBearer: [] }],
        parameters: [
          {
            name: 'kind',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
              enum: ['heroes', 'minions', 'spells', 'trinkets', 'strategies'],
            },
          },
          {
            name: 'tier',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['S', 'A', 'B', 'C', 'D'] },
          },
          {
            name: 'minGames',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 0, maximum: 100000000, default: 0 },
          },
          {
            name: 'source',
            in: 'query',
            required: false,
            description: 'Strategy provider; used only when kind=strategies.',
            schema: { type: 'string', enum: ['hsreplay', 'firestone'], default: 'firestone' },
          },
          {
            name: 'mmr',
            in: 'query',
            required: false,
            description: 'Trinket sample; used only when kind=trinkets.',
            schema: {
              type: 'string',
              enum: ['ALL', 'TOP_50_PERCENT', 'TOP_20_PERCENT', 'TOP_5_PERCENT', 'TOP_1_PERCENT'],
              default: 'TOP_1_PERCENT',
            },
          },
          {
            name: 'timeRange',
            in: 'query',
            required: false,
            description: 'Trinket sample; used only when kind=trinkets.',
            schema: {
              type: 'string',
              enum: ['CURRENT_BATTLEGROUNDS_PATCH', 'LAST_7_DAYS'],
              default: 'LAST_7_DAYS',
            },
          },
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
          },
          {
            name: 'cursor',
            in: 'query',
            required: false,
            schema: { type: 'string', minLength: 12, maxLength: 500 },
          },
        ],
        responses: {
          '200': {
            description: 'One normalized statistical tier list',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BattlegroundTierListStatisticsResponse' },
              },
            },
          },
          '400': { description: 'Invalid kind, tier, sample, limit or cursor' },
          '401': { $ref: '#/components/responses/InvalidCredential' },
          '403': { $ref: '#/components/responses/InsufficientScope' },
          '503': { description: 'Battlegrounds statistics are temporarily unavailable' },
        },
      },
    },
    '/api/v1/cards/{cardId}/images/{variant}.webp': {
      get: {
        summary: 'Get a cached card image',
        description: 'Returns a same-origin WebP image from the Blizzard-first local cache.',
        operationId: 'getCardImage',
        tags: ['Images'],
        security: [{ ApiKeyAuth: [] }, { ApplicationBearer: [] }],
        parameters: [
          {
            name: 'cardId',
            in: 'path',
            required: true,
            schema: { type: 'string', pattern: '^[A-Za-z0-9_]+$', maxLength: 80 },
          },
          {
            name: 'variant',
            in: 'path',
            required: true,
            schema: { type: 'string', enum: ['thumb', 'full', 'tile'] },
          },
          {
            name: 'If-None-Match',
            in: 'header',
            required: false,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'WebP card image',
            headers: {
              ETag: { schema: { type: 'string' } },
              'X-Card-Image-Source': {
                schema: { type: 'string', enum: ['blizzard', 'fallback', 'placeholder'] },
              },
            },
            content: {
              'image/webp': {
                schema: { type: 'string', contentEncoding: 'binary' },
              },
            },
          },
          '304': { description: 'The cached representation has not changed' },
          '400': { description: 'Invalid card id or image variant' },
          '401': { $ref: '#/components/responses/InvalidCredential' },
          '403': { $ref: '#/components/responses/InsufficientScope' },
          '502': { description: 'Card image could not be resolved or streamed' },
          '503': { description: 'Card image service is not configured' },
        },
      },
    },
    '/api/admin/api-keys': {
      get: {
        summary: 'List API key metadata',
        tags: ['Administration'],
        responses: {
          '200': { description: 'Secret-free API key metadata' },
          '403': { description: 'Administrator access required' },
        },
      },
      post: {
        summary: 'Create an API key',
        description: 'The raw apiKey is returned once and cannot be recovered.',
        tags: ['Administration'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateApiKeyInput' },
            },
          },
        },
        responses: {
          '201': { description: 'API key created; raw secret included once' },
          '400': { description: 'Invalid name or scope' },
          '403': { description: 'Administrator access required' },
        },
      },
    },
    '/api/admin/api-keys/{id}': {
      delete: {
        summary: 'Revoke an API key',
        tags: ['Administration'],
        parameters: [{
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string' },
        }],
        responses: {
          '204': { description: 'Key is revoked or already absent' },
          '403': { description: 'Administrator access required' },
        },
      },
    },
  },
  components: {
    securitySchemes: { ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-API-Key' }, ApplicationBearer: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'opaque',
        description: 'Short-lived access token issued by the device authorization flow.',
      },
    },
    schemas: { ...BATTLEGROUND_STATISTICS_SCHEMAS, DeviceAuthorizationInput: {
        type: 'object',
        additionalProperties: false,
        required: ['client_id'],
        properties: {
          client_id: { type: 'string', const: 'manacost-tracker' },
          scope: {
            type: 'string',
            example: 'profile.read subscription.read catalog.read images.read statistics.read tracker.write tracker.read',
          },
        },
      },
      DeviceAuthorization: {
        type: 'object',
        required: [
          'device_code',
          'user_code',
          'verification_uri',
          'verification_uri_complete',
          'expires_in',
          'interval',
        ],
        properties: {
          device_code: { type: 'string', writeOnly: true },
          user_code: { type: 'string', pattern: '^[A-Z2-9]{4}-[A-Z2-9]{4}$' },
          verification_uri: { type: 'string', format: 'uri' },
          verification_uri_complete: { type: 'string', format: 'uri' },
          expires_in: { type: 'integer', const: 600 },
          interval: { type: 'integer', minimum: 5 },
        },
      },
      DeviceAuthorizationDecision: {
        type: 'object',
        additionalProperties: false,
        required: ['user_code', 'decision'],
        properties: {
          user_code: { type: 'string', pattern: '^[A-Z2-9]{4}-[A-Z2-9]{4}$' },
          decision: { type: 'string', enum: ['approve', 'deny'] },
        },
      },
      ApplicationTokenInput: {
        type: 'object',
        required: ['grant_type', 'client_id'],
        properties: {
          grant_type: {
            type: 'string',
            enum: ['urn:ietf:params:oauth:grant-type:device_code', 'refresh_token'],
          },
          client_id: { type: 'string', const: 'manacost-tracker' },
          device_code: { type: 'string', writeOnly: true },
          refresh_token: { type: 'string', writeOnly: true },
        },
      },
      ApplicationTokenPair: {
        type: 'object',
        required: ['access_token', 'refresh_token', 'token_type', 'expires_in', 'scope'],
        properties: {
          access_token: { type: 'string', writeOnly: true },
          refresh_token: { type: 'string', writeOnly: true },
          token_type: { type: 'string', const: 'Bearer' },
          expires_in: { type: 'integer', const: 900 },
          scope: { type: 'string' },
        },
      },
      ApplicationProfile: {
        type: 'object',
        additionalProperties: false,
        required: ['user', 'subscription'],
        properties: {
          user: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'publicProfileId', 'profileUrl', 'email', 'name', 'avatarInitials'],
            properties: {
              id: { type: 'string' },
              publicProfileId: { type: 'string', pattern: '^[1-9][0-9]{0,9}$' },
              profileUrl: { type: 'string' },
              email: { type: 'string', format: 'email' },
              name: { type: 'string' },
              avatarInitials: { type: 'string' },
            },
          },
          subscription: {
            type: 'object',
            additionalProperties: false,
            description: 'Normalized cached status without provider-specific records.',
            required: ['hasAccess', 'source', 'checkedAt', 'stale', 'entitlements'],
            properties: {
              hasAccess: { type: 'boolean' },
              source: { type: 'string' },
              checkedAt: { type: ['string', 'null'], format: 'date-time' },
              stale: { type: 'boolean' },
              entitlements: {
                type: 'object',
                additionalProperties: { type: 'boolean' },
              },
            },
          },
        },
      },
      CreateApiKeyInput: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'scopes'],
        properties: {
          name: { type: 'string', minLength: 3, maxLength: 80 },
          scopes: {
            type: 'array',
            minItems: 1,
            uniqueItems: true,
            items: {
              type: 'string',
              enum: ['catalog.read', 'images.read', 'statistics.read'],
            },
          },
        },
      },
      CatalogManifest: {
        type: 'object',
        required: ['apiVersion', 'schemaVersion', 'generatedAt', 'resources'],
        properties: {
          apiVersion: { type: 'string', const: 'v1' },
          schemaVersion: { type: 'string' },
          generatedAt: { type: 'string', format: 'date-time' },
          resources: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'href', 'status'],
              properties: {
                id: { type: 'string' },
                href: { type: 'string' },
                status: { type: 'string', enum: ['AVAILABLE'] },
              },
            },
          },
        },
      },
      LocalizedCardText: {
        type: 'object',
        additionalProperties: false,
        required: ['ru', 'en'],
        properties: {
          ru: { type: ['string', 'null'] },
          en: { type: ['string', 'null'] },
        },
      },
      CardImages: {
        type: 'object',
        additionalProperties: false,
        required: ['thumb', 'full', 'tile'],
        properties: {
          thumb: { type: 'string', pattern: '^/api/v1/cards/.+/images/thumb\\.webp$' },
          full: { type: 'string', pattern: '^/api/v1/cards/.+/images/full\\.webp$' },
          tile: { type: 'string', pattern: '^/api/v1/cards/.+/images/tile\\.webp$' },
        },
      },
      CardSummary: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id', 'dbfId', 'slug', 'collectible', 'formats', 'name', 'text',
          'flavor', 'set', 'type', 'rarity', 'cardClass', 'multiClass',
          'minionType', 'minionTypes', 'spellSchool', 'cost', 'attack',
          'health', 'durability', 'armor', 'artist', 'mechanics',
          'referencedTags', 'keywordIds', 'releasedAt', 'images',
        ],
        properties: {
          id: { type: 'string', pattern: '^[A-Za-z0-9_]{2,80}$' },
          dbfId: { type: ['integer', 'null'], minimum: 0 },
          slug: { type: ['string', 'null'] },
          collectible: { type: 'boolean' },
          formats: {
            type: 'array',
            uniqueItems: true,
            items: { type: 'string', enum: ['standard', 'wild'] },
          },
          name: { $ref: '#/components/schemas/LocalizedCardText' },
          text: {
            allOf: [{ $ref: '#/components/schemas/LocalizedCardText' }],
            description: 'Text may contain only b, i and br markup.',
          },
          flavor: { $ref: '#/components/schemas/LocalizedCardText' },
          set: { type: ['string', 'null'] },
          type: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'nameRu'],
            properties: {
              id: { type: ['string', 'null'] },
              nameRu: { type: ['string', 'null'] },
            },
          },
          rarity: { type: ['string', 'null'] },
          cardClass: { type: ['string', 'null'] },
          multiClass: { type: 'array', items: { type: 'string' } },
          minionType: { type: ['string', 'null'] },
          minionTypes: { type: 'array', items: { type: 'string' } },
          spellSchool: { type: ['string', 'null'] },
          cost: { type: ['integer', 'null'], minimum: 0 },
          attack: { type: ['integer', 'null'], minimum: 0 },
          health: { type: ['integer', 'null'], minimum: 0 },
          durability: { type: ['integer', 'null'], minimum: 0 },
          armor: { type: ['integer', 'null'], minimum: 0 },
          artist: { type: ['string', 'null'] },
          mechanics: { type: 'array', items: { type: 'string' } },
          referencedTags: { type: 'array', items: { type: 'string' } },
          keywordIds: { type: 'array', items: { type: 'integer', minimum: 1 } },
          releasedAt: { type: ['string', 'null'], format: 'date-time' },
          images: { $ref: '#/components/schemas/CardImages' },
        },
      },
      RelatedCard: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'name', 'images'],
        properties: {
          id: { type: ['string', 'null'] },
          name: { $ref: '#/components/schemas/LocalizedCardText' },
          images: {
            oneOf: [
              { $ref: '#/components/schemas/CardImages' },
              { type: 'null' },
            ],
          },
        },
      },
      CardListResponse: {
        type: 'object',
        additionalProperties: false,
        required: ['data', 'pagination', 'meta'],
        properties: {
          data: { type: 'array', items: { $ref: '#/components/schemas/CardSummary' } },
          pagination: {
            type: 'object',
            additionalProperties: false,
            required: ['limit', 'total', 'hasMore', 'nextCursor'],
            properties: {
              limit: { type: 'integer', minimum: 1, maximum: 120 },
              total: { type: 'integer', minimum: 0 },
              hasMore: { type: 'boolean' },
              nextCursor: { type: ['string', 'null'] },
            },
          },
          meta: {
            type: 'object',
            additionalProperties: false,
            required: ['format', 'datasetVersion', 'dataStatus', 'publishedAt'],
            properties: {
              format: { type: 'string', enum: ['standard', 'wild'] },
              datasetVersion: { type: 'string' },
              dataStatus: { type: 'string', enum: ['fresh', 'stale'] },
              publishedAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
      CardDetailResponse: {
        type: 'object',
        additionalProperties: false,
        required: ['data', 'meta'],
        properties: {
          data: {
            allOf: [
              { $ref: '#/components/schemas/CardSummary' },
              {
                type: 'object',
                required: ['relatedCards', 'generatedCardPools'],
                properties: {
                  relatedCards: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['heading', 'cards'],
                      properties: {
                        heading: { type: ['string', 'null'] },
                        cards: { type: 'array', items: { $ref: '#/components/schemas/RelatedCard' } },
                      },
                    },
                  },
                  generatedCardPools: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['name', 'cards'],
                      properties: {
                        name: { type: ['string', 'null'] },
                        cards: { type: 'array', items: { $ref: '#/components/schemas/RelatedCard' } },
                      },
                    },
                  },
                },
              },
            ],
          },
          meta: {
            type: 'object',
            additionalProperties: false,
            required: ['format', 'datasetVersion', 'dataStatus', 'partial', 'warning'],
            properties: {
              format: { type: 'string', enum: ['standard', 'wild'] },
              datasetVersion: { type: 'string' },
              dataStatus: { type: 'string', enum: ['fresh', 'stale'] },
              partial: { type: 'boolean' },
              warning: { type: ['string', 'null'] },
            },
          },
        },
      },
      CardStatisticsMetrics: {
        type: 'object',
        additionalProperties: false,
        required: [
          'deckPopularityPercent', 'deckWinratePercent', 'averageCopies',
          'timesPlayed', 'winrateWhenPlayedPercent', 'winrateWhenDrawnPercent',
          'keepPercentage', 'openingHandWinratePercent', 'averageTurnsInHand',
          'averageTurnPlayed',
        ],
        properties: {
          deckPopularityPercent: {
            type: ['number', 'null'],
            minimum: 0,
            maximum: 100,
            description: 'Share of decks containing the card, in percentage points.',
          },
          deckWinratePercent: {
            type: ['number', 'null'],
            minimum: 0,
            maximum: 100,
            description: 'Win rate of decks containing the card, in percentage points.',
          },
          averageCopies: {
            type: ['number', 'null'],
            minimum: 0,
            description: 'Mean copies per deck.',
          },
          timesPlayed: {
            type: ['integer', 'null'],
            minimum: 0,
            description: 'Observed plays/sample count.',
          },
          winrateWhenPlayedPercent: {
            type: ['number', 'null'],
            minimum: 0,
            maximum: 100,
            description: 'Win rate when the card was played, in percentage points.',
          },
          winrateWhenDrawnPercent: {
            type: ['number', 'null'],
            minimum: 0,
            maximum: 100,
            description: 'Win rate when the card was drawn, in percentage points.',
          },
          keepPercentage: {
            type: ['number', 'null'],
            minimum: 0,
            maximum: 100,
            description: 'Mulligan keep rate, in percentage points.',
          },
          openingHandWinratePercent: {
            type: ['number', 'null'],
            minimum: 0,
            maximum: 100,
            description: 'Win rate when in the opening hand, in percentage points.',
          },
          averageTurnsInHand: {
            type: ['number', 'null'],
            minimum: 0,
            description: 'Mean number of turns held before play.',
          },
          averageTurnPlayed: {
            type: ['number', 'null'],
            minimum: 0,
            description: 'Mean turn number on which the card was played.',
          },
        },
      },
      CardStatisticsItem: {
        type: 'object',
        additionalProperties: false,
        required: ['cardId', 'metrics'],
        properties: {
          cardId: { type: 'string', pattern: '^[A-Za-z0-9_]{2,80}$' },
          metrics: { $ref: '#/components/schemas/CardStatisticsMetrics' },
        },
      },
      CardStatisticsMetaFields: {
        type: 'object',
        required: [
          'format', 'period', 'rank', 'updatedAt', 'datasetVersion', 'dataStatus',
        ],
        properties: {
          format: { type: 'string', enum: ['standard', 'wild'] },
          period: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'timeRange', 'patch'],
            properties: {
              id: { type: 'string', enum: ['1d', '3d', '7d', '14d', 'patch'] },
              timeRange: { type: ['string', 'null'] },
              patch: { type: ['string', 'null'] },
            },
          },
          rank: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'rankRange'],
            properties: {
              id: {
                type: 'string',
                enum: ['legend', 'diamond_4_1', 'diamond', 'platinum'],
              },
              rankRange: { type: 'string' },
            },
          },
          updatedAt: { type: ['string', 'null'], format: 'date-time' },
          datasetVersion: { type: 'string' },
          dataStatus: { type: 'string', enum: ['fresh', 'stale'] },
        },
      },
      CardStatisticsMeta: {
        allOf: [{ $ref: '#/components/schemas/CardStatisticsMetaFields' }],
        unevaluatedProperties: false,
      },
      CardStatisticsListResponse: {
        type: 'object',
        additionalProperties: false,
        required: ['data', 'pagination', 'meta'],
        properties: {
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/CardStatisticsItem' },
          },
          pagination: {
            type: 'object',
            additionalProperties: false,
            required: ['limit', 'total', 'hasMore', 'nextCursor'],
            properties: {
              limit: { type: 'integer', minimum: 1, maximum: 500 },
              total: { type: 'integer', minimum: 0 },
              hasMore: { type: 'boolean' },
              nextCursor: { type: ['string', 'null'] },
            },
          },
          meta: { $ref: '#/components/schemas/CardStatisticsMeta' },
        },
      },
      CardStatisticsDetailResponse: {
        type: 'object',
        additionalProperties: false,
        required: ['data', 'meta'],
        properties: {
          data: { $ref: '#/components/schemas/CardStatisticsItem' },
          meta: { $ref: '#/components/schemas/CardStatisticsMeta' },
        },
      },
      CardStatisticsHistoryPoint: {
        type: 'object',
        additionalProperties: false,
        required: ['recordedAt', 'metrics'],
        properties: {
          recordedAt: { type: 'string', format: 'date-time' },
          metrics: { $ref: '#/components/schemas/CardStatisticsMetrics' },
        },
      },
      CardStatisticsHistoryResponse: {
        type: 'object',
        additionalProperties: false,
        required: ['data', 'meta'],
        properties: {
          data: {
            type: 'array',
            maxItems: 1000,
            items: { $ref: '#/components/schemas/CardStatisticsHistoryPoint' },
          },
          meta: {
            allOf: [
              { $ref: '#/components/schemas/CardStatisticsMetaFields' },
              {
                type: 'object',
                required: ['days'],
                properties: {
                  days: { type: 'integer', minimum: 7, maximum: 365 },
                },
              },
            ],
            unevaluatedProperties: false,
          },
        },
      },
      MetaStatisticsMetrics: {
        type: 'object',
        additionalProperties: false,
        required: [
          'winratePercent', 'popularityPercent', 'games', 'averageTurns',
          'averageDurationMinutes', 'climbingSpeedStarsPerHour',
        ],
        properties: {
          winratePercent: {
            type: ['number', 'null'],
            minimum: 0,
            maximum: 100,
            description: 'Archetype win rate, in percentage points.',
          },
          popularityPercent: {
            type: ['number', 'null'],
            minimum: 0,
            maximum: 100,
            description: 'Share of observed games, in percentage points.',
          },
          games: {
            type: ['integer', 'null'],
            minimum: 0,
            description: 'Observed game count.',
          },
          averageTurns: {
            type: ['number', 'null'],
            minimum: 0,
            maximum: 100,
            description: 'Mean turns per game.',
          },
          averageDurationMinutes: {
            type: ['number', 'null'],
            minimum: 0,
            maximum: 240,
            description: 'Mean game duration in minutes.',
          },
          climbingSpeedStarsPerHour: {
            type: ['number', 'null'],
            minimum: -1000,
            maximum: 1000,
            description: 'Estimated ladder stars gained per hour.',
          },
        },
      },
      ArchetypeResourceLinks: {
        type: 'object',
        additionalProperties: false,
        required: ['web', 'statistics', 'history', 'analysis', 'builds'],
        properties: {
          web: {
            type: 'string',
            format: 'uri',
            description: 'Canonical first-party archetype page.',
          },
          statistics: {
            type: 'string',
            format: 'uri',
            description: 'Current archetype statistics resource.',
          },
          history: {
            type: 'string',
            format: 'uri',
            description: 'Archetype statistics history resource.',
          },
          analysis: {
            type: 'string',
            format: 'uri',
            description: 'Archetype matchup and card-impact analysis resource.',
          },
          builds: {
            type: 'string',
            format: 'uri',
            description: 'Filtered collection of concrete builds for the archetype.',
          },
        },
      },
      MetaStatisticsItem: {
        type: 'object',
        additionalProperties: false,
        required: [
          'archetypeId', 'slug', 'name', 'localizedName', 'translated',
          'classId', 'metrics', 'links',
        ],
        properties: {
          archetypeId: { type: 'string' },
          slug: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,89}$' },
          name: { type: 'string' },
          localizedName: { type: 'string' },
          translated: { type: 'boolean' },
          classId: { type: ['string', 'null'] },
          metrics: { $ref: '#/components/schemas/MetaStatisticsMetrics' },
          links: { $ref: '#/components/schemas/ArchetypeResourceLinks' },
        },
      },
      MetaStatisticsMeta: {
        type: 'object',
        additionalProperties: false,
        required: [
          'format', 'rank', 'period', 'minGames', 'mode', 'partial',
          'updatedAt', 'datasetVersion', 'dataStatus',
        ],
        properties: {
          format: { type: 'string', enum: ['standard', 'wild'] },
          rank: {
            type: 'object',
            additionalProperties: false,
            required: ['id'],
            properties: {
              id: {
                type: 'string',
                enum: [
                  'all', 'diamond_4_1', 'diamond_to_legend', 'legend',
                  'top_5000', 'top_1000',
                ],
              },
            },
          },
          period: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'patch'],
            properties: {
              id: { type: 'string', enum: ['1d', '3d', '7d', '14d', 'patch'] },
              patch: { type: ['string', 'null'] },
            },
          },
          minGames: { type: 'integer', enum: [100, 250, 500, 1000, 2500, 5000] },
          mode: { type: 'string', enum: ['stable', 'early'] },
          partial: { type: 'boolean' },
          updatedAt: { type: ['string', 'null'], format: 'date-time' },
          datasetVersion: { type: 'string' },
          dataStatus: { type: 'string', enum: ['fresh', 'stale'] },
        },
      },
      MetaStatisticsListResponse: {
        type: 'object',
        additionalProperties: false,
        required: ['data', 'pagination', 'meta'],
        properties: {
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/MetaStatisticsItem' },
          },
          pagination: {
            type: 'object',
            additionalProperties: false,
            required: ['limit', 'total', 'hasMore', 'nextCursor'],
            properties: {
              limit: { type: 'integer', minimum: 1, maximum: 500 },
              total: { type: 'integer', minimum: 0 },
              hasMore: { type: 'boolean' },
              nextCursor: { type: ['string', 'null'] },
            },
          },
          meta: { $ref: '#/components/schemas/MetaStatisticsMeta' },
        },
      },
      ArchetypeStatisticsItem: {
        type: 'object',
        additionalProperties: false,
        required: [
          'slug', 'name', 'localizedName', 'translated', 'classId',
          'metrics', 'format', 'deckCount', 'links',
        ],
        properties: {
          slug: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,89}$' },
          name: { type: 'string' },
          localizedName: { type: 'string' },
          translated: { type: 'boolean' },
          classId: { type: ['string', 'null'] },
          metrics: { $ref: '#/components/schemas/MetaStatisticsMetrics' },
          format: { type: 'string', enum: ['standard', 'wild'] },
          deckCount: { type: 'integer', minimum: 0 },
          links: { $ref: '#/components/schemas/ArchetypeResourceLinks' },
        },
      },
      ArchetypeStatisticsResponse: {
        type: 'object',
        additionalProperties: false,
        required: ['data', 'meta'],
        properties: {
          data: { $ref: '#/components/schemas/ArchetypeStatisticsItem' },
          meta: {
            type: 'object',
            additionalProperties: false,
            required: [
              'format', 'patch', 'minimumGames', 'updatedAt',
              'datasetVersion', 'dataStatus',
            ],
            properties: {
              format: { type: 'string', enum: ['standard', 'wild'] },
              patch: { type: ['string', 'null'] },
              minimumGames: { type: 'integer', minimum: 0 },
              updatedAt: { type: ['string', 'null'], format: 'date-time' },
              datasetVersion: { type: 'string' },
              dataStatus: { type: 'string', enum: ['fresh', 'stale'] },
            },
          },
        },
      },
      ArchetypeStatisticsHistoryPoint: {
        type: 'object',
        additionalProperties: false,
        required: ['recordedAt', 'metrics'],
        properties: {
          recordedAt: { type: 'string', format: 'date-time' },
          metrics: { $ref: '#/components/schemas/MetaStatisticsMetrics' },
        },
      },
      ArchetypeStatisticsHistoryResponse: {
        type: 'object',
        additionalProperties: false,
        required: ['data', 'meta'],
        properties: {
          data: {
            type: 'array',
            maxItems: 1000,
            items: { $ref: '#/components/schemas/ArchetypeStatisticsHistoryPoint' },
          },
          meta: {
            type: 'object',
            additionalProperties: false,
            required: [
              'format', 'slug', 'days', 'patch', 'updatedAt',
              'datasetVersion', 'dataStatus',
            ],
            properties: {
              format: { type: 'string', enum: ['standard', 'wild'] },
              slug: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,89}$' },
              days: { type: 'integer', minimum: 7, maximum: 365 },
              patch: { type: ['string', 'null'] },
              updatedAt: { type: ['string', 'null'], format: 'date-time' },
              datasetVersion: { type: 'string' },
              dataStatus: { type: 'string', enum: ['fresh', 'stale'] },
            },
          },
        },
      },
      ArchetypeClassMatchup: {
        type: 'object',
        additionalProperties: false,
        required: ['classId', 'localizedName', 'metrics'],
        properties: {
          classId: { type: 'string' },
          localizedName: { type: 'string' },
          metrics: {
            type: 'object',
            additionalProperties: false,
            required: ['winratePercent', 'games', 'sharePercent'],
            properties: {
              winratePercent: { type: ['number', 'null'], minimum: 0, maximum: 100 },
              games: { type: ['integer', 'null'], minimum: 0 },
              sharePercent: { type: ['number', 'null'], minimum: 0, maximum: 100 },
            },
          },
        },
      },
      ArchetypeCardImpact: {
        type: 'object',
        additionalProperties: false,
        required: ['cardId', 'dbfId', 'name', 'manaCost', 'metrics'],
        properties: {
          cardId: { type: ['string', 'null'] },
          dbfId: { type: ['integer', 'null'], minimum: 0 },
          name: { type: 'string' },
          manaCost: { type: ['integer', 'null'], minimum: 0 },
          metrics: {
            type: 'object',
            additionalProperties: false,
            required: [
              'mulliganImpactPercentagePoints', 'mulliganCount',
              'drawnImpactPercentagePoints', 'drawnCount',
              'keptImpactPercentagePoints', 'keptCount',
            ],
            properties: {
              mulliganImpactPercentagePoints: {
                type: ['number', 'null'],
                minimum: -100,
                maximum: 100,
              },
              mulliganCount: { type: ['integer', 'null'], minimum: 0 },
              drawnImpactPercentagePoints: {
                type: ['number', 'null'],
                minimum: -100,
                maximum: 100,
              },
              drawnCount: { type: ['integer', 'null'], minimum: 0 },
              keptImpactPercentagePoints: {
                type: ['number', 'null'],
                minimum: -100,
                maximum: 100,
              },
              keptCount: { type: ['integer', 'null'], minimum: 0 },
            },
          },
        },
      },
      ArchetypeAnalysisResponse: {
        type: 'object',
        additionalProperties: false,
        required: ['data', 'meta'],
        properties: {
          data: {
            type: 'object',
            additionalProperties: false,
            required: [
              'slug', 'state', 'rank', 'period', 'classMatchups', 'cardStatistics',
            ],
            properties: {
              slug: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,89}$' },
              state: { type: 'string', enum: ['ok', 'partial', 'error'] },
              rank: { type: 'string', const: 'legend' },
              period: { type: 'string', const: '7d' },
              classMatchups: {
                type: 'array',
                items: { $ref: '#/components/schemas/ArchetypeClassMatchup' },
              },
              cardStatistics: {
                type: 'array',
                items: { $ref: '#/components/schemas/ArchetypeCardImpact' },
              },
            },
          },
          meta: {
            type: 'object',
            additionalProperties: false,
            required: [
              'format', 'updatedAt', 'matchupsUpdatedAt',
              'cardStatisticsUpdatedAt', 'datasetVersion', 'dataStatus',
            ],
            properties: {
              format: { type: 'string', enum: ['standard', 'wild'] },
              updatedAt: { type: ['string', 'null'], format: 'date-time' },
              matchupsUpdatedAt: { type: ['string', 'null'], format: 'date-time' },
              cardStatisticsUpdatedAt: { type: ['string', 'null'], format: 'date-time' },
              datasetVersion: { type: 'string' },
              dataStatus: { type: 'string', enum: ['fresh', 'stale'] },
            },
          },
        },
      },
      DeckStatisticsItem: {
        type: 'object',
        additionalProperties: false,
        required: [
          'deckId', 'deckCode', 'format', 'archetype', 'metrics', 'sample',
          'updatedAt', 'links',
        ],
        properties: {
          deckId: { type: 'string', pattern: '^deck_[a-f0-9]{32}$' },
          deckCode: {
            type: 'string',
            minLength: 1,
            maxLength: 4096,
            description: 'Portable Hearthstone deck code for resolving the complete build.',
          },
          format: { type: 'string', enum: ['standard', 'wild'] },
          archetype: {
            type: 'object',
            additionalProperties: false,
            required: ['slug', 'name', 'localizedName', 'classId'],
            properties: {
              slug: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,89}$' },
              name: { type: 'string' },
              localizedName: { type: 'string' },
              classId: { type: ['string', 'null'] },
            },
          },
          metrics: {
            type: 'object',
            additionalProperties: false,
            required: ['games', 'winratePercent'],
            properties: {
              games: { type: ['integer', 'null'], minimum: 0 },
              winratePercent: { type: ['number', 'null'], minimum: 0, maximum: 100 },
            },
          },
          sample: {
            type: 'object',
            additionalProperties: false,
            required: ['rank', 'period'],
            properties: {
              rank: { type: ['string', 'null'] },
              period: { type: ['string', 'null'] },
            },
          },
          updatedAt: { type: ['string', 'null'], format: 'date-time' },
          links: { $ref: '#/components/schemas/DeckResourceLinks' },
        },
      },
      DeckResourceLinks: {
        type: 'object',
        additionalProperties: false,
        required: ['archetype', 'statistics', 'builder', 'archetypeBuilds'],
        properties: {
          archetype: {
            type: 'string',
            format: 'uri',
            description: 'Canonical first-party page for the parent archetype.',
          },
          statistics: {
            type: 'string',
            format: 'uri',
            description: 'Current API statistics resource for this exact build.',
          },
          builder: {
            type: 'string',
            format: 'uri',
            description: 'First-party deck builder preloaded with this build.',
          },
          archetypeBuilds: {
            type: 'string',
            format: 'uri',
            description: 'Filtered collection of builds for the parent archetype.',
          },
        },
      },
      DeckStatisticsMeta: {
        type: 'object',
        additionalProperties: false,
        required: ['format', 'patch', 'updatedAt', 'datasetVersion', 'dataStatus'],
        properties: {
          format: { type: 'string', enum: ['standard', 'wild'] },
          archetype: { type: ['string', 'null'] },
          minGames: { type: 'integer', minimum: 0, maximum: 10000000 },
          patch: { type: ['string', 'null'] },
          updatedAt: { type: ['string', 'null'], format: 'date-time' },
          datasetVersion: { type: 'string' },
          dataStatus: { type: 'string', enum: ['fresh', 'stale'] },
        },
      },
      DeckStatisticsListResponse: {
        type: 'object',
        additionalProperties: false,
        required: ['data', 'pagination', 'meta'],
        properties: {
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/DeckStatisticsItem' },
          },
          pagination: {
            type: 'object',
            additionalProperties: false,
            required: ['limit', 'total', 'hasMore', 'nextCursor'],
            properties: {
              limit: { type: 'integer', minimum: 1, maximum: 500 },
              total: { type: 'integer', minimum: 0 },
              hasMore: { type: 'boolean' },
              nextCursor: { type: ['string', 'null'] },
            },
          },
          meta: { $ref: '#/components/schemas/DeckStatisticsMeta' },
        },
      },
      DeckStatisticsResponse: {
        type: 'object',
        additionalProperties: false,
        required: ['data', 'meta'],
        properties: {
          data: { $ref: '#/components/schemas/DeckStatisticsItem' },
          meta: { $ref: '#/components/schemas/DeckStatisticsMeta' },
        },
      },
      ArenaClassId: {
        type: 'string',
        enum: [
          'death-knight', 'demon-hunter', 'druid', 'hunter', 'mage', 'paladin',
          'priest', 'rogue', 'shaman', 'warlock', 'warrior',
        ],
      },
      StatisticsPagination: {
        type: 'object',
        additionalProperties: false,
        required: ['limit', 'total', 'hasMore', 'nextCursor'],
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 500 },
          total: { type: 'integer', minimum: 0 },
          hasMore: { type: 'boolean' },
          nextCursor: { type: ['string', 'null'] },
        },
      },
      ArenaStatisticsMeta: {
        type: 'object',
        additionalProperties: false,
        required: [
          'mode', 'entity', 'source', 'updatedAt', 'datasetVersion', 'dataStatus',
        ],
        properties: {
          mode: { type: 'string', const: 'arena' },
          entity: {
            type: 'string',
            enum: ['classes', 'cards', 'legendaries', 'matchups'],
          },
          source: { type: 'string', enum: ['hsreplay', 'firestone', 'heartharena'] },
          updatedAt: { type: ['string', 'null'], format: 'date-time' },
          datasetVersion: { type: 'string' },
          dataStatus: { type: 'string', enum: ['fresh', 'stale'] },
          sample: {
            type: 'object',
            additionalProperties: false,
            required: ['dataPoints', 'timePeriod'],
            properties: {
              dataPoints: { type: ['integer', 'null'], minimum: 0 },
              timePeriod: { type: ['string', 'null'] },
            },
          },
        },
      },
      ArenaClassStatisticsItem: {
        type: 'object',
        additionalProperties: false,
        required: [
          'classId', 'name', 'rank', 'heroPowerCardId',
          'winsDistribution', 'matchups', 'metrics',
        ],
        properties: {
          classId: { $ref: '#/components/schemas/ArenaClassId' },
          name: { type: 'string' },
          rank: { type: 'integer', minimum: 1 },
          heroPowerCardId: {
            type: ['string', 'null'],
            pattern: '^[A-Za-z0-9_]{1,80}$',
          },
          winsDistribution: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['wins', 'games', 'sharePercent'],
              properties: {
                wins: { type: 'integer', minimum: 0 },
                games: { type: 'integer', minimum: 0 },
                sharePercent: {
                  type: ['number', 'null'],
                  minimum: 0,
                  maximum: 100,
                },
              },
            },
          },
          matchups: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['opponentClassId', 'opponentHeroPowerCardId', 'metrics'],
              properties: {
                opponentClassId: { $ref: '#/components/schemas/ArenaClassId' },
                opponentHeroPowerCardId: {
                  type: ['string', 'null'],
                  pattern: '^[A-Za-z0-9_]{1,80}$',
                },
                metrics: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['winratePercent', 'games', 'wins', 'losses'],
                  properties: {
                    winratePercent: { type: 'number', minimum: 0, maximum: 100 },
                    games: { type: 'integer', minimum: 0 },
                    wins: { type: ['integer', 'null'], minimum: 0 },
                    losses: { type: ['integer', 'null'], minimum: 0 },
                  },
                },
              },
            },
          },
          metrics: {
            type: 'object',
            additionalProperties: false,
            required: [
              'winratePercent', 'games', 'wins', 'losses',
              'pickRatePercent', 'sevenPlusWinsPercent',
            ],
            properties: {
              winratePercent: { type: 'number', minimum: 0, maximum: 100 },
              games: { type: 'integer', minimum: 0 },
              wins: { type: ['integer', 'null'], minimum: 0 },
              losses: { type: ['integer', 'null'], minimum: 0 },
              pickRatePercent: { type: ['number', 'null'], minimum: 0, maximum: 100 },
              sevenPlusWinsPercent: { type: ['number', 'null'], minimum: 0, maximum: 100 },
            },
          },
        },
      },
      ArenaCardStatisticsMetrics: {
        type: 'object',
        additionalProperties: false,
        required: [
          'deckWinratePercent', 'playedWinratePercent', 'pickRatePercent',
          'inclusionRatePercent', 'games', 'arenaScore', 'offerRatePercent',
          'discardRatePercent', 'drawnWinratePercent', 'mulliganWinratePercent',
          'keptRatePercent', 'averageCopies', 'copiesInPackage',
        ],
        properties: {
          deckWinratePercent: { type: ['number', 'null'], minimum: 0, maximum: 100 },
          playedWinratePercent: { type: ['number', 'null'], minimum: 0, maximum: 100 },
          pickRatePercent: { type: ['number', 'null'], minimum: 0, maximum: 100 },
          inclusionRatePercent: { type: ['number', 'null'], minimum: 0, maximum: 100 },
          games: { type: ['integer', 'null'], minimum: 0 },
          arenaScore: { type: ['number', 'null'], minimum: -10000, maximum: 10000 },
          offerRatePercent: { type: ['number', 'null'], minimum: 0, maximum: 100 },
          discardRatePercent: { type: ['number', 'null'], minimum: 0, maximum: 100 },
          drawnWinratePercent: { type: ['number', 'null'], minimum: 0, maximum: 100 },
          mulliganWinratePercent: { type: ['number', 'null'], minimum: 0, maximum: 100 },
          keptRatePercent: { type: ['number', 'null'], minimum: 0, maximum: 100 },
          averageCopies: { type: ['number', 'null'], minimum: 0, maximum: 30 },
          copiesInPackage: { type: ['integer', 'null'], minimum: 0 },
        },
      },
      ArenaCardStatisticsItem: {
        type: 'object',
        additionalProperties: false,
        required: [
          'cardId', 'name', 'classId', 'rarity', 'tier', 'arenaSmithTier',
          'arenaSmithTierPosition', 'arenaSmithRank', 'metrics',
        ],
        properties: {
          cardId: { type: 'string', pattern: '^[A-Za-z0-9_]{1,80}$' },
          name: { type: 'string' },
          classId: {
            oneOf: [{ $ref: '#/components/schemas/ArenaClassId' }, { type: 'null' }],
          },
          rarity: { type: ['string', 'null'] },
          tier: {
            type: ['string', 'null'],
            enum: ['S', 'A', 'B', 'C', 'D', 'E', 'F', 'NO-DATA', null],
          },
          arenaSmithTier: {
            type: ['string', 'null'],
            enum: ['S', 'A', 'B', 'C', 'D', 'E', 'F', 'NO-DATA', null],
          },
          arenaSmithTierPosition: {
            type: ['string', 'null'],
            enum: ['S', 'A', 'B', 'C', 'D', 'E', 'F', 'NO-DATA', null],
          },
          arenaSmithRank: { type: ['integer', 'null'], minimum: 0 },
          metrics: { $ref: '#/components/schemas/ArenaCardStatisticsMetrics' },
        },
      },
      ArenaLegendaryCardStatisticsItem: {
        type: 'object',
        additionalProperties: false,
        required: [
          'cardId', 'name', 'classId', 'rarity', 'tier', 'arenaSmithTier',
          'arenaSmithTierPosition', 'arenaSmithRank', 'metrics',
        ],
        properties: {
          cardId: { type: 'string', pattern: '^[A-Za-z0-9_]{1,80}$' },
          name: { type: 'string' },
          classId: {
            oneOf: [{ $ref: '#/components/schemas/ArenaClassId' }, { type: 'null' }],
          },
          rarity: { type: ['string', 'null'] },
          tier: { type: ['string', 'null'] },
          arenaSmithTier: { type: ['string', 'null'] },
          arenaSmithTierPosition: { type: ['string', 'null'] },
          arenaSmithRank: { type: ['integer', 'null'], minimum: 0 },
          metrics: { $ref: '#/components/schemas/ArenaCardStatisticsMetrics' },
        },
      },
      ArenaLegendaryStatisticsItem: {
        type: 'object',
        additionalProperties: false,
        required: [
          'cardId', 'name', 'classId', 'relatedCardIds', 'keyCard',
          'relatedCards', 'byClass', 'metrics',
        ],
        properties: {
          cardId: { type: 'string', pattern: '^[A-Za-z0-9_]{1,80}$' },
          name: { type: 'string' },
          classId: {
            oneOf: [{ $ref: '#/components/schemas/ArenaClassId' }, { type: 'null' }],
          },
          relatedCardIds: {
            type: 'array',
            uniqueItems: true,
            items: { type: 'string', pattern: '^[A-Za-z0-9_]{1,80}$' },
          },
          keyCard: {
            oneOf: [
              { $ref: '#/components/schemas/ArenaLegendaryCardStatisticsItem' },
              { type: 'null' },
            ],
          },
          relatedCards: {
            type: 'array',
            items: { $ref: '#/components/schemas/ArenaLegendaryCardStatisticsItem' },
          },
          byClass: {
            type: 'object',
            additionalProperties: {
              type: 'object',
              additionalProperties: false,
              required: [
                'winratePercent', 'pickRatePercent', 'offerRatePercent', 'arenaScore',
              ],
              properties: {
                winratePercent: { type: ['number', 'null'], minimum: 0, maximum: 100 },
                pickRatePercent: { type: ['number', 'null'], minimum: 0, maximum: 100 },
                offerRatePercent: { type: ['number', 'null'], minimum: 0, maximum: 100 },
                arenaScore: { type: ['number', 'null'], minimum: -10000, maximum: 10000 },
              },
            },
          },
          metrics: {
            type: 'object',
            additionalProperties: false,
            required: [
              'winratePercent', 'pickRatePercent', 'offerRatePercent', 'games', 'arenaScore',
            ],
            properties: {
              winratePercent: { type: ['number', 'null'], minimum: 0, maximum: 100 },
              pickRatePercent: { type: ['number', 'null'], minimum: 0, maximum: 100 },
              offerRatePercent: { type: ['number', 'null'], minimum: 0, maximum: 100 },
              games: { type: ['integer', 'null'], minimum: 0 },
              arenaScore: { type: ['number', 'null'], minimum: -10000, maximum: 10000 },
            },
          },
        },
      },
      ArenaMatchupStatisticsItem: {
        type: 'object',
        additionalProperties: false,
        required: ['classAId', 'classBId', 'metrics'],
        properties: {
          classAId: { $ref: '#/components/schemas/ArenaClassId' },
          classBId: { $ref: '#/components/schemas/ArenaClassId' },
          metrics: {
            type: 'object',
            additionalProperties: false,
            required: ['winratePercent', 'games'],
            properties: {
              winratePercent: { type: 'number', minimum: 0, maximum: 100 },
              games: { type: ['integer', 'null'], minimum: 0 },
            },
          },
        },
      },
      ArenaClassStatisticsResponse: {
        type: 'object',
        additionalProperties: false,
        required: ['data', 'meta'],
        properties: {
          data: {
            type: 'array',
            maxItems: 11,
            items: { $ref: '#/components/schemas/ArenaClassStatisticsItem' },
          },
          meta: { $ref: '#/components/schemas/ArenaStatisticsMeta' },
        },
      },
      ArenaCardStatisticsResponse: {
        type: 'object',
        additionalProperties: false,
        required: ['data', 'pagination', 'meta'],
        properties: {
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/ArenaCardStatisticsItem' },
          },
          pagination: { $ref: '#/components/schemas/StatisticsPagination' },
          meta: { $ref: '#/components/schemas/ArenaStatisticsMeta' },
        },
      },
      ArenaLegendaryStatisticsResponse: {
        type: 'object',
        additionalProperties: false,
        required: ['data', 'pagination', 'meta'],
        properties: {
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/ArenaLegendaryStatisticsItem' },
          },
          pagination: { $ref: '#/components/schemas/StatisticsPagination' },
          meta: { $ref: '#/components/schemas/ArenaStatisticsMeta' },
        },
      },
      ArenaMatchupStatisticsResponse: {
        type: 'object',
        additionalProperties: false,
        required: ['data', 'pagination', 'meta'],
        properties: {
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/ArenaMatchupStatisticsItem' },
          },
          pagination: { $ref: '#/components/schemas/StatisticsPagination' },
          meta: { $ref: '#/components/schemas/ArenaStatisticsMeta' },
        },
      },
      BattlegroundStatisticsMeta: {
        type: 'object',
        additionalProperties: false,
        required: ['mode', 'entity', 'updatedAt', 'datasetVersion', 'dataStatus'],
        properties: {
          mode: { type: 'string', const: 'battlegrounds' },
          entity: {
            type: 'string',
            pattern: '^(heroes|hero:\\d+|minions|minion-history:\\d+|spells|tier-list:(heroes|minions|spells|trinkets|strategies))$',
          },
          updatedAt: { type: ['string', 'null'], format: 'date-time' },
          datasetVersion: { type: 'string' },
          dataStatus: { type: 'string', enum: ['fresh', 'stale'] },
          publication: { $ref: '#/components/schemas/BattlegroundStrategyPublication' },
          upstreamFreshness: { $ref: '#/components/schemas/BattlegroundUpstreamFreshness' },
          sample: {
            type: 'object',
            additionalProperties: false,
            required: ['mmrPercentile', 'timeRange'],
            properties: {
              mode: { type: ['string', 'null'], enum: ['solo', 'duos', null] },
              mmrPercentile: { type: ['string', 'null'] },
              timeRange: { type: ['string', 'null'] },
              totalDataPoints: { type: ['integer', 'null'], minimum: 0 },
            },
          },
        },
      },
      BattlegroundHeroStatisticsItem: {
        type: 'object',
        additionalProperties: false,
        required: [
          'heroId', 'cardId', 'name', 'tier', 'isAnomalyAdjusted',
          'heroPower', 'keyMinions', 'bestComposition', 'metrics',
        ],
        properties: {
          heroId: { type: 'string', pattern: '^\\d+$' },
          cardId: { type: ['string', 'null'] },
          name: { type: 'string' },
          tier: { type: ['string', 'null'], enum: ['S', 'A', 'B', 'C', 'D', null] },
          isAnomalyAdjusted: { type: ['boolean', 'null'] },
          heroPower: {
            oneOf: [
              { $ref: '#/components/schemas/BattlegroundCardReference' },
              { type: 'null' },
            ],
          },
          keyMinions: {
            type: 'array',
            maxItems: 3,
            items: { $ref: '#/components/schemas/BattlegroundCardReference' },
          },
          bestComposition: {
            type: ['object', 'null'],
            additionalProperties: false,
            required: ['id', 'name'],
            properties: {
              id: { type: ['string', 'null'] },
              name: { type: ['string', 'null'] },
            },
          },
          metrics: {
            type: 'object',
            additionalProperties: false,
            required: [
              'pickRatePercent', 'averagePlacement', 'adjustedAveragePlacement',
              'placementDistributionPercent',
            ],
            properties: {
              pickRatePercent: { type: ['number', 'null'], minimum: 0, maximum: 100 },
              averagePlacement: { type: ['number', 'null'], minimum: 1, maximum: 8 },
              adjustedAveragePlacement: { type: ['number', 'null'], minimum: 1, maximum: 8 },
              placementDistributionPercent: {
                type: 'array',
                maxItems: 8,
                items: { type: 'number', minimum: 0, maximum: 100 },
              },
            },
          },
        },
      },
      BattlegroundCardReference: {
        type: 'object',
        additionalProperties: false,
        required: ['cardId', 'dbfId', 'name', 'tavernTier'],
        properties: {
          cardId: { type: ['string', 'null'] },
          dbfId: { type: ['integer', 'null'], minimum: 0 },
          name: { type: ['string', 'null'] },
          tavernTier: { type: ['integer', 'null'], minimum: 1, maximum: 7 },
        },
      },
      BattlegroundMinionStatisticsItem: {
        type: 'object',
        additionalProperties: false,
        required: ['dbfId', 'cardId', 'name', 'localizedName', 'tavernTier', 'metrics'],
        properties: {
          dbfId: { type: 'integer', minimum: 0 },
          cardId: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,120}$' },
          name: { type: 'string' },
          localizedName: { type: ['string', 'null'] },
          tavernTier: { type: ['integer', 'null'], minimum: 1, maximum: 7 },
          metrics: {
            type: 'object',
            additionalProperties: false,
            required: [
              'impact', 'combatWinratePercent', 'popularityPercent',
              'gamesWithMinion', 'gamesWithoutMinion',
              'averagePlacementWith', 'averagePlacementWithout',
            ],
            properties: {
              impact: { type: ['number', 'null'], minimum: -8, maximum: 8 },
              combatWinratePercent: { type: ['number', 'null'], minimum: 0, maximum: 100 },
              popularityPercent: { type: ['number', 'null'], minimum: 0, maximum: 100 },
              gamesWithMinion: { type: ['integer', 'null'], minimum: 0 },
              gamesWithoutMinion: { type: ['integer', 'null'], minimum: 0 },
              averagePlacementWith: { type: ['number', 'null'], minimum: 1, maximum: 8 },
              averagePlacementWithout: { type: ['number', 'null'], minimum: 1, maximum: 8 },
            },
          },
        },
      },
      BattlegroundTierListStatisticsItem: {
        type: 'object',
        additionalProperties: false,
        required: [
          'entityId', 'dbfId', 'cardId', 'name', 'localizedName', 'tier',
          'tavernTier', 'archetype', 'bestComposition', 'difficulty',
          'size', 'cost', 'race', 'races', 'metrics',
        ],
        properties: {
          entityId: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,120}$' },
          dbfId: { type: ['integer', 'null'], minimum: 0 },
          cardId: { type: ['string', 'null'] },
          name: { type: 'string' },
          localizedName: { type: ['string', 'null'] },
          tier: { type: ['string', 'null'], enum: ['S', 'A', 'B', 'C', 'D', null] },
          tavernTier: { type: ['integer', 'null'], minimum: 1, maximum: 7 },
          archetype: {
            type: ['object', 'null'],
            additionalProperties: false,
            required: ['id', 'name'],
            properties: {
              id: { type: ['string', 'null'] },
              name: { type: ['string', 'null'] },
            },
          },
          bestComposition: {
            type: ['object', 'null'],
            additionalProperties: false,
            required: ['id', 'name'],
            properties: {
              id: { type: ['string', 'null'] },
              name: { type: ['string', 'null'] },
            },
          },
          difficulty: { type: ['string', 'null'] },
          size: { type: ['string', 'null'] },
          cost: { type: ['integer', 'null'], minimum: 0 },
          race: { type: ['string', 'null'] },
          races: { type: 'array', items: { type: 'string' }, maxItems: 20 },
          metrics: {
            type: 'object',
            additionalProperties: false,
            required: [
              'impact', 'combatWinratePercent', 'pickRatePercent',
              'popularityPercent', 'firstPlacePercent', 'averagePlacement',
              'averagePlacementWithout', 'games', 'gamesIsMinimum',
              'metricValue', 'placementDistributionPercent',
            ],
            properties: {
              impact: { type: ['number', 'null'], minimum: -8, maximum: 8 },
              combatWinratePercent: { type: ['number', 'null'], minimum: 0, maximum: 100 },
              pickRatePercent: { type: ['number', 'null'], minimum: 0, maximum: 100 },
              popularityPercent: { type: ['number', 'null'], minimum: 0, maximum: 100 },
              firstPlacePercent: { type: ['number', 'null'], minimum: 0, maximum: 100 },
              averagePlacement: { type: ['number', 'null'], minimum: 1, maximum: 8 },
              averagePlacementWithout: { type: ['number', 'null'], minimum: 1, maximum: 8 },
              games: { type: ['integer', 'null'], minimum: 0 },
              gamesIsMinimum: { type: ['boolean', 'null'] },
              metricValue: { type: ['number', 'null'] },
              placementDistributionPercent: {
                type: 'array',
                maxItems: 8,
                items: { type: 'number', minimum: 0, maximum: 100 },
              },
            },
          },
        },
      },
      BattlegroundSpellStatisticsItem: {
        type: 'object',
        additionalProperties: false,
        required: ['cardId', 'dbfId', 'name', 'tavernTier', 'metrics'],
        properties: {
          cardId: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,120}$' },
          dbfId: { type: 'integer', minimum: 0 },
          name: { type: 'string' },
          tavernTier: { type: ['integer', 'null'], minimum: 1, maximum: 7 },
          metrics: {
            type: 'object',
            additionalProperties: false,
            required: ['games', 'averagePlacement', 'averagePlacementWithout', 'impact'],
            properties: {
              games: { type: ['integer', 'null'], minimum: 0 },
              averagePlacement: { type: ['number', 'null'], minimum: 1, maximum: 8 },
              averagePlacementWithout: { type: ['number', 'null'], minimum: 1, maximum: 8 },
              impact: { type: ['number', 'null'], minimum: -8, maximum: 8 },
            },
          },
        },
      },
      BattlegroundMinionHistoryPoint: {
        type: 'object',
        additionalProperties: false,
        required: ['observedAt', 'tavernTier', 'metrics'],
        properties: {
          observedAt: { type: 'string', format: 'date-time' },
          tavernTier: { type: ['integer', 'null'], minimum: 1, maximum: 7 },
          metrics: {
            type: 'object',
            additionalProperties: false,
            required: [
              'impact', 'combatWinratePercent', 'popularityPercent',
              'gamesWithMinion', 'gamesWithoutMinion',
              'averagePlacementWith', 'averagePlacementWithout',
            ],
            properties: {
              impact: { type: ['number', 'null'], minimum: -8, maximum: 8 },
              combatWinratePercent: { type: ['number', 'null'], minimum: 0, maximum: 100 },
              popularityPercent: { type: ['number', 'null'], minimum: 0, maximum: 100 },
              gamesWithMinion: { type: ['integer', 'null'], minimum: 0 },
              gamesWithoutMinion: { type: ['integer', 'null'], minimum: 0 },
              averagePlacementWith: { type: ['number', 'null'], minimum: 1, maximum: 8 },
              averagePlacementWithout: { type: ['number', 'null'], minimum: 1, maximum: 8 },
            },
          },
        },
      },
      BattlegroundHeroLineupMinion: {
        type: 'object',
        additionalProperties: false,
        required: [
          'cardId', 'dbfId', 'name', 'tavernTier', 'zonePosition', 'isPremium',
          'hasTaunt', 'hasPoison', 'hasDivineShield', 'metrics',
        ],
        properties: {
          cardId: { type: ['string', 'null'] },
          dbfId: { type: ['integer', 'null'], minimum: 0 },
          name: { type: ['string', 'null'] },
          tavernTier: { type: ['integer', 'null'], minimum: 1, maximum: 7 },
          zonePosition: { type: ['integer', 'null'], minimum: 1, maximum: 7 },
          isPremium: { type: ['boolean', 'null'] },
          hasTaunt: { type: ['boolean', 'null'] },
          hasPoison: { type: ['boolean', 'null'] },
          hasDivineShield: { type: ['boolean', 'null'] },
          metrics: {
            type: 'object',
            additionalProperties: false,
            required: ['attack', 'health'],
            properties: {
              attack: { type: ['number', 'null'], minimum: 0 },
              health: { type: ['number', 'null'], minimum: 0 },
            },
          },
        },
      },
      BattlegroundHeroFinalFormMinion: {
        type: 'object',
        additionalProperties: false,
        required: ['cardId', 'dbfId', 'name', 'tavernTier', 'metrics'],
        properties: {
          cardId: { type: ['string', 'null'] },
          dbfId: { type: ['integer', 'null'], minimum: 0 },
          name: { type: ['string', 'null'] },
          tavernTier: { type: ['integer', 'null'], minimum: 1, maximum: 7 },
          metrics: {
            type: 'object',
            additionalProperties: false,
            required: [
              'atLeastOnePercent', 'moreThanOnePercent', 'atLeastOnePremiumPercent',
              'averageNormalAttack', 'averageNormalHealth', 'averagePremiumAttack',
              'averagePremiumHealth', 'divineShieldPercent', 'tauntPercent',
              'poisonPercent', 'positionDistributionPercent',
            ],
            properties: {
              atLeastOnePercent: { type: ['number', 'null'], minimum: 0, maximum: 100 },
              moreThanOnePercent: { type: ['number', 'null'], minimum: 0, maximum: 100 },
              atLeastOnePremiumPercent: { type: ['number', 'null'], minimum: 0, maximum: 100 },
              averageNormalAttack: { type: ['number', 'null'], minimum: 0 },
              averageNormalHealth: { type: ['number', 'null'], minimum: 0 },
              averagePremiumAttack: { type: ['number', 'null'], minimum: 0 },
              averagePremiumHealth: { type: ['number', 'null'], minimum: 0 },
              divineShieldPercent: { type: ['number', 'null'], minimum: 0, maximum: 100 },
              tauntPercent: { type: ['number', 'null'], minimum: 0, maximum: 100 },
              poisonPercent: { type: ['number', 'null'], minimum: 0, maximum: 100 },
              positionDistributionPercent: {
                type: 'array',
                maxItems: 7,
                items: { type: 'number', minimum: 0, maximum: 100 },
              },
            },
          },
        },
      },
      BattlegroundHeroComposition: {
        type: ['object', 'null'],
        additionalProperties: false,
        required: [
          'compositionId', 'name', 'isRecent', 'sampleDays',
          'metrics', 'lineup', 'finalFormMinions',
        ],
        properties: {
          compositionId: { type: ['string', 'null'] },
          name: { type: ['string', 'null'] },
          isRecent: { type: ['boolean', 'null'] },
          sampleDays: { type: ['integer', 'null'], minimum: 0 },
          metrics: {
            type: 'object',
            additionalProperties: false,
            required: [
              'games', 'averagePlacement', 'placementDistributionPercent',
              'confidenceInterval', 'popularityPercent',
              'firstPlacePopularityPercent', 'topFourPopularityPercent',
            ],
            properties: {
              games: { type: ['integer', 'null'], minimum: 0 },
              averagePlacement: { type: ['number', 'null'], minimum: 1, maximum: 8 },
              placementDistributionPercent: {
                type: 'array',
                maxItems: 8,
                items: { type: 'number', minimum: 0, maximum: 100 },
              },
              confidenceInterval: { type: ['number', 'null'], minimum: 0, maximum: 8 },
              popularityPercent: { type: ['number', 'null'], minimum: 0, maximum: 100 },
              firstPlacePopularityPercent: { type: ['number', 'null'], minimum: 0, maximum: 100 },
              topFourPopularityPercent: { type: ['number', 'null'], minimum: 0, maximum: 100 },
            },
          },
          lineup: {
            type: 'array',
            items: { $ref: '#/components/schemas/BattlegroundHeroLineupMinion' },
          },
          finalFormMinions: {
            type: 'array',
            items: { $ref: '#/components/schemas/BattlegroundHeroFinalFormMinion' },
          },
        },
      },
      BattlegroundHeroDetailData: {
        type: 'object',
        additionalProperties: false,
        required: [
          'hero', 'sample', 'asOf', 'tavernUpgrades', 'tavernUpgradeByTurn',
          'heroPowerUsage', 'heroPowerByTurn', 'combatByTurn',
          'compositions', 'bestComposition',
        ],
        properties: {
          hero: { $ref: '#/components/schemas/BattlegroundHeroStatisticsItem' },
          sample: {
            type: 'object',
            additionalProperties: false,
            required: ['mode', 'mmrPercentile', 'timeRange'],
            properties: {
              mode: { type: ['string', 'null'], enum: ['solo', 'duos', null] },
              mmrPercentile: { type: ['string', 'null'] },
              timeRange: { type: ['string', 'null'] },
              totalDataPoints: { type: ['integer', 'null'], minimum: 0 },
            },
          },
          asOf: {
            type: 'object',
            additionalProperties: { type: 'string', format: 'date-time' },
          },
          tavernUpgrades: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['turn', 'tavernTier', 'occurrences', 'percentAtTier', 'games'],
              properties: {
                turn: { type: 'integer', minimum: 0 },
                tavernTier: { type: 'integer', minimum: 1, maximum: 7 },
                occurrences: { type: ['integer', 'null'], minimum: 0 },
                percentAtTier: { type: ['number', 'null'], minimum: 0, maximum: 100 },
                games: { type: ['integer', 'null'], minimum: 0 },
              },
            },
          },
          tavernUpgradeByTurn: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['turn', 'recommendedTavernTier', 'percentAtTier', 'games'],
              properties: {
                turn: { type: 'integer', minimum: 0 },
                recommendedTavernTier: { type: 'integer', minimum: 1, maximum: 7 },
                percentAtTier: { type: ['number', 'null'], minimum: 0, maximum: 100 },
                games: { type: ['integer', 'null'], minimum: 0 },
              },
            },
          },
          heroPowerUsage: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: [
                'turn', 'tavernTier', 'gold', 'medianEndOfRoundTavernTier',
                'invocations', 'invocationRatePercent', 'dataPoints',
              ],
              properties: {
                turn: { type: 'integer', minimum: 0 },
                tavernTier: { type: ['integer', 'null'], minimum: 1, maximum: 7 },
                gold: { type: ['integer', 'null'], minimum: 0 },
                medianEndOfRoundTavernTier: { type: ['number', 'null'], minimum: 1, maximum: 7 },
                invocations: { type: ['integer', 'null'], minimum: 0 },
                invocationRatePercent: { type: ['number', 'null'], minimum: 0, maximum: 100 },
                dataPoints: { type: ['integer', 'null'], minimum: 0 },
              },
            },
          },
          heroPowerByTurn: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['turn', 'invocationRatePercent', 'dataPoints'],
              properties: {
                turn: { type: 'integer', minimum: 0 },
                invocationRatePercent: { type: ['number', 'null'], minimum: 0, maximum: 100 },
                dataPoints: { type: ['integer', 'null'], minimum: 0 },
              },
            },
          },
          combatByTurn: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['turn', 'dataPoints', 'winratePercent'],
              properties: {
                turn: { type: 'integer', minimum: 0 },
                dataPoints: { type: ['integer', 'null'], minimum: 0 },
                winratePercent: { type: ['number', 'null'], minimum: 0, maximum: 100 },
              },
            },
          },
          compositions: {
            type: 'array',
            items: { $ref: '#/components/schemas/BattlegroundHeroComposition' },
          },
          bestComposition: { $ref: '#/components/schemas/BattlegroundHeroComposition' },
        },
      },
      BattlegroundHeroStatisticsResponse: {
        type: 'object',
        additionalProperties: false,
        required: ['data', 'pagination', 'meta'],
        properties: {
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/BattlegroundHeroStatisticsItem' },
          },
          pagination: { $ref: '#/components/schemas/StatisticsPagination' },
          meta: { $ref: '#/components/schemas/BattlegroundStatisticsMeta' },
        },
      },
      BattlegroundMinionStatisticsResponse: {
        type: 'object',
        additionalProperties: false,
        required: ['data', 'pagination', 'meta'],
        properties: {
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/BattlegroundMinionStatisticsItem' },
          },
          pagination: { $ref: '#/components/schemas/StatisticsPagination' },
          meta: { $ref: '#/components/schemas/BattlegroundStatisticsMeta' },
        },
      },
      BattlegroundHeroDetailResponse: {
        type: 'object',
        additionalProperties: false,
        required: ['data', 'meta'],
        properties: {
          data: { $ref: '#/components/schemas/BattlegroundHeroDetailData' },
          meta: { $ref: '#/components/schemas/BattlegroundStatisticsMeta' },
        },
      },
      BattlegroundMinionHistoryResponse: {
        type: 'object',
        additionalProperties: false,
        required: ['data', 'meta'],
        properties: {
          data: {
            type: 'object',
            additionalProperties: false,
            required: ['minion', 'history'],
            properties: {
              minion: {
                type: 'object',
                additionalProperties: false,
                required: [
                  'dbfId', 'cardId', 'name', 'localizedName', 'tavernTier',
                  'firstSeenAt', 'updatedAt',
                ],
                properties: {
                  dbfId: { type: ['integer', 'null'], minimum: 0 },
                  cardId: { type: 'string' },
                  name: { type: 'string' },
                  localizedName: { type: ['string', 'null'] },
                  tavernTier: { type: ['integer', 'null'], minimum: 1, maximum: 7 },
                  firstSeenAt: { type: ['string', 'null'], format: 'date-time' },
                  updatedAt: { type: ['string', 'null'], format: 'date-time' },
                },
              },
              history: {
                type: 'array',
                items: { $ref: '#/components/schemas/BattlegroundMinionHistoryPoint' },
              },
            },
          },
          meta: { $ref: '#/components/schemas/BattlegroundStatisticsMeta' },
        },
      },
      BattlegroundSpellStatisticsResponse: {
        type: 'object',
        additionalProperties: false,
        required: ['data', 'pagination', 'meta'],
        properties: {
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/BattlegroundSpellStatisticsItem' },
          },
          pagination: { $ref: '#/components/schemas/StatisticsPagination' },
          meta: { $ref: '#/components/schemas/BattlegroundStatisticsMeta' },
        },
      },
      BattlegroundTierListStatisticsResponse: {
        type: 'object',
        additionalProperties: false,
        required: ['data', 'pagination', 'meta'],
        properties: {
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/BattlegroundTierListStatisticsItem' },
          },
          pagination: { $ref: '#/components/schemas/StatisticsPagination' },
          meta: { $ref: '#/components/schemas/BattlegroundStatisticsMeta' },
        },
      },
      Error: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    responses: {
      InvalidApiKey: {
        description: 'API key is missing, unknown or revoked',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      InvalidCredential: {
        description: 'API key or application bearer token is missing, invalid, revoked or expired',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      InsufficientScope: {
        description: 'The credential does not grant the required scope',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      InvalidBearerToken: {
        description: 'Bearer token is missing, unknown, revoked or expired',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
    },
  },
} as const;
