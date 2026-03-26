import { Router, Response } from 'express';
import { storefrontQuery } from '../utils/shopify-storefront';
import { adminQuery } from '../utils/shopify-admin';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/customer/orders
router.get('/orders', requireAuth, async (req: AuthRequest, res: Response) => {
  const query = `
    query customerOrders($customerAccessToken: String!) {
      customer(customerAccessToken: $customerAccessToken) {
        orders(first: 50, sortKey: PROCESSED_AT, reverse: true) {
          edges {
            node {
              id
              orderNumber
              processedAt
              financialStatus
              fulfillmentStatus
              currentTotalPrice { amount currencyCode }
              lineItems(first: 10) {
                edges {
                  node {
                    title
                    quantity
                    variant {
                      id
                      title
                      price { amount currencyCode }
                      image { url altText }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  try {
    const data = await storefrontQuery<{ customer: { orders: unknown } | null }>(query, {
      customerAccessToken: req.customer!.customerAccessToken,
    });

    if (!data.customer) {
      res.status(401).json({ error: 'Invalid customer token' });
      return;
    }

    res.json(data.customer.orders);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/customer/orders/:id
router.get('/orders/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  // Use Admin API for detailed order tracking
  const query = `
    query order($id: ID!) {
      order(id: $id) {
        id
        name
        email
        createdAt
        displayFinancialStatus
        displayFulfillmentStatus
        note
        totalPriceSet { shopMoney { amount currencyCode } }
        subtotalPriceSet { shopMoney { amount currencyCode } }
        totalShippingPriceSet { shopMoney { amount currencyCode } }
        totalTaxSet { shopMoney { amount currencyCode } }
        shippingAddress {
          firstName
          lastName
          address1
          address2
          city
          province
          country
          zip
          phone
        }
        lineItems(first: 50) {
          edges {
            node {
              id
              title
              quantity
              sku
              originalTotalSet { shopMoney { amount currencyCode } }
              variant {
                id
                title
                image { url altText }
              }
            }
          }
        }
        fulfillments {
          status
          trackingInfo { number url company }
          fulfillmentLineItems(first: 50) {
            edges {
              node {
                quantity
                lineItem { title }
              }
            }
          }
        }
      }
    }
  `;

  try {
    const gid = req.params.id.startsWith('gid://')
      ? req.params.id
      : `gid://shopify/Order/${req.params.id}`;
    const data = await adminQuery<{ order: unknown }>(query, { id: gid });
    res.json(data.order);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
