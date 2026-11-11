import { verifyLivekitWebhook } from '../../integrations/livekit/webhook.js';
import { AppError } from '../../middleware/http-error.js';
import { processLivekitWebhook } from './livekit-webhook-service.js';

/**
 * @param {{verify?: typeof verifyLivekitWebhook, process?: typeof processLivekitWebhook, onVerifiedPresence?: import('./livekit-webhook-service.js').PresenceConsumer}} [options]
 * @returns {import('express').RequestHandler}
 */
export function createLivekitWebhookHandler({
  verify = verifyLivekitWebhook,
  process = processLivekitWebhook,
  onVerifiedPresence,
} = {}) {
  return async (request, response, next) => {
    try {
      const event = await verify(request.body, request.get('Authorization'));
      await process(event, { onVerifiedPresence });
      response.status(204).end();
    } catch (error) {
      if (error instanceof AppError && error.status === 401) {
        console.warn(
          JSON.stringify({
            requestId: response.locals.meta.requestId,
            code: error.code,
          }),
        );
      }
      next(
        error instanceof AppError && error.status === 401
          ? error
          : new AppError({
              status: 503,
              code: 'SERVICE_UNAVAILABLE',
              message: 'Chưa thể xử lý webhook. Vui lòng thử lại.',
            }),
      );
    }
  };
}
