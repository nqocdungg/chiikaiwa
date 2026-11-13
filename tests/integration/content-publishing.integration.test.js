import { randomBytes, randomUUID } from 'node:crypto';
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
import {
  hashGuestCredential,
  signJwt,
} from '../../server/modules/identity/crypto.js';
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

const TEST_ORIGIN = 'http://127.0.0.1:5173';

const adminId = new ObjectId();
const learnerId = new ObjectId();
const adminSessionId = new ObjectId();
const learnerSessionId = new ObjectId();

const RAW_GUEST_TOKEN = randomBytes(24).toString('hex');
const guestSessionId = new ObjectId();
let guestPracticeSessionId = new ObjectId();

/**
 * @param {import('mongoose').Types.ObjectId} userId
 * @param {import('mongoose').Types.ObjectId} sessionId
 * @param {number} [authVersion]
 */
function createAuthCookie(userId, sessionId, authVersion = 0) {
  const authEnv = readAuthEnv();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 3600_000);
  const token = signJwt(
    {
      sub: userId.toHexString(),
      sid: sessionId.toHexString(),
      authVersion,
      iat: Math.floor(now.getTime() / 1000),
      exp: Math.floor(expiresAt.getTime() / 1000),
    },
    authEnv.jwtSecret,
    { issuer: authEnv.jwtIssuer, audience: authEnv.jwtAudience },
  );
  return `ck_session=${token}`;
}

async function fetchCsrfToken() {
  const response = await request(app).get('/api/v1/auth/csrf');
  const cookie = response.headers['set-cookie'];
  const token = response.body.data.csrfToken;
  return { cookie, token };
}

describe('BE-013: Content Publishing & Read Projections Integration Tests', () => {
  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    vi.stubEnv('MONGODB_URI', replicaSet.getUri());
    vi.stubEnv('MONGODB_DB_NAME', 'chiikaiwa_content_publishing_test');
    vi.stubEnv('APP_ORIGIN', TEST_ORIGIN);

    db = await connectDatabase();
    await applyDesignIndexes(db);
  }, 60000);

  afterAll(async () => {
    await disconnectDatabase();
    if (replicaSet) {
      await replicaSet.stop();
    }
  });

  beforeEach(async () => {
    // Dọn dẹp dữ liệu trước mỗi bài test
    await db.collection('content_items').deleteMany({});
    await db.collection('content_versions').deleteMany({});
    await db.collection('operation_receipts').deleteMany({});
    await db.collection('users').deleteMany({});
    await db.collection('auth_sessions').deleteMany({});
    await db.collection('guest_sessions').deleteMany({});

    // Chuẩn bị tài khoản Admin
    await db.collection('users').insertOne({
      _id: adminId,
      email: 'admin@chiikaiwa.test',
      emailKey: 'admin@chiikaiwa.test',
      role: 'admin',
      displayName: 'System Admin',
      status: 'active',
      authVersion: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db.collection('auth_sessions').insertOne({
      _id: adminSessionId,
      userId: adminId,
      authVersion: 0,
      createdAt: new Date(),
      lastSeenAt: new Date(),
      expiresAt: new Date(Date.now() + 3600_000),
    });

    // Chuẩn bị tài khoản Learner
    await db.collection('users').insertOne({
      _id: learnerId,
      email: 'learner@chiikaiwa.test',
      emailKey: 'learner@chiikaiwa.test',
      role: 'learner',
      displayName: 'Minh Trí',
      status: 'active',
      authVersion: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db.collection('auth_sessions').insertOne({
      _id: learnerSessionId,
      userId: learnerId,
      authVersion: 0,
      createdAt: new Date(),
      lastSeenAt: new Date(),
      expiresAt: new Date(Date.now() + 3600_000),
    });

    // Chuẩn bị tài khoản Guest
    const guestHash = hashGuestCredential(RAW_GUEST_TOKEN);
    await db.collection('guest_sessions').insertOne({
      _id: guestSessionId,
      credentialHash: guestHash,
      displayName: 'Khách thử nghiệm',
      status: 'active',
      startedSessions: 0,
      maxSessions: 3,
      version: 0,
      practiceSessionId: guestPracticeSessionId,
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600_000),
    });
  });

  describe('POST /admin/content/:id/publish', () => {
    it('enforces Admin role and returns 401/403 for unauthorized actors', async () => {
      const { cookie: csrfCookie, token: csrfToken } = await fetchCsrfToken();
      const fakeId = new ObjectId().toHexString();

      // Không đăng nhập
      const resUnauth = await request(app)
        .post(`/api/v1/admin/content/${fakeId}/publish`)
        .set('Origin', TEST_ORIGIN)
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', csrfCookie)
        .set('Idempotency-Key', randomUUID())
        .send({ expectedVersion: 0 });
      expect(resUnauth.status).toBe(401);

      // Learner đăng nhập
      const learnerCookie = createAuthCookie(learnerId, learnerSessionId);
      const resForbidden = await request(app)
        .post(`/api/v1/admin/content/${fakeId}/publish`)
        .set('Origin', TEST_ORIGIN)
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', [learnerCookie, ...csrfCookie])
        .set('Idempotency-Key', randomUUID())
        .send({ expectedVersion: 0 });
      expect(resForbidden.status).toBe(403);
    });

    it('rejects publishing when completeness thresholds are not met and creates NO version (AC 1)', async () => {
      const adminCookie = createAuthCookie(adminId, adminSessionId);
      const { cookie: csrfCookie, token: csrfToken } = await fetchCsrfToken();

      // Tạo nháp tình huống chỉ có 2 câu hỏi (ngưỡng tối thiểu là 3)
      const q1 = new ObjectId();
      const q2 = new ObjectId();
      const scenarioItemId = new ObjectId();

      await db.collection('content_items').insertOne({
        _id: scenarioItemId,
        kind: 'scenario',
        status: 'draft',
        latestRevision: 0,
        version: 0,
        createdBy: adminId,
        draftPayload: {
          title: 'Nhận phòng',
          context: 'Tại quầy lễ tân',
          objective: 'Lấy thẻ phòng',
          roleA: 'Khách',
          roleB: 'Lễ tân',
          questionVersionIds: [q1.toHexString(), q2.toHexString()],
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .post(`/api/v1/admin/content/${scenarioItemId.toHexString()}/publish`)
        .set('Origin', TEST_ORIGIN)
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', [adminCookie, ...csrfCookie])
        .set('Idempotency-Key', randomUUID())
        .send({ expectedVersion: 0 });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('CONTENT_INCOMPLETE');
      expect(res.body.error.details.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'draftPayload.questionVersionIds',
            code: 'THRESHOLD_NOT_MET',
          }),
        ]),
      );

      // Xác minh tuyệt đối không tạo revision nửa chừng
      const versionCount = await db
        .collection('content_versions')
        .countDocuments({
          contentId: scenarioItemId,
        });
      expect(versionCount).toBe(0);

      // Trạng thái của content_items vẫn giữ nguyên là draft
      const itemAfter = await db
        .collection('content_items')
        .findOne({ _id: scenarioItemId });
      expect(itemAfter?.status).toBe('draft');
      expect(itemAfter?.version).toBe(0);
    });

    it('publishes valid content atomically, creates immutable revision and increments version (TX-11, DB-T09, AC 1, AC 3)', async () => {
      const adminCookie = createAuthCookie(adminId, adminSessionId);
      const { cookie: csrfCookie, token: csrfToken } = await fetchCsrfToken();

      const knowledgeItemId = new ObjectId();
      await db.collection('content_items').insertOne({
        _id: knowledgeItemId,
        kind: 'knowledge',
        status: 'draft',
        latestRevision: 0,
        version: 0,
        createdBy: adminId,
        draftPayload: {
          type: 'vocabulary',
          expression: '予約',
          reading: 'よやく',
          meaning: 'Đặt trước',
          examples: [
            { japanese: '予約があります。', vietnamese: 'Tôi có đặt trước.' },
          ],
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Xuất bản lần 1
      const resPub1 = await request(app)
        .post(`/api/v1/admin/content/${knowledgeItemId.toHexString()}/publish`)
        .set('Origin', TEST_ORIGIN)
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', [adminCookie, ...csrfCookie])
        .set('Idempotency-Key', randomUUID())
        .send({ expectedVersion: 0 });

      expect(resPub1.status).toBe(200);
      expect(resPub1.body.data.status).toBe('published');
      expect(resPub1.body.data.latestRevision).toBe(1);
      expect(resPub1.body.data.version).toBe(1);
      const version1Id = resPub1.body.data.publishedVersionId;
      expect(version1Id).toBeTruthy();

      // Kiểm tra trong database: bản ghi content_versions đã được tạo
      const v1 = await db
        .collection('content_versions')
        .findOne({ _id: new ObjectId(version1Id) });
      expect(v1).toBeTruthy();
      expect(v1?.revision).toBe(1);
      expect(v1?.payload.meaning).toBe('Đặt trước');

      // Sửa nháp: cập nhật nghĩa mở rộng
      await db.collection('content_items').updateOne(
        { _id: knowledgeItemId },
        {
          $set: {
            'draftPayload.meaning': 'Đặt trước, hẹn trước (đã bổ sung nghĩa)',
          },
        },
      );

      // Xuất bản lần 2
      const resPub2 = await request(app)
        .post(`/api/v1/admin/content/${knowledgeItemId.toHexString()}/publish`)
        .set('Origin', TEST_ORIGIN)
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', [adminCookie, ...csrfCookie])
        .set('Idempotency-Key', randomUUID())
        .send({ expectedVersion: 1 });

      expect(resPub2.status).toBe(200);
      expect(resPub2.body.data.latestRevision).toBe(2);
      expect(resPub2.body.data.version).toBe(2);
      const version2Id = resPub2.body.data.publishedVersionId;
      expect(version2Id).not.toBe(version1Id);

      // Xác minh revision 1 hoàn toàn bất biến, không bị thay đổi (AC 3, BR-24)
      const v1Check = await db
        .collection('content_versions')
        .findOne({ _id: new ObjectId(version1Id) });
      expect(v1Check?.payload.meaning).toBe('Đặt trước');

      const v2Check = await db
        .collection('content_versions')
        .findOne({ _id: new ObjectId(version2Id) });
      expect(v2Check?.payload.meaning).toBe(
        'Đặt trước, hẹn trước (đã bổ sung nghĩa)',
      );
    });

    it('rejects publish on version conflict with 409 VERSION_CONFLICT', async () => {
      const adminCookie = createAuthCookie(adminId, adminSessionId);
      const { cookie: csrfCookie, token: csrfToken } = await fetchCsrfToken();

      const knowledgeItemId = new ObjectId();
      await db.collection('content_items').insertOne({
        _id: knowledgeItemId,
        kind: 'knowledge',
        status: 'draft',
        latestRevision: 0,
        version: 5,
        createdBy: adminId,
        draftPayload: {
          type: 'vocabulary',
          expression: 'チェックアウト',
          meaning: 'Trả phòng',
          examples: [
            {
              japanese: 'チェックアウトをお願いします。',
              vietnamese: 'Làm ơn cho tôi trả phòng.',
            },
          ],
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .post(`/api/v1/admin/content/${knowledgeItemId.toHexString()}/publish`)
        .set('Origin', TEST_ORIGIN)
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', [adminCookie, ...csrfCookie])
        .set('Idempotency-Key', randomUUID())
        .send({ expectedVersion: 0 }); // lệch version

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('VERSION_CONFLICT');
    });
  });

  describe('POST /admin/content/:id/hide', () => {
    it('hides content, increments version and preserves publishedVersionId (AC 3)', async () => {
      const adminCookie = createAuthCookie(adminId, adminSessionId);
      const { cookie: csrfCookie, token: csrfToken } = await fetchCsrfToken();

      const pubVersionId = new ObjectId();
      const itemId = new ObjectId();
      await db.collection('content_items').insertOne({
        _id: itemId,
        kind: 'knowledge',
        status: 'published',
        publishedVersionId: pubVersionId,
        latestRevision: 1,
        version: 1,
        createdBy: adminId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .post(`/api/v1/admin/content/${itemId.toHexString()}/hide`)
        .set('Origin', TEST_ORIGIN)
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', [adminCookie, ...csrfCookie])
        .set('Idempotency-Key', randomUUID())
        .send({ expectedVersion: 1 });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('hidden');
      expect(res.body.data.version).toBe(2);
      // publishedVersionId vẫn được giữ nguyên
      expect(res.body.data.publishedVersionId).toBe(pubVersionId.toHexString());

      const itemInDb = await db
        .collection('content_items')
        .findOne({ _id: itemId });
      expect(itemInDb?.status).toBe('hidden');
      expect(itemInDb?.publishedVersionId.toHexString()).toBe(
        pubVersionId.toHexString(),
      );
    });
  });

  describe('Learner & Guest Read Endpoints (GET /topics, /topic-versions, /knowledge)', () => {
    /** @type {import('mongoose').Types.ObjectId} */
    let publishedDeckId;
    /** @type {import('mongoose').Types.ObjectId} */
    let publishedDeckVersionId;
    /** @type {import('mongoose').Types.ObjectId} */
    let k1ItemId;
    /** @type {import('mongoose').Types.ObjectId} */
    let k1VersionId;

    beforeEach(async () => {
      k1ItemId = new ObjectId();
      k1VersionId = new ObjectId();

      // Tạo 1 knowledge đã xuất bản
      await db.collection('content_items').insertOne({
        _id: k1ItemId,
        kind: 'knowledge',
        status: 'published',
        publishedVersionId: k1VersionId,
        latestRevision: 1,
        version: 1,
        createdBy: adminId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await db.collection('content_versions').insertOne({
        _id: k1VersionId,
        contentId: k1ItemId,
        kind: 'knowledge',
        revision: 1,
        payload: {
          type: 'vocabulary',
          expression: '荷物',
          reading: 'にもつ',
          meaning: 'Hành lý',
          examples: [
            { japanese: '荷物を預けます。', vietnamese: 'Tôi gửi hành lý.' },
          ],
        },
        publishedAt: new Date(),
        publishedBy: adminId,
      });

      // Tạo 3 câu hỏi đã xuất bản
      const qvIds = [new ObjectId(), new ObjectId(), new ObjectId()];
      for (const qvId of qvIds) {
        await db.collection('content_versions').insertOne({
          _id: qvId,
          contentId: new ObjectId(),
          kind: 'question',
          revision: 1,
          payload: {
            type: 'multipleChoice',
            prompt: 'Câu hỏi?',
            options: [
              { id: '1', text: 'A' },
              { id: '2', text: 'B' },
            ],
            correctOptionId: '1',
            explanation: 'Giải thích',
          },
          publishedAt: new Date(),
          publishedBy: adminId,
        });
      }

      // Tạo 1 scenario đã xuất bản
      const scenarioVersionId = new ObjectId();
      await db.collection('content_versions').insertOne({
        _id: scenarioVersionId,
        contentId: new ObjectId(),
        kind: 'scenario',
        revision: 1,
        payload: {
          title: 'Gửi hành lý',
          context: 'Tại khách sạn',
          objective: 'Gửi đồ trước giờ check-in',
          roleA: 'Khách',
          roleB: 'Lễ tân',
          questionVersionIds: qvIds,
          knowledgeVersionIds: [k1VersionId],
        },
        publishedAt: new Date(),
        publishedBy: adminId,
      });

      // Tạo 1 deck đã xuất bản
      publishedDeckId = new ObjectId();
      publishedDeckVersionId = new ObjectId();
      await db.collection('content_items').insertOne({
        _id: publishedDeckId,
        kind: 'deck',
        status: 'published',
        publishedVersionId: publishedDeckVersionId,
        level: 'N4',
        title: 'Khách sạn & Du lịch',
        latestRevision: 1,
        version: 1,
        createdBy: adminId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await db.collection('content_versions').insertOne({
        _id: publishedDeckVersionId,
        contentId: publishedDeckId,
        kind: 'deck',
        revision: 1,
        payload: {
          title: 'Khách sạn & Du lịch',
          topicKey: 'travel_hotel',
          level: 'N4',
          description:
            'Học cách giao tiếp cơ bản khi đi du lịch và ở khách sạn.',
          scenarioVersionIds: [scenarioVersionId],
          knowledgeVersionIds: [k1VersionId],
          questionVersionIds: qvIds,
        },
        publishedAt: new Date(),
        publishedBy: adminId,
      });

      // Gán phiên luyện tập của lượt thử cho guest với publishedDeckVersionId
      guestPracticeSessionId = new ObjectId();
      await db.collection('practice_sessions').deleteMany({});
      await db
        .collection('guest_sessions')
        .updateOne(
          { _id: guestSessionId },
          { $set: { practiceSessionId: guestPracticeSessionId } },
        );
      await db.collection('practice_sessions').insertOne({
        _id: guestPracticeSessionId,
        originKind: 'invite',
        originId: new ObjectId(),
        deckVersionId: publishedDeckVersionId,
        members: [
          { actorKey: `guest:${guestSessionId.toHexString()}` },
          { actorKey: `user:${learnerId.toHexString()}` },
        ],
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    it('GET /topics returns list of published decks without roles or answers (AC 2, 07 §1)', async () => {
      const learnerCookie = createAuthCookie(learnerId, learnerSessionId);

      const res = await request(app)
        .get('/api/v1/topics')
        .set('Cookie', learnerCookie);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('items');
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.items.length).toBe(1);

      const topic = res.body.data.items[0];
      expect(topic).toEqual({
        id: publishedDeckId.toHexString(),
        versionId: publishedDeckVersionId.toHexString(),
        title: 'Khách sạn & Du lịch',
        level: 'N4',
        description: 'Học cách giao tiếp cơ bản khi đi du lịch và ở khách sạn.',
      });
      // Đảm bảo tuyệt đối không có vai và kịch bản bí mật (AC 2)
      expect(topic).not.toHaveProperty('roleA');
      expect(topic).not.toHaveProperty('roleB');
      expect(topic).not.toHaveProperty('correctOptionId');
    });

    it('GET /topic-versions/:id enforces source permissions for Learner and Guest (07 §7)', async () => {
      const learnerCookie = createAuthCookie(learnerId, learnerSessionId);
      const guestCookie = `ck_guest=${RAW_GUEST_TOKEN}`;

      // 1. Learner đọc bản đang xuất bản công khai -> 200
      const resLearner = await request(app)
        .get(`/api/v1/topic-versions/${publishedDeckVersionId.toHexString()}`)
        .set('Cookie', learnerCookie);

      expect(resLearner.status).toBe(200);
      expect(resLearner.body.data).toEqual({
        id: publishedDeckVersionId.toHexString(),
        contentId: publishedDeckId.toHexString(),
        title: 'Khách sạn & Du lịch',
        level: 'N4',
        description: 'Học cách giao tiếp cơ bản khi đi du lịch và ở khách sạn.',
        knowledgeCount: 1,
        questionCount: 3,
      });
      expect(resLearner.body.data).not.toHaveProperty('roleA');

      // 2. Khách gửi cookie thật đọc bộ thuộc đúng lượt thử của mình -> 200
      const resGuest = await request(app)
        .get(`/api/v1/topic-versions/${publishedDeckVersionId.toHexString()}`)
        .set('Cookie', guestCookie);

      expect(resGuest.status).toBe(200);
      expect(resGuest.body.data.id).toBe(publishedDeckVersionId.toHexString());

      // 3. Khách cố tình đọc bộ chủ đề ngoài lượt thử -> 403 FORBIDDEN
      const otherDeckId = new ObjectId();
      const otherDeckVersionId = new ObjectId();
      await db.collection('content_items').insertOne({
        _id: otherDeckId,
        kind: 'deck',
        status: 'published',
        publishedVersionId: otherDeckVersionId,
        title: 'Chủ đề khác',
        level: 'N5',
        latestRevision: 1,
        version: 1,
        createdBy: adminId,
      });
      await db.collection('content_versions').insertOne({
        _id: otherDeckVersionId,
        contentId: otherDeckId,
        kind: 'deck',
        revision: 1,
        payload: {
          title: 'Chủ đề khác',
          topicKey: 'other',
          level: 'N5',
          description: 'Mô tả',
          knowledgeVersionIds: [],
          questionVersionIds: [],
        },
      });

      const resGuestForbidden = await request(app)
        .get(`/api/v1/topic-versions/${otherDeckVersionId.toHexString()}`)
        .set('Cookie', guestCookie);

      expect(resGuestForbidden.status).toBe(403);
      expect(resGuestForbidden.body.error.code).toBe('FORBIDDEN');

      // 4. Learner đọc một bộ chủ đề bị ẩn (status === 'hidden') khi chưa có nguồn -> 403 FORBIDDEN
      const hiddenDeckId = new ObjectId();
      const hiddenDeckVersionId = new ObjectId();
      await db.collection('content_items').insertOne({
        _id: hiddenDeckId,
        kind: 'deck',
        status: 'hidden',
        publishedVersionId: hiddenDeckVersionId,
        title: 'Bản bị ẩn',
        level: 'N3',
        latestRevision: 1,
        version: 1,
        createdBy: adminId,
      });
      await db.collection('content_versions').insertOne({
        _id: hiddenDeckVersionId,
        contentId: hiddenDeckId,
        kind: 'deck',
        revision: 1,
        payload: {
          title: 'Bản bị ẩn',
          topicKey: 'hidden_topic',
          level: 'N3',
          description: 'Ẩn',
          knowledgeVersionIds: [],
          questionVersionIds: [],
        },
      });

      const resLearnerForbidden = await request(app)
        .get(`/api/v1/topic-versions/${hiddenDeckVersionId.toHexString()}`)
        .set('Cookie', learnerCookie);

      expect(resLearnerForbidden.status).toBe(403);
      expect(resLearnerForbidden.body.error.code).toBe('FORBIDDEN');
    });

    it('GET /topic-versions/:id/knowledge returns knowledge items with envelope and cursor binding (07 §1, §7)', async () => {
      const learnerCookie = createAuthCookie(learnerId, learnerSessionId);
      const guestCookie = `ck_guest=${RAW_GUEST_TOKEN}`;

      // 1. Learner đọc danh sách kiến thức -> trả envelope data: { items, nextCursor }
      const res = await request(app)
        .get(
          `/api/v1/topic-versions/${publishedDeckVersionId.toHexString()}/knowledge`,
        )
        .set('Cookie', learnerCookie);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('items');
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.nextCursor).toBeNull();

      const k = res.body.data.items[0];
      expect(k).toEqual({
        id: k1ItemId.toHexString(),
        versionId: k1VersionId.toHexString(),
        type: 'vocabulary',
        expression: '荷物',
        reading: 'にもつ',
        meaning: 'Hành lý',
        examples: [
          { japanese: '荷物を預けます。', vietnamese: 'Tôi gửi hành lý.' },
        ],
      });
      expect(k).not.toHaveProperty('roleA');

      // 2. Guest đọc danh sách kiến thức thuộc phiên của mình -> 200
      const resGuest = await request(app)
        .get(
          `/api/v1/topic-versions/${publishedDeckVersionId.toHexString()}/knowledge`,
        )
        .set('Cookie', guestCookie);

      expect(resGuest.status).toBe(200);
      expect(resGuest.body.data.items).toHaveLength(1);

      // 3. Test cursor binding: Dùng cursor của deck A gửi sang deck B -> 400 INVALID_CURSOR
      const otherDeckId = new ObjectId();
      const otherDeckVersionId = new ObjectId();
      await db.collection('content_items').insertOne({
        _id: otherDeckId,
        kind: 'deck',
        status: 'published',
        publishedVersionId: otherDeckVersionId,
        title: 'Chủ đề 2',
        level: 'N4',
        latestRevision: 1,
        version: 1,
        createdBy: adminId,
      });
      await db.collection('content_versions').insertOne({
        _id: otherDeckVersionId,
        contentId: otherDeckId,
        kind: 'deck',
        revision: 1,
        payload: {
          title: 'Chủ đề 2',
          topicKey: 'topic_2',
          level: 'N4',
          description: 'Mô tả 2',
          knowledgeVersionIds: [k1VersionId],
          questionVersionIds: [],
        },
      });

      // Tạo cursor hợp lệ gắn với otherDeckVersionId
      const foreignCursor = Buffer.from(
        JSON.stringify({
          versionId: otherDeckVersionId.toHexString(),
          offset: 1,
        }),
      ).toString('base64url');

      const resInvalidCursor = await request(app)
        .get(
          `/api/v1/topic-versions/${publishedDeckVersionId.toHexString()}/knowledge?cursor=${foreignCursor}`,
        )
        .set('Cookie', learnerCookie);

      expect(resInvalidCursor.status).toBe(400);
      expect(resInvalidCursor.body.error.code).toBe('INVALID_CURSOR');

      // 4. Test cursor sai định dạng (offset âm) -> 400 INVALID_CURSOR
      const malformedCursor = Buffer.from(
        JSON.stringify({
          versionId: publishedDeckVersionId.toHexString(),
          offset: -5,
        }),
      ).toString('base64url');

      const resNegativeCursor = await request(app)
        .get(
          `/api/v1/topic-versions/${publishedDeckVersionId.toHexString()}/knowledge?cursor=${malformedCursor}`,
        )
        .set('Cookie', learnerCookie);

      expect(resNegativeCursor.status).toBe(400);
      expect(resNegativeCursor.body.error.code).toBe('INVALID_CURSOR');
    });

    it('GET /knowledge/:id enforces source permissions for historical revisions (07 §7, AC 3)', async () => {
      const learnerCookie = createAuthCookie(learnerId, learnerSessionId);
      const guestCookie = `ck_guest=${RAW_GUEST_TOKEN}`;

      // Tạo knowledge k2 hoàn toàn độc lập, chưa từng xuất hiện trong session nào của learner
      const k2ItemId = new ObjectId();
      const k2Version1Id = new ObjectId();
      const k2Version2Id = new ObjectId();
      await db.collection('content_items').insertOne({
        _id: k2ItemId,
        kind: 'knowledge',
        status: 'published',
        publishedVersionId: k2Version2Id,
        title: 'Căn phòng',
        latestRevision: 2,
        version: 2,
        createdBy: adminId,
      });
      await db.collection('content_versions').insertMany([
        {
          _id: k2Version1Id,
          contentId: k2ItemId,
          kind: 'knowledge',
          revision: 1,
          payload: {
            type: 'vocabulary',
            expression: '部屋',
            reading: 'へや',
            meaning: 'Căn phòng (bản cũ)',
            examples: [],
          },
        },
        {
          _id: k2Version2Id,
          contentId: k2ItemId,
          kind: 'knowledge',
          revision: 2,
          payload: {
            type: 'vocabulary',
            expression: '部屋',
            reading: 'へや',
            meaning: 'Căn phòng (bản mới nhất)',
            examples: [],
          },
        },
      ]);

      // 1. Không truyền versionId -> Trả về bản mới nhất (revision 2)
      const resLatest = await request(app)
        .get(`/api/v1/knowledge/${k2ItemId.toHexString()}`)
        .set('Cookie', learnerCookie);

      expect(resLatest.status).toBe(200);
      expect(resLatest.body.data.versionId).toBe(k2Version2Id.toHexString());
      expect(resLatest.body.data.meaning).toBe('Căn phòng (bản mới nhất)');

      // 2. Truyền versionId của revision 1 cũ KHI CHƯA CÓ NGUỒN -> 403 FORBIDDEN (07 §7)
      const resHistoricalNoSource = await request(app)
        .get(
          `/api/v1/knowledge/${k2ItemId.toHexString()}?versionId=${k2Version1Id.toHexString()}`,
        )
        .set('Cookie', learnerCookie);

      expect(resHistoricalNoSource.status).toBe(403);
      expect(resHistoricalNoSource.body.error.code).toBe('FORBIDDEN');

      // 3. Sau khi người học lưu mục kiến thức này (tạo nguồn saved_sources) -> Đọc được đúng bản lịch sử
      await db.collection('saved_sources').insertOne({
        _id: new ObjectId(),
        ownerKey: `user:${learnerId.toHexString()}`,
        knowledgeId: k2ItemId,
        knowledgeVersionId: k2Version1Id,
        deckVersionId: publishedDeckVersionId,
        contextKey: `deck:${publishedDeckVersionId.toHexString()}:${k2Version1Id.toHexString()}`,
        createdAt: new Date(),
      });

      const resHistoricalWithSource = await request(app)
        .get(
          `/api/v1/knowledge/${k2ItemId.toHexString()}?versionId=${k2Version1Id.toHexString()}`,
        )
        .set('Cookie', learnerCookie);

      expect(resHistoricalWithSource.status).toBe(200);
      expect(resHistoricalWithSource.body.data.versionId).toBe(
        k2Version1Id.toHexString(),
      );
      expect(resHistoricalWithSource.body.data.meaning).toBe(
        'Căn phòng (bản cũ)',
      );

      // 4. Khách đọc kiến thức ngoài lượt thử -> 403 FORBIDDEN
      const outsideKnowledgeId = new ObjectId();
      const outsideVersionId = new ObjectId();
      await db.collection('content_items').insertOne({
        _id: outsideKnowledgeId,
        kind: 'knowledge',
        status: 'published',
        publishedVersionId: outsideVersionId,
        title: 'Từ vựng ngoài lượt thử',
      });
      await db.collection('content_versions').insertOne({
        _id: outsideVersionId,
        contentId: outsideKnowledgeId,
        kind: 'knowledge',
        revision: 1,
        payload: {
          type: 'vocabulary',
          expression: '机',
          reading: 'つくえ',
          meaning: 'Cái bàn',
          examples: [],
        },
      });

      const resGuestOutside = await request(app)
        .get(`/api/v1/knowledge/${outsideKnowledgeId.toHexString()}`)
        .set('Cookie', guestCookie);

      expect(resGuestOutside.status).toBe(403);
      expect(resGuestOutside.body.error.code).toBe('FORBIDDEN');
    });
  });
});
