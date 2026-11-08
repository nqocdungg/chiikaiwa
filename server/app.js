import { randomUUID } from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import { readAuthEnv } from './config/env.js';
import { checkDatabase } from './persistence/database.js';
import { createCsrfMiddleware } from './middleware/csrf.js';
import { AppError } from './middleware/http-error.js';
import { errorHandler } from './middleware/error-handler.js';
import { createAuthRouter } from './modules/identity/auth-router.js';
import { createCoordinationRouter } from './modules/coordination/coordination-router.js';
import { createInvitationRouter } from './modules/invitations/invitation-router.js';

/**
 * @param {{checkHealth?: () => Promise<void>, handleLivekitWebhook?: import('express').RequestHandler, assertPairCanEnterSession?: (input: Record<string, any>) => Promise<void>}} [options]
 */
export function createApp({
  checkHealth = checkDatabase,
  handleLivekitWebhook,
  assertPairCanEnterSession,
} = {}) {
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
  // Signature verification needs the original bytes, before any JSON parser.
  app.post(
    '/api/v1/webhooks/livekit',
    express.raw({
      type: 'application/webhook+json',
      limit: '1mb',
      inflate: false,
    }),
    (request, response, next) => {
      if (!request.is('application/webhook+json')) {
        return next(
          new AppError({
            status: 415,
            code: 'UNSUPPORTED_MEDIA_TYPE',
            message: 'Webhook phải sử dụng application/webhook+json.',
          }),
        );
      }
      if (!handleLivekitWebhook) {
        return next(
          new AppError({
            status: 503,
            code: 'SERVICE_UNAVAILABLE',
            message: 'Dịch vụ webhook chưa sẵn sàng.',
          }),
        );
      }
      return handleLivekitWebhook(request, response, next);
    },
  );
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

  // Require application/json for mutating API requests with non-empty body (excluding webhooks)
  app.use('/api/v1', (request, _response, next) => {
    if (
      ['POST', 'PATCH', 'PUT'].includes(request.method.toUpperCase()) &&
      !request.path.startsWith('/webhooks')
    ) {
      const contentLength = Number(request.headers['content-length'] ?? '0');
      const hasBody =
        contentLength > 0 || Boolean(request.headers['transfer-encoding']);
      if (hasBody && !request.is('application/json')) {
        return next(
          new AppError({
            status: 415,
            code: 'UNSUPPORTED_MEDIA_TYPE',
            message: 'Yêu cầu phải sử dụng định dạng application/json.',
          }),
        );
      }
    }
    return next();
  });

  // Enforce CSRF token & Origin allowlist on all browser mutating requests under /api/v1
  app.use(
    '/api/v1',
    createCsrfMiddleware({
      getOrigin: () => readAuthEnv().origin,
    }),
  );

  app.use('/api/v1/auth', createAuthRouter());
  app.use('/api/v1', createCoordinationRouter());
  app.use('/api/v1', createInvitationRouter({ assertPairCanEnterSession }));

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
