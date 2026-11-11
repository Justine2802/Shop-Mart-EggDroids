# ShopSmart release note: release candidate on private staging

- **Version:** 1.0.1-rc1. Commits `59f4904` (quality fixes and docs) and `c293c5a` (trust Render's proxy in production), branch `feature/grounded-assistant`.
- **Date:** 2026-11-12
- **Deployment status:** **Private staging on Render**, smoke test passed on 2026-11-12 (see "Staging smoke test" below). Live AI drafting is **not** enabled on staging, because no `GEMINI_API_KEY` is set there; the assistant answers from catalog rules.
  - Frontend: https://shop-mart-eggdroids-1.onrender.com
  - API health: https://shop-mart-eggdroids.onrender.com/api/health
  - Layout and configuration: [DEPLOYMENT_PLAN.md](DEPLOYMENT_PLAN.md)

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
- **Render free plan:** the API sleeps when idle, so the first request after a pause can take up to about a minute. Open `/api/health` before a demo.
- **Staging is reachable by anyone with the URL** and has no sign-in. Share the URL privately and use fictional data only.

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

## Staging smoke test

Run on 2026-11-12 at about 17:30 UTC against the Render URLs above, with fictional data only.

| Check | Result |
| --- | --- |
| `GET /api/health` | `{"status":"ok"}`, HTTP 200 |
| Frontend reaches the intended API | The deployed bundle calls `https://shop-mart-eggdroids.onrender.com/api`, not `localhost`. Products load: 6 cards |
| Search | "keyboard" → 1 product; `%` → none (DEFECT-04 fix is live) |
| Error handling | Product id `99999999999` → 400; malformed JSON → 400 `INVALID_JSON` with `traceId` |
| Cart → checkout | USB-C Study Lamp ×1. `juan@localhost` rejected with "Email address: enter a valid email address…". Corrected email → **order #1, ₱900.00** ([screenshot](evidence/staging-checkout-order-1.jpg)). Lamp stock 10 → 9 in the database |
| Assistant | "I need a webcam under 1500 pesos" → 1080p Webcam ₱1,450 with source; "Do you sell drones?" → honest no match. Mode `rules`, notice "AI drafting is not configured on this server…" |
| CORS | API answers with `Access-Control-Allow-Origin: https://shop-mart-eggdroids-1.onrender.com` only |
| SPA reload | `/cart` returns 200 (rewrite works) |
| Orders privacy | `GET /api/orders` → 404; no route returns customer records |
| Secrets | The deployed JS bundle contains no key, `DATABASE_URL` or Postgres URL. `DATABASE_URL` is set only in the Render API service settings |

## Team record

| Member | Test run | Contribution | Issue they can explain |
| --- | --- | --- | --- |
| Calma, Wendy | T2 Cart: add, +/−, typed quantity above stock, remove; totals ₱3,550 → ₱9,350 → ₱8,700. T4 Stock conflict (409, cart unchanged) | Recorded the test results in the test record. Fixed DEFECT-04 (search wildcards `%` and `_`) | L2: the cart keeps the stock figure from when an item was added, but the server re-checks stock in a transaction, so overselling cannot happen |
| Esguerra, Justine | T3 Checkout with valid and invalid details (`juan@localhost` rejected, then orders #6 and #7). Staging smoke test on Render | Fixed DEFECT-01 (checkout names the rejected field). Deployed to Render (static site, web service, Postgres) and added `trust proxy` for production | DEFECT-01: the browser accepts `juan@localhost` as an email, but the server's validator does not, so the page must show the server's field errors |
| Magar, Harman | T5 Assistant questions and T6 Failure: AI provider outage fallback and API stopped | Fixed DEFECT-02 (ids beyond the INTEGER range → 400/422 instead of 500) and DEFECT-03 (`INVALID_JSON`). Wrote the deployment plan and diagram | DEFECT-02: `99999999999` is larger than PostgreSQL's INTEGER maximum (2,147,483,647), so Prisma failed with a 500 until the validator capped it |
