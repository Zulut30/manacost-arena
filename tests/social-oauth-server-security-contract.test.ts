import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../server/index.ts', import.meta.url), 'utf8');

assert.match(source, /Array\.isArray\(value\?\.states\) \? value\.states : \[value\]/);
assert.match(source, /\[\.\.\.readSocialOauthStates\(req, provider\), state\]\.slice\(-4\)/);
assert.match(source, /readSocialOauthStates\(req, provider\)\.filter\(item => item\.state !== state\.state\)/);
assert.match(source, /consumeSocialOauthState\(req, res, provider, state\)/);
assert.match(source, /if \(identityResult\.changes !== 1\) throw new Error/);

const identityWrite = source.indexOf('const identityResult = db().prepare(`INSERT INTO identities');
const sessionWrite = source.indexOf('const token = createAuthSession(store, user);', identityWrite);
assert.ok(identityWrite >= 0 && sessionWrite > identityWrite, 'identity must be reserved before the auth session is created');

console.log('social OAuth server security contract passed');
