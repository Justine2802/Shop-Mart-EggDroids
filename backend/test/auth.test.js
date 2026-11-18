// Unit tests for customer sign-in helpers and the guest paths of the protected routes.
// None of these reach PostgreSQL. The owner / other-customer checks need a database and are in
// test/orderOwnership.test.js (skipped automatically when no DATABASE_URL is reachable).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { cookieOptions, hashPassword, readCookie, verifyPassword } from '../src/lib/auth.js';
import { loginSchema, registerSchema } from '../src/validators/schemas.js';

async function call(path, { method = 'GET', body, headers = {} } = {}) {
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...headers }, body
    });
    return { status: response.status, body: await response.json() };
  } finally {
    server.close();
  }
}

test('hashPassword stores a salted scrypt hash that verifies only the right password', async () => {
  const stored = await hashPassword('correct horse');
  assert.match(stored, /^scrypt\$/);
  assert.doesNotMatch(stored, /correct horse/);
  assert.notEqual(stored, await hashPassword('correct horse'), 'each hash uses a fresh salt');
  assert.equal(await verifyPassword('correct horse', stored), true);
  assert.equal(await verifyPassword('wrong horse', stored), false);
  assert.equal(await verifyPassword('anything', 'garbage'), false);
});

test('readCookie finds a named cookie among several', () => {
  const request = { headers: { cookie: 'a=1; shopsmart_session=tok%2Ben; b=2' } };
  assert.equal(readCookie(request, 'shopsmart_session'), 'tok+en');
  assert.equal(readCookie(request, 'missing'), undefined);
  assert.equal(readCookie({ headers: {} }, 'a'), undefined);
});

test('session cookie is httpOnly, and Secure in production', () => {
  const previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    const options = cookieOptions();
    assert.equal(options.httpOnly, true);
    assert.equal(options.secure, true);
    assert.equal(options.sameSite, 'lax');
  } finally {
    process.env.NODE_ENV = previous;
  }
});

test('register and login schemas normalise email and require a real password', () => {
  assert.equal(registerSchema.parse({ name: 'Ana Test', email: ' Ana@Example.com ', password: 'longenough' }).email, 'ana@example.com');
  assert.equal(registerSchema.safeParse({ name: 'Ana Test', email: 'ana@example.com', password: 'short' }).success, false);
  assert.equal(loginSchema.safeParse({ email: 'not-an-email', password: 'x' }).success, false);
});

test('a guest cannot list orders or read an order', async () => {
  for (const path of ['/api/orders', '/api/orders/1']) {
    const { status, body } = await call(path);
    assert.equal(status, 401, path);
    assert.equal(body.error.code, 'AUTH_REQUIRED', path);
  }
});

test('/api/auth/me tells a guest they are not signed in', async () => {
  const { status, body } = await call('/api/auth/me');
  assert.equal(status, 200);
  assert.equal(body.user, null);
});

test('invalid register input returns 422 before touching the database', async () => {
  const { status, body } = await call('/api/auth/register', { method: 'POST', body: JSON.stringify({ email: 'x' }) });
  assert.equal(status, 422);
  assert.equal(body.error.code, 'INVALID_ACCOUNT');
});
