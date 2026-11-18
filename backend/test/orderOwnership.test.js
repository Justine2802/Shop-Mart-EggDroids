// End-to-end ownership check against a real PostgreSQL database (the one in DATABASE_URL).
// It creates its own product and two fictional customers, then removes everything it created.
// Skipped when the database cannot be reached, so `npm test` still works without PostgreSQL.
import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

let databaseReachable = false;
try { await prisma.$queryRaw`SELECT 1`; databaseReachable = true; } catch { /* skip below */ }

test('orders are visible only to the customer who placed them', { skip: !databaseReachable && 'PostgreSQL not reachable' }, async (t) => {
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const runId = Date.now();
  const emails = [`owner-${runId}@example.com`, `other-${runId}@example.com`];
  const product = await prisma.product.create({ data: { name: `Ownership test item ${runId}`, description: 'Created by orderOwnership.test.js', category: 'Test', price: 100, stock: 5, active: true } });

  t.after(async () => {
    server.close();
    await prisma.order.deleteMany({ where: { user: { email: { in: emails } } } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.$disconnect();
  });

  async function send(path, { method = 'GET', body, cookie } = {}) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    const setCookie = response.headers.get('set-cookie');
    return { status: response.status, body: response.status === 204 ? null : await response.json(), cookie: setCookie?.split(';')[0] };
  }

  const owner = await send('/auth/register', { method: 'POST', body: { name: 'Olivia Owner', email: emails[0], password: 'owner-password' } });
  assert.equal(owner.status, 201);
  assert.match(owner.cookie, /^shopsmart_session=/);
  const other = await send('/auth/register', { method: 'POST', body: { name: 'Oscar Other', email: emails[1], password: 'other-password' } });
  assert.equal(other.status, 201);

  const duplicate = await send('/auth/register', { method: 'POST', body: { name: 'Olivia Again', email: emails[0], password: 'whatever-123' } });
  assert.equal(duplicate.status, 409);

  const placed = await send('/orders', { method: 'POST', cookie: owner.cookie, body: {
    customerName: 'Olivia Owner', email: emails[0], address: '1 Fictional Street, Test City', items: [{ productId: product.id, quantity: 2 }]
  } });
  assert.equal(placed.status, 201);
  assert.equal(placed.body.userId, owner.body.user.id);

  // Guest is refused, owner succeeds, another customer is denied even with the exact id.
  assert.equal((await send(`/orders/${placed.body.id}`)).status, 401);
  const mine = await send(`/orders/${placed.body.id}`, { cookie: owner.cookie });
  assert.equal(mine.status, 200);
  assert.equal(mine.body.total, 200);
  assert.equal(mine.body.items[0].product.name, product.name);
  const theirs = await send(`/orders/${placed.body.id}`, { cookie: other.cookie });
  assert.equal(theirs.status, 404);
  assert.deepEqual((await send('/orders', { cookie: other.cookie })).body, []);
  assert.equal((await send('/orders', { cookie: owner.cookie })).body.length, 1);

  // Wrong password is refused; logging out kills the session server-side.
  assert.equal((await send('/auth/login', { method: 'POST', body: { email: emails[0], password: 'nope-nope' } })).status, 401);
  const login = await send('/auth/login', { method: 'POST', body: { email: emails[0].toUpperCase(), password: 'owner-password' } });
  assert.equal(login.status, 200);
  assert.equal((await send('/auth/logout', { method: 'POST', cookie: login.cookie })).status, 204);
  assert.equal((await send('/auth/me', { cookie: login.cookie })).body.user, null);
  assert.equal((await send('/orders', { cookie: login.cookie })).status, 401, 'a logged-out cookie is refused');
  assert.equal((await send('/auth/me', { cookie: owner.cookie })).body.user.email, emails[0], 'other sessions stay valid');

  const health = await send('/health');
  assert.deepEqual(health.body, { status: 'ok', database: 'ok' });
});
