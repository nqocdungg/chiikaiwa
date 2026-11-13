import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { WebhookEvent, Room, ParticipantInfo } from 'livekit-server-sdk';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { createApp } from '../../server/app.js';
import {
  connectDatabase,
  disconnectDatabase,
  withTransaction,
} from '../../server/persistence/database.js';
import { up } from '../../server/persistence/migrations/20261103000100-add-design-indexes.js';
import { processLivekitWebhook } from '../../server/modules/sessions/livekit-webhook-service.js';
import {
  createSessionPresenceConsumer,
  endSession,
  reconcileActorSession,
} from '../../server/modules/sessions/session-lifecycle-service.js';
import {
  leaveSession,
  readSession,
  reconcileSession,
} from '../../server/modules/sessions/session-service.js';
import { cleanupSessionMedia } from '../../server/modules/sessions/media-cleanup-service.js';
import { issueMediaToken } from '../../server/modules/sessions/media-token-service.js';
import { createInvitation } from '../../server/modules/invitations/invitation-service.js';
import { removeMediaParticipant } from '../../server/integrations/livekit/room-service.js';
import { resolveIdentityFromCookies } from '../../server/modules/identity/identity-service.js';
import {
  hashGuestCredential,
  signJwt,
} from '../../server/modules/identity/crypto.js';
import {
  SESSION_ID,
  SESSION_USERS,
  SESSION_ACTORS,
  preparingSession,
} from '../fixtures/session-fixtures.js';
import {
  DEFAULT_JWT_SECRET,
  USER_FIXTURES,
} from '../fixtures/auth-fixtures.js';
import {
  signWebhookBody,
  LIVEKIT_TEST_KEY,
  LIVEKIT_TEST_SECRET,
} from '../fixtures/livekit-fixtures.js';

vi.mock('../../server/integrations/livekit/room-service.js', () => ({
  readMediaParticipant: vi.fn(async () => null),
  removeMediaParticipant: vi.fn(async () => {}),
  closeMediaRoom: vi.fn(async () => {}),
  notifyMediaSession: vi.fn(async () => {}),
}));

const { ObjectId } = mongoose.Types;
const origin = 'http://127.0.0.1:5173';
/** @type {MongoMemoryReplSet} */ let replica;
/** @type {import('mongoose').mongo.Db} */ let db;
/** @type {string[]} */ let cookies;
let at = new Date();
const now = () => new Date(at);
const app = createApp();
const consumer = createSessionPresenceConsumer({ pickController: () => 1 });
/** @param {number} [index] */
function identity(index = 0) {
  return resolveIdentityFromCookies({
    authCookie: cookies[index],
    guestCookie: undefined,
    now: now(),
  });
}
function persisted() {
  return db.collection('practice_sessions').findOne({ _id: SESSION_ID });
}
/** @param {number} index @param {string} [type] @param {string} [sid] */
function event(index, type = 'participant_joined', sid = `PA_${index}`) {
  return Object.assign(
    new WebhookEvent({
      id: randomUUID(),
      createdAt: BigInt(Math.floor(at.getTime() / 1000)),
      room: new Room({ name: `session-${SESSION_ID}` }),
      participant: new ParticipantInfo({
        identity: SESSION_ACTORS[index],
        sid,
      }),
    }),
    {
      event: /** @type {import('livekit-server-sdk').WebhookEvent['event']} */ (
        type
      ),
    },
  );
}
/** @param {ReturnType<typeof event>} value @param {any} [options] */
function process(value, options = {}) {
  return processLivekitWebhook(value, {
    now,
    onVerifiedPresence: consumer,
    ...options,
  });
}
async function start() {
  await process(event(0));
  await process(event(1));
}
/** @param {number} [index] @param {string} [key] @param {any} [body] */
async function postLeave(index = 0, key = randomUUID(), body = {}) {
  const csrf = await request(app).get('/api/v1/auth/csrf');
  const values = /** @type {string[] | string} */ (csrf.headers['set-cookie']);
  const pairs = (Array.isArray(values) ? values : [values]).map(
    (c) => c.split(';')[0],
  );
  return request(app)
    .post(`/api/v1/sessions/${SESSION_ID}/leave`)
    .set('Cookie', [`ck_session=${cookies[index]}`, ...pairs].join('; '))
    .set('Origin', origin)
    .set('X-CSRF-Token', csrf.body.data.csrfToken)
    .set('Idempotency-Key', key)
    .send(body);
}

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({
    binary: { version: '8.2.7' },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  vi.stubEnv('MONGODB_URI', replica.getUri());
  vi.stubEnv('MONGODB_DB_NAME', 'chiikaiwa_lifecycle_test');
  vi.stubEnv('APP_ORIGIN', origin);
  vi.stubEnv('JWT_SECRET', DEFAULT_JWT_SECRET);
  vi.stubEnv('LIVEKIT_API_KEY', LIVEKIT_TEST_KEY);
  vi.stubEnv('LIVEKIT_URL', 'wss://lifecycle.example.test');
  vi.stubEnv('LIVEKIT_API_SECRET', LIVEKIT_TEST_SECRET);
  db = await connectDatabase();
  await up(db);
});
beforeEach(async () => {
  vi.clearAllMocks();
  at = new Date();
  for (const name of [
    'practice_sessions',
    'session_cards',
    'content_versions',
    'actor_states',
    'users',
    'auth_sessions',
    'guest_sessions',
    'statistics',
    'operation_receipts',
    'webhook_receipts',
    'blocks',
    'rate_limits',
  ])
    await db.collection(name).deleteMany({});
  const users = [...SESSION_USERS, USER_FIXTURES.admin];
  await db.collection('users').insertMany(users.map((u) => ({ ...u })));
  cookies = [];
  for (const user of users) {
    const sid = new ObjectId();
    const seconds = Math.floor(at.getTime() / 1000);
    await db.collection('auth_sessions').insertOne({
      _id: sid,
      userId: user._id,
      authVersion: 0,
      expiresAt: new Date(at.getTime() + 3600_000),
    });
    cookies.push(
      signJwt(
        {
          sub: String(user._id),
          sid: String(sid),
          authVersion: 0,
          iat: seconds,
          exp: seconds + 3600,
        },
        DEFAULT_JWT_SECRET,
        { issuer: 'chiikaiwa', audience: 'chiikaiwa-web' },
      ),
    );
  }
  await db.collection('practice_sessions').insertOne(preparingSession(at));
  for (const actorKey of SESSION_ACTORS)
    await db.collection('actor_states').insertOne(
      /** @type {any} */ ({
        _id: actorKey,
        mode: 'inSession',
        resourceId: String(SESSION_ID),
        version: 0,
      }),
    );
});
afterAll(async () => {
  await disconnectDatabase();
  await replica?.stop();
  vi.unstubAllEnvs();
});

describe('BE-012 lifecycle on a real replica set', () => {
  it('starts once for simultaneous verified joins, preserves controller and counter after duplicate delivery/receipt expiry', async () => {
    const joins = [event(0), event(1)];
    await Promise.all(joins.map((e) => process(e)));
    const started = await persisted();
    expect(started).toMatchObject({
      status: 'active',
      controllerKey: SESSION_ACTORS[1],
      startedAt: at,
      activeDurationMs: 0,
      selectionRemainingMs: 60_000,
    });
    expect(
      (
        await db
          .collection('statistics')
          .findOne(/** @type {any} */ ({ _id: 'lifetime' }))
      )?.startedSessions,
    ).toBe(1);
    await db.collection('webhook_receipts').deleteMany({});
    await Promise.all(joins.map((e) => process(e)));
    expect(await persisted()).toEqual(started);
    expect(
      (
        await db
          .collection('statistics')
          .findOne(/** @type {any} */ ({ _id: 'lifetime' }))
      )?.startedSessions,
    ).toBe(1);
  });
  it('does not start for a single participant or room_started', async () => {
    await process(event(0, 'room_started'));
    await process(event(0));
    expect(await persisted()).not.toHaveProperty('startedAt');
    expect(await db.collection('statistics').countDocuments()).toBe(0);
  });
  it('GET projects time without persisting duration, version, controller or statistics', async () => {
    await start();
    const before = await persisted();
    at = new Date(at.getTime() + 12_000);
    const result = await readSession({
      sessionId: String(SESSION_ID),
      getIdentity: identity,
      now,
    });
    expect(result.data).toMatchObject({
      activeDurationMs: 12_000,
      selectionRemainingMs: 48_000,
    });
    expect(await persisted()).toEqual(before);
    expect(JSON.stringify(result.data)).not.toMatch(
      /roomName|connectionSid|email|passwordHash|mediaCleanup|activeSince/,
    );
  });
  it('leave races/replays end once, settle time and free both actors; ended refuses token', async () => {
    await start();
    at = new Date(at.getTime() + 10_000);
    const key = randomUUID();
    const input = {
      sessionId: String(SESSION_ID),
      getIdentity: identity,
      operationId: key,
      now,
    };
    await Promise.all([
      leaveSession(input),
      leaveSession({
        ...input,
        getIdentity: () => identity(1),
        operationId: randomUUID(),
      }),
    ]);
    const ended = await persisted();
    expect(ended).toMatchObject({
      status: 'ended',
      endedAt: at,
      endReason: 'left',
      activeDurationMs: 10_000,
    });
    expect(ended).not.toHaveProperty('activeSince');
    expect(
      await db.collection('actor_states').countDocuments({ mode: 'idle' }),
    ).toBe(2);
    await leaveSession(input);
    await leaveSession({ ...input, operationId: randomUUID() });
    expect(await persisted()).toEqual(ended);
    await expect(
      issueMediaToken(
        { sessionId: String(SESSION_ID), getIdentity: identity },
        { now, sign: vi.fn() },
      ),
    ).rejects.toMatchObject({ code: 'SESSION_ENDED' });
  });
  it.each([300_000, 300_001])(
    'expires never-started admission at the original deadline (%i ms)',
    async (elapsed) => {
      const createdAt = new Date(at);
      at = new Date(at.getTime() + elapsed);
      await reconcileSession(SESSION_ID, await identity(), now);
      expect(await persisted()).toMatchObject({
        status: 'ended',
        endedAt: new Date(createdAt.getTime() + 300_000),
        activeDurationMs: 0,
      });
      expect(await persisted()).not.toHaveProperty('startedAt');
      expect(await db.collection('statistics').countDocuments()).toBe(0);
    },
  );
  it('selection timeout settles at 60 seconds even when GET is late', async () => {
    const startedAt = new Date(at);
    await start();
    at = new Date(at.getTime() + 120_000);
    const result = await readSession({
      sessionId: String(SESSION_ID),
      getIdentity: identity,
      now,
    });
    expect(result.data).toMatchObject({
      status: 'ended',
      endReason: 'selection_timeout',
      endedAt: new Date(startedAt.getTime() + 60_000).toISOString(),
      activeDurationMs: 60_000,
      selectionRemainingMs: 0,
    });
  });
  it('rechecks the exact response snapshot deadline when GET crosses the selection cutoff', async () => {
    const startedAt = new Date(at);
    await start();
    let calls = 0;
    const clock = () =>
      new Date(startedAt.getTime() + (++calls <= 2 ? 59_999 : 60_001));
    const response = await readSession({
      sessionId: String(SESSION_ID),
      getIdentity: identity,
      now: clock,
    });
    expect(response.data).toMatchObject({
      status: 'ended',
      activeDurationMs: 60_000,
      selectionRemainingMs: 0,
    });
    expect((await persisted())?.endedAt).toEqual(
      new Date(startedAt.getTime() + 60_000),
    );
  });
  it('disconnect pauses clocks once and recovery deadline never extends on duplicate events', async () => {
    await start();
    at = new Date(at.getTime() + 20_000);
    const left = event(0, 'participant_left');
    await process(left);
    const paused = await persisted();
    expect(paused).toMatchObject({
      status: 'reconnecting',
      activeDurationMs: 20_000,
      selectionRemainingMs: 40_000,
    });
    await db.collection('webhook_receipts').deleteMany({});
    await process(left);
    expect((await persisted())?.presence[0].reconnectUntil).toEqual(
      paused?.presence[0].reconnectUntil,
    );
    at = new Date(at.getTime() + 300_001);
    await reconcileSession(SESSION_ID, await identity(), now);
    expect(await persisted()).toMatchObject({
      status: 'ended',
      activeDurationMs: 20_000,
      endedAt: paused?.presence[0].reconnectUntil,
    });
  });
  it('does not consume recovery events before the recovery consumer is integrated', async () => {
    await start();
    at = new Date(at.getTime() + 1000);
    await process(event(0, 'participant_left'));
    const before = await persisted();
    const joining = event(0, 'participant_joined', 'PA_new');
    await expect(
      process(joining, { readParticipant: async () => 'PA_new' }),
    ).rejects.toMatchObject({ status: 503 });
    expect(await persisted()).toEqual(before);
    expect(
      await db.collection('webhook_receipts').findOne({ eventId: joining.id }),
    ).toBeNull();
  });
  it('room_finished ignores an active new SID and pauses an actually empty room only once', async () => {
    await start();
    at = new Date(at.getTime() + 10_000);
    const before = await persisted();
    await process(event(0, 'room_finished'), {
      readParticipant: async () => 'PA_new',
    });
    expect(await persisted()).toEqual(before);
    await process(event(0, 'room_finished'), {
      readParticipant: async () => null,
    });
    const paused = await persisted();
    expect(paused).toMatchObject({
      status: 'reconnecting',
      activeDurationMs: 10_000,
    });
    await process(event(0, 'room_finished'), {
      readParticipant: async () => null,
    });
    expect((await persisted())?.activeDurationMs).toBe(10_000);
    expect((await persisted())?.presence).toEqual(paused?.presence);
  });
  it('rolls back room_finished on a failed media reconciliation', async () => {
    await start();
    const before = await persisted();
    const closed = event(0, 'room_finished');
    await expect(
      process(closed, {
        readParticipant: async () => {
          throw new Error('timeout');
        },
      }),
    ).rejects.toThrow('timeout');
    expect(await persisted()).toEqual(before);
    expect(
      await db.collection('webhook_receipts').findOne({ eventId: closed.id }),
    ).toBeNull();
  });
  it('commits guest expiry and unfinished card with end; preserves a newer actor reservation', async () => {
    await start();
    const guestId = new ObjectId();
    const cardId = new ObjectId();
    const guestKey = `guest:${guestId}`;
    const credential = 'guest-test-credential';
    await db.collection('guest_sessions').insertOne({
      _id: guestId,
      credentialHash: hashGuestCredential(credential),
      practiceSessionId: SESSION_ID,
      status: 'active',
      version: 0,
    });
    await db.collection('practice_sessions').updateOne(
      { _id: SESSION_ID },
      {
        $set: {
          'members.1': { actorKey: guestKey, kind: 'guest' },
          currentCardId: cardId,
        },
      },
    );
    await db.collection('session_cards').insertOne({
      _id: cardId,
      sessionId: SESSION_ID,
      scenarioVersionId: new ObjectId(),
      slot: 0,
      status: 'current',
    });
    await db
      .collection('actor_states')
      .updateOne(/** @type {any} */ ({ _id: SESSION_ACTORS[0] }), {
        $set: { resourceId: 'new-session' },
      });
    // End primitive is exercised directly to keep card projection out of this transaction test.
    await withTransaction(async (session) =>
      endSession(await persisted(), now(), 'left', session),
    );
    expect(
      await db.collection('guest_sessions').findOne({ _id: guestId }),
    ).toMatchObject({
      status: 'summary',
      expiresAt: new Date(at.getTime() + 900_000),
      version: 1,
    });
    expect(
      (await db.collection('session_cards').findOne({ _id: cardId }))?.status,
    ).toBe('unfinished');
    expect(
      (
        await db
          .collection('actor_states')
          .findOne(/** @type {any} */ ({ _id: SESSION_ACTORS[0] }))
      )?.resourceId,
    ).toBe('new-session');
  });
  it('rolls back all end writes if its transaction fails and can retry', async () => {
    await start();
    const before = await persisted();
    await expect(
      withTransaction(async (session) => {
        await endSession(before, now(), 'left', session);
        throw new Error('injected failure');
      }),
    ).rejects.toThrow('injected failure');
    expect(await persisted()).toEqual(before);
    expect(
      await db.collection('actor_states').countDocuments({ mode: 'inSession' }),
    ).toBe(2);
    await leaveSession({
      sessionId: String(SESSION_ID),
      getIdentity: identity,
      operationId: randomUUID(),
      now,
    });
    expect((await persisted())?.status).toBe('ended');
  });
  it('cleanup remains pending on failure, continues both removals, and a later retry completes', async () => {
    await withTransaction(async (session) =>
      endSession(await persisted(), now(), 'left', session),
    );
    const remove = vi.fn(async () => {
      throw new Error('offline');
    });
    const close = vi.fn(async () => {});
    await cleanupSessionMedia(SESSION_ID, { remove, close, now });
    expect(remove).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledOnce();
    expect((await persisted())?.mediaCleanup).toMatchObject({
      state: 'pending',
      attempts: 1,
      lastErrorCode: 'MEDIA_CLEANUP_FAILED',
    });
    await cleanupSessionMedia(SESSION_ID, {
      remove: async () => {},
      close,
      now,
    });
    expect((await persisted())?.mediaCleanup).toMatchObject({
      state: 'complete',
      attempts: 2,
    });
  });
  it('a late join invalidates an in-flight cleanup, without reviving the session', async () => {
    await withTransaction(async (session) =>
      endSession(await persisted(), now(), 'left', session),
    );
    /** @type {() => void} */ let release = () => {};
    /** @type {() => void} */ let entered = () => {};
    const blocked = new Promise((resolve) => {
      release = () => resolve(undefined);
    });
    const started = new Promise((resolve) => {
      entered = () => resolve(undefined);
    });
    const work = cleanupSessionMedia(SESSION_ID, {
      remove: async () => {
        entered();
        await blocked;
      },
      close: async () => {},
    });
    await started;
    await process(event(0));
    release();
    await work;
    expect((await persisted())?.mediaCleanup.state).toBe('pending');
    expect((await persisted())?.status).toBe('ended');
  });
  it('reconciles expired actor reservations through the common deadline primitive', async () => {
    at = new Date(at.getTime() + 300_000);
    await withTransaction((session) =>
      reconcileActorSession(SESSION_ACTORS[0], now(), session),
    );
    expect(
      await db.collection('actor_states').countDocuments({ mode: 'idle' }),
    ).toBe(2);
  });
  it('GET/leave HTTP enforce membership, CSRF, validation and terminal state', async () => {
    expect(
      (await request(app).get(`/api/v1/sessions/${SESSION_ID}`)).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .get(`/api/v1/sessions/${SESSION_ID}`)
          .set('Cookie', `ck_session=${cookies[2]}`)
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .get('/api/v1/sessions/bad')
          .set('Cookie', `ck_session=${cookies[0]}`)
      ).status,
    ).toBe(400);
    expect(
      (await request(app).post(`/api/v1/sessions/${SESSION_ID}/leave`).send({}))
        .status,
    ).toBe(403);
    expect((await postLeave(0, 'bad')).status).toBe(422);
    expect(
      (await postLeave(0, randomUUID(), { expectedVersion: 0 })).status,
    ).toBe(422);
    const result = await postLeave();
    expect(result.status).toBe(200);
    expect(result.body.data.status).toBe('ended');
    const read = await request(app)
      .get(`/api/v1/sessions/${SESSION_ID}`)
      .set('Cookie', `ck_session=${cookies[1]}`);
    expect(read.status).toBe(200);
    expect(read.headers['cache-control']).toBe('no-store');
  });
  it('default signed webhook route uses the real lifecycle consumer', async () => {
    for (const index of [0, 1]) {
      const body = event(index).toJsonString();
      await request(app)
        .post('/api/v1/webhooks/livekit')
        .set('Content-Type', 'application/webhook+json')
        .set('Authorization', await signWebhookBody(body))
        .send(body)
        .expect(204);
    }
    expect((await persisted())?.status).toBe('active');
  });
  it('settles a disconnect at detection time even when media reconciliation crosses the selection deadline', async () => {
    await start();
    at = new Date(at.getTime() + 20_000);
    await process(event(0, 'participant_left', 'PA_old'), {
      readParticipant: async () => {
        at = new Date(at.getTime() + 50_000);
        return null;
      },
    });
    expect(await persisted()).toMatchObject({
      status: 'reconnecting',
      activeDurationMs: 20_000,
      selectionRemainingMs: 40_000,
    });
  });
  it('rolls back presence, counter and actor guards when the start consumer fails after its writes', async () => {
    await process(event(0));
    const before = await persisted();
    const secondJoin = event(1);
    await expect(
      process(secondJoin, {
        onVerifiedPresence: async (
          /** @type {Parameters<typeof consumer>[0]} */ input,
        ) => {
          await consumer(input);
          throw new Error('after start');
        },
      }),
    ).rejects.toThrow('after start');
    expect(await persisted()).toEqual(before);
    expect(await db.collection('statistics').countDocuments()).toBe(0);
    expect(
      await db
        .collection('webhook_receipts')
        .findOne({ eventId: secondJoin.id }),
    ).toBeNull();
    expect(
      (
        await db
          .collection('actor_states')
          .findOne(/** @type {any} */ ({ _id: SESSION_ACTORS[0] }))
      )?.version,
    ).toBe(0);
    await process(secondJoin);
    expect(
      (
        await db
          .collection('statistics')
          .findOne(/** @type {any} */ ({ _id: 'lifetime' }))
      )?.startedSessions,
    ).toBe(1);
  });
  it('join racing leave cannot revive the ended room or count it twice', async () => {
    await process(event(0));
    await Promise.all([
      process(event(1)),
      leaveSession({
        sessionId: String(SESSION_ID),
        getIdentity: identity,
        operationId: randomUUID(),
        now,
      }),
    ]);
    const doc = await persisted();
    expect(doc?.status).toBe('ended');
    const stats = await db
      .collection('statistics')
      .findOne(/** @type {any} */ ({ _id: 'lifetime' }));
    expect(stats?.startedSessions ?? 0).toBe(doc?.startedAt ? 1 : 0);
    expect(
      await db.collection('actor_states').countDocuments({ mode: 'idle' }),
    ).toBe(2);
  });
  it('discards a token when leave commits while signing', async () => {
    const sign = vi.fn(
      async (
        /** @type {Parameters<typeof import('../../server/integrations/livekit/media-token.js').signMediaToken>[0]} */ input,
      ) => {
        await leaveSession({
          sessionId: String(SESSION_ID),
          getIdentity: identity,
          operationId: randomUUID(),
          now,
        });
        return {
          url: 'wss://lifecycle.example.test',
          token: 'must-not-be-returned',
          expiresAt: input.expiresAt,
        };
      },
    );
    await expect(
      issueMediaToken(
        { sessionId: String(SESSION_ID), getIdentity: identity },
        { now, sign },
      ),
    ).rejects.toMatchObject({ code: 'SESSION_ENDED' });
  });
  it('returns only each member current role, never the opposite role or face-down scenario mapping', async () => {
    await start();
    const cardId = new ObjectId();
    const revisionId = new ObjectId();
    const hidden = new ObjectId();
    await db
      .collection('practice_sessions')
      .updateOne({ _id: SESSION_ID }, { $set: { currentCardId: cardId } });
    await db.collection('session_cards').insertMany([
      {
        _id: cardId,
        sessionId: SESSION_ID,
        scenarioVersionId: revisionId,
        slot: 0,
        status: 'current',
        roleAKey: SESSION_ACTORS[0],
        roleBKey: SESSION_ACTORS[1],
      },
      {
        sessionId: SESSION_ID,
        scenarioVersionId: hidden,
        slot: 1,
        status: 'faceDown',
      },
    ]);
    await db.collection('content_versions').insertOne({
      _id: revisionId,
      contentId: new ObjectId(),
      kind: 'scenario',
      revision: 1,
      payload: {
        title: '会話',
        context: '店',
        objective: '注文',
        roleA: 'ROLE_A_PRIVATE',
        roleB: 'ROLE_B_PRIVATE',
      },
    });
    for (const index of [0, 1]) {
      const response = await readSession({
        sessionId: String(SESSION_ID),
        getIdentity: () => identity(index),
        now,
      });
      expect(response.data.currentCard.myRole).toBe(
        index === 0 ? 'ROLE_A_PRIVATE' : 'ROLE_B_PRIVATE',
      );
      expect(JSON.stringify(response.data)).not.toContain(
        index === 0 ? 'ROLE_B_PRIVATE' : 'ROLE_A_PRIVATE',
      );
      expect(JSON.stringify(response.data)).not.toContain(String(hidden));
    }
  });
  it('keeps guest summary access only before the fixed expiry even when physical cleanup has not run', async () => {
    const guestId = new ObjectId();
    const key = `guest:${guestId}`;
    await db.collection('guest_sessions').insertOne({
      _id: guestId,
      credentialHash: hashGuestCredential('summary-test'),
      practiceSessionId: SESSION_ID,
      status: 'active',
      version: 0,
    });
    await db
      .collection('practice_sessions')
      .updateOne(
        { _id: SESSION_ID },
        { $set: { 'members.1': { actorKey: key, kind: 'guest' } } },
      );
    await leaveSession({
      sessionId: String(SESSION_ID),
      getIdentity: identity,
      operationId: randomUUID(),
      now,
    });
    const getIdentity = () =>
      resolveIdentityFromCookies({
        authCookie: undefined,
        guestCookie: 'summary-test',
        now: now(),
      });
    at = new Date(at.getTime() + 899_999);
    expect(
      (await readSession({ sessionId: String(SESSION_ID), getIdentity, now }))
        .data.status,
    ).toBe('ended');
    at = new Date(at.getTime() + 1);
    await expect(
      readSession({ sessionId: String(SESSION_ID), getIdentity, now }),
    ).rejects.toMatchObject({ code: 'GUEST_EXPIRED', status: 410 });
    expect(
      await db.collection('guest_sessions').findOne({ _id: guestId }),
    ).not.toBeNull();
  });
  it('coordination-only timeout discovery also executes media cleanup after commit', async () => {
    await db.collection('practice_sessions').updateOne(
      { _id: SESSION_ID },
      {
        $set: {
          createdAt: new Date(at.getTime() - 300_000),
          presence: SESSION_ACTORS.map((actorKey) => ({
            actorKey,
            connected: false,
            reconnectUntil: now(),
          })),
        },
      },
    );
    const response = await request(app)
      .get('/api/v1/me/coordination')
      .set('Cookie', `ck_session=${cookies[0]}`);
    expect(response.status).toBe(200);
    expect(response.body.data.mode).toBe('idle');
    expect(removeMediaParticipant).toHaveBeenCalledTimes(2);
    expect((await persisted())?.mediaCleanup.state).toBe('complete');
  });
  it('new invitation reconciles and revokes an expired old room before claiming the actor', async () => {
    at = new Date(at.getTime() + 300_000);
    const result = await createInvitation({
      identity: await identity(),
      operationId: randomUUID(),
      now: now(),
    });
    expect(result.status).toBe('open');
    expect(removeMediaParticipant).toHaveBeenCalledTimes(2);
    expect((await persisted())?.mediaCleanup.state).toBe('complete');
    expect(
      (
        await db
          .collection('actor_states')
          .findOne(/** @type {any} */ ({ _id: SESSION_ACTORS[0] }))
      )?.mode,
    ).toBe('inviting');
  });
});
