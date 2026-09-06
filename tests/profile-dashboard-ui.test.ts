import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const profileRoute = readFileSync(
  new URL('../src/features/DeferredRoutes.tsx', import.meta.url),
  'utf8',
);
const profileIdentityStyles = readFileSync(
  new URL('../src/components/ProfileIdentityHero.css', import.meta.url),
  'utf8',
);
assert.match(profileRoute, /profile-subscription-source--active/);
assert.match(profileRoute, /profile-account-actions__logout/);
assert.match(profileIdentityStyles, /html \.profile-workspace \.profile-subscription-sources\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
assert.match(profileIdentityStyles, /html \.profile-workspace \.profile-account-actions__logout\s*\{[\s\S]*grid-column:\s*1\s*\/\s*-1/);
assert.match(profileIdentityStyles, /html \.profile-workspace \.profile-public-link a\s*\{/);
assert.match(profileIdentityStyles, /html \.profile-workspace \.profile-public-link button\s*\{/);

console.log('profile dashboard UI contract passed');
