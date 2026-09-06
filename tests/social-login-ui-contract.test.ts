import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const loginPanel = readFileSync(new URL('../src/features/DeferredRoutes.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/features/LoginPanel.css', import.meta.url), 'utf8');

assert.match(loginPanel, /fetch\('\/api\/auth\/social\/config'\)/);
assert.match(loginPanel, /Войти через \{SOCIAL_AUTH_LABELS\[provider\]\}/);
assert.match(loginPanel, /telegramEnabled \|\| socialLoginProviders\.length > 0/);
assert.match(styles, /\.login-social-link--google/);
assert.match(styles, /\.login-social-link--discord/);
assert.match(styles, /\.login-social-link--yandex/);

console.log('social login UI contract passed');
