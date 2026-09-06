import assert from 'node:assert/strict';
import {
  createSocialAuthorizationUrl,
  fetchSocialProfile,
  isSocialProvider,
  parseSocialProfile,
} from '../server/socialOAuth.js';

assert.equal(isSocialProvider('discord'), true);
assert.equal(isSocialProvider('google'), true);
assert.equal(isSocialProvider('yandex'), true);
assert.equal(isSocialProvider('telegram'), false);

const authorization = new URL(createSocialAuthorizationUrl({
  provider: 'discord',
  clientId: 'client-id',
  redirectUri: 'https://hearthpulse.net/api/auth/discord/callback',
  state: 'state-value',
  codeChallenge: 'challenge-value',
}));
assert.equal(authorization.origin, 'https://discord.com');
assert.equal(authorization.pathname, '/oauth2/authorize');
assert.equal(authorization.searchParams.get('response_type'), 'code');
assert.equal(authorization.searchParams.get('scope'), 'identify email');
assert.equal(authorization.searchParams.get('state'), 'state-value');
assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');

assert.deepEqual(parseSocialProfile('discord', {
  id: '123', username: 'arena-player', global_name: 'Arena Player', avatar: 'avatar-hash', email: 'player@example.test', verified: true,
}), {
  subject: '123', name: 'Arena Player', username: 'arena-player', email: 'player@example.test', photoUrl: 'https://cdn.discordapp.com/avatars/123/avatar-hash.png',
});

assert.equal(parseSocialProfile('google', { sub: '' }), null);
assert.deepEqual(parseSocialProfile('yandex', { id: '42', display_name: 'Яндекс Игрок', login: 'yandex-player', default_email: 'player@yandex.test' }), {
  subject: '42', name: 'Яндекс Игрок', username: 'yandex-player', email: 'player@yandex.test', photoUrl: '',
});

const requests: Array<{ url: string; init?: RequestInit }> = [];
const profile = await fetchSocialProfile({
  provider: 'google', code: 'one-time-code', codeVerifier: 'proof', clientId: 'client-id', clientSecret: 'client-secret',
  redirectUri: 'https://hearthpulse.net/api/auth/google/callback',
  fetchImpl: async (url, init) => {
    requests.push({ url: String(url), init });
    if (requests.length === 1) return new Response(JSON.stringify({ access_token: 'access-token' }), { status: 200 });
    return new Response(JSON.stringify({ sub: 'google-1', name: 'Google Player', email: 'player@example.test' }), { status: 200 });
  },
});
assert.equal(requests[0].url, 'https://oauth2.googleapis.com/token');
assert.equal(new URLSearchParams(String(requests[0].init?.body)).get('code_verifier'), 'proof');
assert.equal((requests[1].init?.headers as Record<string, string>).Authorization, 'Bearer access-token');
assert.deepEqual(profile, { subject: 'google-1', name: 'Google Player', username: '', email: 'player@example.test', photoUrl: '' });

const yandexRequests: Array<{ url: string; init?: RequestInit }> = [];
await fetchSocialProfile({
  provider: 'yandex', code: 'one-time-code', codeVerifier: 'proof', clientId: 'client-id', clientSecret: 'client-secret',
  redirectUri: 'https://hearthpulse.net/api/auth/yandex/callback',
  fetchImpl: async (url, init) => {
    yandexRequests.push({ url: String(url), init });
    if (yandexRequests.length === 1) return new Response(JSON.stringify({ access_token: 'access-token' }), { status: 200 });
    return new Response(JSON.stringify({ id: 'yandex-1', login: 'player' }), { status: 200 });
  },
});
assert.equal((yandexRequests[1].init?.headers as Record<string, string>).Authorization, 'OAuth access-token');

console.log('social OAuth contracts passed');
