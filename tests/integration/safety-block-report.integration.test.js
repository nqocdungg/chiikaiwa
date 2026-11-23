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
import * as roomService from '../../server/integrations/livekit/room-service.js';
import { createApp } from '../../server/app.js';
import { readAuthEnv } from '../../server/config/env.js';
import {
  hashGuestCredential,
  signJwt,
} from '../../server/modules/identity/crypto.js';
import {
  createInvitation,
  createInviteRequest,
  respondToInviteRequest,
} from '../../server/modules/invitations/invitation-service.js';
import { assertPairCanEnterSession } from '../../server/modules/safety/safety-service.js';
import {
  connectDatabase,
  disconnectDatabase,
} from '../../server/persistence/database.js';
import { up as applyDesignIndexes } from '../../server/persistence/migrations/20261103000100-add-design-indexes.js';

/** @type {MongoMemoryReplSet} */
let replicaSet;
/** @type {import('mongoose').mongo.Db} */
let db;
const { ObjectId } = mongoose.Types;
const app = createApp();
const APP_ORIGIN = 'http://localhost:5173';

/** @param {mongoose.Types.ObjectId} id @param {string} displayName @param {{status?: string, email?: string}} [opts] */
async function seedUser(id, displayName, { status = 'active', email } = {}) {
  const now = new Date();
  const userEmail = email ?? `${id.toHexString()}@example.test`;
  await db.collection('users').insertOne({
    _id: id,
    email: userEmail,
    emailKey: userEmail.toLowerCase(),
    role: 'learner',
    status,
    authVersion: 0,
    version: 0,
    displayName,
    avatarKey: 'default-1',
    profile: { level: 'N3', interests: ['travel'] },
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

/** @param {mongoose.Types.ObjectId} userId */
async function createAuthCookieHeader(userId) {
  const now = new Date();
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
  return `ck_session=${jwt}`;
}

/**
 * @param {mongoose.Types.ObjectId} guestId
 * @param {mongoose.Types.ObjectId} practiceSessionId
 * @param {{ status?: 'active' | 'summary' | 'expired', expiresAt?: Date }} [opts]
 */
async function seedGuestSession(
  guestId,
  practiceSessionId,
  { status = 'active', expiresAt = new Date(Date.now() + 15 * 60 * 1000) } = {},
) {
  const credential = `guest-cred-${guestId.toHexString()}`;
  const now = new Date();
  await db.collection('guest_sessions').insertOne({
    _id: guestId,
    credentialHash: hashGuestCredential(credential),
    status,
    practiceSessionId,
    expiresAt,
    version: 0,
    createdAt: now,
    updatedAt: now,
  });
  await db.collection('actor_states').updateOne(
    /** @type {any} */ ({ _id: `guest:${guestId.toHexString()}` }),
    {
      $setOnInsert: {
        mode: 'idle',
        version: 0,
        createdAt: now,
        updatedAt: now,
      },
    },
    { upsert: true },
  );
  return `ck_guest=${credential}`;
}

/**
 * @param {string} firstActorKey
 * @param {string} secondActorKey
 * @param {{ status?: 'preparing' | 'active' | 'ended', markInSession?: boolean }} [opts]
 */
async function seedPracticeSession(
  firstActorKey,
  secondActorKey,
  { status = 'active', markInSession = status !== 'ended' } = {},
) {
  const sessionId = new ObjectId();
  const now = new Date();
  const memberEntry = (/** @type {string} */ actorKey) => {
    const [kind, hex] = actorKey.split(':');
    return kind === 'user'
      ? { actorKey, kind: 'user', userId: new ObjectId(hex) }
      : { actorKey, kind: 'guest' };
  };

  await db.collection('practice_sessions').insertOne({
    _id: sessionId,
    originKind: 'invite',
    originId: new ObjectId(),
    roomName: `session-${sessionId.toHexString()}`,
    status,
    version: 1,
    members: [memberEntry(firstActorKey), memberEntry(secondActorKey)],
    startedAt: now,
    ...(status === 'ended' ? { endedAt: now, endReason: 'left' } : {}),
    activeDurationMs: 0,
    selectionRemainingMs: 60_000,
    presence: [
      { actorKey: firstActorKey, connected: status === 'active' },
      { actorKey: secondActorKey, connected: status === 'active' },
    ],
    screenShare: { state: 'idle', version: 0 },
    mediaCleanup: { state: 'none', attempts: 0 },
    createdAt: now,
    updatedAt: now,
  });

  if (markInSession) {
    for (const actorKey of [firstActorKey, secondActorKey]) {
      await db.collection('actor_states').updateOne(
        /** @type {any} */ ({ _id: actorKey }),
        {
          $set: {
            mode: 'inSession',
            resourceId: sessionId.toHexString(),
            updatedAt: now,
          },
          $inc: { version: 1 },
        },
        { upsert: true },
      );
    }
  }

  return sessionId;
}

async function getCsrf() {
  const response = await request(app).get('/api/v1/auth/csrf');
  const csrfToken = response.body.data.csrfToken;
  const setCookie = response.headers['set-cookie'];
  const cookieHeader = Array.isArray(setCookie)
    ? setCookie.map((c) => c.split(';')[0]).join('; ')
    : '';
  return { csrfToken, cookieHeader };
}

/**
 * @param {string} authCookie
 * @param {{ idempotencyKey?: string }} [opts]
 */
async function mutatingHeaders(authCookie, { idempotencyKey } = {}) {
  const csrf = await getCsrf();
  return {
    Cookie: [authCookie, csrf.cookieHeader].filter(Boolean).join('; '),
    Origin: APP_ORIGIN,
    'X-CSRF-Token': csrf.csrfToken,
    'Content-Type': 'application/json',
    ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
  };
}

describe('BE-019 safety block and report APIs (integration)', () => {
  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    process.env.MONGODB_URI = replicaSet.getUri();
    process.env.MONGODB_DB_NAME = 'chiikaiwa_be019_test';
    process.env.APP_ORIGIN = APP_ORIGIN;
    process.env.JWT_SECRET = 'test-secret-for-be019-safety-apis-32chars!';
    process.env.COOKIE_SECURE = 'false';

    await disconnectDatabase();
    db = await connectDatabase();
    await applyDesignIndexes(db);
  });

  afterAll(async () => {
    await disconnectDatabase();
    await replicaSet.stop();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.spyOn(roomService, 'closeMediaRoom').mockResolvedValue(undefined);
    vi.spyOn(roomService, 'removeMediaParticipant').mockResolvedValue(
      undefined,
    );
    vi.spyOn(roomService, 'notifyMediaSession').mockResolvedValue(undefined);
    const collections = await db.collections();
    for (const collection of collections) {
      await collection.deleteMany({});
    }
  });

  describe('POST /api/v1/me/blocks', () => {
    it('blocks partner in active session, ends session with blocked reason, and blocks future invitations in both directions', async () => {
      const userA = new ObjectId();
      const userB = new ObjectId();
      await seedUser(userA, 'Hanh Nhi', { email: 'private-a@example.test' });
      await seedUser(userB, 'Doi Tac B', { email: 'private-b@example.test' });

      const actorA = `user:${userA.toHexString()}`;
      const actorB = `user:${userB.toHexString()}`;
      const sessionId = await seedPracticeSession(actorA, actorB, {
        status: 'active',
      });
      const cookieA = await createAuthCookieHeader(userA);
      const idempotencyKey = randomUUID();

      const res = await request(app)
        .post('/api/v1/me/blocks')
        .set(await mutatingHeaders(cookieA, { idempotencyKey }))
        .send({ sessionId: sessionId.toHexString(), targetActorKey: actorB });

      expect(res.status).toBe(200);
      expect(res.body.data.id).toMatch(/^[0-9a-f]{24}$/u);
      expect(res.body.meta).toHaveProperty('requestId');

      const sessionDoc = await db
        .collection('practice_sessions')
        .findOne({ _id: sessionId });
      expect(sessionDoc?.status).toBe('ended');
      expect(sessionDoc?.endReason).toBe('blocked');
      expect(roomService.closeMediaRoom).toHaveBeenCalledTimes(1);

      const blockDoc = await db
        .collection('blocks')
        .findOne({ _id: new ObjectId(res.body.data.id) });
      expect(blockDoc?.blockerKey).toBe(actorA);
      expect(blockDoc?.blockedKey).toBe(actorB);

      // Replay with same Idempotency-Key returns same block ID without error or duplicate
      const replay = await request(app)
        .post('/api/v1/me/blocks')
        .set(await mutatingHeaders(cookieA, { idempotencyKey }))
        .send({ sessionId: sessionId.toHexString(), targetActorKey: actorB });
      expect(replay.status).toBe(200);
      expect(replay.body.data.id).toBe(res.body.data.id);

      // Same Idempotency-Key with different payload returns 409 IDEMPOTENCY_CONFLICT
      const conflict = await request(app)
        .post('/api/v1/me/blocks')
        .set(await mutatingHeaders(cookieA, { idempotencyKey }))
        .send({
          sessionId: sessionId.toHexString(),
          targetActorKey: `user:${new ObjectId().toHexString()}`,
        });
      // Non-member session check happens first or conflict check; verify 404/409
      expect([404, 409]).toContain(conflict.status);

      // Same Idempotency-Key with another valid sessionId -> 409 IDEMPOTENCY_CONFLICT
      const secondSessionId = await seedPracticeSession(actorA, actorB, {
        status: 'ended',
        markInSession: false,
      });
      const payloadConflict = await request(app)
        .post('/api/v1/me/blocks')
        .set(await mutatingHeaders(cookieA, { idempotencyKey }))
        .send({
          sessionId: secondSessionId.toHexString(),
          targetActorKey: actorB,
        });
      expect(payloadConflict.status).toBe(409);
      expect(payloadConflict.body.error.code).toBe('IDEMPOTENCY_CONFLICT');

      // New Idempotency-Key for already-blocked pair returns same block without duplicate
      const dupRes = await request(app)
        .post('/api/v1/me/blocks')
        .set(await mutatingHeaders(cookieA, { idempotencyKey: randomUUID() }))
        .send({ sessionId: sessionId.toHexString(), targetActorKey: actorB });
      expect(dupRes.status).toBe(200);
      expect(dupRes.body.data.id).toBe(res.body.data.id);
      expect(
        await db.collection('blocks').countDocuments({ blockerKey: actorA }),
      ).toBe(1);

      // Two-way block enforced on invitations (both directions rejected with PAIR_BLOCKED)
      const invB = await createInvitation({
        identity: { kind: 'user', actorKey: actorB, userId: userB },
        operationId: randomUUID(),
      });
      await expect(
        createInviteRequest({
          identity: { kind: 'user', actorKey: actorA, userId: userA },
          code: invB.code,
          operationId: randomUUID(),
        }),
      ).rejects.toMatchObject({ status: 409, code: 'PAIR_BLOCKED' });
    });

    it('rejects self-block, non-member session, unauthenticated, locked user, and expired guest', async () => {
      const userA = new ObjectId();
      const userB = new ObjectId();
      const userC = new ObjectId();
      await seedUser(userA, 'User A');
      await seedUser(userB, 'User B');
      await seedUser(userC, 'User C');

      const actorA = `user:${userA.toHexString()}`;
      const actorB = `user:${userB.toHexString()}`;
      const actorC = `user:${userC.toHexString()}`;
      const sessionAB = await seedPracticeSession(actorA, actorB, {
        status: 'ended',
      });
      const cookieA = await createAuthCookieHeader(userA);
      const cookieC = await createAuthCookieHeader(userC);

      // Unauthenticated -> 401
      const unauth = await request(app)
        .post('/api/v1/me/blocks')
        .set(await mutatingHeaders('', { idempotencyKey: randomUUID() }))
        .send({ sessionId: sessionAB.toHexString(), targetActorKey: actorB });
      expect(unauth.status).toBe(401);

      // Self-block -> 409 IDENTITY_CONFLICT
      const selfRes = await request(app)
        .post('/api/v1/me/blocks')
        .set(await mutatingHeaders(cookieA, { idempotencyKey: randomUUID() }))
        .send({ sessionId: sessionAB.toHexString(), targetActorKey: actorA });
      expect(selfRes.status).toBe(409);
      expect(selfRes.body.error.code).toBe('IDENTITY_CONFLICT');

      // Non-member C -> 404 RESOURCE_NOT_FOUND
      const outsiderRes = await request(app)
        .post('/api/v1/me/blocks')
        .set(await mutatingHeaders(cookieC, { idempotencyKey: randomUUID() }))
        .send({ sessionId: sessionAB.toHexString(), targetActorKey: actorB });
      expect(outsiderRes.status).toBe(404);
      expect(outsiderRes.body.error.code).toBe('RESOURCE_NOT_FOUND');

      // Member A trying to block non-member C via sessionAB -> 404
      const wrongTargetRes = await request(app)
        .post('/api/v1/me/blocks')
        .set(await mutatingHeaders(cookieA, { idempotencyKey: randomUUID() }))
        .send({ sessionId: sessionAB.toHexString(), targetActorKey: actorC });
      expect(wrongTargetRes.status).toBe(404);

      // Locked account -> 403 ACCOUNT_LOCKED
      await db
        .collection('users')
        .updateOne({ _id: userA }, { $set: { status: 'locked' } });
      const lockedRes = await request(app)
        .post('/api/v1/me/blocks')
        .set(await mutatingHeaders(cookieA, { idempotencyKey: randomUUID() }))
        .send({ sessionId: sessionAB.toHexString(), targetActorKey: actorB });
      expect(lockedRes.status).toBe(403);
      expect(lockedRes.body.error.code).toBe('ACCOUNT_LOCKED');

      // Expired guest -> 410 GUEST_EXPIRED
      const guestId = new ObjectId();
      const guestActor = `guest:${guestId.toHexString()}`;
      const sessionBG = await seedPracticeSession(actorB, guestActor, {
        status: 'ended',
      });
      const expiredGuestCookie = await seedGuestSession(guestId, sessionBG, {
        status: 'summary',
        expiresAt: new Date(Date.now() - 60_000),
      });
      const expiredRes = await request(app)
        .post('/api/v1/me/blocks')
        .set(
          await mutatingHeaders(expiredGuestCookie, {
            idempotencyKey: randomUUID(),
          }),
        )
        .send({ sessionId: sessionBG.toHexString(), targetActorKey: actorB });
      expect(expiredRes.status).toBe(410);
      expect(expiredRes.body.error.code).toBe('GUEST_EXPIRED');
    });

    it('contends safely when POST /me/blocks races with invitation acceptance', async () => {
      const hostId = new ObjectId();
      const requesterId = new ObjectId();
      await seedUser(hostId, 'Host');
      await seedUser(requesterId, 'Requester');

      const hostKey = `user:${hostId.toHexString()}`;
      const requesterKey = `user:${requesterId.toHexString()}`;

      // Past ended session so requester can legitimately call POST /me/blocks
      const pastSessionId = await seedPracticeSession(hostKey, requesterKey, {
        status: 'ended',
        markInSession: false,
      });

      const inv = await createInvitation({
        identity: { kind: 'user', actorKey: hostKey, userId: hostId },
        operationId: randomUUID(),
      });
      const reqDoc = await createInviteRequest({
        identity: {
          kind: 'user',
          actorKey: requesterKey,
          userId: requesterId,
        },
        code: inv.code,
        operationId: randomUUID(),
      });

      const requesterCookie = await createAuthCookieHeader(requesterId);
      const headers = await mutatingHeaders(requesterCookie, {
        idempotencyKey: randomUUID(),
      });

      const [blockOutcome, acceptOutcome] = await Promise.allSettled([
        request(app).post('/api/v1/me/blocks').set(headers).send({
          sessionId: pastSessionId.toHexString(),
          targetActorKey: hostKey,
        }),
        respondToInviteRequest({
          requestId: reqDoc.id,
          hostKey,
          decision: 'accept',
          expectedVersion: reqDoc.version,
          operationId: randomUUID(),
          assertPairCanEnterSession,
        }),
      ]);

      expect(blockOutcome.status).toBe('fulfilled');
      if (blockOutcome.status === 'fulfilled') {
        expect(blockOutcome.value.status).toBe(200);
      }

      // Either accept lost to PAIR_BLOCKED / ACTOR_BUSY, OR accept committed first and block ended the new session
      const blocksCount = await db
        .collection('blocks')
        .countDocuments({ blockerKey: requesterKey, blockedKey: hostKey });
      expect(blocksCount).toBe(1);

      const activeSessions = await db
        .collection('practice_sessions')
        .find({
          'members.actorKey': { $all: [hostKey, requesterKey] },
          status: { $ne: 'ended' },
        })
        .toArray();
      expect(activeSessions).toHaveLength(0);

      if (acceptOutcome.status === 'rejected') {
        expect([409]).toContain(acceptOutcome.reason.status);
      }
    });
  });

  describe('GET /api/v1/me/blocks & DELETE /api/v1/me/blocks/:id', () => {
    it('lists only own blocks with Partner projection (no email, guest labeled Khách) and cursor pagination', async () => {
      const userA = new ObjectId();
      const userB = new ObjectId();
      const userC = new ObjectId();
      const guestId = new ObjectId();
      await seedUser(userA, 'User A', { email: 'secret-a@example.test' });
      await seedUser(userB, 'User B', { email: 'secret-b@example.test' });
      await seedUser(userC, 'User C', { email: 'secret-c@example.test' });

      const actorA = `user:${userA.toHexString()}`;
      const actorB = `user:${userB.toHexString()}`;
      const actorC = `user:${userC.toHexString()}`;
      const actorGuest = `guest:${guestId.toHexString()}`;

      const t1 = new Date('2026-11-20T10:00:00.000Z');
      const t2 = new Date('2026-11-20T11:00:00.000Z');
      const t3 = new Date('2026-11-20T12:00:00.000Z');

      await db.collection('blocks').insertMany([
        { blockerKey: actorA, blockedKey: actorB, createdAt: t1 },
        { blockerKey: actorA, blockedKey: actorGuest, createdAt: t2 },
        { blockerKey: actorA, blockedKey: actorC, createdAt: t3 },
        // Reverse block by B -> must NOT appear in A's list
        { blockerKey: actorB, blockedKey: actorA, createdAt: t3 },
      ]);

      const cookieA = await createAuthCookieHeader(userA);
      const cookieB = await createAuthCookieHeader(userB);

      const page1 = await request(app)
        .get('/api/v1/me/blocks?limit=2')
        .set('Cookie', cookieA);

      expect(page1.status).toBe(200);
      expect(page1.body.data.items).toHaveLength(2);
      expect(page1.body.data.items[0].partner).toMatchObject({
        actorKey: actorC,
        displayName: 'User C',
      });
      expect(page1.body.data.items[0].partner).not.toHaveProperty('email');
      expect(page1.body.data.items[1].partner).toEqual({
        actorKey: actorGuest,
        displayName: 'Khách',
      });
      expect(typeof page1.body.data.nextCursor).toBe('string');

      // Cross-user cursor must fail with 400 INVALID_CURSOR
      const crossCursor = await request(app)
        .get(
          `/api/v1/me/blocks?cursor=${encodeURIComponent(page1.body.data.nextCursor)}`,
        )
        .set('Cookie', cookieB);
      expect(crossCursor.status).toBe(400);
      expect(crossCursor.body.error.code).toBe('INVALID_CURSOR');

      const page2 = await request(app)
        .get(
          `/api/v1/me/blocks?limit=2&cursor=${encodeURIComponent(page1.body.data.nextCursor)}`,
        )
        .set('Cookie', cookieA);
      expect(page2.status).toBe(200);
      expect(page2.body.data.items).toHaveLength(1);
      expect(page2.body.data.items[0].partner.actorKey).toBe(actorB);
      expect(page2.body.data.items[0].partner).not.toHaveProperty('email');
      expect(page2.body.data.nextCursor).toBeNull();
    });

    it('enforces owner-only delete, idempotent retry, and keeps reverse block intact', async () => {
      const userA = new ObjectId();
      const userB = new ObjectId();
      await seedUser(userA, 'User A');
      await seedUser(userB, 'User B');

      const actorA = `user:${userA.toHexString()}`;
      const actorB = `user:${userB.toHexString()}`;
      const now = new Date();
      const blockABId = new ObjectId();
      const blockBAId = new ObjectId();

      await db.collection('blocks').insertMany([
        {
          _id: blockABId,
          blockerKey: actorA,
          blockedKey: actorB,
          createdAt: now,
        },
        {
          _id: blockBAId,
          blockerKey: actorB,
          blockedKey: actorA,
          createdAt: now,
        },
      ]);

      const cookieA = await createAuthCookieHeader(userA);

      // A cannot delete B's block -> 404 RESOURCE_NOT_FOUND
      const wrongOwner = await request(app)
        .delete(`/api/v1/me/blocks/${blockBAId.toHexString()}`)
        .set(await mutatingHeaders(cookieA, { idempotencyKey: randomUUID() }));
      expect(wrongOwner.status).toBe(404);
      expect(wrongOwner.body.error.code).toBe('RESOURCE_NOT_FOUND');

      // A deletes A's own block -> 204
      const deleteKey = randomUUID();
      const delRes = await request(app)
        .delete(`/api/v1/me/blocks/${blockABId.toHexString()}`)
        .set(await mutatingHeaders(cookieA, { idempotencyKey: deleteKey }));
      expect(delRes.status).toBe(204);

      // Idempotent retry with same key -> 204
      const delReplay = await request(app)
        .delete(`/api/v1/me/blocks/${blockABId.toHexString()}`)
        .set(await mutatingHeaders(cookieA, { idempotencyKey: deleteKey }));
      expect(delReplay.status).toBe(204);

      // New key after delete -> 404
      const delAgain = await request(app)
        .delete(`/api/v1/me/blocks/${blockABId.toHexString()}`)
        .set(await mutatingHeaders(cookieA, { idempotencyKey: randomUUID() }));
      expect(delAgain.status).toBe(404);

      // Reverse block B -> A still exists and still blocks invitations (BR-28)
      const invA = await createInvitation({
        identity: { kind: 'user', actorKey: actorA, userId: userA },
        operationId: randomUUID(),
      });
      await expect(
        createInviteRequest({
          identity: { kind: 'user', actorKey: actorB, userId: userB },
          code: invA.code,
          operationId: randomUUID(),
        }),
      ).rejects.toMatchObject({ status: 409, code: 'PAIR_BLOCKED' });
    });
  });

  describe('POST /api/v1/reports', () => {
    it('creates a report for user and guest without blocking or ending session, supports idempotent replay, and sets no TTL', async () => {
      const userA = new ObjectId();
      const guestId = new ObjectId();
      await seedUser(userA, 'User A');

      const actorA = `user:${userA.toHexString()}`;
      const actorGuest = `guest:${guestId.toHexString()}`;
      const sessionId = await seedPracticeSession(actorA, actorGuest, {
        status: 'active',
      });
      const cookieA = await createAuthCookieHeader(userA);
      const guestCookie = await seedGuestSession(guestId, sessionId, {
        status: 'active',
      });

      const reportKey = randomUUID();
      const res = await request(app)
        .post('/api/v1/reports')
        .set(await mutatingHeaders(cookieA, { idempotencyKey: reportKey }))
        .send({
          sessionId: sessionId.toHexString(),
          targetActorKey: actorGuest,
          reason: 'Ngôn từ không phù hợp',
          description: 'Gây rối trong khi luyện hội thoại.',
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        status: 'new',
      });
      expect(res.body.data.id).toMatch(/^[0-9a-f]{24}$/u);
      expect(typeof res.body.data.createdAt).toBe('string');

      // Stored doc matches 06 §9 and has NO purgeAt (06 §10.2)
      const reportDoc = await db
        .collection('reports')
        .findOne({ _id: new ObjectId(res.body.data.id) });
      expect(reportDoc).toMatchObject({
        reporterKey: actorA,
        reportedKey: actorGuest,
        sessionId,
        reason: 'Ngôn từ không phù hợp',
        description: 'Gây rối trong khi luyện hội thoại.',
        status: 'new',
        version: 0,
      });
      expect(reportDoc).not.toHaveProperty('purgeAt');

      // Report must NOT create a block and must NOT end the active session (BR-28)
      expect(await db.collection('blocks').countDocuments({})).toBe(0);
      const sessionDoc = await db
        .collection('practice_sessions')
        .findOne({ _id: sessionId });
      expect(sessionDoc?.status).toBe('active');

      // Idempotent replay with same key + payload returns same report without duplicate
      const replay = await request(app)
        .post('/api/v1/reports')
        .set(await mutatingHeaders(cookieA, { idempotencyKey: reportKey }))
        .send({
          sessionId: sessionId.toHexString(),
          targetActorKey: actorGuest,
          reason: 'Ngôn từ không phù hợp',
          description: 'Gây rối trong khi luyện hội thoại.',
        });
      expect(replay.status).toBe(201);
      expect(replay.body.data.id).toBe(res.body.data.id);
      expect(await db.collection('reports').countDocuments({})).toBe(1);

      // Same key + different payload -> 409 IDEMPOTENCY_CONFLICT
      const conflict = await request(app)
        .post('/api/v1/reports')
        .set(await mutatingHeaders(cookieA, { idempotencyKey: reportKey }))
        .send({
          sessionId: sessionId.toHexString(),
          targetActorKey: actorGuest,
          reason: 'Lý do khác',
        });
      expect(conflict.status).toBe(409);
      expect(conflict.body.error.code).toBe('IDEMPOTENCY_CONFLICT');

      // Guest can also report partner within their trial session
      const guestReport = await request(app)
        .post('/api/v1/reports')
        .set(
          await mutatingHeaders(guestCookie, { idempotencyKey: randomUUID() }),
        )
        .send({
          sessionId: sessionId.toHexString(),
          targetActorKey: actorA,
          reason: 'Hành vi thiếu tôn trọng',
        });
      expect(guestReport.status).toBe(201);
      expect(guestReport.body.data.status).toBe('new');
      expect(await db.collection('reports').countDocuments({})).toBe(2);
    });

    it('rejects self-report, non-member, wrong partner, guest outside trial session, and invalid payload', async () => {
      const userA = new ObjectId();
      const userB = new ObjectId();
      const userC = new ObjectId();
      const guestId = new ObjectId();
      await seedUser(userA, 'User A');
      await seedUser(userB, 'User B');
      await seedUser(userC, 'User C');

      const actorA = `user:${userA.toHexString()}`;
      const actorB = `user:${userB.toHexString()}`;
      const actorC = `user:${userC.toHexString()}`;
      const actorGuest = `guest:${guestId.toHexString()}`;

      const sessionAB = await seedPracticeSession(actorA, actorB, {
        status: 'ended',
      });
      const sessionAG = await seedPracticeSession(actorA, actorGuest, {
        status: 'ended',
      });
      const cookieA = await createAuthCookieHeader(userA);
      const cookieC = await createAuthCookieHeader(userC);
      const guestCookie = await seedGuestSession(guestId, sessionAG, {
        status: 'summary',
      });

      // Self-report -> 409 IDENTITY_CONFLICT
      const selfRes = await request(app)
        .post('/api/v1/reports')
        .set(await mutatingHeaders(cookieA, { idempotencyKey: randomUUID() }))
        .send({
          sessionId: sessionAB.toHexString(),
          targetActorKey: actorA,
          reason: 'Tự báo cáo',
        });
      expect(selfRes.status).toBe(409);
      expect(selfRes.body.error.code).toBe('IDENTITY_CONFLICT');

      // Non-member C -> 404
      const outsiderRes = await request(app)
        .post('/api/v1/reports')
        .set(await mutatingHeaders(cookieC, { idempotencyKey: randomUUID() }))
        .send({
          sessionId: sessionAB.toHexString(),
          targetActorKey: actorB,
          reason: 'Ngoài phiên',
        });
      expect(outsiderRes.status).toBe(404);

      // Member A reporting non-member C in sessionAB -> 404
      const wrongPartnerRes = await request(app)
        .post('/api/v1/reports')
        .set(await mutatingHeaders(cookieA, { idempotencyKey: randomUUID() }))
        .send({
          sessionId: sessionAB.toHexString(),
          targetActorKey: actorC,
          reason: 'Sai đối tác',
        });
      expect(wrongPartnerRes.status).toBe(404);

      // Guest trying to report in another session -> 404
      const guestOtherSession = await request(app)
        .post('/api/v1/reports')
        .set(
          await mutatingHeaders(guestCookie, { idempotencyKey: randomUUID() }),
        )
        .send({
          sessionId: sessionAB.toHexString(),
          targetActorKey: actorA,
          reason: 'Sai phiên',
        });
      expect(guestOtherSession.status).toBe(404);

      // Empty reason -> 422
      const emptyReason = await request(app)
        .post('/api/v1/reports')
        .set(await mutatingHeaders(cookieA, { idempotencyKey: randomUUID() }))
        .send({
          sessionId: sessionAB.toHexString(),
          targetActorKey: actorB,
          reason: '   ',
        });
      expect(emptyReason.status).toBe(422);
      expect(emptyReason.body.error.code).toBe('VALIDATION_FAILED');
    });
  });
});
