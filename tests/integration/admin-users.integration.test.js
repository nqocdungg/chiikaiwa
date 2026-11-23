import { randomUUID } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
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
import { readAuthEnv } from '../../server/config/env.js';
import { signJwt, hashPassword } from '../../server/modules/identity/crypto.js';
import {
  connectDatabase,
  disconnectDatabase,
} from '../../server/persistence/database.js';
import { up as applyDesignIndexes } from '../../server/persistence/migrations/20261103000100-add-design-indexes.js';
import * as roomService from '../../server/integrations/livekit/room-service.js';
import * as mediaCleanupService from '../../server/modules/sessions/media-cleanup-service.js';
import { DEFAULT_JWT_SECRET } from '../fixtures/auth-fixtures.js';
import { LIVEKIT_TEST_SECRET } from '../fixtures/livekit-fixtures.js';

/** @type {MongoMemoryReplSet} */
let replicaSet;
/** @type {any} */
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
const learner3Id = new ObjectId('507f1f77bcf86cd799439033');

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

describe('Admin Users Integration Suite (BE-026, IU-01 - IU-07, IL-01 - IL-24, DB-T04)', () => {
  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({
      binary: { version: '8.2.7' },
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    process.env.MONGODB_URI = replicaSet.getUri();
    process.env.MONGODB_DB_NAME = 'chiikaiwa_admin_users_test';
    process.env.APP_ORIGIN = DEFAULT_ORIGIN;
    process.env.JWT_SECRET = DEFAULT_JWT_SECRET;
    process.env.LIVEKIT_URL = 'wss://livekit.example.test';
    process.env.LIVEKIT_API_KEY = 'lk-test-key';
    process.env.LIVEKIT_API_SECRET = LIVEKIT_TEST_SECRET;

    db = await connectDatabase();
    await applyDesignIndexes(db);

    vi.spyOn(roomService, 'closeMediaRoom').mockResolvedValue(undefined);
    vi.spyOn(roomService, 'removeMediaParticipant').mockResolvedValue(
      undefined,
    );
    vi.spyOn(roomService, 'notifyMediaSession').mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await disconnectDatabase();
    await replicaSet.stop();
  });

  beforeEach(async () => {
    // Dọn dẹp các collection liên quan trước mỗi test
    await db.collection('users').deleteMany({});
    await db.collection('auth_sessions').deleteMany({});
    await db.collection('actor_states').deleteMany({});
    await db.collection('practice_sessions').deleteMany({});
    await db.collection('invitations').deleteMany({});
    await db.collection('invite_requests').deleteMany({});
    await db.collection('match_proposals').deleteMany({});
    await db.collection('operation_receipts').deleteMany({});
    await db.collection('rate_limits').deleteMany({});

    // Lấy CSRF token mới
    const csrfRes = await request(app).get('/api/v1/auth/csrf').expect(200);
    csrfToken = csrfRes.body.data.csrfToken;
    const rawSetCookie = csrfRes.headers['set-cookie'];
    csrfCookie = Array.isArray(rawSetCookie)
      ? rawSetCookie.map((c) => c.split(';')[0]).join('; ')
      : String(rawSetCookie ?? '').split(';')[0];

    const now = new Date('2026-11-18T10:00:00.000Z');
    const pwdHash = await hashPassword('Password123!');

    // Seed Admin 1
    await db.collection('users').insertOne({
      _id: admin1Id,
      email: 'admin1@example.com',
      emailKey: 'admin1@example.com',
      passwordHash: pwdHash,
      role: 'admin',
      status: 'active',
      displayName: 'Admin One',
      authVersion: 0,
      version: 0,
      createdAt: now,
      updatedAt: now,
    });
    await db.collection('actor_states').insertOne({
      _id: `user:${admin1Id.toHexString()}`,
      mode: 'idle',
      version: 0,
      createdAt: now,
      updatedAt: now,
    });

    // Seed Admin 2
    await db.collection('users').insertOne({
      _id: admin2Id,
      email: 'admin2@example.com',
      emailKey: 'admin2@example.com',
      passwordHash: pwdHash,
      role: 'admin',
      status: 'active',
      displayName: 'Admin Two',
      authVersion: 0,
      version: 0,
      createdAt: new Date(now.getTime() + 1000),
      updatedAt: new Date(now.getTime() + 1000),
    });
    await db.collection('actor_states').insertOne({
      _id: `user:${admin2Id.toHexString()}`,
      mode: 'idle',
      version: 0,
      createdAt: new Date(now.getTime() + 1000),
      updatedAt: new Date(now.getTime() + 1000),
    });

    // Seed Learner 1
    await db.collection('users').insertOne({
      _id: learner1Id,
      email: 'learner1@example.com',
      emailKey: 'learner1@example.com',
      passwordHash: pwdHash,
      role: 'learner',
      status: 'active',
      displayName: 'Learner One',
      authVersion: 0,
      version: 0,
      createdAt: new Date(now.getTime() + 2000),
      updatedAt: new Date(now.getTime() + 2000),
    });
    await db.collection('actor_states').insertOne({
      _id: `user:${learner1Id.toHexString()}`,
      mode: 'idle',
      version: 0,
      createdAt: new Date(now.getTime() + 2000),
      updatedAt: new Date(now.getTime() + 2000),
    });

    // Seed Learner 2
    await db.collection('users').insertOne({
      _id: learner2Id,
      email: 'learner2@example.com',
      emailKey: 'learner2@example.com',
      passwordHash: pwdHash,
      role: 'learner',
      status: 'active',
      displayName: 'Learner Two',
      authVersion: 0,
      version: 0,
      createdAt: new Date(now.getTime() + 3000),
      updatedAt: new Date(now.getTime() + 3000),
    });
    await db.collection('actor_states').insertOne({
      _id: `user:${learner2Id.toHexString()}`,
      mode: 'idle',
      version: 0,
      createdAt: new Date(now.getTime() + 3000),
      updatedAt: new Date(now.getTime() + 3000),
    });

    // Seed Learner 3 (locked)
    await db.collection('users').insertOne({
      _id: learner3Id,
      email: 'learner3@example.com',
      emailKey: 'learner3@example.com',
      passwordHash: pwdHash,
      role: 'learner',
      status: 'locked',
      displayName: 'Learner Three',
      authVersion: 1,
      version: 0,
      createdAt: new Date(now.getTime() + 4000),
      updatedAt: new Date(now.getTime() + 4000),
    });
    await db.collection('actor_states').insertOne({
      _id: `user:${learner3Id.toHexString()}`,
      mode: 'idle',
      version: 0,
      createdAt: new Date(now.getTime() + 4000),
      updatedAt: new Date(now.getTime() + 4000),
    });
  });

  describe('IU: Danh sách và phân trang Users (GET /admin/users)', () => {
    it('IU-01: Admin lấy danh sách users thành công, trả đúng tập khóa DTO whitelist và sắp xếp createdAt desc, _id desc', async () => {
      const { cookie } = await createAuthHeader(admin1Id);
      const res = await request(app)
        .get('/api/v1/admin/users')
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.data).toHaveProperty('items');
      const items = res.body.data.items;
      expect(items.length).toBe(5);

      // Kiểm tra tập thuộc tính đúng chuẩn contract 07 §10 (whitelist)
      for (const item of items) {
        expect(Object.keys(item).sort()).toEqual(
          ['displayName', 'email', 'id', 'status', 'version'].sort(),
        );
        expect(item).not.toHaveProperty('passwordHash');
        expect(item).not.toHaveProperty('emailKey');
        expect(item).not.toHaveProperty('authVersion');
        expect(item).not.toHaveProperty('role');
        expect(item).not.toHaveProperty('profile');
      }

      // Kiểm tra thứ tự sắp xếp: Learner 3 mới nhất -> Learner 2 -> Learner 1 -> Admin 2 -> Admin 1
      expect(items[0].id).toBe(learner3Id.toHexString());
      expect(items[1].id).toBe(learner2Id.toHexString());
      expect(items[2].id).toBe(learner1Id.toHexString());
      expect(items[3].id).toBe(admin2Id.toHexString());
      expect(items[4].id).toBe(admin1Id.toHexString());
    });

    it('IU-02: Phân trang qua cursor keyset: không trùng, không sót, trang cuối nextCursor là null', async () => {
      const { cookie } = await createAuthHeader(admin1Id);

      // Trang 1 limit = 2
      const res1 = await request(app)
        .get('/api/v1/admin/users?limit=2')
        .set('Cookie', cookie)
        .expect(200);
      expect(res1.body.data.items.length).toBe(2);
      expect(res1.body.data.nextCursor).toBeTruthy();
      const page1Ids = res1.body.data.items.map((/** @type {any} */ u) => u.id);

      // Trang 2 limit = 2 với cursor
      const res2 = await request(app)
        .get(
          `/api/v1/admin/users?limit=2&cursor=${encodeURIComponent(res1.body.data.nextCursor)}`,
        )
        .set('Cookie', cookie)
        .expect(200);
      expect(res2.body.data.items.length).toBe(2);
      expect(res2.body.data.nextCursor).toBeTruthy();
      const page2Ids = res2.body.data.items.map((/** @type {any} */ u) => u.id);

      // Trang 3 limit = 2 với cursor
      const res3 = await request(app)
        .get(
          `/api/v1/admin/users?limit=2&cursor=${encodeURIComponent(res2.body.data.nextCursor)}`,
        )
        .set('Cookie', cookie)
        .expect(200);
      expect(res3.body.data.items.length).toBe(1);
      expect(res3.body.data.nextCursor).toBeNull();
      const page3Ids = res3.body.data.items.map((/** @type {any} */ u) => u.id);

      // Hợp nhất các trang = toàn bộ 5 users, không trùng
      const allIds = [...page1Ids, ...page2Ids, ...page3Ids];
      expect(new Set(allIds).size).toBe(5);
    });

    it('IU-03: Lọc theo status và từ chối 400 INVALID_CURSOR khi cursor dùng lệch bộ lọc context', async () => {
      const { cookie } = await createAuthHeader(admin1Id);

      // Lọc status=active (có 4 users)
      const resActive = await request(app)
        .get('/api/v1/admin/users?status=active&limit=2')
        .set('Cookie', cookie)
        .expect(200);
      expect(resActive.body.data.items.length).toBe(2);
      expect(
        resActive.body.data.items.every(
          (/** @type {any} */ u) => u.status === 'active',
        ),
      ).toBe(true);

      const activeCursor = resActive.body.data.nextCursor;
      expect(activeCursor).toBeTruthy();

      // Dùng cursor này cho query status=locked -> phải từ chối 400 INVALID_CURSOR
      const resConflict = await request(app)
        .get(
          `/api/v1/admin/users?status=locked&cursor=${encodeURIComponent(activeCursor)}`,
        )
        .set('Cookie', cookie)
        .expect(400);
      expect(resConflict.body.error.code).toBe('INVALID_CURSOR');

      // cursor rỗng -> 400 INVALID_CURSOR (S5)
      const resEmpty = await request(app)
        .get('/api/v1/admin/users?cursor=')
        .set('Cookie', cookie)
        .expect(400);
      expect(resEmpty.body.error.code).toBe('INVALID_CURSOR');
    });

    it('IU-04: limit=50 chấp nhận 200, limit=51 từ chối 422 INVALID_LIMIT', async () => {
      const { cookie } = await createAuthHeader(admin1Id);

      await request(app)
        .get('/api/v1/admin/users?limit=50')
        .set('Cookie', cookie)
        .expect(200);

      const resOver = await request(app)
        .get('/api/v1/admin/users?limit=51')
        .set('Cookie', cookie)
        .expect(422);
      expect(resOver.body.error.code).toBe('VALIDATION_FAILED');
      expect(resOver.body.error.details.fields[0].code).toBe('INVALID_LIMIT');
    });

    it('IU-06: Chạy explain executionStats trên users để báo cáo chi phí truy vấn (DB-T19)', async () => {
      const explain = await db
        .collection('users')
        .find({ status: 'active' }, { projection: { _id: 1, email: 1 } })
        .sort({ createdAt: -1, _id: -1 })
        .explain('executionStats');
      expect(explain).toHaveProperty('executionStats');
      expect(explain.executionStats.executionSuccess).toBe(true);
    });

    it('IU-07: Bỏ qua an toàn các bản ghi thiếu createdAt hợp lệ, không gây 500 hay ngắt chuỗi phân trang (R2)', async () => {
      const { cookie } = await createAuthHeader(admin1Id);
      const corruptUserId = new ObjectId();
      await db.collection('users').insertOne({
        _id: corruptUserId,
        email: 'corrupt@example.com',
        displayName: 'Corrupt User',
        role: 'learner',
        status: 'active',
        version: 0,
        // Cố ý không có trường createdAt
      });

      // Lấy danh sách từng trang với limit=1
      /** @type {string[]} */
      const fetchedIds = [];
      /** @type {string | null} */
      let currentCursor = null;
      let pageCount = 0;
      let hasMorePages = true;
      while (hasMorePages && pageCount < 10) {
        /** @type {string} */
        const queryUrl = currentCursor
          ? `/api/v1/admin/users?limit=1&cursor=${encodeURIComponent(currentCursor)}`
          : '/api/v1/admin/users?limit=1';
        /** @type {any} */
        const pageRes = await request(app)
          .get(queryUrl)
          .set('Cookie', cookie)
          .expect(200);

        expect(pageRes.body.data).toHaveProperty('items');
        for (const item of pageRes.body.data.items) {
          fetchedIds.push(item.id);
        }
        currentCursor = pageRes.body.data.nextCursor;
        hasMorePages = Boolean(currentCursor);
        pageCount++;
      }

      // (a) Không trang nào trả về 500 (đã khẳng định qua .expect(200))
      // (b) User thiếu createdAt không bao giờ xuất hiện trong danh sách
      expect(fetchedIds).not.toContain(corruptUserId.toHexString());
      // (c) 5 user hợp lệ ban đầu (3 learners + 2 admins) đều được lấy đủ, không bị bỏ sót
      expect(fetchedIds.length).toBe(5);
      expect(fetchedIds).toContain(learner3Id.toHexString());
      expect(fetchedIds).toContain(learner2Id.toHexString());
      expect(fetchedIds).toContain(learner1Id.toHexString());
      expect(fetchedIds).toContain(admin2Id.toHexString());
      expect(fetchedIds).toContain(admin1Id.toHexString());

      // Dọn dẹp bản ghi corrupt
      await db.collection('users').deleteOne({ _id: corruptUserId });
    });
  });

  describe('IL: Khóa & Mở khóa tài khoản (PATCH /admin/users/:id/status & TX-05)', () => {
    it('IL-01: Admin khóa Learner 1 thành công: cập nhật status, statusChangedAt/By, authVersion, version và thu hồi auth_sessions', async () => {
      const { cookie: adminCookie } = await createAuthHeader(admin1Id);
      // Tạo trước 2 sessions cho Learner 1
      await createAuthHeader(learner1Id);
      await createAuthHeader(learner1Id);

      const activeSessionsBefore = await db
        .collection('auth_sessions')
        .find({ userId: learner1Id, revokedAt: { $exists: false } })
        .toArray();
      expect(activeSessionsBefore.length).toBe(2);

      const idempotencyKey = randomUUID();
      const res = await request(app)
        .patch(`/api/v1/admin/users/${learner1Id.toHexString()}/status`)
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', adminCookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', idempotencyKey)
        .send({ expectedVersion: 0, status: 'locked' })
        .expect(200);

      expect(res.body.data).toEqual({
        id: learner1Id.toHexString(),
        status: 'locked',
        version: 1,
      });

      // Kiểm tra trong DB
      const userInDb = await db
        .collection('users')
        .findOne({ _id: learner1Id });
      expect(userInDb.status).toBe('locked');
      expect(userInDb.version).toBe(1);
      expect(userInDb.authVersion).toBe(1);
      expect(userInDb.statusChangedBy.toHexString()).toBe(
        admin1Id.toHexString(),
      );
      expect(userInDb.statusChangedAt).toBeTruthy();

      // Toàn bộ auth_sessions đã bị thu hồi
      const activeSessionsAfter = await db
        .collection('auth_sessions')
        .find({ userId: learner1Id, revokedAt: { $exists: false } })
        .toArray();
      expect(activeSessionsAfter.length).toBe(0);
    });

    it('IL-02: Token cũ của user bị khóa bị từ chối 401 SESSION_EXPIRED trên các endpoint nghiệp vụ (AC2, AT-12)', async () => {
      const { cookie: adminCookie } = await createAuthHeader(admin1Id);
      const { cookie: learnerOldCookie } = await createAuthHeader(
        learner1Id,
        0,
      );

      // Admin khóa Learner 1
      await request(app)
        .patch(`/api/v1/admin/users/${learner1Id.toHexString()}/status`)
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', adminCookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', 'a1111111-0000-4000-8000-000000000001')
        .send({ expectedVersion: 0, status: 'locked' })
        .expect(200);

      // Thử dùng token cũ gọi GET /api/v1/auth/me
      const resMe = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', learnerOldCookie)
        .expect(401);
      expect(resMe.body.error.code).toBe('SESSION_EXPIRED');

      // Thử dùng token cũ gọi endpoint nghiệp vụ khác (GET /me/saved-items)
      const resSaved = await request(app)
        .get('/api/v1/me/saved-items')
        .set('Cookie', learnerOldCookie)
        .expect(401);
      expect(resSaved.body.error.code).toBe('SESSION_EXPIRED');
    });

    it('IL-03: Learner bị khóa đăng nhập với mật khẩu đúng trả 403 ACCOUNT_LOCKED; mật khẩu sai trả 401 INVALID_CREDENTIALS', async () => {
      const { cookie: adminCookie } = await createAuthHeader(admin1Id);
      await request(app)
        .patch(`/api/v1/admin/users/${learner1Id.toHexString()}/status`)
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', adminCookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', 'a1111111-0000-4000-8000-000000000002')
        .send({ expectedVersion: 0, status: 'locked' })
        .expect(200);

      // Đăng nhập mật khẩu sai -> 401 INVALID_CREDENTIALS
      const resWrong = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ email: 'learner1@example.com', password: 'WrongPassword123!' })
        .expect(401);
      expect(resWrong.body.error.code).toBe('INVALID_CREDENTIALS');

      // Đăng nhập mật khẩu đúng -> 403 ACCOUNT_LOCKED
      const resRight = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ email: 'learner1@example.com', password: 'Password123!' })
        .expect(403);
      expect(resRight.body.error.code).toBe('ACCOUNT_LOCKED');
    });

    it('IL-06: Khóa user đang inSession: phiên ended, effects gọi sau commit, đối tác không bị kẹt (TX-05)', async () => {
      const { cookie: adminCookie } = await createAuthHeader(admin1Id);
      const sessionId = new ObjectId();
      const now = new Date();

      // Đặt Learner 1 và Learner 2 vào một practice_session active
      await db.collection('practice_sessions').insertOne({
        _id: sessionId,
        roomName: `session-${sessionId.toHexString()}`,
        status: 'active',
        members: [
          { actorKey: `user:${learner1Id.toHexString()}`, role: 'speaker' },
          { actorKey: `user:${learner2Id.toHexString()}`, role: 'listener' },
        ],
        mediaCleanup: { state: 'idle' },
        createdAt: now,
        updatedAt: now,
      });

      await db.collection('actor_states').updateOne(
        { _id: `user:${learner1Id.toHexString()}` },
        {
          $set: {
            mode: 'inSession',
            resourceId: sessionId.toHexString(),
            updatedAt: now,
          },
        },
      );
      await db.collection('actor_states').updateOne(
        { _id: `user:${learner2Id.toHexString()}` },
        {
          $set: {
            mode: 'inSession',
            resourceId: sessionId.toHexString(),
            updatedAt: now,
          },
        },
      );

      // Khóa Learner 1
      await request(app)
        .patch(`/api/v1/admin/users/${learner1Id.toHexString()}/status`)
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', adminCookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', 'a1111111-0000-4000-8000-000000000006')
        .send({ expectedVersion: 0, status: 'locked' })
        .expect(200);

      // Kiểm tra phiên đã ended với lý do account_locked
      const sessionDoc = await db
        .collection('practice_sessions')
        .findOne({ _id: sessionId });
      expect(sessionDoc.status).toBe('ended');
      expect(sessionDoc.endReason).toBe('account_locked');

      // Actor state của Learner 1 và Learner 2 đã được giải phóng về idle
      const stateL1 = await db
        .collection('actor_states')
        .findOne({ _id: `user:${learner1Id.toHexString()}` });
      const stateL2 = await db
        .collection('actor_states')
        .findOne({ _id: `user:${learner2Id.toHexString()}` });
      expect(stateL1.mode).toBe('idle');
      expect(stateL2.mode).toBe('idle');
    });

    it('IL-07 & IL-08: Mở khóa Learner 3: status active, version tăng, authVersion KHÔNG đổi, đăng nhập lại thành công', async () => {
      const { cookie: adminCookie } = await createAuthHeader(admin1Id);
      const userBefore = await db
        .collection('users')
        .findOne({ _id: learner3Id });
      expect(userBefore.status).toBe('locked');
      const initialAuthVersion = userBefore.authVersion;

      const resUnlock = await request(app)
        .patch(`/api/v1/admin/users/${learner3Id.toHexString()}/status`)
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', adminCookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', 'a1111111-0000-4000-8000-000000000007')
        .send({ expectedVersion: 0, status: 'active' })
        .expect(200);

      expect(resUnlock.body.data).toEqual({
        id: learner3Id.toHexString(),
        status: 'active',
        version: 1,
      });

      const userAfter = await db
        .collection('users')
        .findOne({ _id: learner3Id });
      expect(userAfter.status).toBe('active');
      expect(userAfter.authVersion).toBe(initialAuthVersion); // Q9: không tăng authVersion

      // Đăng nhập lại thành công
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', csrfCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ email: 'learner3@example.com', password: 'Password123!' })
        .expect(200);
      expect(loginRes.body.data.user.id).toBe(learner3Id.toHexString());
    });

    it('IL-09: Từ chối 403 FORBIDDEN khi Admin cố tự khóa chính mình (Q3)', async () => {
      const { cookie: adminCookie } = await createAuthHeader(admin1Id);

      const res = await request(app)
        .patch(`/api/v1/admin/users/${admin1Id.toHexString()}/status`)
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', adminCookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', 'a1111111-0000-4000-8000-000000000009')
        .send({ expectedVersion: 0, status: 'locked' })
        .expect(403);

      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain(
        'Không thể tự khóa tài khoản của chính mình',
      );

      // Admin 1 vẫn active
      const adminDoc = await db.collection('users').findOne({ _id: admin1Id });
      expect(adminDoc.status).toBe('active');
    });

    it('IL-10: Cập nhật trùng trạng thái hiện tại (No-op): trả 200, version và authVersion không đổi (Q4)', async () => {
      const { cookie: adminCookie } = await createAuthHeader(admin1Id);

      // Learner 1 đang active, gửi status: active
      const res = await request(app)
        .patch(`/api/v1/admin/users/${learner1Id.toHexString()}/status`)
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', adminCookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', 'a1111111-0000-4000-8000-000000000010')
        .send({ expectedVersion: 0, status: 'active' })
        .expect(200);

      expect(res.body.data).toEqual({
        id: learner1Id.toHexString(),
        status: 'active',
        version: 0,
      });

      const userDoc = await db.collection('users').findOne({ _id: learner1Id });
      expect(userDoc.version).toBe(0);
      expect(userDoc.authVersion).toBe(0);
    });

    it('IL-11: expectedVersion cũ bị từ chối 409 VERSION_CONFLICT kèm currentVersion, không ghi DB hay receipt', async () => {
      const { cookie: adminCookie } = await createAuthHeader(admin1Id);

      // Learner 1 đang ở version 0, gửi expectedVersion: 5
      const res = await request(app)
        .patch(`/api/v1/admin/users/${learner1Id.toHexString()}/status`)
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', adminCookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', 'a1111111-0000-4000-8000-000000000011')
        .send({ expectedVersion: 5, status: 'locked' })
        .expect(409);

      expect(res.body.error.code).toBe('VERSION_CONFLICT');
      expect(res.body.error.details.currentVersion).toBe(0);

      // Không có receipt nào được ghi
      const receipt = await db.collection('operation_receipts').findOne({
        operationId: 'a1111111-0000-4000-8000-000000000011',
      });
      expect(receipt).toBeNull();
    });

    it('IL-13 & IL-14: Xử lý Idempotency-Key: cùng key cùng body trả 200 giống nhau; cùng key khác body trả 409 IDEMPOTENCY_CONFLICT', async () => {
      const { cookie: adminCookie } = await createAuthHeader(admin1Id);
      const key = 'a1111111-0000-4000-8000-000000000013';

      // Lần 1
      const res1 = await request(app)
        .patch(`/api/v1/admin/users/${learner1Id.toHexString()}/status`)
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', adminCookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', key)
        .send({ expectedVersion: 0, status: 'locked' })
        .expect(200);

      // Lần 2 (Replay cùng key, cùng body)
      const res2 = await request(app)
        .patch(`/api/v1/admin/users/${learner1Id.toHexString()}/status`)
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', adminCookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', key)
        .send({ expectedVersion: 0, status: 'locked' })
        .expect(200);

      expect(res2.body.data).toEqual(res1.body.data);

      // DB chỉ tăng 1 lần
      const userDoc = await db.collection('users').findOne({ _id: learner1Id });
      expect(userDoc.version).toBe(1);

      // Gửi lại cùng key nhưng đổi body -> 409 IDEMPOTENCY_CONFLICT
      const resConflict = await request(app)
        .patch(`/api/v1/admin/users/${learner1Id.toHexString()}/status`)
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', adminCookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', key)
        .send({ expectedVersion: 0, status: 'active' })
        .expect(409);
      expect(resConflict.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    });

    it('IL-17: Replay khi Admin gọi bị khóa giữa chừng: từ chối 403 ACCOUNT_LOCKED, không phát lại kết quả', async () => {
      const { cookie: admin1Cookie } = await createAuthHeader(admin1Id);
      const key = 'a1111111-0000-4000-8000-000000000017';

      // Admin 1 khóa Learner 1 thành công
      await request(app)
        .patch(`/api/v1/admin/users/${learner1Id.toHexString()}/status`)
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', admin1Cookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', key)
        .send({ expectedVersion: 0, status: 'locked' })
        .expect(200);

      // Sau đó, Admin 1 bị Admin 2 khóa
      await db
        .collection('users')
        .updateOne({ _id: admin1Id }, { $set: { status: 'locked' } });

      // Admin 1 gửi lại cùng key -> bị chặn bởi authorize guard (403 ACCOUNT_LOCKED)
      const resBlocked = await request(app)
        .patch(`/api/v1/admin/users/${learner1Id.toHexString()}/status`)
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', admin1Cookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', key)
        .send({ expectedVersion: 0, status: 'locked' })
        .expect(403);

      expect(resBlocked.body.error.code).toBe('ACCOUNT_LOCKED');
    });

    it('IL-04: Khóa user đang inviting: lời mời cancelled, request cancelled, actor giải phóng về idle', async () => {
      const { cookie: adminCookie } = await createAuthHeader(admin1Id);
      const now = new Date();
      const invitationId = new ObjectId();
      const requestId = new ObjectId();

      await db.collection('invitations').insertOne({
        _id: invitationId,
        code: 'TESTCODE12',
        hostActorKey: `user:${learner1Id.toHexString()}`,
        status: 'open',
        version: 0,
        createdAt: now,
        updatedAt: now,
      });

      await db.collection('invite_requests').insertOne({
        _id: requestId,
        invitationId,
        requesterKey: `user:${learner2Id.toHexString()}`,
        status: 'pending',
        version: 0,
        createdAt: now,
        updatedAt: now,
      });

      await db.collection('actor_states').updateOne(
        { _id: `user:${learner1Id.toHexString()}` },
        {
          $set: {
            mode: 'inviting',
            resourceId: invitationId.toHexString(),
            updatedAt: now,
          },
        },
      );
      await db.collection('actor_states').updateOne(
        { _id: `user:${learner2Id.toHexString()}` },
        {
          $set: {
            mode: 'requestingInvite',
            resourceId: requestId.toHexString(),
            updatedAt: now,
          },
        },
      );

      await request(app)
        .patch(`/api/v1/admin/users/${learner1Id.toHexString()}/status`)
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', adminCookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', 'a1111111-0000-4000-8000-000000000004')
        .send({ expectedVersion: 0, status: 'locked' })
        .expect(200);

      const invDoc = await db
        .collection('invitations')
        .findOne({ _id: invitationId });
      expect(invDoc.status).toBe('cancelled');

      const reqDoc = await db
        .collection('invite_requests')
        .findOne({ _id: requestId });
      expect(reqDoc.status).toBe('cancelled');

      const state1 = await db
        .collection('actor_states')
        .findOne({ _id: `user:${learner1Id.toHexString()}` });
      const state2 = await db
        .collection('actor_states')
        .findOne({ _id: `user:${learner2Id.toHexString()}` });
      expect(state1.mode).toBe('idle');
      expect(state2.mode).toBe('idle');
    });

    it('IL-05: Khóa user đang searching hoặc proposed: giải phóng actor về idle, huỷ proposal', async () => {
      const { cookie: adminCookie } = await createAuthHeader(admin1Id);
      const now = new Date();
      const proposalId = new ObjectId();

      await db.collection('match_proposals').insertOne({
        _id: proposalId,
        participants: [
          { actorKey: `user:${learner1Id.toHexString()}` },
          { actorKey: `user:${learner2Id.toHexString()}` },
        ],
        status: 'pending',
        version: 0,
        createdAt: now,
        updatedAt: now,
      });

      await db.collection('actor_states').updateOne(
        { _id: `user:${learner1Id.toHexString()}` },
        {
          $set: {
            mode: 'proposed',
            resourceId: proposalId.toHexString(),
            updatedAt: now,
          },
        },
      );
      await db.collection('actor_states').updateOne(
        { _id: `user:${learner2Id.toHexString()}` },
        {
          $set: {
            mode: 'proposed',
            resourceId: proposalId.toHexString(),
            updatedAt: now,
          },
        },
      );

      await request(app)
        .patch(`/api/v1/admin/users/${learner1Id.toHexString()}/status`)
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', adminCookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', 'a1111111-0000-4000-8000-000000000005')
        .send({ expectedVersion: 0, status: 'locked' })
        .expect(200);

      const propDoc = await db
        .collection('match_proposals')
        .findOne({ _id: proposalId });
      expect(propDoc.status).toBe('cancelled');

      const state1 = await db
        .collection('actor_states')
        .findOne({ _id: `user:${learner1Id.toHexString()}` });
      const state2 = await db
        .collection('actor_states')
        .findOne({ _id: `user:${learner2Id.toHexString()}` });
      expect(state1.mode).toBe('idle');
      expect(state2.mode).toBe('idle');
    });

    it('IL-12: Từ chối 422 khi thiếu expectedVersion hoặc thiếu Idempotency-Key', async () => {
      const { cookie: adminCookie } = await createAuthHeader(admin1Id);

      // Thiếu Idempotency-Key
      const resNoKey = await request(app)
        .patch(`/api/v1/admin/users/${learner1Id.toHexString()}/status`)
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', adminCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ expectedVersion: 0, status: 'locked' })
        .expect(422);
      expect(resNoKey.body.error.code).toBe('VALIDATION_FAILED');

      // Thiếu expectedVersion
      const resNoVer = await request(app)
        .patch(`/api/v1/admin/users/${learner1Id.toHexString()}/status`)
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', adminCookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', 'a1111111-0000-4000-8000-000000000012')
        .send({ status: 'locked' })
        .expect(422);
      expect(resNoVer.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('IL-15: Key mới nhưng expectedVersion cũ sau khi đã commit trả 409 VERSION_CONFLICT', async () => {
      const { cookie: adminCookie } = await createAuthHeader(admin1Id);

      // Lần 1: commit thành công lên version 1
      await request(app)
        .patch(`/api/v1/admin/users/${learner1Id.toHexString()}/status`)
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', adminCookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', 'a1111111-0000-4000-8000-000000000015')
        .send({ expectedVersion: 0, status: 'locked' })
        .expect(200);

      // Lần 2: Key mới nhưng gửi expectedVersion: 0 -> 409 VERSION_CONFLICT
      const resStale = await request(app)
        .patch(`/api/v1/admin/users/${learner1Id.toHexString()}/status`)
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', adminCookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', 'b2222222-0000-4000-8000-000000000015')
        .send({ expectedVersion: 0, status: 'active' })
        .expect(409);
      expect(resStale.body.error.code).toBe('VERSION_CONFLICT');
      expect(resStale.body.error.details.currentVersion).toBe(1);
    });

    it('IL-16: ID không tồn tại trả 404 RESOURCE_NOT_FOUND, ID sai format trả 400 MALFORMED_REQUEST', async () => {
      const { cookie: adminCookie } = await createAuthHeader(admin1Id);
      const nonExistentId = new ObjectId().toHexString();

      const res404 = await request(app)
        .patch(`/api/v1/admin/users/${nonExistentId}/status`)
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', adminCookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', 'a1111111-0000-4000-8000-000000000016')
        .send({ expectedVersion: 0, status: 'locked' })
        .expect(404);
      expect(res404.body.error.code).toBe('RESOURCE_NOT_FOUND');

      const res400 = await request(app)
        .patch('/api/v1/admin/users/invalid-id/status')
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', adminCookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', 'b2222222-0000-4000-8000-000000000016')
        .send({ expectedVersion: 0, status: 'locked' })
        .expect(400);
      expect(res400.body.error.code).toBe('MALFORMED_REQUEST');
    });

    it('IL-18: Hai Admin PATCH đồng thời cùng user với cùng expectedVersion: đúng 1 commit, 1 xung đột 409', async () => {
      const { cookie: admin1Cookie } = await createAuthHeader(admin1Id);
      const { cookie: admin2Cookie } = await createAuthHeader(admin2Id);

      const req1 = request(app)
        .patch(`/api/v1/admin/users/${learner1Id.toHexString()}/status`)
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', admin1Cookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', 'a1111111-0000-4000-8000-000000000018')
        .send({ expectedVersion: 0, status: 'locked' });

      const req2 = request(app)
        .patch(`/api/v1/admin/users/${learner1Id.toHexString()}/status`)
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', admin2Cookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', 'a2222222-0000-4000-8000-000000000018')
        .send({ expectedVersion: 0, status: 'locked' });

      const [res1, res2] = await Promise.all([req1, req2]);
      const statuses = [res1.status, res2.status].sort();

      // Một request được 200, một request nhận 409
      expect(statuses).toEqual([200, 409]);

      // DB chỉ tăng version lên 1
      const userInDb = await db
        .collection('users')
        .findOne({ _id: learner1Id });
      expect(userInDb.version).toBe(1);
    });

    it('IL-22: LiveKit effects lỗi sau commit: DB vẫn giữ trạng thái locked, API vẫn trả 200 (TX-05)', async () => {
      const { cookie: adminCookie } = await createAuthHeader(admin1Id);
      const sessionId = new ObjectId();
      const now = new Date();

      await db.collection('practice_sessions').insertOne({
        _id: sessionId,
        roomName: `session-${sessionId.toHexString()}`,
        status: 'active',
        members: [
          { actorKey: `user:${learner1Id.toHexString()}`, role: 'speaker' },
        ],
        mediaCleanup: { state: 'idle' },
        createdAt: now,
        updatedAt: now,
      });

      await db.collection('actor_states').updateOne(
        { _id: `user:${learner1Id.toHexString()}` },
        {
          $set: {
            mode: 'inSession',
            resourceId: sessionId.toHexString(),
            updatedAt: now,
          },
        },
      );

      // Mock finishSessionEffects ném lỗi để kiểm tra lỗi side-effect sau commit (S3)
      vi.spyOn(
        mediaCleanupService,
        'finishSessionEffects',
      ).mockRejectedValueOnce(new Error('LiveKit connection dropped'));
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const res = await request(app)
        .patch(`/api/v1/admin/users/${learner1Id.toHexString()}/status`)
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', adminCookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', 'a1111111-0000-4000-8000-000000000022')
        .send({ expectedVersion: 0, status: 'locked' })
        .expect(200);

      expect(res.body.data.status).toBe('locked');
      const userInDb = await db
        .collection('users')
        .findOne({ _id: learner1Id });
      expect(userInDb.status).toBe('locked');

      // S3: Kiểm tra log cảnh báo side-effect không lộ thông tin cá nhân
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const logged = JSON.parse(warnSpy.mock.calls[0][0]);
      expect(logged.code).toBe('ACCOUNT_LOCK_EFFECTS_FAILED');
      expect(logged.sessionId).toBe(sessionId.toHexString());
      expect(warnSpy.mock.calls[0][0]).not.toContain('email');
      expect(warnSpy.mock.calls[0][0]).not.toContain(
        'LiveKit connection dropped',
      );
      warnSpy.mockRestore();
    });

    it('IL-23: Admin A không thể khóa Admin B -> 403 FORBIDDEN, B vẫn active, không tạo receipt mới (M4)', async () => {
      const { cookie: admin1Cookie } = await createAuthHeader(admin1Id);
      const res = await request(app)
        .patch(`/api/v1/admin/users/${admin2Id.toHexString()}/status`)
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', admin1Cookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', 'a1111111-0000-4000-8000-000000000023')
        .send({ expectedVersion: 0, status: 'locked' })
        .expect(403);

      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain(
        'Không thể khóa tài khoản Quản trị viên',
      );

      const admin2InDb = await db
        .collection('users')
        .findOne({ _id: admin2Id });
      expect(admin2InDb.status).toBe('active');
      expect(admin2InDb.version).toBe(0);
      expect(admin2InDb.authVersion).toBe(0);

      const receipt = await db.collection('operation_receipts').findOne({
        operationId: 'a1111111-0000-4000-8000-000000000023',
      });
      expect(receipt).toBeNull();
    });

    it('IL-24: Hai Admin khóa nhau đồng thời: cả hai nhận 403 FORBIDDEN, cả hai vẫn active (bảo vệ write-skew deadlock, M4)', async () => {
      const { cookie: admin1Cookie } = await createAuthHeader(admin1Id);
      const { cookie: admin2Cookie } = await createAuthHeader(admin2Id);

      const req1 = request(app)
        .patch(`/api/v1/admin/users/${admin2Id.toHexString()}/status`)
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', admin1Cookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', 'a1111111-0000-4000-8000-000000000024')
        .send({ expectedVersion: 0, status: 'locked' });

      const req2 = request(app)
        .patch(`/api/v1/admin/users/${admin1Id.toHexString()}/status`)
        .set('Origin', DEFAULT_ORIGIN)
        .set('Cookie', admin2Cookie)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', 'a2222222-0000-4000-8000-000000000024')
        .send({ expectedVersion: 0, status: 'locked' });

      const [res1, res2] = await Promise.all([req1, req2]);
      expect(res1.status).toBe(403);
      expect(res2.status).toBe(403);
      expect(res1.body.error.code).toBe('FORBIDDEN');
      expect(res2.body.error.code).toBe('FORBIDDEN');

      const a1 = await db.collection('users').findOne({ _id: admin1Id });
      const a2 = await db.collection('users').findOne({ _id: admin2Id });
      expect(a1.status).toBe('active');
      expect(a2.status).toBe('active');
    });
  });
});
