import { randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { parsePatreonProfile, type PatreonAuthorization } from './patreonOAuth.js';

export type PatreonAccountUser = {
  id: string; email: string; name: string; role: 'admin' | 'user'; country?: string; newsletterOptIn?: boolean;
  avatarInitials?: string; photoUrl?: string; passwordHash: string; createdAt: string; updatedAt: string; blockedAt?: string;
};
type Store = { users: PatreonAccountUser[]; sessions: unknown[]; updatedAt: string };

export function provisionPatreonAccount(input: {
  authorization: PatreonAuthorization;
  database: () => DatabaseSync;
  loadStore: () => Store;
  saveStore: (store: Store) => void;
  createSession: (store: Store, user: PatreonAccountUser) => string;
  identityOwner: (provider: string, subject: string) => { user_id: string } | undefined;
  sha256: (value: string) => string;
  hashSecret: (value: string) => string;
}): { user: PatreonAccountUser; token: string } | null {
  const profile = parsePatreonProfile(input.authorization.identity);
  if (!profile) return null;
  const database = input.database();
  const identityProvider = 'patreon_oauth';
  const now = new Date().toISOString();
  let store = input.loadStore();
  const owner = input.identityOwner(identityProvider, profile.subject);
  const connected = database.prepare('SELECT user_id FROM patreon_connections WHERE patreon_user_id = ? LIMIT 1').get(profile.subject) as { user_id: string } | undefined;
  if (owner?.user_id && connected?.user_id && owner.user_id !== connected.user_id) throw new Error('Patreon identity has conflicting account links');
  const existingUserId = connected?.user_id || owner?.user_id || '';
  let user = existingUserId ? store.users.find(candidate => candidate.id === existingUserId) : undefined;
  let created = false;
  if (!user) {
    const suffix = input.sha256(`patreon:${profile.subject}`).slice(0, 20);
    user = { id: `patreon_${suffix}`, email: `patreon_${suffix}@social.local`, name: profile.name, role: 'user', country: '', newsletterOptIn: false, avatarInitials: profile.name.slice(0, 2).toUpperCase(), photoUrl: profile.photoUrl, passwordHash: input.hashSecret(randomBytes(24).toString('hex')), createdAt: now, updatedAt: now };
    store.users.push(user);
    created = true;
  } else {
    user.name = user.name || profile.name;
    user.photoUrl = profile.photoUrl || user.photoUrl;
    user.updatedAt = now;
  }
  if (created) {
    const newUserId = user.id;
    input.saveStore(store);
    store = input.loadStore();
    user = store.users.find(candidate => candidate.id === newUserId);
    if (!user) throw new Error('Patreon account could not be persisted');
  }
  const result = database.prepare(`INSERT INTO identities (user_id, provider, provider_user_id, email, username, photo_url, verified_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider, provider_user_id) DO UPDATE SET username = excluded.username, photo_url = excluded.photo_url, updated_at = excluded.updated_at
    WHERE identities.user_id = excluded.user_id`).run(user.id, identityProvider, profile.subject, '', profile.username, profile.photoUrl, now, now, now);
  if (result.changes !== 1) throw new Error('Patreon identity is already linked');
  const token = input.createSession(store, user);
  input.saveStore(store);
  return { user, token };
}
