# ShopSmart API examples

Start the application with `npm run dev`, then send these requests through Bruno or another authorized API client.

## Health check

```http
GET http://localhost:3000/api/health
```

Returns `{"status":"ok","database":"ok"}` after a real `SELECT 1` against PostgreSQL. If the database is unreachable it returns **503** `{"status":"degraded","database":"unreachable","traceId":"…"}`.

## Customer accounts

Sign-in uses an httpOnly session cookie (`shopsmart_session`). In Bruno, keep the cookie jar on so later requests send it. Use fictional `@example.com` accounts only.

```http
POST http://localhost:3000/api/auth/register
Content-Type: application/json

{ "name": "Ana Reyes", "email": "ana@example.com", "password": "at-least-8-chars" }
```

`201` plus a `Set-Cookie` header. The same email again returns `409 EMAIL_TAKEN`.

```http
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{ "email": "ana@example.com", "password": "at-least-8-chars" }
```

`200`, or `401 INVALID_CREDENTIALS` (the message does not say whether the email exists). Sign-in and sign-up are limited to 10 attempts per IP per 15 minutes.

```http
GET  http://localhost:3000/api/auth/me      # { "user": {...} } or { "user": null } for a guest
POST http://localhost:3000/api/auth/logout  # 204; the session is deleted on the server
```

## Product list

```http
GET http://localhost:3000/api/products
```

## One product

```http
GET http://localhost:3000/api/products/1
```

## Create a simulated order

Requires a signed-in customer (guest: `401 AUTH_REQUIRED`). The order is saved with that customer as its owner.

```http
POST http://localhost:3000/api/orders
Content-Type: application/json

{
  "customerName": "Ana Reyes",
  "email": "ana@example.com",
  "address": "Angeles City, Pampanga",
  "items": [
    { "productId": 1, "quantity": 1 },
    { "productId": 2, "quantity": 1 }
  ]
}
```

The server ignores prices from the browser and reads authoritative prices from PostgreSQL.

## Read your own orders

```http
GET http://localhost:3000/api/orders
GET http://localhost:3000/api/orders/10
```

| Who asks | Result |
| --- | --- |
| Guest (no cookie) | `401 AUTH_REQUIRED` |
| The customer who placed order 10 | `200` with items and product names |
| Any other signed-in customer | `404 ORDER_NOT_FOUND`, the same as a missing order, so ids cannot be probed |

Orders placed before accounts existed have no owner, so nobody can read them through the API.

## Ask the starter assistant

```http
POST http://localhost:3000/api/assistant/questions
Content-Type: application/json

{
  "question": "Which keyboard is below ₱2,000?"
}
```
