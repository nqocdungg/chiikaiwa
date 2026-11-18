import { randomUUID } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
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
import { TokenVerifier } from 'livekit-server-sdk';
import { api } from '../../client/src/services/api-client.js';
import {
  getSession,
  getMediaToken,
  leaveSession,
} from '../../client/src/features/kaiwa/session-api.js';
import * as roomService from '../../server/integrations/livekit/room-service.js';
import { createApp } from '../../server/app.js';
import { readAuthEnv } from '../../server/config/env.js';
import { signJwt } from '../../server/modules/identity/crypto.js';
import {
  createInvitation,
  createInviteRequest,
  respondToInviteRequest,
} from '../../server/modules/invitations/invitation-service.js';
import {
  assertPairCanEnterSession,
  createPairBlock,
  lockUserAccount,
} from '../../server/modules/safety/safety-service.js';
import { cleanupSessionMedia } from '../../server/modules/sessions/media-cleanup-service.js';
import { issueMediaToken } from '../../server/modules/sessions/media-token-service.js';
import {
  connectDatabase,
  disconnectDatabase,
  withTransaction,
} from '../../server/persistence/database.js';
import { up as applyDesignIndexes } from '../../server/persistence/migrations/20261103000100-add-design-indexes.js';

/** @type {MongoMemoryReplSet} */
let replicaSet;
/** @type {import('mongoose').mongo.Db} */
let db;
const { ObjectId } = mongoose.Types;
const app = createApp();

/** @param {mongoose.Types.ObjectId} id @param {string} displayName @param {{status?: string}} [opts] */
async function seedUser(id, displayName, { status = 'active' } = {}) {
  const now = new Date('2026-11-15T00:00:00.000Z');
  await db.collection('users').insertOne({
    _id: id,
    email: `${id.toHexString()}@example.test`,
    emailKey: `${id.toHexString()}@example.test`,
    role: 'learner',
    status,
    authVersion: 0,
    version: 0,
    displayName,
    avatarKey: 'default-1',
    profile: { level: 'N3', interests: [] },
    createdAt: now,
    updatedAt: now,
  });
  await db.collection('actor_states').insertOne(
    /** @type {any} */ ({
      _id: `user:${id.toHexString()}`,
      mode: 'idle',
      version: 0,
      createdAt: now,
      updatedAt: now,
    }),
  );
}

/** @param {mongoose.Types.ObjectId} userId @param {Date} now */
async function seedAuthSession(userId, now) {
  const sessionId = new ObjectId();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);
  await db.collection('auth_sessions').insertOne({
    _id: sessionId,
    userId,
    authVersion: 0,
    issuedAt: now,
    expiresAt,
    purgeAt: expiresAt,
  });
  const env = readAuthEnv();
  const jwt = signJwt(
    {
      sub: userId.toHexString(),
      sid: sessionId.toHexString(),
      authVersion: 0,
      iat: Math.floor(now.getTime() / 1000),
      exp: Math.floor(expiresAt.getTime() / 1000),
    },
    env.jwtSecret,
    { issuer: env.jwtIssuer, audience: env.jwtAudience },
  );
  return { sessionId, jwt };
}

/** @param {mongoose.Types.ObjectId} id */
function userIdentity(id) {
  return { kind: 'user', actorKey: `user:${id.toHexString()}`, userId: id };
}

/** @param {mongoose.Types.ObjectId} userId @param {mongoose.Types.ObjectId} sessionId */
async function authenticatedUserIdentity(userId, sessionId) {
  const user = await db.collection('users').findOne({ _id: userId });
  if (!user) throw new Error('Expected seeded user');
  return {
    kind: /** @type {const} */ ('user'),
    actorKey: `user:${userId.toHexString()}`,
    userId,
    sessionId,
    role: /** @type {const} */ ('learner'),
    user,
  };
}

describe('BE-008 shared safety guard integration', () => {
  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({
      binary: { version: '8.2.7' },
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    process.env.MONGODB_URI = replicaSet.getUri();
    process.env.MONGODB_DB_NAME = 'chiikaiwa_safety_test';
    process.env.APP_ORIGIN = 'https://chiikaiwa.example.test';
    process.env.JWT_SECRET = 'test-jwt-secret-0123456789abcdef0123456789';
    process.env.LIVEKIT_URL = 'wss://livekit.example.test';
    process.env.LIVEKIT_API_KEY = 'lk-test-key';
    process.env.LIVEKIT_API_SECRET = 'lk-test-secret-0123456789abcdef';
    db = await connectDatabase();
    await applyDesignIndexes(db);
  });

  afterAll(async () => {
    await disconnectDatabase();
    if (replicaSet) await replicaSet.stop();
  });

  beforeEach(async () => {
    for (const name of [
      'users',
      'auth_sessions',
      'guest_sessions',
      'actor_states',
      'invitations',
      'invite_requests',
      'match_proposals',
      'practice_sessions',
      'blocks',
      'operation_receipts',
      'rate_limits',
    ]) {
      await db.collection(name).deleteMany({});
    }
  });

  it('rejects busy actors, self-pairs, two-way blocks, locked accounts, and expired guests', async () => {
    const now = new Date('2026-11-15T00:00:00.000Z');
    const userA = new ObjectId();
    const userB = new ObjectId();
    const lockedUser = new ObjectId();
    await Promise.all([
      seedUser(userA, 'User A'),
      seedUser(userB, 'User B'),
      seedUser(lockedUser, 'Locked', { status: 'locked' }),
    ]);

    const keyA = `user:${userA.toHexString()}`;
    const keyB = `user:${userB.toHexString()}`;
    const keyLocked = `user:${lockedUser.toHexString()}`;

    await expect(
      withTransaction((session) =>
        assertPairCanEnterSession({
          db,
          session,
          firstActorKey: keyA,
          secondActorKey: keyA,
          now,
        }),
      ),
    ).rejects.toMatchObject({ status: 409, code: 'IDENTITY_CONFLICT' });

    await expect(
      withTransaction((session) =>
        assertPairCanEnterSession({
          db,
          session,
          firstActorKey: keyA,
          secondActorKey: keyLocked,
          now,
        }),
      ),
    ).rejects.toMatchObject({ status: 403, code: 'ACCOUNT_LOCKED' });

    // Busy actor (searching / inSession)
    await db
      .collection('actor_states')
      .updateOne(/** @type {any} */ ({ _id: keyB }), {
        $set: { mode: 'inSession', resourceId: new ObjectId().toHexString() },
      });
    await expect(
      withTransaction((session) =>
        assertPairCanEnterSession({
          db,
          session,
          firstActorKey: keyA,
          secondActorKey: keyB,
          now,
        }),
      ),
    ).rejects.toMatchObject({ status: 409, code: 'ACTOR_BUSY' });

    await db
      .collection('actor_states')
      .updateOne(/** @type {any} */ ({ _id: keyB }), {
        $set: { mode: 'idle' },
        $unset: { resourceId: '' },
      });

    // Two-way block: B blocks A, A->B check still rejects
    await createPairBlock({ blockerKey: keyB, blockedKey: keyA, now });
    await expect(
      withTransaction((session) =>
        assertPairCanEnterSession({
          db,
          session,
          firstActorKey: keyA,
          secondActorKey: keyB,
          now,
        }),
      ),
    ).rejects.toMatchObject({ status: 409, code: 'PAIR_BLOCKED' });

    // Expired guest
    const guestId = new ObjectId();
    await db.collection('guest_sessions').insertOne({
      _id: guestId,
      credentialHash: 'hash',
      invitationId: new ObjectId(),
      status: 'expired',
      version: 0,
      cleanupState: 'pending',
    });
    await expect(
      withTransaction((session) =>
        assertPairCanEnterSession({
          db,
          session,
          firstActorKey: keyA,
          secondActorKey: `guest:${guestId.toHexString()}`,
          now,
        }),
      ),
    ).rejects.toMatchObject({ status: 410, code: 'GUEST_EXPIRED' });
  });

  it.each(['host', 'requester'])(
    'rejects a fresh code submission after %s blocks the pair',
    async (blocker) => {
      const now = new Date();
      const hostId = new ObjectId();
      const requesterId = new ObjectId();
      const otherId = new ObjectId();
      await seedUser(hostId, 'Host');
      await seedUser(requesterId, 'Requester');
      await seedUser(otherId, 'Other');
      const host = userIdentity(hostId);
      const requester = userIdentity(requesterId);
      const auth = await seedAuthSession(requesterId, now);
      const invitation = await createInvitation({
        identity: host,
        operationId: randomUUID(),
        now,
      });
      const original = await createInviteRequest({
        identity: requester,
        code: invitation.code,
        operationId: randomUUID(),
        now,
      });
      const other = await createInviteRequest({
        identity: userIdentity(otherId),
        code: invitation.code,
        operationId: randomUUID(),
        now,
      });
      await createPairBlock({
        blockerKey: blocker === 'host' ? host.actorKey : requester.actorKey,
        blockedKey: blocker === 'host' ? requester.actorKey : host.actorKey,
        now,
      });
      const csrf = await request(app).get('/api/v1/auth/csrf');
      const response = await request(app)
        .post('/api/v1/invitation-requests')
        .set('Origin', 'https://chiikaiwa.example.test')
        .set('Cookie', [
          `ck_session=${auth.jwt}`,
          csrf.headers['set-cookie'][0].split(';')[0],
        ])
        .set('X-CSRF-Token', csrf.body.data.csrfToken)
        .set('Idempotency-Key', randomUUID())
        .send({ code: invitation.code });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('PAIR_BLOCKED');
      expect(
        await db
          .collection('invite_requests')
          .findOne({ _id: new ObjectId(original.id) }),
      ).toMatchObject({ status: 'rejected' });
      expect(
        await db
          .collection('actor_states')
          .findOne(/** @type {any} */ ({ _id: requester.actorKey })),
      ).toMatchObject({ mode: 'idle' });
      const accepted = await respondToInviteRequest({
        requestId: other.id,
        hostKey: host.actorKey,
        expectedVersion: other.version,
        decision: 'accept',
        operationId: randomUUID(),
        assertPairCanEnterSession,
        now,
      });
      expect(accepted.status).toBe('accepted');
    },
  );

  it('retries code submission against a block committed after its snapshot', async () => {
    const now = new Date();
    const hostId = new ObjectId();
    const requesterId = new ObjectId();
    await seedUser(hostId, 'Host');
    await seedUser(requesterId, 'Requester');
    const host = userIdentity(hostId);
    const requester = userIdentity(requesterId);
    const invitation = await createInvitation({
      identity: host,
      operationId: randomUUID(),
      now,
    });
    const originalFind = mongoose.mongo.Collection.prototype.findOne;
    let snapshots = 0;
    const spy = vi
      .spyOn(mongoose.mongo.Collection.prototype, 'findOne')
      .mockImplementation(
        /** @this {import('mongoose').mongo.Collection} */ async function (
          ...args
        ) {
          const result = await originalFind.apply(this, args);
          if (
            this.collectionName === 'invitations' &&
            args[0]?.code === invitation.code &&
            args[1]?.session
          ) {
            snapshots += 1;
            // The first lookup is the preflight reconciliation transaction.
            if (snapshots === 2) {
              await createPairBlock({
                blockerKey: host.actorKey,
                blockedKey: requester.actorKey,
                now,
              });
            }
          }
          return result;
        },
      );
    try {
      await expect(
        createInviteRequest({
          identity: requester,
          code: invitation.code,
          operationId: randomUUID(),
          now,
        }),
      ).rejects.toMatchObject({ status: 409, code: 'PAIR_BLOCKED' });
      expect(snapshots).toBeGreaterThanOrEqual(3);
      expect(await db.collection('invite_requests').countDocuments()).toBe(0);
      expect(
        await db
          .collection('actor_states')
          .findOne(/** @type {any} */ ({ _id: requester.actorKey })),
      ).toMatchObject({ mode: 'idle' });
    } finally {
      spy.mockRestore();
    }
  });

  it('rechecks invitation expiry after a transient transaction conflict through HTTP', async () => {
    const now = new Date();
    const hostId = new ObjectId();
    const requesterId = new ObjectId();
    await seedUser(hostId, 'Host');
    await seedUser(requesterId, 'Requester');
    const host = userIdentity(hostId);
    const auth = await seedAuthSession(hostId, now);
    const invitation = await createInvitation({
      identity: host,
      operationId: randomUUID(),
      now,
    });
    const pending = await createInviteRequest({
      identity: userIdentity(requesterId),
      code: invitation.code,
      operationId: randomUUID(),
      now,
    });
    const guard = vi.fn(async (input) => {
      await assertPairCanEnterSession(input);
      if (guard.mock.calls.length === 1) {
        vi.setSystemTime(new Date(invitation.expiresAt));
        const conflict = new mongoose.mongo.MongoServerError({
          message: 'Write conflict',
          code: 112,
        });
        conflict.addErrorLabel('TransientTransactionError');
        throw conflict;
      }
    });
    const retryApp = createApp({ assertPairCanEnterSession: guard });
    const csrf = await request(retryApp).get('/api/v1/auth/csrf');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    try {
      const response = await request(retryApp)
        .post(`/api/v1/invitation-requests/${pending.id}/responses`)
        .set('Origin', 'https://chiikaiwa.example.test')
        .set('Cookie', [
          `ck_session=${auth.jwt}`,
          csrf.headers['set-cookie'][0].split(';')[0],
        ])
        .set('X-CSRF-Token', csrf.body.data.csrfToken)
        .set('Idempotency-Key', randomUUID())
        .send({ expectedVersion: pending.version, decision: 'accept' });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('INVITATION_UNAVAILABLE');
      expect(guard).toHaveBeenCalledOnce();
      expect(await db.collection('practice_sessions').countDocuments()).toBe(0);
      expect(
        await db
          .collection('invite_requests')
          .findOne({ _id: new ObjectId(pending.id) }),
      ).toMatchObject({ status: 'pending' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('connects FE-004 API calls to BE-008 admission, signed media grants and revocation', async () => {
    const now = new Date();
    const hostId = new ObjectId();
    const requesterId = new ObjectId();
    const outsiderId = new ObjectId();
    await seedUser(hostId, 'Host');
    await seedUser(requesterId, 'Requester');
    await seedUser(outsiderId, 'Outsider');
    const host = await seedAuthSession(hostId, now);
    const requester = await seedAuthSession(requesterId, now);
    const outsider = await seedAuthSession(outsiderId, now);
    const cookies = new Map([['ck_session', host.jwt]]);
    // Supply browser cookie/Origin behavior while routing the real Fetch client
    // into Express. Only the external LiveKit cleanup adapter is mocked.
    vi.stubGlobal(
      'fetch',
      /** @type {typeof fetch} */ (
        async (input, init) => {
          const path = String(input);
          const method = /** @type {'get'|'post'} */ (
            (init?.method ?? 'GET').toLowerCase()
          );
          let pending = request(app)[method](path);
          new Headers(init?.headers).forEach((value, key) => {
            pending = pending.set(key, value);
          });
          pending = pending
            .set('Origin', 'https://chiikaiwa.example.test')
            .set(
              'Cookie',
              [...cookies].map(([key, value]) => `${key}=${value}`).join('; '),
            );
          if (typeof init?.body === 'string')
            pending = pending.send(JSON.parse(init.body));
          const response = await pending;
          for (const value of response.headers['set-cookie'] ?? []) {
            const pair = value.split(';')[0];
            const separator = pair.indexOf('=');
            cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
          }
          return new Response(response.text, {
            status: response.status,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      ),
    );
    const remove = vi
      .spyOn(roomService, 'removeMediaParticipant')
      .mockResolvedValue(undefined);
    vi.spyOn(roomService, 'closeMediaRoom').mockResolvedValue(undefined);
    vi.spyOn(roomService, 'notifyMediaSession').mockResolvedValue(undefined);
    api.setCsrfToken(null);
    try {
      const invitation = /** @type {any} */ (
        (await api.post('/invitations', {})).data
      );
      cookies.set('ck_session', requester.jwt);
      const pending = /** @type {any} */ (
        (await api.post('/invitation-requests', { code: invitation.code })).data
      );
      cookies.set('ck_session', host.jwt);
      const accepted = /** @type {any} */ (
        (
          await api.post(`/invitation-requests/${pending.id}/responses`, {
            expectedVersion: pending.version,
            decision: 'accept',
          })
        ).data
      );
      expect(accepted.status).toBe('accepted');
      const sessionId = accepted.sessionId;
      expect((await getSession(sessionId)).data).toMatchObject({
        id: sessionId,
        status: 'preparing',
      });
      const verifier = new TokenVerifier(
        process.env.LIVEKIT_API_KEY ?? '',
        process.env.LIVEKIT_API_SECRET ?? '',
      );
      for (const { id, auth } of [
        { id: hostId, auth: host },
        { id: requesterId, auth: requester },
      ]) {
        cookies.set('ck_session', auth.jwt);
        const credential = (await getMediaToken(sessionId)).data;
        const claims = await verifier.verify(credential.token);
        expect(claims.sub).toBe(`user:${id.toHexString()}`);
        expect(claims.video).toMatchObject({
          room: `session-${sessionId}`,
          roomJoin: true,
          canPublishData: true,
          roomAdmin: false,
        });
        expect(credential.url).toBe(process.env.LIVEKIT_URL);
      }
      cookies.set('ck_session', outsider.jwt);
      await expect(getMediaToken(sessionId)).rejects.toMatchObject({
        status: 404,
      });
      cookies.set('ck_session', host.jwt);
      await createPairBlock({
        blockerKey: `user:${hostId.toHexString()}`,
        blockedKey: `user:${requesterId.toHexString()}`,
      });
      expect(remove).toHaveBeenCalledWith(
        `session-${sessionId}`,
        `user:${hostId.toHexString()}`,
      );
      expect(remove).toHaveBeenCalledWith(
        `session-${sessionId}`,
        `user:${requesterId.toHexString()}`,
      );
      expect((await getSession(sessionId)).data.status).toBe('ended');
      await expect(getMediaToken(sessionId)).rejects.toMatchObject({
        status: 409,
        code: 'SESSION_ENDED',
      });
      expect((await leaveSession(sessionId, randomUUID())).data.status).toBe(
        'ended',
      );
    } finally {
      api.setCsrfToken(null);
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });

  it('wires BE-008 guard into HTTP invitation acceptance and rejects blocked pairs', async () => {
    const now = new Date();
    const hostId = new ObjectId();
    const requesterId = new ObjectId();
    await Promise.all([
      seedUser(hostId, 'Host'),
      seedUser(requesterId, 'Requester'),
    ]);
    const hostSession = await seedAuthSession(hostId, now);
    const host = userIdentity(hostId);
    const requester = userIdentity(requesterId);

    const invitation = await createInvitation({
      identity: host,
      operationId: randomUUID(),
      now,
    });
    const inviteRequest = await createInviteRequest({
      identity: requester,
      code: invitation.code,
      operationId: randomUUID(),
      now,
    });

    // Simulate an existing pair block while the invite request is still pending
    // so HTTP acceptance exercises createApp()'s default BE-008 guard directly.
    await db.collection('blocks').insertOne({
      blockerKey: requester.actorKey,
      blockedKey: host.actorKey,
      createdAt: now,
    });

    const csrfResponse = await request(app).get('/api/v1/auth/csrf');
    const csrfCookie = csrfResponse.headers['set-cookie']?.[0]?.split(';')[0];
    const csrfToken = csrfResponse.body.data.csrfToken;
    const response = await request(app)
      .post(`/api/v1/invitation-requests/${inviteRequest.id}/responses`)
      .set('Origin', 'https://chiikaiwa.example.test')
      .set('Cookie', [`ck_session=${hostSession.jwt}`, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', randomUUID())
      .send({
        expectedVersion: inviteRequest.version,
        decision: 'accept',
      });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('PAIR_BLOCKED');
    expect(await db.collection('practice_sessions').countDocuments()).toBe(0);

    // Locked requester via HTTP returns 403 ACCOUNT_LOCKED
    const lockedReqId = new ObjectId();
    await seedUser(lockedReqId, 'Locked Req', { status: 'locked' });
    const lockedInviteReq = await createInviteRequest({
      identity: userIdentity(lockedReqId),
      code: invitation.code,
      operationId: randomUUID(),
      now,
    });
    const lockedRes = await request(app)
      .post(`/api/v1/invitation-requests/${lockedInviteReq.id}/responses`)
      .set('Origin', 'https://chiikaiwa.example.test')
      .set('Cookie', [`ck_session=${hostSession.jwt}`, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', randomUUID())
      .send({
        expectedVersion: lockedInviteReq.version,
        decision: 'accept',
      });
    expect(lockedRes.status).toBe(403);
    expect(lockedRes.body.error.code).toBe('ACCOUNT_LOCKED');

    // Revoked/expired guest requester via HTTP returns 410 GUEST_EXPIRED
    const guestId = new ObjectId();
    await db.collection('guest_sessions').insertOne({
      _id: guestId,
      credentialHash: `hash-${guestId.toHexString()}`,
      invitationId: new ObjectId(invitation.id),
      status: 'expired',
      version: 0,
      cleanupState: 'pending',
    });
    const guestInviteReq = await createInviteRequest({
      identity: {
        kind: 'guest',
        actorKey: `guest:${guestId.toHexString()}`,
        guestId,
      },
      code: invitation.code,
      operationId: randomUUID(),
      now,
    });
    const guestRes = await request(app)
      .post(`/api/v1/invitation-requests/${guestInviteReq.id}/responses`)
      .set('Origin', 'https://chiikaiwa.example.test')
      .set('Cookie', [`ck_session=${hostSession.jwt}`, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', randomUUID())
      .send({
        expectedVersion: guestInviteReq.version,
        decision: 'accept',
      });
    expect(guestRes.status).toBe(410);
    expect(guestRes.body.error.code).toBe('GUEST_EXPIRED');
    expect(await db.collection('practice_sessions').countDocuments()).toBe(0);
  });

  it('DB-T04: concurrent accept invitation vs createPairBlock leaves no active session or media right', async () => {
    const now = new Date('2026-11-15T01:00:00.000Z');
    const hostId = new ObjectId();
    const requesterId = new ObjectId();
    await Promise.all([
      seedUser(hostId, 'Host'),
      seedUser(requesterId, 'Requester'),
    ]);
    const hostAuth = await seedAuthSession(hostId, now);
    const requesterAuth = await seedAuthSession(requesterId, now);
    const host = await authenticatedUserIdentity(hostId, hostAuth.sessionId);
    const requester = await authenticatedUserIdentity(
      requesterId,
      requesterAuth.sessionId,
    );

    const invitation = await createInvitation({
      identity: host,
      operationId: randomUUID(),
      now,
    });
    const inviteRequest = await createInviteRequest({
      identity: requester,
      code: invitation.code,
      operationId: randomUUID(),
      now: new Date(now.getTime() + 1),
    });

    const effects = vi.fn(async () => {});
    const [acceptResult, blockResult] = await Promise.allSettled([
      respondToInviteRequest({
        requestId: inviteRequest.id,
        hostKey: host.actorKey,
        expectedVersion: inviteRequest.version,
        decision: 'accept',
        operationId: randomUUID(),
        assertPairCanEnterSession,
        now: new Date(now.getTime() + 2),
      }),
      createPairBlock({
        blockerKey: requester.actorKey,
        blockedKey: host.actorKey,
        now: new Date(now.getTime() + 2),
        effects,
      }),
    ]);

    expect(blockResult.status).toBe('fulfilled');
    const blocks = await db.collection('blocks').find({}).toArray();
    expect(blocks).toHaveLength(1);

    const activeSessions = await db
      .collection('practice_sessions')
      .find({ status: { $ne: 'ended' } })
      .toArray();
    expect(activeSessions).toHaveLength(0);

    if (acceptResult.status === 'fulfilled') {
      // Accept won the race; block must have retried on WriteConflict and ended the session.
      const ended = await db
        .collection('practice_sessions')
        .findOne({ _id: new ObjectId(acceptResult.value.sessionId) });
      expect(ended).toMatchObject({
        status: 'ended',
        endReason: 'blocked',
      });
      expect(ended?.mediaCleanup?.state).toBe('pending');
      expect(effects).toHaveBeenCalledOnce();

      await expect(
        issueMediaToken(
          {
            sessionId: acceptResult.value.sessionId,
            getIdentity: async () => host,
          },
          { now: () => now },
        ),
      ).rejects.toMatchObject({ status: 409 });
    } else {
      // Block won the race; accept must have failed with PAIR_BLOCKED or VERSION_CONFLICT
      // (if block revoked the pending invite request first).
      expect(acceptResult.reason).toMatchObject({ status: 409 });
      expect(['PAIR_BLOCKED', 'VERSION_CONFLICT']).toContain(
        acceptResult.reason.code,
      );
      expect(await db.collection('practice_sessions').countDocuments()).toBe(0);
    }
  });

  it('DB-T04: concurrent accept invitation vs lockUserAccount leaves no active session or valid auth', async () => {
    const now = new Date('2026-11-15T02:00:00.000Z');
    const hostId = new ObjectId();
    const requesterId = new ObjectId();
    await Promise.all([
      seedUser(hostId, 'Host'),
      seedUser(requesterId, 'Requester'),
    ]);
    const hostAuth = await seedAuthSession(hostId, now);
    const requesterAuth = await seedAuthSession(requesterId, now);
    const host = await authenticatedUserIdentity(hostId, hostAuth.sessionId);
    const requester = await authenticatedUserIdentity(
      requesterId,
      requesterAuth.sessionId,
    );

    const invitation = await createInvitation({
      identity: host,
      operationId: randomUUID(),
      now,
    });
    const inviteRequest = await createInviteRequest({
      identity: requester,
      code: invitation.code,
      operationId: randomUUID(),
      now: new Date(now.getTime() + 1),
    });

    const effects = vi.fn(async () => {});
    const [acceptResult, lockResult] = await Promise.allSettled([
      respondToInviteRequest({
        requestId: inviteRequest.id,
        hostKey: host.actorKey,
        expectedVersion: inviteRequest.version,
        decision: 'accept',
        operationId: randomUUID(),
        assertPairCanEnterSession,
        now: new Date(now.getTime() + 2),
      }),
      lockUserAccount({
        userId: requesterId.toHexString(),
        now: new Date(now.getTime() + 2),
        effects,
      }),
    ]);

    expect(lockResult.status).toBe('fulfilled');
    const lockedUser = await db
      .collection('users')
      .findOne({ _id: requesterId });
    expect(lockedUser?.status).toBe('locked');
    expect(lockedUser?.authVersion).toBe(1);
    const activeAuth = await db
      .collection('auth_sessions')
      .find({ userId: requesterId, revokedAt: { $exists: false } })
      .toArray();
    expect(activeAuth).toHaveLength(0);

    const openSessions = await db
      .collection('practice_sessions')
      .find({ status: { $ne: 'ended' } })
      .toArray();
    expect(openSessions).toHaveLength(0);

    if (acceptResult.status === 'fulfilled') {
      const ended = await db
        .collection('practice_sessions')
        .findOne({ _id: new ObjectId(acceptResult.value.sessionId) });
      expect(ended).toMatchObject({
        status: 'ended',
        endReason: 'account_locked',
      });
      expect(effects).toHaveBeenCalledOnce();
    } else {
      // Lock won the race; accept must have failed with ACCOUNT_LOCKED or VERSION_CONFLICT
      // (if lock cancelled the pending invite request first).
      expect([403, 409]).toContain(acceptResult.reason.status);
      expect(['ACCOUNT_LOCKED', 'VERSION_CONFLICT']).toContain(
        acceptResult.reason.code,
      );
      expect(await db.collection('practice_sessions').countDocuments()).toBe(0);
    }
  });

  it('ends active session on block, revokes LiveKit media via adapter, and aborts in-flight media-token signing', async () => {
    const now = new Date('2026-11-15T03:00:00.000Z');
    const hostId = new ObjectId();
    const requesterId = new ObjectId();
    await Promise.all([
      seedUser(hostId, 'Host'),
      seedUser(requesterId, 'Requester'),
    ]);
    const hostAuth = await seedAuthSession(hostId, now);
    const requesterAuth = await seedAuthSession(requesterId, now);
    const host = await authenticatedUserIdentity(hostId, hostAuth.sessionId);
    const requester = await authenticatedUserIdentity(
      requesterId,
      requesterAuth.sessionId,
    );

    const invitation = await createInvitation({
      identity: host,
      operationId: randomUUID(),
      now,
    });
    const inviteRequest = await createInviteRequest({
      identity: requester,
      code: invitation.code,
      operationId: randomUUID(),
      now: new Date(now.getTime() + 1),
    });
    const accepted = await respondToInviteRequest({
      requestId: inviteRequest.id,
      hostKey: host.actorKey,
      expectedVersion: inviteRequest.version,
      decision: 'accept',
      operationId: randomUUID(),
      assertPairCanEnterSession,
      now: new Date(now.getTime() + 2),
    });

    // Simulate a block happening DURING LiveKit token signing: post-sign check must reject!
    await expect(
      issueMediaToken(
        {
          sessionId: accepted.sessionId,
          getIdentity: async () => host,
        },
        {
          now: () => new Date(now.getTime() + 3),
          sign: async ({ expiresAt }) => {
            await createPairBlock({
              blockerKey: requester.actorKey,
              blockedKey: host.actorKey,
              sessionId: accepted.sessionId,
              now: new Date(now.getTime() + 3),
              effects: async () => {},
            });
            return {
              token: 'mock-livekit-jwt',
              url: 'wss://livekit.example.test',
              expiresAt,
            };
          },
        },
      ),
    ).rejects.toMatchObject({ status: 409 });

    const endedSession = await db
      .collection('practice_sessions')
      .findOne({ _id: new ObjectId(accepted.sessionId) });
    expect(endedSession).toMatchObject({
      status: 'ended',
      endReason: 'blocked',
    });
    expect(
      await db.collection('actor_states').find({ mode: 'idle' }).toArray(),
    ).toHaveLength(2);

    // Mocked LiveKit cleanup adapter: first attempt fails -> stays pending,
    // retry succeeds -> transitions mediaCleanup.state -> complete, and ended
    // session continues to refuse new media tokens.
    const failingRemove = vi.fn(async () => {
      throw new Error('LiveKit temporary failure');
    });
    const close = vi.fn(async () => {});
    await cleanupSessionMedia(endedSession?._id, {
      remove: failingRemove,
      close,
      now: () => new Date(now.getTime() + 4),
    });
    const failedCleanup = await db
      .collection('practice_sessions')
      .findOne({ _id: endedSession?._id });
    expect(failedCleanup?.mediaCleanup).toMatchObject({
      state: 'pending',
      lastErrorCode: 'MEDIA_CLEANUP_FAILED',
    });
    expect(failedCleanup?.mediaCleanup?.attempts).toBeGreaterThanOrEqual(1);

    const remove = vi.fn(async () => {});
    await cleanupSessionMedia(endedSession?._id, {
      remove,
      close,
      now: () => new Date(now.getTime() + 5),
    });
    expect(remove).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledTimes(2);
    const cleaned = await db
      .collection('practice_sessions')
      .findOne({ _id: endedSession?._id });
    expect(cleaned?.mediaCleanup?.state).toBe('complete');

    await expect(
      issueMediaToken(
        {
          sessionId: accepted.sessionId,
          getIdentity: async () => host,
        },
        { now: () => new Date(now.getTime() + 6) },
      ),
    ).rejects.toMatchObject({ status: 409, code: 'SESSION_ENDED' });
  });

  it('DB-T04: direct assertPairCanEnterSession vs block/lock race retries on WriteConflict and returns PAIR_BLOCKED/ACCOUNT_LOCKED', async () => {
    const now = new Date('2026-11-15T03:30:00.000Z');
    const userA = new ObjectId();
    const userB = new ObjectId();
    const userC = new ObjectId();
    await Promise.all([
      seedUser(userA, 'User A'),
      seedUser(userB, 'User B'),
      seedUser(userC, 'User C'),
    ]);
    const keyA = `user:${userA.toHexString()}`;
    const keyB = `user:${userB.toHexString()}`;
    const keyC = `user:${userC.toHexString()}`;

    const [guardBlockRes, blockRes] = await Promise.allSettled([
      withTransaction((session) =>
        assertPairCanEnterSession({
          db,
          session,
          firstActorKey: keyA,
          secondActorKey: keyB,
          now,
        }),
      ),
      createPairBlock({ blockerKey: keyB, blockedKey: keyA, now }),
    ]);
    expect(blockRes.status).toBe('fulfilled');
    if (guardBlockRes.status === 'rejected') {
      expect(guardBlockRes.reason).toMatchObject({
        status: 409,
        code: 'PAIR_BLOCKED',
      });
    }

    const [guardLockRes, lockRes] = await Promise.allSettled([
      withTransaction((session) =>
        assertPairCanEnterSession({
          db,
          session,
          firstActorKey: keyA,
          secondActorKey: keyC,
          now,
        }),
      ),
      lockUserAccount({ userId: userC.toHexString(), now }),
    ]);
    expect(lockRes.status).toBe('fulfilled');
    if (guardLockRes.status === 'rejected') {
      expect(guardLockRes.reason).toMatchObject({
        status: 403,
        code: 'ACCOUNT_LOCKED',
      });
    }
  });

  it('does not cancel unrelated invitations or requests when blocking one requester, and revokes inviting/searching on account lock', async () => {
    const now = new Date('2026-11-15T03:45:00.000Z');
    const hostId = new ObjectId();
    const reqBId = new ObjectId();
    const reqCId = new ObjectId();
    const searcherId = new ObjectId();
    await Promise.all([
      seedUser(hostId, 'Host'),
      seedUser(reqBId, 'Req B'),
      seedUser(reqCId, 'Req C'),
      seedUser(searcherId, 'Searcher'),
    ]);
    const hostAuth = await seedAuthSession(hostId, now);
    const host = userIdentity(hostId);
    const reqB = userIdentity(reqBId);
    const reqC = userIdentity(reqCId);

    const invitation = await createInvitation({
      identity: host,
      operationId: randomUUID(),
      now,
    });
    const requestB = await createInviteRequest({
      identity: reqB,
      code: invitation.code,
      operationId: randomUUID(),
      now: new Date(now.getTime() + 1),
    });
    const requestC = await createInviteRequest({
      identity: reqC,
      code: invitation.code,
      operationId: randomUUID(),
      now: new Date(now.getTime() + 2),
    });

    // Block B only: B's request is rejected & B returns to idle; host's invitation & C's request remain open/pending.
    await createPairBlock({
      blockerKey: host.actorKey,
      blockedKey: reqB.actorKey,
      now: new Date(now.getTime() + 3),
    });
    expect(
      await db
        .collection('invitations')
        .findOne({ _id: new ObjectId(invitation.id) }),
    ).toMatchObject({ status: 'open' });
    expect(
      await db
        .collection('invite_requests')
        .findOne({ _id: new ObjectId(requestB.id) }),
    ).toMatchObject({ status: 'rejected' });
    expect(
      await db
        .collection('invite_requests')
        .findOne({ _id: new ObjectId(requestC.id) }),
    ).toMatchObject({ status: 'pending' });
    expect(
      await db
        .collection('actor_states')
        .findOne(/** @type {any} */ ({ _id: reqB.actorKey })),
    ).toMatchObject({ mode: 'idle' });

    // Lock host: cancels invitation + remaining pending request C, releases both to idle, and rejects old JWT.
    await lockUserAccount({
      userId: hostId.toHexString(),
      now: new Date(now.getTime() + 4),
    });
    expect(
      await db
        .collection('invitations')
        .findOne({ _id: new ObjectId(invitation.id) }),
    ).toMatchObject({ status: 'cancelled' });
    expect(
      await db
        .collection('invite_requests')
        .findOne({ _id: new ObjectId(requestC.id) }),
    ).toMatchObject({ status: 'cancelled' });
    expect(
      await db
        .collection('actor_states')
        .findOne(/** @type {any} */ ({ _id: host.actorKey })),
    ).toMatchObject({ mode: 'idle' });
    expect(
      await db
        .collection('actor_states')
        .findOne(/** @type {any} */ ({ _id: reqC.actorKey })),
    ).toMatchObject({ mode: 'idle' });

    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', [`ck_session=${hostAuth.jwt}`]);
    expect(meRes.status).toBe(401);
    expect(meRes.body.error.code).toBe('SESSION_EXPIRED');

    // Lock searching user: clears search & releases actor_state to idle.
    const searcherKey = `user:${searcherId.toHexString()}`;
    await db
      .collection('actor_states')
      .updateOne(/** @type {any} */ ({ _id: searcherKey }), {
        $set: {
          mode: 'searching',
          search: {
            requestId: randomUUID(),
            level: 'N3',
            desiredMinutes: 15,
            allowAdjacent: true,
            queuedAt: now,
            leaseUntil: new Date(now.getTime() + 30_000),
          },
        },
      });
    await lockUserAccount({
      userId: searcherId.toHexString(),
      now: new Date(now.getTime() + 5),
    });
    const searcherState = await db
      .collection('actor_states')
      .findOne(/** @type {any} */ ({ _id: searcherKey }));
    expect(searcherState?.mode).toBe('idle');
    expect(searcherState?.search).toBeUndefined();
  });

  it('rolls back safety guard writes when the enclosing transaction fails', async () => {
    const now = new Date('2026-11-15T04:00:00.000Z');
    const userA = new ObjectId();
    const userB = new ObjectId();
    await Promise.all([seedUser(userA, 'User A'), seedUser(userB, 'User B')]);

    await expect(
      withTransaction(async (session) => {
        await assertPairCanEnterSession({
          db,
          session,
          firstActorKey: `user:${userA.toHexString()}`,
          secondActorKey: `user:${userB.toHexString()}`,
          now,
        });
        throw new Error('forced rollback');
      }),
    ).rejects.toThrow('forced rollback');

    const states = await db.collection('actor_states').find({}).toArray();
    expect(states.every((s) => s.version === 0)).toBe(true);

    // Invalid sessionId in createPairBlock rolls back block insertion
    await expect(
      createPairBlock({
        blockerKey: `user:${userA.toHexString()}`,
        blockedKey: `user:${userB.toHexString()}`,
        sessionId: new ObjectId().toHexString(),
        now,
      }),
    ).rejects.toMatchObject({ status: 404, code: 'RESOURCE_NOT_FOUND' });
    expect(await db.collection('blocks').countDocuments()).toBe(0);
  });
});
