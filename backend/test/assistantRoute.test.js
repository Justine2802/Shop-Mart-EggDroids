// HTTP-level checks for POST /api/assistant/questions that do not need a database:
// validation runs before the catalog query.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

async function post(body) {
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/assistant/questions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
  } finally {
    server.close();
  }
}

test('invalid input: a question shorter than 3 characters returns HTTP 422', async () => {
  const { status, body } = await post({ question: 'hi' });
  assert.equal(status, 422);
  assert.equal(body.error.code, 'INVALID_QUESTION');
});

test('invalid input: a missing or over-long question returns HTTP 422', async () => {
  assert.equal((await post({})).status, 422);
  assert.equal((await post({ question: 'x'.repeat(301) })).status, 422);
});
