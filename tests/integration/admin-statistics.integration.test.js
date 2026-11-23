import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
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
  incrementLifetimeCounter,
  incrementReviewCount,
} from '../../server/modules/statistics/statistics-repository.js';
import {
  connectDatabase,
  disconnectDatabase,
  withTransaction,
} from '../../server/persistence/database.js';
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
  ]);
});

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
    await db.collection('statistics').insertOne({
      _id: /** @type {any} */ ('lifetime'),
      registeredAccounts: 13,
      startedSessions: 7,
      reviewCount: 29,
      submittedQuizCount: 11,
      updatedAt: new Date('2026-11-20T12:00:00.000Z'),
      internalNote: 'must not be exposed',
    });

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

  it('keeps all counters present and rolls a counter back with its transaction', async () => {
    const now = new Date('2026-11-21T12:00:00.000Z');
    await withTransaction(async (session) => {
      await incrementLifetimeCounter(db, 'registeredAccounts', {
        session,
        now,
      });
    });
    await withTransaction(async (session) => {
      await incrementLifetimeCounter(db, 'startedSessions', {
        session,
        now,
      });
    });

    const afterCommit = await db
      .collection('statistics')
      .findOne(/** @type {any} */ ({ _id: 'lifetime' }));
    expect(afterCommit).toMatchObject({
      registeredAccounts: 1,
      startedSessions: 1,
      reviewCount: 0,
      submittedQuizCount: 0,
      updatedAt: now,
    });

    await expect(
      withTransaction(async (session) => {
        await incrementReviewCount(db, { session, now });
        throw new Error('INTENTIONAL_ROLLBACK');
      }),
    ).rejects.toThrow('INTENTIONAL_ROLLBACK');

    const afterRollback = await db
      .collection('statistics')
      .findOne(/** @type {any} */ ({ _id: 'lifetime' }));
    expect(afterRollback).toMatchObject({
      registeredAccounts: 1,
      startedSessions: 1,
      reviewCount: 0,
      submittedQuizCount: 0,
    });
  });
});
