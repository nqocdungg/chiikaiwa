import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { TokenVerifier } from 'livekit-server-sdk';
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
} from '../../server/persistence/database.js';
import { up } from '../../server/persistence/migrations/20261103000100-add-design-indexes.js';
import { resolveIdentityFromCookies } from '../../server/modules/identity/identity-service.js';
import {
  hashGuestCredential,
  signJwt,
} from '../../server/modules/identity/crypto.js';
import { issueMediaToken } from '../../server/modules/sessions/media-token-service.js';
import { signMediaToken } from '../../server/integrations/livekit/media-token.js';
import {
  USER_FIXTURES,
  DEFAULT_JWT_SECRET,
} from '../fixtures/auth-fixtures.js';

const { ObjectId } = mongoose.Types;
const origin = 'http://127.0.0.1:5173';
const sessionId = new ObjectId('907f1f77bcf86cd799439011');
const guestId = new ObjectId('707f1f77bcf86cd799439011');
const users = [
  USER_FIXTURES.learnerA,
  USER_FIXTURES.learnerB,
  USER_FIXTURES.admin,
];
const actorKey = `user:${users[0]._id}`;
const apiKey = 'test-media-key';
const apiSecret = 'fake-media-secret-never-a-live-project';
/** @type {MongoMemoryReplSet} */ let replica;
/** @type {import('mongoose').mongo.Db} */ let db;
/** @type {string[]} */ let cookies;
const app = createApp();
/** @param {string | string[] | undefined} value */
function cookiePairs(value) {
  return (Array.isArray(value) ? value : value ? [value] : []).map(
    (c) => c.split(';')[0],
  );
}
/** @param {number} [index] */
function identity(index = 0) {
  return resolveIdentityFromCookies({
    authCookie: cookies[index],
    guestCookie: undefined,
  });
}
/** @param {Record<string, unknown>} [body] @param {number} [index] @param {string} [operationId] */
async function post(body = {}, index = 0, operationId = randomUUID()) {
  const csrf = await request(app).get('/api/v1/auth/csrf');
  return request(app)
    .post(`/api/v1/sessions/${sessionId}/media-token`)
    .set('Origin', origin)
    .set('Idempotency-Key', operationId)
    .set('X-CSRF-Token', csrf.body.data.csrfToken)
    .set(
      'Cookie',
      [
        `ck_session=${cookies[index]}`,
        ...cookiePairs(csrf.headers['set-cookie']),
      ].join('; '),
    )
    .send(body);
}
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({
    binary: { version: '8.2.7' },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  vi.stubEnv('MONGODB_URI', replica.getUri());
  vi.stubEnv('MONGODB_DB_NAME', 'chiikaiwa_media_test');
  vi.stubEnv('APP_ORIGIN', origin);
  vi.stubEnv('JWT_SECRET', DEFAULT_JWT_SECRET);
  vi.stubEnv('LIVEKIT_URL', 'wss://media.example.test');
  vi.stubEnv('LIVEKIT_API_KEY', apiKey);
  vi.stubEnv('LIVEKIT_API_SECRET', apiSecret);
  db = await connectDatabase();
  await up(db);
});
beforeEach(async () => {
  for (const name of [
    'users',
    'auth_sessions',
    'guest_sessions',
    'practice_sessions',
    'blocks',
    'rate_limits',
    'operation_receipts',
  ])
    await db.collection(name).deleteMany({});
  await db.collection('users').insertMany(users.map((u) => ({ ...u })));
  cookies = [];
  for (const user of users) {
    const sid = new ObjectId();
    const now = Math.floor(Date.now() / 1000);
    await db.collection('auth_sessions').insertOne({
      _id: sid,
      userId: user._id,
      authVersion: 0,
      expiresAt: new Date((now + 3600) * 1000),
    });
    cookies.push(
      signJwt(
        {
          sub: user._id.toHexString(),
          sid: sid.toHexString(),
          authVersion: 0,
          iat: now,
          exp: now + 3600,
        },
        DEFAULT_JWT_SECRET,
        { issuer: 'chiikaiwa', audience: 'chiikaiwa-web' },
      ),
    );
  }
  await db.collection('practice_sessions').insertOne({
    _id: sessionId,
    originKind: 'invite',
    originId: new ObjectId(),
    roomName: `session-${sessionId}`,
    members: users.slice(0, 2).map((u) => ({
      actorKey: `user:${u._id}`,
      kind: 'user',
      userId: u._id,
    })),
    status: 'preparing',
    createdAt: new Date(),
    version: 0,
    presence: users
      .slice(0, 2)
      .map((u) => ({ actorKey: `user:${u._id}`, connected: false })),
    activeDurationMs: 0,
    selectionRemainingMs: 60000,
    screenShare: { state: 'idle', version: 0 },
    mediaCleanup: { state: 'none', attempts: 0 },
  });
});
afterAll(async () => {
  await disconnectDatabase();
  await replica?.stop();
  vi.unstubAllEnvs();
});

describe('BE-010 media-token API and database permission checks', () => {
  it('caps preparing credentials at the persisted five-minute deadline', async () => {
    const now = new Date();
    const createdAt = new Date(now.getTime() - 240_000);
    await db
      .collection('practice_sessions')
      .updateOne({ _id: sessionId }, { $set: { createdAt } });
    const result = await issueMediaToken(
      { sessionId: String(sessionId), getIdentity: identity },
      { now: () => now },
    );
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(now.getTime());
    expect(new Date(result.expiresAt).getTime()).toBeLessThanOrEqual(
      createdAt.getTime() + 300_000,
    );
  });

  it.each([300_000, 300_001])(
    'rejects unreconciled preparing sessions aged %i ms without reconnect deadlines',
    async (age) => {
      const now = new Date();
      await db
        .collection('practice_sessions')
        .updateOne(
          { _id: sessionId },
          { $set: { createdAt: new Date(now.getTime() - age) } },
        );
      const sign = vi.fn();
      await expect(
        issueMediaToken(
          { sessionId: String(sessionId), getIdentity: identity },
          { now: () => now, sign },
        ),
      ).rejects.toMatchObject({ code: 'SESSION_ENDED' });
      expect(sign).not.toHaveBeenCalled();
    },
  );

  it('rejects preparing sessions with no server deadline anchor', async () => {
    await db
      .collection('practice_sessions')
      .updateOne({ _id: sessionId }, { $unset: { createdAt: '' } });
    expect((await post()).body.error.code).toBe('SESSION_ENDED');
  });

  it('requires UUID idempotency keys and retries without caching credentials or bypassing current rights', async () => {
    expect((await post({}, 0, '')).status).toBe(422);
    expect((await post({}, 0, 'not-a-uuid')).status).toBe(422);
    const key = randomUUID();
    expect((await post({}, 0, key)).status).toBe(200);
    expect((await post({}, 0, key)).status).toBe(200);
    const receipts = await db
      .collection('operation_receipts')
      .find({ operationId: key })
      .toArray();
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).not.toHaveProperty('token');
    expect(receipts[0]).not.toHaveProperty('resultRef');
    expect(
      receipts[0].purgeAt.getTime() - receipts[0].committedAt.getTime(),
    ).toBe(86400_000);
    await db
      .collection('practice_sessions')
      .updateOne(
        { _id: sessionId },
        { $set: { status: 'ended' }, $inc: { version: 1 } },
      );
    expect((await post({}, 0, key)).body.error.code).toBe('SESSION_ENDED');
  });
  it('gives both members signed tokens for exactly their room/identity without changing session state', async () => {
    const before = await db
      .collection('practice_sessions')
      .findOne({ _id: sessionId });
    for (let i = 0; i < 2; i++) {
      const start = Date.now();
      const res = await post({}, i);
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      const claims = await new TokenVerifier(apiKey, apiSecret).verify(
        res.body.data.token,
        0,
      );
      expect(claims.sub).toBe(`user:${users[i]._id}`);
      expect(claims.video?.room).toBe(before?.roomName);
      expect(Number(claims.exp) * 1000).toBeLessThanOrEqual(start + 600_000);
      expect(Date.parse(res.body.data.expiresAt)).toBe(
        Number(claims.exp) * 1000,
      );
      expect(Object.keys(res.body.data).sort()).toEqual([
        'expiresAt',
        'token',
        'url',
      ]);
    }
    expect(
      await db.collection('practice_sessions').findOne({ _id: sessionId }),
    ).toEqual(before);
  });
  it('hides the room from an outsider, including admin', async () => {
    const res = await post({}, 2);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
    expect(res.body.data).toBeUndefined();
  });
  it('rejects unauthenticated requests, invalid IDs, forged body fields and missing CSRF', async () => {
    expect(
      (
        await request(app)
          .post(`/api/v1/sessions/${sessionId}/media-token`)
          .send({})
      ).status,
    ).toBe(403);
    const csrf = await request(app).get('/api/v1/auth/csrf');
    const headers = {
      Origin: origin,
      'X-CSRF-Token': csrf.body.data.csrfToken,
      'Idempotency-Key': randomUUID(),
      Cookie: cookiePairs(csrf.headers['set-cookie']).join('; '),
    };
    expect(
      (
        await request(app)
          .post(`/api/v1/sessions/${sessionId}/media-token`)
          .set(headers)
          .send({})
      ).status,
    ).toBe(401);
    expect(
      (await post({ roomName: 'other-room', identity: 'admin', ttl: 99999 }))
        .status,
    ).toBe(422);
    await expect(
      issueMediaToken({ sessionId: 'bad-id', getIdentity: identity }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('rejects ended rooms and expired reconnect/selection deadlines', async () => {
    await db
      .collection('practice_sessions')
      .updateOne({ _id: sessionId }, { $set: { status: 'ended' } });
    expect((await post()).body.error.code).toBe('SESSION_ENDED');
    await db.collection('practice_sessions').updateOne(
      { _id: sessionId },
      {
        $set: {
          status: 'reconnecting',
          'presence.0.reconnectUntil': new Date(Date.now() - 1000),
        },
      },
    );
    expect((await post()).body.error.code).toBe('SESSION_ENDED');
    await db.collection('practice_sessions').updateOne(
      { _id: sessionId },
      {
        $unset: { 'presence.0.reconnectUntil': '' },
        $set: {
          status: 'active',
          selectionRunningSince: new Date(Date.now() - 61000),
        },
      },
    );
    expect((await post()).body.error.code).toBe('SESSION_ENDED');
  });
  it('bounds token by earliest reconnect and login deadline', async () => {
    const deadline = new Date(Date.now() + 45000);
    await db
      .collection('auth_sessions')
      .updateMany({}, { $set: { expiresAt: deadline } });
    await db.collection('practice_sessions').updateOne(
      { _id: sessionId },
      {
        $set: {
          status: 'reconnecting',
          'presence.1.reconnectUntil': new Date(Date.now() + 20000),
        },
      },
    );
    const res = await post();
    expect(res.status).toBe(200);
    expect(Date.parse(res.body.data.expiresAt)).toBeLessThanOrEqual(
      Date.now() + 20000,
    );
    expect(Date.parse(res.body.data.expiresAt)).toBeLessThan(
      deadline.getTime(),
    );
  });
  it('rejects blocked pairs and a locked partner before issuing credentials', async () => {
    await db
      .collection('blocks')
      .insertOne({ blockerKey: `user:${users[1]._id}`, blockedKey: actorKey });
    expect((await post()).body.error.code).toBe('PAIR_BLOCKED');
    await db.collection('blocks').deleteMany({});
    await db
      .collection('users')
      .updateOne({ _id: users[1]._id }, { $set: { status: 'locked' } });
    expect((await post()).body.error.code).toBe('SESSION_ENDED');
  });
  it('supports an active guest only in the assigned trial and bounds their expiration', async () => {
    const guestKey = `guest:${guestId}`;
    const deadline = new Date(Date.now() + 30000);
    await db.collection('guest_sessions').insertOne({
      _id: guestId,
      credentialHash: hashGuestCredential('guest-secret'),
      status: 'active',
      version: 0,
      practiceSessionId: sessionId,
      expiresAt: deadline,
    });
    await db
      .collection('practice_sessions')
      .updateOne(
        { _id: sessionId },
        { $set: { 'members.1': { actorKey: guestKey, kind: 'guest' } } },
      );
    const getIdentity = () =>
      resolveIdentityFromCookies({
        authCookie: undefined,
        guestCookie: 'guest-secret',
      });
    const res = await issueMediaToken({
      sessionId: String(sessionId),
      getIdentity,
    });
    expect(
      (await new TokenVerifier(apiKey, apiSecret).verify(res.token, 0)).sub,
    ).toBe(guestKey);
    expect(Date.parse(res.expiresAt)).toBeLessThanOrEqual(deadline.getTime());
    await db
      .collection('guest_sessions')
      .updateOne(
        { _id: guestId },
        { $set: { practiceSessionId: new ObjectId() } },
      );
    await expect(
      issueMediaToken({ sessionId: String(sessionId), getIdentity }),
    ).rejects.toMatchObject({ status: 410, code: 'GUEST_EXPIRED' });
    await db
      .collection('guest_sessions')
      .updateOne({ _id: guestId }, { $set: { status: 'expired' } });
    expect((await post()).body.error.code).toBe('SESSION_ENDED');
    await expect(
      issueMediaToken({ sessionId: String(sessionId), getIdentity }),
    ).rejects.toMatchObject({ status: 410 });
  });
  it.each(['ended', 'version', 'locked', 'logout', 'blocked'])(
    'discards signed token if %s changes during signing',
    async (change) => {
      const sign = async (
        /** @type {Parameters<typeof signMediaToken>[0]} */ input,
      ) => {
        const credential = await signMediaToken(input);
        if (change === 'ended')
          await db
            .collection('practice_sessions')
            .updateOne(
              { _id: sessionId },
              { $set: { status: 'ended' }, $inc: { version: 1 } },
            );
        if (change === 'version')
          await db
            .collection('practice_sessions')
            .updateOne({ _id: sessionId }, { $inc: { version: 1 } });
        if (change === 'locked')
          await db
            .collection('users')
            .updateOne({ _id: users[0]._id }, { $set: { status: 'locked' } });
        if (change === 'logout')
          await db
            .collection('auth_sessions')
            .updateMany({}, { $set: { revokedAt: new Date() } });
        if (change === 'blocked')
          await db.collection('blocks').insertOne({
            blockerKey: actorKey,
            blockedKey: `user:${users[1]._id}`,
          });
        return credential;
      };
      await expect(
        issueMediaToken(
          { sessionId: String(sessionId), getIdentity: identity },
          { sign },
        ),
      ).rejects.toMatchObject({
        code: {
          ended: 'SESSION_ENDED',
          version: 'VERSION_CONFLICT',
          locked: 'ACCOUNT_LOCKED',
          logout: 'SESSION_EXPIRED',
          blocked: 'PAIR_BLOCKED',
        }[change],
      });
    },
  );
  it('returns sanitized 503 on missing configuration or SDK failure without leaking logs', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      vi.stubEnv('LIVEKIT_API_SECRET', '');
      const res = await post();
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
      expect(res.text).not.toContain(apiKey);
      vi.stubEnv('LIVEKIT_API_SECRET', apiSecret);
      await expect(
        issueMediaToken(
          { sessionId: String(sessionId), getIdentity: identity },
          {
            sign: async () => {
              throw new Error(`SDK failure ${apiSecret}`);
            },
          },
        ),
      ).rejects.toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
      expect(JSON.stringify(log.mock.calls)).not.toContain(apiSecret);
      expect(JSON.stringify(log.mock.calls)).not.toContain(apiKey);
    } finally {
      vi.stubEnv('LIVEKIT_API_SECRET', apiSecret);
      log.mockRestore();
    }
  });
});
