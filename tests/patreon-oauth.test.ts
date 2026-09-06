import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createPatreonAuthorizationUrl,
  createPatreonTokenCipher,
  exchangePatreonAuthorizationCode,
  fetchPatreonIdentity,
  parsePatreonMembership,
} from '../server/patreonOAuth.js';

const authorization = new URL(createPatreonAuthorizationUrl({
  clientId: 'client-id',
  redirectUri: 'https://hearthpulse.net/api/auth/patreon/callback',
  state: 'signed-state',
}));
assert.equal(authorization.origin, 'https://www.patreon.com');
assert.equal(authorization.pathname, '/oauth2/authorize');
assert.equal(authorization.searchParams.get('response_type'), 'code');
assert.equal(authorization.searchParams.get('scope'), 'identity identity.memberships');
assert.equal(authorization.searchParams.get('state'), 'signed-state');

const membership = parsePatreonMembership({
  data: { id: 'patron-1', type: 'user' },
  included: [
    {
      id: 'member-1',
      type: 'member',
      attributes: { patron_status: 'active_patron' },
      relationships: {
        campaign: { data: { type: 'campaign', id: 'campaign-1' } },
        currently_entitled_tiers: { data: [{ type: 'tier', id: 'diamond' }] },
      },
    },
    { id: 'diamond', type: 'tier', attributes: { title: 'Алмаз', amount_cents: 499 } },
  ],
}, { campaignId: 'campaign-1', fullAccessTierIds: ['diamond', 'diamond-plus'] });
assert.deepEqual(membership, {
  userId: 'patron-1',
  memberId: 'member-1',
  active: true,
  eligible: true,
  tierTitles: ['Алмаз'],
  highestTierAmountCents: 499,
});

assert.equal(parsePatreonMembership({
  data: { id: 'patron-1', type: 'user' },
  included: [
    {
      id: 'member-1', type: 'member', attributes: { patron_status: 'active_patron' },
      relationships: {
        campaign: { data: { type: 'campaign', id: 'other-campaign' } },
        currently_entitled_tiers: { data: [{ type: 'tier', id: 'diamond' }] },
      },
    },
    { id: 'diamond', type: 'tier', attributes: { title: 'Алмаз', amount_cents: 999 } },
  ],
}, { campaignId: 'campaign-1', fullAccessTierIds: ['diamond'] }), null);

const unrelatedExpensiveTier = parsePatreonMembership({
  data: { id: 'patron-1', type: 'user' },
  included: [
    {
      id: 'member-1', type: 'member', attributes: { patron_status: 'active_patron' },
      relationships: {
        campaign: { data: { type: 'campaign', id: 'campaign-1' } },
        currently_entitled_tiers: { data: [{ type: 'tier', id: 'donation' }] },
      },
    },
    { id: 'donation', type: 'tier', attributes: { title: 'Поддержка', amount_cents: 99_999 } },
  ],
}, { campaignId: 'campaign-1', fullAccessTierIds: ['diamond'] });
assert.equal(unrelatedExpensiveTier?.eligible, false, 'an unrelated expensive tier must not grant access');

let identityUrl = '';
await fetchPatreonIdentity('access-token', async (input, init) => {
  identityUrl = String(input);
  assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer access-token');
  assert.ok(init?.signal instanceof AbortSignal);
  return new Response(JSON.stringify({ data: { id: 'patron-1' } }), { status: 200 });
});
const requestedIdentity = new URL(identityUrl);
assert.equal(requestedIdentity.pathname, '/api/oauth2/v2/identity');
assert.equal(requestedIdentity.searchParams.get('include'), 'memberships.campaign,memberships.currently_entitled_tiers');

await assert.rejects(
  exchangePatreonAuthorizationCode({
    client: { clientId: 'client-id', clientSecret: 'client-secret' },
    code: 'code',
    redirectUri: 'https://hearthpulse.net/api/auth/patreon/callback',
    fetchImpl: async (_input, init) => {
      assert.ok(init?.signal instanceof AbortSignal);
      throw new Error('provider timeout');
    },
  }),
  /provider timeout/,
);

const cipher = createPatreonTokenCipher('test-only-token-encryption-secret-with-at-least-32-characters');
const ciphertext = cipher.encrypt('refresh-token');
assert.notEqual(ciphertext, 'refresh-token');
assert.equal(cipher.decrypt(ciphertext), 'refresh-token');
assert.equal(cipher.decrypt(`${ciphertext}tampered`), null);

const profileRoute = readFileSync(new URL('../src/features/DeferredRoutes.tsx', import.meta.url), 'utf8');
const profileStyles = readFileSync(new URL('../src/features/DeferredRoutes.css', import.meta.url), 'utf8');
const patreonAccount = readFileSync(new URL('../server/patreonAccount.ts', import.meta.url), 'utf8');
assert.match(profileRoute, /\/api\/auth\/patreon\/start/);
assert.match(profileRoute, /Привязать Patreon/);
assert.match(profileStyles, /profile-subscription-source__brand--patreon/);
assert.match(patreonAccount, /SELECT user_id FROM patreon_connections WHERE patreon_user_id = \? LIMIT 1/);
assert.match(patreonAccount, /if \(created\) \{\s+const newUserId = user\.id;\s+input\.saveStore\(store\);/);

console.log('patreon OAuth contracts passed');
