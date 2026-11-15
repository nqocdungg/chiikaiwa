import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import {
  ParticipantInfo,
  ParticipantInfo_State,
  RoomServiceClient,
  ServerError,
} from 'livekit-server-sdk';
import { createApp } from '../../server/app.js';
import { createLivekitWebhookHandler } from '../../server/modules/sessions/livekit-webhook-handler.js';
import {
  readMediaParticipant,
  removeMediaParticipant,
  closeMediaRoom,
  notifyMediaSession,
} from '../../server/integrations/livekit/room-service.js';
import {
  LIVEKIT_TEST_KEY,
  LIVEKIT_TEST_SECRET,
  makeWebhook,
  signWebhookBody,
} from '../fixtures/livekit-fixtures.js';

const endpoint = '/api/v1/webhooks/livekit';

beforeEach(() => {
  vi.stubEnv('LIVEKIT_URL', 'wss://webhook.example.test');
  vi.stubEnv('LIVEKIT_API_KEY', LIVEKIT_TEST_KEY);
  vi.stubEnv('LIVEKIT_API_SECRET', LIVEKIT_TEST_SECRET);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('BE-012 media lifecycle adapter', () => {
  it('removes each identity with an explicit current revocation cutoff', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_250);
    const remove = vi
      .spyOn(RoomServiceClient.prototype, 'removeParticipant')
      .mockResolvedValue(undefined);
    await removeMediaParticipant('room', 'user:member');
    expect(remove).toHaveBeenCalledWith('room', 'user:member', {
      revokeTokenTs: 1_800_000_002n,
    });
  });
  it('does not hide failed identity revocation; a missing room is safe to close repeatedly', async () => {
    const missing = new ServerError('not_found', 'absent', 404, 'not_found');
    vi.spyOn(
      RoomServiceClient.prototype,
      'removeParticipant',
    ).mockRejectedValue(missing);
    await expect(removeMediaParticipant('room', 'user:member')).rejects.toBe(
      missing,
    );
    vi.spyOn(RoomServiceClient.prototype, 'deleteRoom').mockRejectedValue(
      missing,
    );
    await expect(closeMediaRoom('room')).resolves.toBeUndefined();
  });
  it('publishes only the version notification payload', async () => {
    const send = vi
      .spyOn(RoomServiceClient.prototype, 'sendData')
      .mockResolvedValue(undefined);
    await notifyMediaSession('room', 'session', 12);
    const data = send.mock.calls[0][1];
    expect(JSON.parse(Buffer.from(data).toString())).toEqual({
      type: 'session.updated',
      sessionId: 'session',
      version: 12,
    });
  });
});

/** @param {import('express').Express} app @param {string} body @param {string} [authorization] */
function post(app, body, authorization) {
  const call = request(app)
    .post(endpoint)
    .set('Content-Type', 'application/webhook+json');
  if (authorization) call.set('Authorization', authorization);
  return call.send(body);
}

describe('BE-011 webhook verification and HTTP contract', () => {
  it('validates exact UTF-8 bytes through Express and forwards the consumer without cookies/CSRF', async () => {
    const event = makeWebhook();
    event.room.name = '日本語';
    const body = ` ${event.toJsonString()}\n`;
    const process = vi.fn().mockResolvedValue(undefined);
    const consumer = vi.fn();
    const app = createApp({
      handleLivekitWebhook: createLivekitWebhookHandler({
        process,
        onVerifiedPresence: consumer,
      }),
    });
    const result = await post(app, body, await signWebhookBody(body)).expect(
      204,
    );
    expect(result.text).toBe('');
    expect(process).toHaveBeenCalledWith(
      expect.objectContaining({
        id: event.id,
        room: expect.objectContaining({ name: '日本語' }),
      }),
      { onVerifiedPresence: consumer },
    );
  });

  it.each([
    'missing',
    'wrong secret',
    'changed bytes',
    'expired',
    'missing hash',
  ])(
    'returns 401 for %s before calling the processing service',
    async (failure) => {
      const body = makeWebhook().toJsonString();
      let authorization =
        failure === 'missing'
          ? undefined
          : await signWebhookBody(
              body,
              failure === 'wrong secret' ? 'other-fake-secret' : undefined,
            );
      if (failure === 'expired' || failure === 'missing hash') {
        const { AccessToken } = await import('livekit-server-sdk');
        const token = new AccessToken(LIVEKIT_TEST_KEY, LIVEKIT_TEST_SECRET, {
          ttl: failure === 'expired' ? -30 : 60,
        });
        authorization = await token.toJwt();
      }
      const process = vi.fn();
      const app = createApp({
        handleLivekitWebhook: createLivekitWebhookHandler({ process }),
      });
      const result = await post(
        app,
        failure === 'changed bytes' ? `${body}\n` : body,
        authorization,
      ).expect(401);
      expect(result.body.error.code).toBe('WEBHOOK_UNAUTHORIZED');
      expect(process).not.toHaveBeenCalled();
      expect(result.text).not.toContain(LIVEKIT_TEST_SECRET);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('WEBHOOK_UNAUTHORIZED'),
      );
    },
  );

  it('returns 503 when configuration is unavailable, without invoking processing', async () => {
    vi.stubEnv('LIVEKIT_API_SECRET', '');
    const process = vi.fn();
    const app = createApp({
      handleLivekitWebhook: createLivekitWebhookHandler({ process }),
    });
    await post(app, '{}').expect(503);
    expect(process).not.toHaveBeenCalled();
  });

  it('returns 503 on database/lifecycle failure without leaking the cause', async () => {
    const body = makeWebhook().toJsonString();
    const process = vi
      .fn()
      .mockRejectedValue(new Error('private-payload-and-secret'));
    const app = createApp({
      handleLivekitWebhook: createLivekitWebhookHandler({ process }),
    });
    const result = await post(app, body, await signWebhookBody(body)).expect(
      503,
    );
    expect(result.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(result.text).not.toContain('private-payload');
  });
});

describe('LiveKit participant reconciliation adapter', () => {
  it('recognizes only an active media participant of the requested identity', async () => {
    const list = vi.spyOn(RoomServiceClient.prototype, 'listParticipants');
    list.mockResolvedValue([
      new ParticipantInfo({
        identity: 'other',
        sid: 'PA_other',
        state: ParticipantInfo_State.ACTIVE,
      }),
    ]);
    expect(await readMediaParticipant('room', 'actor')).toBeNull();
    list.mockResolvedValue([
      new ParticipantInfo({
        identity: 'actor',
        sid: 'PA_actor',
        state: ParticipantInfo_State.JOINED,
      }),
    ]);
    expect(await readMediaParticipant('room', 'actor')).toBeNull();
    list.mockResolvedValue([
      new ParticipantInfo({
        identity: 'actor',
        sid: 'PA_actor',
        state: ParticipantInfo_State.ACTIVE,
      }),
    ]);
    expect(await readMediaParticipant('room', 'actor')).toBe('PA_actor');
    expect(list).toHaveBeenLastCalledWith('room');
  });

  it('distinguishes a missing room from authorization/transport failures', async () => {
    const list = vi.spyOn(RoomServiceClient.prototype, 'listParticipants');
    list.mockRejectedValue(
      new ServerError('not_found', 'Room missing', 404, 'not_found'),
    );
    expect(await readMediaParticipant('room', 'actor')).toBeNull();
    list.mockRejectedValue(
      new ServerError('unauthorized', 'Denied', 401, 'unauthenticated'),
    );
    await expect(readMediaParticipant('room', 'actor')).rejects.toThrow(
      'Denied',
    );
    list.mockRejectedValue(new Error('network unavailable'));
    await expect(readMediaParticipant('room', 'actor')).rejects.toThrow(
      'network unavailable',
    );
  });
});
