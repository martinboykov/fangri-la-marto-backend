import { Router, Request, Response } from 'express';
import { storefrontQuery } from '../utils/shopify-storefront';
import { AuthRequest } from '../middleware/auth';
import jwt from 'jsonwebtoken';
import { AuthPayload } from '../middleware/auth';

const router = Router();

const CART_FRAGMENT = `
  fragment CartFields on Cart {
    id
    checkoutUrl
    totalQuantity
    cost {
      subtotalAmount { amount currencyCode }
      totalAmount { amount currencyCode }
      totalTaxAmount { amount currencyCode }
    }
    lines(first: 100) {
      edges {
        node {
          id
          quantity
          cost {
            totalAmount { amount currencyCode }
          }
          merchandise {
            ... on ProductVariant {
              id
              title
              price { amount currencyCode }
              product {
                id
                title
                handle
                featuredImage { url altText }
              }
            }
          }
        }
      }
    }
  }
`;

// POST /api/cart
router.post('/', async (req: Request, res: Response) => {
  const mutation = `
    ${CART_FRAGMENT}
    mutation cartCreate($input: CartInput) {
      cartCreate(input: $input) {
        cart { ...CartFields }
        userErrors { field message }
      }
    }
  `;

  try {
    const data = await storefrontQuery<{ cartCreate: { cart: unknown; userErrors: unknown[] } }>(
      mutation,
      { input: req.body || {} }
    );
    res.status(201).json(data.cartCreate.cart);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/cart/:cartId
router.get('/:cartId', async (req: Request, res: Response) => {
  const query = `
    ${CART_FRAGMENT}
    query cart($id: ID!) {
      cart(id: $id) { ...CartFields }
    }
  `;

  try {
    const data = await storefrontQuery<{ cart: unknown }>(query, { id: req.params.cartId });
    if (!data.cart) {
      res.status(404).json({ error: 'Cart not found' });
      return;
    }
    res.json(data.cart);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/cart/:cartId/lines
router.post('/:cartId/lines', async (req: Request, res: Response) => {
  const mutation = `
    ${CART_FRAGMENT}
    mutation cartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
      cartLinesAdd(cartId: $cartId, lines: $lines) {
        cart { ...CartFields }
        userErrors { field message }
      }
    }
  `;

  try {
    const data = await storefrontQuery<{ cartLinesAdd: { cart: unknown } }>(mutation, {
      cartId: req.params.cartId,
      lines: req.body.lines,
    });
    res.json(data.cartLinesAdd.cart);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// PUT /api/cart/:cartId/lines
router.put('/:cartId/lines', async (req: Request, res: Response) => {
  const mutation = `
    ${CART_FRAGMENT}
    mutation cartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
      cartLinesUpdate(cartId: $cartId, lines: $lines) {
        cart { ...CartFields }
        userErrors { field message }
      }
    }
  `;

  try {
    const data = await storefrontQuery<{ cartLinesUpdate: { cart: unknown } }>(mutation, {
      cartId: req.params.cartId,
      lines: req.body.lines,
    });
    res.json(data.cartLinesUpdate.cart);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// DELETE /api/cart/:cartId/lines/:lineId
router.delete('/:cartId/lines/:lineId', async (req: Request, res: Response) => {
  const mutation = `
    ${CART_FRAGMENT}
    mutation cartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
      cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
        cart { ...CartFields }
        userErrors { field message }
      }
    }
  `;

  try {
    const data = await storefrontQuery<{ cartLinesRemove: { cart: unknown } }>(mutation, {
      cartId: req.params.cartId,
      lineIds: [req.params.lineId],
    });
    res.json(data.cartLinesRemove.cart);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// PUT /api/cart/:cartId/buyer
router.put('/:cartId/buyer', async (req: AuthRequest, res: Response) => {
  const mutation = `
    ${CART_FRAGMENT}
    mutation cartBuyerIdentityUpdate($cartId: ID!, $buyerIdentity: CartBuyerIdentityInput!) {
      cartBuyerIdentityUpdate(cartId: $cartId, buyerIdentity: $buyerIdentity) {
        cart { ...CartFields }
        userErrors { field message }
      }
    }
  `;

  const buyerIdentity: Record<string, unknown> = { ...(req.body.buyerIdentity || {}) };

  // If the request carries a valid JWT, inject the Shopify customerAccessToken so
  // Shopify links the cart to the customer account and pre-fills checkout.
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const jwtToken = authHeader.slice(7);
    const secret = process.env.JWT_SECRET;
    if (secret) {
      try {
        const payload = jwt.verify(jwtToken, secret) as AuthPayload;
        buyerIdentity['customerAccessToken'] = payload.customerAccessToken;
      } catch {
        // Invalid/expired token — proceed without linking customer
      }
    }
  }

  try {
    const data = await storefrontQuery<{ cartBuyerIdentityUpdate: { cart: unknown } }>(mutation, {
      cartId: req.params.cartId,
      buyerIdentity,
    });
    res.json(data.cartBuyerIdentityUpdate.cart);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/cart/:cartId/checkout-url
router.get('/:cartId/checkout-url', async (req: Request, res: Response) => {
  const query = `
    query cartCheckoutUrl($id: ID!) {
      cart(id: $id) {
        checkoutUrl
      }
    }
  `;

  try {
    const data = await storefrontQuery<{ cart: { checkoutUrl: string } | null }>(query, {
      id: req.params.cartId,
    });
    if (!data.cart) {
      res.status(404).json({ error: 'Cart not found' });
      return;
    }
    res.json({ checkoutUrl: data.cart.checkoutUrl });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
