# Fangri-la — Backend

Node.js/Express API proxy that sits between the Ionic/Angular frontend and Shopify's GraphQL APIs.

## Overview

- Proxies all Shopify Storefront API calls (products, cart, checkout, customer auth)
- Proxies Shopify Admin API calls server-side only (order detail)
- Issues and verifies JWT tokens for customer sessions
- Validates incoming Shopify webhook payloads via HMAC

**Live URL:** `https://fangri-la-marto.up.railway.app`
**Health check:** `GET /api/health`

---

## Tech Stack

| | |
|---|---|
| Runtime | Node.js 20 |
| Framework | Express 4 |
| Language | TypeScript 5 |
| Auth | jsonwebtoken 9 |
| Rate limiting | express-rate-limit 7 |
| Deployment | Railway (Nixpacks) |

---

## Project Structure

```
backend/
├── .env.example              Environment variable template
├── .gitignore
├── nixpacks.toml             Railway build config
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts              Entry point — starts HTTP server
    ├── app.ts                Express app setup (CORS, rate-limit, routes, error handler)
    ├── config/
    │   └── shopify.ts        Reads env vars, exports store domain + API tokens
    ├── utils/
    │   ├── shopify-storefront.ts   GraphQL fetch wrapper for Storefront API
    │   └── shopify-admin.ts        GraphQL fetch wrapper for Admin API
    ├── middleware/
    │   └── auth.ts           requireAuth middleware — verifies JWT, attaches customer payload
    └── routes/
        ├── auth.ts           /api/auth — register, login, logout, me
        ├── cart.ts           /api/cart — full cart CRUD + buyer identity + checkout URL
        ├── collections.ts    /api/collections — product listing by collection handle
        ├── products.ts       /api/products — product detail with variants + metafields
        ├── customer.ts       /api/customer — order history (Storefront) + order detail (Admin)
        └── webhooks.ts       /api/webhooks/shopify — HMAC-verified webhook handler
```

---

## Local Development

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

Edit `.env`:

```env
SHOPIFY_STORE_DOMAIN=
SHOPIFY_STOREFRONT_ACCESS_TOKEN=
SHOPIFY_ADMIN_ACCESS_TOKEN=
SHOPIFY_WEBHOOK_SECRET=
JWT_SECRET=<generate — see below>
FRONTEND_URL=http://localhost:4200
NODE_ENV=development
PORT=3000
```

Generate a `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Start the development server

```bash
npm run dev
```

Runs `ts-node-dev` with auto-reload on file changes.
API available at `http://localhost:3000`.

---

## Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start with ts-node-dev (watch mode) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled output from `dist/` |

---

## API Reference

All routes are prefixed with `/api`.

### Auth

| Method | Route | Auth required | Description |
|---|---|---|---|
| `POST` | `/auth/register` | No | Create a new customer account |
| `POST` | `/auth/login` | No | Login — returns a signed JWT |
| `DELETE` | `/auth/logout` | Yes | Deletes the Shopify customer access token |
| `GET` | `/auth/me` | Yes | Returns the authenticated customer's profile |

**Login request body:**
```json
{ "email": "user@example.com", "password": "secret" }
```

**Login response:**
```json
{ "token": "<jwt>", "expiresAt": "2026-01-01T00:00:00Z" }
```

All protected routes require the header:
```
Authorization: Bearer <jwt>
```

---

### Cart

| Method | Route | Auth required | Description |
|---|---|---|---|
| `POST` | `/cart` | No | Create a new cart |
| `GET` | `/cart/:cartId` | No | Get cart by ID |
| `POST` | `/cart/:cartId/lines` | No | Add line items |
| `PUT` | `/cart/:cartId/lines` | No | Update line item quantities |
| `DELETE` | `/cart/:cartId/lines/:lineId` | No | Remove a line item |
| `PUT` | `/cart/:cartId/buyer` | No | Update buyer identity and shipping address |
| `GET` | `/cart/:cartId/checkout-url` | No | Get the Shopify hosted checkout URL |

**Add lines request body:**
```json
{ "lines": [{ "merchandiseId": "gid://shopify/ProductVariant/123", "quantity": 1 }] }
```

---

### Collections

| Method | Route | Auth required | Description |
|---|---|---|---|
| `GET` | `/collections/:handle/products` | No | List products in a collection |

**Query parameters:**
- `first` — number of products to return (default `24`)
- `after` — pagination cursor

---

### Products

| Method | Route | Auth required | Description |
|---|---|---|---|
| `GET` | `/products/:handle` | No | Product detail with variants, images, and metafields |

---

### Customer

| Method | Route | Auth required | Description |
|---|---|---|---|
| `GET` | `/customer/orders` | Yes | Customer's order history |
| `GET` | `/customer/orders/:id` | Yes | Order detail via Admin API (includes tracking) |

---

### Webhooks

| Method | Route | Description |
|---|---|---|
| `POST` | `/webhooks/shopify` | Receives and HMAC-verifies Shopify webhook events |

Handled topics: `orders/create`, `orders/paid`, `orders/fulfilled`, `orders/cancelled`

---

## Authentication Flow

```
POST /api/auth/login
  └─► Shopify customerAccessTokenCreate (Storefront API)
        └─► Returns { accessToken, expiresAt }
              └─► Backend signs JWT { customerAccessToken, email }
                    └─► Client stores JWT in localStorage
                          └─► Client sends Authorization: Bearer <jwt> on every request
                                └─► requireAuth middleware verifies JWT
                                      └─► Extracts customerAccessToken for Shopify API calls
```

---

## Webhook Verification

Shopify signs each webhook request with an HMAC-SHA256 digest in the
`X-Shopify-Hmac-Sha256` header. The backend re-computes the digest from
`SHOPIFY_WEBHOOK_SECRET` and the raw request body and rejects any request where
they do not match.

---

## Deployment

### Set environment variables in Railway

In the Railway dashboard → **fangri-la** service → **Variables**:

```
SHOPIFY_STORE_DOMAIN=
SHOPIFY_STOREFRONT_ACCESS_TOKEN=
SHOPIFY_ADMIN_ACCESS_TOKEN=
SHOPIFY_WEBHOOK_SECRET=
JWT_SECRET=<your-64-char-hex-string>
FRONTEND_URL=https://vibrant-miracle-marto.up.railway.app
NODE_ENV=production
PORT=3000
```

### Deploy

```bash
railway up --path-as-root backend/ --service fangri-la --detach
```

### Verify

```bash
curl https://fangri-la-marto.up.railway.app/api/health
# {"status":"ok","timestamp":"..."}
```

### View logs

```bash
railway logs --service fangri-la
```
