import assert from 'node:assert/strict';
import express from 'express';
import { encodeSignedStateCookie } from '../server/authRedirect.js';
import { registerPatreonOAuthRoutes } from '../server/patreonOAuthRoutes.js';

const client = { clientId: 'patreon-client', clientSecret: 'test-only-patreon-secret' };
const linkedUser = { id: 'user-42' };
const app = express();
let saved = 0;
let refreshed = 0;
let provisioned = 0;
let authCookies = 0;

registerPatreonOAuthRoutes(app, {
  appUrl: 'https://hearthpulse.net',
  client,
  cookieValue: request => String(request.headers['x-patreon-state'] || ''),
  cookieSecure: () => true,
  cookieDomain: () => 'Domain=hearthpulse.net',
  setPrivateNoStore: response => response.setHeader('Cache-Control', 'private, no-store'),
  userAuth: request => request.headers['x-user'] === 'user-42' ? linkedUser : null,
  setAuthCookie: (_request, response, token) => {
    authCookies += 1;
    response.append('Set-Cookie', `manacost_auth=${token}; HttpOnly`);
  },
  provisionUser: () => {
    provisioned += 1;
    return { user: linkedUser, token: 'session-token' };
  },
  saveAuthorization: () => { saved += 1; },
  refreshSubscription: async (_user, force) => {
    assert.equal(force, true);
    refreshed += 1;
  },
  exchangeAuthorization: async () => ({
    token: { accessToken: 'access', refreshToken: 'refresh', expiresAt: Date.now() + 3_600_000 },
    identity: { data: { id: 'patreon-user-7' } },
  }),
});

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const origin = `http://127.0.0.1:${address.port}`;

try {
  const anonymous = await fetch(`${origin}/api/auth/patreon/start`, { redirect: 'manual' });
  assert.equal(anonymous.status, 302);
  assert.match(String(anonymous.headers.get('location')), /^https:\/\/www\.patreon\.com\/oauth2\/authorize/);
  assert.equal(anonymous.headers.get('cache-control'), 'private, no-store');

  const start = await fetch(`${origin}/api/auth/patreon/start?returnTo=/profile`, {
    redirect: 'manual',
    headers: { 'X-User': 'user-42' },
  });
  assert.equal(start.status, 302);
  const authorizationUrl = new URL(String(start.headers.get('location')));
  assert.equal(authorizationUrl.origin, 'https://www.patreon.com');
  assert.equal(authorizationUrl.searchParams.get('redirect_uri'), 'https://hearthpulse.net/api/auth/patreon/callback');
  assert.equal(authorizationUrl.searchParams.get('scope'), 'identity identity.memberships');
  const startCookie = String(start.headers.get('set-cookie'));
  assert.match(startCookie, /HttpOnly/);
  assert.match(startCookie, /SameSite=Lax/);
  assert.match(startCookie, /Secure/);

  const state = 'expected-state';
  const signedState = encodeSignedStateCookie({
    state,
    userId: 'user-42',
    returnTo: '/profile',
    expiresAt: Date.now() + 60_000,
  }, client.clientSecret);
  const rejected = await fetch(`${origin}/api/auth/patreon/callback?state=wrong&code=code`, {
    redirect: 'manual',
    headers: { 'X-User': 'user-42', 'X-Patreon-State': signedState },
  });
  assert.equal(rejected.headers.get('location'), '/?login&patreon=error');
  assert.equal(saved, 0);

  const accepted = await fetch(`${origin}/api/auth/patreon/callback?state=${state}&code=code`, {
    redirect: 'manual',
    headers: { 'X-User': 'user-42', 'X-Patreon-State': signedState },
  });
  assert.equal(accepted.headers.get('location'), '/profile');
  assert.equal(saved, 1);
  assert.equal(refreshed, 1);
  assert.match(String(accepted.headers.get('set-cookie')), /Max-Age=0/);

  const loginState = encodeSignedStateCookie({
    state: 'login-state', userId: '', returnTo: '/?login&patreon=linked', expiresAt: Date.now() + 60_000,
  }, client.clientSecret);
  const login = await fetch(`${origin}/api/auth/patreon/callback?state=login-state&code=code`, {
    redirect: 'manual', headers: { 'X-Patreon-State': loginState },
  });
  assert.equal(login.headers.get('location'), '/?login&patreon=linked');
  assert.equal(provisioned, 1);
  assert.equal(authCookies, 1);
  assert.equal(saved, 2);
  assert.equal(refreshed, 2);
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('Patreon OAuth route security tests passed');
