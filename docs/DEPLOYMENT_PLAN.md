# ShopSmart deployment plan (private staging)

**Status:** this is a plan. No hosting was approved for this activity, so the release is **local only**. The platform names below are an example layout. Check each command against the approved platform's current documentation before using it.

## Architecture

```text
                       ┌──────────────────────────── INTERNET (HTTPS) ────────────────────────────┐
                       │                                                                           │
 ┌──────────────┐  (1) GET html/js/css   ┌───────────────────────────┐                            │
 │   Browser    │ ─────────────────────► │ Static host (Vite dist/)  │  build-time config only:    │
 │ (evaluator)  │                        │ https://shopsmart-staging │  VITE_API_URL (public)      │
 │              │                        │      .<static-host>       │                             │
 │              │  (2) fetch /api/*      └───────────────────────────┘                             │
 │              │ ─────────────────────► ┌───────────────────────────┐  runtime secrets:           │
 └──────────────┘   CORS: Origin must    │ Express API (Node 22)     │  DATABASE_URL, GEMINI_API_KEY│
                    equal FRONTEND_URL   │ https://shopsmart-api-    │  public-ish: FRONTEND_URL,  │
                                         │   staging.<api-host>      │  NODE_ENV, PORT, AI_*        │
                                         └──────┬─────────────┬──────┘                             │
                       (3) TLS, private network │             │ (4) HTTPS + x-goog-api-key header   │
                           or SSL-required URL  ▼             ▼                                     │
                                   ┌──────────────────┐  ┌──────────────────────────┐               │
                                   │ PostgreSQL 16    │  │ Google Gemini API        │               │
                                   │ (managed)        │  │ generativelanguage.      │               │
                                   │ Product, Order,  │  │ googleapis.com           │               │
                                   │ OrderItem        │  │ (optional: falls back to │               │
                                   └──────────────────┘  │ rule answers if down)    │               │
                                                         └──────────────────────────┘               │
                       └───────────────────────────────────────────────────────────────────────────┘
```

| Path | Crosses the internet? | Configuration |
| --- | --- | --- |
| (1) Browser → static frontend | Yes (HTTPS) | None at runtime. `VITE_API_URL` is compiled into the JS bundle, so it is **public** |
| (2) Browser → Express API | Yes (HTTPS) | API checks `Origin` against `FRONTEND_URL` (CORS) |
| (3) API → PostgreSQL | Only if the database is on another provider; prefer the same region or a private network. Use SSL (`?sslmode=require`) when it is public | `DATABASE_URL` (**secret**, API only) |
| (4) API → Gemini | Yes (HTTPS) | `GEMINI_API_KEY` (**secret**, API only), `GEMINI_MODEL`, `AI_TIMEOUT_MS`, `AI_PROVIDER` |

## Answers to the plan questions

**Where will the Vite build files be hosted, and which API URL will they use?**
On a static host such as Netlify, Vercel, Cloudflare Pages, or a Render Static Site. Build command: `npm ci && npm run build --workspace frontend`. Publish directory: `frontend/dist`. Set `VITE_API_URL=https://shopsmart-api-staging.<api-host>/api` in the host's **build** environment. Add an SPA rewrite (`/* → /index.html`) so `/cart`, `/checkout` and `/assistant` survive a reload.

**Where will Express run, and what URL serves `/api/health`?**
On a Node web service such as Render Web Service or Railway, using Node 22 (`.nvmrc`). Start command: `npm run start --workspace backend`. Health check path: `/api/health`, for example `https://shopsmart-api-staging.<api-host>/api/health`, which returns `{"status":"ok"}`.

**Where will PostgreSQL run, and how does the server get `DATABASE_URL` securely?**
On a managed PostgreSQL 16 instance on the same platform and region as the API, such as Render Postgres or Neon. Enter `DATABASE_URL` only in the API service's secret environment settings. It must never go in the repository, the frontend host, screenshots or chat. Use a dedicated database user with a strong generated password, not `shopsmart_dev`.

**Which origin does `FRONTEND_URL` / CORS allow?**
Exactly one origin: `FRONTEND_URL=https://shopsmart-staging.<static-host>`, with no trailing slash and no wildcard. `app.js` passes this value to `cors({ origin })`. Preview-deploy URLs are not allowed unless the team adds them on purpose.

**Where is the provider key stored, and how is it kept out of the bundle and repo?**
`GEMINI_API_KEY` is set only as a secret environment variable on the API service. The key is safe from the browser because:
- It has no `VITE_` prefix, so Vite never adds it to the browser bundle.
- Only `backend/src/services/aiProvider.js` reads it, and it sends the key in a request header, never in a URL or a log line.
- `.gitignore` excludes `.env`, and only the `.env.example` files are tracked.

Before every release, run: `grep -rE "AIza|GEMINI|DATABASE_URL|postgresql://" frontend/dist` (expected: no output) and `git ls-files | grep .env` (expected: only the `.env.example` files). Both were verified on 2026-11-12. If the key is missing or the provider is down, the assistant still answers from catalog rules.

**How are migrations applied without wiping orders?**
Run `npx prisma migrate deploy` from `backend/` with the staging `DATABASE_URL`. Use it as a pre-deploy or release command, after `npm ci` and `npx prisma generate`. `migrate deploy` only applies committed migrations that have not run yet. It never resets data and never creates new migrations.
- **Do not** run `npm run db:migrate` (`migrate dev`) against staging. It can prompt for a reset.
- **Do not** run `npm run db:seed` against staging after first use, because `seed.js` deletes all orders and products. Seed only once, on the empty staging database, and only if the team agrees. Before any risky change, take a provider snapshot or a `pg_dump`.

**Who can access staging, and what data is used?**
Access is limited to team members and the instructor, behind the host's password protection or access control, or an unlisted URL shared privately. The app has **no authentication** and stores names, emails and addresses with every order. So:
- Use fictional customer data only (`*@example.com` addresses).
- Show a "simulated store, do not enter real details" notice. The footer already says "Simulated purchases only".
- Do not advertise the URL. Shut staging down or wipe it after grading.

## Environment variables by service

| Service | Variable | Example | Secret? |
| --- | --- | --- | --- |
| Static frontend (build time) | `VITE_API_URL` | `https://shopsmart-api-staging.<api-host>/api` | No (public) |
| API | `DATABASE_URL` | `postgresql://<user>:<password>@<host>:5432/shopsmart?schema=public&sslmode=require` | **Yes** |
| API | `FRONTEND_URL` | `https://shopsmart-staging.<static-host>` | No |
| API | `NODE_ENV` | `production` | No |
| API | `PORT` | Usually set by the platform | No |
| API | `AI_PROVIDER` | `gemini` (or `none` to disable) | No |
| API | `GEMINI_API_KEY` | (from Google AI Studio) | **Yes** |
| API | `GEMINI_MODEL`, `AI_TIMEOUT_MS` | `gemini-3.5-flash-lite`, `8000` | No |
| API | `GEMINI_BASE_URL` | **Leave unset** in staging. Locally it is set to `http://127.0.0.1:9` only to simulate an outage | No |

## Deployment order

1. Create the PostgreSQL instance and copy its connection string into the API service's secrets.
2. Deploy the API: `npm ci` → `npx prisma generate` → `npx prisma migrate deploy` → start `npm run start --workspace backend`. Check `/api/health`.
3. First use only: seed the empty database once, or insert fictional products with Prisma Studio.
4. Set `VITE_API_URL` and deploy the frontend. Set `FRONTEND_URL` on the API to the final frontend origin and redeploy the API.
5. Run the smoke test below and record the date, URLs and results. Do not show credentials in screenshots.

## Known deployment risks to fix before staging

- **Rate limiting behind a proxy.** Hosted platforms put the API behind a reverse proxy, but `app.js` does not set `app.set('trust proxy', 1)`. As a result, `express-rate-limit` either warns about `X-Forwarded-For` or counts every visitor as the same IP, so 20 assistant questions per minute would be shared by everyone. Add the setting, with the hop count the platform documents, when deploying.
- **No authentication on `POST /api/orders`.** This is acceptable only for a private staging app that uses fictional data.

## Staging smoke test (to repeat on real URLs)

| Step | Pass condition |
| --- | --- |
| `GET <api>/api/health` | `{"status":"ok"}` |
| Open `<frontend>/` | Products load. The DevTools Network tab shows calls to `<api>/api/products`, not `localhost` |
| Search "keyboard", then "zzzz" | 1 result; then "No products match…" |
| Add 1 item → cart → checkout with fictional data | Order number shown. The total equals the cart total |
| Assistant: "I need a webcam under 1500 pesos" | Answer cites the product and links to its page. With the AI key removed, a fallback notice is shown and the answer is still correct |
| Reload the API and frontend | Prior orders still exist (count did not drop) |
