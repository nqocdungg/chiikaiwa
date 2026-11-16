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
import {
  connectDatabase,
  disconnectDatabase,
} from '../../server/persistence/database.js';
import { up as applyIndexes } from '../../server/persistence/migrations/20261103000100-add-design-indexes.js';
import {
  createFixtureJwt,
  FIXTURE_GUEST_IDS,
  FIXTURE_SESSION_IDS,
  FIXTURE_USER_IDS,
  RAW_GUEST_TOKENS,
} from '../fixtures/auth-fixtures.js';
import {
  assertSuccessEnvelope,
  buildCookieHeader,
  createTestIdempotencyKey,
  fetchCsrfContext,
} from '../helpers/contract-helpers.js';
import { seedContractFixtures } from '../helpers/db-test-helpers.js';

let revokeGuestBeforeRoute = false;

vi.mock('../../server/middleware/rate-limit.js', async (importOriginal) => {
  const actual = /** @type {any} */ (await importOriginal());
  return {
    ...actual,
    enforceWriteRateLimit: async (/** @type {any} */ params) => {
      const result = await actual.enforceWriteRateLimit(params);
      if (revokeGuestBeforeRoute) {
        revokeGuestBeforeRoute = false;
        if (db) {
          await db
            .collection('guest_sessions')
            .updateOne(
              { _id: new ObjectId(FIXTURE_GUEST_IDS.active) },
              { $set: { revokedAt: new Date() } },
            );
        }
      }
      return result;
    },
  };
});

const { ObjectId } = mongoose.Types;
const app = createApp();
const origin = 'http://127.0.0.1:5173';

/** @type {MongoMemoryReplSet} */
let replicaSet;
/** @type {import('mongoose').mongo.Db} */
let db;
/** @type {Awaited<ReturnType<typeof fetchCsrfContext>>} */
let csrf;

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({
    binary: { version: '8.2.7' },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  vi.stubEnv('MONGODB_URI', replicaSet.getUri());
  vi.stubEnv('MONGODB_DB_NAME', 'chiikaiwa_quiz_api_integration_test');
  vi.stubEnv('APP_ORIGIN', origin);
  db = await connectDatabase();
  await applyIndexes(db);
  csrf = await fetchCsrfContext(app);
});

afterAll(async () => {
  await disconnectDatabase();
  await replicaSet?.stop();
  vi.unstubAllEnvs();
});

/** @param {'learnerA'|'learnerB'|'admin'} [user] */
function account(user = 'learnerA') {
  return createFixtureJwt({
    sub: FIXTURE_USER_IDS[user],
    sid: FIXTURE_SESSION_IDS[user],
  });
}

/**
 * Helper gọi API quiz với cookie và CSRF token hợp lệ.
 *
 * @param {'get'|'post'} method
 * @param {string} endpoint
 * @param {{ user?: 'learnerA'|'learnerB'|'admin', guest?: boolean, guestExpired?: boolean, key?: string | null }} [options]
 */
function api(method, endpoint, options = {}) {
  const guestToken = options.guestExpired
    ? RAW_GUEST_TOKENS.expired
    : RAW_GUEST_TOKENS.active;

  const call = request(app)
    [method](endpoint)
    .set(
      'Cookie',
      buildCookieHeader({
        ...(options.guest || options.guestExpired
          ? { guestCookie: guestToken }
          : { authCookie: account(options.user) }),
        csrfCookie: csrf.csrfCookie,
      }),
    );
  if (method !== 'get') {
    call.set('Origin', origin).set('X-CSRF-Token', csrf.csrfToken);
    const key =
      options.key !== undefined ? options.key : createTestIdempotencyKey();
    if (key) {
      call.set('Idempotency-Key', key);
    }
  }
  return call;
}

describe('Quiz API Integration Tests (BE-018, AT-10, DB-T13, B1-B11)', () => {
  /** @type {import('mongoose').Types.ObjectId} */
  let deckVersionId;
  /** @type {import('mongoose').Types.ObjectId} */
  let deckContentId;
  /** @type {import('mongoose').Types.ObjectId} */
  let emptyDeckVersionId;
  /** @type {import('mongoose').Types.ObjectId} */
  let largeDeckVersionId;
  /** @type {import('mongoose').Types.ObjectId} */
  let q1VersionId;
  /** @type {import('mongoose').Types.ObjectId} */
  let q2VersionId;
  /** @type {import('mongoose').Types.ObjectId} */
  let q3VersionId;
  /** @type {import('mongoose').Types.ObjectId} */
  let sessionId;
  /** @type {import('mongoose').Types.ObjectId} */
  let guestTrialSessionId;

  beforeEach(async () => {
    revokeGuestBeforeRoute = false;
    await seedContractFixtures(db);

    // Dọn sạch collections liên quan trước mỗi test
    for (const name of [
      'quiz_attempts',
      'card_progress',
      'saved_items',
      'saved_sources',
      'operation_receipts',
    ]) {
      await db.collection(name).deleteMany({});
    }

    // Đảm bảo document statistics 'lifetime' được reset counter chắc chắn (B10.3)
    await db.collection('statistics').updateOne(
      { _id: /** @type {any} */ ('lifetime') },
      {
        $setOnInsert: {
          registeredAccounts: 0,
          startedSessions: 0,
          reviewCount: 0,
        },
        $set: {
          submittedQuizCount: 0,
        },
        $currentDate: { updatedAt: true },
      },
      { upsert: true },
    );

    // 1. Tạo câu hỏi multipleChoice hợp lệ
    q1VersionId = new ObjectId();
    await db.collection('content_versions').insertOne({
      _id: q1VersionId,
      contentId: new ObjectId(),
      kind: 'question',
      revision: 1,
      payload: {
        type: 'multipleChoice',
        prompt: 'Chọn câu chào đúng vào ban ngày:',
        options: [
          { id: 'opt_a', text: 'Konnichiwa' },
          { id: 'opt_b', text: 'Konbanwa' },
          { id: 'opt_c', text: 'Oyasumi' },
        ],
        correctOptionId: 'opt_a',
        explanation: 'Konnichiwa là chào buổi trưa/chiều.',
        knowledgeVersionIds: [new ObjectId()],
      },
      publishedAt: new Date(),
    });

    // 2. Tạo câu hỏi shortAnswer hợp lệ
    q2VersionId = new ObjectId();
    await db.collection('content_versions').insertOne({
      _id: q2VersionId,
      contentId: new ObjectId(),
      kind: 'question',
      revision: 1,
      payload: {
        type: 'shortAnswer',
        prompt: 'Điền thể Te của từ 食べる:',
        acceptedAnswers: ['たべて', '食べて'],
        explanation: 'Taberu là động từ nhóm 2, thể Te là tabete.',
        knowledgeVersionIds: [new ObjectId()],
      },
      publishedAt: new Date(),
    });

    // 3. Tạo câu hỏi shortAnswer thứ 2 hợp lệ
    q3VersionId = new ObjectId();
    await db.collection('content_versions').insertOne({
      _id: q3VersionId,
      contentId: new ObjectId(),
      kind: 'question',
      revision: 1,
      payload: {
        type: 'shortAnswer',
        prompt: 'Điền thể từ điển của từ きます (nhóm 3):',
        acceptedAnswers: ['くる', '来る'],
        explanation: 'Kimasu có dạng từ điển là kuru.',
        knowledgeVersionIds: [new ObjectId()],
      },
      publishedAt: new Date(),
    });

    // Tạo bộ deck chuẩn chứa 3 câu hỏi và content_item tương ứng (status: published)
    deckContentId = new ObjectId();
    deckVersionId = new ObjectId();
    await db.collection('content_items').insertOne({
      _id: deckContentId,
      kind: 'deck',
      status: 'published',
      publishedVersionId: deckVersionId,
      latestRevision: 1,
      version: 0,
    });
    await db.collection('content_versions').insertOne({
      _id: deckVersionId,
      contentId: deckContentId,
      kind: 'deck',
      revision: 1,
      payload: {
        title: 'Chủ đề giao tiếp cơ bản N5',
        topicKey: 'daily',
        level: 'N5',
        description: 'Bộ học giao tiếp N5',
        scenarioVersionIds: [],
        knowledgeVersionIds: [],
        questionVersionIds: [q1VersionId, q2VersionId, q3VersionId],
      },
      publishedAt: new Date(),
    });

    // Tạo bộ deck rỗng 0 câu hỏi
    const emptyDeckContentId = new ObjectId();
    emptyDeckVersionId = new ObjectId();
    await db.collection('content_items').insertOne({
      _id: emptyDeckContentId,
      kind: 'deck',
      status: 'published',
      publishedVersionId: emptyDeckVersionId,
      latestRevision: 1,
      version: 0,
    });
    await db.collection('content_versions').insertOne({
      _id: emptyDeckVersionId,
      contentId: emptyDeckContentId,
      kind: 'deck',
      revision: 1,
      payload: {
        title: 'Chủ đề rỗng',
        topicKey: 'empty',
        level: 'N5',
        description: 'Chưa có câu hỏi',
        questionVersionIds: [],
      },
      publishedAt: new Date(),
    });

    // Tạo 6 câu hỏi và bộ deck lớn (>5 câu, mỗi câu tối thiểu 2 options)
    const sixQuestionIds = [];
    for (let i = 0; i < 6; i++) {
      const qId = new ObjectId();
      sixQuestionIds.push(qId);
      await db.collection('content_versions').insertOne({
        _id: qId,
        contentId: new ObjectId(),
        kind: 'question',
        revision: 1,
        payload: {
          type: 'multipleChoice',
          prompt: `Câu hỏi số ${i + 1}`,
          options: [
            { id: 'opt_1', text: 'Đáp án 1' },
            { id: 'opt_2', text: 'Đáp án 2' },
          ],
          correctOptionId: 'opt_1',
          explanation: `Giải thích ${i + 1}`,
          knowledgeVersionIds: [],
        },
        publishedAt: new Date(),
      });
    }

    const largeDeckContentId = new ObjectId();
    largeDeckVersionId = new ObjectId();
    await db.collection('content_items').insertOne({
      _id: largeDeckContentId,
      kind: 'deck',
      status: 'published',
      publishedVersionId: largeDeckVersionId,
      latestRevision: 1,
      version: 0,
    });
    await db.collection('content_versions').insertOne({
      _id: largeDeckVersionId,
      contentId: largeDeckContentId,
      kind: 'deck',
      revision: 1,
      payload: {
        title: 'Bộ đề lớn >5 câu',
        topicKey: 'large',
        level: 'N4',
        questionVersionIds: sixQuestionIds,
      },
      publishedAt: new Date(),
    });

    // Tạo một phiên thực hành hợp lệ cho learnerA
    sessionId = new ObjectId();
    await db.collection('practice_sessions').insertOne({
      _id: sessionId,
      originKind: 'invitation',
      originId: new ObjectId(),
      roomName: 'learnerA-session',
      deckVersionId,
      status: 'ended',
      members: [
        { actorKey: `user:${FIXTURE_USER_IDS.learnerA}`, role: 'host' },
        { actorKey: `user:${FIXTURE_USER_IDS.learnerB}`, role: 'peer' },
      ],
      createdAt: new Date(),
    });

    // Tạo phiên thực hành cho khách (Guest trial) liên kết với deckVersionId
    guestTrialSessionId = new ObjectId();
    await db.collection('practice_sessions').insertOne({
      _id: guestTrialSessionId,
      originKind: 'guestTrial',
      originId: new ObjectId(),
      roomName: 'guest-trial-room',
      deckVersionId,
      status: 'active',
      members: [
        { actorKey: `guest:${FIXTURE_GUEST_IDS.active}`, role: 'peer' },
      ],
      createdAt: new Date(),
    });
    await db.collection('guest_sessions').updateOne(
      { _id: new ObjectId(FIXTURE_GUEST_IDS.active) },
      {
        $set: {
          practiceSessionId: guestTrialSessionId,
          status: 'active',
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      },
    );
  });

  describe('1. POST /api/v1/quizzes (Tạo lượt quiz & snapshot câu hỏi)', () => {
    it('tạo lượt quiz thành công với 3 câu hỏi từ deck (201 QuizPublic)', async () => {
      const response = await api('post', '/api/v1/quizzes')
        .send({ deckVersionId: deckVersionId.toHexString() })
        .expect(201);

      assertSuccessEnvelope(response, { expectedStatus: 201 });
      const data = response.body.data;
      expect(data).toHaveProperty('id');
      expect(response.headers.location).toBe(`/api/v1/quizzes/${data.id}`);
      expect(data.deckVersionId).toBe(deckVersionId.toHexString());
      expect(data.status).toBe('inProgress');
      expect(data.total).toBe(3);
      expect(data.version).toBe(0);
      expect(data.questions).toHaveLength(3);

      // Kiểm tra snapshot bảo mật: không lộ đáp án chuẩn hay giải thích
      for (const q of data.questions) {
        expect(q).not.toHaveProperty('correctOptionId');
        expect(q).not.toHaveProperty('acceptedAnswers');
        expect(q).not.toHaveProperty('explanation');
        expect(q).toHaveProperty('prompt');
        expect(q).toHaveProperty('type');
      }
    });

    it('tạo lượt tối đa 5 câu không trùng từ bộ đề có 6 câu (FR-QIZ-01, BR-21)', async () => {
      const response = await api('post', '/api/v1/quizzes')
        .send({ deckVersionId: largeDeckVersionId.toHexString() })
        .expect(201);

      const data = response.body.data;
      expect(data.total).toBe(5);
      expect(data.questions).toHaveLength(5);
      const uniqueIds = new Set(
        data.questions.map((/** @type {any} */ q) => q.questionVersionId),
      );
      expect(uniqueIds.size).toBe(5);
    });

    it('tạo lượt thành công khi liên kết với sourceSessionId hợp lệ', async () => {
      const response = await api('post', '/api/v1/quizzes')
        .send({
          deckVersionId: deckVersionId.toHexString(),
          sourceSessionId: sessionId.toHexString(),
        })
        .expect(201);

      expect(response.body.data.sourceSessionId).toBe(sessionId.toHexString());
    });

    it('từ chối 409 QUIZ_UNAVAILABLE khi ngân hàng rỗng và không tạo bản ghi (BR-21)', async () => {
      const response = await api('post', '/api/v1/quizzes')
        .send({ deckVersionId: emptyDeckVersionId.toHexString() })
        .expect(409);

      expect(response.body.error.code).toBe('QUIZ_UNAVAILABLE');
      const count = await db.collection('quiz_attempts').countDocuments();
      expect(count).toBe(0);
    });

    it('từ chối 404 RESOURCE_NOT_FOUND khi deckVersionId không tồn tại', async () => {
      const fakeDeckId = new ObjectId().toHexString();
      const response = await api('post', '/api/v1/quizzes')
        .send({ deckVersionId: fakeDeckId })
        .expect(404);

      expect(response.body.error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('từ chối 422 VALIDATION_FAILED khi body chứa trường lạ ngoài contract (B10.5)', async () => {
      const response = await api('post', '/api/v1/quizzes')
        .send({
          deckVersionId: deckVersionId.toHexString(),
          ownerKey: 'user:hacker',
        })
        .expect(422);

      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('loại bỏ câu hỏi không gradable và câu trùng contentId khỏi snapshot (B4)', async () => {
      const testDeckContentId = new ObjectId();
      const testDeckVersionId = new ObjectId();
      const sharedContentId = new ObjectId();

      // Câu v1 hợp lệ
      const qValidV1 = new ObjectId();
      await db.collection('content_versions').insertOne({
        _id: qValidV1,
        contentId: sharedContentId,
        kind: 'question',
        revision: 1,
        payload: {
          type: 'shortAnswer',
          prompt: 'Câu hợp lệ v1',
          acceptedAnswers: ['ok'],
          explanation: 'Giải thích đầy đủ',
        },
      });

      // Câu v2 của cùng sharedContentId (trùng contentId)
      const qValidV2 = new ObjectId();
      await db.collection('content_versions').insertOne({
        _id: qValidV2,
        contentId: sharedContentId,
        kind: 'question',
        revision: 2,
        payload: {
          type: 'shortAnswer',
          prompt: 'Câu hợp lệ v2',
          acceptedAnswers: ['ok2'],
          explanation: 'Giải thích v2',
        },
      });

      // Câu lỗi: thiếu explanation
      const qNoExp = new ObjectId();
      await db.collection('content_versions').insertOne({
        _id: qNoExp,
        contentId: new ObjectId(),
        kind: 'question',
        revision: 1,
        payload: {
          type: 'multipleChoice',
          prompt: 'Thiếu exp',
          options: [
            { id: '1', text: 'A' },
            { id: '2', text: 'B' },
          ],
          correctOptionId: '1',
          explanation: '',
        },
      });

      // Câu lỗi: MC có correctOptionId không thuộc options
      const qBadMc = new ObjectId();
      await db.collection('content_versions').insertOne({
        _id: qBadMc,
        contentId: new ObjectId(),
        kind: 'question',
        revision: 1,
        payload: {
          type: 'multipleChoice',
          prompt: 'Bad MC',
          options: [
            { id: '1', text: 'A' },
            { id: '2', text: 'B' },
          ],
          correctOptionId: '999',
          explanation: 'Exp',
        },
      });

      // Deck chứa 4 câu trên
      await db.collection('content_items').insertOne({
        _id: testDeckContentId,
        kind: 'deck',
        status: 'published',
        publishedVersionId: testDeckVersionId,
        latestRevision: 1,
        version: 0,
      });
      await db.collection('content_versions').insertOne({
        _id: testDeckVersionId,
        contentId: testDeckContentId,
        kind: 'deck',
        revision: 1,
        payload: {
          title: 'Test Filter Deck',
          questionVersionIds: [qValidV1, qValidV2, qNoExp, qBadMc],
        },
      });

      const res = await api('post', '/api/v1/quizzes')
        .send({ deckVersionId: testDeckVersionId.toHexString() })
        .expect(201);

      // Chỉ có 1 câu hợp lệ duy nhất được vào snapshot (câu thứ 2 cùng contentId và 2 câu lỗi bị loại)
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.questions).toHaveLength(1);
      expect(res.body.data.questions[0].questionVersionId).toBe(
        qValidV1.toHexString(),
      );

      // Ca thứ hai (C1): tạo deck khác với manifest [qValidV2, qValidV1] -> snapshot giữ V2
      const testDeckContentId2 = new ObjectId();
      const testDeckVersionId2 = new ObjectId();
      await db.collection('content_items').insertOne({
        _id: testDeckContentId2,
        kind: 'deck',
        status: 'published',
        publishedVersionId: testDeckVersionId2,
        latestRevision: 1,
        version: 0,
      });
      await db.collection('content_versions').insertOne({
        _id: testDeckVersionId2,
        contentId: testDeckContentId2,
        kind: 'deck',
        revision: 1,
        payload: {
          title: 'Test Filter Deck 2',
          questionVersionIds: [qValidV2, qValidV1, qNoExp, qBadMc],
        },
      });

      const res2 = await api('post', '/api/v1/quizzes')
        .send({ deckVersionId: testDeckVersionId2.toHexString() })
        .expect(201);

      expect(res2.body.data.total).toBe(1);
      expect(res2.body.data.questions).toHaveLength(1);
      expect(res2.body.data.questions[0].questionVersionId).toBe(
        qValidV2.toHexString(),
      );
    });

    it('từ chối 422 VALIDATION_FAILED khi sourceSessionId không khớp deckVersionId (C3)', async () => {
      const mismatchedSessionId = new ObjectId();
      await db.collection('practice_sessions').insertOne({
        _id: mismatchedSessionId,
        originKind: 'invitation',
        originId: new ObjectId(),
        roomName: 'mismatched-session',
        deckVersionId: largeDeckVersionId,
        status: 'ended',
        members: [
          { actorKey: `user:${FIXTURE_USER_IDS.learnerA}`, role: 'host' },
        ],
        createdAt: new Date(),
      });

      const countBefore = await db.collection('quiz_attempts').countDocuments();

      const res = await api('post', '/api/v1/quizzes')
        .send({
          deckVersionId: deckVersionId.toHexString(),
          sourceSessionId: mismatchedSessionId.toHexString(),
        })
        .expect(422);

      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.details.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'sourceSessionId',
            code: 'INVALID_FIELD',
          }),
        ]),
      );

      const countAfter = await db.collection('quiz_attempts').countDocuments();
      expect(countAfter).toBe(countBefore);
    });

    it('từ chối 422 VALIDATION_FAILED khi sourceSessionId chưa ở trạng thái ended', async () => {
      const activeSessionId = new ObjectId();
      await db.collection('practice_sessions').insertOne({
        _id: activeSessionId,
        originKind: 'invitation',
        originId: new ObjectId(),
        roomName: 'active-session',
        deckVersionId,
        status: 'active',
        members: [
          { actorKey: `user:${FIXTURE_USER_IDS.learnerA}`, role: 'host' },
        ],
        createdAt: new Date(),
      });

      const res = await api('post', '/api/v1/quizzes')
        .send({
          deckVersionId: deckVersionId.toHexString(),
          sourceSessionId: activeSessionId.toHexString(),
        })
        .expect(422);

      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.details.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'sourceSessionId',
            code: 'INVALID_FIELD',
          }),
        ]),
      );
    });

    it('từ chối 404 RESOURCE_NOT_FOUND khi deck đang ở trạng thái hidden và người học không có nguồn hợp lệ (B7)', async () => {
      const hiddenDeckContentId = new ObjectId();
      const hiddenDeckVersionId = new ObjectId();
      await db.collection('content_items').insertOne({
        _id: hiddenDeckContentId,
        kind: 'deck',
        status: 'hidden',
        publishedVersionId: hiddenDeckVersionId,
        latestRevision: 1,
        version: 0,
      });
      await db.collection('content_versions').insertOne({
        _id: hiddenDeckVersionId,
        contentId: hiddenDeckContentId,
        kind: 'deck',
        revision: 1,
        payload: {
          title: 'Deck đang ẩn',
          questionVersionIds: [q1VersionId],
        },
      });

      // LearnerA chưa có phiên thực hành hay saved_sources cho hidden deck này
      const res = await api('post', '/api/v1/quizzes')
        .send({ deckVersionId: hiddenDeckVersionId.toHexString() })
        .expect(404);

      expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('cho phép tạo quiz từ deck hidden khi có sourceSessionId hợp lệ mà người học tham gia (C6)', async () => {
      const hiddenDeckContentId = new ObjectId();
      const hiddenDeckVersionId = new ObjectId();
      await db.collection('content_items').insertOne({
        _id: hiddenDeckContentId,
        kind: 'deck',
        status: 'hidden',
        publishedVersionId: hiddenDeckVersionId,
        latestRevision: 1,
        version: 0,
      });
      await db.collection('content_versions').insertOne({
        _id: hiddenDeckVersionId,
        contentId: hiddenDeckContentId,
        kind: 'deck',
        revision: 1,
        payload: {
          title: 'Deck ẩn có phiên học',
          questionVersionIds: [q1VersionId],
        },
      });

      const memberSessionId = new ObjectId();
      await db.collection('practice_sessions').insertOne({
        _id: memberSessionId,
        originKind: 'invitation',
        originId: new ObjectId(),
        roomName: 'learnerA-hidden-session',
        deckVersionId: hiddenDeckVersionId,
        status: 'ended',
        members: [
          { actorKey: `user:${FIXTURE_USER_IDS.learnerA}`, role: 'host' },
        ],
        createdAt: new Date(),
      });

      const res = await api('post', '/api/v1/quizzes')
        .send({
          deckVersionId: hiddenDeckVersionId.toHexString(),
          sourceSessionId: memberSessionId.toHexString(),
        })
        .expect(201);

      assertSuccessEnvelope(res, { expectedStatus: 201 });
      expect(res.body.data.deckVersionId).toBe(
        hiddenDeckVersionId.toHexString(),
      );
      expect(res.body.data.sourceSessionId).toBe(memberSessionId.toHexString());
      expect(res.body.data.questions).toHaveLength(1);
    });

    it('từ chối 422 VALIDATION_FAILED khi thiếu Idempotency-Key trên POST /quizzes (Must fix 1)', async () => {
      const res = await api('post', '/api/v1/quizzes', { key: null })
        .send({ deckVersionId: deckVersionId.toHexString() })
        .expect(422);

      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('xử lý idempotency khi tạo quiz: cùng key trả cùng 201 và 1 receipt, khác body trả 409 IDEMPOTENCY_CONFLICT (Must fix 1)', async () => {
      const idemKey = createTestIdempotencyKey();
      const payloadA = { deckVersionId: deckVersionId.toHexString() };
      const payloadB = { deckVersionId: largeDeckVersionId.toHexString() };

      // 1. Tạo lần 1
      const res1 = await api('post', '/api/v1/quizzes', { key: idemKey })
        .send(payloadA)
        .expect(201);
      const quizId = res1.body.data.id;

      // 2. Replay cùng key và body -> 201 trả cùng kết quả
      const res2 = await api('post', '/api/v1/quizzes', { key: idemKey })
        .send(payloadA)
        .expect(201);
      expect(res2.body.data.id).toBe(quizId);

      // Kiểm tra DB chỉ có 1 attempt và 1 receipt
      const attemptsCount = await db
        .collection('quiz_attempts')
        .countDocuments({ _id: new ObjectId(quizId) });
      expect(attemptsCount).toBe(1);
      const receiptCount = await db
        .collection('operation_receipts')
        .countDocuments({ operationId: idemKey });
      expect(receiptCount).toBe(1);

      // 3. Cùng key khác body -> 409 IDEMPOTENCY_CONFLICT
      const res3 = await api('post', '/api/v1/quizzes', { key: idemKey })
        .send(payloadB)
        .expect(409);
      expect(res3.body.error.code).toBe('IDEMPOTENCY_CONFLICT');

      // 4. Replay sau khi quiz đã submit -> trả QuizResult
      await api('post', `/api/v1/quizzes/${quizId}/submission`)
        .send({ expectedVersion: 0, answers: [] })
        .expect(200);

      const resReplayAfterSubmit = await api('post', '/api/v1/quizzes', {
        key: idemKey,
      })
        .send(payloadA)
        .expect(201);
      expect(resReplayAfterSubmit.body.data.status).toBe('submitted');
      expect(resReplayAfterSubmit.body.data.id).toBe(quizId);
    });

    it('hai request tạo quiz đồng thời cùng key và body: cả hai 201, cùng ID (Must fix 1)', async () => {
      const idemKey = createTestIdempotencyKey();
      const payload = { deckVersionId: deckVersionId.toHexString() };

      const [resA, resB] = await Promise.all([
        api('post', '/api/v1/quizzes', { key: idemKey }).send(payload),
        api('post', '/api/v1/quizzes', { key: idemKey }).send(payload),
      ]);

      expect(resA.status).toBe(201);
      expect(resB.status).toBe(201);
      expect(resA.body.data.id).toBe(resB.body.data.id);

      // Kiểm tra DB chỉ tạo đúng 1 attempt và đúng 1 receipt
      const attemptsCount = await db
        .collection('quiz_attempts')
        .countDocuments({ ownerKey: `user:${FIXTURE_USER_IDS.learnerA}` });
      expect(attemptsCount).toBe(1);

      const receiptsCount = await db
        .collection('operation_receipts')
        .countDocuments({ operationId: idemKey });
      expect(receiptsCount).toBe(1);
    });
  });

  describe('2. GET /api/v1/quizzes/:id (Đọc projection theo trạng thái & B5 404)', () => {
    it('trả QuizPublic không lộ đáp án khi quiz đang inProgress', async () => {
      const createRes = await api('post', '/api/v1/quizzes').send({
        deckVersionId: deckVersionId.toHexString(),
      });
      const quizId = createRes.body.data.id;

      const getRes = await api('get', `/api/v1/quizzes/${quizId}`).expect(200);
      assertSuccessEnvelope(getRes);
      expect(getRes.body.data.status).toBe('inProgress');
      for (const q of getRes.body.data.questions) {
        expect(q).not.toHaveProperty('correctOptionId');
        expect(q).not.toHaveProperty('explanation');
      }
    });

    it('từ chối 404 RESOURCE_NOT_FOUND khi người dùng khác cố truy cập quiz của người khác (B5)', async () => {
      const createRes = await api('post', '/api/v1/quizzes', {
        user: 'learnerA',
      }).send({ deckVersionId: deckVersionId.toHexString() });
      const quizId = createRes.body.data.id;

      const getRes = await api('get', `/api/v1/quizzes/${quizId}`, {
        user: 'learnerB',
      }).expect(404);
      expect(getRes.body.error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('từ chối 400 MALFORMED_REQUEST khi id sai định dạng ObjectId (D1)', async () => {
      const getRes = await api('get', '/api/v1/quizzes/not-an-id').expect(400);
      expect(getRes.body.error.code).toBe('MALFORMED_REQUEST');
    });
  });

  describe('3. POST /api/v1/quizzes/:id/submission (Chấm, lưu kết quả & Idempotency)', () => {
    it('chấm theo snapshot cũ khi ngân hàng câu hỏi bị sửa sau khi tạo quiz (B10.1)', async () => {
      const createRes = await api('post', '/api/v1/quizzes').send({
        deckVersionId: deckVersionId.toHexString(),
      });
      const quizId = createRes.body.data.id;

      // Admin sửa ngân hàng sau khi quiz đã tạo: đổi correctOptionId từ opt_a sang opt_b
      await db.collection('content_versions').updateOne(
        { _id: q1VersionId },
        {
          $set: {
            'payload.correctOptionId': 'opt_b',
            'payload.explanation': 'Giải thích mới bị đổi',
          },
        },
      );

      // Nộp câu trả lời 'opt_a' (đáp án đúng theo snapshot ban đầu)
      const submitRes = await api(
        'post',
        `/api/v1/quizzes/${quizId}/submission`,
      )
        .send({
          expectedVersion: 0,
          answers: [
            { questionVersionId: q1VersionId.toHexString(), optionId: 'opt_a' },
          ],
        })
        .expect(200);

      // Điểm câu 1 vẫn phải là 1 (đúng theo snapshot), và giải thích giữ nguyên snapshot cũ
      const res1 = submitRes.body.data.results.find(
        (/** @type {any} */ r) =>
          r.questionVersionId === q1VersionId.toHexString(),
      );
      expect(res1.isCorrect).toBe(true);
      expect(res1.points).toBe(1);
      expect(res1.correctOptionId).toBe('opt_a');
      expect(res1.explanation).toBe('Konnichiwa là chào buổi trưa/chiều.');
    });

    it('cô lập hoàn toàn FSRS card_progress và saved_items khi nộp quiz (B10.2)', async () => {
      // Seed thật một document card_progress và saved_items của learnerA
      const cardProgressId = new ObjectId();
      await db.collection('card_progress').insertOne({
        _id: cardProgressId,
        ownerKey: `user:${FIXTURE_USER_IDS.learnerA}`,
        cardKey: 'knowledge:test',
        state: 1,
        stability: 2.5,
        difficulty: 4.0,
        due: new Date('2026-11-20T00:00:00.000Z'),
        version: 1,
        updatedAt: new Date('2026-11-15T00:00:00.000Z'),
      });

      const savedItemId = new ObjectId();
      await db.collection('saved_items').insertOne({
        _id: savedItemId,
        ownerKey: `user:${FIXTURE_USER_IDS.learnerA}`,
        knowledgeId: new ObjectId(),
        version: 1,
        updatedAt: new Date('2026-11-15T00:00:00.000Z'),
      });

      const beforeProgress = await db
        .collection('card_progress')
        .findOne({ _id: cardProgressId });
      const beforeSaved = await db
        .collection('saved_items')
        .findOne({ _id: savedItemId });

      const createRes = await api('post', '/api/v1/quizzes').send({
        deckVersionId: deckVersionId.toHexString(),
      });
      const quizId = createRes.body.data.id;

      await api('post', `/api/v1/quizzes/${quizId}/submission`)
        .send({
          expectedVersion: 0,
          answers: [
            { questionVersionId: q1VersionId.toHexString(), optionId: 'opt_a' },
          ],
        })
        .expect(200);

      const afterProgress = await db
        .collection('card_progress')
        .findOne({ _id: cardProgressId });
      const afterSaved = await db
        .collection('saved_items')
        .findOne({ _id: savedItemId });

      // So sánh toàn bộ document không bị sửa đổi
      expect(afterProgress).toEqual(beforeProgress);
      expect(afterSaved).toEqual(beforeSaved);
    });

    it('chấm điểm chính xác câu trắc nghiệm và điền ngắn, cập nhật submittedQuizCount (TX-10, BR-22, Must fix 2)', async () => {
      const createRes = await api('post', '/api/v1/quizzes').send({
        deckVersionId: deckVersionId.toHexString(),
      });
      const quizId = createRes.body.data.id;

      const submissionPayload = {
        expectedVersion: 0,
        answers: [
          { questionVersionId: q1VersionId.toHexString(), optionId: 'opt_a' },
          { questionVersionId: q2VersionId.toHexString(), text: '  たべて  ' },
        ],
      };

      const submitRes = await api(
        'post',
        `/api/v1/quizzes/${quizId}/submission`,
      )
        .send(submissionPayload)
        .expect(200);

      assertSuccessEnvelope(submitRes);
      const data = submitRes.body.data;
      expect(data.status).toBe('submitted');
      expect(data.score).toBe(2);
      expect(data.total).toBe(3);
      expect(data.version).toBe(1);
      expect(data.submittedAt).toBeDefined();
      expect(data.answers).toHaveLength(2);
      expect(data.results).toHaveLength(3);

      const res1 = data.results.find(
        (/** @type {any} */ r) =>
          r.questionVersionId === q1VersionId.toHexString(),
      );
      expect(res1.isCorrect).toBe(true);
      expect(res1.points).toBe(1);
      expect(res1.correctOptionId).toBe('opt_a');

      const res2 = data.results.find(
        (/** @type {any} */ r) =>
          r.questionVersionId === q2VersionId.toHexString(),
      );
      expect(res2.isCorrect).toBe(true);
      expect(res2.points).toBe(1);
      expect(res2.acceptedAnswers).toEqual(['たべて', '食べて']);

      const res3 = data.results.find(
        (/** @type {any} */ r) =>
          r.questionVersionId === q3VersionId.toHexString(),
      );
      expect(res3.isCorrect).toBe(false);
      expect(res3.points).toBe(0);

      // questions giữ nguyên cấu trúc sạch, không bị trộn kết quả chấm
      for (const q of data.questions) {
        expect(q).not.toHaveProperty('isCorrect');
        expect(q).not.toHaveProperty('points');
      }

      // GET /quizzes/:id trả kết quả khớp hoàn toàn với DTO nộp (Must fix 2)
      const getRes = await api('get', `/api/v1/quizzes/${quizId}`).expect(200);
      expect(getRes.body.data).toEqual(data);

      // Kiểm tra statistics submittedQuizCount tăng 1 (TX-10)
      const stats = await db
        .collection('statistics')
        .findOne({ _id: /** @type {any} */ ('lifetime') });
      expect(stats?.submittedQuizCount).toBe(1);
    });

    it('từ chối 422 VALIDATION_FAILED khi thiếu Idempotency-Key trên submission (Must fix 1)', async () => {
      const createRes = await api('post', '/api/v1/quizzes').send({
        deckVersionId: deckVersionId.toHexString(),
      });
      const quizId = createRes.body.data.id;

      const res = await api('post', `/api/v1/quizzes/${quizId}/submission`, {
        key: null,
      })
        .send({
          expectedVersion: 0,
          answers: [],
        })
        .expect(422);

      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('từ chối 409 VERSION_CONFLICT kèm details.currentVersion khi expectedVersion không khớp (Should fix)', async () => {
      const createRes = await api('post', '/api/v1/quizzes').send({
        deckVersionId: deckVersionId.toHexString(),
      });
      const quizId = createRes.body.data.id;

      const res = await api('post', `/api/v1/quizzes/${quizId}/submission`)
        .send({
          expectedVersion: 99,
          answers: [],
        })
        .expect(409);

      expect(res.body.error.code).toBe('VERSION_CONFLICT');
      expect(res.body.error.details).toEqual({ currentVersion: 0 });
    });

    it('từ chối 422 VALIDATION_FAILED khi expectedVersion bị ép kiểu hoặc không hợp lệ (B1)', async () => {
      const createRes = await api('post', '/api/v1/quizzes').send({
        deckVersionId: deckVersionId.toHexString(),
      });
      const quizId = createRes.body.data.id;

      for (const badVersion of [null, '', '0', true, -1, 1.5]) {
        const res = await api('post', `/api/v1/quizzes/${quizId}/submission`)
          .send({
            expectedVersion: badVersion,
            answers: [],
          })
          .expect(422);

        expect(res.body.error.code).toBe('VALIDATION_FAILED');
        expect(res.body.error.details.fields).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ path: 'expectedVersion' }),
          ]),
        );
      }

      // Đảm bảo attempt vẫn inProgress và counter = 0
      const attempt = await db
        .collection('quiz_attempts')
        .findOne({ _id: new ObjectId(quizId) });
      expect(attempt?.status).toBe('inProgress');
      const stats = await db
        .collection('statistics')
        .findOne({ _id: /** @type {any} */ ('lifetime') });
      expect(stats?.submittedQuizCount).toBe(0);
    });

    it('từ chối 422 VALIDATION_FAILED khi gửi sai loại đáp án, câu hỏi lạ, hoặc câu hỏi trùng (B2)', async () => {
      const createRes = await api('post', '/api/v1/quizzes').send({
        deckVersionId: deckVersionId.toHexString(),
      });
      const quizId = createRes.body.data.id;
      const alienId = new ObjectId().toHexString();

      // 1. MultipleChoice gửi kèm text
      const resMcText = await api(
        'post',
        `/api/v1/quizzes/${quizId}/submission`,
      )
        .send({
          expectedVersion: 0,
          answers: [
            {
              questionVersionId: q1VersionId.toHexString(),
              optionId: 'opt_a',
              text: 'Konnichiwa',
            },
          ],
        })
        .expect(422);
      expect(resMcText.body.error.code).toBe('VALIDATION_FAILED');

      // 2. ShortAnswer gửi kèm optionId
      const resSaOption = await api(
        'post',
        `/api/v1/quizzes/${quizId}/submission`,
      )
        .send({
          expectedVersion: 0,
          answers: [
            {
              questionVersionId: q2VersionId.toHexString(),
              optionId: 'opt_1',
              text: 'たべて',
            },
          ],
        })
        .expect(422);
      expect(resSaOption.body.error.code).toBe('VALIDATION_FAILED');

      // 3. MultipleChoice gửi optionId lạ không thuộc options
      const resBadOpt = await api(
        'post',
        `/api/v1/quizzes/${quizId}/submission`,
      )
        .send({
          expectedVersion: 0,
          answers: [
            {
              questionVersionId: q1VersionId.toHexString(),
              optionId: 'opt_unknown_999',
            },
          ],
        })
        .expect(422);
      expect(resBadOpt.body.error.code).toBe('VALIDATION_FAILED');

      // 4. Câu hỏi lạ
      const resAlien = await api('post', `/api/v1/quizzes/${quizId}/submission`)
        .send({
          expectedVersion: 0,
          answers: [{ questionVersionId: alienId, optionId: 'opt_a' }],
        })
        .expect(422);
      expect(resAlien.body.error.code).toBe('VALIDATION_FAILED');

      // 5. Câu hỏi trùng
      const resDup = await api('post', `/api/v1/quizzes/${quizId}/submission`)
        .send({
          expectedVersion: 0,
          answers: [
            { questionVersionId: q1VersionId.toHexString(), optionId: 'opt_a' },
            { questionVersionId: q1VersionId.toHexString(), optionId: 'opt_b' },
          ],
        })
        .expect(422);
      expect(resDup.body.error.code).toBe('VALIDATION_FAILED');

      // Kiểm tra attempt vẫn inProgress và counter không tăng
      const attempt = await db
        .collection('quiz_attempts')
        .findOne({ _id: new ObjectId(quizId) });
      expect(attempt?.status).toBe('inProgress');
      const stats = await db
        .collection('statistics')
        .findOne({ _id: /** @type {any} */ ('lifetime') });
      expect(stats?.submittedQuizCount).toBe(0);
    });

    it('từ chối 422 VALIDATION_FAILED khi vượt giới hạn độ dài đầu vào (B8)', async () => {
      const createRes = await api('post', '/api/v1/quizzes').send({
        deckVersionId: deckVersionId.toHexString(),
      });
      const quizId = createRes.body.data.id;

      // text > 500 ký tự
      const longText = 'a'.repeat(501);
      const resText = await api('post', `/api/v1/quizzes/${quizId}/submission`)
        .send({
          expectedVersion: 0,
          answers: [
            { questionVersionId: q2VersionId.toHexString(), text: longText },
          ],
        })
        .expect(422);
      expect(resText.body.error.code).toBe('VALIDATION_FAILED');

      // optionId > 64 ký tự
      const longOpt = 'o'.repeat(65);
      const resOpt = await api('post', `/api/v1/quizzes/${quizId}/submission`)
        .send({
          expectedVersion: 0,
          answers: [
            { questionVersionId: q1VersionId.toHexString(), optionId: longOpt },
          ],
        })
        .expect(422);
      expect(resOpt.body.error.code).toBe('VALIDATION_FAILED');

      // answers > 5 items
      const manyAnswers = Array.from({ length: 6 }, () => ({
        questionVersionId: q1VersionId.toHexString(),
        optionId: 'opt_a',
      }));
      const resMany = await api('post', `/api/v1/quizzes/${quizId}/submission`)
        .send({
          expectedVersion: 0,
          answers: manyAnswers,
        })
        .expect(422);
      expect(resMany.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('xử lý idempotency: cùng key khác payload trả 409 IDEMPOTENCY_CONFLICT, cùng payload khác key trả 200 (B3)', async () => {
      const createRes = await api('post', '/api/v1/quizzes').send({
        deckVersionId: deckVersionId.toHexString(),
      });
      const quizId = createRes.body.data.id;
      const key1 = createTestIdempotencyKey();
      const key2 = createTestIdempotencyKey();

      const payloadA = {
        expectedVersion: 0,
        answers: [
          { questionVersionId: q1VersionId.toHexString(), optionId: 'opt_a' },
        ],
      };
      const payloadB = {
        expectedVersion: 0,
        answers: [
          { questionVersionId: q1VersionId.toHexString(), optionId: 'opt_b' },
        ],
      };

      // 1. Nộp lần đầu với key1 và payloadA -> 200
      const res1 = await api('post', `/api/v1/quizzes/${quizId}/submission`, {
        key: key1,
      })
        .send(payloadA)
        .expect(200);

      // 2. Replay cùng payloadA với key2 khác -> 200 kết quả cũ, counter vẫn 1
      const resReplayDiffKey = await api(
        'post',
        `/api/v1/quizzes/${quizId}/submission`,
        { key: key2 },
      )
        .send(payloadA)
        .expect(200);
      expect(resReplayDiffKey.body.data.score).toBe(res1.body.data.score);

      // 3. Cùng key1 nhưng nộp payloadB khác -> 409 IDEMPOTENCY_CONFLICT
      const resIdemConflict = await api(
        'post',
        `/api/v1/quizzes/${quizId}/submission`,
        { key: key1 },
      )
        .send(payloadB)
        .expect(409);
      expect(resIdemConflict.body.error.code).toBe('IDEMPOTENCY_CONFLICT');

      // 4. Khác key và khác payload -> 409 QUIZ_ALREADY_SUBMITTED
      const resDiff = await api(
        'post',
        `/api/v1/quizzes/${quizId}/submission`,
        { key: key2 },
      )
        .send(payloadB)
        .expect(409);
      expect(resDiff.body.error.code).toBe('QUIZ_ALREADY_SUBMITTED');

      // Thống kê counter vẫn chỉ là 1
      const stats = await db
        .collection('statistics')
        .findOne({ _id: /** @type {any} */ ('lifetime') });
      expect(stats?.submittedQuizCount).toBe(1);
    });

    it('xử lý nộp song song: cùng payload cả hai 200 (counter 1); khác payload một 200 một 409 (B3)', async () => {
      // Test case 1: Hai request song song cùng payload
      const createRes1 = await api('post', '/api/v1/quizzes').send({
        deckVersionId: deckVersionId.toHexString(),
      });
      const quizId1 = createRes1.body.data.id;
      const samePayload = {
        expectedVersion: 0,
        answers: [
          { questionVersionId: q1VersionId.toHexString(), optionId: 'opt_a' },
        ],
      };

      const [resParallelA, resParallelB] = await Promise.all([
        api('post', `/api/v1/quizzes/${quizId1}/submission`).send(samePayload),
        api('post', `/api/v1/quizzes/${quizId1}/submission`).send(samePayload),
      ]);
      expect(resParallelA.status).toBe(200);
      expect(resParallelB.status).toBe(200);
      expect(resParallelA.body.data.score).toBe(resParallelB.body.data.score);

      const stats1 = await db
        .collection('statistics')
        .findOne({ _id: /** @type {any} */ ('lifetime') });
      expect(stats1?.submittedQuizCount).toBe(1);

      // Test case 2: Hai request song song khác payload
      const createRes2 = await api('post', '/api/v1/quizzes').send({
        deckVersionId: deckVersionId.toHexString(),
      });
      const quizId2 = createRes2.body.data.id;
      const payloadOptA = {
        expectedVersion: 0,
        answers: [
          { questionVersionId: q1VersionId.toHexString(), optionId: 'opt_a' },
        ],
      };
      const payloadOptB = {
        expectedVersion: 0,
        answers: [
          { questionVersionId: q1VersionId.toHexString(), optionId: 'opt_b' },
        ],
      };

      const [resDiffA, resDiffB] = await Promise.all([
        api('post', `/api/v1/quizzes/${quizId2}/submission`).send(payloadOptA),
        api('post', `/api/v1/quizzes/${quizId2}/submission`).send(payloadOptB),
      ]);

      const statuses = [resDiffA.status, resDiffB.status].sort();
      expect(statuses).toEqual([200, 409]);
      const conflictRes = resDiffA.status === 409 ? resDiffA : resDiffB;
      expect(conflictRes.body.error.code).toMatch(
        /QUIZ_ALREADY_SUBMITTED|VERSION_CONFLICT/,
      );

      const stats2 = await db
        .collection('statistics')
        .findOne({ _id: /** @type {any} */ ('lifetime') });
      expect(stats2?.submittedQuizCount).toBe(2);
    });

    it('từ chối 404 RESOURCE_NOT_FOUND khi người dùng khác submit quiz của người khác (B5)', async () => {
      const createRes = await api('post', '/api/v1/quizzes', {
        user: 'learnerA',
      }).send({ deckVersionId: deckVersionId.toHexString() });
      const quizId = createRes.body.data.id;

      const res = await api('post', `/api/v1/quizzes/${quizId}/submission`, {
        user: 'learnerB',
      })
        .send({
          expectedVersion: 0,
          answers: [],
        })
        .expect(404);

      expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');

      // Attempt vẫn inProgress và counter không đổi
      const attempt = await db
        .collection('quiz_attempts')
        .findOne({ _id: new ObjectId(quizId) });
      expect(attempt?.status).toBe('inProgress');
      const stats = await db
        .collection('statistics')
        .findOne({ _id: /** @type {any} */ ('lifetime') });
      expect(stats?.submittedQuizCount).toBe(0);
    });

    it('vẫn cho phép nộp và đọc kết quả khi deck bị ẩn sau thời điểm tạo quiz (B7)', async () => {
      const createRes = await api('post', '/api/v1/quizzes').send({
        deckVersionId: deckVersionId.toHexString(),
      });
      const quizId = createRes.body.data.id;

      // Ẩn deck sau khi quiz đã được tạo
      await db
        .collection('content_items')
        .updateOne({ _id: deckContentId }, { $set: { status: 'hidden' } });

      // Nộp bài vẫn thành công 200
      const submitRes = await api(
        'post',
        `/api/v1/quizzes/${quizId}/submission`,
      )
        .send({
          expectedVersion: 0,
          answers: [
            { questionVersionId: q1VersionId.toHexString(), optionId: 'opt_a' },
          ],
        })
        .expect(200);

      expect(submitRes.body.data.status).toBe('submitted');

      // GET đọc lại kết quả vẫn thành công 200
      const getRes = await api('get', `/api/v1/quizzes/${quizId}`).expect(200);
      expect(getRes.body.data.status).toBe('submitted');
    });

    it('cho phép làm lại quiz (retake): tạo attempt mới độc lập, giữ nguyên kết quả lượt cũ và không đổi FSRS (FR-QIZ-05, AT-10, BE-030)', async () => {
      // 1. Seed FSRS card_progress và saved_items của learnerA để kiểm tra tính độc lập
      const cardProgressId = new ObjectId();
      await db.collection('card_progress').insertOne({
        _id: cardProgressId,
        ownerKey: `user:${FIXTURE_USER_IDS.learnerA}`,
        state: 2,
        reps: 5,
      });
      const savedItemId = new ObjectId();
      await db.collection('saved_items').insertOne({
        _id: savedItemId,
        ownerKey: `user:${FIXTURE_USER_IDS.learnerA}`,
        status: 'active',
      });
      const beforeProgress = await db
        .collection('card_progress')
        .findOne({ _id: cardProgressId });
      const beforeSaved = await db
        .collection('saved_items')
        .findOne({ _id: savedItemId });

      // 2. Tạo lượt quiz đầu tiên và nộp bài
      const key1 = createTestIdempotencyKey();
      const createRes1 = await api('post', '/api/v1/quizzes', { key: key1 })
        .send({ deckVersionId: deckVersionId.toHexString() })
        .expect(201);
      const quizId1 = createRes1.body.data.id;

      const subKey1 = createTestIdempotencyKey();
      const submitRes1 = await api(
        'post',
        `/api/v1/quizzes/${quizId1}/submission`,
        { key: subKey1 },
      )
        .send({
          expectedVersion: 0,
          answers: [
            { questionVersionId: q1VersionId.toHexString(), optionId: 'opt_a' },
            { questionVersionId: q2VersionId.toHexString(), text: 'たべて' },
          ],
        })
        .expect(200);

      const quiz1Result = submitRes1.body.data;
      expect(quiz1Result.status).toBe('submitted');
      expect(quiz1Result.score).toBe(2);

      // 3. Người học làm lại quiz (retake): gọi POST /quizzes với Idempotency-Key mới
      const key2 = createTestIdempotencyKey();
      const createRes2 = await api('post', '/api/v1/quizzes', { key: key2 })
        .send({ deckVersionId: deckVersionId.toHexString() })
        .expect(201);
      const quizId2 = createRes2.body.data.id;

      // Xác nhận lượt 2 là một attempt mới hoàn toàn
      expect(quizId2).not.toBe(quizId1);
      expect(createRes2.body.data.status).toBe('inProgress');
      expect(createRes2.body.data.version).toBe(0);

      // 4. Kiểm tra lượt quiz 1 cũ vẫn giữ nguyên kết quả
      const getRes1 = await api('get', `/api/v1/quizzes/${quizId1}`).expect(
        200,
      );
      expect(getRes1.body.data).toEqual(quiz1Result);

      // 5. Kiểm tra GET /me/quizzes: hiển thị cả hai lượt (lượt 2 mới nhất xếp trước)
      const listRes = await api('get', '/api/v1/me/quizzes').expect(200);
      const items = listRes.body.data.items;
      expect(items.length).toBeGreaterThanOrEqual(2);
      expect(items[0].id).toBe(quizId2);
      expect(items[0].status).toBe('inProgress');
      expect(items[1].id).toBe(quizId1);
      expect(items[1].status).toBe('submitted');
      expect(items[1].score).toBe(2);

      // 6. Xác nhận FSRS card_progress và saved_items không hề bị thay đổi
      const afterProgress = await db
        .collection('card_progress')
        .findOne({ _id: cardProgressId });
      const afterSaved = await db
        .collection('saved_items')
        .findOne({ _id: savedItemId });
      expect(afterProgress).toEqual(beforeProgress);
      expect(afterSaved).toEqual(beforeSaved);
    });
  });

  describe('4. Quyền khách & Hạn dùng (Guest Trial - B6 & B10.6)', () => {
    it('khách hợp lệ tạo quiz với deck của lượt thử, nộp bài, replay và purgeAt được gán chuẩn (B6)', async () => {
      const resCreate = await api('post', '/api/v1/quizzes', { guest: true })
        .send({ deckVersionId: deckVersionId.toHexString() })
        .expect(201);

      const quizId = resCreate.body.data.id;

      // Kiểm tra purgeAt trong database khớp chính xác với hạn của guest (min(endedAt + 15m, expiresAt))
      const attemptDoc = await db
        .collection('quiz_attempts')
        .findOne({ _id: new ObjectId(quizId) });
      const guestDoc = await db
        .collection('guest_sessions')
        .findOne({ _id: new ObjectId(FIXTURE_GUEST_IDS.active) });
      const trialDoc = await db
        .collection('practice_sessions')
        .findOne({ _id: guestTrialSessionId });
      const expectedPurgeTime = Math.min(
        trialDoc?.endedAt
          ? trialDoc.endedAt.getTime() + 15 * 60 * 1000
          : Infinity,
        guestDoc?.expiresAt ? guestDoc.expiresAt.getTime() : Infinity,
      );
      expect(attemptDoc?.purgeAt?.getTime()).toBe(expectedPurgeTime);

      // Nộp bài
      const resSubmit = await api(
        'post',
        `/api/v1/quizzes/${quizId}/submission`,
        { guest: true },
      )
        .send({
          expectedVersion: 0,
          answers: [
            { questionVersionId: q1VersionId.toHexString(), optionId: 'opt_a' },
          ],
        })
        .expect(200);
      expect(resSubmit.body.data.status).toBe('submitted');

      // Replay
      const resReplay = await api(
        'post',
        `/api/v1/quizzes/${quizId}/submission`,
        { guest: true },
      )
        .send({
          expectedVersion: 0,
          answers: [
            { questionVersionId: q1VersionId.toHexString(), optionId: 'opt_a' },
          ],
        })
        .expect(200);
      expect(resReplay.body.data.score).toBe(resSubmit.body.data.score);
    });

    it('từ chối 404 RESOURCE_NOT_FOUND khi khách yêu cầu deck ngoài phạm vi lượt thử (B6)', async () => {
      const res = await api('post', '/api/v1/quizzes', { guest: true })
        .send({ deckVersionId: largeDeckVersionId.toHexString() })
        .expect(404);

      expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('từ chối 410 GUEST_EXPIRED trên toàn bộ endpoint khi khách đã hết hạn (B6)', async () => {
      // 1. POST /quizzes
      const resCreate = await api('post', '/api/v1/quizzes', {
        guestExpired: true,
      })
        .send({ deckVersionId: deckVersionId.toHexString() })
        .expect(410);
      expect(resCreate.body.error.code).toBe('GUEST_EXPIRED');

      // 2. GET /quizzes/:id
      const fakeId = new ObjectId().toHexString();
      const resGet = await api('get', `/api/v1/quizzes/${fakeId}`, {
        guestExpired: true,
      }).expect(410);
      expect(resGet.body.error.code).toBe('GUEST_EXPIRED');

      // 3. POST /quizzes/:id/submission
      const resSubmit = await api(
        'post',
        `/api/v1/quizzes/${fakeId}/submission`,
        { guestExpired: true },
      )
        .send({ expectedVersion: 0, answers: [] })
        .expect(410);
      expect(resSubmit.body.error.code).toBe('GUEST_EXPIRED');

      // 4. GET /me/quizzes
      const resList = await api('get', '/api/v1/me/quizzes', {
        guestExpired: true,
      }).expect(410);
      expect(resList.body.error.code).toBe('GUEST_EXPIRED');
    });

    it('từ chối 410 GUEST_EXPIRED và không tạo bản ghi/receipt khi khách bị thu hồi quyền giữa chừng lúc tạo lượt (Must fix 3)', async () => {
      revokeGuestBeforeRoute = true;

      const res = await api('post', '/api/v1/quizzes', { guest: true })
        .send({ deckVersionId: deckVersionId.toHexString() })
        .expect(410);

      expect(res.body.error.code).toBe('GUEST_EXPIRED');

      // Kiểm tra quiz_attempts không có bản ghi mới của khách
      const attemptsCount = await db
        .collection('quiz_attempts')
        .countDocuments({ ownerKey: `guest:${FIXTURE_GUEST_IDS.active}` });
      expect(attemptsCount).toBe(0);

      // Kiểm tra operation_receipts không có receipt nào của khách
      const receiptsCount = await db
        .collection('operation_receipts')
        .countDocuments({ actorKey: `guest:${FIXTURE_GUEST_IDS.active}` });
      expect(receiptsCount).toBe(0);
    });

    it('từ chối 410 GUEST_EXPIRED và không thay đổi trạng thái khi khách bị thu hồi quyền giữa chừng lúc nộp bài (Must fix 3)', async () => {
      // 1. Khách tạo quiz bình thường
      const createRes = await api('post', '/api/v1/quizzes', { guest: true })
        .send({ deckVersionId: deckVersionId.toHexString() })
        .expect(201);
      const quizId = createRes.body.data.id;

      // 2. Thu hồi khách giữa chừng lúc submit
      revokeGuestBeforeRoute = true;

      const resSubmit = await api(
        'post',
        `/api/v1/quizzes/${quizId}/submission`,
        { guest: true },
      )
        .send({
          expectedVersion: 0,
          answers: [
            { questionVersionId: q1VersionId.toHexString(), optionId: 'opt_a' },
          ],
        })
        .expect(410);

      expect(resSubmit.body.error.code).toBe('GUEST_EXPIRED');

      // 3. Kiểm tra DB: attempt vẫn inProgress, version vẫn là 0
      const attemptDoc = await db
        .collection('quiz_attempts')
        .findOne({ _id: new ObjectId(quizId) });
      expect(attemptDoc?.status).toBe('inProgress');
      expect(attemptDoc?.version).toBe(0);

      // 4. Thống kê submittedQuizCount không tăng
      const stats = await db
        .collection('statistics')
        .findOne({ _id: /** @type {any} */ ('lifetime') });
      expect(stats?.submittedQuizCount).toBe(0);
    });

    it('từ chối 410 GUEST_EXPIRED khi replay nộp bài nhưng phiên khách đã hết hạn (Item 2.3)', async () => {
      // 1. Tạo và nộp thành công khi khách còn hạn
      const createRes = await api('post', '/api/v1/quizzes', { guest: true })
        .send({ deckVersionId: deckVersionId.toHexString() })
        .expect(201);
      const quizId = createRes.body.data.id;

      await api('post', `/api/v1/quizzes/${quizId}/submission`, { guest: true })
        .send({
          expectedVersion: 0,
          answers: [
            { questionVersionId: q1VersionId.toHexString(), optionId: 'opt_a' },
          ],
        })
        .expect(200);

      // 2. Cố tình làm hết hạn guest trong DB
      await db
        .collection('guest_sessions')
        .updateOne(
          { _id: new ObjectId(FIXTURE_GUEST_IDS.active) },
          { $set: { expiresAt: new Date(Date.now() - 1000) } },
        );

      // 3. Replay nộp bài khi đã hết hạn -> phải nhận 410 GUEST_EXPIRED
      const resReplay = await api(
        'post',
        `/api/v1/quizzes/${quizId}/submission`,
        { guest: true },
      )
        .send({
          expectedVersion: 0,
          answers: [
            { questionVersionId: q1VersionId.toHexString(), optionId: 'opt_a' },
          ],
        })
        .expect(410);

      expect(resReplay.body.error.code).toBe('GUEST_EXPIRED');
    });
  });

  describe('5. GET /api/v1/me/quizzes (Lịch sử & Phân trang cursor)', () => {
    it('trả danh sách lịch sử quiz phân trang chính xác', async () => {
      // Tạo 3 lượt quiz
      for (let i = 0; i < 3; i++) {
        await api('post', '/api/v1/quizzes').send({
          deckVersionId: deckVersionId.toHexString(),
        });
      }

      // Đọc trang đầu limit 2
      const resPage1 = await api('get', '/api/v1/me/quizzes?limit=2').expect(
        200,
      );
      assertSuccessEnvelope(resPage1);
      const data1 = resPage1.body.data;
      expect(data1.items).toHaveLength(2);
      expect(data1.nextCursor).toBeDefined();

      // Đọc trang tiếp theo bằng cursor
      const resPage2 = await api(
        'get',
        `/api/v1/me/quizzes?limit=2&cursor=${encodeURIComponent(data1.nextCursor)}`,
      ).expect(200);
      const data2 = resPage2.body.data;
      expect(data2.items).toHaveLength(1);
      expect(data2.nextCursor).toBeNull();
    });

    it('lọc chính xác theo sourceSessionId', async () => {
      // 1 quiz độc lập
      await api('post', '/api/v1/quizzes').send({
        deckVersionId: deckVersionId.toHexString(),
      });

      // 1 quiz gắn với session
      await api('post', '/api/v1/quizzes').send({
        deckVersionId: deckVersionId.toHexString(),
        sourceSessionId: sessionId.toHexString(),
      });

      const resFiltered = await api(
        'get',
        `/api/v1/me/quizzes?sourceSessionId=${sessionId.toHexString()}`,
      ).expect(200);

      expect(resFiltered.body.data.items).toHaveLength(1);
      expect(resFiltered.body.data.items[0].sourceSessionId).toBe(
        sessionId.toHexString(),
      );
    });

    it('từ chối 400 INVALID_CURSOR khi cursor giải mã thất bại hoặc sai lệch context (Must fix 4)', async () => {
      // 1. Cursor chuỗi rác
      const resMalformed = await api(
        'get',
        '/api/v1/me/quizzes?cursor=abc',
      ).expect(400);
      expect(resMalformed.body.error.code).toBe('INVALID_CURSOR');

      // 2. Cursor sinh từ query có sourceSessionId nhưng dùng cho query không có sourceSessionId
      for (let i = 0; i < 2; i++) {
        await api('post', '/api/v1/quizzes').send({
          deckVersionId: deckVersionId.toHexString(),
          sourceSessionId: sessionId.toHexString(),
        });
      }
      const resWithFilter = await api(
        'get',
        `/api/v1/me/quizzes?sourceSessionId=${sessionId.toHexString()}&limit=1`,
      ).expect(200);
      const cursorWithContext = resWithFilter.body.data.nextCursor;
      expect(cursorWithContext).toBeDefined();

      // Dùng cursorWithContext nhưng không truyền sourceSessionId -> context mismatch -> 400
      const resMismatch = await api(
        'get',
        `/api/v1/me/quizzes?cursor=${encodeURIComponent(cursorWithContext)}`,
      ).expect(400);
      expect(resMismatch.body.error.code).toBe('INVALID_CURSOR');
    });

    it('chấp nhận limit tối đa 50 và từ chối 422 VALIDATION_FAILED khi limit < 1 hoặc > 50 (Should fix 5)', async () => {
      // limit = 50 hợp lệ
      await api('get', '/api/v1/me/quizzes?limit=50').expect(200);

      // limit = 51 vượt ngưỡng
      const resOver = await api('get', '/api/v1/me/quizzes?limit=51').expect(
        422,
      );
      expect(resOver.body.error.code).toBe('VALIDATION_FAILED');
      expect(resOver.body.error.details.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: 'limit', code: 'INVALID_FIELD' }),
        ]),
      );

      // limit = 0 dưới ngưỡng
      const resZero = await api('get', '/api/v1/me/quizzes?limit=0').expect(
        422,
      );
      expect(resZero.body.error.code).toBe('VALIDATION_FAILED');
      expect(resZero.body.error.details.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: 'limit', code: 'INVALID_FIELD' }),
        ]),
      );
    });

    it('từ chối 422 VALIDATION_FAILED khi truyền query parameter không được phép', async () => {
      const res = await api(
        'get',
        '/api/v1/me/quizzes?unexpectedParam=123',
      ).expect(422);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.details.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'unexpectedParam',
            code: 'UNKNOWN_FIELD',
          }),
        ]),
      );
    });

    it('từ chối 400 MALFORMED_REQUEST khi sourceSessionId sai định dạng ObjectId (D1)', async () => {
      const res = await api(
        'get',
        '/api/v1/me/quizzes?sourceSessionId=not-an-id',
      ).expect(400);
      expect(res.body.error.code).toBe('MALFORMED_REQUEST');
    });
  });
});
