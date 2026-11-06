import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import request from 'supertest';
import { readAuthEnv } from '../../server/config/env.js';
import { createApp } from '../../server/app.js';
import { AppError } from '../../server/middleware/http-error.js';
import { signJwt } from '../../server/modules/identity/crypto.js';
import {
  claimActorState,
  getActorCoordination,
  releaseActorState,
  runIdempotentOperation,
} from '../../server/modules/coordination/coordination-service.js';
import {
  connectDatabase,
  disconnectDatabase,
} from '../../server/persistence/database.js';
import { up as applyDesignIndexes } from '../../server/persistence/migrations/20261103000100-add-design-indexes.js';

/** @type {MongoMemoryReplSet} */
let replicaSet;
/** @type {import('mongoose').mongo.Db} */
let db;
const app = createApp();
const { ObjectId } = mongoose.Types;

/** @returns {import('mongoose').mongo.Collection<any>} */
function actorStateCollection() {
  return /** @type {import('mongoose').mongo.Collection<any>} */ (
    db.collection('actor_states')
  );
}

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({
    binary: { version: '8.2.7' },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  vi.stubEnv('MONGODB_URI', replicaSet.getUri());
  vi.stubEnv('MONGODB_DB_NAME', 'chiikaiwa_coordination_test');
  vi.stubEnv('APP_ORIGIN', 'http://127.0.0.1:5173');
  db = await connectDatabase();
  await applyDesignIndexes(db);
});

beforeEach(async () => {
  await Promise.all([
    actorStateCollection().deleteMany({}),
    db.collection('operation_receipts').deleteMany({}),
  ]);
});

afterAll(async () => {
  await disconnectDatabase();
  await replicaSet?.stop();
  vi.unstubAllEnvs();
});

describe('coordination persistence', () => {
  it('serves GET /me/coordination for the current authenticated actor', async () => {
    const now = new Date();
    const userId = new ObjectId();
    const sessionId = new ObjectId();
    const actorKey = `user:${userId.toHexString()}`;
    const expiresAt = new Date(now.getTime() + 60_000);
    const authEnv = readAuthEnv();
    await db.collection('users').insertOne({
      _id: userId,
      role: 'learner',
      status: 'active',
      authVersion: 0,
    });
    await db.collection('auth_sessions').insertOne({
      _id: sessionId,
      userId,
      authVersion: 0,
      issuedAt: now,
      expiresAt,
      purgeAt: expiresAt,
    });
    await actorStateCollection().insertOne({
      _id: actorKey,
      mode: 'inviting',
      resourceId: 'invitation-123',
      version: 4,
    });
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

    await request(app)
      .get('/api/v1/me/coordination')
      .set('Cookie', `ck_session=${token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toEqual({
          mode: 'inviting',
          resourceId: 'invitation-123',
          version: 4,
        });
      });
    await request(app).get('/api/v1/me/coordination').expect(401);
  });

  it('allows only one concurrent reservation for an actor', async () => {
    const results = await Promise.allSettled([
      claimActorState({
        actorKey: 'user:race',
        mode: 'searching',
        search: { requestId: 'search-1' },
      }),
      claimActorState({
        actorKey: 'user:race',
        mode: 'inviting',
        resourceId: 'invitation-1',
      }),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    const state = await actorStateCollection().findOne({ _id: 'user:race' });
    expect(state).toMatchObject({ version: 1 });
    expect(['searching', 'inviting']).toContain(state?.mode);
  });

  it('projects only coordination fields and releases with compare-and-swap', async () => {
    const claimed = await claimActorState({
      actorKey: 'user:projection',
      mode: 'searching',
      search: {
        requestId: 'search-2',
        level: 'N3',
        desiredMinutes: 10,
        allowAdjacent: true,
        profileSnapshot: { gender: 'private' },
        filters: { countryCode: 'JP' },
        queuedAt: new Date('2026-11-05T00:00:00.000Z'),
        leaseUntil: new Date('2026-11-05T00:00:30.000Z'),
      },
    });
    expect(await getActorCoordination('user:projection')).toEqual({
      mode: 'searching',
      version: 1,
      search: {
        requestId: 'search-2',
        criteria: {
          level: 'N3',
          desiredMinutes: 10,
          allowAdjacent: true,
          filters: { countryCode: 'JP' },
        },
        queuedAt: new Date('2026-11-05T00:00:00.000Z'),
        leaseUntil: new Date('2026-11-05T00:00:30.000Z'),
      },
    });

    await expect(
      releaseActorState({
        actorKey: 'user:projection',
        expectedVersion: claimed.version - 1,
        mode: 'searching',
        searchRequestId: claimed.search.requestId,
      }),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });

    await expect(
      releaseActorState({
        actorKey: 'user:projection',
        expectedVersion: claimed.version,
        mode: 'searching',
      }),
    ).rejects.toThrow(TypeError);

    await expect(
      releaseActorState({
        actorKey: 'user:projection',
        expectedVersion: claimed.version,
        mode: 'searching',
        searchRequestId: 'search-other',
      }),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });

    expect(
      await actorStateCollection().findOne({ _id: 'user:projection' }),
    ).toMatchObject({
      mode: 'searching',
      version: claimed.version,
      search: { requestId: 'search-2' },
    });

    const released = await releaseActorState({
      actorKey: 'user:projection',
      expectedVersion: claimed.version,
      mode: 'searching',
      searchRequestId: claimed.search.requestId,
    });
    expect(released).toMatchObject({ mode: 'idle', version: 2 });
    expect(released?.search).toBeUndefined();
  });

  it('replays a receipt without repeating writes and rejects a changed payload', async () => {
    let writes = 0;
    const input = {
      actorKey: 'user:receipt',
      method: 'post',
      path: '/api/v1/sessions/one/draws',
      operationId: 'operation-1',
      payload: { slot: 2, expectedVersion: 3 },
      authorize: async () => {},
      execute: async () => {
        writes += 1;
        return { resultRef: 'session:one', value: { committed: true } };
      },
      replay: async (
        /** @type {{receipt: Record<string, any>}} */ { receipt },
      ) => ({
        replayed: true,
        resultRef: receipt.resultRef,
      }),
    };

    await expect(runIdempotentOperation(input)).resolves.toEqual({
      committed: true,
    });
    await expect(
      runIdempotentOperation({
        ...input,
        payload: { expectedVersion: 3, slot: 2 },
      }),
    ).resolves.toEqual({ replayed: true, resultRef: 'session:one' });
    expect(writes).toBe(1);
    await expect(
      runIdempotentOperation({ ...input, payload: { slot: 1 } }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT', status: 409 });
    expect(
      await db
        .collection('operation_receipts')
        .findOne({ actorKey: 'user:receipt' }),
    ).toMatchObject({
      action: 'POST',
      resourceKey: '/api/v1/sessions/one/draws',
      operationId: 'operation-1',
      resultRef: 'session:one',
      payloadHash: expect.any(String),
      purgeAt: expect.any(Date),
    });
    expect(writes).toBe(1);
  });

  it('checks current authorization before replaying a committed operation', async () => {
    await runIdempotentOperation({
      actorKey: 'user:revoked',
      method: 'PATCH',
      path: '/api/v1/private/one',
      operationId: 'operation-2',
      payload: { value: 1 },
      authorize: async () => {},
      execute: async () => ({ resultRef: 'private:one', value: 'saved' }),
      replay: async () => 'replayed',
    });

    await expect(
      runIdempotentOperation({
        actorKey: 'user:revoked',
        method: 'PATCH',
        path: '/api/v1/private/one',
        operationId: 'operation-2',
        payload: { value: 1 },
        authorize: async () => {
          throw new AppError({
            status: 403,
            code: 'FORBIDDEN',
            message: 'Access revoked',
          });
        },
        execute: async () => ({ value: 'must not write' }),
        replay: async () => 'must not replay',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });
});
