import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { shopifyConfig } from '../config/shopify';

const router = Router();

function verifyShopifyWebhook(rawBody: Buffer, hmacHeader: string): boolean {
  const secret = shopifyConfig.webhookSecret;
  if (!secret) return false;
  const computed = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('base64');
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hmacHeader));
}

// POST /api/webhooks/shopify
router.post(
  '/shopify',
  (req: Request, res: Response) => {
    const hmac = req.headers['x-shopify-hmac-sha256'] as string;
    const topic = req.headers['x-shopify-topic'] as string;

    if (!hmac) {
      res.status(401).json({ error: 'Missing HMAC header' });
      return;
    }

    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody) {
      res.status(400).json({ error: 'Missing raw body' });
      return;
    }

    if (!verifyShopifyWebhook(rawBody, hmac)) {
      res.status(401).json({ error: 'Invalid HMAC signature' });
      return;
    }

    const payload = req.body as Record<string, unknown>;
    console.log(`[Webhook] ${topic}`, JSON.stringify(payload, null, 2));

    switch (topic) {
      case 'orders/create':
        console.log('[Webhook] New order created:', payload['id']);
        break;
      case 'orders/paid':
        console.log('[Webhook] Order paid:', payload['id']);
        break;
      case 'orders/fulfilled':
        console.log('[Webhook] Order fulfilled:', payload['id']);
        break;
      case 'orders/cancelled':
        console.log('[Webhook] Order cancelled:', payload['id']);
        break;
      default:
        console.log('[Webhook] Unknown topic:', topic);
    }

    res.status(200).json({ received: true });
  }
);

export default router;
