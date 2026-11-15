import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  connectDatabase,
  disconnectDatabase,
} from '../../server/persistence/database.js';
import { up as applyDesignIndexes } from '../../server/persistence/migrations/20261103000100-add-design-indexes.js';
import { seedAll } from '../../server/persistence/seed/seed-content.js';
import {
  SEED_ACCOUNT_IDS,
  SEED_USER_FIXTURES,
} from '../../server/persistence/seed/account-fixtures.js';
import { verifyPassword } from '../../server/modules/identity/crypto.js';

/** @type {MongoMemoryReplSet} */
let replicaSet;
/** @type {import('mongoose').mongo.Db} */
let db;

describe('DATA-002 / DB-T18: Idempotent Seed Integration Test', () => {
  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({
      binary: { version: '8.2.7' },
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    vi.stubEnv('MONGODB_URI', replicaSet.getUri());
    vi.stubEnv('MONGODB_DB_NAME', 'chiikaiwa_test_seed_idempotency');
    db = await connectDatabase();
    await applyDesignIndexes(db);
  }, 60000);

  afterAll(async () => {
    await disconnectDatabase();
    if (replicaSet) {
      await replicaSet.stop();
    }
    vi.unstubAllEnvs();
  });

  it('thực thi kịch bản DB-T18: nạp lần 1 thành công, nạp lần 2 không sinh bản trùng và bảo toàn revision', async () => {
    const itemsColl = db.collection('content_items');
    const versionsColl = db.collection('content_versions');
    const usersColl = db.collection('users');
    const actorStatesColl = db.collection('actor_states');

    // === LẦN CHẠY 1: Nạp trên database mới sạch ===
    const run1 = await seedAll(db, {
      datasets: ['sample', 'n1'],
      includeFixtures: true,
    });

    expect(run1.success).toBe(true);
    expect(run1.summary.totalInserted).toBeGreaterThan(0);
    expect(run1.summary.totalSkipped).toBe(0);
    expect(run1.fixtures?.inserted).toBe(SEED_USER_FIXTURES.length);
    expect(run1.fixtures?.skipped).toBe(0);

    // Ghi nhận số lượng documents sau lần 1
    const countItems1 = await itemsColl.countDocuments();
    const countVersions1 = await versionsColl.countDocuments();
    const countUsers1 = await usersColl.countDocuments();
    const countActorStates1 = await actorStatesColl.countDocuments();

    expect(countItems1).toBe(run1.summary.totalInserted);
    expect(countVersions1).toBe(run1.summary.totalInserted);
    expect(countUsers1).toBe(SEED_USER_FIXTURES.length);
    expect(countActorStates1).toBe(SEED_USER_FIXTURES.length);

    // Lấy một mẫu snapshot revision để kiểm tra tính bất biến sau lần 2
    const sampleVersion = await versionsColl.findOne();
    expect(sampleVersion).toBeDefined();
    const sampleVersionId = sampleVersion?._id;
    const samplePayloadBefore = JSON.stringify(sampleVersion?.payload);

    // === LẦN CHẠY 2: Chạy lại đúng tập dữ liệu đó ===
    const run2 = await seedAll(db, {
      datasets: ['sample', 'n1'],
      includeFixtures: true,
    });

    expect(run2.success).toBe(true);
    // Tiêu chí DB-T18.1: Lần 2 không insert bản ghi học liệu mới nào
    expect(run2.summary.totalInserted).toBe(0);
    expect(run2.summary.totalSkipped).toBe(run1.summary.totalInserted);

    // Tiêu chí DB-T18.1: Fixtures lần 2 không insert mới, skip toàn bộ
    expect(run2.fixtures?.inserted).toBe(0);
    expect(run2.fixtures?.skipped).toBe(SEED_USER_FIXTURES.length);

    // Số lượng bản ghi trong database không được tăng thêm
    const countItems2 = await itemsColl.countDocuments();
    const countVersions2 = await versionsColl.countDocuments();
    const countUsers2 = await usersColl.countDocuments();
    const countActorStates2 = await actorStatesColl.countDocuments();

    expect(countItems2).toBe(countItems1);
    expect(countVersions2).toBe(countVersions1);
    expect(countUsers2).toBe(countUsers1);
    expect(countActorStates2).toBe(countActorStates1);

    // Tiêu chí DB-T18.2: Snapshot revision giữ nguyên tính bất biến tuyệt đối
    const sampleVersionAfter = await versionsColl.findOne({
      _id: sampleVersionId,
    });
    expect(JSON.stringify(sampleVersionAfter?.payload)).toBe(
      samplePayloadBefore,
    );
    expect(sampleVersionAfter?.publishedAt.toISOString()).toBe(
      sampleVersion?.publishedAt.toISOString(),
    );
  });

  it('kiểm chứng toàn vẹn tham chiếu (Referential Integrity) giữa các tầng học liệu sau khi seed', async () => {
    const versionsColl = db.collection('content_versions');

    // Lấy tất cả decks
    const deckVersions = await versionsColl.find({ kind: 'deck' }).toArray();
    expect(deckVersions.length).toBeGreaterThan(0);

    for (const deck of deckVersions) {
      // 1. Kiểm tra scenarioVersionIds
      for (const sVerId of deck.payload.scenarioVersionIds) {
        const scenarioDoc = await versionsColl.findOne({
          _id: sVerId,
          kind: 'scenario',
        });
        expect(
          scenarioDoc,
          `Deck ${deck._id} trỏ tới scenario version không tồn tại: ${sVerId}`,
        ).toBeDefined();

        // 2. Kiểm tra scenario trỏ tới questionVersionIds
        for (const qVerId of scenarioDoc?.payload.questionVersionIds || []) {
          const questionDoc = await versionsColl.findOne({
            _id: qVerId,
            kind: 'question',
          });
          expect(
            questionDoc,
            `Scenario ${scenarioDoc?._id} trỏ tới question version không tồn tại: ${qVerId}`,
          ).toBeDefined();
        }

        // 3. Kiểm tra scenario trỏ tới knowledgeVersionIds
        for (const kVerId of scenarioDoc?.payload.knowledgeVersionIds || []) {
          const knowledgeDoc = await versionsColl.findOne({
            _id: kVerId,
            kind: 'knowledge',
          });
          expect(
            knowledgeDoc,
            `Scenario ${scenarioDoc?._id} trỏ tới knowledge version không tồn tại: ${kVerId}`,
          ).toBeDefined();
        }
      }

      // 4. Kiểm tra deck direct questionVersionIds
      for (const qVerId of deck.payload.questionVersionIds || []) {
        const questionDoc = await versionsColl.findOne({
          _id: qVerId,
          kind: 'question',
        });
        expect(
          questionDoc,
          `Deck ${deck._id} trỏ tới direct question version không tồn tại: ${qVerId}`,
        ).toBeDefined();
      }

      // 5. Kiểm tra deck direct knowledgeVersionIds
      for (const kVerId of deck.payload.knowledgeVersionIds || []) {
        const knowledgeDoc = await versionsColl.findOne({
          _id: kVerId,
          kind: 'knowledge',
        });
        expect(
          knowledgeDoc,
          `Deck ${deck._id} trỏ tới direct knowledge version không tồn tại: ${kVerId}`,
        ).toBeDefined();
      }
    }
  });

  it('xác thực tài khoản kiểm thử seed có thể đăng nhập bằng ValidPassword123 và role chính xác', async () => {
    const usersColl = db.collection('users');

    // Learner A
    const learnerA = await usersColl.findOne({
      emailKey: 'learner.a@example.com',
    });
    expect(learnerA).toBeDefined();
    expect(learnerA?.status).toBe('active');
    expect(learnerA?.role).toBe('learner');
    const validLearnerA = await verifyPassword(
      'ValidPassword123',
      learnerA?.passwordHash,
    );
    expect(validLearnerA).toBe(true);

    // Admin Root
    const admin = await usersColl.findOne({ emailKey: 'admin@example.com' });
    expect(admin).toBeDefined();
    expect(admin?.role).toBe('admin');
    expect(admin?._id.toHexString()).toBe(SEED_ACCOUNT_IDS.admin);
    const validAdmin = await verifyPassword(
      'ValidPassword123',
      admin?.passwordHash,
    );
    expect(validAdmin).toBe(true);

    // Locked Account
    const locked = await usersColl.findOne({ emailKey: 'locked@example.com' });
    expect(locked).toBeDefined();
    expect(locked?.status).toBe('locked');
    expect(locked?.statusReason).toBe('compliance_hold');
  });
});
