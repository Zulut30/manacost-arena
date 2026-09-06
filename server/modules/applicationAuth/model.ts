import { createHash, randomBytes } from 'node:crypto';

export const APPLICATION_AUTH_SCOPES = [
  'profile.read',
  'subscription.read',
  'catalog.read',
  'images.read',
  'statistics.read',
  'tracker.write',
  'tracker.read',
] as const;

export type ApplicationAuthScope = typeof APPLICATION_AUTH_SCOPES[number];
export type ApplicationAuthClient = {
  id: string;
  name: string;
  scopes: ApplicationAuthScope[];
};

export type ApplicationDeviceAuthorization = {
  deviceCodeHash: string;
  userCodeHash: string;
  clientId: string;
  scopes: ApplicationAuthScope[];
  status: 'PENDING' | 'APPROVED' | 'DENIED' | 'CONSUMED';
  userId: string | null;
  createdAt: number;
  expiresAt: number;
  intervalSeconds: number;
  lastPolledAt: number | null;
  approvedAt: number | null;
  deniedAt: number | null;
  consumedAt: number | null;
};

export type ApplicationToken = {
  id: string;
  familyId: string;
  clientId: string;
  userId: string;
  scopes: ApplicationAuthScope[];
  accessTokenHash: string;
  refreshTokenHash: string;
  accessExpiresAt: number;
  refreshExpiresAt: number;
  createdAt: number;
  revokedAt: number | null;
  replacedById: string | null;
};

export type ApplicationAuthRepository = {
  insertDevice: (record: ApplicationDeviceAuthorization) => boolean;
  findDeviceByHash: (hash: string) => ApplicationDeviceAuthorization | null;
  findDeviceByUserCodeHash: (hash: string) => ApplicationDeviceAuthorization | null;
  approveDevice: (hash: string, userId: string, approvedAt: number) => boolean;
  denyDevice: (hash: string, deniedAt: number) => boolean;
  recordDevicePoll: (hash: string, polledAt: number, intervalSeconds: number) => boolean;
  issueDeviceTokens: (
    hash: string,
    token: ApplicationToken,
    consumedAt: number,
  ) => boolean;
  findTokenByAccessHash: (hash: string) => ApplicationToken | null;
  findTokenByRefreshHash: (hash: string) => ApplicationToken | null;
  rotateRefreshToken: (
    oldRefreshHash: string,
    next: ApplicationToken,
    revokedAt: number,
  ) => boolean;
  revokeTokenFamily: (familyId: string, revokedAt: number) => void;
  revokeByRefreshHash: (hash: string, revokedAt: number) => boolean;
};

type ApplicationAuthManagerDependencies = {
  repository: ApplicationAuthRepository;
  clients: ApplicationAuthClient[];
  verificationUri: string;
  now?: () => number;
  randomId?: (prefix: string) => string;
  randomSecret?: (prefix: string) => string;
  randomUserCode?: () => string;
};

type TokenPair = {
  ok: true;
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  scope: string;
};

type TokenError = {
  ok: false;
  error: 'authorization_pending' | 'slow_down' | 'access_denied' | 'expired_token' | 'invalid_grant';
};

export type ApplicationAuthManager = {
  begin: (input: { clientId: unknown; scope: unknown }) => {
    deviceCode: string;
    userCode: string;
    verificationUri: string;
    verificationUriComplete: string;
    expiresIn: number;
    interval: number;
  };
  approve: (input: { userCode: unknown; userId: string }) => boolean;
  deny: (input: { userCode: unknown }) => boolean;
  inspect: (userCode: unknown) => {
    clientId: string;
    clientName: string;
    scopes: ApplicationAuthScope[];
    expiresAt: number;
  } | null;
  exchangeDevice: (input: { clientId: unknown; deviceCode: unknown }) => TokenPair | TokenError;
  refresh: (input: { clientId: unknown; refreshToken: unknown }) => TokenPair | TokenError;
  authenticate: (
    accessToken: unknown,
    requiredScopes: readonly ApplicationAuthScope[],
  ) => ApplicationToken | null | 'FORBIDDEN';
  revoke: (refreshToken: unknown) => boolean;
};

export class ApplicationAuthValidationError extends Error {
  constructor() {
    super('Invalid application authorization request');
    this.name = 'ApplicationAuthValidationError';
  }
}

const DEVICE_TTL_MS = 10 * 60_000;
const ACCESS_TTL_MS = 15 * 60_000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60_000;
const INITIAL_POLL_INTERVAL_SECONDS = 5;
const USER_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

function normalizeUserCode(value: unknown): string {
  const compact = String(value ?? '').toUpperCase().replace(/[^A-Z2-9]/g, '');
  return compact.length === 8 ? `${compact.slice(0, 4)}-${compact.slice(4)}` : '';
}

function defaultUserCode(): string {
  const bytes = randomBytes(8);
  const value = [...bytes].map(byte => USER_CODE_ALPHABET[byte % USER_CODE_ALPHABET.length]).join('');
  return `${value.slice(0, 4)}-${value.slice(4)}`;
}

function parseScopes(value: unknown): ApplicationAuthScope[] {
  const requested = String(value ?? '').trim().split(/\s+/).filter(Boolean);
  if (!requested.length) return ['profile.read', 'subscription.read'];
  const unique = [...new Set(requested)] as ApplicationAuthScope[];
  if (unique.some(scope => !APPLICATION_AUTH_SCOPES.includes(scope))) {
    throw new ApplicationAuthValidationError();
  }
  return unique;
}

function tokenValue(value: unknown, prefix: string): string {
  const token = String(value ?? '').trim();
  return token.startsWith(prefix) && token.length >= prefix.length + 32 ? token : '';
}

/**
 * Implements the protocol state machine independently from HTTP and SQLite.
 * All bearer credentials leave this boundary only as one-time return values.
 */
export function createApplicationAuthManager(
  dependencies: ApplicationAuthManagerDependencies,
): ApplicationAuthManager {
  const clients = new Map(dependencies.clients.map(client => [client.id, client]));
  const now = dependencies.now ?? Date.now;
  const randomId = dependencies.randomId
    ?? (prefix => `${prefix}_${randomBytes(12).toString('hex')}`);
  const randomSecret = dependencies.randomSecret
    ?? (prefix => `${prefix}_${randomBytes(32).toString('base64url')}`);
  const randomUserCode = dependencies.randomUserCode ?? defaultUserCode;

  const resolveClientAndScopes = (clientIdValue: unknown, scopeValue: unknown) => {
    const clientId = String(clientIdValue ?? '').trim();
    const client = clients.get(clientId);
    if (!client) throw new ApplicationAuthValidationError();
    const scopes = parseScopes(scopeValue);
    if (scopes.some(scope => !client.scopes.includes(scope))) {
      throw new ApplicationAuthValidationError();
    }
    return { client, scopes };
  };

  const issueTokenRecord = (
    clientId: string,
    userId: string,
    scopes: ApplicationAuthScope[],
    familyId: string,
    refreshExpiresAt: number,
  ) => {
    const createdAt = now();
    const accessToken = randomSecret('mca_access');
    const refreshToken = randomSecret('mca_refresh');
    const record: ApplicationToken = {
      id: randomId('app_token'),
      familyId,
      clientId,
      userId,
      scopes: [...scopes],
      accessTokenHash: digest(accessToken),
      refreshTokenHash: digest(refreshToken),
      accessExpiresAt: createdAt + ACCESS_TTL_MS,
      refreshExpiresAt,
      createdAt,
      revokedAt: null,
      replacedById: null,
    };
    return { accessToken, refreshToken, record };
  };

  const pairFrom = (accessToken: string, refreshToken: string, record: ApplicationToken): TokenPair => ({
    ok: true,
    accessToken,
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: Math.floor((record.accessExpiresAt - record.createdAt) / 1_000),
    scope: record.scopes.join(' '),
  });

  return {
    begin(input) {
      const { client, scopes } = resolveClientAndScopes(input.clientId, input.scope);
      const createdAt = now();
      let deviceCode = '';
      let userCode = '';
      for (let attempt = 0; attempt < 5; attempt += 1) {
        deviceCode = randomSecret('mca_device');
        userCode = normalizeUserCode(randomUserCode());
        if (!userCode) throw new ApplicationAuthValidationError();
        const inserted = dependencies.repository.insertDevice({
          deviceCodeHash: digest(deviceCode),
          userCodeHash: digest(userCode),
          clientId: client.id,
          scopes,
          status: 'PENDING',
          userId: null,
          createdAt,
          expiresAt: createdAt + DEVICE_TTL_MS,
          intervalSeconds: INITIAL_POLL_INTERVAL_SECONDS,
          lastPolledAt: null,
          approvedAt: null,
          deniedAt: null,
          consumedAt: null,
        });
        if (inserted) break;
        deviceCode = '';
        userCode = '';
      }
      if (!deviceCode || !userCode) throw new Error('Could not allocate application authorization');
      const verificationUriComplete = new URL(dependencies.verificationUri);
      verificationUriComplete.searchParams.set('user_code', userCode);
      return {
        deviceCode,
        userCode,
        verificationUri: dependencies.verificationUri,
        verificationUriComplete: verificationUriComplete.toString(),
        expiresIn: Math.floor(DEVICE_TTL_MS / 1_000),
        interval: INITIAL_POLL_INTERVAL_SECONDS,
      };
    },

    approve(input) {
      const userCode = normalizeUserCode(input.userCode);
      if (!userCode || !input.userId) return false;
      const record = dependencies.repository.findDeviceByUserCodeHash(digest(userCode));
      if (!record || record.expiresAt <= now()) return false;
      return dependencies.repository.approveDevice(record.deviceCodeHash, input.userId, now());
    },

    deny(input) {
      const userCode = normalizeUserCode(input.userCode);
      if (!userCode) return false;
      const record = dependencies.repository.findDeviceByUserCodeHash(digest(userCode));
      if (!record || record.expiresAt <= now()) return false;
      return dependencies.repository.denyDevice(record.deviceCodeHash, now());
    },

    inspect(userCodeValue) {
      const userCode = normalizeUserCode(userCodeValue);
      if (!userCode) return null;
      const record = dependencies.repository.findDeviceByUserCodeHash(digest(userCode));
      const client = record ? clients.get(record.clientId) : null;
      if (
        !record
        || !client
        || record.status !== 'PENDING'
        || record.expiresAt <= now()
      ) {
        return null;
      }
      return {
        clientId: client.id,
        clientName: client.name,
        scopes: [...record.scopes],
        expiresAt: record.expiresAt,
      };
    },

    exchangeDevice(input) {
      const clientId = String(input.clientId ?? '').trim();
      const deviceCode = tokenValue(input.deviceCode, 'mca_device_');
      if (!clients.has(clientId) || !deviceCode) return { ok: false, error: 'invalid_grant' };
      const hash = digest(deviceCode);
      const record = dependencies.repository.findDeviceByHash(hash);
      if (!record || record.clientId !== clientId) return { ok: false, error: 'invalid_grant' };
      const currentTime = now();
      if (record.expiresAt <= currentTime) return { ok: false, error: 'expired_token' };
      if (record.status === 'DENIED') return { ok: false, error: 'access_denied' };
      if (record.status === 'CONSUMED') return { ok: false, error: 'invalid_grant' };
      if (record.status === 'PENDING') {
        if (
          record.lastPolledAt !== null
          && currentTime - record.lastPolledAt < record.intervalSeconds * 1_000
        ) {
          dependencies.repository.recordDevicePoll(
            hash,
            currentTime,
            record.intervalSeconds + 5,
          );
          return { ok: false, error: 'slow_down' };
        }
        dependencies.repository.recordDevicePoll(hash, currentTime, record.intervalSeconds);
        return { ok: false, error: 'authorization_pending' };
      }
      if (!record.userId) return { ok: false, error: 'invalid_grant' };

      const issued = issueTokenRecord(
        record.clientId,
        record.userId,
        record.scopes,
        randomId('app_family'),
        currentTime + REFRESH_TTL_MS,
      );
      const stored = dependencies.repository.issueDeviceTokens(hash, issued.record, currentTime);
      return stored
        ? pairFrom(issued.accessToken, issued.refreshToken, issued.record)
        : { ok: false, error: 'invalid_grant' };
    },

    refresh(input) {
      const clientId = String(input.clientId ?? '').trim();
      const refreshToken = tokenValue(input.refreshToken, 'mca_refresh_');
      if (!clients.has(clientId) || !refreshToken) return { ok: false, error: 'invalid_grant' };
      const refreshHash = digest(refreshToken);
      const previous = dependencies.repository.findTokenByRefreshHash(refreshHash);
      const currentTime = now();
      if (!previous || previous.clientId !== clientId) return { ok: false, error: 'invalid_grant' };
      if (previous.revokedAt !== null) {
        dependencies.repository.revokeTokenFamily(previous.familyId, currentTime);
        return { ok: false, error: 'invalid_grant' };
      }
      if (previous.refreshExpiresAt <= currentTime) {
        dependencies.repository.revokeTokenFamily(previous.familyId, currentTime);
        return { ok: false, error: 'invalid_grant' };
      }
      const next = issueTokenRecord(
        previous.clientId,
        previous.userId,
        previous.scopes,
        previous.familyId,
        previous.refreshExpiresAt,
      );
      const rotated = dependencies.repository.rotateRefreshToken(
        refreshHash,
        next.record,
        currentTime,
      );
      if (!rotated) {
        dependencies.repository.revokeTokenFamily(previous.familyId, currentTime);
        return { ok: false, error: 'invalid_grant' };
      }
      return pairFrom(next.accessToken, next.refreshToken, next.record);
    },

    authenticate(accessTokenValue, requiredScopes) {
      const accessToken = tokenValue(accessTokenValue, 'mca_access_');
      if (!accessToken) return null;
      const record = dependencies.repository.findTokenByAccessHash(digest(accessToken));
      if (!record || record.revokedAt || record.accessExpiresAt <= now()) return null;
      if (requiredScopes.some(scope => !record.scopes.includes(scope))) return 'FORBIDDEN';
      return record;
    },

    revoke(refreshTokenValue) {
      const refreshToken = tokenValue(refreshTokenValue, 'mca_refresh_');
      return refreshToken
        ? dependencies.repository.revokeByRefreshHash(digest(refreshToken), now())
        : false;
    },
  };
}
