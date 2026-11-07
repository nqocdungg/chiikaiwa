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

// Mock test IDs
const adminId = new ObjectId();
const learnerId = new ObjectId();
const adminSessionId = new ObjectId();
const learnerSessionId = new ObjectId();

const RAW_GUEST_TOKEN = randomBytes(24).toString('hex');

// Sample published versions for reference tests
const validKnowledgeVersionId = new ObjectId();
const validQuestionVersionId = new ObjectId();
const validScenarioVersionId = new ObjectId();

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

async function getCsrfContext() {
  const res = await request(app).get('/api/v1/auth/csrf').expect(200);
  const csrfToken = res.body.data.csrfToken;
  const setCookie = res.headers['set-cookie'];
  const csrfCookie = Array.isArray(setCookie)
    ? setCookie.map((c) => c.split(';')[0]).join('; ')
    : String(setCookie ?? '').split(';')[0];
  return { csrfToken, csrfCookie };
}

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({
    binary: { version: '8.2.7' },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  vi.stubEnv('MONGODB_URI', replicaSet.getUri());
  vi.stubEnv('MONGODB_DB_NAME', 'chiikaiwa_content_admin_test');
  vi.stubEnv('APP_ORIGIN', TEST_ORIGIN);
  db = await connectDatabase();
  await applyDesignIndexes(db);
});

beforeEach(async () => {
  await Promise.all([
    db.collection('users').deleteMany({}),
    db.collection('auth_sessions').deleteMany({}),
    db.collection('guest_sessions').deleteMany({}),
    db.collection('content_items').deleteMany({}),
    db.collection('content_versions').deleteMany({}),
    db.collection('operation_receipts').deleteMany({}),
  ]);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 3600_000);

  // Seed Admin & Learner users
  await db.collection('users').insertMany([
    {
      _id: adminId,
      email: 'admin@chiikaiwa.test',
      emailKey: 'admin@chiikaiwa.test',
      role: 'admin',
      status: 'active',
      authVersion: 0,
    },
    {
      _id: learnerId,
      email: 'learner@chiikaiwa.test',
      emailKey: 'learner@chiikaiwa.test',
      role: 'learner',
      status: 'active',
      authVersion: 0,
    },
  ]);

  // Seed Sessions
  await db.collection('auth_sessions').insertMany([
    {
      _id: adminSessionId,
      userId: adminId,
      authVersion: 0,
      issuedAt: now,
      expiresAt,
      purgeAt: expiresAt,
    },
    {
      _id: learnerSessionId,
      userId: learnerId,
      authVersion: 0,
      issuedAt: now,
      expiresAt,
      purgeAt: expiresAt,
    },
  ]);

  // Seed valid guest session
  await db.collection('guest_sessions').insertOne({
    _id: new ObjectId(),
    credentialHash: hashGuestCredential(RAW_GUEST_TOKEN),
    status: 'active',
    version: 0,
    issuedAt: now,
    expiresAt,
    purgeAt: expiresAt,
  });

  // Seed sample immutable content_versions
  await db.collection('content_versions').insertMany([
    {
      _id: validKnowledgeVersionId,
      contentId: new ObjectId(),
      kind: 'knowledge',
      revision: 1,
      payload: {
        type: 'vocabulary',
        expression: 'ありがとう',
        meaning: 'Cảm ơn',
        examples: [
          {
            japanese: 'どうもありがとう。',
            vietnamese: 'Cảm ơn rất nhiều.',
          },
        ],
      },
      publishedAt: now,
      publishedBy: adminId,
    },
    {
      _id: validQuestionVersionId,
      contentId: new ObjectId(),
      kind: 'question',
      revision: 1,
      payload: {
        type: 'multipleChoice',
        prompt: 'Từ nào có nghĩa là cảm ơn?',
        explanation: 'Arigatou có nghĩa là cảm ơn',
        options: [
          { id: '1', text: 'ありがとう' },
          { id: '2', text: 'さようなら' },
        ],
        correctOptionId: '1',
        knowledgeVersionIds: [validKnowledgeVersionId.toHexString()],
      },
      publishedAt: now,
      publishedBy: adminId,
    },
    {
      _id: validScenarioVersionId,
      contentId: new ObjectId(),
      kind: 'scenario',
      revision: 1,
      payload: {
        title: 'Lời chào cơ bản',
        context: 'Gặp gỡ lần đầu',
        objective: 'Nói lời cảm ơn',
        roleA: 'Người hỏi đường',
        roleB: 'Người chỉ đường',
        hints: ['Nói cảm ơn sau khi được giúp'],
        knowledgeVersionIds: [validKnowledgeVersionId.toHexString()],
        questionVersionIds: [validQuestionVersionId.toHexString()],
      },
      publishedAt: now,
      publishedBy: adminId,
    },
  ]);
});

afterAll(async () => {
  await disconnectDatabase();
  await replicaSet?.stop();
  vi.unstubAllEnvs();
});

describe('BE-003: Admin Content Draft API', () => {
  describe('RBAC Guards (DoD 2: Learner/guest không soạn)', () => {
    it('returns 401 AUTH_REQUIRED when no session cookie is provided', async () => {
      await request(app).get('/api/v1/admin/content').expect(401);
    });

    it('returns 403 FORBIDDEN when accessed by learner', async () => {
      const learnerCookie = createAuthCookie(learnerId, learnerSessionId);
      await request(app)
        .get('/api/v1/admin/content')
        .set('Cookie', learnerCookie)
        .expect(403);

      const { csrfToken, csrfCookie } = await getCsrfContext();
      await request(app)
        .post('/api/v1/admin/content')
        .set('Origin', TEST_ORIGIN)
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', `${learnerCookie}; ${csrfCookie}`)
        .set('Idempotency-Key', randomUUID())
        .send({ kind: 'knowledge', draftPayload: {} })
        .expect(403);
    });

    it('returns 403 FORBIDDEN when accessed by guest', async () => {
      const guestCookie = `ck_guest=${RAW_GUEST_TOKEN}`;
      await request(app)
        .get('/api/v1/admin/content')
        .set('Cookie', guestCookie)
        .expect(403);
    });
  });

  describe('CRUD nháp học liệu và xác thực schema (DoD 1: Sai kind/ref bị từ chối)', () => {
    it('creates draft knowledge successfully with 201 and Location header', async () => {
      const adminCookie = createAuthCookie(adminId, adminSessionId);
      const { csrfToken, csrfCookie } = await getCsrfContext();

      const payload = {
        kind: 'knowledge',
        draftPayload: {
          type: 'vocabulary',
          expression: 'おはよう',
          reading: 'ohayou',
          meaning: 'Chào buổi sáng',
          examples: [
            {
              japanese: 'おはようございます。',
              vietnamese: 'Chào buổi sáng (lịch sự).',
            },
          ],
        },
      };

      const res = await request(app)
        .post('/api/v1/admin/content')
        .set('Origin', TEST_ORIGIN)
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', `${adminCookie}; ${csrfCookie}`)
        .set('Idempotency-Key', randomUUID())
        .send(payload)
        .expect(201);

      expect(res.headers.location).toMatch(
        /^\/api\/v1\/admin\/content\/[0-9a-f]{24}$/,
      );
      expect(res.body.data).toMatchObject({
        id: expect.stringMatching(/^[0-9a-f]{24}$/),
        kind: 'knowledge',
        status: 'draft',
        latestRevision: 0,
        version: 0,
        publishedVersionId: null,
        draftPayload: payload.draftPayload,
      });
      expect(res.body.data).toHaveProperty('createdAt');
      expect(res.body.data).toHaveProperty('updatedAt');
      expect(res.body.data).not.toHaveProperty('createdBy');
      expect(res.body.data).not.toHaveProperty('updatedBy');
    });

    it('creates draft deck and extracts level and title', async () => {
      const adminCookie = createAuthCookie(adminId, adminSessionId);
      const { csrfToken, csrfCookie } = await getCsrfContext();

      const payload = {
        kind: 'deck',
        draftPayload: {
          title: 'Bài học sơ cấp',
          topicKey: 'basics_01',
          level: 'N5',
          description: 'Học tiếng Nhật cơ bản',
          scenarioVersionIds: [validScenarioVersionId.toHexString()],
          knowledgeVersionIds: [validKnowledgeVersionId.toHexString()],
          questionVersionIds: [validQuestionVersionId.toHexString()],
        },
      };

      const res = await request(app)
        .post('/api/v1/admin/content')
        .set('Origin', TEST_ORIGIN)
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', `${adminCookie}; ${csrfCookie}`)
        .set('Idempotency-Key', randomUUID())
        .send(payload)
        .expect(201);

      expect(res.body.data).toMatchObject({
        kind: 'deck',
        status: 'draft',
        level: 'N5',
        title: 'Bài học sơ cấp',
        version: 0,
      });

      const dbDoc = await db
        .collection('content_items')
        .findOne({ _id: new ObjectId(res.body.data.id) });
      expect(dbDoc?.level).toBe('N5');
      expect(dbDoc?.title).toBe('Bài học sơ cấp');
    });

    it('rejects invalid kind with 422 VALIDATION_FAILED', async () => {
      const adminCookie = createAuthCookie(adminId, adminSessionId);
      const { csrfToken, csrfCookie } = await getCsrfContext();

      const res = await request(app)
        .post('/api/v1/admin/content')
        .set('Origin', TEST_ORIGIN)
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', `${adminCookie}; ${csrfCookie}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          kind: 'unsupported_kind',
          draftPayload: {},
        })
        .expect(422);

      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.details.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'kind',
            code: 'INVALID_ENUM',
          }),
        ]),
      );
    });

    it('rejects invalid reference with 422 VALIDATION_FAILED (non-existent versionId)', async () => {
      const adminCookie = createAuthCookie(adminId, adminSessionId);
      const { csrfToken, csrfCookie } = await getCsrfContext();
      const fakeVersionId = new ObjectId().toHexString();

      const res = await request(app)
        .post('/api/v1/admin/content')
        .set('Origin', TEST_ORIGIN)
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', `${adminCookie}; ${csrfCookie}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          kind: 'question',
          draftPayload: {
            type: 'multipleChoice',
            prompt: 'Câu hỏi mẫu?',
            explanation: 'Giải thích',
            options: [
              { id: '1', text: 'A' },
              { id: '2', text: 'B' },
            ],
            correctOptionId: '1',
            knowledgeVersionIds: [fakeVersionId],
          },
        })
        .expect(422);

      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.details.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'draftPayload.knowledgeVersionIds[0]',
            code: 'INVALID_REFERENCE',
          }),
        ]),
      );
    });

    it('rejects reference with wrong kind (e.g. questionVersionId pointing to a knowledge version)', async () => {
      const adminCookie = createAuthCookie(adminId, adminSessionId);
      const { csrfToken, csrfCookie } = await getCsrfContext();

      const res = await request(app)
        .post('/api/v1/admin/content')
        .set('Origin', TEST_ORIGIN)
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', `${adminCookie}; ${csrfCookie}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          kind: 'scenario',
          draftPayload: {
            title: 'Tình huống',
            context: 'Bối cảnh',
            objective: 'Mục tiêu',
            roleA: 'A',
            roleB: 'B',
            hints: ['Gợi ý'],
            questionVersionIds: [validKnowledgeVersionId.toHexString()],
          },
        })
        .expect(422);

      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.details.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'draftPayload.questionVersionIds[0]',
            code: 'INVALID_REFERENCE',
          }),
        ]),
      );
    });

    it('accepts uppercase hex versionId references in verifyDraftReferences', async () => {
      const adminCookie = createAuthCookie(adminId, adminSessionId);
      const { csrfToken, csrfCookie } = await getCsrfContext();
      const uppercaseKnowledgeVersionId = validKnowledgeVersionId
        .toHexString()
        .toUpperCase();

      const res = await request(app)
        .post('/api/v1/admin/content')
        .set('Origin', TEST_ORIGIN)
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', `${adminCookie}; ${csrfCookie}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          kind: 'question',
          draftPayload: {
            type: 'multipleChoice',
            prompt: 'Câu hỏi kiểm tra ID viết hoa?',
            explanation: 'Giải thích',
            options: [
              { id: '1', text: 'A' },
              { id: '2', text: 'B' },
            ],
            correctOptionId: '1',
            knowledgeVersionIds: [uppercaseKnowledgeVersionId],
          },
        })
        .expect(201);

      expect(res.body.data.id).toBeDefined();
    });
  });

  describe('PATCH draft, expectedVersion CAS và chặn đổi kind', () => {
    it('updates draft successfully with valid expectedVersion and increments version', async () => {
      const adminCookie = createAuthCookie(adminId, adminSessionId);
      const { csrfToken, csrfCookie } = await getCsrfContext();

      const createRes = await request(app)
        .post('/api/v1/admin/content')
        .set('Origin', TEST_ORIGIN)
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', `${adminCookie}; ${csrfCookie}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          kind: 'knowledge',
          draftPayload: {
            type: 'vocabulary',
            expression: 'さようなら',
            meaning: 'Tạm biệt',
            examples: [{ japanese: 'さようなら。', vietnamese: 'Tạm biệt.' }],
          },
        })
        .expect(201);

      const itemId = createRes.body.data.id;

      const patchRes = await request(app)
        .patch(`/api/v1/admin/content/${itemId}`)
        .set('Origin', TEST_ORIGIN)
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', `${adminCookie}; ${csrfCookie}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          expectedVersion: 0,
          draftPayload: {
            type: 'vocabulary',
            expression: 'さようなら',
            reading: 'sayounara',
            meaning: 'Tạm biệt (chào tạm biệt)',
            examples: [
              {
                japanese: '皆さん、さようなら。',
                vietnamese: 'Tạm biệt mọi người.',
              },
            ],
          },
        })
        .expect(200);

      expect(patchRes.body.data.version).toBe(1);
      expect(patchRes.body.data.draftPayload.reading).toBe('sayounara');
    });

    it('rejects PATCH with 409 VERSION_CONFLICT on stale expectedVersion', async () => {
      const adminCookie = createAuthCookie(adminId, adminSessionId);
      const { csrfToken, csrfCookie } = await getCsrfContext();

      const createRes = await request(app)
        .post('/api/v1/admin/content')
        .set('Origin', TEST_ORIGIN)
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', `${adminCookie}; ${csrfCookie}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          kind: 'knowledge',
          draftPayload: {
            type: 'vocabulary',
            expression: 'はい',
            meaning: 'Vâng',
            examples: [
              { japanese: 'はい、そうです。', vietnamese: 'Vâng, đúng vậy.' },
            ],
          },
        })
        .expect(201);

      const itemId = createRes.body.data.id;

      const conflictRes = await request(app)
        .patch(`/api/v1/admin/content/${itemId}`)
        .set('Origin', TEST_ORIGIN)
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', `${adminCookie}; ${csrfCookie}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          expectedVersion: 99,
          draftPayload: {
            type: 'vocabulary',
            expression: 'はい',
            meaning: 'Vâng (sửa)',
            examples: [{ japanese: 'はい。', vietnamese: 'Vâng.' }],
          },
        })
        .expect(409);

      expect(conflictRes.body.error.code).toBe('VERSION_CONFLICT');
      expect(conflictRes.body.error.details.currentVersion).toBe(0);
    });

    it('rejects attempt to mutate kind during PATCH with 422 VALIDATION_FAILED IMMUTABLE_FIELD', async () => {
      const adminCookie = createAuthCookie(adminId, adminSessionId);
      const { csrfToken, csrfCookie } = await getCsrfContext();

      const createRes = await request(app)
        .post('/api/v1/admin/content')
        .set('Origin', TEST_ORIGIN)
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', `${adminCookie}; ${csrfCookie}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          kind: 'knowledge',
          draftPayload: {
            type: 'vocabulary',
            expression: 'いいえ',
            meaning: 'Không',
            examples: [{ japanese: 'いいえ。', vietnamese: 'Không.' }],
          },
        })
        .expect(201);

      const itemId = createRes.body.data.id;

      const patchRes = await request(app)
        .patch(`/api/v1/admin/content/${itemId}`)
        .set('Origin', TEST_ORIGIN)
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', `${adminCookie}; ${csrfCookie}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          expectedVersion: 0,
          kind: 'scenario',
          draftPayload: {
            title: 'Tình huống mới',
            context: 'Context',
            objective: 'Objective',
            roleA: 'A',
            roleB: 'B',
            hints: ['Hint'],
          },
        })
        .expect(422);

      expect(patchRes.body.error.code).toBe('VALIDATION_FAILED');
      expect(patchRes.body.error.details.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'kind',
            code: 'IMMUTABLE_FIELD',
          }),
        ]),
      );
    });
  });

  describe('Bảo toàn tính bất biến của content_versions (DoD 3)', () => {
    it('proves content_versions collection is NEVER modified during draft creation or updates', async () => {
      const adminCookie = createAuthCookie(adminId, adminSessionId);
      const { csrfToken, csrfCookie } = await getCsrfContext();

      const initialVersions = await db
        .collection('content_versions')
        .find({})
        .toArray();
      const initialCount = initialVersions.length;
      expect(initialCount).toBe(3);

      const create1 = await request(app)
        .post('/api/v1/admin/content')
        .set('Origin', TEST_ORIGIN)
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', `${adminCookie}; ${csrfCookie}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          kind: 'knowledge',
          draftPayload: {
            type: 'vocabulary',
            expression: 'テスト',
            meaning: 'Kiểm thử',
            examples: [
              { japanese: 'テストを行う。', vietnamese: 'Tiến hành test.' },
            ],
          },
        })
        .expect(201);

      await request(app)
        .patch(`/api/v1/admin/content/${create1.body.data.id}`)
        .set('Origin', TEST_ORIGIN)
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', `${adminCookie}; ${csrfCookie}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          expectedVersion: 0,
          draftPayload: {
            type: 'vocabulary',
            expression: 'テスト２',
            meaning: 'Kiểm thử 2',
            examples: [
              { japanese: 'テストを行う。', vietnamese: 'Tiến hành test.' },
            ],
          },
        })
        .expect(200);

      const afterVersions = await db
        .collection('content_versions')
        .find({})
        .toArray();
      expect(afterVersions.length).toBe(initialCount);
      expect(afterVersions).toEqual(initialVersions);
    });
  });

  describe('Idempotency-Key enforcement & replay', () => {
    it('rejects POST with 422 and DOES NOT create document when Idempotency-Key is missing or blank', async () => {
      const adminCookie = createAuthCookie(adminId, adminSessionId);
      const { csrfToken, csrfCookie } = await getCsrfContext();
      const initialCount = await db
        .collection('content_items')
        .countDocuments();

      // Thiếu header Idempotency-Key
      const resMissing = await request(app)
        .post('/api/v1/admin/content')
        .set('Origin', TEST_ORIGIN)
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', `${adminCookie}; ${csrfCookie}`)
        .send({
          kind: 'knowledge',
          draftPayload: {
            type: 'vocabulary',
            expression: 'ねこ',
            meaning: 'Con mèo',
            examples: [{ japanese: 'ねこ。', vietnamese: 'Mèo.' }],
          },
        })
        .expect(422);

      expect(resMissing.body.error.code).toBe('VALIDATION_FAILED');
      expect(resMissing.body.error.details.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'Idempotency-Key',
            code: 'REQUIRED',
          }),
        ]),
      );

      // Header Idempotency-Key chỉ có khoảng trắng
      const resBlank = await request(app)
        .post('/api/v1/admin/content')
        .set('Origin', TEST_ORIGIN)
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', `${adminCookie}; ${csrfCookie}`)
        .set('Idempotency-Key', '   ')
        .send({
          kind: 'knowledge',
          draftPayload: {
            type: 'vocabulary',
            expression: 'ねこ',
            meaning: 'Con mèo',
            examples: [{ japanese: 'ねこ。', vietnamese: 'Mèo.' }],
          },
        })
        .expect(422);

      expect(resBlank.body.error.code).toBe('VALIDATION_FAILED');
      const finalCount = await db.collection('content_items').countDocuments();
      expect(finalCount).toBe(initialCount);
    });

    it('rejects PATCH with 422 and DOES NOT increment version when Idempotency-Key is missing or blank', async () => {
      const adminCookie = createAuthCookie(adminId, adminSessionId);
      const { csrfToken, csrfCookie } = await getCsrfContext();

      const createRes = await request(app)
        .post('/api/v1/admin/content')
        .set('Origin', TEST_ORIGIN)
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', `${adminCookie}; ${csrfCookie}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          kind: 'knowledge',
          draftPayload: {
            type: 'vocabulary',
            expression: 'いぬ',
            meaning: 'Con chó',
            examples: [{ japanese: 'いぬ。', vietnamese: 'Chó.' }],
          },
        })
        .expect(201);

      const itemId = createRes.body.data.id;

      // PATCH thiếu header Idempotency-Key
      const resMissing = await request(app)
        .patch(`/api/v1/admin/content/${itemId}`)
        .set('Origin', TEST_ORIGIN)
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', `${adminCookie}; ${csrfCookie}`)
        .send({
          expectedVersion: 0,
          draftPayload: {
            type: 'vocabulary',
            expression: 'いぬ (sửa)',
            meaning: 'Chó',
            examples: [{ japanese: 'いぬ。', vietnamese: 'Chó.' }],
          },
        })
        .expect(422);

      expect(resMissing.body.error.code).toBe('VALIDATION_FAILED');

      // PATCH header Idempotency-Key chỉ có khoảng trắng
      const resBlank = await request(app)
        .patch(`/api/v1/admin/content/${itemId}`)
        .set('Origin', TEST_ORIGIN)
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', `${adminCookie}; ${csrfCookie}`)
        .set('Idempotency-Key', '   ')
        .send({
          expectedVersion: 0,
          draftPayload: {
            type: 'vocabulary',
            expression: 'いぬ (sửa)',
            meaning: 'Chó',
            examples: [{ japanese: 'いぬ。', vietnamese: 'Chó.' }],
          },
        })
        .expect(422);

      expect(resBlank.body.error.code).toBe('VALIDATION_FAILED');

      const doc = await db
        .collection('content_items')
        .findOne({ _id: new ObjectId(itemId) });
      expect(doc?.version).toBe(0);
    });

    it('replays response on identical POST with same Idempotency-Key without duplicating documents', async () => {
      const adminCookie = createAuthCookie(adminId, adminSessionId);
      const { csrfToken, csrfCookie } = await getCsrfContext();

      const idempotencyKey = randomUUID();
      const body = {
        kind: 'knowledge',
        draftPayload: {
          type: 'vocabulary',
          expression: 'りんご',
          meaning: 'Quả táo',
          examples: [{ japanese: 'りんごを食べる。', vietnamese: 'Ăn táo.' }],
        },
      };

      const res1 = await request(app)
        .post('/api/v1/admin/content')
        .set('Origin', TEST_ORIGIN)
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', `${adminCookie}; ${csrfCookie}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(body)
        .expect(201);

      const count1 = await db.collection('content_items').countDocuments();
      expect(count1).toBe(1);

      const res2 = await request(app)
        .post('/api/v1/admin/content')
        .set('Origin', TEST_ORIGIN)
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', `${adminCookie}; ${csrfCookie}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(body)
        .expect(201);

      expect(res2.body.data.id).toBe(res1.body.data.id);
      const count2 = await db.collection('content_items').countDocuments();
      expect(count2).toBe(1);
    });

    it('rejects with 409 IDEMPOTENCY_CONFLICT when same key is used with different body', async () => {
      const adminCookie = createAuthCookie(adminId, adminSessionId);
      const { csrfToken, csrfCookie } = await getCsrfContext();

      const idempotencyKey = randomUUID();
      const body1 = {
        kind: 'knowledge',
        draftPayload: {
          type: 'vocabulary',
          expression: 'みかん',
          meaning: 'Quả quýt',
          examples: [{ japanese: 'みかん。', vietnamese: 'Quýt.' }],
        },
      };
      const body2 = {
        kind: 'knowledge',
        draftPayload: {
          type: 'vocabulary',
          expression: 'すいか',
          meaning: 'Dưa hấu',
          examples: [{ japanese: 'すいか。', vietnamese: 'Dưa hấu.' }],
        },
      };

      await request(app)
        .post('/api/v1/admin/content')
        .set('Origin', TEST_ORIGIN)
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', `${adminCookie}; ${csrfCookie}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(body1)
        .expect(201);

      const conflictRes = await request(app)
        .post('/api/v1/admin/content')
        .set('Origin', TEST_ORIGIN)
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', `${adminCookie}; ${csrfCookie}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(body2)
        .expect(409);

      expect(conflictRes.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    });
  });

  describe('GET list and Keyset Cursor Pagination', () => {
    it('filters items by kind and level, paginating with keyset cursor', async () => {
      const adminCookie = createAuthCookie(adminId, adminSessionId);

      const baseTime = new Date('2026-11-01T00:00:00.000Z').getTime();
      for (let i = 1; i <= 5; i++) {
        await db.collection('content_items').insertOne({
          _id: new ObjectId(),
          kind: 'deck',
          status: 'draft',
          level: i <= 3 ? 'N5' : 'N4',
          title: `Deck ${i}`,
          draftPayload: {
            title: `Deck ${i}`,
            topicKey: `topic_${i}`,
            level: i <= 3 ? 'N5' : 'N4',
            description: 'Desc',
          },
          latestRevision: 0,
          version: 0,
          createdBy: adminId,
          updatedBy: adminId,
          createdAt: new Date(baseTime + i * 1000),
          updatedAt: new Date(baseTime + i * 1000),
        });
      }

      const page1Res = await request(app)
        .get('/api/v1/admin/content?kind=deck&level=N5&limit=2')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(page1Res.body.data.items).toHaveLength(2);
      expect(page1Res.body.data.nextCursor).not.toBeNull();
      expect(page1Res.body.data.items[0].title).toBe('Deck 3');
      expect(page1Res.body.data.items[1].title).toBe('Deck 2');

      const cursor = page1Res.body.data.nextCursor;
      const page2Res = await request(app)
        .get(
          `/api/v1/admin/content?kind=deck&level=N5&limit=2&cursor=${cursor}`,
        )
        .set('Cookie', adminCookie)
        .expect(200);

      expect(page2Res.body.data.items).toHaveLength(1);
      expect(page2Res.body.data.items[0].title).toBe('Deck 1');
      expect(page2Res.body.data.nextCursor).toBeNull();
    });

    it('rejects with 400 INVALID_CURSOR when query filters change between pages', async () => {
      const adminCookie = createAuthCookie(adminId, adminSessionId);

      const baseTime = new Date('2026-11-01T00:00:00.000Z').getTime();
      for (let i = 1; i <= 3; i++) {
        await db.collection('content_items').insertOne({
          _id: new ObjectId(),
          kind: 'deck',
          status: 'draft',
          level: 'N5',
          title: `Deck ${i}`,
          draftPayload: {
            title: `Deck ${i}`,
            topicKey: `topic_${i}`,
            level: 'N5',
            description: 'Desc',
          },
          latestRevision: 0,
          version: 0,
          createdBy: adminId,
          updatedBy: adminId,
          createdAt: new Date(baseTime + i * 1000),
          updatedAt: new Date(baseTime + i * 1000),
        });
      }

      // Lấy cursor của deck
      const page1Res = await request(app)
        .get('/api/v1/admin/content?kind=deck&limit=1')
        .set('Cookie', adminCookie)
        .expect(200);

      const deckCursor = page1Res.body.data.nextCursor;
      expect(deckCursor).not.toBeNull();

      // Dùng cursor của deck cho query question -> phải bị 400 INVALID_CURSOR
      const resSwitch = await request(app)
        .get(`/api/v1/admin/content?kind=question&cursor=${deckCursor}`)
        .set('Cookie', adminCookie)
        .expect(400);

      expect(resSwitch.body.error.code).toBe('INVALID_CURSOR');
    });

    it('returns 400 INVALID_CURSOR when an invalid cursor string is sent', async () => {
      const adminCookie = createAuthCookie(adminId, adminSessionId);
      const res = await request(app)
        .get('/api/v1/admin/content?cursor=malformed_cursor_value')
        .set('Cookie', adminCookie)
        .expect(400);

      expect(res.body.error.code).toBe('INVALID_CURSOR');
    });
  });

  describe('GET detail by ID', () => {
    it('returns 200 with ContentItem DTO for existing item', async () => {
      const adminCookie = createAuthCookie(adminId, adminSessionId);
      const { csrfToken, csrfCookie } = await getCsrfContext();

      const createRes = await request(app)
        .post('/api/v1/admin/content')
        .set('Origin', TEST_ORIGIN)
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', `${adminCookie}; ${csrfCookie}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          kind: 'knowledge',
          draftPayload: {
            type: 'grammar',
            expression: '〜てください',
            meaning: 'Xin hãy làm gì đó',
            examples: [
              { japanese: '見てください。', vietnamese: 'Xin hãy nhìn.' },
            ],
          },
        })
        .expect(201);

      const itemId = createRes.body.data.id;
      const detailRes = await request(app)
        .get(`/api/v1/admin/content/${itemId}`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(detailRes.body.data.id).toBe(itemId);
      expect(detailRes.body.data.draftPayload.expression).toBe('〜てください');
    });

    it('returns 404 RESOURCE_NOT_FOUND when item does not exist', async () => {
      const adminCookie = createAuthCookie(adminId, adminSessionId);
      const fakeId = new ObjectId().toHexString();
      await request(app)
        .get(`/api/v1/admin/content/${fakeId}`)
        .set('Cookie', adminCookie)
        .expect(404);
    });
  });
});
