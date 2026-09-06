import assert from 'node:assert/strict';
// @ts-ignore: available in the production Node runtime.
import { DatabaseSync } from 'node:sqlite';
import { provisionPatreonAccount, type PatreonAccountUser } from '../server/patreonAccount.js';

const database = new DatabaseSync(':memory:');
database.exec(`PRAGMA foreign_keys = ON;
  CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, name TEXT, role TEXT, country TEXT, newsletter_opt_in INTEGER, avatar_initials TEXT, photo_url TEXT, password_hash TEXT, created_at TEXT, updated_at TEXT, blocked_at TEXT);
  CREATE TABLE identities (user_id TEXT NOT NULL, provider TEXT NOT NULL, provider_user_id TEXT NOT NULL, email TEXT, username TEXT, photo_url TEXT, verified_at TEXT, created_at TEXT, updated_at TEXT, UNIQUE(provider, provider_user_id), FOREIGN KEY(user_id) REFERENCES users(id));
  CREATE TABLE patreon_connections (user_id TEXT PRIMARY KEY, patreon_user_id TEXT UNIQUE NOT NULL);`);
let users: PatreonAccountUser[] = [];
const loadStore = () => ({ users: users.map(user => ({ ...user })), sessions: [], updatedAt: '' });
const saveStore = (store: { users: PatreonAccountUser[] }) => {
  users = store.users.map(user => ({ ...user }));
  for (const user of users) database.prepare(`INSERT OR REPLACE INTO users (id,email,name,role,country,newsletter_opt_in,avatar_initials,photo_url,password_hash,created_at,updated_at,blocked_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(user.id, user.email, user.name, user.role, user.country || '', user.newsletterOptIn ? 1 : 0, user.avatarInitials || '', user.photoUrl || '', user.passwordHash, user.createdAt, user.updatedAt, user.blockedAt || null);
};
const authorization = (subject: string) => ({ token: { accessToken: 'a', refreshToken: 'r', expiresAt: 1 }, identity: { data: { id: subject, attributes: { full_name: 'Patreon User', vanity: 'patron' } } } });
const provision = (value = 'patron-1') => provisionPatreonAccount({ authorization: authorization(value), database: () => database, loadStore, saveStore, createSession: (_store, user) => `session-${user.id}`, identityOwner: (provider, subject) => database.prepare('SELECT user_id FROM identities WHERE provider = ? AND provider_user_id = ?').get(provider, subject) as { user_id: string } | undefined, sha256: value => `hash-${value}`, hashSecret: () => 'hash' });

const created = provision();
assert.ok(created);
const identityCount = database.prepare('SELECT count(*) AS count FROM identities').get() as { count: number };
assert.equal(identityCount.count, 1);
assert.equal(created.user.id, 'patreon_hash-patreon:patron-');

const original = { ...created.user, id: 'existing-user', email: 'existing@example.test' };
users = [original];
saveStore({ users });
database.prepare('INSERT INTO patreon_connections (user_id, patreon_user_id) VALUES (?, ?)').run(original.id, 'patron-2');
const restored = provision('patron-2');
assert.equal(restored?.user.id, 'existing-user', 'a linked Patreon identity must restore its original account');

console.log('Patreon account provisioning regressions passed');
