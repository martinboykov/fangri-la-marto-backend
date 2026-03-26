# Backend: Examination

## Stack

| Concern | Technology |
|---|---|
| Runtime | Node.js 20+ |
| Framework | Express 4 |
| Language | TypeScript 5 |
| Auth | `jsonwebtoken` 9 (JWT) |
| HTTP Requests | Native `fetch` (Node 20 built-in) |
| Rate Limiting | `express-rate-limit` 7 |
| CORS | `cors` 2 |
| Dev Server | `ts-node-dev` (watch + transpile-only) |
| Database | None — Shopify is the source of truth |

---

## Entry Points

| File | Purpose |
|---|---|
| `src/index.ts` | Reads `PORT` from env (default 3000); calls `app.listen('0.0.0.0', PORT)` |
| `src/app.ts` | Express application setup: middleware, CORS, rate limiting, route mounting |

---

## App Setup (`src/app.ts`)

Middleware registered in order:

1. **Raw body capture** — intercepts `/api/webhooks/shopify` before JSON parsing to preserve raw bytes for HMAC verification
2. `express.json()` — standard JSON body parsing for all other routes
3. **CORS** — dynamic origin allowlist: `FRONTEND_URL` env var + `localhost:4200` + `localhost:8100`; `credentials: true`
4. **Rate limiting** — 200 requests per 15-minute window, standard headers, no legacy headers
5. Route mounting at `/api/*`
6. `GET /api/health` — health check: `{ status: 'ok', timestamp }`
7. Generic 404 handler and error handler

---

## Shopify Config (`src/config/shopify.ts`)

Exports `shopifyConfig` and two pre-built URL constants:

- `storefrontApiUrl` = `https://fangri-la-2.myshopify.com/api/2024-07/graphql.json`
- `adminApiUrl` = `https://fangri-la-2.myshopify.com/admin/api/2024-07/graphql.json`
- API version hardcoded: `2024-07`

---

## GraphQL Utilities

### `src/utils/shopify-storefront.ts` — `storefrontQuery<T>(query, variables?, customerAccessToken?)`
- Native `fetch` POST to Storefront API
- Sets `X-Shopify-Storefront-Access-Token` header always
- Optionally sets `X-Shopify-Customer-Access-Token` for customer-scoped queries
- Throws on HTTP errors or GraphQL `errors[]` in response

### `src/utils/shopify-admin.ts` — `adminQuery<T>(query, variables?)`
- Native `fetch` POST to Admin API
- Sets `X-Shopify-Access-Token` header (private admin token, never exposed to frontend)
- Same error-throwing pattern

---

## Authentication Middleware (`src/middleware/auth.ts`)

- `requireAuth` middleware: extracts `Bearer` token from `Authorization` header, verifies with `jwt.verify()` using `JWT_SECRET` env var
- Extends Express `Request` with `AuthRequest` interface: `customer?: { customerAccessToken, email }`
- On success, attaches decoded payload to `req.customer` and calls `next()`
- JWT tokens are signed with **30-day expiry** at login; payload contains the Shopify customer access token + email

---

## API Routes

### Auth (`src/routes/auth.ts`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | — | Calls Shopify `customerCreate`; returns customer or `422` with `customerUserErrors` |
| `POST` | `/api/auth/login` | — | Calls `customerAccessTokenCreate`; wraps Shopify token in 30-day JWT; returns `{ token, expiresAt }` |
| `DELETE` | `/api/auth/logout` | Required | Calls `customerAccessTokenDelete` on Shopify; invalidates the Shopify session |
| `GET` | `/api/auth/me` | Required | Calls Shopify `customer` query via embedded Shopify token; returns full profile including `defaultAddress` |

### Cart (`src/routes/cart.ts`)

All routes use a reusable `CART_FRAGMENT` GraphQL fragment to avoid repetition.

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/cart` | `cartCreate` |
| `GET` | `/api/cart/:cartId` | `cart(id)` query |
| `POST` | `/api/cart/:cartId/lines` | `cartLinesAdd` |
| `PUT` | `/api/cart/:cartId/lines` | `cartLinesUpdate` |
| `DELETE` | `/api/cart/:cartId/lines/:lineId` | `cartLinesRemove` |
| `PUT` | `/api/cart/:cartId/buyer` | `cartBuyerIdentityUpdate` (attaches shipping address before checkout) |
| `GET` | `/api/cart/:cartId/checkout-url` | Fetches only `checkoutUrl` from cart |

### Collections (`src/routes/collections.ts`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/collections/:handle/products` | Paginated product listing; supports `?first=24&after=<cursor>`; returns collection metadata + product edges with `pageInfo` for cursor-based infinite scroll |

Each product includes: variants (first 10), metafields (`custom.availability_tier`), tags, inventory.

### Products (`src/routes/products.ts`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/products/:handle` | Rich product query: all images (first 20), all variants (first 100) with `selectedOptions` + `compareAtPrice`, product options, metafields, `descriptionHtml` |

### Customer / Orders (`src/routes/customer.ts`) — all protected

| Method | Path | API Used | Description |
|---|---|---|---|
| `GET` | `/api/customer/orders` | Storefront API | Last 50 orders sorted by `PROCESSED_AT` desc; line items include variant images |
| `GET` | `/api/customer/orders/:id` | Admin API | Rich order detail including fulfillment tracking (`trackingInfo { number url company }`); normalizes plain IDs to `gid://shopify/Order/<id>` |

### Webhooks (`src/routes/webhooks.ts`)

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/webhooks/shopify` | HMAC verification via `crypto.timingSafeEqual` against `X-Shopify-Hmac-Sha256`; handles `orders/create`, `orders/paid`, `orders/fulfilled`, `orders/cancelled`; currently logs to console (stub implementation) |

---

## Environment Variables

From `.env.example`:

| Variable | Purpose |
|---|---|
| `SHOPIFY_STOREFRONT_ACCESS_TOKEN` | Public Storefront API token |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | Private Admin API token (never exposed to frontend) |
| `SHOPIFY_WEBHOOK_SECRET` | HMAC secret for webhook verification |
| `JWT_SECRET` | Secret for signing/verifying app JWTs |
| `FRONTEND_URL` | Allowed CORS origin (production frontend URL) |
| `PORT` | Server port (default 3000) |

---

## Key Architectural Patterns

### No Database
All persistence is delegated to Shopify. The backend is a pure proxy + JWT issuer.

### JWT Wraps Shopify Token
The Shopify `customerAccessToken` is embedded inside the app's JWT payload. The backend always has the Shopify token available on authenticated requests without any database lookup.

### Raw Body Capture for HMAC
A custom middleware in `app.ts` intercepts only `/api/webhooks/shopify` before `express.json()` runs, concatenating the raw request body into `req.rawBody`. HMAC must be computed over exact raw bytes — `express.json()` would consume and transform the stream.

### Dual API Strategy
Order list uses the Storefront API (scoped to the customer's own data via their access token). Order detail uses the Admin API to access richer fulfillment tracking information not available via Storefront API.

---

## Key Config Files

| File | Notes |
|---|---|
| `package.json` | 5 runtime deps: `cors`, `express`, `express-rate-limit`, `jsonwebtoken`, `node-fetch`; engines: `node>=20` |
| `tsconfig.json` | Target ES2022, CommonJS modules, strict mode, source maps, declaration files; `outDir: dist`, `rootDir: src` |
| `nixpacks.toml` | Railway build: `npm ci && npm run build` → start: `npm start` (runs compiled `dist/index.js`) |
