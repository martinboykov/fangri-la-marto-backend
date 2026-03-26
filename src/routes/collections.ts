import { Router, Request, Response } from 'express';
import { storefrontQuery } from '../utils/shopify-storefront';

const router = Router();

// GET /api/collections/:handle/products
router.get('/:handle/products', async (req: Request, res: Response) => {
  const { handle } = req.params;
  const first = parseInt(req.query['first'] as string) || 24;
  const after = req.query['after'] as string | undefined;

  const query = `
    query collectionProducts($handle: String!, $first: Int!, $after: String) {
      collection(handle: $handle) {
        id
        title
        handle
        description
        image { url altText }
        products(first: $first, after: $after) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              id
              title
              handle
              description
              totalInventory
              tags
              featuredImage { url altText }
              priceRange {
                minVariantPrice { amount currencyCode }
                maxVariantPrice { amount currencyCode }
              }
              variants(first: 10) {
                edges {
                  node {
                    id
                    title
                    availableForSale
                    price { amount currencyCode }
                    quantityAvailable
                  }
                }
              }
              metafields(identifiers: [
                { namespace: "custom", key: "availability_tier" }
              ]) {
                namespace
                key
                value
              }
            }
          }
        }
      }
    }
  `;

  try {
    const data = await storefrontQuery<{ collection: unknown }>(query, { handle, first, after });
    if (!data.collection) {
      res.status(404).json({ error: 'Collection not found' });
      return;
    }
    res.json(data.collection);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
