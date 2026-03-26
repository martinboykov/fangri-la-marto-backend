import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth';
import cartRoutes from './routes/cart';
import collectionsRoutes from './routes/collections';
import productsRoutes from './routes/products';
import customerRoutes from './routes/customer';
import webhookRoutes from './routes/webhooks';

const app = express();

// Capture raw body for webhook HMAC verification before JSON parsing
app.use(
  (req: Request & { rawBody?: Buffer }, _res: Response, next: NextFunction) => {
    if (req.path === '/api/webhooks/shopify') {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        req.rawBody = Buffer.concat(chunks);
        next();
      });
    } else {
      next();
    }
  }
);

app.use(express.json());

// CORS
const allowedOrigins = [
  process.env.FRONTEND_URL || 'https://vibrant-miracle-marto.up.railway.app',
  'http://localhost:4200',
  'http://localhost:8100',
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    credentials: true,
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/collections', collectionsRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/webhooks', webhookRoutes);

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

export default app;
