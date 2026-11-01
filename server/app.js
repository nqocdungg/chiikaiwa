import { randomUUID } from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import { checkDatabase } from './persistence/database.js';
import { errorHandler } from './middleware/error-handler.js';

/** @param {{checkHealth?: () => Promise<void>}} [options] */
export function createApp({ checkHealth = checkDatabase } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use((_request, response, next) => {
    response.locals.meta = {
      requestId: randomUUID(),
      serverTime: new Date().toISOString(),
    };
    response.set('Cache-Control', 'no-store');
    response.set('X-Request-Id', response.locals.meta.requestId);
    response.on('finish', () => {
      if (response.statusCode >= 500) {
        console.error(
          JSON.stringify({
            requestId: response.locals.meta.requestId,
            status: response.statusCode,
          }),
        );
      }
    });
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  app.get('/api/v1/health', async (_request, response) => {
    try {
      await checkHealth();
      response.json({ data: { status: 'ok' }, meta: response.locals.meta });
    } catch {
      response
        .status(503)
        .json({ data: { status: 'unavailable' }, meta: response.locals.meta });
    }
  });
  app.use((_request, response) => {
    response.status(404).json({
      error: {
        code: 'RESOURCE_NOT_FOUND',
        message: 'Không tìm thấy tài nguyên.',
      },
      meta: response.locals.meta,
    });
  });
  app.use(errorHandler);
  return app;
}

export default createApp();
