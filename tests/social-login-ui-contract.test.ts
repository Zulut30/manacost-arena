import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const loginPanel = readFileSync(new URL('../src/features/DeferredRoutes.tsx', import.meta.url), 'utf8');
const socialLoginLinks = readFileSync(new URL('../src/features/SocialLoginLinks.tsx', import.meta.url), 'utf8');

assert.match(loginPanel, /setSocialLoginProviders\(parseSocialLoginProviders\(data\.socialProviders\)\)/);
assert.match(loginPanel, /<SocialLoginLinks disabled=\{loading\} providers=\{socialLoginProviders\}/);
assert.match(socialLoginLinks, /Войти через \{labels\[provider\]\}/);
assert.match(socialLoginLinks, /href=\{authUrl\}/);

console.log('social login UI contract passed');
