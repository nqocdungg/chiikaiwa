import { withTransaction } from '../../server/persistence/database.js';
import {
  USER_FIXTURES,
  AUTH_SESSION_FIXTURES,
  GUEST_SESSION_FIXTURES,
  FIXTURE_USER_IDS,
} from '../fixtures/auth-fixtures.js';
import { CONTENT_FIXTURES } from '../fixtures/content-fixtures.js';

export const CONTRACT_COLLECTIONS = [
  'users',
  'auth_sessions',
  'guest_sessions',
  'actor_states',
  'statistics',
  'content_items',
  'content_versions',
  'manual_cards',
  'practice_sessions',
  'rate_limits',
];

/**
 * Resets all test collections to a clean, empty state without dropping design indexes.
 * @param {import('mongoose').mongo.Db} db
 */
export async function resetContractCollections(db) {
  for (const collectionName of CONTRACT_COLLECTIONS) {
    try {
      await db.collection(collectionName).deleteMany({});
    } catch {
      // Collection may not exist yet on initial run
    }
  }
}

/**
 * Seeds a standard baseline fixture dataset into the test database.
 * @param {import('mongoose').mongo.Db} db
 */
export async function seedContractFixtures(db) {
  await resetContractCollections(db);

  // 1. Seed users
  await db
    .collection('users')
    .insertMany([
      { ...USER_FIXTURES.learnerA },
      { ...USER_FIXTURES.learnerB },
      { ...USER_FIXTURES.admin },
      { ...USER_FIXTURES.locked },
    ]);

  // 2. Seed actor states corresponding to seeded users
  await db.collection('actor_states').insertMany(
    /** @type {any} */ ([
      {
        _id: `user:${FIXTURE_USER_IDS.learnerA}`,
        mode: 'idle',
        version: 0,
        createdAt: new Date('2026-11-01T00:00:00.000Z'),
        updatedAt: new Date('2026-11-01T00:00:00.000Z'),
      },
      {
        _id: `user:${FIXTURE_USER_IDS.learnerB}`,
        mode: 'idle',
        version: 0,
        createdAt: new Date('2026-11-01T00:00:00.000Z'),
        updatedAt: new Date('2026-11-01T00:00:00.000Z'),
      },
      {
        _id: `user:${FIXTURE_USER_IDS.admin}`,
        mode: 'idle',
        version: 0,
        createdAt: new Date('2026-11-01T00:00:00.000Z'),
        updatedAt: new Date('2026-11-01T00:00:00.000Z'),
      },
    ]),
  );

  // 3. Seed auth sessions
  await db
    .collection('auth_sessions')
    .insertMany([
      { ...AUTH_SESSION_FIXTURES.learnerA },
      { ...AUTH_SESSION_FIXTURES.learnerB },
      { ...AUTH_SESSION_FIXTURES.admin },
      { ...AUTH_SESSION_FIXTURES.expired },
    ]);

  // 4. Seed guest sessions
  await db
    .collection('guest_sessions')
    .insertMany([
      { ...GUEST_SESSION_FIXTURES.active },
      { ...GUEST_SESSION_FIXTURES.expired },
    ]);

  // 5. Seed lifetime statistics baseline (06 §11.1)
  await db.collection('statistics').updateOne(
    /** @type {any} */ ({ _id: 'lifetime' }),
    {
      $set: {
        registeredAccounts: 3,
        startedSessions: 1,
        reviewCount: 0,
        submittedQuizCount: 0,
        updatedAt: new Date('2026-11-01T00:00:00.000Z'),
      },
    },
    { upsert: true },
  );

  // 6. Seed content items and versions
  await db
    .collection('content_items')
    .insertOne({ ...CONTENT_FIXTURES.knowledge });
  await db
    .collection('content_versions')
    .insertOne({ ...CONTENT_FIXTURES.knowledgeVersion });

  // 7. Seed multi-owner manual cards
  await db
    .collection('manual_cards')
    .insertMany([
      { ...CONTENT_FIXTURES.manualCards.cardOwnerA },
      { ...CONTENT_FIXTURES.manualCards.cardOwnerB },
    ]);

  // 8. Seed practice session
  await db
    .collection('practice_sessions')
    .insertOne({ ...CONTENT_FIXTURES.sessionWithMembers });
}

/**
 * Executes a function inside a MongoDB replica-set transaction that is intentionally aborted or verified for rollback.
 * Fulfills AC2 and testing requirements for verifying ACID rollback behavior.
 *
 * @param {import('mongoose').mongo.Db} _db
 * @param {(session: import('mongoose').ClientSession) => Promise<void>} operationFn
 * @returns {Promise<{ rolledBack: boolean }>}
 */
export async function executeAndAssertRollback(_db, operationFn) {
  try {
    await withTransaction(async (session) => {
      await operationFn(session);
      throw new Error('INTENTIONAL_ROLLBACK');
    });
  } catch (err) {
    if (/** @type {Error} */ (err).message === 'INTENTIONAL_ROLLBACK') {
      return { rolledBack: true };
    }
    throw err;
  }
  return { rolledBack: false };
}
