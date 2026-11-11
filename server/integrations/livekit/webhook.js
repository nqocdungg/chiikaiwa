import { WebhookReceiver } from 'livekit-server-sdk';
import { readLiveKitEnv } from '../../config/env.js';
import { AppError } from '../../middleware/http-error.js';

/** @param {Buffer} body @param {string | undefined} authorization */
export async function verifyLivekitWebhook(body, authorization) {
  const { apiKey, apiSecret } = readLiveKitEnv();
  try {
    if (!Buffer.isBuffer(body)) throw new Error('Missing raw body');
    return await new WebhookReceiver(apiKey, apiSecret).receive(
      body.toString('utf8'),
      authorization,
    );
  } catch {
    throw new AppError({
      status: 401,
      code: 'WEBHOOK_UNAUTHORIZED',
      message: 'Webhook không hợp lệ.',
    });
  }
}
