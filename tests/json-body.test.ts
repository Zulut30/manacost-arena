import assert from 'node:assert/strict';
import express from 'express';
import {
  createRouteAwareJsonParser,
  createUploadAuthorizationGuard,
  jsonLimitForBase64Binary,
} from '../server/jsonBody.js';

assert.equal(jsonLimitForBase64Binary(12 * 1024 * 1024), 17_039_360);
assert.ok(jsonLimitForBase64Binary(32 * 1024 * 1024) < 43 * 1024 * 1024);

const app = express();
let parserReached = 0;
app.use(createUploadAuthorizationGuard({
  galleryAccessStatus: req => req.headers['x-test-role'] === 'admin' ? null : 401,
  adminImageAllowed: req => req.headers['x-test-role'] === 'admin',
  setPrivateNoStore: res => res.set('Cache-Control', 'private, no-store'),
}));
app.use((_req, _res, next) => {
  parserReached += 1;
  next();
});
app.use(createRouteAwareJsonParser({
  defaultLimit: 100,
  adminUploadMaxBytes: 300,
  galleryUploadMaxBytes: 600,
  trackerBatchMaxBytes: 400,
}));
app.post('*', (req, res) => res.json({ length: String(req.body?.value || '').length }));
app.use((error: { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(Number(error?.status) || 500).json({ error: 'body rejected' });
});

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});

async function post(path: string, size: number, role = ''): Promise<Response> {
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return fetch(`http://127.0.0.1:${address.port}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(role ? { 'X-Test-Role': role } : {}) },
    body: JSON.stringify({ value: 'x'.repeat(size) }),
  });
}

try {
  assert.equal((await post('/api/auth/login', 150)).status, 413);
  const reachedAfterOrdinaryRequest = parserReached;
  const deniedUpload = await post('/api/admin/uploads/image', 150);
  assert.equal(deniedUpload.status, 403);
  assert.equal(deniedUpload.headers.get('cache-control'), 'private, no-store');
  assert.equal(parserReached, reachedAfterOrdinaryRequest, 'unauthorized upload reached the body parser');
  assert.equal((await post('/api/admin/gallery?source=test', 400)).status, 401);
  assert.equal(parserReached, reachedAfterOrdinaryRequest, 'unauthorized gallery upload reached the body parser');
  assert.equal((await post('/api/admin/uploads/image', 150, 'admin')).status, 200);
  assert.equal((await post('/api/admin/gallery?source=test', 400, 'admin')).status, 200);
  assert.equal((await post('/api/admin/gallery-other', 150)).status, 413);
  assert.equal((await post('/api/v1/tracker/events/batch', 300)).status, 200);
  assert.equal((await post('/api/v1/tracker/events/batch', 500)).status, 413);
  assert.equal((await post('/api/v1/tracker/events/batch-other', 150)).status, 413);
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('route-aware JSON body limit tests passed');
