import crypto from 'node:crypto';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import productsRouter from './routes/products.js';
import ordersRouter from './routes/orders.js';
import assistantRouter from './routes/assistant.js';
import authRouter from './routes/auth.js';
import { loadUser } from './lib/auth.js';
import { prisma } from './lib/prisma.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Hosted platforms (e.g. Render) sit behind one reverse proxy. Trust its X-Forwarded-For
  // so express-rate-limit counts real client IPs. Off locally, where the header could be spoofed.
  if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
  app.use(helmet());
  // credentials: true lets a separately hosted frontend send the session cookie. Same-origin hosting doesn't need CORS at all.
  app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
  // Assign the request id before parsing the body, so body errors can be traced too.
  app.use((request, response, next) => { request.id = crypto.randomUUID(); response.setHeader('X-Request-ID', request.id); next(); });
  app.use(express.json({ limit: '100kb' }));
  app.use(morgan(':method :url :status :response-time ms'));

  // Health includes a real database round trip, so "ok" means the API can actually serve products and orders.
  app.get('/api/health', async (request, response) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      response.json({ status: 'ok', database: 'ok' });
    } catch (error) {
      console.error(`[${request.id}] health check: database unreachable`, error.code || error.name);
      response.status(503).json({ status: 'degraded', database: 'unreachable', traceId: request.id });
    }
  });
  app.use('/api', loadUser);
  app.use('/api/auth', authRouter);
  app.use('/api/products', productsRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/assistant', assistantRouter);
  app.use((_request, response) => response.status(404).json({ error: { code: 'ROUTE_NOT_FOUND', message: 'API route could not be found.' } }));
  app.use((error, request, response, _next) => {
    // express.json() reports an unparsable body as a 400 'entity.parse.failed' error.
    if (error.type === 'entity.parse.failed') {
      return response.status(400).json({ error: { code: 'INVALID_JSON', message: 'The request body must be valid JSON.', traceId: request.id } });
    }
    console.error(`[${request.id}]`, error);
    response.status(error.status || 500).json({ error: { code: error.code || 'INTERNAL_ERROR', message: error.status ? error.message : 'The server could not complete the request.', traceId: request.id } });
  });
  return app;
}
