import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  connectDatabase,
  disconnectDatabase,
} from '../../server/persistence/database.js';
import { up as applyDesignIndexes } from '../../server/persistence/migrations/20261103000100-add-design-indexes.js';
import { FIXTURE_USER_IDS } from '../fixtures/auth-fixtures.js';
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
});
