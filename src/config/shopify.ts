export const shopifyConfig = {
  storeDomain: process.env.SHOPIFY_STORE_DOMAIN || 'fangri-la-2.myshopify.com',
  storefrontAccessToken: process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN || '',
  adminAccessToken: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || '',
  webhookSecret: process.env.SHOPIFY_WEBHOOK_SECRET || '',
  apiVersion: '2024-07',
};

export const storefrontApiUrl = `https://${shopifyConfig.storeDomain}/api/${shopifyConfig.apiVersion}/graphql.json`;
export const adminApiUrl = `https://${shopifyConfig.storeDomain}/admin/api/${shopifyConfig.apiVersion}/graphql.json`;
