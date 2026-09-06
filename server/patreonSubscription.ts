import type { DatabaseSync } from 'node:sqlite';
import {
  fetchPatreonIdentity,
  parsePatreonMembership,
  patreonIdentityUserId,
  refreshPatreonAuthorization,
  type PatreonAuthorization,
  type PatreonClient,
} from './patreonOAuth.js';

type User = { id: string };
type Cipher = { encrypt(value: string): string; decrypt(value: string): string | null };
type Connection = { user_id: string; patreon_user_id: string; access_token_ciphertext: string; refresh_token_ciphertext: string; token_expires_at: number };

export function createPatreonSubscriptionService(input: {
  database: () => DatabaseSync;
  client: PatreonClient | null;
  campaignId: string;
  fullAccessTierIds: readonly string[];
  cipher: Cipher | null;
  allEntitlements: () => Record<string, boolean>;
  emptyEntitlements: () => Record<string, boolean>;
}) {
  const connectionFor = (userId: string) => input.database().prepare(`SELECT user_id, patreon_user_id, access_token_ciphertext, refresh_token_ciphertext, token_expires_at FROM patreon_connections WHERE user_id = ? LIMIT 1`).get(userId) as Connection | undefined;
  const saveTokens = (userId: string, token: { accessToken: string; refreshToken: string; expiresAt: number }) => {
    if (!input.cipher) return;
    input.database().prepare('UPDATE patreon_connections SET access_token_ciphertext = ?, refresh_token_ciphertext = ?, token_expires_at = ?, updated_at = ? WHERE user_id = ?').run(input.cipher.encrypt(token.accessToken), input.cipher.encrypt(token.refreshToken), token.expiresAt, new Date().toISOString(), userId);
  };
  return {
    saveAuthorization(user: User, authorization: PatreonAuthorization) {
      if (!input.cipher) throw new Error('Patreon OAuth is not configured');
      const patreonUserId = patreonIdentityUserId(authorization.identity);
      if (!patreonUserId) throw new Error('Patreon did not return a stable account identifier');
      const database = input.database();
      const existing = database.prepare('SELECT user_id FROM patreon_connections WHERE patreon_user_id = ? LIMIT 1').get(patreonUserId) as { user_id: string } | undefined;
      if (existing && existing.user_id !== user.id) throw new Error('Patreon account already linked');
      const now = new Date().toISOString();
      database.prepare(`INSERT INTO patreon_connections (user_id, patreon_user_id, access_token_ciphertext, refresh_token_ciphertext, token_expires_at, connected_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET patreon_user_id = excluded.patreon_user_id, access_token_ciphertext = excluded.access_token_ciphertext, refresh_token_ciphertext = excluded.refresh_token_ciphertext, token_expires_at = excluded.token_expires_at, updated_at = excluded.updated_at`).run(user.id, patreonUserId, input.cipher.encrypt(authorization.token.accessToken), input.cipher.encrypt(authorization.token.refreshToken), authorization.token.expiresAt, now, now);
    },
    async checkSubscription(user: User): Promise<Record<string, unknown>> {
      if (!input.client || !input.cipher) return { configured: false, connected: false, checked: false, hasAccess: false, entitlements: input.emptyEntitlements(), message: 'Patreon пока не настроен.' };
      const connection = connectionFor(user.id);
      if (!connection) return { configured: true, connected: false, checked: false, hasAccess: false, entitlements: input.emptyEntitlements(), message: 'Привяжите Patreon, чтобы проверить уровень подписки.' };
      try {
        let accessToken = input.cipher.decrypt(connection.access_token_ciphertext);
        const refreshToken = input.cipher.decrypt(connection.refresh_token_ciphertext);
        if (!accessToken || !refreshToken) throw new Error('saved token cannot be decrypted');
        if (connection.token_expires_at <= Date.now()) {
          const refreshed = await refreshPatreonAuthorization({ client: input.client, refreshToken });
          if (!refreshed) throw new Error('token refresh failed');
          saveTokens(user.id, refreshed);
          accessToken = refreshed.accessToken;
        }
        const identity = await fetchPatreonIdentity(accessToken);
        if (!identity || patreonIdentityUserId(identity) !== connection.patreon_user_id) throw new Error('Patreon identity request failed');
        const membership = parsePatreonMembership(identity, { campaignId: input.campaignId, fullAccessTierIds: input.fullAccessTierIds });
        const hasAccess = Boolean(membership?.eligible);
        return { configured: true, connected: true, checked: true, hasAccess, tierTitles: membership?.tierTitles ?? [], highestTierAmountCents: membership?.highestTierAmountCents ?? 0, entitlements: hasAccess ? input.allEntitlements() : input.emptyEntitlements(), message: hasAccess ? 'Patreon-подписка уровня «Алмаз» или выше подтверждена.' : 'Активный уровень Patreon «Алмаз» или выше не найден.' };
      } catch (error: unknown) {
        console.warn(`[subscription] Patreon check failed user=${user.id}:`, error instanceof Error ? error.message : error);
        return { configured: true, connected: true, checked: false, stale: true, providerUnavailable: true, hasAccess: false, entitlements: input.emptyEntitlements(), message: 'Patreon временно недоступен. Доступ будет проверен при следующем обновлении.' };
      }
    },
  };
}
