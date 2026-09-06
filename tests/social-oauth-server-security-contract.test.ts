import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../server/socialOAuthRoutes.ts', import.meta.url), 'utf8');

assert.match(source, /Array\.isArray\(decoded\?\.states\) \? decoded\.states : \[decoded\]/);
assert.match(source, /\[\.\.\.states\(dependencies, request, provider\), value\]\.slice\(-4\)/);
assert.match(source, /states\(dependencies, request, provider\)\.filter\(item => item\.state !== state\.state\)/);
assert.match(source, /if \(result\.changes !== 1\) throw new Error/);

const identityWrite = source.indexOf('const result = dependencies.database().prepare(`INSERT INTO identities');
const sessionWrite = source.indexOf('const token = createAuthSession(store, user);', identityWrite);
assert.ok(identityWrite >= 0 && sessionWrite > identityWrite, 'identity must be reserved before the auth session is created');

console.log('social OAuth server security contract passed');
