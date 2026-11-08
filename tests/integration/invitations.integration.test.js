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
import { createApp } from '../../server/app.js';
import { readAuthEnv } from '../../server/config/env.js';
import { signJwt } from '../../server/modules/identity/crypto.js';
import {
  createInvitation,
  createInviteRequest,
  getInvitation,
  respondToInviteRequest,
} from '../../server/modules/invitations/invitation-service.js';
import { issueMediaToken } from '../../server/modules/sessions/media-token-service.js';
import {
  connectDatabase,
  disconnectDatabase,
} from '../../server/persistence/database.js';
import { up as applyDesignIndexes } from '../../server/persistence/migrations/20261103000100-add-design-indexes.js';

/** @typedef {Awaited<ReturnType<typeof import('../../server/modules/identity/identity-service.js').resolveIdentityFromCookies>>} Identity */
/** @type {MongoMemoryReplSet} */
let replicaSet;
/** @type {import('mongoose').mongo.Db} */
let db;
const { ObjectId } = mongoose.Types;
const app = createApp();

/** @param {mongoose.Types.ObjectId} id */
function userIdentity(id) {
  return { kind: 'user', actorKey: `user:${id.toHexString()}`, userId: id };
}

/**
 * @param {mongoose.Types.ObjectId} userId
 * @param {mongoose.Types.ObjectId} sessionId
 * @returns {Promise<Identity>}
 */
async function authenticatedUserIdentity(userId, sessionId) {
  const user = await db.collection('users').findOne({ _id: userId });
  if (!user) throw new Error('Expected seeded user');
  return {
    kind: 'user',
    actorKey: `user:${userId.toHexString()}`,
    userId,
    sessionId,
    role: 'learner',
    user,
  };
}

/** @param {mongoose.Types.ObjectId} id @param {string} displayName */
async function seedUser(id, displayName) {
  await db.collection('users').insertOne({
    _id: id,
    email: `${id.toHexString()}@example.test`,
    emailKey: `${id.toHexString()}@example.test`,
    role: 'learner',
    status: 'active',
    authVersion: 0,
    displayName,
    avatarKey: 'default-1',
    profile: { level: 'N3', interests: [] },
  });
}

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({
    binary: { version: '8.2.7' },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  vi.stubEnv('MONGODB_URI', replicaSet.getUri());
  vi.stubEnv('MONGODB_DB_NAME', 'chiikaiwa_invitations_test');
  vi.stubEnv('APP_ORIGIN', 'http://127.0.0.1:5173');
  db = await connectDatabase();
  await applyDesignIndexes(db);
});

beforeEach(async () => {
  await Promise.all(
    [
      'users',
      'actor_states',
      'invitations',
      'invite_requests',
      'practice_sessions',
      'operation_receipts',
      'auth_sessions',
      'rate_limits',
    ].map((name) => db.collection(name).deleteMany({})),
  );
});

afterAll(async () => {
  await disconnectDatabase();
  await replicaSet?.stop();
  vi.unstubAllEnvs();
});

describe('BE-009 invitation persistence', () => {
  it('mounts the authenticated endpoint and requires an operation ID', async () => {
    const now = new Date();
    const userId = new ObjectId();
    const sessionId = new ObjectId();
    const expiresAt = new Date(now.getTime() + 60_000);
    await seedUser(userId, 'Host');
    await db.collection('auth_sessions').insertOne({
      _id: sessionId,
      userId,
      authVersion: 0,
      issuedAt: now,
      expiresAt,
      purgeAt: expiresAt,
    });
    const authEnv = readAuthEnv();
    const token = signJwt(
      {
        sub: userId.toHexString(),
        sid: sessionId.toHexString(),
        authVersion: 0,
        iat: Math.floor(now.getTime() / 1000),
        exp: Math.floor(expiresAt.getTime() / 1000),
      },
      authEnv.jwtSecret,
      { issuer: authEnv.jwtIssuer, audience: authEnv.jwtAudience },
    );
    const csrf = await request(app).get('/api/v1/auth/csrf').expect(200);
    const csrfCookie = csrf.headers['set-cookie'][0].split(';')[0];
    const cookies = `${csrfCookie}; ck_session=${token}`;

    await request(app)
      .post('/api/v1/invitations')
      .set('Origin', 'http://127.0.0.1:5173')
      .set('Cookie', cookies)
      .set('X-CSRF-Token', csrf.body.data.csrfToken)
      .send({})
      .expect(422)
      .expect(({ body }) => expect(body.error.code).toBe('VALIDATION_FAILED'));

    await request(app)
      .post('/api/v1/invitations')
      .set('Origin', 'http://127.0.0.1:5173')
      .set('Cookie', cookies)
      .set('X-CSRF-Token', csrf.body.data.csrfToken)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          status: 'open',
          version: 0,
          code: expect.stringMatching(/^[A-HJ-NP-Z2-9]{10}$/u),
        });
      });
  });

  it('keeps the code private and replays creation without another invitation', async () => {
    const hostId = new ObjectId();
    const requesterId = new ObjectId();
    await Promise.all([
      seedUser(hostId, 'Host'),
      seedUser(requesterId, 'Requester'),
    ]);
    const host = userIdentity(hostId);
    const requester = userIdentity(requesterId);
    const operationId = randomUUID();
    const created = await createInvitation({ identity: host, operationId });
    const replayed = await createInvitation({ identity: host, operationId });
    expect(replayed).toEqual(created);
    expect(await db.collection('invitations').countDocuments()).toBe(1);

    await createInviteRequest({
      identity: requester,
      code: created.code,
      operationId: randomUUID(),
    });
    const requesterView = await getInvitation({
      invitationId: created.id,
      actorKey: requester.actorKey,
    });
    expect(requesterView).not.toHaveProperty('code');
    await expect(
      getInvitation({ invitationId: created.id, actorKey: 'user:outsider' }),
    ).rejects.toMatchObject({ status: 404, code: 'RESOURCE_NOT_FOUND' });
  });

  it('accepts only one concurrent requester and creates one two-member session', async () => {
    const ids = [new ObjectId(), new ObjectId(), new ObjectId()];
    await Promise.all(ids.map((id, index) => seedUser(id, `Learner ${index}`)));
    const [host, requesterA, requesterB] = ids.map(userIdentity);
    const invitation = await createInvitation({
      identity: host,
      operationId: randomUUID(),
    });
    const [requestA, requestB] = await Promise.all([
      createInviteRequest({
        identity: requesterA,
        code: invitation.code,
        operationId: randomUUID(),
      }),
      createInviteRequest({
        identity: requesterB,
        code: invitation.code,
        operationId: randomUUID(),
      }),
    ]);
    const guard = async () => {};
    const results = await Promise.allSettled([
      respondToInviteRequest({
        requestId: requestA.id,
        hostKey: host.actorKey,
        expectedVersion: requestA.version,
        decision: 'accept',
        operationId: randomUUID(),
        assertPairCanEnterSession: guard,
      }),
      respondToInviteRequest({
        requestId: requestB.id,
        hostKey: host.actorKey,
        expectedVersion: requestB.version,
        decision: 'accept',
        operationId: randomUUID(),
        assertPairCanEnterSession: guard,
      }),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    const sessions = await db
      .collection('practice_sessions')
      .find({})
      .toArray();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].members).toHaveLength(2);
    expect(
      new Set(
        sessions[0].members.map((/** @type {any} */ member) => member.actorKey),
      ).size,
    ).toBe(2);
    const requests = await db.collection('invite_requests').find({}).toArray();
    expect(
      requests.filter((request) => request.status === 'accepted'),
    ).toHaveLength(1);
    expect(
      requests.filter((request) => request.status === 'expired'),
    ).toHaveLength(1);
  });

  it('issues BE-010 media credentials to both members of a BE-009 session', async () => {
    const now = new Date('2026-11-08T00:00:00.000Z');
    const hostId = new ObjectId();
    const requesterId = new ObjectId();
    const hostLoginId = new ObjectId();
    const requesterLoginId = new ObjectId();
    const loginExpiresAt = new Date(now.getTime() + 60 * 60 * 1000);
    await Promise.all([
      seedUser(hostId, 'Host'),
      seedUser(requesterId, 'Requester'),
      db.collection('auth_sessions').insertMany([
        {
          _id: hostLoginId,
          userId: hostId,
          expiresAt: loginExpiresAt,
        },
        {
          _id: requesterLoginId,
          userId: requesterId,
          expiresAt: loginExpiresAt,
        },
      ]),
    ]);
    const host = await authenticatedUserIdentity(hostId, hostLoginId);
    const requester = await authenticatedUserIdentity(
      requesterId,
      requesterLoginId,
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
      now,
    });
    const pairGuard = vi.fn(async () => {});
    const accepted = await respondToInviteRequest({
      requestId: inviteRequest.id,
      hostKey: host.actorKey,
      expectedVersion: inviteRequest.version,
      decision: 'accept',
      operationId: randomUUID(),
      assertPairCanEnterSession: pairGuard,
      now,
    });
    const practiceSession = await db
      .collection('practice_sessions')
      .findOne({ _id: new ObjectId(accepted.sessionId) });
    const expectedRoomName = `session-${accepted.sessionId}`;
    expect(pairGuard).toHaveBeenCalledOnce();
    expect(practiceSession).toMatchObject({
      roomName: expectedRoomName,
      status: 'preparing',
      members: [{ actorKey: host.actorKey }, { actorKey: requester.actorKey }],
    });

    const sign = vi.fn(async ({ actorKey, expiresAt }) => ({
      token: `token-for-${actorKey}`,
      url: 'wss://media.example.test',
      expiresAt,
    }));
    for (const identity of [host, requester]) {
      const credential = await issueMediaToken(
        {
          sessionId: accepted.sessionId,
          getIdentity: async () => identity,
        },
        { sign, now: () => now },
      );
      expect(credential).toMatchObject({
        token: `token-for-${identity.actorKey}`,
        url: 'wss://media.example.test',
      });
    }
    expect(sign.mock.calls).toEqual([
      [
        expect.objectContaining({
          actorKey: host.actorKey,
          roomName: expectedRoomName,
        }),
      ],
      [
        expect.objectContaining({
          actorKey: requester.actorKey,
          roomName: expectedRoomName,
        }),
      ],
    ]);
  });

  it('rejects acceptance at the exact deadline and releases reservations', async () => {
    const now = new Date('2026-11-07T00:00:00.000Z');
    const hostId = new ObjectId();
    const requesterId = new ObjectId();
    await Promise.all([
      seedUser(hostId, 'Host'),
      seedUser(requesterId, 'Requester'),
    ]);
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
      now: new Date(now.getTime() + 1),
    });
    await expect(
      respondToInviteRequest({
        requestId: inviteRequest.id,
        hostKey: host.actorKey,
        expectedVersion: inviteRequest.version,
        decision: 'accept',
        operationId: randomUUID(),
        assertPairCanEnterSession: async () => {},
        now: new Date(invitation.expiresAt),
      }),
    ).rejects.toMatchObject({ code: 'INVITATION_UNAVAILABLE' });
    expect(await db.collection('practice_sessions').countDocuments()).toBe(0);
    expect(
      await db
        .collection('invitations')
        .findOne({ _id: new ObjectId(invitation.id) }),
    ).toMatchObject({
      status: 'expired',
    });
    expect(
      await db.collection('actor_states').find({ mode: 'idle' }).toArray(),
    ).toHaveLength(2);
  });

  it('fails closed when the BE-008 pair-safety guard is unavailable', async () => {
    const hostId = new ObjectId();
    const requesterId = new ObjectId();
    await Promise.all([
      seedUser(hostId, 'Host'),
      seedUser(requesterId, 'Requester'),
    ]);
    const host = userIdentity(hostId);
    const requester = userIdentity(requesterId);
    const invitation = await createInvitation({
      identity: host,
      operationId: randomUUID(),
    });
    const inviteRequest = await createInviteRequest({
      identity: requester,
      code: invitation.code,
      operationId: randomUUID(),
    });
    await expect(
      respondToInviteRequest({
        requestId: inviteRequest.id,
        hostKey: host.actorKey,
        expectedVersion: inviteRequest.version,
        decision: 'accept',
        operationId: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
    expect(await db.collection('practice_sessions').countDocuments()).toBe(0);
  });
});
