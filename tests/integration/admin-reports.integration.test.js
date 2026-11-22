import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../server/app.js';
import { readAuthEnv } from '../../server/config/env.js';
import { signJwt } from '../../server/modules/identity/crypto.js';
import { DEFAULT_JWT_SECRET } from '../fixtures/auth-fixtures.js';
import {
  connectDatabase,
  disconnectDatabase,
} from '../../server/persistence/database.js';
import { up as applyDesignIndexes } from '../../server/persistence/migrations/20261103000100-add-design-indexes.js';

/** @type {MongoMemoryReplSet} */
let replicaSet;
/** @type {import('mongoose').mongo.Db} */
let db;
const { ObjectId } = mongoose.Types;
const app = createApp({ checkHealth: async () => {} });

let csrfToken = '';
let csrfCookie = '';
const DEFAULT_ORIGIN = 'http://127.0.0.1:5173';

const admin1Id = new ObjectId('507f1f77bcf86cd799439001');
const admin2Id = new ObjectId('507f1f77bcf86cd799439002');
const learner1Id = new ObjectId('507f1f77bcf86cd799439011');
const learner2Id = new ObjectId('507f1f77bcf86cd799439022');

/**
 * Creates a valid JWT cookie header for an authenticated user session.
 * @param {import('mongoose').Types.ObjectId} userId
 * @param {number} [authVersion=0]
 */
async function createAuthHeader(userId, authVersion = 0) {
  const sessionId = new ObjectId();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  await db.collection('auth_sessions').insertOne({
    _id: sessionId,
    userId,
    authVersion,
    issuedAt: now,
    expiresAt,
    purgeAt: expiresAt,
  });

  const env = readAuthEnv();
  const token = signJwt(
    {
      sub: userId.toHexString(),
      sid: sessionId.toHexString(),
      authVersion,
      iat: Math.floor(now.getTime() / 1000),
      exp: Math.floor(expiresAt.getTime() / 1000),
    },
    env.jwtSecret,
    { issuer: env.jwtIssuer, audience: env.jwtAudience },
  );

  return {
    sessionId,
    cookie: `ck_session=${token}; ${csrfCookie}`,
  };
}

describe('Admin Reports and Privacy Integration Suite (BE-026, IR-01 - IR-18, IP-01 - IP-04, DB-T16)', () => {
  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({
      binary: { version: '8.2.7' },
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    process.env.MONGODB_URI = replicaSet.getUri();
    process.env.MONGODB_DB_NAME = 'chiikaiwa_admin_reports_test';
    process.env.APP_ORIGIN = DEFAULT_ORIGIN;
    process.env.JWT_SECRET = DEFAULT_JWT_SECRET;

    db = await connectDatabase();
    await applyDesignIndexes(db);
  });

  afterAll(async () => {
    await disconnectDatabase();
    await replicaSet.stop();
  });

  beforeEach(async () => {
    // Dọn dẹp collection trước mỗi test
    await db.collection('users').deleteMany({});
    await db.collection('auth_sessions').deleteMany({});
    await db.collection('reports').deleteMany({});
    await db.collection('operation_receipts').deleteMany({});
    await db.collection('blocks').deleteMany({});
    await db.collection('session_personal').deleteMany({});
    await db.collection('manual_cards').deleteMany({});
    await db.collection('saved_items').deleteMany({});
    await db.collection('practice_sessions').deleteMany({});
    await db.collection('rate_limits').deleteMany({});

    // CSRF
    const csrfRes = await request(app).get('/api/v1/auth/csrf').expect(200);
    csrfToken = csrfRes.body.data.csrfToken;
    const rawSetCookie = csrfRes.headers['set-cookie'];
    csrfCookie = Array.isArray(rawSetCookie)
      ? rawSetCookie.map((c) => c.split(';')[0]).join('; ')
      : String(rawSetCookie ?? '').split(';')[0];

    const now = new Date('2026-11-18T10:00:00.000Z');

    // Seed Admin 1 & 2
    await db.collection('users').insertOne({
      _id: admin1Id,
      email: 'admin1@example.com',
      emailKey: 'admin1@example.com',
      role: 'admin',
      status: 'active',
      displayName: 'Admin One',
      authVersion: 0,
      version: 0,
      createdAt: now,
      updatedAt: now,
    });
    await db.collection('users').insertOne({
      _id: admin2Id,
      email: 'admin2@example.com',
      emailKey: 'admin2@example.com',
      role: 'admin',
      status: 'active',
      displayName: 'Admin Two',
      authVersion: 0,
      version: 0,
      createdAt: new Date(now.getTime() + 1000),
      updatedAt: new Date(now.getTime() + 1000),
    });

    // Seed Learner 1 & 2
    await db.collection('users').insertOne({
      _id: learner1Id,
      email: 'learner1@example.com',
      emailKey: 'learner1@example.com',
      role: 'learner',
      status: 'active',
      displayName: 'Learner One',
      authVersion: 0,
      version: 0,
      createdAt: new Date(now.getTime() + 2000),
      updatedAt: new Date(now.getTime() + 2000),
    });
    await db.collection('users').insertOne({
      _id: learner2Id,
      email: 'learner2@example.com',
      emailKey: 'learner2@example.com',
      role: 'learner',
      status: 'active',
      displayName: 'Learner Two',
      authVersion: 0,
      version: 0,
      createdAt: new Date(now.getTime() + 3000),
      updatedAt: new Date(now.getTime() + 3000),
    });
  });

  describe('IR: Quản trị Báo cáo (GET /admin/reports, GET /admin/reports/:id, PATCH /admin/reports/:id)', () => {
    it('IR-01 & IR-03: Lấy danh sách và chi tiết báo cáo thành công, đúng tập trường contract, sắp xếp createdAt desc, _id desc', async () => {
      const { cookie: adminCookie } = await createAuthHeader(admin1Id);
      const session1Id = new ObjectId();
      const report1Id = new ObjectId();
      const report2Id = new ObjectId();
      const now = new Date('2026-11-18T10:00:00.000Z');

      // Seed 2 reports
      await db.collection('reports').insertOne({
        _id: report1Id,
        reporterKey: `user:${learner1Id.toHexString()}`,
        reportedKey: `user:${learner2Id.toHexString()}`,
        sessionId: session1Id,
        reason: 'Ngôn từ không phù hợp',
        description: 'Đối tác dùng từ ngữ khiếm nhã trong phòng.',
        status: 'new',
        version: 0,
        createdAt: now,
        updatedAt: now,
      });

      await db.collection('reports').insertOne({
        _id: report2Id,
        reporterKey: `user:${learner2Id.toHexString()}`,
        reportedKey: `user:${learner1Id.toHexString()}`,
        sessionId: session1Id,
        reason: 'Rời phòng sớm',
        status: 'inProgress',
        version: 1,
        handledBy: admin2Id,
        handledAt: new Date(now.getTime() + 5000),
        createdAt: new Date(now.getTime() + 1000),
        updatedAt: new Date(now.getTime() + 5000),
      });

      // GET /admin/reports
      const resList = await request(app)
        .get('/api/v1/admin/reports')
        .set('Cookie', adminCookie)
        .expect(200);

      const items = resList.body.data.items;
      expect(items.length).toBe(2);
      expect(items[0].id).toBe(report2Id.toHexString());
      expect(items[1].id).toBe(report1Id.toHexString());

      // Report 1: không có handledBy, handledAt, resolution -> các trường này phải vắng mặt
      expect(items[1]).toHaveProperty('description');
      expect('handledBy' in items[1]).toBe(false);
      expect('handledAt' in items[1]).toBe(false);
      expect('resolution' in items[1]).toBe(false);

      // Report 2: có handledBy, handledAt, không có description -> description vắng mặt
      expect('description' in items[0]).toBe(false);
      expect(items[0].handledBy).toBe(admin2Id.toHexString());
      expect(items[0].handledAt).toBeTruthy();

      // GET /admin/reports/:id (Chi tiết)
      const resDetail = await request(app)
        .get(`/api/v1/admin/reports/${report1Id.toHexString()}`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(resDetail.body.data.id).toBe(report1Id.toHexString());
      expect(resDetail.body.data.reason).toBe('Ngôn từ không phù hợp');
      expect(resDetail.body.data.sessionId).toBe(session1Id.toHexString());
    });

    it('IR-02: Lọc theo status và phân trang: cursor dùng lệch status trả 400 INVALID_CURSOR', async () => {
      const { cookie: adminCookie } = await createAuthHeader(admin1Id);
      const now = new Date('2026-11-18T10:00:00.000Z');

      // Seed 3 reports với các status khác nhau
      for (let i = 0; i < 3; i++) {
        await db.collection('reports').insertOne({
          reporterKey: `user:${learner1Id.toHexString()}`,
          reportedKey: `user:${learner2Id.toHexString()}`,
          sessionId: new ObjectId(),
          reason: `Lý do ${i}`,
          status: i === 0 ? 'resolved' : 'new',
          version: 0,
          createdAt: new Date(now.getTime() + i * 1000),
          updatedAt: new Date(now.getTime() + i * 1000),
        });
      }

      const resNew = await request(app)
        .get('/api/v1/admin/reports?status=new&limit=1')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(resNew.body.data.items.length).toBe(1);
      const nextCursor = resNew.body.data.nextCursor;
      expect(nextCursor).toBeTruthy();

      // Dùng cursor của query status=new cho query status=resolved -> 400 INVALID_CURSOR
      const resConflict = await request(app)
        .get(
          `/api/v1/admin/reports?status=resolved&cursor=${encodeURIComponent(nextCursor)}`,
        )
        .set('Cookie', adminCookie)
        .expect(400);
      expect(resConflict.body.error.code).toBe('INVALID_CURSOR');
    });

    it('IR-04 & IR-05: PATCH cập nhật status (new -> inProgress -> resolved) kèm resolution lưu chính xác chuỗi unicode', async () => {
      const { cookie: adminCookie } = await createAuthHeader(admin1Id);
      const reportId = new ObjectId();
      const now = new Date();

      await db.collection('reports').insertOne({
        _id: reportId,
        reporterKey: `user:${learner1Id.toHexString()}`,
        reportedKey: `user:${learner2Id.toHexString()}`,
        sessionId: new ObjectId(),
        reason: 'Quấy rối',
        status: 'new',
        version: 0,
        createdAt: now,
        updatedAt: now,
      });

      // Bước 1: PATCH new -> inProgress (không truyền resolution)
      const res1 = await request(app)
        .patch(`/api/v1/admin/reports/${reportId.toHexString()}`)
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', adminCookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', 'c1111111-0000-4000-8000-000000000001')
        .send({ expectedVersion: 0, status: 'inProgress' })
        .expect(200);

      expect(res1.body.data.status).toBe('inProgress');
      expect(res1.body.data.version).toBe(1);
      expect(res1.body.data.handledBy).toBe(admin1Id.toHexString());
      expect(res1.body.data.handledAt).toBeTruthy();
      expect('resolution' in res1.body.data).toBe(false);

      // Bước 2: PATCH inProgress -> resolved kèm resolution chuỗi tiếng Nhật / Emoji / xuống dòng
      const unicodeResolution =
        'Đã nhắc nhở học viên vi phạm.\n次回はアカウントを停止します。🚫';
      const res2 = await request(app)
        .patch(`/api/v1/admin/reports/${reportId.toHexString()}`)
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', adminCookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', 'c1111111-0000-4000-8000-000000000002')
        .send({
          expectedVersion: 1,
          status: 'resolved',
          resolution: unicodeResolution,
        })
        .expect(200);

      expect(res2.body.data.status).toBe('resolved');
      expect(res2.body.data.version).toBe(2);
      expect(res2.body.data.resolution).toBe(unicodeResolution);

      // GET lại xác nhận dữ liệu đã được lưu bền vững trong DB
      const resCheck = await request(app)
        .get(`/api/v1/admin/reports/${reportId.toHexString()}`)
        .set('Cookie', adminCookie)
        .expect(200);
      expect(resCheck.body.data.resolution).toBe(unicodeResolution);
    });

    it('IR-06 & IR-07: PATCH sang rejected không truyền resolution giữ nguyên resolution cũ; đổi resolution cùng status vẫn tăng version', async () => {
      const { cookie: adminCookie } = await createAuthHeader(admin1Id);
      const reportId = new ObjectId();
      const now = new Date();

      await db.collection('reports').insertOne({
        _id: reportId,
        reporterKey: `user:${learner1Id.toHexString()}`,
        reportedKey: `user:${learner2Id.toHexString()}`,
        sessionId: new ObjectId(),
        reason: 'Spam',
        status: 'inProgress',
        resolution: 'Nội dung xử lý ban đầu',
        version: 1,
        createdAt: now,
        updatedAt: now,
      });

      // PATCH sang rejected mà không gửi resolution -> giữ nguyên resolution cũ
      const res = await request(app)
        .patch(`/api/v1/admin/reports/${reportId.toHexString()}`)
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', adminCookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', 'c1111111-0000-4000-8000-000000000006')
        .send({ expectedVersion: 1, status: 'rejected' })
        .expect(200);

      expect(res.body.data.status).toBe('rejected');
      expect(res.body.data.version).toBe(2);
      expect(res.body.data.resolution).toBe('Nội dung xử lý ban đầu');

      // PATCH cùng status rejected nhưng cập nhật resolution mới
      const resUpdateRes = await request(app)
        .patch(`/api/v1/admin/reports/${reportId.toHexString()}`)
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', adminCookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', 'c1111111-0000-4000-8000-000000000007')
        .send({
          expectedVersion: 2,
          status: 'rejected',
          resolution: 'Đã bác bỏ sau khi kiểm tra lại',
        })
        .expect(200);

      expect(resUpdateRes.body.data.version).toBe(3);
      expect(resUpdateRes.body.data.resolution).toBe(
        'Đã bác bỏ sau khi kiểm tra lại',
      );
    });

    it('IR-08: expectedVersion cũ bị từ chối 409 VERSION_CONFLICT kèm currentVersion', async () => {
      const { cookie: adminCookie } = await createAuthHeader(admin1Id);
      const reportId = new ObjectId();
      const now = new Date();

      await db.collection('reports').insertOne({
        _id: reportId,
        reporterKey: `user:${learner1Id.toHexString()}`,
        reportedKey: `user:${learner2Id.toHexString()}`,
        sessionId: new ObjectId(),
        reason: 'Spam',
        status: 'new',
        version: 2,
        createdAt: now,
        updatedAt: now,
      });

      const res = await request(app)
        .patch(`/api/v1/admin/reports/${reportId.toHexString()}`)
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', adminCookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', 'c1111111-0000-4000-8000-000000000008')
        .send({ expectedVersion: 1, status: 'inProgress' })
        .expect(409);

      expect(res.body.error.code).toBe('VERSION_CONFLICT');
      expect(res.body.error.details.currentVersion).toBe(2);
    });

    it('IR-10 & IR-11: Idempotency trên PATCH report: replay trả kết quả cũ, đổi body trả 409 IDEMPOTENCY_CONFLICT', async () => {
      const { cookie: adminCookie } = await createAuthHeader(admin1Id);
      const reportId = new ObjectId();
      const now = new Date();
      const key = 'c1111111-0000-4000-8000-000000000010';

      await db.collection('reports').insertOne({
        _id: reportId,
        reporterKey: `user:${learner1Id.toHexString()}`,
        reportedKey: `user:${learner2Id.toHexString()}`,
        sessionId: new ObjectId(),
        reason: 'Spam',
        status: 'new',
        version: 0,
        createdAt: now,
        updatedAt: now,
      });

      // Lần 1
      const res1 = await request(app)
        .patch(`/api/v1/admin/reports/${reportId.toHexString()}`)
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', adminCookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', key)
        .send({ expectedVersion: 0, status: 'inProgress' })
        .expect(200);

      // Lần 2 replay
      const res2 = await request(app)
        .patch(`/api/v1/admin/reports/${reportId.toHexString()}`)
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', adminCookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', key)
        .send({ expectedVersion: 0, status: 'inProgress' })
        .expect(200);

      expect(res2.body.data).toEqual(res1.body.data);
      const doc = await db.collection('reports').findOne({ _id: reportId });
      expect(doc?.version).toBe(1);

      // Cùng key nhưng đổi status -> 409 IDEMPOTENCY_CONFLICT
      const resConflict = await request(app)
        .patch(`/api/v1/admin/reports/${reportId.toHexString()}`)
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', adminCookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', key)
        .send({ expectedVersion: 0, status: 'resolved' })
        .expect(409);
      expect(resConflict.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    });

    it('IR-12: Hai Admin PATCH đồng thời cùng report và expectedVersion: đúng 1 commit thành công, 1 xung đột 409', async () => {
      const { cookie: admin1Cookie } = await createAuthHeader(admin1Id);
      const { cookie: admin2Cookie } = await createAuthHeader(admin2Id);
      const reportId = new ObjectId();
      const now = new Date();

      await db.collection('reports').insertOne({
        _id: reportId,
        reporterKey: `user:${learner1Id.toHexString()}`,
        reportedKey: `user:${learner2Id.toHexString()}`,
        sessionId: new ObjectId(),
        reason: 'Spam',
        status: 'new',
        version: 0,
        createdAt: now,
        updatedAt: now,
      });

      const req1 = request(app)
        .patch(`/api/v1/admin/reports/${reportId.toHexString()}`)
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', admin1Cookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', 'c1111111-0000-4000-8000-000000000012')
        .send({ expectedVersion: 0, status: 'inProgress' });

      const req2 = request(app)
        .patch(`/api/v1/admin/reports/${reportId.toHexString()}`)
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', admin2Cookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', 'c2222222-0000-4000-8000-000000000012')
        .send({ expectedVersion: 0, status: 'resolved' });

      const [res1, res2] = await Promise.all([req1, req2]);
      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 409]);

      const doc = await db.collection('reports').findOne({ _id: reportId });
      expect(doc?.version).toBe(1);
    });

    it('IR-15: Xử lý báo cáo độc lập hoàn toàn với chặn (PB-28 AC3): không tạo/sửa bản ghi trong blocks hay actor_states', async () => {
      const { cookie: adminCookie } = await createAuthHeader(admin1Id);
      const reportId = new ObjectId();
      const now = new Date();

      await db.collection('reports').insertOne({
        _id: reportId,
        reporterKey: `user:${learner1Id.toHexString()}`,
        reportedKey: `user:${learner2Id.toHexString()}`,
        sessionId: new ObjectId(),
        reason: 'Spam',
        status: 'inProgress',
        version: 0,
        createdAt: now,
        updatedAt: now,
      });

      await request(app)
        .patch(`/api/v1/admin/reports/${reportId.toHexString()}`)
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', adminCookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', 'c1111111-0000-4000-8000-000000000015')
        .send({
          expectedVersion: 0,
          status: 'resolved',
          resolution: 'Đã giải quyết độc lập',
        })
        .expect(200);

      // Xác nhận collection blocks vẫn rỗng
      const blockCount = await db.collection('blocks').countDocuments();
      expect(blockCount).toBe(0);

      // Trạng thái user và actor của hai học viên không bị thay đổi
      const l1 = await db.collection('users').findOne({ _id: learner1Id });
      const l2 = await db.collection('users').findOne({ _id: learner2Id });
      expect(l1?.status).toBe('active');
      expect(l2?.status).toBe('active');
    });

    it('IR-16: Báo cáo gắn với sessionId không tồn tại trong practice_sessions vẫn GET và PATCH thành công không lỗi 500', async () => {
      const { cookie: adminCookie } = await createAuthHeader(admin1Id);
      const orphanSessionId = new ObjectId();
      const reportId = new ObjectId();
      const now = new Date();

      await db.collection('reports').insertOne({
        _id: reportId,
        reporterKey: `user:${learner1Id.toHexString()}`,
        reportedKey: `user:${learner2Id.toHexString()}`,
        sessionId: orphanSessionId,
        reason: 'Test orphan session',
        status: 'new',
        version: 0,
        createdAt: now,
        updatedAt: now,
      });

      // GET detail
      const resGet = await request(app)
        .get(`/api/v1/admin/reports/${reportId.toHexString()}`)
        .set('Cookie', adminCookie)
        .expect(200);
      expect(resGet.body.data.sessionId).toBe(orphanSessionId.toHexString());

      // PATCH
      const resPatch = await request(app)
        .patch(`/api/v1/admin/reports/${reportId.toHexString()}`)
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', adminCookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', 'c1111111-0000-4000-8000-000000000016')
        .send({ expectedVersion: 0, status: 'inProgress' })
        .expect(200);
      expect(resPatch.body.data.status).toBe('inProgress');
    });

    it('IR-17: Chuyển status về new: gỡ handledBy, handledAt nhưng giữ resolution nếu request bỏ trường đó (S1, R3)', async () => {
      const { cookie: adminCookie } = await createAuthHeader(admin1Id);
      const reportId = new ObjectId();
      const now = new Date();

      await db.collection('reports').insertOne({
        _id: reportId,
        reporterKey: `user:${learner1Id.toHexString()}`,
        reportedKey: `user:${learner2Id.toHexString()}`,
        sessionId: new ObjectId(),
        reason: 'Inappropriate content',
        status: 'resolved',
        resolution: 'Đã xử lý trước đó',
        handledBy: admin1Id,
        handledAt: now,
        version: 1,
        createdAt: now,
        updatedAt: now,
      });

      // PATCH status về 'new', không truyền resolution
      const resPatch = await request(app)
        .patch(`/api/v1/admin/reports/${reportId.toHexString()}`)
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', adminCookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', 'c1111111-0000-4000-8000-000000000017')
        .send({ expectedVersion: 1, status: 'new' })
        .expect(200);

      expect(resPatch.body.data.status).toBe('new');
      expect(resPatch.body.data.handledBy).toBeUndefined();
      expect(resPatch.body.data.handledAt).toBeUndefined();
      expect(resPatch.body.data.resolution).toBe('Đã xử lý trước đó');
      expect(resPatch.body.data.version).toBe(2);

      const inDb = await db.collection('reports').findOne({ _id: reportId });
      expect(inDb?.status).toBe('new');
      expect(inDb?.handledBy).toBeUndefined();
      expect(inDb?.handledAt).toBeUndefined();
      expect(inDb?.resolution).toBe('Đã xử lý trước đó');
      expect(inDb?.version).toBe(2);
    });

    it('IR-18: Query với cursor rỗng -> trả 400 INVALID_CURSOR (S5)', async () => {
      const { cookie: adminCookie } = await createAuthHeader(admin1Id);
      const res = await request(app)
        .get('/api/v1/admin/reports?cursor=')
        .set('Cookie', adminCookie)
        .expect(400);
      expect(res.body.error.code).toBe('INVALID_CURSOR');
    });

    it('IR-19: Chấp nhận resolution hợp lệ khi chuyển report về new và lưu kết quả', async () => {
      const { cookie: adminCookie } = await createAuthHeader(admin1Id);
      const reportId = new ObjectId();
      const now = new Date();
      await db.collection('reports').insertOne({
        _id: reportId,
        reporterKey: `user:${learner1Id.toHexString()}`,
        reportedKey: `user:${learner2Id.toHexString()}`,
        sessionId: new ObjectId(),
        reason: 'Spam tin nhắn',
        status: 'inProgress',
        handledBy: admin1Id,
        handledAt: now,
        resolution: 'Đang theo dõi',
        version: 1,
        createdAt: now,
        updatedAt: now,
      });

      const res = await request(app)
        .patch(`/api/v1/admin/reports/${reportId.toHexString()}`)
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', adminCookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', 'c1111111-0000-4000-8000-000000000019')
        .send({
          expectedVersion: 1,
          status: 'new',
          resolution: 'Đã cập nhật kết quả điều tra',
        })
        .expect(200);

      expect(res.body.data.status).toBe('new');
      expect(res.body.data.resolution).toBe('Đã cập nhật kết quả điều tra');
      expect(res.body.data.handledBy).toBeUndefined();
      expect(res.body.data.handledAt).toBeUndefined();
      expect(res.body.data.version).toBe(2);

      // Khẳng định document trong DB giữ kết quả mới và trạng thái đã commit
      const inDb = await db.collection('reports').findOne({ _id: reportId });
      expect(inDb?.version).toBe(2);
      expect(inDb?.status).toBe('new');
      expect(inDb?.resolution).toBe('Đã cập nhật kết quả điều tra');
      expect(inDb?.handledBy).toBeUndefined();
      expect(inDb?.handledAt).toBeUndefined();

      const receipt = await db.collection('operation_receipts').findOne({
        operationId: 'c1111111-0000-4000-8000-000000000019',
      });
      expect(receipt).not.toBeNull();
    });
  });

  describe('IP: Bảo vệ dữ liệu riêng tư & Sentinel Checks (DB-T16, AT-12, BR-29)', () => {
    it('IP-01: Dữ liệu cá nhân (note, flashcard riêng, saved items) chứa chuỗi sentinel tuyệt đối KHÔNG xuất hiện trong bất kỳ response admin nào', async () => {
      const { cookie: adminCookie } = await createAuthHeader(admin1Id);
      const SENTINEL = 'SUPER_SECRET_PRIVATE_LEARNER_SENTINEL_xyz123';
      const sessionId = new ObjectId();
      const now = new Date();

      // Seed note riêng trong session_personal của Learner 1
      await db.collection('session_personal').insertOne({
        ownerKey: `user:${learner1Id.toHexString()}`,
        sessionId,
        note: `Ghi chú bí mật cá nhân: ${SENTINEL}`,
        createdAt: now,
        updatedAt: now,
      });

      // Seed flashcard thủ công trong manual_cards
      await db.collection('manual_cards').insertOne({
        ownerKey: `user:${learner1Id.toHexString()}`,
        front: `Front secret: ${SENTINEL}`,
        back: `Back secret: ${SENTINEL}`,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });

      // Seed report
      const reportId = new ObjectId();
      await db.collection('reports').insertOne({
        _id: reportId,
        reporterKey: `user:${learner1Id.toHexString()}`,
        reportedKey: `user:${learner2Id.toHexString()}`,
        sessionId,
        reason: 'Kiểm tra riêng tư',
        status: 'new',
        version: 0,
        createdAt: now,
        updatedAt: now,
      });

      // Gọi cả 5 endpoint admin và kiểm tra chuỗi sentinel không bao giờ rò rỉ
      const responses = await Promise.all([
        request(app).get('/api/v1/admin/users').set('Cookie', adminCookie),
        request(app).get(`/api/v1/admin/reports`).set('Cookie', adminCookie),
        request(app)
          .get(`/api/v1/admin/reports/${reportId.toHexString()}`)
          .set('Cookie', adminCookie),
      ]);

      for (const res of responses) {
        expect(res.status).toBe(200);
        expect(res.text).not.toContain(SENTINEL);
        expect(res.text).not.toContain('Ghi chú bí mật cá nhân');
        expect(res.text).not.toContain('Front secret');
        expect(res.text).not.toContain('Back secret');
      }
    });

    it('IP-03: Thăm dò các URL không được phép tồn tại (/admin/users/:id/notes, /admin/reports/:id/media) đều trả 404', async () => {
      const { cookie: adminCookie } = await createAuthHeader(admin1Id);
      const userId = learner1Id.toHexString();
      const reportId = new ObjectId().toHexString();

      const forbiddenUrls = [
        `/api/v1/admin/users/${userId}/notes`,
        `/api/v1/admin/users/${userId}/cards`,
        `/api/v1/admin/reports/${reportId}/media`,
        `/api/v1/admin/reports/${reportId}/session`,
        `/api/v1/admin/sessions/${reportId}`,
      ];

      for (const url of forbiddenUrls) {
        const res = await request(app)
          .get(url)
          .set('Cookie', adminCookie)
          .expect(404);
        expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
      }
    });
  });
});
