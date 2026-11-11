// Regression tests for defects found during the PDC50 quality challenge.
// Each request is rejected before any database query, so no PostgreSQL is needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { escapeLikePattern } from '../src/lib/search.js';
import { orderSchema } from '../src/validators/schemas.js';

async function call(path, { method = 'GET', body } = {}) {
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method, headers: { 'Content-Type': 'application/json' }, body
    });
    return { status: response.status, body: await response.json() };
  } finally {
    server.close();
  }
}

const validOrder = {
  customerName: 'Juan Dela Test',
  email: 'juan.test@example.com',
  address: '123 Sample Street, Fictional City',
  items: [{ productId: 1, quantity: 1 }]
};

// DEFECT-02: a product id beyond the PostgreSQL INTEGER range reached Prisma and returned HTTP 500.
test('GET /api/products/:id with an id beyond the integer range returns 400, not 500', async () => {
  const { status, body } = await call('/api/products/99999999999');
  assert.equal(status, 400);
  assert.equal(body.error.code, 'INVALID_PRODUCT_ID');
});

test('an order item id beyond the integer range fails validation', () => {
  const result = orderSchema.safeParse({ ...validOrder, items: [{ productId: 99999999999, quantity: 1 }] });
  assert.equal(result.success, false);
});

test('POST /api/orders with an id beyond the integer range returns 422, not 500', async () => {
  const { status, body } = await call('/api/orders', {
    method: 'POST', body: JSON.stringify({ ...validOrder, items: [{ productId: 99999999999, quantity: 1 }] })
  });
  assert.equal(status, 422);
  assert.equal(body.error.code, 'INVALID_ORDER');
});

// DEFECT-03: malformed JSON was labelled INTERNAL_ERROR and echoed the parser message.
test('malformed JSON returns 400 INVALID_JSON with a customer-safe message', async () => {
  const { status, body } = await call('/api/orders', { method: 'POST', body: '{bad json' });
  assert.equal(status, 400);
  assert.equal(body.error.code, 'INVALID_JSON');
  assert.doesNotMatch(body.error.message, /position|line \d/i);
  assert.ok(body.error.traceId, 'the error carries a traceId for the server log');
});

// DEFECT-04: "%" and "_" were treated as SQL LIKE wildcards, so searching "%" listed every product.
test('escapeLikePattern makes LIKE wildcards literal', () => {
  assert.equal(escapeLikePattern('%'), '\\%');
  assert.equal(escapeLikePattern('_'), '\\_');
  assert.equal(escapeLikePattern('50%_off\\'), '50\\%\\_off\\\\');
  assert.equal(escapeLikePattern('keyboard'), 'keyboard');
});
