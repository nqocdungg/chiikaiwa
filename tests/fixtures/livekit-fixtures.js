import { createHash, randomUUID } from 'node:crypto';
import {
  AccessToken,
  ParticipantInfo,
  Room,
  WebhookEvent,
} from 'livekit-server-sdk';

export const LIVEKIT_TEST_KEY = 'webhook-test-key';
export const LIVEKIT_TEST_SECRET = 'fake-webhook-secret-not-a-live-project';
export const WEBHOOK_NOW = new Date('2026-11-11T12:00:30.000Z');
export const WEBHOOK_ACTORS = [
  'user:507f1f77bcf86cd799439011',
  'user:507f1f77bcf86cd799439022',
];
export const WEBHOOK_ROOM = 'session-907f1f77bcf86cd799439011';

/** @param {{type?: string, actor?: number, sid?: string, seconds?: number, id?: string}} [options] */
export function makeWebhook({
  type = 'participant_joined',
  actor = 0,
  sid = `PA_${actor}`,
  seconds = WEBHOOK_NOW.getTime() / 1000 - 10,
  id = randomUUID(),
} = {}) {
  const room = new Room({ name: WEBHOOK_ROOM, sid: 'RM_test' });
  const participant = new ParticipantInfo({
    identity: WEBHOOK_ACTORS[actor],
    sid,
  });
  return Object.assign(
    new WebhookEvent({
      id,
      createdAt: BigInt(seconds),
      room,
      participant,
    }),
    {
      room,
      participant,
      event: /** @type {import('livekit-server-sdk').WebhookEvent['event']} */ (
        type
      ),
    },
  );
}

/** @param {string} body @param {string} [secret] */
export async function signWebhookBody(body, secret = LIVEKIT_TEST_SECRET) {
  const token = new AccessToken(LIVEKIT_TEST_KEY, secret, { ttl: 60 });
  token.sha256 = createHash('sha256').update(body).digest('base64');
  return token.toJwt();
}
