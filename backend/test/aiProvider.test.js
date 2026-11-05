import test from 'node:test';
import assert from 'node:assert/strict';
import { createGeminiProvider, createProviderFromEnv } from '../src/services/aiProvider.js';

const KEY = 'test-secret-key-123';
const input = { question: 'keyboard below 2000', budget: 2000, products: [{ id: 8, name: 'Keyboard', pricePHP: 1850, stock: 8 }] };

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

test('sends the key in a header, not the URL, and returns the draft text', async () => {
  let seen;
  const fetchImpl = async (url, options) => {
    seen = { url, options };
    return jsonResponse(200, { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"answer":"ok","recommendedProductIds":[8]}' }] } }] });
  };
  const provider = createGeminiProvider({ apiKey: KEY, model: 'test-model', fetchImpl });
  const text = await provider.draft(input);
  assert.equal(text, '{"answer":"ok","recommendedProductIds":[8]}');
  assert.doesNotMatch(seen.url, new RegExp(KEY));
  assert.match(seen.url, /\/v1beta\/models\/test-model:generateContent$/);
  assert.equal(seen.options.headers['x-goog-api-key'], KEY);
  const body = JSON.parse(seen.options.body);
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(JSON.parse(body.contents[0].parts[0].text).catalogProducts, input.products);
});

test('HTTP 429 becomes PROVIDER_RATE_LIMITED without leaking the key', async () => {
  const provider = createGeminiProvider({ apiKey: KEY, fetchImpl: async () => jsonResponse(429, { error: { message: 'quota' } }) });
  await assert.rejects(provider.draft(input), (error) => error.code === 'PROVIDER_RATE_LIMITED' && !error.message.includes(KEY));
});

test('HTTP 5xx and auth failures become PROVIDER_UNAVAILABLE', async () => {
  for (const status of [401, 403, 404, 500, 503]) {
    const provider = createGeminiProvider({ apiKey: KEY, fetchImpl: async () => jsonResponse(status, {}) });
    await assert.rejects(provider.draft(input), { code: 'PROVIDER_UNAVAILABLE' });
  }
});

test('a slow provider becomes PROVIDER_TIMEOUT', async () => {
  const hang = (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
  const provider = createGeminiProvider({ apiKey: KEY, timeoutMs: 20, fetchImpl: hang });
  await assert.rejects(provider.draft(input), { code: 'PROVIDER_TIMEOUT' });
});

test('a network error becomes PROVIDER_UNAVAILABLE', async () => {
  const provider = createGeminiProvider({ apiKey: KEY, fetchImpl: async () => { throw new TypeError('fetch failed'); } });
  await assert.rejects(provider.draft(input), { code: 'PROVIDER_UNAVAILABLE' });
});

test('empty, truncated, or blocked output becomes PROVIDER_BAD_OUTPUT', async () => {
  for (const body of [{}, { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"ans' }] } }] }, { candidates: [{ finishReason: 'SAFETY' }] }]) {
    const provider = createGeminiProvider({ apiKey: KEY, fetchImpl: async () => jsonResponse(200, body) });
    await assert.rejects(provider.draft(input), { code: 'PROVIDER_BAD_OUTPUT' });
  }
});

test('createProviderFromEnv returns null without a key or when disabled', () => {
  assert.equal(createProviderFromEnv({}), null);
  assert.equal(createProviderFromEnv({ GEMINI_API_KEY: '   ' }), null);
  assert.equal(createProviderFromEnv({ GEMINI_API_KEY: KEY, AI_PROVIDER: 'none' }), null);
  assert.equal(createProviderFromEnv({ GEMINI_API_KEY: KEY }).name, 'gemini');
});
