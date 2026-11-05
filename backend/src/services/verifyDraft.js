// Verifies an AI draft against the catalog records selected for this request.
// The draft is untrusted text: it is shown only if every product id, price, number and
// availability statement can be traced to those records. Otherwise the caller falls back
// to the rule-based answer.
import { z } from 'zod';

const MAX_ANSWER_LENGTH = 700;

const draftSchema = z.object({
  answer: z.string().trim().min(1).max(MAX_ANSWER_LENGTH),
  recommendedProductIds: z.array(z.number().int().positive()).min(1).max(3)
});

// Topics the catalog has no data for, so the model cannot have a verified fact about them,
// plus availability statements that contradict "every candidate is in stock".
const UNSUPPORTED_CLAIMS = [
  /out\s+of\s+stock/i, /sold\s+out/i, /\bunavailable\b/i, /\bnot\s+available\b/i, /\bback\s*order/i, /\bpre-?order/i,
  /\bdiscount/i, /\b(?:on\s+)?sale\b/i, /\bpromo/i, /\bvoucher/i, /\bfree\s+shipping/i, /\bshipping\b/i,
  /\bdelivery\b/i, /\bwarranty\b/i, /\brating/i, /\breview/i, /\bstars?\b/i, /\bbest[\s-]?sell/i
];

const CURRENCY_PATTERN = /(?:₱|php)\s*(\d[\d,]*(?:\.\d{1,2})?)|(\d[\d,]*(?:\.\d{1,2})?)\s*(?:pesos?|php)\b/gi;
const NUMBER_PATTERN = /\d[\d,]*(?:\.\d+)?/g;

function toNumber(text) {
  return Number(text.replaceAll(',', ''));
}

function numbersIn(text) {
  return (String(text).match(NUMBER_PATTERN) ?? []).map(toNumber);
}

export function parseDraft(text) {
  if (typeof text !== 'string') return null;
  // Tolerate a fenced ```json block even though JSON output was requested.
  const unfenced = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(unfenced); } catch { return null; }
}

/**
 * @param {string} draftText raw provider output
 * @param {{ candidates: Array, catalog: Array, budget: number|null, question: string }} retrieval
 * @returns {{ ok: true, answer: string, productIds: number[] } | { ok: false, reason: string, detail?: string }}
 */
export function verifyDraft(draftText, retrieval) {
  const parsed = draftSchema.safeParse(parseDraft(draftText));
  if (!parsed.success) return { ok: false, reason: 'MALFORMED_OUTPUT' };

  const { answer } = parsed.data;
  const productIds = [...new Set(parsed.data.recommendedProductIds)];
  const byId = new Map(retrieval.candidates.map((fact) => [fact.id, fact]));

  // 1. Every id must be one ShopSmart selected for this request.
  const unknown = productIds.filter((id) => !byId.has(id));
  if (unknown.length > 0) return { ok: false, reason: 'UNKNOWN_PRODUCT_ID', detail: unknown.join(',') };
  const selected = productIds.map((id) => byId.get(id));

  // 2. The answer must not name catalog products that were not recommended.
  const lowerAnswer = answer.toLowerCase();
  const unlisted = retrieval.catalog.filter((fact) => !productIds.includes(fact.id) && lowerAnswer.includes(fact.name.toLowerCase()));
  if (unlisted.length > 0) return { ok: false, reason: 'UNLISTED_PRODUCT', detail: unlisted.map((fact) => fact.id).join(',') };

  // 3. Every peso amount must be a recommended product's current price or the customer's own budget.
  const allowedPrices = new Set(selected.map((fact) => fact.price));
  if (retrieval.budget !== null) allowedPrices.add(retrieval.budget);
  for (const match of answer.matchAll(CURRENCY_PATTERN)) {
    const value = toNumber(match[1] ?? match[2]);
    if (!allowedPrices.has(value)) return { ok: false, reason: 'UNSUPPORTED_PRICE', detail: String(value) };
  }

  // 4. Any other number must come from the selected records or the question itself
  //    (e.g. "1080p" from a name, "16 inches" from a description, a stock count).
  const allowedNumbers = new Set([
    ...allowedPrices,
    ...selected.map((fact) => fact.stock),
    ...selected.flatMap((fact) => numbersIn(`${fact.name} ${fact.description}`)),
    ...numbersIn(retrieval.question ?? '')
  ]);
  const unsupportedNumber = numbersIn(answer).find((value) => !allowedNumbers.has(value));
  if (unsupportedNumber !== undefined) return { ok: false, reason: 'UNSUPPORTED_NUMBER', detail: String(unsupportedNumber) };

  // 5. No availability or commercial claims the catalog cannot support.
  const claim = UNSUPPORTED_CLAIMS.find((pattern) => pattern.test(answer));
  if (claim) return { ok: false, reason: 'UNSUPPORTED_CLAIM', detail: claim.source };

  return { ok: true, answer, productIds };
}
