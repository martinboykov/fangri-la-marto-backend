import { shopifyConfig, storefrontApiUrl } from '../config/shopify';

export async function storefrontQuery<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
  customerAccessToken?: string
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Shopify-Storefront-Access-Token': shopifyConfig.storefrontAccessToken,
  };

  if (customerAccessToken) {
    headers['X-Shopify-Customer-Access-Token'] = customerAccessToken;
  }

  const response = await fetch(storefrontApiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Storefront API HTTP error: ${response.status} ${response.statusText}`);
  }

  const json = (await response.json()) as { data?: T; errors?: { message: string }[] };

  if (json.errors && json.errors.length > 0) {
    throw new Error(`Storefront API error: ${json.errors[0].message}`);
  }

  return json.data as T;
}
