import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  answerQuestion, buildAssistantResponse, parseBudget, rankProducts, redactQuestion, retrieveCandidates, toCatalogFact
} from '../src/services/assistant.js';
import { verifyDraft } from '../src/services/verifyDraft.js';
import { ProviderError } from '../src/services/aiProvider.js';

const products = [
  { id: 1, name: 'Keyboard', category: 'Accessories', description: 'Mechanical keyboard', price: 1800, stock: 2 },
  { id: 2, name: 'Mouse', category: 'Accessories', description: 'Wireless mouse', price: 600, stock: 3 }
];

// Mirrors the seeded catalog, with a Decimal-like price to check deliberate conversion.
const decimal = (value) => ({ toNumber: () => value, toString: () => String(value) });
const catalog = [
  { id: 7, name: 'Wireless Mouse', description: 'Quiet wireless mouse with adjustable sensitivity and USB receiver.', category: 'Accessories', price: decimal(650), stock: 12, active: true },
  { id: 8, name: 'Compact Mechanical Keyboard', description: 'Hot-swappable compact keyboard with tactile switches.', category: 'Accessories', price: decimal(1850), stock: 8, active: true },
  { id: 9, name: 'USB-C Study Lamp', description: 'Adjustable desk lamp with three brightness levels.', category: 'Study', price: decimal(900), stock: 10, active: true },
  { id: 10, name: '1080p Webcam', description: 'Full HD webcam with privacy cover and built-in microphone.', category: 'Video', price: decimal(1450), stock: 6, active: true },
  { id: 11, name: 'Laptop Stand', description: 'Foldable aluminum stand for laptops up to 16 inches.', category: 'Study', price: decimal(1200), stock: 9, active: true },
  { id: 12, name: 'USB Headset', description: 'Over-ear headset with noise-reducing boom microphone.', category: 'Audio', price: decimal(1350), stock: 7, active: true }
];
const KEYBOARD_QUESTION = 'Which keyboard is below ₱2,000?';

function fakeProvider(reply) {
  const calls = [];
  return {
    calls,
    async draft(input) {
      calls.push(input);
      if (reply instanceof Error) throw reply;
      return typeof reply === 'string' ? reply : JSON.stringify(reply);
    }
  };
}

describe('starter behaviour (kept)', () => {
  test('parseBudget extracts a peso budget', () => assert.equal(parseBudget('below ₱2,000'), 2000));
  test('rankProducts respects the budget', () => assert.deepEqual(rankProducts(products, 'mouse below 700').map((p) => p.id), [2]));
  test('assistant response contains traceable sources', () => assert.equal(buildAssistantResponse(products, 'keyboard').sources[0].id, 1));
});

describe('budget parsing', () => {
  test('reads currency and budget wording', () => {
    assert.equal(parseBudget('keyboard under 1500 pesos'), 1500);
    assert.equal(parseBudget('anything for PHP 900?'), 900);
    assert.equal(parseBudget('headset up to 2k'), 2000);
  });
  test('does not treat product numbers as a budget', () => {
    assert.equal(parseBudget('Show me a 1080p webcam'), null);
    assert.equal(parseBudget('stand for a 16 inch laptop'), null);
  });
});

describe('catalog retrieval', () => {
  test('catalog match: keyboard below ₱2,000 returns only the keyboard with its real price', () => {
    const result = buildAssistantResponse(catalog, KEYBOARD_QUESTION);
    assert.deepEqual(result.recommendedProducts.map((p) => p.id), [8]);
    assert.equal(result.recommendedProducts[0].price, 1850);
    assert.match(result.answer, /₱1,850/);
  });

  test('a product number is matched as text, not as a budget', () => {
    assert.deepEqual(rankProducts(catalog, 'Show me a 1080p webcam').map((p) => p.id), [10]);
  });

  test('no match: an absent category returns no products or sources', () => {
    const result = buildAssistantResponse(catalog, 'Do you sell a refrigerator?');
    assert.deepEqual(result.recommendedProducts, []);
    assert.deepEqual(result.sources, []);
    assert.match(result.answer, /could not find/i);
  });

  test('a related product above the budget is mentioned but not recommended', () => {
    const result = buildAssistantResponse(catalog, 'keyboard under ₱500');
    assert.deepEqual(result.recommendedProducts, []);
    assert.match(result.answer, /Compact Mechanical Keyboard, costs ₱1,850/);
  });

  test('availability: a stock-0 product is never recommended as available', () => {
    const soldOut = catalog.map((p) => (p.id === 8 ? { ...p, stock: 0 } : p));
    const result = buildAssistantResponse(soldOut, KEYBOARD_QUESTION);
    assert.deepEqual(result.recommendedProducts, []);
    assert.match(result.answer, /Compact Mechanical Keyboard matches but is currently out of stock/);
  });

  test('inactive products are excluded even if passed in', () => {
    const inactive = catalog.map((p) => (p.id === 8 ? { ...p, active: false } : p));
    assert.deepEqual(rankProducts(inactive, KEYBOARD_QUESTION), []);
  });

  test('Decimal prices are converted to numbers', () => {
    assert.equal(toCatalogFact(catalog[1]).price, 1850);
    assert.equal(typeof toCatalogFact(catalog[1]).price, 'number');
  });

  test('a weak description match does not outrank a named product', () => {
    assert.deepEqual(rankProducts(catalog, 'a quiet keyboard').map((p) => p.id), [8]);
  });
});

describe('draft verification', () => {
  const retrieval = retrieveCandidates(catalog, KEYBOARD_QUESTION);
  const good = { answer: 'The Compact Mechanical Keyboard costs ₱1,850, within your ₱2,000 budget, and has tactile switches.', recommendedProductIds: [8] };

  test('accepts a draft grounded in the selected records', () => {
    assert.deepEqual(verifyDraft(JSON.stringify(good), retrieval), { ok: true, answer: good.answer, productIds: [8] });
  });
  test('rejects an invented product id', () => {
    assert.equal(verifyDraft(JSON.stringify({ ...good, recommendedProductIds: [99] }), retrieval).reason, 'UNKNOWN_PRODUCT_ID');
  });
  test('rejects a real id that was not selected for this request', () => {
    assert.equal(verifyDraft(JSON.stringify({ ...good, recommendedProductIds: [7] }), retrieval).reason, 'UNKNOWN_PRODUCT_ID');
  });
  test('rejects a wrong price', () => {
    assert.equal(verifyDraft(JSON.stringify({ ...good, answer: 'The Compact Mechanical Keyboard is only ₱1,500.' }), retrieval).reason, 'UNSUPPORTED_PRICE');
  });
  test('rejects an invented specification number', () => {
    assert.equal(verifyDraft(JSON.stringify({ ...good, answer: 'It has 87 keys and costs ₱1,850.' }), retrieval).reason, 'UNSUPPORTED_NUMBER');
  });
  test('rejects availability and commercial claims the catalog does not support', () => {
    assert.equal(verifyDraft(JSON.stringify({ ...good, answer: 'It is almost sold out, buy now for ₱1,850.' }), retrieval).reason, 'UNSUPPORTED_CLAIM');
    assert.equal(verifyDraft(JSON.stringify({ ...good, answer: 'It comes with a 2 year warranty.' }), retrieval).ok, false);
  });
  test('rejects mentioning a product that is not recommended', () => {
    assert.equal(verifyDraft(JSON.stringify({ ...good, answer: 'Get the Compact Mechanical Keyboard and a Wireless Mouse.' }), retrieval).reason, 'UNLISTED_PRODUCT');
  });
  test('rejects malformed output', () => {
    assert.equal(verifyDraft('Sure! Here is a keyboard.', retrieval).reason, 'MALFORMED_OUTPUT');
    assert.equal(verifyDraft(JSON.stringify({ answer: 'x' }), retrieval).reason, 'MALFORMED_OUTPUT');
  });
  test('accepts a fenced JSON block', () => {
    assert.equal(verifyDraft(`\`\`\`json\n${JSON.stringify(good)}\n\`\`\``, retrieval).ok, true);
  });
});

describe('answerQuestion with a provider', () => {
  test('verified AI draft is returned, with products and sources built from the catalog', async () => {
    const provider = fakeProvider({ answer: 'The Compact Mechanical Keyboard is ₱1,850 and has tactile switches.', recommendedProductIds: [8] });
    const result = await answerQuestion({ products: catalog, question: KEYBOARD_QUESTION, provider });
    assert.equal(result.mode, 'ai');
    assert.deepEqual(result.sources, [{ type: 'product', id: 8, name: 'Compact Mechanical Keyboard', price: 1850, stock: 8 }]);
    assert.deepEqual(result.recommendedProducts.map((p) => p.id), [8]);
  });

  test('the provider receives only selected public product fields', async () => {
    const provider = fakeProvider({ answer: 'The Compact Mechanical Keyboard is ₱1,850.', recommendedProductIds: [8] });
    await answerQuestion({ products: catalog, question: `${KEYBOARD_QUESTION} email me at ana@example.com`, provider });
    const [call] = provider.calls;
    assert.deepEqual(call.products.map((p) => p.id), [8]);
    assert.deepEqual(Object.keys(call.products[0]).sort(), ['category', 'description', 'id', 'name', 'pricePHP', 'stock']);
    assert.doesNotMatch(call.question, /ana@example\.com/);
  });

  test('no match: the provider is not called', async () => {
    const provider = fakeProvider({ answer: 'Try our Fridge 3000 for ₱9,999.', recommendedProductIds: [99] });
    const result = await answerQuestion({ products: catalog, question: 'Do you sell a refrigerator?', provider });
    assert.equal(provider.calls.length, 0);
    assert.deepEqual(result.sources, []);
    assert.equal(result.mode, 'rules');
  });

  for (const [code, pattern] of [['PROVIDER_TIMEOUT', /took too long/], ['PROVIDER_RATE_LIMITED', /busy/], ['PROVIDER_UNAVAILABLE', /unavailable/]]) {
    test(`provider failure ${code} falls back to the rule-based answer`, async () => {
      const events = [];
      const provider = fakeProvider(new ProviderError(code, 'failure'));
      const result = await answerQuestion({ products: catalog, question: KEYBOARD_QUESTION, provider, log: (e) => events.push(e) });
      assert.equal(result.mode, 'rules');
      assert.match(result.notice, pattern);
      assert.deepEqual(result.recommendedProducts.map((p) => p.id), [8]);
      assert.equal(events[0].code, code);
    });
  }

  test('an unexpected provider exception still falls back', async () => {
    const result = await answerQuestion({ products: catalog, question: KEYBOARD_QUESTION, provider: fakeProvider(new TypeError('boom')) });
    assert.equal(result.mode, 'rules');
    assert.deepEqual(result.recommendedProducts.map((p) => p.id), [8]);
  });

  test('an invented id or price in the draft is replaced by the verified rule answer', async () => {
    const provider = fakeProvider({ answer: 'Buy the Gaming Keyboard X for ₱999.', recommendedProductIds: [42] });
    const result = await answerQuestion({ products: catalog, question: KEYBOARD_QUESTION, provider });
    assert.equal(result.mode, 'rules');
    assert.match(result.notice, /could not be verified/);
    assert.doesNotMatch(result.answer, /Gaming Keyboard X|₱999/);
    assert.deepEqual(result.sources.map((s) => s.id), [8]);
  });

  test('no provider configured uses rules with a notice', async () => {
    const result = await answerQuestion({ products: catalog, question: KEYBOARD_QUESTION, provider: null });
    assert.equal(result.mode, 'rules');
    assert.match(result.notice, /not configured/);
  });
});

test('redactQuestion removes emails and phone numbers but keeps prices', () => {
  assert.equal(redactQuestion('keyboard below ₱2,000, call 0917 123 4567 or ana@example.com'), 'keyboard below ₱2,000, call [number removed]or [email removed]');
});
