import { describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import {
  isProtectedDatabase,
  seedContentDataset,
  seedTestAccountFixtures,
} from '../../server/persistence/seed/seed-content.js';
import {
  SEED_ACCOUNT_IDS,
  SEED_USER_FIXTURES,
} from '../../server/persistence/seed/account-fixtures.js';

const { ObjectId } = mongoose.Types;

describe('DATA-002: Seed idempotency & security logic (Unit)', () => {
  describe('isProtectedDatabase (06 §13.1)', () => {
    it('chặn các tên database thuộc môi trường production', () => {
      expect(isProtectedDatabase('chiikaiwa_prod')).toBe(true);
      expect(isProtectedDatabase('chiikaiwa_production')).toBe(true);
      expect(isProtectedDatabase('prod_chiikaiwa')).toBe(true);
      expect(isProtectedDatabase('production-db')).toBe(true);
      expect(isProtectedDatabase('chiikaiwa')).toBe(false); // không có tiền tố/hậu tố dev/demo/test nhưng cũng không có prod
    });

    it('cho phép các tên database phát triển, demo và test', () => {
      expect(isProtectedDatabase('chiikaiwa_dev')).toBe(false);
      expect(isProtectedDatabase('chiikaiwa_demo')).toBe(false);
      expect(isProtectedDatabase('chiikaiwa_test')).toBe(false);
      expect(isProtectedDatabase('test_db_runner')).toBe(false);
    });

    it('an toàn mặc định: coi tên rỗng, null hoặc undefined là database cần bảo vệ', () => {
      expect(isProtectedDatabase('')).toBe(true);
      // @ts-expect-error testing invalid inputs
      expect(isProtectedDatabase(null)).toBe(true);
      // @ts-expect-error testing invalid inputs
      expect(isProtectedDatabase(undefined)).toBe(true);
    });
  });

  describe('seedContentDataset: Pre-validation & Idempotency', () => {
    it('từ chối dataset không hợp lệ trước khi ghi dữ liệu và không gọi database', async () => {
      const mockDb = {
        collection: vi.fn(),
      };

      const invalidDataset = {
        knowledges: [
          {
            contentId: 'invalid-id',
            versionId: 'not-an-oid',
            type: 'vocabulary',
            expression: '',
          },
        ],
      };

      // @ts-expect-error mockDb satisfies partial interface
      const result = await seedContentDataset(mockDb, invalidDataset);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(mockDb.collection).not.toHaveBeenCalled();
    });

    it('bảo toàn tính bất biến: lần 1 insert version, lần 2 skip version đã có', async () => {
      const kContentId = new ObjectId().toHexString();
      const kVersionId = new ObjectId().toHexString();

      const dataset = {
        knowledges: [
          {
            contentId: kContentId,
            versionId: kVersionId,
            revision: 1,
            type: 'vocabulary',
            expression: '食べる',
            reading: 'たべる',
            meaning: 'Ăn',
            examples: [
              {
                japanese: 'ご飯を食べる。',
                vietnamese: 'Ăn cơm.',
              },
            ],
          },
        ],
      };

      const fakeVersions = new Map();
      const fakeItems = new Map();

      const mockDb = {
        collection: vi.fn((name) => {
          if (name === 'content_versions') {
            return {
              findOne: vi.fn(async (query) => {
                const idStr = query._id?.toHexString?.() || String(query._id);
                return fakeVersions.has(idStr) ? fakeVersions.get(idStr) : null;
              }),
              insertOne: vi.fn(async (doc) => {
                const idStr = doc._id.toHexString();
                fakeVersions.set(idStr, doc);
                return { insertedId: doc._id };
              }),
            };
          }
          if (name === 'content_items') {
            return {
              updateOne: vi.fn(async (filter, update) => {
                const idStr = filter._id?.toHexString?.() || String(filter._id);
                const prev = fakeItems.get(idStr) || {};
                const merged = {
                  ...prev,
                  ...update.$set,
                  ...update.$setOnInsert,
                };
                fakeItems.set(idStr, merged);
                return { matchedCount: fakeItems.has(idStr) ? 1 : 0 };
              }),
            };
          }
          if (name === 'users') {
            return {
              findOne: vi.fn().mockResolvedValue(null),
            };
          }
          throw new Error(`Unexpected collection: ${name}`);
        }),
      };

      // Lần 1: Chưa có version -> Insert
      // @ts-expect-error mockDb satisfies partial interface
      const res1 = await seedContentDataset(mockDb, dataset, {
        datasetName: 'test-dataset',
      });
      expect(res1.success).toBe(true);
      expect(res1.stats.knowledges.inserted).toBe(1);
      expect(res1.stats.knowledges.skipped).toBe(0);
      expect(fakeVersions.has(kVersionId)).toBe(true);

      // Lưu lại snapshot của doc trong fakeVersions
      const savedVersion = fakeVersions.get(kVersionId);

      // Lần 2: Chạy lại -> Đã có version -> Skip version, chỉ update con trỏ content_items
      // @ts-expect-error mockDb satisfies partial interface
      const res2 = await seedContentDataset(mockDb, dataset, {
        datasetName: 'test-dataset',
      });
      expect(res2.success).toBe(true);
      expect(res2.stats.knowledges.inserted).toBe(0);
      expect(res2.stats.knowledges.skipped).toBe(1);
      // Đảm bảo không ghi đè version
      expect(fakeVersions.get(kVersionId)).toBe(savedVersion);
    });
  });

  describe('seedTestAccountFixtures & Security (02 §11.1)', () => {
    it('không chứa password plaintext trong repository, toàn bộ fixtures có passwordHash hợp lệ', () => {
      for (const user of SEED_USER_FIXTURES) {
        expect(user).not.toHaveProperty('password');
        expect(user).toHaveProperty('passwordHash');
        expect(typeof user.passwordHash).toBe('string');
        expect(user.passwordHash.length).toBeGreaterThan(20);
        // Kiểm tra format scrypt: scrypt$N$r$p$salt$hash
        expect(user.passwordHash).toMatch(/^scrypt\$/);
      }
    });

    it('nạp fixtures idempotent: lần 1 insert, lần 2 skip toàn bộ', async () => {
      const fakeUsers = new Map();
      const fakeActorStates = new Map();
      const fakeStats = new Map();

      const mockDb = {
        collection: vi.fn((name) => {
          if (name === 'users') {
            return {
              findOne: vi.fn(async (query) => {
                return fakeUsers.get(query.emailKey) || null;
              }),
              insertOne: vi.fn(async (doc) => {
                fakeUsers.set(doc.emailKey, doc);
                return { insertedId: doc._id };
              }),
            };
          }
          if (name === 'actor_states') {
            return {
              updateOne: vi.fn(async (filter, update) => {
                fakeActorStates.set(filter._id, update);
              }),
            };
          }
          if (name === 'statistics') {
            return {
              updateOne: vi.fn(async (filter, update) => {
                fakeStats.set(filter._id, update);
              }),
            };
          }
          throw new Error(`Unexpected collection: ${name}`);
        }),
      };

      // @ts-expect-error mockDb satisfies partial interface
      const res1 = await seedTestAccountFixtures(mockDb);
      expect(res1.total).toBe(SEED_USER_FIXTURES.length);
      expect(res1.inserted).toBe(SEED_USER_FIXTURES.length);
      expect(res1.skipped).toBe(0);
      expect(fakeUsers.size).toBe(SEED_USER_FIXTURES.length);

      // Lần 2: chạy lại
      // @ts-expect-error mockDb satisfies partial interface
      const res2 = await seedTestAccountFixtures(mockDb);
      expect(res2.total).toBe(SEED_USER_FIXTURES.length);
      expect(res2.inserted).toBe(0);
      expect(res2.skipped).toBe(SEED_USER_FIXTURES.length);
    });

    it('có đủ các tài khoản mẫu quy định trong 02 §11.1 và test contracts', () => {
      const emailKeys = SEED_USER_FIXTURES.map((u) => u.emailKey);
      expect(emailKeys).toContain('learner.a@example.com');
      expect(emailKeys).toContain('learner.b@example.com');
      expect(emailKeys).toContain('learner.c@example.com');
      expect(emailKeys).toContain('admin@example.com');
      expect(emailKeys).toContain('locked@example.com');

      const admin = SEED_USER_FIXTURES.find((u) => u.role === 'admin');
      expect(admin).toBeDefined();
      expect(admin?._id.toHexString()).toBe(SEED_ACCOUNT_IDS.admin);

      const locked = SEED_USER_FIXTURES.find((u) => u.status === 'locked');
      expect(locked).toBeDefined();
      expect(locked?.statusReason).toBe('compliance_hold');
    });

    it('hỗ trợ cấu hình mật khẩu Admin tùy biến qua biến môi trường hoặc options (06 §13.1.3)', async () => {
      const fakeUsers = new Map();
      const mockDb = {
        collection: vi.fn((name) => {
          if (name === 'users') {
            return {
              findOne: vi.fn(
                async (query) => fakeUsers.get(query.emailKey) || null,
              ),
              insertOne: vi.fn(async (doc) => {
                fakeUsers.set(doc.emailKey, doc);
                return { insertedId: doc._id };
              }),
            };
          }
          if (name === 'actor_states' || name === 'statistics') {
            return { updateOne: vi.fn().mockResolvedValue({}) };
          }
          throw new Error(`Unexpected collection: ${name}`);
        }),
      };

      // @ts-expect-error mockDb satisfies partial interface
      await seedTestAccountFixtures(mockDb, {
        adminPassword: 'CustomAdminPassword999',
      });

      const adminUser = fakeUsers.get('admin@example.com');
      expect(adminUser).toBeDefined();
      expect(adminUser.passwordHash).not.toBe(
        SEED_USER_FIXTURES.find((u) => u.role === 'admin')?.passwordHash,
      );
      expect(adminUser.passwordHash).toMatch(/^scrypt\$/);
    });
  });
});
