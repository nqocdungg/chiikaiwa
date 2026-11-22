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
import {
  consumeRateLimit,
  hashRateLimitSubject,
  INVITATION_CODE_RATE_LIMIT_MAX,
  WRITE_RATE_LIMIT_MAX,
  WRITE_RATE_LIMIT_WINDOW_MS,
} from '../../server/middleware/rate-limit.js';
import { signJwt } from '../../server/modules/identity/crypto.js';
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
const ORIGIN = 'http://127.0.0.1:5173';
const app = createApp({
  sendPasswordResetEmail: async () => ({ messageId: 'mock-msg-id' }),
});

/** @param {string} name @returns {import('mongoose').mongo.Collection<any>} */
function collection(name) {
  return /** @type {any} */ (db.collection(name));
}

/** @param {unknown} headers @param {string} name */
function extractCookie(headers, name) {
  const list = /** @type {string[] | undefined} */ (
    /** @type {any} */ (headers)?.['set-cookie']
  );
  if (!Array.isArray(list)) throw new Error(`Missing Set-Cookie for ${name}`);
  for (const raw of list) {
    const pair = raw.split(';')[0];
    if (pair.startsWith(`${name}=`)) return pair;
  }
  throw new Error(`Missing cookie ${name}`);
}

async function getCsrfContext() {
  const res = await request(app).get('/api/v1/auth/csrf').expect(200);
  return {
    csrfToken: res.body.data.csrfToken,
    csrfCookie: extractCookie(res.headers, 'ck_csrf'),
  };
}

/**
 * Seeds an active user (learner or admin) and an active auth_session, returning its auth cookie and actorKey.
 * @param {{ role?: 'learner' | 'admin', email?: string, displayName?: string }} [options]
 */
async function seedAuthenticatedUser({
  role = 'learner',
  email,
  displayName = 'Rate Limit User',
} = {}) {
  const userId = new ObjectId();
  const sessionId = new ObjectId();
  const resolvedEmail = email ?? `${userId.toHexString()}@example.test`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 3600_000);

  await collection('users').insertOne({
    _id: userId,
    email: resolvedEmail,
    emailKey: resolvedEmail.trim().toLowerCase(),
    passwordHash: 'scrypt$16384$8$1$00$00',
    role,
    status: 'active',
    authVersion: 0,
    displayName,
    avatarKey: 'default-1',
    profile: { level: 'N3', interests: [] },
    version: 0,
    createdAt: now,
    updatedAt: now,
  });

  await collection('auth_sessions').insertOne({
    _id: sessionId,
    userId,
    authVersion: 0,
    status: 'active',
    expiresAt,
    purgeAt: expiresAt,
    createdAt: now,
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

  return {
    userId,
    actorKey: `user:${userId.toHexString()}`,
    authCookie: `ck_session=${token}`,
  };
}

/**
 * Pre-populates a rate_limits bucket for the current window to test boundary behavior deterministically.
 * @param {{ scope: string, subjectKey: string, count: number, windowMs: number, now?: Date }} params
 */
async function seedRateLimitBucket({
  scope,
  subjectKey,
  count,
  windowMs,
  now = new Date(),
}) {
  const windowBucket = Math.floor(now.getTime() / windowMs);
  const windowEndsAt = new Date((windowBucket + 1) * windowMs);
  const id = `${scope}:${hashRateLimitSubject(subjectKey)}:${windowBucket}`;
  await collection('rate_limits').updateOne(
    { _id: id },
    { $set: { count, windowEndsAt, purgeAt: windowEndsAt } },
    { upsert: true },
  );
}

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({
    binary: { version: '8.2.7' },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  vi.stubEnv('MONGODB_URI', replicaSet.getUri());
  vi.stubEnv('MONGODB_DB_NAME', 'chiikaiwa_rate_limit_test');
  vi.stubEnv('APP_ORIGIN', ORIGIN);
  db = await connectDatabase();
  await applyDesignIndexes(db);
});

afterAll(async () => {
  await disconnectDatabase();
  await replicaSet.stop();
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  for (const name of [
    'users',
    'auth_sessions',
    'actor_states',
    'guest_sessions',
    'invitations',
    'invite_requests',
    'operation_receipts',
    'content_items',
    'content_versions',
    'password_reset_tokens',
    'rate_limits',
  ]) {
    await collection(name).deleteMany({});
  }
});

describe('BE-038 Request Rate Limits', () => {
  it('enforces below/at/over threshold, window expiry, key independence, TTL index, and concurrent atomicity', async () => {
    // 1. Verify purgeAt TTL index exists on rate_limits (06 §10)
    const indexes = await collection('rate_limits').indexes();
    const ttlIndex = indexes.find((idx) => idx.name === 'purgeAt_ttl');
    expect(ttlIndex).toBeDefined();
    expect(ttlIndex?.key).toEqual({ purgeAt: 1 });
    expect(ttlIndex?.expireAfterSeconds).toBe(0);

    const windowMs = 60_000;
    const baseTime = new Date('2026-11-22T00:00:10.000Z');

    // 2. Below threshold (1, 2) and at threshold (3) succeed
    for (let i = 1; i <= 3; i += 1) {
      const result = await consumeRateLimit({
        db,
        scope: 'test-scope',
        subjectKey: 'subject-a',
        limit: 3,
        windowMs,
        now: baseTime,
      });
      expect(result.count).toBe(i);
    }

    // 3. Over threshold (4th) throws 429 RATE_LIMITED with positive integer Retry-After
    await expect(
      consumeRateLimit({
        db,
        scope: 'test-scope',
        subjectKey: 'subject-a',
        limit: 3,
        windowMs,
        now: baseTime,
      }),
    ).rejects.toMatchObject({
      status: 429,
      code: 'RATE_LIMITED',
      headers: {
        'Retry-After': '50',
      },
    });

    // 4. Independent subjectKey and independent scope are unaffected
    const otherSubject = await consumeRateLimit({
      db,
      scope: 'test-scope',
      subjectKey: 'subject-b',
      limit: 3,
      windowMs,
      now: baseTime,
    });
    expect(otherSubject.count).toBe(1);

    const otherScope = await consumeRateLimit({
      db,
      scope: 'other-scope',
      subjectKey: 'subject-a',
      limit: 3,
      windowMs,
      now: baseTime,
    });
    expect(otherScope.count).toBe(1);

    // 5. Window expiry resets quota in the next bucket
    const nextWindowTime = new Date('2026-11-22T00:01:05.000Z');
    const afterReset = await consumeRateLimit({
      db,
      scope: 'test-scope',
      subjectKey: 'subject-a',
      limit: 3,
      windowMs,
      now: nextWindowTime,
    });
    expect(afterReset.count).toBe(1);

    // 6. Concurrent requests hitting an empty bucket are counted atomically without E11000 races
    const concurrentResults = await Promise.allSettled(
      Array.from({ length: 15 }, () =>
        consumeRateLimit({
          db,
          scope: 'concurrent-scope',
          subjectKey: 'concurrent-actor',
          limit: 10,
          windowMs,
          now: baseTime,
        }),
      ),
    );
    const fulfilled = concurrentResults.filter((r) => r.status === 'fulfilled');
    const rejected = concurrentResults.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(10);
    expect(rejected).toHaveLength(5);
    for (const item of rejected) {
      expect(item.reason).toMatchObject({
        status: 429,
        code: 'RATE_LIMITED',
      });
      expect(Number(item.reason.headers['Retry-After'])).toBeGreaterThanOrEqual(
        1,
      );
    }
  });

  it('throttles password-reset requests identically for existing and nonexistent emails without leaking account existence', async () => {
    await seedAuthenticatedUser({ email: 'existing.user@example.test' });
    const { csrfToken, csrfCookie } = await getCsrfContext();

    for (const email of [
      'existing.user@example.test',
      'nonexistent.user@example.test',
    ]) {
      for (let i = 0; i < 3; i += 1) {
        const res = await request(app)
          .post('/api/v1/auth/password-reset-requests')
          .set('Origin', ORIGIN)
          .set('Cookie', csrfCookie)
          .set('X-CSRF-Token', csrfToken)
          .send({ email })
          .expect(202);
        expect(res.body.data.message).toBeTruthy();
      }

      const limited = await request(app)
        .post('/api/v1/auth/password-reset-requests')
        .set('Origin', ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ email })
        .expect(429);
      expect(limited.body.error.code).toBe('RATE_LIMITED');
      expect(Number(limited.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    }

    const docs = await collection('rate_limits').find({}).toArray();
    const serialized = JSON.stringify(docs);
    expect(serialized).not.toContain('existing.user@example.test');
    expect(serialized).not.toContain('nonexistent.user@example.test');
  });

  it('enforces shared 20/5min/IP quota across guest-trials and invitation-requests without double-counting write-actor on guest-trials', async () => {
    const learner = await seedAuthenticatedUser();
    const { csrfToken, csrfCookie } = await getCsrfContext();

    // 1. 12 guest-trial lookups from the same IP should NOT create any write-actor bucket
    for (let i = 0; i < 12; i += 1) {
      await request(app)
        .post('/api/v1/guest-trials')
        .set('Origin', ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', randomUUID())
        .send({ code: 'ZZZZ234567' })
        .expect(409);
    }

    const writeActorDocsAfterGuest = await collection('rate_limits')
      .find({ _id: { $regex: '^write-actor:' } })
      .toArray();
    expect(writeActorDocsAfterGuest).toHaveLength(0);

    // 2. 8 authenticated invitation-requests from the same IP reach the 20/5min/IP threshold
    for (let i = 0; i < INVITATION_CODE_RATE_LIMIT_MAX - 12; i += 1) {
      await request(app)
        .post('/api/v1/invitation-requests')
        .set('Origin', ORIGIN)
        .set('Cookie', `${csrfCookie}; ${learner.authCookie}`)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', randomUUID())
        .send({ code: 'ZZZZ234567' })
        .expect(409);
    }

    // 3. 21st code lookup on /invitation-requests returns 429 + Retry-After
    const reqLimited = await request(app)
      .post('/api/v1/invitation-requests')
      .set('Origin', ORIGIN)
      .set('Cookie', `${csrfCookie}; ${learner.authCookie}`)
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', randomUUID())
      .send({ code: 'ZZZZ234567' })
      .expect(429);
    expect(reqLimited.body.error.code).toBe('RATE_LIMITED');
    expect(Number(reqLimited.headers['retry-after'])).toBeGreaterThanOrEqual(1);

    // 4. 22nd lookup on /guest-trials from the same IP is also blocked by the shared bucket
    const guestLimited = await request(app)
      .post('/api/v1/guest-trials')
      .set('Origin', ORIGIN)
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', randomUUID())
      .send({ code: 'ZZZZ234567' })
      .expect(429);
    expect(guestLimited.body.error.code).toBe('RATE_LIMITED');

    // 5. A different client IP behind a configured trusted proxy is unaffected
    vi.stubEnv('TRUSTED_PROXY_IPS', '127.0.0.1');
    try {
      await request(app)
        .post('/api/v1/guest-trials')
        .set('Origin', ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .set('X-Forwarded-For', '203.0.113.55')
        .set('Idempotency-Key', randomUUID())
        .send({ code: 'ZZZZ234567' })
        .expect(409);
    } finally {
      vi.stubEnv('TRUSTED_PROXY_IPS', '');
    }
  });

  it('enforces 120/min/actor business write limit independently per actor while excluding polling/read endpoints', async () => {
    const actorA = await seedAuthenticatedUser({ displayName: 'Actor A' });
    const actorB = await seedAuthenticatedUser({ displayName: 'Actor B' });
    const { csrfToken, csrfCookie } = await getCsrfContext();

    // Pre-seed Actor A at 119 writes in the current 1-minute window
    await seedRateLimitBucket({
      scope: 'write-actor',
      subjectKey: actorA.actorKey,
      count: WRITE_RATE_LIMIT_MAX - 1,
      windowMs: WRITE_RATE_LIMIT_WINDOW_MS,
    });

    // 120th write (at threshold) succeeds
    const invRes = await request(app)
      .post('/api/v1/invitations')
      .set('Origin', ORIGIN)
      .set('Cookie', `${csrfCookie}; ${actorA.authCookie}`)
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);
    const invitationId = invRes.body.data.id;

    // 121st write (over threshold) returns 429 RATE_LIMITED + Retry-After
    const overLimit = await request(app)
      .patch('/api/v1/me/profile')
      .set('Origin', ORIGIN)
      .set('Cookie', `${csrfCookie}; ${actorA.authCookie}`)
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', randomUUID())
      .send({ expectedVersion: 0, displayName: 'Blocked Update' })
      .expect(429);
    expect(overLimit.body.error.code).toBe('RATE_LIMITED');
    expect(Number(overLimit.headers['retry-after'])).toBeGreaterThanOrEqual(1);

    // Polling & read endpoints for Actor A remain unaffected and do NOT increment rate_limits
    const countBeforePolling = (
      await collection('rate_limits').findOne({
        _id: {
          $regex: `^write-actor:${hashRateLimitSubject(actorA.actorKey)}:`,
        },
      })
    )?.count;

    await request(app)
      .get('/api/v1/me/coordination')
      .set('Cookie', actorA.authCookie)
      .expect(200);
    await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', actorA.authCookie)
      .expect(200);
    await request(app)
      .get(`/api/v1/invitations/${invitationId}`)
      .set('Cookie', actorA.authCookie)
      .expect(200);

    const countAfterPolling = (
      await collection('rate_limits').findOne({
        _id: {
          $regex: `^write-actor:${hashRateLimitSubject(actorA.actorKey)}:`,
        },
      })
    )?.count;
    expect(countAfterPolling).toBe(countBeforePolling);

    // Actor B is completely independent and can still perform business writes
    await request(app)
      .patch('/api/v1/me/profile')
      .set('Origin', ORIGIN)
      .set('Cookie', `${csrfCookie}; ${actorB.authCookie}`)
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', randomUUID())
      .send({ expectedVersion: 0, displayName: 'Actor B Updated' })
      .expect(200);
  });

  it('enforces 120/min/actor write rate limit on all mutating admin content endpoints while allowing reads', async () => {
    const admin = await seedAuthenticatedUser({
      role: 'admin',
      displayName: 'Admin One',
    });
    const { csrfToken, csrfCookie } = await getCsrfContext();
    const dummyId = new ObjectId().toHexString();

    // Pre-seed admin at the 120/min write limit
    await seedRateLimitBucket({
      scope: 'write-actor',
      subjectKey: admin.actorKey,
      count: WRITE_RATE_LIMIT_MAX,
      windowMs: WRITE_RATE_LIMIT_WINDOW_MS,
    });

    const mutatingRequests = [
      request(app)
        .post('/api/v1/admin/content')
        .set('Origin', ORIGIN)
        .set('Cookie', `${csrfCookie}; ${admin.authCookie}`)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', randomUUID())
        .send({ kind: 'knowledge', draftPayload: {} }),
      request(app)
        .patch(`/api/v1/admin/content/${dummyId}`)
        .set('Origin', ORIGIN)
        .set('Cookie', `${csrfCookie}; ${admin.authCookie}`)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', randomUUID())
        .send({ expectedVersion: 0, draftPayload: {} }),
      request(app)
        .post(`/api/v1/admin/content/${dummyId}/publish`)
        .set('Origin', ORIGIN)
        .set('Cookie', `${csrfCookie}; ${admin.authCookie}`)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', randomUUID())
        .send({ expectedVersion: 0 }),
      request(app)
        .post(`/api/v1/admin/content/${dummyId}/hide`)
        .set('Origin', ORIGIN)
        .set('Cookie', `${csrfCookie}; ${admin.authCookie}`)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', randomUUID())
        .send({ expectedVersion: 0 }),
    ];

    for (const req of mutatingRequests) {
      const res = await req.expect(429);
      expect(res.body.error.code).toBe('RATE_LIMITED');
      expect(Number(res.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    }

    // Admin read endpoint remains unaffected
    await request(app)
      .get('/api/v1/admin/content')
      .set('Cookie', admin.authCookie)
      .expect(200);
  });
});
