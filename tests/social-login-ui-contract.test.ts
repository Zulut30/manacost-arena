import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const loginPanel = readFileSync(new URL('../src/features/DeferredRoutes.tsx', import.meta.url), 'utf8');
const socialLoginLinks = readFileSync(new URL('../src/features/SocialLoginLinks.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/features/LoginPanel.css', import.meta.url), 'utf8');

assert.match(loginPanel, /setSocialLoginProviders\(parseSocialLoginProviders\(data\.socialProviders\)\)/);
assert.match(loginPanel, /<SocialLoginLinks disabled=\{loading\} providers=\{socialLoginProviders\}/);
assert.match(socialLoginLinks, /Войти через \{labels\[provider\]\}/);
assert.match(styles, /\.login-social-link--google/);
assert.match(styles, /\.login-social-link--discord/);
assert.match(styles, /\.login-social-link--yandex/);

console.log('social login UI contract passed');
