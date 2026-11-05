// Grounded product assistant.
//
// Flow: retrieveCandidates() decides which catalog records are eligible (ShopSmart code,
// not the AI). If nothing qualifies we answer honestly without calling the provider.
// Otherwise the provider may draft the wording; verifyDraft() checks it against the same
// records. Any provider or verification failure falls back to buildRuleAnswer().
import { verifyDraft } from './verifyDraft.js';

const MAX_RECOMMENDATIONS = 3;

// Words that describe the request rather than the product being searched for.
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'is', 'are', 'it', 'its', 'be', 'me', 'my', 'i', 'im',
  'you', 'your', 'we', 'our', 'do', 'does', 'did', 'have', 'has', 'can', 'could', 'would', 'should', 'will', 'please',
  'which', 'what', 'whats', 'who', 'where', 'when', 'how', 'any', 'some', 'something', 'anything', 'one', 'ones',
  'that', 'this', 'there', 'these', 'those', 'for', 'with', 'from', 'about', 'than', 'then', 'just', 'also', 'too',
  'below', 'under', 'less', 'cheaper', 'cheap', 'cheapest', 'affordable', 'budget', 'price', 'priced', 'cost', 'costs',
  'max', 'maximum', 'most', 'least', 'up', 'upto', 'within', 'around', 'only', 'no', 'not', 'more', 'over', 'above',
  'php', 'peso', 'pesos', 'p', 'k',
  'recommend', 'recommendation', 'suggest', 'need', 'want', 'looking', 'look', 'find', 'show', 'get', 'buy', 'sell',
  'selling', 'available', 'stock', 'product', 'products', 'item', 'items', 'shopsmart', 'store', 'shop', 'good',
  'best', 'great', 'nice', 'new', 'like', 'help', 'choose', 'pick', 'option', 'options', 'thing', 'things', 'hi', 'hello'
]);

// Small synonym table so common wording still reaches catalog terms.
const SYNONYMS = {
  headphone: 'headset', earphone: 'headset', earbud: 'headset', mic: 'microphone',
  camera: 'webcam', cam: 'webcam', light: 'lamp', notebook: 'laptop', mice: 'mouse'
};

const FIELD_WEIGHTS = { name: 3, category: 2, description: 1 };

function stem(token) {
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 4 && /(ches|shes|xes|sses)$/.test(token)) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

export function tokenize(text) {
  return (String(text).toLowerCase().match(/[a-z0-9]+/g) ?? []).map((token) => {
    const stemmed = stem(token);
    return SYNONYMS[stemmed] ?? stemmed;
  });
}

export function extractSearchTerms(question) {
  // Pure numbers (budgets, quantities) are handled by parseBudget, not by text matching.
  return [...new Set(tokenize(question).filter((term) => !STOP_WORDS.has(term) && !/^\d+$/.test(term)))];
}

function toAmount(digits, thousandSuffix) {
  const value = Number(digits.replaceAll(',', ''));
  if (!Number.isFinite(value) || value <= 0) return null;
  return thousandSuffix ? value * 1000 : value;
}

// Only treat a number as a budget when the wording says so ("below 2000", "₱2,000", "1500 pesos").
// A bare number such as "1080p" is a product detail, not a price limit.
export function parseBudget(question) {
  const text = String(question);
  const amount = String.raw`(\d[\d,]*(?:\.\d{1,2})?)\s*(k\b)?`;
  const patterns = [
    new RegExp(String.raw`(?:under|below|less\s+than|cheaper\s+than|lower\s+than|at\s+most|up\s+to|no\s+more\s+than|not\s+more\s+than|max(?:imum)?|within|budget(?:\s+(?:of|is))?|<=?)\s*:?\s*(?:₱|php|[^\d\s]{1,3}(?=\s*\d))?\s*${amount}`, 'i'),
    new RegExp(String.raw`(?:₱|php)\s*${amount}`, 'i'),
    new RegExp(String.raw`${amount}\s*(?:pesos?|php)\b`, 'i')
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return toAmount(match[1], match[2]);
  }
  return null;
}

// Convert a database record into the plain public facts the assistant may use.
// Prisma returns Decimal for price, so convert it explicitly instead of relying on coercion.
export function toCatalogFact(product) {
  const price = typeof product.price === 'object' && product.price !== null && 'toNumber' in product.price
    ? product.price.toNumber()
    : Number(product.price);
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    description: product.description,
    price,
    stock: Number(product.stock),
    active: product.active !== false
  };
}

function scoreProduct(fact, terms) {
  const fields = Object.fromEntries(Object.keys(FIELD_WEIGHTS).map((field) => [field, new Set(tokenize(fact[field]))]));
  return terms.reduce((score, term) => {
    const best = Math.max(0, ...Object.entries(FIELD_WEIGHTS).map(([field, weight]) => (fields[field].has(term) ? weight : 0)));
    return score + best;
  }, 0);
}

// Decide which catalog products are eligible for this question.
// Returns the eligible candidates plus the reasons other relevant products were excluded,
// so the no-match answer can be honest about why.
export function retrieveCandidates(products, question) {
  const facts = products.map(toCatalogFact).filter((fact) => fact.active);
  const terms = extractSearchTerms(question);
  const budget = parseBudget(question);

  let relevant;
  if (terms.length === 0) {
    // A pure budget question ("what can I get under ₱1,000?") considers the whole active catalog.
    relevant = facts.map((fact) => ({ ...fact, score: 0 }));
  } else {
    const scored = facts.map((fact) => ({ ...fact, score: scoreProduct(fact, terms) })).filter((fact) => fact.score > 0);
    const top = Math.max(0, ...scored.map((fact) => fact.score));
    // Keep strong matches only, so "quiet keyboard" does not pull in a mouse described as quiet.
    relevant = scored.filter((fact) => fact.score >= top / 2);
  }

  const outOfStock = relevant.filter((fact) => fact.stock <= 0);
  const overBudget = relevant.filter((fact) => fact.stock > 0 && budget !== null && fact.price > budget);
  const candidates = relevant
    .filter((fact) => fact.stock > 0 && (budget === null || fact.price <= budget))
    .sort((a, b) => b.score - a.score || a.price - b.price)
    .slice(0, MAX_RECOMMENDATIONS);

  return { question, terms, budget, candidates, outOfStock, overBudget, catalog: facts };
}

// Kept for the existing tests and callers: the ranked, eligible products.
export function rankProducts(products, question) {
  return retrieveCandidates(products, question).candidates;
}

export function formatPeso(value) {
  return `₱${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function listNames(names) {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

function describeRequest({ terms, budget }) {
  const subject = terms.length > 0 ? `"${terms.join(' ')}"` : 'your request';
  return budget === null ? subject : `${subject} at or below ${formatPeso(budget)}`;
}

function noMatchAnswer(retrieval) {
  const parts = [`I could not find an in-stock product matching ${describeRequest(retrieval)} in the current ShopSmart catalog.`];
  if (retrieval.overBudget.length > 0) {
    const closest = [...retrieval.overBudget].sort((a, b) => a.price - b.price)[0];
    parts.push(`The closest related product, ${closest.name}, costs ${formatPeso(closest.price)}.`);
  }
  if (retrieval.outOfStock.length > 0) {
    parts.push(`${listNames(retrieval.outOfStock.map((fact) => fact.name))} ${retrieval.outOfStock.length === 1 ? 'matches but is' : 'match but are'} currently out of stock.`);
  }
  if (parts.length === 1) parts.push('Try a different product type or browse the full catalog.');
  return parts.join(' ');
}

function matchAnswer(retrieval) {
  const described = retrieval.candidates.map((fact) => `${fact.name} (${formatPeso(fact.price)}, ${fact.stock} in stock)`);
  const scope = retrieval.budget === null ? '' : ` at or below ${formatPeso(retrieval.budget)}`;
  if (described.length === 1) return `Based on the current ShopSmart catalog, the best match${scope} is ${described[0]}: ${retrieval.candidates[0].description}`;
  return `Based on the current ShopSmart catalog, these in-stock products match${scope}: ${listNames(described)}.`;
}

// Recommendations and sources are always built from catalog records, never from model output.
export function toResponseProducts(facts) {
  return {
    recommendedProducts: facts.map(({ id, name, price, category, stock }) => ({ id, name, price, category, stock })),
    sources: facts.map(({ id, name, price, stock }) => ({ type: 'product', id, name, price, stock }))
  };
}

export function buildRuleAnswer(retrieval) {
  if (retrieval.candidates.length === 0) {
    return { answer: noMatchAnswer(retrieval), recommendedProducts: [], sources: [] };
  }
  return { answer: matchAnswer(retrieval), ...toResponseProducts(retrieval.candidates) };
}

// Rule-only response (no provider). Same shape the starter returned.
export function buildAssistantResponse(products, question) {
  return { ...buildRuleAnswer(retrieveCandidates(products, question)), mode: 'rules', notice: null };
}

const FALLBACK_NOTICES = {
  PROVIDER_NOT_CONFIGURED: 'AI drafting is not configured on this server, so this answer was built directly from current catalog data.',
  PROVIDER_TIMEOUT: 'The AI writer took too long to respond, so this answer was built directly from current catalog data.',
  PROVIDER_RATE_LIMITED: 'The AI writer is busy right now, so this answer was built directly from current catalog data.',
  PROVIDER_UNAVAILABLE: 'The AI writer is unavailable right now, so this answer was built directly from current catalog data.',
  PROVIDER_BAD_OUTPUT: 'The AI writer returned an unusable draft, so this answer was built directly from current catalog data.',
  DRAFT_REJECTED: 'The AI draft could not be verified against the catalog, so this answer was built directly from current catalog data.'
};

function fallback(retrieval, code) {
  return { ...buildRuleAnswer(retrieval), mode: 'rules', notice: FALLBACK_NOTICES[code] ?? FALLBACK_NOTICES.PROVIDER_UNAVAILABLE, fallbackReason: code };
}

// Remove obvious personal data before the question leaves the server.
export function redactQuestion(question) {
  return String(question)
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[email removed]')
    .replace(/(?:\+?\d[\s-]?){10,}/g, '[number removed]');
}

// Only the selected candidates' public fields are sent to the provider: enough to name,
// describe, price and confirm availability. No other products, orders, or customer data.
export function toProviderFacts(candidates) {
  return candidates.map(({ id, name, category, description, price, stock }) => ({ id, name, category, description, pricePHP: price, stock }));
}

/**
 * Answer a customer question with catalog retrieval, an optional AI draft, and verification.
 * @param {object} options
 * @param {Array} options.products active catalog records from the database
 * @param {string} options.question validated customer question
 * @param {{ draft: Function } | null} options.provider AI provider, or null when not configured
 * @param {(event: object) => void} [options.log] receives fallback events (codes only, never secrets)
 */
export async function answerQuestion({ products, question, provider, log = () => {} }) {
  const retrieval = retrieveCandidates(products, question);

  // No eligible product: answer honestly and do not spend a provider call.
  if (retrieval.candidates.length === 0) return { ...buildRuleAnswer(retrieval), mode: 'rules', notice: null };
  if (!provider) return fallback(retrieval, 'PROVIDER_NOT_CONFIGURED');

  let draftText;
  try {
    draftText = await provider.draft({
      question: redactQuestion(question),
      budget: retrieval.budget,
      products: toProviderFacts(retrieval.candidates)
    });
  } catch (error) {
    const code = FALLBACK_NOTICES[error?.code] ? error.code : 'PROVIDER_UNAVAILABLE';
    log({ event: 'provider_failed', code: error?.code ?? 'UNKNOWN', status: error?.status });
    return fallback(retrieval, code);
  }

  const verified = verifyDraft(draftText, retrieval);
  if (!verified.ok) {
    log({ event: 'draft_rejected', code: verified.reason, detail: verified.detail });
    return fallback(retrieval, 'DRAFT_REJECTED');
  }

  const selected = verified.productIds.map((id) => retrieval.candidates.find((fact) => fact.id === id));
  return { answer: verified.answer, ...toResponseProducts(selected), mode: 'ai', notice: null };
}
