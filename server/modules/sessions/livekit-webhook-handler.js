import { verifyLivekitWebhook } from '../../integrations/livekit/webhook.js';
import { AppError } from '../../middleware/http-error.js';
import { processLivekitWebhook } from './livekit-webhook-service.js';
import { connectDatabase } from '../../persistence/database.js';
import { finishSessionEffects } from './media-cleanup-service.js';

/**
 * @param {{verify?: typeof verifyLivekitWebhook, process?: typeof processLivekitWebhook, onVerifiedPresence?: import('./livekit-webhook-service.js').PresenceConsumer, afterCommit?: (roomName: string) => Promise<void>}} [options]
 * @returns {import('express').RequestHandler}
 */
export function createLivekitWebhookHandler({
  verify = verifyLivekitWebhook,
  process = processLivekitWebhook,
  onVerifiedPresence,
  afterCommit,
} = {}) {
  return async (request, response, next) => {
    try {
      const event = await verify(request.body, request.get('Authorization'));
      await process(event, { onVerifiedPresence });
      if (afterCommit && event.room?.name) await afterCommit(event.room.name);
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

/** @param {string} roomName */
export async function finishWebhookEffects(roomName) {
  const db = await connectDatabase();
  const doc = await db.collection('practice_sessions').findOne({ roomName });
  if (doc) await finishSessionEffects(doc);
}
