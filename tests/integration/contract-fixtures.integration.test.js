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
import app from '../../server/app.js';
import {
  connectDatabase,
  disconnectDatabase,
} from '../../server/persistence/database.js';
import { up as applyDesignIndexes } from '../../server/persistence/migrations/20261103000100-add-design-indexes.js';
import {
  FIXTURE_PRACTICE_SESSION_ID,
  FIXTURE_USER_IDS,
  RAW_GUEST_TOKENS,
} from '../fixtures/auth-fixtures.js';
import { CONTENT_FIXTURES } from '../fixtures/content-fixtures.js';
import {
  executeAndAssertRollback,
  resetContractCollections,
  seedContractFixtures,
} from '../helpers/db-test-helpers.js';

/** @type {MongoMemoryReplSet} */
let replicaSet;
/** @type {import('mongoose').mongo.Db} */
let db;

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({
    binary: { version: '8.2.7' },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  vi.stubEnv('MONGODB_URI', replicaSet.getUri());
  vi.stubEnv('MONGODB_DB_NAME', 'chiikaiwa_qa_contract_integration_test');
  db = await connectDatabase();
  await applyDesignIndexes(db);
});

afterAll(async () => {
  await disconnectDatabase();
  if (replicaSet) {
    await replicaSet.stop();
  }
});

beforeEach(async () => {
  await seedContractFixtures(db);
});

describe('QA-001 Database Contract Fixtures & ACID Integration Suite', () => {
  it('seeds a complete, deterministic baseline fixture dataset across all key collections', async () => {
    const userCount = await db.collection('users').countDocuments({});
    expect(userCount).toBe(4);

    const sessionCount = await db
      .collection('auth_sessions')
      .countDocuments({});
    expect(sessionCount).toBe(4);

    const guestCount = await db.collection('guest_sessions').countDocuments({});
    expect(guestCount).toBe(2);

    const actorCount = await db.collection('actor_states').countDocuments({});
    expect(actorCount).toBe(3);

    const stats = await db
      .collection('statistics')
      .findOne(/** @type {any} */ ({ _id: 'lifetime' }));
    expect(stats?.registeredAccounts).toBe(3);
    expect(stats?.startedSessions).toBe(1);

    const cards = await db.collection('manual_cards').countDocuments({});
    expect(cards).toBe(2);

    // 6. Verify content_items schema per 06 §7.1
    const knowledgeItem = await db
      .collection('content_items')
      .findOne({ _id: CONTENT_FIXTURES.knowledge._id });
    expect(knowledgeItem).not.toBeNull();
    expect(knowledgeItem?.kind).toBe('knowledge');
    expect(knowledgeItem?.status).toBe('published');
    expect(knowledgeItem?.publishedVersionId?.toHexString()).toBe(
      CONTENT_FIXTURES.knowledgeVersion._id.toHexString(),
    );
    expect(knowledgeItem?.latestRevision).toBe(1);

    // 7. Verify content_versions schema per 06 §7.2 (revision, payload structure)
    const knowledgeVersion = await db
      .collection('content_versions')
      .findOne({ _id: CONTENT_FIXTURES.knowledgeVersion._id });
    expect(knowledgeVersion).not.toBeNull();
    expect(knowledgeVersion?.kind).toBe('knowledge');
    expect(knowledgeVersion?.revision).toBe(1);
    expect(knowledgeVersion?.payload).toBeDefined();
    expect(knowledgeVersion?.payload?.type).toBe('vocabulary');
    expect(knowledgeVersion?.payload?.expression).toBe('こんにちは');
    expect(knowledgeVersion?.payload?.reading).toBe('konnichiwa');
    expect(knowledgeVersion?.payload?.meaning).toBe('Xin chào (buổi trưa)');
    expect(Array.isArray(knowledgeVersion?.payload?.examples)).toBe(true);
    expect(knowledgeVersion?.payload?.examples[0]?.japanese).toBe(
      '皆さん、こんにちは。',
    );
    expect(knowledgeVersion?.publishedBy).toBeDefined();

    // 8. Verify practice_sessions schema per 06 §6.1 (status enum preparing/active/reconnecting/ended, members, presence)
    const session = await db
      .collection('practice_sessions')
      .findOne({ _id: CONTENT_FIXTURES.sessionWithMembers._id });
    expect(session).not.toBeNull();
    expect(['preparing', 'active', 'reconnecting', 'ended']).toContain(
      session?.status,
    );
    expect(session?.status).toBe('active');
    expect(session?.roomName).toBe('room-fixture-practice-01');
    expect(session?.members).toHaveLength(2);
    expect(session?.members[0]?.kind).toBe('user');
    expect(session?.members[1]?.kind).toBe('user');
    expect(session?.presence).toHaveLength(2);
    expect(session?.presence[0]?.connected).toBe(true);
    expect(session?.presence[1]?.connected).toBe(true);
    expect(session?.screenShare?.state).toBe('idle');
  });

  it('demonstrates multi-owner tenant isolation per 07 §2.1 and DB-T16', async () => {
    const ownerAKey = `user:${FIXTURE_USER_IDS.learnerA}`;
    const ownerBKey = `user:${FIXTURE_USER_IDS.learnerB}`;

    // Query card strictly scoped to owner A
    const cardOwnedByA = await db.collection('manual_cards').findOne({
      _id: CONTENT_FIXTURES.manualCards.cardOwnerA._id,
      ownerKey: ownerAKey,
    });
    expect(cardOwnedByA).not.toBeNull();
    expect(cardOwnedByA?.front).toBe(
      CONTENT_FIXTURES.manualCards.cardOwnerA.front,
    );

    // Cross-tenant access attempt: querying card owned by A with owner B's key returns null (mapped to 404)
    const crossAccess = await db.collection('manual_cards').findOne({
      _id: CONTENT_FIXTURES.manualCards.cardOwnerA._id,
      ownerKey: ownerBKey,
    });
    expect(crossAccess).toBeNull();
  });

  it('authenticates guest session via ck_guest cookie containing RAW_GUEST_TOKENS.active and rejects expired guest', async () => {
    // 1. Authenticate with active raw guest token
    const activeRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', `ck_guest=${RAW_GUEST_TOKENS.active}`);

    expect(activeRes.status).toBe(200);
    expect(activeRes.body.data.kind).toBe('guest');
    expect(activeRes.body.data.guest.status).toBe('active');
    expect(activeRes.body.data.guest.sessionId).toBe(
      FIXTURE_PRACTICE_SESSION_ID,
    );

    // 2. Authenticate with expired guest token (returns 410 GUEST_EXPIRED)
    const expiredRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', `ck_guest=${RAW_GUEST_TOKENS.expired}`);

    expect(expiredRes.status).toBe(410);
    expect(expiredRes.body.error.code).toBe('GUEST_EXPIRED');

    // 3. Tampered or unregistered guest token (returns 401 SESSION_EXPIRED)
    const tamperedRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', 'ck_guest=unknown_tampered_guest_token');

    expect(tamperedRes.status).toBe(401);
    expect(tamperedRes.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('demonstrates CAS expectedVersion optimistic locking and conflict detection (07 §2.2, DB-T05)', async () => {
    // Current version in fixture is 0
    const cardId = CONTENT_FIXTURES.manualCards.cardOwnerA._id;
    const ownerAKey = `user:${FIXTURE_USER_IDS.learnerA}`;

    // Stale version update attempt: expectedVersion 99 fails CAS update
    const staleResult = await db.collection('manual_cards').updateOne(
      {
        _id: cardId,
        ownerKey: ownerAKey,
        version: 99, // Stale version!
      },
      {
        $set: { front: 'Updated with stale version' },
        $inc: { version: 1 },
      },
    );
    expect(staleResult.matchedCount).toBe(0);
    expect(staleResult.modifiedCount).toBe(0);

    // Current version update attempt: expectedVersion 0 succeeds
    const validResult = await db.collection('manual_cards').updateOne(
      {
        _id: cardId,
        ownerKey: ownerAKey,
        version: 0,
      },
      {
        $set: { front: 'Successfully updated' },
        $inc: { version: 1 },
      },
    );
    expect(validResult.matchedCount).toBe(1);
    expect(validResult.modifiedCount).toBe(1);

    const updatedCard = await db
      .collection('manual_cards')
      .findOne({ _id: cardId });
    expect(updatedCard?.version).toBe(1);
    expect(updatedCard?.front).toBe('Successfully updated');
  });

  it('proves multi-document transaction ACID rollback behavior on aborted operations (AC2, DB-T01)', async () => {
    const initialStats = await db
      .collection('statistics')
      .findOne(/** @type {any} */ ({ _id: 'lifetime' }));
    const initialAccounts = initialStats?.registeredAccounts ?? 0;

    const rollbackResult = await executeAndAssertRollback(
      db,
      async (session) => {
        // 1. Insert temporary document
        await db.collection('users').insertOne(
          {
            email: 'aborted-transaction@example.com',
            emailKey: 'aborted-transaction@example.com',
            role: 'learner',
            status: 'active',
            version: 0,
            createdAt: new Date(),
          },
          { session },
        );

        // 2. Increment statistics
        await db
          .collection('statistics')
          .updateOne(
            /** @type {any} */ ({ _id: 'lifetime' }),
            { $inc: { registeredAccounts: 1 } },
            { session },
          );
      },
    );

    expect(rollbackResult.rolledBack).toBe(true);

    // Confirm that the inserted user document was rolled back
    const rolledBackUser = await db.collection('users').findOne({
      emailKey: 'aborted-transaction@example.com',
    });
    expect(rolledBackUser).toBeNull();

    // Confirm that statistics increment was also rolled back
    const statsAfter = await db
      .collection('statistics')
      .findOne(/** @type {any} */ ({ _id: 'lifetime' }));
    expect(statsAfter?.registeredAccounts).toBe(initialAccounts);
  });

  it('resets collections cleanly with resetContractCollections without breaking design indexes', async () => {
    await resetContractCollections(db);

    const userCount = await db.collection('users').countDocuments({});
    expect(userCount).toBe(0);

    const sessionCount = await db
      .collection('auth_sessions')
      .countDocuments({});
    expect(sessionCount).toBe(0);

    // Verify unique index on users.emailKey is preserved after reset
    const userIndexes = await db.collection('users').indexes();
    const emailIndex = userIndexes.find(
      (idx) => idx.name === 'emailKey_unique',
    );
    expect(emailIndex).toBeDefined();
    expect(emailIndex?.unique).toBe(true);
  });

  it('strictly blocks reset on protected databases (chiikaiwa_dev, demo) and lets real deletion errors surface', async () => {
    // 1. Guard against chiikaiwa_dev
    const mockDevDb = /** @type {any} */ ({ databaseName: 'chiikaiwa_dev' });
    await expect(resetContractCollections(mockDevDb)).rejects.toThrow(
      /Refusing to reset or seed protected\/non-test database: "chiikaiwa_dev"/,
    );

    // 2. Guard against demo database
    const mockDemoDb = /** @type {any} */ ({ databaseName: 'chiikaiwa_demo' });
    await expect(resetContractCollections(mockDemoDb)).rejects.toThrow(
      /Refusing to reset or seed protected\/non-test database: "chiikaiwa_demo"/,
    );

    // 3. Guard against arbitrary non-test database
    const mockProdDb = /** @type {any} */ ({
      databaseName: 'chiikaiwa_production',
    });
    await expect(resetContractCollections(mockProdDb)).rejects.toThrow(
      /Refusing to reset or seed protected\/non-test database: "chiikaiwa_production"/,
    );

    // 4. Surfaces real deletion errors instead of swallowing them
    const errorDb = /** @type {any} */ ({
      databaseName: 'valid_contract_test',
      collection: () => ({
        deleteMany: async () => {
          throw new Error('SIMULATED_DATABASE_WRITE_FAILURE');
        },
      }),
    });
    await expect(resetContractCollections(errorDb)).rejects.toThrow(
      'SIMULATED_DATABASE_WRITE_FAILURE',
    );
  });
});
