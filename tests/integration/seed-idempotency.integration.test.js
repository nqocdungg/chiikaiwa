import { randomBytes } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import {
  connectDatabase,
  disconnectDatabase,
} from '../../server/persistence/database.js';

const { ObjectId } = mongoose.Types;
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

const testAdminPassword = `Admin_${randomBytes(16).toString('hex')}Aa1!`;
const testUserPassword = `User_${randomBytes(16).toString('hex')}Aa1!`;

describe('DATA-002 / DB-T18: Idempotent Seed Integration Test', () => {
  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({
      binary: { version: '8.2.7' },
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    vi.stubEnv('MONGODB_URI', replicaSet.getUri());
    vi.stubEnv('MONGODB_DB_NAME', 'chiikaiwa_test_seed_idempotency');
    vi.stubEnv('SEED_ADMIN_PASSWORD', testAdminPassword);
    vi.stubEnv('SEED_USER_PASSWORD', testUserPassword);
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

    // Giá trị khởi tạo version khớp convention OCC của luồng tạo item thật
    // (xem createDraftContent và updateDraftContentItemCas); sai giá trị này làm publish CAS bị 409.
    const initialItems = await itemsColl.find({}).toArray();
    expect(initialItems.length).toBe(countItems1);
    for (const item of initialItems) {
      expect(item.version).toBe(0);
    }

    // Lấy một mẫu snapshot revision để kiểm tra tính bất biến sau lần 2
    const sampleVersion = await versionsColl.findOne();
    expect(sampleVersion).not.toBeNull();
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
    expect(run2.summary.totalSynced).toBe(0);
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

  /**
   * Quét toàn bộ decks và scenarios để tìm tất cả các tham chiếu bị gãy (T7a).
   * @param {import('mongoose').mongo.Collection} versionsColl
   * @returns {Promise<string[]>}
   */
  async function findBrokenReferences(versionsColl) {
    const broken = [];
    const deckVersions = await versionsColl.find({ kind: 'deck' }).toArray();
    for (const deck of deckVersions) {
      for (const sVerId of deck.payload?.scenarioVersionIds || []) {
        const scenarioDoc = await versionsColl.findOne({
          _id: sVerId,
          kind: 'scenario',
        });
        if (!scenarioDoc) {
          broken.push(
            `Deck ${deck._id} trỏ tới scenario version không tồn tại: ${sVerId}`,
          );
          continue;
        }
        for (const qVerId of scenarioDoc.payload?.questionVersionIds || []) {
          const questionDoc = await versionsColl.findOne({
            _id: qVerId,
            kind: 'question',
          });
          if (!questionDoc) {
            broken.push(
              `Scenario ${scenarioDoc._id} trỏ tới question version không tồn tại: ${qVerId}`,
            );
          }
        }
        for (const kVerId of scenarioDoc.payload?.knowledgeVersionIds || []) {
          const knowledgeDoc = await versionsColl.findOne({
            _id: kVerId,
            kind: 'knowledge',
          });
          if (!knowledgeDoc) {
            broken.push(
              `Scenario ${scenarioDoc._id} trỏ tới knowledge version không tồn tại: ${kVerId}`,
            );
          }
        }
      }
      for (const qVerId of deck.payload?.questionVersionIds || []) {
        const questionDoc = await versionsColl.findOne({
          _id: qVerId,
          kind: 'question',
        });
        if (!questionDoc) {
          broken.push(
            `Deck ${deck._id} trỏ tới direct question version không tồn tại: ${qVerId}`,
          );
        }
      }
      for (const kVerId of deck.payload?.knowledgeVersionIds || []) {
        const knowledgeDoc = await versionsColl.findOne({
          _id: kVerId,
          kind: 'knowledge',
        });
        if (!knowledgeDoc) {
          broken.push(
            `Deck ${deck._id} trỏ tới direct knowledge version không tồn tại: ${kVerId}`,
          );
        }
      }
    }
    return broken;
  }

  it('kiểm chứng toàn vẹn tham chiếu (Referential Integrity) giữa các tầng học liệu sau khi seed', async () => {
    const versionsColl = db.collection('content_versions');
    const broken = await findBrokenReferences(versionsColl);
    expect(broken).toEqual([]);
  });

  it('Negative test: kiểm tra toàn vẹn tham chiếu bắt được lỗi khi có reference gãy (F3 / Item 1 / T7a)', async () => {
    const versionsColl = db.collection('content_versions');
    const aDeck = await versionsColl.findOne({ kind: 'deck' });
    expect(aDeck).not.toBeNull();
    const firstScenarioId = aDeck?.payload.scenarioVersionIds?.[0];
    expect(firstScenarioId).toBeDefined();

    const scenarioDoc = await versionsColl.findOne({ _id: firstScenarioId });
    expect(scenarioDoc).not.toBeNull();
    const firstQId = scenarioDoc?.payload.questionVersionIds?.[0];
    expect(firstQId).toBeDefined();

    // Tạm xóa question version này để mô phỏng tham chiếu gãy
    const deletedQ = await versionsColl.findOneAndDelete({ _id: firstQId });
    expect(deletedQ).not.toBeNull();

    try {
      const broken = await findBrokenReferences(versionsColl);
      // Kỳ vọng phát hiện được ít nhất 1 tham chiếu gãy trỏ tới firstQId
      expect(broken.length).toBeGreaterThanOrEqual(1);
      expect(broken.some((msg) => msg.includes(String(firstQId)))).toBe(true);
    } finally {
      // Khôi phục lại document sau khi kiểm thử negative xong
      if (deletedQ) {
        await versionsColl.insertOne(deletedQ);
      }
      const restoredBroken = await findBrokenReferences(versionsColl);
      expect(restoredBroken).toEqual([]);
    }
  });

  it('xác thực tài khoản kiểm thử seed có thể đăng nhập bằng mật khẩu tương ứng và role chính xác', async () => {
    const usersColl = db.collection('users');

    // Learner A
    const learnerA = await usersColl.findOne({
      emailKey: 'learner.a@example.com',
    });
    expect(learnerA).not.toBeNull();
    expect(learnerA?.status).toBe('active');
    expect(learnerA?.role).toBe('learner');
    const validLearnerA = await verifyPassword(
      testUserPassword,
      learnerA?.passwordHash,
    );
    expect(validLearnerA).toBe(true);

    // Admin Root
    const admin = await usersColl.findOne({ emailKey: 'admin@example.com' });
    expect(admin).not.toBeNull();
    expect(admin?.role).toBe('admin');
    expect(admin?._id.toHexString()).toBe(SEED_ACCOUNT_IDS.admin);
    const validAdmin = await verifyPassword(
      testAdminPassword,
      admin?.passwordHash,
    );
    expect(validAdmin).toBe(true);

    // Locked Account
    const locked = await usersColl.findOne({ emailKey: 'locked@example.com' });
    expect(locked).not.toBeNull();
    expect(locked?.status).toBe('locked');
    expect(locked?.statusReason).toBe('compliance_hold');
  });

  it('re-seed sau khi Admin publish revision mới và ẩn học liệu: bảo toàn revision mới và trạng thái hidden', async () => {
    const itemsColl = db.collection('content_items');
    const versionsColl = db.collection('content_versions');

    // 1. Chọn 1 knowledge item để Admin thực hiện ẨN (status: 'hidden')
    const targetKnowledge = await itemsColl.findOne({ kind: 'knowledge' });
    expect(targetKnowledge).not.toBeNull();
    await itemsColl.updateOne(
      { _id: targetKnowledge?._id },
      { $set: { status: 'hidden' } },
    );

    // 2. Chọn 1 deck item để Admin thực hiện XUẤT BẢN REVISION 2
    const targetDeck = await itemsColl.findOne({ kind: 'deck' });
    expect(targetDeck).not.toBeNull();

    const version2Id = new ObjectId();
    const now = new Date();
    await versionsColl.insertOne({
      _id: version2Id,
      contentId: targetDeck?._id,
      kind: 'deck',
      revision: 2,
      payload: {
        title: 'Tiêu đề deck bản revision 2 do Admin xuất bản',
        level: targetDeck?.level || 'N5',
        topicKey: 'test-topic-r2',
      },
      publishedAt: now,
      publishedBy: new ObjectId(SEED_ACCOUNT_IDS.admin),
    });

    await itemsColl.updateOne(
      { _id: targetDeck?._id },
      {
        $set: {
          latestRevision: 2,
          publishedVersionId: version2Id,
          title: 'Tiêu đề deck bản revision 2 do Admin xuất bản',
          updatedAt: now,
        },
      },
    );

    // 3. Thực thi re-seed toàn bộ dataset ban đầu
    const reSeedResult = await seedAll(db, {
      datasets: ['sample', 'n1'],
      includeFixtures: false,
    });
    expect(reSeedResult.success).toBe(true);

    // 4. Kiểm tra tiêu chí bảo toàn:
    // a) Học liệu đã bị ẩn: status VẪN PHẢI LÀ 'hidden', không bị ghi đè thành 'published'
    const hiddenDocAfter = await itemsColl.findOne({
      _id: targetKnowledge?._id,
    });
    expect(hiddenDocAfter).not.toBeNull();
    expect(hiddenDocAfter?.status).toBe('hidden');

    // b) Học liệu có revision mới: latestRevision VẪN PHẢI LÀ 2, publishedVersionId trỏ tới version2Id
    const deckDocAfter = await itemsColl.findOne({ _id: targetDeck?._id });
    expect(deckDocAfter).not.toBeNull();
    expect(deckDocAfter?.latestRevision).toBe(2);
    expect(deckDocAfter?.publishedVersionId.toHexString()).toBe(
      version2Id.toHexString(),
    );
    expect(deckDocAfter?.title).toBe(
      'Tiêu đề deck bản revision 2 do Admin xuất bản',
    );
  });

  it('re-seed sau sự cố partial failure (lỗi giữa chừng): khôi phục thành công content_items bị thiếu', async () => {
    const itemsColl = db.collection('content_items');
    const versionsColl = db.collection('content_versions');

    // 1. Lấy 1 bản ghi scenario đã có trong DB
    const originalScenario = await itemsColl.findOne({ kind: 'scenario' });
    expect(originalScenario).not.toBeNull();
    const scenarioId = originalScenario?._id;
    const versionId = originalScenario?.publishedVersionId;

    // Đảm bảo version doc đang tồn tại trong content_versions
    const versionDocBefore = await versionsColl.findOne({ _id: versionId });
    expect(versionDocBefore).not.toBeNull();

    // 2. Mô phỏng sự cố partial failure: version đã có nhưng content_items bị mất/chưa được tạo
    await itemsColl.deleteOne({ _id: scenarioId });
    const missingCheck = await itemsColl.findOne({ _id: scenarioId });
    expect(missingCheck).toBeNull();

    const countVersionsBefore = await versionsColl.countDocuments();

    // 3. Chạy lại script seed
    const reSeedResult = await seedAll(db, {
      datasets: ['sample', 'n1'],
      includeFixtures: false,
    });
    expect(reSeedResult.success).toBe(true);

    // 4. Kiểm tra khôi phục thành công:
    // a) content_items đã được tái tạo và có đầy đủ trường nghiệp vụ
    const recoveredScenario = await itemsColl.findOne({ _id: scenarioId });
    expect(recoveredScenario).not.toBeNull();
    expect(recoveredScenario?.kind).toBe('scenario');
    expect(recoveredScenario?.status).toBe('published');
    expect(recoveredScenario?.latestRevision).toBe(1);
    expect(recoveredScenario?.publishedVersionId.toHexString()).toBe(
      versionId.toHexString(),
    );

    // b) content_versions không bị chèn trùng hay tăng số lượng
    const countVersionsAfter = await versionsColl.countDocuments();
    expect(countVersionsAfter).toBe(countVersionsBefore);
  });

  it('re-seed sau khi Admin sửa nháp draftPayload: bảo toàn nguyên vẹn draftPayload của Admin (06 §7.1)', async () => {
    const itemsColl = db.collection('content_items');

    // 1. Admin sửa nháp draftPayload cho 1 knowledge item
    const targetKnowledge = await itemsColl.findOne({ kind: 'knowledge' });
    expect(targetKnowledge).not.toBeNull();
    const customKnowledgeDraft = {
      expression: 'Nháp kiến thức do Admin đang sửa dở',
      meaning: 'Chưa xuất bản',
      reading: 'にゃっぷ',
    };
    await itemsColl.updateOne(
      { _id: targetKnowledge?._id },
      { $set: { draftPayload: customKnowledgeDraft } },
    );

    // 2. Admin sửa nháp cho 1 deck item có latestRevision: 1 (F3: tránh deck đã bị nâng lên revision 2 ở test trước)
    const targetDeck = await itemsColl.findOne({
      kind: 'deck',
      latestRevision: 1,
    });
    expect(targetDeck).not.toBeNull();
    const customDeckDraft = {
      title: 'Nháp tiêu đề deck mới do Admin biên tập',
    };
    const editedTitle = 'Tiêu đề deck đang hiển thị (Admin đã đổi)';
    const editedLevel = 'N2';
    await itemsColl.updateOne(
      { _id: targetDeck?._id },
      {
        $set: {
          draftPayload: customDeckDraft,
          title: editedTitle,
          level: editedLevel,
        },
      },
    );

    // 3. Thực hiện re-seed
    const reSeedResult = await seedAll(db, {
      datasets: ['sample', 'n1'],
      includeFixtures: false,
    });
    expect(reSeedResult.success).toBe(true);

    // 4. Kiểm chứng draftPayload và metadata không bị ghi đè
    const knowledgeAfter = await itemsColl.findOne({
      _id: targetKnowledge?._id,
    });
    expect(knowledgeAfter).not.toBeNull();
    expect(knowledgeAfter?.draftPayload).toEqual(customKnowledgeDraft);

    const deckAfter = await itemsColl.findOne({ _id: targetDeck?._id });
    expect(deckAfter).not.toBeNull();
    expect(deckAfter?.draftPayload).toEqual(customDeckDraft);
    expect(deckAfter?.title).toBe(editedTitle);
    expect(deckAfter?.level).toBe(editedLevel);
  });
});
