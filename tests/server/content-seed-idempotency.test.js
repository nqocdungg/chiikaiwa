import { describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import {
  assertDatabaseNotProtected,
  isProtectedDatabase,
  seedContentDataset,
  seedTestAccountFixtures,
} from '../../server/persistence/seed/seed-content.js';
import {
  SEED_ACCOUNT_IDS,
  SEED_USER_FIXTURES,
} from '../../server/persistence/seed/account-fixtures.js';
import {
  GOAL_CODES,
  INTEREST_CODES,
} from '../../server/modules/identity/catalogs.js';

const { ObjectId } = mongoose.Types;

describe('DATA-002: Seed idempotency & security logic (Unit)', () => {
  describe('isProtectedDatabase (06 §13.1 Whitelist fail-closed)', () => {
    it('chặn các tên database không thuộc whitelist dev/demo/test (fail-closed)', () => {
      expect(isProtectedDatabase('chiikaiwa_prod')).toBe(true);
      expect(isProtectedDatabase('chiikaiwa_production')).toBe(true);
      expect(isProtectedDatabase('prod_chiikaiwa')).toBe(true);
      expect(isProtectedDatabase('production-db')).toBe(true);
      expect(isProtectedDatabase('chiikaiwa')).toBe(true); // Fail-closed: database chính không có tiền tố/hậu tố dev/demo/test
      expect(isProtectedDatabase('my_app')).toBe(true);
      expect(isProtectedDatabase('custom_database')).toBe(true);
    });

    it('cho phép các tên database thuộc whitelist phát triển, demo và test', () => {
      expect(isProtectedDatabase('chiikaiwa_dev')).toBe(false);
      expect(isProtectedDatabase('chiikaiwa_demo')).toBe(false);
      expect(isProtectedDatabase('chiikaiwa_test')).toBe(false);
      expect(isProtectedDatabase('test_db_runner')).toBe(false);
      expect(isProtectedDatabase('demo_chiikaiwa')).toBe(false);
      expect(isProtectedDatabase('dev_chiikaiwa')).toBe(false);
    });

    it('an toàn mặc định: coi tên rỗng, null hoặc undefined là database cần bảo vệ (fail-closed)', () => {
      expect(isProtectedDatabase('')).toBe(true);
      // @ts-expect-error testing invalid inputs
      expect(isProtectedDatabase(null)).toBe(true);
      // @ts-expect-error testing invalid inputs
      expect(isProtectedDatabase(undefined)).toBe(true);
    });
  });

  describe('assertDatabaseNotProtected (06 §13.1 Production guard in seed module)', () => {
    it('ném lỗi bảo mật ngay lập tức khi chạy trên database không thuộc whitelist', () => {
      const mockDb = /** @type {any} */ ({
        databaseName: 'chiikaiwa_production',
      });
      expect(() => assertDatabaseNotProtected(mockDb)).toThrow(
        /LỖI BẢO MẬT: Cơ sở dữ liệu 'chiikaiwa_production' không thuộc whitelist dev\/demo\/test/,
      );
    });

    it('cho phép chạy trên database production khi người dùng chỉ định rõ forceProduction: true', () => {
      const mockDb = /** @type {any} */ ({
        databaseName: 'chiikaiwa_production',
      });
      expect(() =>
        assertDatabaseNotProtected(mockDb, { forceProduction: true }),
      ).not.toThrow();
    });

    it('cho phép chạy bình thường trên database test hoặc dev', () => {
      const mockDbTest = /** @type {any} */ ({
        databaseName: 'chiikaiwa_test',
      });
      const mockDbDev = /** @type {any} */ ({ databaseName: 'chiikaiwa_dev' });
      expect(() => assertDatabaseNotProtected(mockDbTest)).not.toThrow();
      expect(() => assertDatabaseNotProtected(mockDbDev)).not.toThrow();
    });
  });

  describe('seedContentDataset: Pre-validation & Idempotency', () => {
    it('từ chối dataset không hợp lệ trước khi ghi dữ liệu và không gọi database', async () => {
      const mockDb = {
        databaseName: 'chiikaiwa_test',
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
        databaseName: 'chiikaiwa_test',
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
              findOne: vi.fn(async (query) => {
                const idStr = query._id?.toHexString?.() || String(query._id);
                return fakeItems.has(idStr) ? fakeItems.get(idStr) : null;
              }),
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

    it('không ghi đè latestRevision, publishedVersionId khi DB đã có revision mới hơn (Revision Guard)', async () => {
      const kContentId = new ObjectId().toHexString();
      const kVersion1Id = new ObjectId().toHexString();
      const kVersion2Id = new ObjectId().toHexString();

      const dataset = {
        knowledges: [
          {
            contentId: kContentId,
            versionId: kVersion1Id,
            revision: 1,
            type: 'vocabulary',
            expression: '飲む',
            reading: 'のむ',
            meaning: 'Uống',
            examples: [
              {
                japanese: '水を飲む。',
                vietnamese: 'Uống nước.',
              },
            ],
          },
        ],
      };

      const fakeVersions = new Map([
        [kVersion1Id, { _id: new ObjectId(kVersion1Id), revision: 1 }],
        [kVersion2Id, { _id: new ObjectId(kVersion2Id), revision: 2 }],
      ]);

      // DB đã có revision 2 do Admin xuất bản sau đó
      const fakeItems = new Map([
        [
          kContentId,
          {
            _id: new ObjectId(kContentId),
            kind: 'knowledge',
            status: 'published',
            latestRevision: 2,
            publishedVersionId: new ObjectId(kVersion2Id),
            version: 2,
          },
        ],
      ]);

      const mockDb = {
        databaseName: 'chiikaiwa_test',
        collection: vi.fn((name) => {
          if (name === 'content_versions') {
            return {
              findOne: vi.fn(async (q) =>
                fakeVersions.get(q._id?.toHexString?.() || String(q._id)),
              ),
              insertOne: vi.fn(),
            };
          }
          if (name === 'content_items') {
            return {
              findOne: vi.fn(async (q) =>
                fakeItems.get(q._id?.toHexString?.() || String(q._id)),
              ),
              updateOne: vi.fn(async (filter, update) => {
                const idStr = filter._id?.toHexString?.() || String(filter._id);
                const prev = fakeItems.get(idStr) || {};
                fakeItems.set(idStr, { ...prev, ...update.$set });
              }),
            };
          }
          if (name === 'users') {
            return { findOne: vi.fn().mockResolvedValue(null) };
          }
          throw new Error(`Unexpected collection: ${name}`);
        }),
      };

      // @ts-expect-error mockDb satisfies partial interface
      const res = await seedContentDataset(mockDb, dataset);
      expect(res.success).toBe(true);

      const itemAfterSeed = fakeItems.get(kContentId);
      expect(itemAfterSeed).toBeDefined();
      // Bảo toàn revision 2 và publishedVersionId của version 2, không bị đè về revision 1
      expect(itemAfterSeed?.latestRevision).toBe(2);
      expect(itemAfterSeed?.publishedVersionId.toHexString()).toBe(kVersion2Id);
    });

    it('không ghi đè status khi Admin đã ẩn học liệu (status: hidden)', async () => {
      const kContentId = new ObjectId().toHexString();
      const kVersion1Id = new ObjectId().toHexString();

      const dataset = {
        knowledges: [
          {
            contentId: kContentId,
            versionId: kVersion1Id,
            revision: 1,
            type: 'vocabulary',
            expression: '寝る',
            reading: 'ねる',
            meaning: 'Ngủ',
            examples: [
              {
                japanese: '早く寝る。',
                vietnamese: 'Ngủ sớm.',
              },
            ],
          },
        ],
      };

      const fakeVersions = new Map([
        [kVersion1Id, { _id: new ObjectId(kVersion1Id), revision: 1 }],
      ]);

      // Admin đã ẩn học liệu này
      const fakeItems = new Map([
        [
          kContentId,
          {
            _id: new ObjectId(kContentId),
            kind: 'knowledge',
            status: 'hidden',
            latestRevision: 1,
            publishedVersionId: new ObjectId(kVersion1Id),
            version: 2,
          },
        ],
      ]);

      const mockDb = {
        databaseName: 'chiikaiwa_test',
        collection: vi.fn((name) => {
          if (name === 'content_versions') {
            return {
              findOne: vi.fn(async (q) =>
                fakeVersions.get(q._id?.toHexString?.() || String(q._id)),
              ),
              insertOne: vi.fn(),
            };
          }
          if (name === 'content_items') {
            return {
              findOne: vi.fn(async (q) =>
                fakeItems.get(q._id?.toHexString?.() || String(q._id)),
              ),
              updateOne: vi.fn(async (filter, update) => {
                const idStr = filter._id?.toHexString?.() || String(filter._id);
                const prev = fakeItems.get(idStr) || {};
                fakeItems.set(idStr, { ...prev, ...update.$set });
              }),
            };
          }
          if (name === 'users') {
            return { findOne: vi.fn().mockResolvedValue(null) };
          }
          throw new Error(`Unexpected collection: ${name}`);
        }),
      };

      // @ts-expect-error mockDb satisfies partial interface
      const res = await seedContentDataset(mockDb, dataset);
      expect(res.success).toBe(true);

      const itemAfterSeed = fakeItems.get(kContentId);
      expect(itemAfterSeed).toBeDefined();
      // Status vẫn phải giữ nguyên là 'hidden', tuyệt đối không bị đè thành 'published'
      expect(itemAfterSeed?.status).toBe('hidden');
    });

    it('phục hồi lỗi phân đoạn (partial failure recovery): khôi phục content_items nếu version đã có nhưng item bị thiếu', async () => {
      const kContentId = new ObjectId().toHexString();
      const kVersion1Id = new ObjectId().toHexString();

      const dataset = {
        knowledges: [
          {
            contentId: kContentId,
            versionId: kVersion1Id,
            revision: 1,
            type: 'vocabulary',
            expression: '歩く',
            reading: 'あるく',
            meaning: 'Đi bộ',
            examples: [
              {
                japanese: '駅まで歩く。',
                vietnamese: 'Đi bộ tới nhà ga.',
              },
            ],
          },
        ],
      };

      // Lần chạy trước bị đứt gánh: version đã ghi, nhưng item chưa kịp ghi
      const fakeVersions = new Map([
        [kVersion1Id, { _id: new ObjectId(kVersion1Id), revision: 1 }],
      ]);
      const fakeItems = new Map();

      const mockDb = {
        databaseName: 'chiikaiwa_test',
        collection: vi.fn((name) => {
          if (name === 'content_versions') {
            return {
              findOne: vi.fn(async (q) =>
                fakeVersions.get(q._id?.toHexString?.() || String(q._id)),
              ),
              insertOne: vi.fn(),
            };
          }
          if (name === 'content_items') {
            return {
              findOne: vi.fn(
                async (q) =>
                  fakeItems.get(q._id?.toHexString?.() || String(q._id)) ||
                  null,
              ),
              updateOne: vi.fn(async (filter, update) => {
                const idStr = filter._id?.toHexString?.() || String(filter._id);
                fakeItems.set(idStr, {
                  _id: filter._id,
                  ...update.$set,
                  ...update.$setOnInsert,
                });
              }),
            };
          }
          if (name === 'users') {
            return { findOne: vi.fn().mockResolvedValue(null) };
          }
          throw new Error(`Unexpected collection: ${name}`);
        }),
      };

      // @ts-expect-error mockDb satisfies partial interface
      const res = await seedContentDataset(mockDb, dataset);
      expect(res.success).toBe(true);
      // Version đã có -> skipped = 1
      expect(res.stats.knowledges.skipped).toBe(1);

      // Nhưng content_items bị thiếu đã được khôi phục thành công!
      expect(fakeItems.has(kContentId)).toBe(true);
      const recoveredItem = fakeItems.get(kContentId);
      expect(recoveredItem.kind).toBe('knowledge');
      expect(recoveredItem.status).toBe('published');
      expect(recoveredItem.publishedVersionId.toHexString()).toBe(kVersion1Id);
    });
  });

  describe('seedTestAccountFixtures & Security (02 §11.1)', () => {
    it('bắt buộc cung cấp SEED_ADMIN_PASSWORD để tạo tài khoản Admin, không dùng mật khẩu mặc định', async () => {
      const mockDb = {
        databaseName: 'chiikaiwa_test',
        collection: vi.fn((name) => {
          if (name === 'users') {
            return {
              findOne: vi.fn().mockResolvedValue(null),
              insertOne: vi.fn(),
            };
          }
          if (name === 'actor_states') return { updateOne: vi.fn() };
          if (name === 'statistics') return { updateOne: vi.fn() };
          return { updateOne: vi.fn() };
        }),
      };

      // Không truyền SEED_ADMIN_PASSWORD
      const originalEnv = process.env.SEED_ADMIN_PASSWORD;
      delete process.env.SEED_ADMIN_PASSWORD;

      try {
        // @ts-expect-error mockDb satisfies partial interface
        await expect(seedTestAccountFixtures(mockDb)).rejects.toThrow(
          /Bắt buộc cung cấp biến môi trường SEED_ADMIN_PASSWORD để khởi tạo tài khoản Admin/,
        );
      } finally {
        if (originalEnv) process.env.SEED_ADMIN_PASSWORD = originalEnv;
      }
    });

    it('nạp fixtures idempotent: lần 1 insert, lần 2 skip toàn bộ', async () => {
      const fakeUsers = new Map();
      const fakeActorStates = new Map();
      const fakeStats = new Map();

      const mockDb = {
        databaseName: 'chiikaiwa_test',
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
      const res1 = await seedTestAccountFixtures(mockDb, {
        adminPassword: 'ValidPassword123',
      });
      expect(res1.total).toBe(SEED_USER_FIXTURES.length);
      expect(res1.inserted).toBe(SEED_USER_FIXTURES.length);
      expect(res1.skipped).toBe(0);
      expect(fakeUsers.size).toBe(SEED_USER_FIXTURES.length);

      // Kiểm tra statistics baseline: startedSessions phải là 0
      const lifetimeStats = fakeStats.get('lifetime');
      expect(lifetimeStats?.$setOnInsert?.startedSessions).toBe(0);

      // Lần 2: chạy lại
      // @ts-expect-error mockDb satisfies partial interface
      const res2 = await seedTestAccountFixtures(mockDb, {
        adminPassword: 'ValidPassword123',
      });
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
      // Admin không có mật khẩu mặc định sẵn trong file fixtures
      expect(admin?.passwordHash).toBeNull();

      const locked = SEED_USER_FIXTURES.find((u) => u.status === 'locked');
      expect(locked).toBeDefined();
      expect(locked?.statusReason).toBe('compliance_hold');
    });

    it('tài khoản learnerC sử dụng goal và interests hoàn toàn hợp lệ theo catalog', () => {
      const learnerC = SEED_USER_FIXTURES.find(
        (u) => u.emailKey === 'learner.c@example.com',
      );
      expect(learnerC).toBeDefined();
      expect(learnerC?.profile?.level).toBe('N1');

      // Goal phải nằm trong GOAL_CODES
      expect(GOAL_CODES.has(learnerC?.profile?.goal || '')).toBe(true);
      expect(learnerC?.profile?.goal).toBe('studyAndWork');

      // Interests phải nằm trong INTEREST_CODES
      for (const interest of learnerC?.profile?.interests || []) {
        expect(INTEREST_CODES.has(interest)).toBe(true);
      }
    });

    it('hỗ trợ cấu hình mật khẩu Admin tùy biến qua biến môi trường hoặc options (06 §13.1.3)', async () => {
      const fakeUsers = new Map();
      const mockDb = {
        databaseName: 'chiikaiwa_test',
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
      expect(adminUser.passwordHash).toMatch(/^scrypt\$/);
    });
  });
});
