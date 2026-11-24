import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import request from 'supertest';
import {
  afterAll,
  afterEach,
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
import { registerUser } from '../../server/modules/identity/identity-service.js';
import {
  ensureLifetimeBaseline,
  incrementLifetimeCounter,
  incrementReviewCount,
  LifetimeStatisticsIntegrityError,
} from '../../server/modules/statistics/statistics-repository.js';
import {
  connectDatabase,
  disconnectDatabase,
  withTransaction,
} from '../../server/persistence/database.js';
import { up as ensureLifetimeStatistics } from '../../server/persistence/migrations/20261124000100-ensure-lifetime-statistics.js';
import { up as applyDesignIndexes } from '../../server/persistence/migrations/20261103000100-add-design-indexes.js';
import { DEFAULT_JWT_SECRET } from '../fixtures/auth-fixtures.js';

/** @type {MongoMemoryReplSet} */
let replicaSet;
/** @type {import('mongoose').mongo.Db} */
let db;
const { ObjectId } = mongoose.Types;
const app = createApp({ checkHealth: async () => {} });
const DEFAULT_ORIGIN = 'http://127.0.0.1:5173';

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({
    binary: { version: '8.2.7' },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  vi.stubEnv('MONGODB_URI', replicaSet.getUri());
  vi.stubEnv('MONGODB_DB_NAME', 'chiikaiwa_admin_statistics_test');
  vi.stubEnv('APP_ORIGIN', DEFAULT_ORIGIN);
  vi.stubEnv('JWT_SECRET', DEFAULT_JWT_SECRET);
  db = await connectDatabase();
  await applyDesignIndexes(db);
});

afterAll(async () => {
  await disconnectDatabase();
  await replicaSet?.stop();
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  await Promise.all([
    db.collection('users').deleteMany({}),
    db.collection('auth_sessions').deleteMany({}),
    db.collection('statistics').deleteMany({}),
    db.collection('actor_states').deleteMany({}),
    db.collection('practice_sessions').deleteMany({}),
    db.collection('review_logs').deleteMany({}),
    db.collection('quiz_attempts').deleteMany({}),
    db.collection('guest_sessions').deleteMany({}),
    db.collection('manual_cards').deleteMany({}),
    db.collection('statistics_probe').deleteMany({}),
  ]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const LIFETIME_FILTER = /** @type {any} */ ({ _id: 'lifetime' });
const BASE_DATE = new Date('2026-11-20T12:00:00.000Z');

/** @param {Record<string, unknown>} [overrides] */
async function insertLifetime(overrides = {}) {
  const document = {
    _id: /** @type {any} */ ('lifetime'),
    registeredAccounts: 13,
    startedSessions: 7,
    reviewCount: 29,
    submittedQuizCount: 11,
    updatedAt: BASE_DATE,
    ...overrides,
  };
  await db
    .collection('statistics')
    .insertOne(
      Object.fromEntries(
        Object.entries(document).filter(([, value]) => value !== undefined),
      ),
    );
}

function readLifetime() {
  return db.collection('statistics').findOne(LIFETIME_FILTER);
}

/** @param {import('mongoose').mongo.Db} database @param {import('../../server/modules/statistics/statistics-repository.js').LifetimeCounter} counter @param {Date} [now] */
function incrementInTransaction(database, counter, now) {
  return withTransaction((session) =>
    incrementLifetimeCounter(database, counter, { session, now }),
  );
}

/** @param {'admin' | 'learner'} role */
async function createAuthCookie(role) {
  const userId = new ObjectId();
  const sessionId = new ObjectId();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);

  await db.collection('users').insertOne({
    _id: userId,
    email: `${role}-${userId.toHexString()}@example.com`,
    emailKey: `${role}-${userId.toHexString()}@example.com`,
    role,
    status: 'active',
    displayName: role,
    authVersion: 0,
    version: 0,
    createdAt: now,
    updatedAt: now,
  });
  await db.collection('auth_sessions').insertOne({
    _id: sessionId,
    userId,
    authVersion: 0,
    issuedAt: now,
    expiresAt,
    purgeAt: expiresAt,
  });

  const env = readAuthEnv();
  const token = signJwt(
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
  return `ck_session=${token}`;
}

describe('BE-034 lifetime statistics', () => {
  it('returns only the four stored counters to Admin', async () => {
    const cookie = await createAuthCookie('admin');
    await insertLifetime({ internalNote: 'must not be exposed' });

    const response = await request(app)
      .get('/api/v1/admin/statistics')
      .set('Cookie', cookie)
      .expect(200);

    expect(response.body.data).toEqual({
      registeredAccounts: 13,
      startedSessions: 7,
      reviewCount: 29,
      submittedQuizCount: 11,
    });
    expect(Object.keys(response.body.data)).toHaveLength(4);
    expect(response.body).toHaveProperty('meta.requestId');
    expect(response.text).not.toContain('internalNote');
  });

  it('rejects learner access and does not fabricate zero values when stats are absent or incomplete', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const learnerCookie = await createAuthCookie('learner');
    await request(app)
      .get('/api/v1/admin/statistics')
      .set('Cookie', learnerCookie)
      .expect(403);

    const adminCookie = await createAuthCookie('admin');
    const missing = await request(app)
      .get('/api/v1/admin/statistics')
      .set('Cookie', adminCookie)
      .expect(503);
    expect(missing.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(missing.body).not.toHaveProperty('data');

    await db.collection('statistics').insertOne({
      _id: /** @type {any} */ ('lifetime'),
      registeredAccounts: 1,
    });
    const incomplete = await request(app)
      .get('/api/v1/admin/statistics')
      .set('Cookie', adminCookie)
      .expect(503);
    expect(incomplete.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(incomplete.body).not.toHaveProperty('data');
  });

  it('logs why the API answers 503 without exposing counter values', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cookie = await createAuthCookie('admin');
    await insertLifetime({ reviewCount: '29' });

    await request(app)
      .get('/api/v1/admin/statistics')
      .set('Cookie', cookie)
      .expect(503);

    const message = warn.mock.calls.map((call) => String(call[0])).join('\n');
    expect(message).toContain('reviewCount');
    expect(message).not.toContain('29');
  });

  it('increments only the current counter and keeps updatedAt monotonic', async () => {
    const now = new Date('2026-11-21T12:00:00.000Z');
    await insertLifetime();

    await incrementInTransaction(db, 'registeredAccounts', now);
    expect(await readLifetime()).toMatchObject({
      registeredAccounts: 14,
      startedSessions: 7,
      reviewCount: 29,
      submittedQuizCount: 11,
      updatedAt: now,
    });

    const older = new Date('2026-11-19T12:00:00.000Z');
    await incrementInTransaction(db, 'reviewCount', older);
    expect(await readLifetime()).toMatchObject({
      reviewCount: 30,
      updatedAt: now,
    });
  });

  it('never creates the lifetime document from a business transaction and fails the write', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      incrementInTransaction(db, 'registeredAccounts'),
    ).rejects.toBeInstanceOf(LifetimeStatisticsIntegrityError);

    expect(await db.collection('statistics').countDocuments()).toBe(0);
    expect(String(error.mock.calls[0]?.[0])).toContain('document-missing');
  });

  it('rolls a counter back with its transaction', async () => {
    const now = new Date('2026-11-21T12:00:00.000Z');
    await insertLifetime({ reviewCount: 0 });

    await expect(
      withTransaction(async (session) => {
        await incrementReviewCount(db, { session, now });
        throw new Error('INTENTIONAL_ROLLBACK');
      }),
    ).rejects.toThrow('INTENTIONAL_ROLLBACK');

    expect(await readLifetime()).toMatchObject({
      reviewCount: 0,
      updatedAt: BASE_DATE,
    });
  });

  it('does not fill a missing counter that belongs to another event and keeps the API at 503', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const now = new Date('2026-11-21T12:00:00.000Z');
    await db.collection('statistics').insertOne({
      _id: /** @type {any} */ ('lifetime'),
      registeredAccounts: 13,
      submittedQuizCount: 11,
      updatedAt: BASE_DATE,
    });

    await incrementInTransaction(db, 'registeredAccounts', now);

    const stored = await readLifetime();
    expect(stored).toMatchObject({
      registeredAccounts: 14,
      submittedQuizCount: 11,
      updatedAt: now,
    });
    expect(stored).not.toHaveProperty('startedSessions');
    expect(stored).not.toHaveProperty('reviewCount');

    const cookie = await createAuthCookie('admin');
    const response = await request(app)
      .get('/api/v1/admin/statistics')
      .set('Cookie', cookie)
      .expect(503);
    expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(response.body).not.toHaveProperty('data');
  });

  it('does not compute on a wrongly typed counter that belongs to another event', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const now = new Date('2026-11-21T12:00:00.000Z');
    await insertLifetime({ reviewCount: '29' });

    await incrementInTransaction(db, 'registeredAccounts', now);

    expect(await readLifetime()).toMatchObject({
      registeredAccounts: 14,
      startedSessions: 7,
      reviewCount: '29',
      submittedQuizCount: 11,
    });

    const cookie = await createAuthCookie('admin');
    await request(app)
      .get('/api/v1/admin/statistics')
      .set('Cookie', cookie)
      .expect(503);
  });

  it.each([
    ['missing', undefined],
    ['a string', '5'],
    ['negative', -1],
    ['fractional', 1.5],
  ])(
    'fails, logs the counter name and rolls back the business write when the current counter is %s',
    async (_label, value) => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      await insertLifetime({ reviewCount: value });
      const before = await readLifetime();
      const probeId = new ObjectId();

      await expect(
        withTransaction(async (session) => {
          await db
            .collection('statistics_probe')
            .insertOne(/** @type {any} */ ({ _id: probeId }), { session });
          await incrementReviewCount(db, { session });
        }),
      ).rejects.toBeInstanceOf(LifetimeStatisticsIntegrityError);

      expect(await db.collection('statistics_probe').countDocuments()).toBe(0);
      expect(await readLifetime()).toEqual(before);
      const message = String(error.mock.calls[0]?.[0]);
      expect(message).toContain('counter=reviewCount');
      expect(message).toContain('counter-invalid');
      expect(message).not.toContain(String(value));
    },
  );

  it('keeps registration working while another counter is invalid', async () => {
    await insertLifetime({ reviewCount: '29' });

    const result = await registerUser({
      email: 'be034.register@example.com',
      password: 'Password123!',
      displayName: 'BE034',
    });

    expect(result.user.email).toBe('be034.register@example.com');
    expect(
      await db.collection('users').countDocuments({ role: 'learner' }),
    ).toBe(1);
    expect(await readLifetime()).toMatchObject({
      registeredAccounts: 14,
      reviewCount: '29',
    });
  });

  it('keeps registration working while another counter is missing', async () => {
    await insertLifetime({ reviewCount: undefined });

    const result = await registerUser({
      email: 'be034.missing@example.com',
      password: 'Password123!',
      displayName: 'BE034',
    });

    expect(result.user.email).toBe('be034.missing@example.com');
    const stored = await readLifetime();
    expect(stored).toMatchObject({ registeredAccounts: 14 });
    expect(stored).not.toHaveProperty('reviewCount');
  });

  it.each([
    ['missing', undefined],
    ['a string', '13'],
    ['negative', -1],
    ['fractional', 1.5],
  ])(
    'rolls back the whole registration when registeredAccounts is %s',
    async (_label, value) => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      await insertLifetime({ registeredAccounts: value });
      const before = await readLifetime();

      await expect(
        registerUser({
          email: 'be034.rollback@example.com',
          password: 'Password123!',
          displayName: 'BE034',
        }),
      ).rejects.toBeInstanceOf(LifetimeStatisticsIntegrityError);

      expect(await db.collection('users').countDocuments()).toBe(0);
      expect(await db.collection('actor_states').countDocuments()).toBe(0);
      expect(await readLifetime()).toEqual(before);
      expect(String(error.mock.calls[0]?.[0])).toContain(
        'counter=registeredAccounts',
      );
    },
  );

  it('rolls back registration and leaves no user when the lifetime document is missing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      registerUser({
        email: 'be034.nodoc@example.com',
        password: 'Password123!',
        displayName: 'BE034',
      }),
    ).rejects.toBeInstanceOf(LifetimeStatisticsIntegrityError);

    expect(await db.collection('users').countDocuments()).toBe(0);
    expect(await db.collection('statistics').countDocuments()).toBe(0);
  });

  it('counts concurrent commits exactly once each', async () => {
    await ensureLifetimeBaseline(db);

    await Promise.all(
      Array.from({ length: 8 }, () =>
        incrementInTransaction(db, 'registeredAccounts'),
      ),
    );

    expect(await readLifetime()).toMatchObject({
      registeredAccounts: 8,
      startedSessions: 0,
      reviewCount: 0,
      submittedQuizCount: 0,
    });
  });

  it('keeps lifetime totals when guest logs, guest sessions and manual cards are removed', async () => {
    const cookie = await createAuthCookie('admin');
    await insertLifetime();
    await db
      .collection('review_logs')
      .insertOne(
        /** @type {any} */ ({ _id: new ObjectId(), ownerKey: 'guest:1' }),
      );
    await db
      .collection('guest_sessions')
      .insertOne(/** @type {any} */ ({ _id: new ObjectId() }));
    await db
      .collection('manual_cards')
      .insertOne(
        /** @type {any} */ ({ _id: new ObjectId(), ownerKey: 'guest:1' }),
      );

    await Promise.all([
      db.collection('review_logs').deleteMany({}),
      db.collection('guest_sessions').deleteMany({}),
      db.collection('manual_cards').deleteMany({}),
    ]);

    const response = await request(app)
      .get('/api/v1/admin/statistics')
      .set('Cookie', cookie)
      .expect(200);
    expect(response.body.data).toEqual({
      registeredAccounts: 13,
      startedSessions: 7,
      reviewCount: 29,
      submittedQuizCount: 11,
    });
  });

  it('rejects an unknown counter name', async () => {
    await expect(
      incrementLifetimeCounter(db, /** @type {any} */ ('unknown')),
    ).rejects.toThrow(TypeError);
  });

  describe('baseline migration', () => {
    it('creates a zero baseline on an empty database', async () => {
      await ensureLifetimeStatistics(db);

      expect(await readLifetime()).toMatchObject({
        registeredAccounts: 0,
        startedSessions: 0,
        reviewCount: 0,
        submittedQuizCount: 0,
      });
    });

    it('is safe to rerun and never touches an existing document', async () => {
      await insertLifetime({ reviewCount: '29' });
      const before = await readLifetime();

      await ensureLifetimeStatistics(db);
      await ensureLifetimeStatistics(db);

      expect(await readLifetime()).toEqual(before);
    });

    it.each(['users', 'practice_sessions', 'review_logs', 'quiz_attempts'])(
      'fails instead of inventing a baseline when %s already has data, and succeeds once the baseline is inserted',
      async (collection) => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        await db
          .collection(collection)
          .insertOne(/** @type {any} */ ({ _id: new ObjectId() }));

        await expect(ensureLifetimeStatistics(db)).rejects.toThrow(collection);

        expect(await db.collection('statistics').countDocuments()).toBe(0);
        expect(String(error.mock.calls[0]?.[0])).toContain(collection);

        await insertLifetime();
        const before = await readLifetime();
        await ensureLifetimeStatistics(db);
        expect(await readLifetime()).toEqual(before);
        await db.collection(collection).deleteMany({});
      },
    );
  });
});
