import { Router, Request, Response } from 'express';
import { storefrontQuery } from '../utils/shopify-storefront';

const router = Router();

// GET /api/products/:handle
router.get('/:handle', async (req: Request, res: Response) => {
  const query = `
    query product($handle: String!) {
      product(handle: $handle) {
        id
        title
        handle
        description
        descriptionHtml
        totalInventory
        tags
        vendor
        productType
        publishedAt
        featuredImage { url altText width height }
        images(first: 20) {
          edges {
            node { url altText width height }
          }
        }
        priceRange {
          minVariantPrice { amount currencyCode }
          maxVariantPrice { amount currencyCode }
        }
        variants(first: 100) {
          edges {
            node {
              id
              title
              sku
              availableForSale
              quantityAvailable
              price { amount currencyCode }
              compareAtPrice { amount currencyCode }
              selectedOptions { name value }
            }
          }
        }
        options {
          id
          name
          values
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
  `;

  try {
    const data = await storefrontQuery<{ product: unknown }>(query, { handle: req.params.handle });
    if (!data.product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    res.json(data.product);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
