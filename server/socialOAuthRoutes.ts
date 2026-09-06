import type { Express, NextFunction, Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { decodeSignedStateCookie, encodeSignedStateCookie, safeAuthReturnTo } from './authRedirect.js';
import { SOCIAL_PROVIDERS, createSocialAuthorizationUrl, fetchSocialProfile, isSocialProvider, type SocialProfile, type SocialProvider } from './socialOAuth.js';

const STATE_TTL_MS = 10 * 60 * 1000;
type State = { state: string; codeVerifier: string; returnTo: string; linkUserId: string; expiresAt: number };
type CookieValue = { states?: unknown } & Partial<State>;
type AuthUser = {
  id: string; publicProfileId?: string; email: string; name: string; role: 'admin' | 'user'; country?: string; newsletterOptIn?: boolean;
  avatarInitials?: string; telegramId?: string; telegramUsername?: string; photoUrl?: string; contactVkUrl?: string; contactTelegram?: string;
  contactEmail?: string; blockedAt?: string; passwordHash: string; createdAt: string; updatedAt: string;
};
type AuthStore = {
  users: AuthUser[];
  pendingCodes: { email: string; codeHash: string; expiresAt: number; attempts: number }[];
  sessions: { tokenHash: string; userId?: string; email: string; expiresAt: number; createdAt: string }[];
  updatedAt: string;
};

type Dependencies = {
  appUrl: string;
  cookieValue: (request: Request, name: string) => string;
  cookieSecure: (request: Request) => boolean;
  cookieDomain: (request: Request) => string;
  setPrivateNoStore: (response: Response) => void;
  userAuth: (request: Request) => { id: string } | null;
  setAuthCookie: (request: Request, response: Response, token: string) => void;
  loadAuthStore: () => AuthStore;
  saveAuthStore: (store: AuthStore) => void;
  createAuthSession: (store: AuthStore, user: AuthUser) => string;
  identityOwner: (provider: string, providerUserId: string) => { user_id: string } | undefined;
  database: () => DatabaseSync;
  sha256: (value: string) => string;
  hashSecret: (value: string) => string;
  sha256Base64Url: (value: string) => string;
};

const clients: Record<SocialProvider, { clientId: string; clientSecret: string }> = {
  discord: { clientId: (process.env.DISCORD_OAUTH_CLIENT_ID || '').trim(), clientSecret: (process.env.DISCORD_OAUTH_CLIENT_SECRET || '').trim() },
  google: { clientId: (process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim(), clientSecret: (process.env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim() },
  yandex: { clientId: (process.env.YANDEX_OAUTH_CLIENT_ID || '').trim(), clientSecret: (process.env.YANDEX_OAUTH_CLIENT_SECRET || '').trim() },
};

function enabled(provider: SocialProvider) {
  const client = clients[provider];
  return Boolean(client.clientId && client.clientSecret);
}

export function socialLoginProviderConfiguration() {
  return SOCIAL_PROVIDERS.filter(enabled).map(provider => ({ provider, authUrl: `/api/auth/${provider}/start` }));
}

function callbackUrl(dependencies: Dependencies, provider: SocialProvider) {
  return `${dependencies.appUrl}/api/auth/${provider}/callback`;
}

function cookieName(provider: SocialProvider) {
  return `manacost_${provider}_oauth`;
}

function states(dependencies: Dependencies, request: Request, provider: SocialProvider): State[] {
  const secret = clients[provider].clientSecret;
  const raw = dependencies.cookieValue(request, cookieName(provider));
  if (!raw || !secret) return [];
  try {
    const decoded = decodeSignedStateCookie(raw, secret) as CookieValue | null;
    const candidates = Array.isArray(decoded?.states) ? decoded.states : [decoded];
    return candidates.flatMap(candidate => {
      if (!candidate || typeof candidate !== 'object') return [];
      const value = candidate as Partial<State>;
      if (typeof value.state !== 'string' || !value.codeVerifier || Number(value.expiresAt) <= Date.now()) return [];
      return [{ state: value.state, codeVerifier: String(value.codeVerifier), returnTo: safeAuthReturnTo(value.returnTo), linkUserId: typeof value.linkUserId === 'string' ? value.linkUserId : '', expiresAt: Number(value.expiresAt) }];
    });
  } catch { return []; }
}

function writeStates(dependencies: Dependencies, request: Request, response: Response, provider: SocialProvider, values: State[]) {
  if (!values.length) {
    response.append('Set-Cookie', [
      `${cookieName(provider)}=`, 'Path=/api/auth', 'Max-Age=0', 'HttpOnly', 'SameSite=Lax',
      dependencies.cookieSecure(request) ? 'Secure' : '', dependencies.cookieDomain(request),
    ].filter(Boolean).join('; '));
    return;
  }
  const value = encodeSignedStateCookie({ states: values }, clients[provider].clientSecret);
  response.append('Set-Cookie', [
    `${cookieName(provider)}=${encodeURIComponent(value)}`, 'Path=/api/auth', `Max-Age=${Math.ceil(STATE_TTL_MS / 1000)}`,
    'HttpOnly', 'SameSite=Lax', dependencies.cookieSecure(request) ? 'Secure' : '', dependencies.cookieDomain(request),
  ].filter(Boolean).join('; '));
}

function upsertUser(dependencies: Dependencies, provider: SocialProvider, profile: SocialProfile, linkUserId?: string) {
  const identityProvider = `${provider}_oauth`;
  const now = new Date().toISOString();
  const store = dependencies.loadAuthStore();
  const owner = dependencies.identityOwner(identityProvider, profile.subject);
  const linkedUser = linkUserId ? store.users.find(user => user.id === linkUserId) : undefined;
  const identityUser = owner?.user_id ? store.users.find(user => user.id === owner.user_id) : undefined;
  if (linkedUser && identityUser && linkedUser.id !== identityUser.id) throw new Error('External identity is already linked');
  let user = linkedUser ?? identityUser;
  let createdUser = false;
  if (!user) {
    const suffix = dependencies.sha256(`${provider}:${profile.subject}`).slice(0, 20);
    user = {
      id: `${provider}_${suffix}`, email: `${provider}_${suffix}@social.local`, name: profile.name, role: 'user', country: '', newsletterOptIn: false,
      avatarInitials: profile.name.slice(0, 2).toUpperCase(), photoUrl: profile.photoUrl,
      passwordHash: dependencies.hashSecret(randomBytes(24).toString('hex')), createdAt: now, updatedAt: now,
    };
    store.users.push(user);
    createdUser = true;
  } else {
    user.name = user.name || profile.name;
    user.photoUrl = profile.photoUrl || user.photoUrl;
    user.updatedAt = now;
  }
  if (createdUser) dependencies.saveAuthStore(store);
  const result = dependencies.database().prepare(`INSERT INTO identities (user_id, provider, provider_user_id, email, username, photo_url, verified_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider, provider_user_id) DO UPDATE SET username = excluded.username, photo_url = excluded.photo_url, updated_at = excluded.updated_at
    WHERE identities.user_id = excluded.user_id`).run(user.id, identityProvider, profile.subject, profile.email, profile.username, profile.photoUrl, now, now, now);
  if (result.changes !== 1) throw new Error('External identity is already linked');
  const token = dependencies.createAuthSession(store, user);
  dependencies.saveAuthStore(store);
  return token;
}

export function registerSocialOAuthRoutes(app: Express, dependencies: Dependencies) {
  const handler = async (request: Request, response: Response, next: NextFunction) => {
    const providerValue = String(request.params.provider || '');
    if (!isSocialProvider(providerValue)) return next();
    const provider = providerValue;
    dependencies.setPrivateNoStore(response);
    if (!enabled(provider)) return response.redirect(`/?login&${provider}=error`);
    const client = clients[provider];
    if (request.path.endsWith('/start')) {
      const state = randomBytes(24).toString('base64url');
      const codeVerifier = randomBytes(48).toString('base64url');
      const value: State = { state, codeVerifier, returnTo: safeAuthReturnTo(request.query.returnTo), linkUserId: dependencies.userAuth(request)?.id || '', expiresAt: Date.now() + STATE_TTL_MS };
      writeStates(dependencies, request, response, provider, [...states(dependencies, request, provider), value].slice(-4));
      return response.redirect(createSocialAuthorizationUrl({ provider, clientId: client.clientId, redirectUri: callbackUrl(dependencies, provider), state, codeChallenge: dependencies.sha256Base64Url(codeVerifier) }));
    }
    const state = states(dependencies, request, provider).find(item => item.state === String(request.query.state || ''));
    if (!state || !request.query.code) return response.redirect(`/?login&${provider}=error`);
    writeStates(dependencies, request, response, provider, states(dependencies, request, provider).filter(item => item.state !== state.state));
    try {
      const profile = await fetchSocialProfile({ provider, code: String(request.query.code), codeVerifier: state.codeVerifier, clientId: client.clientId, clientSecret: client.clientSecret, redirectUri: callbackUrl(dependencies, provider) });
      if (!profile || (state.linkUserId && dependencies.userAuth(request)?.id !== state.linkUserId)) throw new Error('OAuth profile unavailable');
      dependencies.setAuthCookie(request, response, upsertUser(dependencies, provider, profile, state.linkUserId || undefined));
      return response.redirect(safeAuthReturnTo(state.returnTo));
    } catch { return response.redirect(`/?login&${provider}=error`); }
  };
  app.get('/api/auth/:provider/start', handler);
  app.get('/api/auth/:provider/callback', handler);
  app.get('/api/auth/social/config', (_request, response) => response.json({ providers: socialLoginProviderConfiguration() }));
}
