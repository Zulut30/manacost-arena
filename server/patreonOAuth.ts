import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const PATREON_ORIGIN = 'https://www.patreon.com';
const PATREON_TOKEN_ENDPOINT = `${PATREON_ORIGIN}/api/oauth2/token`;
const PATREON_IDENTITY_ENDPOINT = `${PATREON_ORIGIN}/api/oauth2/v2/identity`;
const TOKEN_CIPHER_VERSION = 'v1';
const PATREON_REQUEST_TIMEOUT_MS = 12_000;

export const PATREON_OAUTH_SCOPE = 'identity identity.memberships';

export type PatreonClient = {
  clientId: string;
  clientSecret: string;
};

export type PatreonTokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

export type PatreonAuthorization = {
  token: PatreonTokenSet;
  identity: unknown;
};

export type PatreonProfile = {
  subject: string;
  name: string;
  username: string;
  photoUrl: string;
};

export type PatreonMembership = {
  userId: string;
  memberId: string;
  active: boolean;
  eligible: boolean;
  tierTitles: string[];
  highestTierAmountCents: number;
};

export function patreonIdentityUserId(payload: unknown): string {
  return text(object(object(payload)?.data)?.id, 200);
}

export function parsePatreonProfile(payload: unknown): PatreonProfile | null {
  const user = object(object(payload)?.data);
  const subject = text(user?.id, 200);
  if (!subject) return null;
  const attributes = object(user?.attributes);
  const username = text(attributes?.vanity, 120);
  return {
    subject,
    name: text(attributes?.full_name, 120) || username || `Patreon ${subject}`,
    username,
    photoUrl: text(attributes?.image_url, 1_000),
  };
}

type PatreonTokenResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
};

function text(value: unknown, maximum = 2_000): string {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maximum)
    : '';
}

function positiveInteger(value: unknown): number {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : 0;
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function relationshipIds(value: unknown): string[] {
  const relation = object(value);
  const data = relation?.data;
  const records = Array.isArray(data) ? data : data ? [data] : [];
  return records.flatMap(record => {
    const candidate = object(record);
    const id = text(candidate?.id, 200);
    return id ? [id] : [];
  });
}

export function createPatreonAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL('/oauth2/authorize', PATREON_ORIGIN);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    scope: PATREON_OAUTH_SCOPE,
    state: input.state,
  }).toString();
  return url.toString();
}

async function requestToken(
  body: URLSearchParams,
  fetchImpl: typeof fetch,
): Promise<PatreonTokenSet | null> {
  const response = await fetchImpl(PATREON_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(PATREON_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null) as PatreonTokenResponse | null;
  const accessToken = text(payload?.access_token, 8_000);
  const refreshToken = text(payload?.refresh_token, 8_000);
  const expiresInSeconds = positiveInteger(payload?.expires_in);
  if (!accessToken || !refreshToken || !expiresInSeconds) return null;
  return {
    accessToken,
    refreshToken,
    // Refresh one minute before the provider expiry; never persist an already-expired value.
    expiresAt: Date.now() + Math.max(60, expiresInSeconds - 60) * 1_000,
  };
}

export async function exchangePatreonAuthorizationCode(input: {
  client: PatreonClient;
  code: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
}): Promise<PatreonAuthorization | null> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const token = await requestToken(new URLSearchParams({
    grant_type: 'authorization_code',
    code: input.code,
    client_id: input.client.clientId,
    client_secret: input.client.clientSecret,
    redirect_uri: input.redirectUri,
  }), fetchImpl);
  if (!token) return null;
  const identity = await fetchPatreonIdentity(token.accessToken, fetchImpl);
  return identity ? { token, identity } : null;
}

export async function refreshPatreonAuthorization(input: {
  client: PatreonClient;
  refreshToken: string;
  fetchImpl?: typeof fetch;
}): Promise<PatreonTokenSet | null> {
  return requestToken(new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: input.refreshToken,
    client_id: input.client.clientId,
    client_secret: input.client.clientSecret,
  }), input.fetchImpl ?? fetch);
}

export async function fetchPatreonIdentity(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<unknown | null> {
  const url = new URL(PATREON_IDENTITY_ENDPOINT);
  url.search = new URLSearchParams({
    include: 'memberships.campaign,memberships.currently_entitled_tiers',
    'fields[user]': 'full_name,vanity,image_url',
    'fields[member]': 'patron_status,currently_entitled_amount_cents',
    'fields[tier]': 'title,amount_cents',
  }).toString();
  const response = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(PATREON_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

/**
 * Membership is deliberately accepted only when its campaign relationship is
 * present and matches the configured creator campaign. A Patreon account can
 * support several creators, none of which must grant HearthPulse access.
 */
export function parsePatreonMembership(
  payload: unknown,
  configuration: { campaignId: string; fullAccessTierIds: readonly string[] },
): PatreonMembership | null {
  const root = object(payload);
  const user = object(root?.data);
  const userId = patreonIdentityUserId(payload);
  const fullAccessTierIds = new Set(configuration.fullAccessTierIds.map(id => text(id, 200)).filter(Boolean));
  if (!userId || !configuration.campaignId || !fullAccessTierIds.size) return null;

  const included = Array.isArray(root?.included) ? root?.included : [];
  const resources = included.map(object).filter((value): value is Record<string, unknown> => Boolean(value));
  const tiers = new Map(resources.filter(resource => resource.type === 'tier').map(resource => [text(resource.id, 200), {
    title: text(object(resource.attributes)?.title, 240), amountCents: positiveInteger(object(resource.attributes)?.amount_cents),
  }]));

  for (const member of resources.filter(resource => resource.type === 'member')) {
    const relations = object(member.relationships);
    const campaignId = relationshipIds(relations?.campaign)[0] || '';
    if (campaignId !== configuration.campaignId) continue;
    const attributes = object(member.attributes);
    const tierIds = relationshipIds(relations?.currently_entitled_tiers);
    const entitledTiers = tierIds.map(id => tiers.get(id)).filter((tier): tier is { title: string; amountCents: number } => Boolean(tier));
    const highestTierAmountCents = entitledTiers.reduce((maximum, tier) => Math.max(maximum, tier.amountCents), 0);
    const active = text(attributes?.patron_status, 80) === 'active_patron';
    return {
      userId,
      memberId: text(member.id, 200),
      active,
      eligible: active && tierIds.some(id => fullAccessTierIds.has(id)),
      tierTitles: entitledTiers.map(tier => tier.title).filter(Boolean),
      highestTierAmountCents,
    };
  }
  return null;
}

export function createPatreonTokenCipher(secret: string): { encrypt: (value: string) => string; decrypt: (value: string) => string | null } {
  if (secret.trim().length < 32) throw new Error('Patreon token encryption key must contain at least 32 characters');
  const key = createHash('sha256').update(secret).digest();
  return {
    encrypt(value) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return [TOKEN_CIPHER_VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
    },
    decrypt(value) {
      const [version, ivText, tagText, encryptedText, ...rest] = value.split('.');
      if (version !== TOKEN_CIPHER_VERSION || !ivText || !tagText || !encryptedText || rest.length) return null;
      try {
        const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64url'), { authTagLength: 16 });
        decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
        return Buffer.concat([decipher.update(Buffer.from(encryptedText, 'base64url')), decipher.final()]).toString('utf8');
      } catch {
        return null;
      }
    },
  };
}
