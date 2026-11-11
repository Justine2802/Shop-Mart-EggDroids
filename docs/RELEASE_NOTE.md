# ShopSmart release note: local release candidate

- **Version:** 1.0.1-rc1. Based on commit `5025e85` (`feature/grounded-assistant`) plus the quality fixes in this submission. Record the final commit hash after committing.
- **Date:** 2026-11-12
- **Deployment status:** **Local release candidate only.** No hosting or database was approved, so **live staging was not completed**. See [DEPLOYMENT_PLAN.md](DEPLOYMENT_PLAN.md) for the planned layout.

## Verified working features

All of these were checked on 2026-11-12 with fictional data. Details are in [TEST_RECORD.md](TEST_RECORD.md).

- **Browse and search:** 6 products, details page, server-side search, a no-results message, category filter and sorting.
- **Cart:** add, +/−, typed quantity, remove. The quantity is capped at stock and totals are correct (₱3,550 → ₱9,350 → ₱8,700 observed).
- **Simulated checkout:** a valid order creates one order and decrements stock (orders #4–#7). Invalid input is refused. The page now **names the field to fix**.
- **Stock rule:** the server re-checks stock inside a transaction. Out-of-stock or over-stock orders get 409 with the exact available count, and the cart is unchanged.
- **Assistant:** answers are grounded in live catalog data, with product links and sources. It says honestly when nothing matches, including when a product exists but is out of stock.
- **Failure handling:** if the AI provider is down, the assistant gives a rule-based answer with a notice. If the API is down, loading ends with "Could not reach the ShopSmart server…".
- **Health:** `GET /api/health` returns `{"status":"ok"}`.

## Fixed in this release

| ID | Fix |
| --- | --- |
| DEFECT-01 | Checkout now says which field the server rejected, for example an email such as `juan@localhost` |
| DEFECT-02 | Product ids above the INTEGER range now return 400/422 instead of 500 |
| DEFECT-03 | Malformed JSON returns `400 INVALID_JSON` with a safe message and a `traceId` |
| DEFECT-04 | `%` and `_` in search are matched literally instead of as wildcards |

There are 9 new regression tests. `npm run check` passes: lint, 8 frontend tests, 49 backend tests and the build ([evidence/final-check.log](evidence/final-check.log)).

## Known limitations

- **No authentication or roles.** Anyone who can reach the API can place a simulated order. There is no route that reads orders back. Use fictional data only.
- **Live AI not verified in this session.** Gemini integration is present (server-side key), but the local `.env` deliberately points at a closed port to test the outage path. To see AI-drafted answers, remove the `GEMINI_BASE_URL` line from `backend/.env` and set a valid `GEMINI_API_KEY`.
- **Cart is not persisted.** A page refresh empties it.
- **The cart stock figure can be stale.** The server still prevents overselling.
- **Multi-word search** ("usb lamp") matches the whole phrase only.
- **Rate limiting** needs `trust proxy` before any hosted deployment (see the deployment plan).

## Local startup for an evaluator

Follow the [README](../README.md) from "Set up the ShopSmart project". In short: create the PostgreSQL user and database, copy both `.env.example` files to `.env`, then run `npm install`, `npm run db:generate`, `npm run db:migrate`, `npm run db:seed` (**first time only**; it deletes orders), `npm run check` and `npm run dev`. Open http://localhost:5173 and http://localhost:3000/api/health.

Extra configuration beyond the original README, all optional and all in `backend/.env` only:

```env
AI_PROVIDER=gemini          # or "none" for rule-based answers only
GEMINI_API_KEY=             # leave empty to use rule-based answers
GEMINI_MODEL=gemini-3.5-flash-lite
AI_TIMEOUT_MS=8000
# GEMINI_BASE_URL=http://127.0.0.1:9   # only to simulate a provider outage
```

## Local smoke test (final)

On 2026-11-12, after the fixes:

| Check | Result |
| --- | --- |
| `npm run check` | Pass (exit 0) |
| `/api/health` | `{"status":"ok"}` |
| Products | 6 loaded in the browser and through the API |
| Cart → checkout | Laptop Stand ×1. `juan@localhost` rejected with the field named. Corrected email → order **#7**, ₱1,200.00 |
| Assistant | "Is there a laptop stand under 1500?" → Laptop Stand ₱1,200, 8 in stock (stock reflects order #7). The AI outage gave a controlled fallback |
| Data preserved | Orders 1–3 from before testing are still present (7 orders in total). No reseed was run |
| Secrets | Only `.env.example` files are tracked. `frontend/dist` contains no key, `DATABASE_URL` or password, only the public `http://localhost:3000/api` |
| Privacy | Only fictional names and `@example.com` emails were used |

## Team record

| Member | Test run | Contribution | Issue they can explain |
| --- | --- | --- | --- |
| Calma, Wendy | _e.g. T2 Cart totals_ | _…_ | _e.g. L2 stale cart stock vs. the server stock check_ |
| Esguerra, Justine | _e.g. T3 Checkout_ | _…_ | _e.g. DEFECT-01 generic validation message_ |
| Magar, Harman | _e.g. T6 Failure / AI outage_ | _…_ | _e.g. DEFECT-02 INTEGER overflow → 500_ |
