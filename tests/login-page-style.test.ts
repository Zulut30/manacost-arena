import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const styles = readFileSync(
  new URL('../src/features/LoginPanel.css', import.meta.url),
  'utf8',
);

const loginPageStyles = styles.match(/\.login-page\s*\{(?<rules>[^}]*)\}/)?.groups?.rules ?? '';

assert.match(loginPageStyles, /min-height:\s*calc\(100vh - 3rem\)/);
assert.match(loginPageStyles, /background-color:\s*#ead6a7/);
assert.match(loginPageStyles, /url\('\/wallpaper\/arena-parchment\.jpg'\)/);

console.log('login page background fallback contract passed');
