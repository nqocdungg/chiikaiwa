import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import {
  AVAILABLE_DATASETS,
  assertDatabaseNotProtected,
  isProtectedDatabase,
  seedAll,
  seedContentDataset,
  seedTestAccountFixtures,
} from '../../server/persistence/seed/seed-content.js';
import {
  SEED_ACCOUNT_IDS,
  SEED_USER_FIXTURES,
} from '../../server/persistence/seed/account-fixtures.js';
import { sampleDataset } from '../../server/persistence/seed/sample-content.js';
import { verifyPassword } from '../../server/modules/identity/crypto.js';
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

      // Chặn các tên database chứa chuỗi con test, dev, demo nhưng không phải segment riêng biệt
      expect(isProtectedDatabase('chiikaiwa_prod_latest')).toBe(true);
      expect(isProtectedDatabase('chiikaiwa_contest')).toBe(true);
      expect(isProtectedDatabase('attestation_prod')).toBe(true);
      expect(isProtectedDatabase('chiikaiwa_devops')).toBe(true);
      expect(isProtectedDatabase('chiikaiwa_demonstration')).toBe(true);

      // Chặn các tên database có chứa segment cấm prod, production, live dù có cả segment test hay dev (N1)
      expect(isProtectedDatabase('chiikaiwa_prod_test')).toBe(true);
      expect(isProtectedDatabase('prod_dev')).toBe(true);
      expect(isProtectedDatabase('chiikaiwa_demo_prod')).toBe(true);
      expect(isProtectedDatabase('dev_production')).toBe(true);
      expect(isProtectedDatabase('live_test_db')).toBe(true);
    });

    it('cho phép các tên database thuộc whitelist phát triển, demo và test', () => {
      expect(isProtectedDatabase('chiikaiwa_dev')).toBe(false);
      expect(isProtectedDatabase('chiikaiwa_demo')).toBe(false);
      expect(isProtectedDatabase('chiikaiwa_test')).toBe(false);
      expect(isProtectedDatabase('test_db_runner')).toBe(false);
      expect(isProtectedDatabase('demo_chiikaiwa')).toBe(false);
      expect(isProtectedDatabase('dev_chiikaiwa')).toBe(false);
      expect(isProtectedDatabase('chiikaiwa_test_seed_idempotency')).toBe(
        false,
      );
      expect(isProtectedDatabase('CHIIKAIWA_Demo')).toBe(false);
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
      expect(res.records[0].action).toBe('preserved');
      expect(res.stats.knowledges.skipped).toBe(1);

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
      expect(res.records[0].action).toBe('preserved');
      expect(res.stats.knowledges.skipped).toBe(1);

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
      // Version đã có nhưng item bị thiếu -> action: 'recovered', tăng synced thay vì skipped (F5)
      expect(res.stats.knowledges.synced).toBe(1);
      expect(res.stats.knowledges.skipped).toBe(0);

      // Nhưng content_items bị thiếu đã được khôi phục thành công!
      expect(fakeItems.has(kContentId)).toBe(true);
      const recoveredItem = fakeItems.get(kContentId);
      expect(recoveredItem.kind).toBe('knowledge');
      expect(recoveredItem.status).toBe('published');
      expect(recoveredItem.publishedVersionId.toHexString()).toBe(kVersion1Id);
    });

    it('bảo toàn draftPayload của Admin khi re-seed knowledge đã tồn tại (06 §7.1)', async () => {
      const kContentId = new ObjectId().toHexString();
      const kVersion1Id = new ObjectId().toHexString();

      const dataset = {
        knowledges: [
          {
            contentId: kContentId,
            versionId: kVersion1Id,
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

      const fakeVersions = new Map([
        [kVersion1Id, { _id: new ObjectId(kVersion1Id), revision: 1 }],
      ]);

      const adminDraftPayload = {
        type: 'vocabulary',
        expression: '食べる (đang sửa nháp)',
        reading: 'たべる',
        meaning: 'Ăn cơm (Admin draft)',
        examples: [
          {
            japanese: 'ご飯を食べる。',
            vietnamese: 'Ăn cơm (nháp).',
          },
        ],
      };

      const fakeItems = new Map([
        [
          kContentId,
          {
            _id: new ObjectId(kContentId),
            kind: 'knowledge',
            status: 'published',
            latestRevision: 1,
            publishedVersionId: new ObjectId(kVersion1Id),
            draftPayload: adminDraftPayload,
            version: 1,
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
                return { matchedCount: 1, modifiedCount: 1 };
              }),
            };
          }
          if (name === 'users')
            return { findOne: vi.fn().mockResolvedValue(null) };
          throw new Error(`Unexpected collection: ${name}`);
        }),
      };

      // @ts-expect-error mockDb satisfies partial interface
      const res = await seedContentDataset(mockDb, dataset);
      expect(res.success).toBe(true);

      const itemAfterSeed = fakeItems.get(kContentId);
      expect(itemAfterSeed?.draftPayload).toEqual(adminDraftPayload);
      expect(itemAfterSeed?.draftPayload?.meaning).toBe('Ăn cơm (Admin draft)');
    });

    it('bảo toàn draftPayload, level, title của deck khi re-seed (dùng sampleDataset thật)', async () => {
      const realDeck = sampleDataset.decks[0];
      expect(realDeck).toBeDefined();
      const deckContentId = realDeck.contentId;
      const deckVersionId = realDeck.versionId;

      const adminCustomDraftPayload = {
        title: 'Tiêu đề deck do Admin sửa nháp',
        description: 'Mô tả nháp',
        scenarioVersionIds: [],
      };

      const fakeItems = new Map([
        [
          deckContentId,
          {
            _id: new ObjectId(deckContentId),
            kind: 'deck',
            status: 'published',
            latestRevision: realDeck.revision || 1,
            publishedVersionId: new ObjectId(deckVersionId),
            level: 'N1', // Admin đã đổi level
            title: 'Tiêu đề deck do Admin sửa nháp', // Admin đã đổi title
            draftPayload: adminCustomDraftPayload,
            version: 1,
          },
        ],
      ]);

      const mockDb = {
        databaseName: 'chiikaiwa_test',
        collection: vi.fn((name) => {
          if (name === 'content_versions') {
            return {
              findOne: vi.fn(async (q) => ({
                _id: q._id,
                revision: 1,
              })),
              insertOne: vi.fn(),
            };
          }
          if (name === 'content_items') {
            return {
              findOne: vi.fn(async (q) => {
                const idStr = q._id?.toHexString?.() || String(q._id);
                if (fakeItems.has(idStr)) return fakeItems.get(idStr);
                return {
                  _id: q._id,
                  kind: 'knowledge',
                  status: 'published',
                  latestRevision: 1,
                  publishedVersionId: new ObjectId(),
                  version: 1,
                };
              }),
              updateOne: vi.fn(async (filter, update) => {
                const idStr = filter._id?.toHexString?.() || String(filter._id);
                const prev = fakeItems.get(idStr) || {};
                fakeItems.set(idStr, { ...prev, ...update.$set });
                return { matchedCount: 1, modifiedCount: 1 };
              }),
            };
          }
          if (name === 'users')
            return { findOne: vi.fn().mockResolvedValue(null) };
          throw new Error(`Unexpected collection: ${name}`);
        }),
      };

      // @ts-expect-error mockDb satisfies partial interface
      const res = await seedContentDataset(mockDb, sampleDataset);
      expect(res.success).toBe(true);

      const deckAfterSeed = fakeItems.get(deckContentId);
      expect(deckAfterSeed?.draftPayload).toEqual(adminCustomDraftPayload);
      expect(deckAfterSeed?.title).toBe('Tiêu đề deck do Admin sửa nháp');
      expect(deckAfterSeed?.level).toBe('N1');
    });

    it('cập nhật con trỏ khi item có latestRevision cũ hơn seed revision, và nháp vẫn được giữ nguyên', async () => {
      const kContentId = new ObjectId().toHexString();
      const kVersion1Id = new ObjectId().toHexString();
      const kVersion2Id = new ObjectId().toHexString();

      // Seed dataset mang revision 2
      const dataset = {
        knowledges: [
          {
            contentId: kContentId,
            versionId: kVersion2Id,
            revision: 2,
            type: 'vocabulary',
            expression: '書く',
            reading: 'かく',
            meaning: 'Viết',
            examples: [
              {
                japanese: '手紙を書く。',
                vietnamese: 'Viết thư.',
              },
            ],
          },
        ],
      };

      const fakeVersions = new Map();
      const adminDraft = { expression: 'Nháp của Admin' };

      // DB hiện đang ở revision 1
      const fakeItems = new Map([
        [
          kContentId,
          {
            _id: new ObjectId(kContentId),
            kind: 'knowledge',
            status: 'published',
            latestRevision: 1,
            publishedVersionId: new ObjectId(kVersion1Id),
            draftPayload: adminDraft,
            version: 1,
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
              insertOne: vi.fn(async (doc) =>
                fakeVersions.set(doc._id.toHexString(), doc),
              ),
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
                return { matchedCount: 1, modifiedCount: 1 };
              }),
            };
          }
          if (name === 'users')
            return { findOne: vi.fn().mockResolvedValue(null) };
          throw new Error(`Unexpected collection: ${name}`);
        }),
      };

      // @ts-expect-error mockDb satisfies partial interface
      const res = await seedContentDataset(mockDb, dataset);
      expect(res.success).toBe(true);

      const itemAfterSeed = fakeItems.get(kContentId);
      // Con trỏ được nâng lên revision 2
      expect(itemAfterSeed?.latestRevision).toBe(2);
      expect(itemAfterSeed?.publishedVersionId.toHexString()).toBe(kVersion2Id);
      // Bản nháp của Admin vẫn giữ nguyên
      expect(itemAfterSeed?.draftPayload).toEqual(adminDraft);
    });

    it('không gọi updateOne vào content_items khi re-seed không có thay đổi (no-op)', async () => {
      const kContentId = new ObjectId().toHexString();
      const kVersion1Id = new ObjectId().toHexString();

      const dataset = {
        knowledges: [
          {
            contentId: kContentId,
            versionId: kVersion1Id,
            revision: 1,
            type: 'vocabulary',
            expression: '聞く',
            reading: 'きく',
            meaning: 'Nghe',
            examples: [
              {
                japanese: '音楽を聞く。',
                vietnamese: 'Nghe nhạc.',
              },
            ],
          },
        ],
      };

      const fakeVersions = new Map([
        [kVersion1Id, { _id: new ObjectId(kVersion1Id), revision: 1 }],
      ]);

      const fakeItems = new Map([
        [
          kContentId,
          {
            _id: new ObjectId(kContentId),
            kind: 'knowledge',
            status: 'published',
            latestRevision: 1,
            publishedVersionId: new ObjectId(kVersion1Id),
            version: 1,
            updatedAt: new Date('2026-11-01T00:00:00.000Z'),
          },
        ],
      ]);

      const updateOneSpy = vi.fn();

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
              updateOne: updateOneSpy,
            };
          }
          if (name === 'users')
            return { findOne: vi.fn().mockResolvedValue(null) };
          throw new Error(`Unexpected collection: ${name}`);
        }),
      };

      // @ts-expect-error mockDb satisfies partial interface
      const res = await seedContentDataset(mockDb, dataset);
      expect(res.success).toBe(true);

      // Hoàn toàn không gọi updateOne vào content_items
      expect(updateOneSpy).not.toHaveBeenCalled();
    });

    it('CAS: Admin publish revision mới xen giữa findOne và updateOne thì seed không tua lại về revision cũ', async () => {
      const kContentId = new ObjectId().toHexString();
      const kVersion1Id = new ObjectId().toHexString();
      const kVersion2Id = new ObjectId().toHexString();
      const kVersion3Id = new ObjectId().toHexString();

      // Seed muốn cập nhật lên revision 2
      const dataset = {
        knowledges: [
          {
            contentId: kContentId,
            versionId: kVersion2Id,
            revision: 2,
            type: 'vocabulary',
            expression: '話す',
            reading: 'はなす',
            meaning: 'Nói chuyện',
            examples: [
              {
                japanese: '友達と話す。',
                vietnamese: 'Nói chuyện với bạn.',
              },
            ],
          },
        ],
      };

      const fakeVersions = new Map([
        [kVersion1Id, { _id: new ObjectId(kVersion1Id), revision: 1 }],
        [kVersion2Id, { _id: new ObjectId(kVersion2Id), revision: 2 }],
        [kVersion3Id, { _id: new ObjectId(kVersion3Id), revision: 3 }],
      ]);

      // DB ban đầu ở revision 1, version 1
      const dbItem = {
        _id: new ObjectId(kContentId),
        kind: 'knowledge',
        status: 'published',
        latestRevision: 1,
        publishedVersionId: new ObjectId(kVersion1Id),
        version: 1,
      };

      let findOneCount = 0;
      const updateOneSpy = vi.fn(async (filter, update) => {
        // Kiểm tra filter có khớp chính xác dữ liệu trong DB tại thời điểm ghi không
        // Nếu filter không chứa CAS (ví dụ không lọc version hay latestRevision), update sẽ ghi đè
        const matchesId = filter._id.toHexString() === dbItem._id.toHexString();
        const matchesRevision =
          !('latestRevision' in filter) ||
          filter.latestRevision === dbItem.latestRevision;
        const matchesStatus =
          !('status' in filter) || filter.status === dbItem.status;
        const matchesVersion =
          !('version' in filter) || filter.version === dbItem.version;

        if (matchesId && matchesRevision && matchesStatus && matchesVersion) {
          Object.assign(dbItem, update.$set);
          if (update.$inc?.version) dbItem.version += update.$inc.version;
          return { matchedCount: 1, modifiedCount: 1 };
        }
        return { matchedCount: 0, modifiedCount: 0 };
      });

      const mockDb = {
        databaseName: 'chiikaiwa_test',
        collection: vi.fn((name) => {
          if (name === 'content_versions') {
            return {
              findOne: vi.fn(async (q) => {
                if (q.contentId && q.revision) {
                  for (const ver of fakeVersions.values()) {
                    if (ver.revision === q.revision) return ver;
                  }
                  return null;
                }
                return fakeVersions.get(
                  q._id?.toHexString?.() || String(q._id),
                );
              }),
              insertOne: vi.fn(),
            };
          }
          if (name === 'content_items') {
            return {
              findOne: vi.fn(async () => {
                findOneCount++;
                if (findOneCount === 1) {
                  // Lần đọc 1: Seed đọc được snapshot revision 1, version 1
                  const snapshot = { ...dbItem };
                  // Ngay sau khi seed đọc xong, Admin lập tức publish revision 3 xen giữa
                  dbItem.latestRevision = 3;
                  dbItem.publishedVersionId = new ObjectId(kVersion3Id);
                  dbItem.version = 2;
                  return snapshot;
                }
                // Lần đọc 2 (CAS retry): Seed đọc thấy dữ liệu mới do Admin đã cập nhật
                return { ...dbItem };
              }),
              updateOne: updateOneSpy,
            };
          }
          if (name === 'users')
            return { findOne: vi.fn().mockResolvedValue(null) };
          throw new Error(`Unexpected collection: ${name}`);
        }),
      };

      // @ts-expect-error mockDb satisfies partial interface
      const res = await seedContentDataset(mockDb, dataset);
      expect(res.success).toBe(true);

      // 1. Phải gọi updateOne với filter CAS đầy đủ (bắt buộc có latestRevision, status, version)
      // và update set phải chứa $inc: { version: 1 } (F1: nếu bỏ CAS, assert này sẽ bắt lỗi)
      expect(updateOneSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: new ObjectId(kContentId),
          latestRevision: 1,
          status: 'published',
          version: 1,
        }),
        expect.objectContaining({
          $set: expect.objectContaining({
            latestRevision: 2,
            publishedVersionId: new ObjectId(kVersion2Id),
          }),
          $inc: { version: 1 },
        }),
      );

      // 2. Con trỏ trong DB ảo vẫn giữ nguyên ở revision 3 của Admin, không bị tua lùi về 2
      expect(dbItem.latestRevision).toBe(3);
      expect(dbItem.publishedVersionId.toHexString()).toBe(kVersion3Id);
      expect(dbItem.version).toBe(2);
    });

    it('ném lỗi bảo vệ tính bất biến khi revision đã tồn tại với versionId khác (06 §13.1.5)', async () => {
      const kContentId = new ObjectId().toHexString();
      const kOldVersionId = new ObjectId().toHexString();
      const kNewVersionId = new ObjectId().toHexString();

      const dataset = {
        knowledges: [
          {
            contentId: kContentId,
            versionId: kNewVersionId,
            revision: 1,
            type: 'vocabulary',
            expression: '本',
            reading: 'ほん',
            meaning: 'Sách',
            examples: [{ japanese: '本を読む。', vietnamese: 'Đọc sách.' }],
          },
        ],
      };

      const mockDb = {
        databaseName: 'chiikaiwa_test',
        collection: vi.fn((name) => {
          if (name === 'content_versions') {
            return {
              findOne: vi.fn(async (q) => {
                if (q.contentId && q.revision === 1) {
                  return { _id: new ObjectId(kOldVersionId), revision: 1 };
                }
                return null;
              }),
              insertOne: vi.fn(),
            };
          }
          if (name === 'content_items')
            return { findOne: vi.fn(), updateOne: vi.fn() };
          if (name === 'users')
            return { findOne: vi.fn().mockResolvedValue(null) };
          throw new Error(`Unexpected collection: ${name}`);
        }),
      };

      // @ts-expect-error mockDb satisfies partial interface
      const res = await seedContentDataset(mockDb, dataset);
      expect(res.success).toBe(false);
      expect(res.errors[0]?.message).toMatch(
        /Xung đột revision: contentId '.*' revision 1 đã tồn tại với versionId '.*' khác với seed versionId '.*'/,
      );
    });

    it('xử lý race condition khi 2 tiến trình seed cùng insert version và đụng code 11000 (Item 4)', async () => {
      const kContentId = new ObjectId().toHexString();
      const kVersionId = new ObjectId().toHexString();

      const dataset = {
        knowledges: [
          {
            contentId: kContentId,
            versionId: kVersionId,
            revision: 1,
            type: 'vocabulary',
            expression: '話す',
            reading: 'はなす',
            meaning: 'Nói chuyện',
            examples: [{ japanese: '話す。', vietnamese: 'Nói chuyện.' }],
          },
        ],
      };

      let findCount = 0;
      const mockVersionsColl = {
        findOne: vi.fn(async () => {
          findCount++;
          // Code gọi findOne hai lần trước insertOne (lần 1 theo {contentId, revision}, lần 2 theo {_id: versionId})
          if (findCount <= 2) return null;
          // Lần 3 (sau khi insertOne ném 11000): tìm lại thấy versionId đúng do tiến trình 2 vừa insert
          return { _id: new ObjectId(kVersionId), revision: 1 };
        }),
        insertOne: vi.fn(async () => {
          // Tiến trình khác vừa insert trước -> MongoDB ném E11000 duplicate key
          const err = new Error('E11000 duplicate key error');
          /** @type {any} */ (err).code = 11000;
          throw err;
        }),
      };

      const mockDb = {
        databaseName: 'chiikaiwa_test',
        collection: vi.fn((name) => {
          if (name === 'content_versions') return mockVersionsColl;
          if (name === 'content_items') {
            return {
              findOne: vi.fn().mockResolvedValue(null),
              updateOne: vi.fn().mockResolvedValue({ matchedCount: 1 }),
            };
          }
          if (name === 'users')
            return { findOne: vi.fn().mockResolvedValue(null) };
          throw new Error(`Unexpected collection: ${name}`);
        }),
      };

      // @ts-expect-error mockDb satisfies partial interface
      const res = await seedContentDataset(mockDb, dataset);
      expect(res.success).toBe(true);
      expect(mockVersionsColl.insertOne).toHaveBeenCalledTimes(1);
      expect(res.stats.knowledges.inserted).toBe(0); // version do tiến trình song song tạo
      expect(res.stats.knowledges.synced).toBe(1); // item được phục hồi thành công
    });

    it('race condition 11000: ném lỗi vào errors khi insertOne đụng 11000 nhưng findOne sau đó vẫn null (T1 Test A)', async () => {
      const kContentId = new ObjectId().toHexString();
      const kVersionId = new ObjectId().toHexString();

      const dataset = {
        knowledges: [
          {
            contentId: kContentId,
            versionId: kVersionId,
            revision: 1,
            type: 'vocabulary',
            expression: '聞く',
            reading: 'きく',
            meaning: 'Nghe',
            examples: [{ japanese: '音楽を聞く。', vietnamese: 'Nghe nhạc.' }],
          },
        ],
      };

      const mockVersionsColl = {
        // Mọi lần findOne đều trả về null
        findOne: vi.fn().mockResolvedValue(null),
        insertOne: vi.fn(async () => {
          const err = new Error(
            'E11000 duplicate key error on index (contentId, revision)',
          );
          /** @type {any} */ (err).code = 11000;
          throw err;
        }),
      };

      const mockDb = {
        databaseName: 'chiikaiwa_test',
        collection: vi.fn((name) => {
          if (name === 'content_versions') return mockVersionsColl;
          if (name === 'content_items') {
            return {
              findOne: vi.fn().mockResolvedValue(null),
              updateOne: vi.fn(),
            };
          }
          if (name === 'users')
            return { findOne: vi.fn().mockResolvedValue(null) };
          throw new Error(`Unexpected collection: ${name}`);
        }),
      };

      // @ts-expect-error mockDb satisfies partial interface
      const res = await seedContentDataset(mockDb, dataset);
      expect(res.success).toBe(false);
      expect(res.errors).toHaveLength(1);
      expect(res.errors[0].message).toMatch(/duplicate key/i);
    });

    it('race condition 11000 khi upsert content_items: updateOne lần 1 đụng 11000, lần 2 thành công (T1 Test B)', async () => {
      const kContentId = new ObjectId().toHexString();
      const kVersionId = new ObjectId().toHexString();

      const dataset = {
        knowledges: [
          {
            contentId: kContentId,
            versionId: kVersionId,
            revision: 1,
            type: 'vocabulary',
            expression: '書く',
            reading: 'かく',
            meaning: 'Viết',
            examples: [{ japanese: '手紙を書く。', vietnamese: 'Viết thư.' }],
          },
        ],
      };

      let itemFindCount = 0;
      let itemUpdateCount = 0;

      const mockDb = {
        databaseName: 'chiikaiwa_test',
        collection: vi.fn((name) => {
          if (name === 'content_versions') {
            return {
              findOne: vi.fn().mockResolvedValue(null),
              insertOne: vi
                .fn()
                .mockResolvedValue({ insertedId: new ObjectId(kVersionId) }),
            };
          }
          if (name === 'content_items') {
            return {
              findOne: vi.fn(async () => {
                itemFindCount++;
                if (itemFindCount === 1) return null;
                // Lần 2: tiến trình song song đã insert xong item với con trỏ khớp đúng
                return {
                  _id: new ObjectId(kContentId),
                  kind: 'knowledge',
                  status: 'published',
                  latestRevision: 1,
                  publishedVersionId: new ObjectId(kVersionId),
                  version: 0,
                };
              }),
              updateOne: vi.fn(async () => {
                itemUpdateCount++;
                if (itemUpdateCount === 1) {
                  const err = new Error('E11000 duplicate key error on _id');
                  /** @type {any} */ (err).code = 11000;
                  throw err;
                }
                return { matchedCount: 1 };
              }),
            };
          }
          if (name === 'users')
            return { findOne: vi.fn().mockResolvedValue(null) };
          throw new Error(`Unexpected collection: ${name}`);
        }),
      };

      // @ts-expect-error mockDb satisfies partial interface
      const res = await seedContentDataset(mockDb, dataset);
      expect(res.success).toBe(true);
      expect(itemUpdateCount).toBeGreaterThanOrEqual(1);
    });

    it('thống kê chính xác khi version mới được chèn nhưng item đang hidden (action preserved, T5)', async () => {
      const kContentId = new ObjectId().toHexString();
      const kVersion2Id = new ObjectId().toHexString();

      const dataset = {
        knowledges: [
          {
            contentId: kContentId,
            versionId: kVersion2Id,
            revision: 2,
            type: 'vocabulary',
            expression: '見る',
            reading: 'みる',
            meaning: 'Nhìn',
            examples: [{ japanese: 'テレビを見る。', vietnamese: 'Xem tivi.' }],
          },
        ],
      };

      const fakeVersions = new Map();
      const fakeItems = new Map([
        [
          kContentId,
          {
            _id: new ObjectId(kContentId),
            kind: 'knowledge',
            status: 'hidden',
            latestRevision: 2,
            publishedVersionId: new ObjectId(kVersion2Id),
            version: 1,
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
              insertOne: vi.fn(async (doc) => {
                fakeVersions.set(doc._id.toHexString(), doc);
                return { insertedId: doc._id };
              }),
            };
          }
          if (name === 'content_items') {
            return {
              findOne: vi.fn(async (q) =>
                fakeItems.get(q._id?.toHexString?.() || String(q._id)),
              ),
              updateOne: vi
                .fn()
                .mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }),
            };
          }
          if (name === 'users')
            return { findOne: vi.fn().mockResolvedValue(null) };
          throw new Error(`Unexpected collection: ${name}`);
        }),
      };

      // @ts-expect-error mockDb satisfies partial interface
      const res = await seedContentDataset(mockDb, dataset);
      expect(res.success).toBe(true);
      expect(res.stats.knowledges.inserted).toBe(1); // Version mới được ghi
      expect(res.stats.knowledges.skipped).toBe(0);
      expect(res.records[0].action).toBe('preserved');
      expect(res.records[0].versionInserted).toBe(true);
    });

    it('CAS: ném lỗi vào errors nếu updateOne upsert ném code 11000 liên tiếp quá 3 lần (T6)', async () => {
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
              { japanese: '道を歩く。', vietnamese: 'Đi bộ trên đường.' },
            ],
          },
        ],
      };

      const mockDb = {
        databaseName: 'chiikaiwa_test',
        collection: vi.fn((name) => {
          if (name === 'content_versions') {
            return {
              findOne: vi.fn().mockResolvedValue(null),
              insertOne: vi
                .fn()
                .mockResolvedValue({ insertedId: new ObjectId(kVersion1Id) }),
            };
          }
          if (name === 'content_items') {
            return {
              findOne: vi.fn().mockResolvedValue(null),
              updateOne: vi.fn(async () => {
                const err = new Error('E11000 duplicate key');
                /** @type {any} */ (err).code = 11000;
                throw err;
              }),
            };
          }
          if (name === 'users')
            return { findOne: vi.fn().mockResolvedValue(null) };
          throw new Error(`Unexpected collection: ${name}`);
        }),
      };

      // @ts-expect-error mockDb satisfies partial interface
      const res = await seedContentDataset(mockDb, dataset);
      expect(res.success).toBe(false);
      expect(res.errors).toHaveLength(1);
      expect(res.errors[0].message).toMatch(
        /Không đồng bộ được content_items .* sau 3 lần thử/,
      );
    });

    it('CAS: kiểm tra filter chứa version: { $exists: false } khi item trong DB chưa có trường version (T8b)', async () => {
      const kContentId = new ObjectId().toHexString();
      const kVersion2Id = new ObjectId().toHexString();

      const dataset = {
        knowledges: [
          {
            contentId: kContentId,
            versionId: kVersion2Id,
            revision: 2,
            type: 'vocabulary',
            expression: '走る',
            reading: 'はしる',
            meaning: 'Chạy',
            examples: [{ japanese: '速く走る。', vietnamese: 'Chạy nhanh.' }],
          },
        ],
      };

      /** @type {any} */
      let capturedCasFilter = null;
      const mockDb = {
        databaseName: 'chiikaiwa_test',
        collection: vi.fn((name) => {
          if (name === 'content_versions') {
            return {
              findOne: vi.fn().mockResolvedValue(null),
              insertOne: vi
                .fn()
                .mockResolvedValue({ insertedId: new ObjectId(kVersion2Id) }),
            };
          }
          if (name === 'content_items') {
            return {
              // Item document cũ chưa có trường version
              findOne: vi.fn().mockResolvedValue({
                _id: new ObjectId(kContentId),
                kind: 'knowledge',
                status: 'published',
                latestRevision: 1,
                publishedVersionId: new ObjectId(),
                // Không có trường version
              }),
              updateOne: vi.fn(async (filter) => {
                capturedCasFilter = filter;
                return { matchedCount: 1 };
              }),
            };
          }
          if (name === 'users')
            return { findOne: vi.fn().mockResolvedValue(null) };
          throw new Error(`Unexpected collection: ${name}`);
        }),
      };

      // @ts-expect-error mockDb satisfies partial interface
      const res = await seedContentDataset(mockDb, dataset);
      expect(res.success).toBe(true);
      expect(capturedCasFilter).not.toBeNull();
      expect(capturedCasFilter?.version).toEqual({ $exists: false });
    });

    it('CAS: ghi nhận lỗi vào errors nếu content_items bị thay đổi phiên bản liên tục quá 3 lần', async () => {
      const kContentId = new ObjectId().toHexString();
      const kVersion1Id = new ObjectId().toHexString();

      const dataset = {
        knowledges: [
          {
            contentId: kContentId,
            versionId: kVersion1Id,
            revision: 2,
            type: 'vocabulary',
            expression: '立つ',
            reading: 'たつ',
            meaning: 'Đứng',
            examples: [
              {
                japanese: '立ち上がる。',
                vietnamese: 'Đứng dậy.',
              },
            ],
          },
        ],
      };

      const mockDb = {
        databaseName: 'chiikaiwa_test',
        collection: vi.fn((name) => {
          if (name === 'content_versions') {
            return {
              findOne: vi.fn().mockResolvedValue(null),
              insertOne: vi.fn(),
            };
          }
          if (name === 'content_items') {
            return {
              findOne: vi.fn(async () => ({
                _id: new ObjectId(kContentId),
                kind: 'knowledge',
                status: 'published',
                latestRevision: 1,
                publishedVersionId: new ObjectId(kVersion1Id),
                version: Math.random(), // version luôn thay đổi
              })),
              // Luôn trả về matchedCount = 0 giả lập race condition
              updateOne: vi
                .fn()
                .mockResolvedValue({ matchedCount: 0, modifiedCount: 0 }),
            };
          }
          if (name === 'users')
            return { findOne: vi.fn().mockResolvedValue(null) };
          throw new Error(`Unexpected collection: ${name}`);
        }),
      };

      // @ts-expect-error mockDb satisfies partial interface
      const res = await seedContentDataset(mockDb, dataset);
      expect(res.success).toBe(false);
      expect(res.errors[0]?.message).toMatch(
        /Không đồng bộ được content_items .* do bị thay đổi đồng thời sau 3 lần thử/,
      );
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

      const generatedAdminPassword = randomBytes(16).toString('hex') + 'Aa1!';
      // @ts-expect-error mockDb satisfies partial interface
      const res1 = await seedTestAccountFixtures(mockDb, {
        adminPassword: generatedAdminPassword,
      });
      expect(res1.total).toBe(SEED_USER_FIXTURES.length);
      expect(res1.inserted).toBe(SEED_USER_FIXTURES.length);
      expect(res1.skipped).toBe(0);
      expect(fakeUsers.size).toBe(SEED_USER_FIXTURES.length);

      // Kiểm tra statistics baseline: startedSessions phải là 0
      const lifetimeStats = fakeStats.get('lifetime');
      expect(lifetimeStats?.$setOnInsert?.startedSessions).toBe(0);
      expect(lifetimeStats?.$inc?.registeredAccounts).toBe(
        SEED_USER_FIXTURES.length,
      );

      // Lần 2: chạy lại
      // @ts-expect-error mockDb satisfies partial interface
      const res2 = await seedTestAccountFixtures(mockDb, {
        adminPassword: generatedAdminPassword,
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

      const customAdminPass = randomBytes(16).toString('hex') + 'Aa1!';
      // @ts-expect-error mockDb satisfies partial interface
      await seedTestAccountFixtures(mockDb, {
        adminPassword: customAdminPass,
      });

      const adminUser = fakeUsers.get('admin@example.com');
      expect(adminUser).toBeDefined();
      expect(adminUser.passwordHash).toMatch(/^scrypt\$/);
    });

    it('sinh mật khẩu ngẫu nhiên cho user khi không có SEED_USER_PASSWORD và dùng SEED_USER_PASSWORD nếu có', async () => {
      const fakeUsers = new Map();
      const mockDb = {
        databaseName: 'chiikaiwa_test',
        collection: vi.fn((name) => {
          if (name === 'users') {
            return {
              findOne: vi.fn(async (q) => fakeUsers.get(q.emailKey) || null),
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

      const customUserPass = randomBytes(16).toString('hex') + 'Aa1!';
      const adminPass = randomBytes(16).toString('hex') + 'Aa1!';

      // 1. Chạy với userPassword truyền vào
      // @ts-expect-error mockDb satisfies partial interface
      await seedTestAccountFixtures(mockDb, {
        adminPassword: adminPass,
        userPassword: customUserPass,
      });

      const learnerA = fakeUsers.get('learner.a@example.com');
      expect(learnerA).toBeDefined();
      expect(await verifyPassword(customUserPass, learnerA.passwordHash)).toBe(
        true,
      );

      // 2. Chạy không có userPassword trên DB mới: phải tự sinh ngẫu nhiên mật khẩu băm scrypt hợp lệ
      const fakeUsers2 = new Map();
      const mockDb2 = {
        databaseName: 'chiikaiwa_test',
        collection: vi.fn((name) => {
          if (name === 'users') {
            return {
              findOne: vi.fn(async (q) => fakeUsers2.get(q.emailKey) || null),
              insertOne: vi.fn(async (doc) => {
                fakeUsers2.set(doc.emailKey, doc);
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

      const origEnvUserPass = process.env.SEED_USER_PASSWORD;
      delete process.env.SEED_USER_PASSWORD;

      try {
        // @ts-expect-error mockDb satisfies partial interface
        await seedTestAccountFixtures(mockDb2, {
          adminPassword: adminPass,
        });

        const learnerA2 = fakeUsers2.get('learner.a@example.com');
        const learnerB2 = fakeUsers2.get('learner.b@example.com');
        expect(learnerA2.passwordHash).toMatch(/^scrypt\$/);
        expect(learnerB2.passwordHash).toMatch(/^scrypt\$/);
        // Hai tài khoản phải có 2 hash ngẫu nhiên khác nhau
        expect(learnerA2.passwordHash).not.toBe(learnerB2.passwordHash);
      } finally {
        if (origEnvUserPass) process.env.SEED_USER_PASSWORD = origEnvUserPass;
      }
    });

    it('Fail-fast: ném lỗi ngay khi thiếu SEED_ADMIN_PASSWORD trước khi ghi content hoặc user (F2)', async () => {
      const origEnvAdmin = process.env.SEED_ADMIN_PASSWORD;
      delete process.env.SEED_ADMIN_PASSWORD;

      const mockUsersColl = {
        findOne: vi.fn().mockResolvedValue(null),
        insertOne: vi.fn(),
      };
      const mockItemsColl = {
        findOne: vi.fn(),
        updateOne: vi.fn(),
      };
      const mockVersionsColl = {
        findOne: vi.fn(),
        insertOne: vi.fn(),
      };

      const mockDb = {
        databaseName: 'chiikaiwa_test',
        collection: vi.fn((name) => {
          if (name === 'users') return mockUsersColl;
          if (name === 'content_items') return mockItemsColl;
          if (name === 'content_versions') return mockVersionsColl;
          if (name === 'actor_states') return { updateOne: vi.fn() };
          if (name === 'statistics') return { updateOne: vi.fn() };
          throw new Error(`Unexpected collection: ${name}`);
        }),
      };

      try {
        await expect(
          seedAll(/** @type {any} */ (mockDb), { includeFixtures: true }),
        ).rejects.toThrow(
          /Bắt buộc cung cấp biến môi trường SEED_ADMIN_PASSWORD/,
        );

        // Tuyệt đối không ghi bất kỳ bản ghi nào vào users, content_versions hoặc content_items
        expect(mockUsersColl.insertOne).not.toHaveBeenCalled();
        expect(mockItemsColl.updateOne).not.toHaveBeenCalled();
        expect(mockVersionsColl.insertOne).not.toHaveBeenCalled();
      } finally {
        if (origEnvAdmin) process.env.SEED_ADMIN_PASSWORD = origEnvAdmin;
      }
    });

    it('tự phục hồi actor_states bị thiếu khi user đã tồn tại từ trước (partial-failure healing, Item 2)', async () => {
      const fakeUsers = new Map([
        [
          'learner.a@example.com',
          {
            _id: new ObjectId(SEED_ACCOUNT_IDS.learnerA),
            emailKey: 'learner.a@example.com',
          },
        ],
      ]);
      /** @type {Array<{ filter: any, update: any }>} */
      const actorStatesUpserts = [];

      const mockDb = {
        databaseName: 'chiikaiwa_test',
        collection: vi.fn((name) => {
          if (name === 'users') {
            return {
              findOne: vi.fn(async (q) => fakeUsers.get(q.emailKey) || null),
              insertOne: vi.fn(async (doc) => {
                fakeUsers.set(doc.emailKey, doc);
                return { insertedId: doc._id };
              }),
            };
          }
          if (name === 'actor_states') {
            return {
              updateOne: vi.fn(async (filter, update) => {
                actorStatesUpserts.push({ filter, update });
                return { matchedCount: 1 };
              }),
            };
          }
          if (name === 'statistics')
            return { updateOne: vi.fn().mockResolvedValue({}) };
          throw new Error(`Unexpected collection: ${name}`);
        }),
      };

      // @ts-expect-error mockDb satisfies partial interface
      await seedTestAccountFixtures(mockDb, {
        adminPassword: 'AdminPassword123!',
      });

      // Phải có lệnh upsert actor_state cho learner.a dù user đã có từ trước
      const learnerStateUpsert = actorStatesUpserts.find(
        (u) => u.filter._id === `user:${SEED_ACCOUNT_IDS.learnerA}`,
      );
      expect(learnerStateUpsert).toBeDefined();
      expect(learnerStateUpsert?.update.$setOnInsert.mode).toBe('idle');
      expect(learnerStateUpsert?.update.$setOnInsert.version).toBe(0);
    });

    it('Fail-fast liên dataset: từ chối toàn bộ và không ghi bất kỳ dataset nào nếu có 1 dataset không hợp lệ (Item 3)', async () => {
      const mockUsersColl = { findOne: vi.fn(), insertOne: vi.fn() };
      const mockItemsColl = { findOne: vi.fn(), updateOne: vi.fn() };
      const mockVersionsColl = { findOne: vi.fn(), insertOne: vi.fn() };

      const mockDb = {
        databaseName: 'chiikaiwa_test',
        collection: vi.fn((name) => {
          if (name === 'users') return mockUsersColl;
          if (name === 'content_items') return mockItemsColl;
          if (name === 'content_versions') return mockVersionsColl;
          throw new Error(`Unexpected collection: ${name}`);
        }),
      };

      // Chạy với 1 dataset hợp lệ và 1 tên dataset không tồn tại
      await expect(
        seedAll(/** @type {any} */ (mockDb), {
          datasets: ['sample', 'dataset_khong_ton_tai'],
        }),
      ).rejects.toThrow(
        /Không tìm thấy dataset với tên 'dataset_khong_ton_tai'/,
      );

      // Tuyệt đối không có lệnh ghi nào được thực hiện vào database
      expect(mockItemsColl.updateOne).not.toHaveBeenCalled();
      expect(mockVersionsColl.insertOne).not.toHaveBeenCalled();
    });

    it('Fail-fast liên dataset khi schema sai: từ chối và trả về lỗi trước khi ghi bất kỳ dataset nào (T7b)', async () => {
      const mockUsersColl = { findOne: vi.fn(), insertOne: vi.fn() };
      const mockItemsColl = { findOne: vi.fn(), updateOne: vi.fn() };
      const mockVersionsColl = { findOne: vi.fn(), insertOne: vi.fn() };

      const mockDb = {
        databaseName: 'chiikaiwa_test',
        collection: vi.fn((name) => {
          if (name === 'users') return mockUsersColl;
          if (name === 'content_items') return mockItemsColl;
          if (name === 'content_versions') return mockVersionsColl;
          throw new Error(`Unexpected collection: ${name}`);
        }),
      };

      try {
        AVAILABLE_DATASETS.bad_dataset = {
          knowledges: [
            {
              contentId: 'not-an-oid',
              versionId: new ObjectId().toHexString(),
              revision: 1,
              type: 'vocabulary',
              expression: 'テスト',
            },
          ],
        };

        const res = await seedAll(/** @type {any} */ (mockDb), {
          datasets: ['sample', 'bad_dataset'],
        });
        expect(res.success).toBe(false);
        expect(res.datasets).toHaveLength(1);
        expect(res.datasets[0].datasetName).toBe('bad_dataset');
        expect(res.datasets[0].errors.length).toBeGreaterThan(0);
        expect(res.datasets[0].errors[0].message).toMatch(
          /ObjectId|contentId/i,
        );

        // Tuyệt đối không ghi bản ghi nào của sample hay bad_dataset
        expect(mockItemsColl.updateOne).not.toHaveBeenCalled();
        expect(mockVersionsColl.insertOne).not.toHaveBeenCalled();
      } finally {
        delete AVAILABLE_DATASETS.bad_dataset;
      }
    });

    it('Cảnh báo mật khẩu ngẫu nhiên chỉ in 1 lần sau vòng lặp và tắt khi user đã có hoặc có userPassword (T2a)', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      try {
        const fakeUsers = new Map();
        const mockDb = {
          databaseName: 'chiikaiwa_test',
          collection: vi.fn((name) => {
            if (name === 'users') {
              return {
                findOne: vi.fn(async (q) => fakeUsers.get(q.emailKey) || null),
                insertOne: vi.fn(async (doc) => {
                  fakeUsers.set(doc.emailKey, doc);
                  return { insertedId: doc._id };
                }),
              };
            }
            if (name === 'actor_states') return { updateOne: vi.fn() };
            if (name === 'statistics') return { updateOne: vi.fn() };
            throw new Error(`Unexpected collection: ${name}`);
          }),
        };

        // Lần 1: DB rỗng + không có userPassword -> warn đúng 1 lần
        warnSpy.mockClear();
        infoSpy.mockClear();
        // @ts-expect-error mockDb satisfies partial interface
        await seedTestAccountFixtures(mockDb, {
          adminPassword: 'AdminPassword123!',
        });
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy.mock.calls[0][0]).toContain('[seed:warning]');
        expect(warnSpy.mock.calls[0][0]).toContain('SEED_USER_PASSWORD');

        // Lần 2: Mọi user đã tồn tại + có userPassword -> info được gọi đúng 1 lần duy nhất (S3) và warn 0 lần
        warnSpy.mockClear();
        infoSpy.mockClear();
        // @ts-expect-error mockDb satisfies partial interface
        await seedTestAccountFixtures(mockDb, {
          adminPassword: 'AdminPassword123!',
          userPassword: 'UserPassword123!',
        });
        expect(warnSpy).toHaveBeenCalledTimes(0);
        expect(infoSpy).toHaveBeenCalledTimes(1);
        expect(infoSpy.mock.calls[0][0]).toContain('tài khoản đã tồn tại');

        // Lần 3: DB mới nhưng có userPassword cấu hình -> warn 0 lần, info 0 lần
        fakeUsers.clear();
        warnSpy.mockClear();
        infoSpy.mockClear();
        // @ts-expect-error mockDb satisfies partial interface
        await seedTestAccountFixtures(mockDb, {
          adminPassword: 'AdminPassword123!',
          userPassword: 'UserPassword123!',
        });
        expect(warnSpy).toHaveBeenCalledTimes(0);
        expect(infoSpy).toHaveBeenCalledTimes(0);
      } finally {
        warnSpy.mockRestore();
        infoSpy.mockRestore();
      }
    });

    it('Cảnh báo thiếu Admin: tắt khi seedAll includeFixtures, bật khi content-only hoặc seedContentDataset mặc định (T2b)', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      try {
        const mockDb = {
          databaseName: 'chiikaiwa_test',
          collection: vi.fn((name) => {
            if (name === 'users') {
              return {
                findOne: vi.fn().mockResolvedValue(null),
                insertOne: vi.fn().mockResolvedValue({}),
              };
            }
            if (name === 'content_versions') {
              return {
                findOne: vi.fn().mockResolvedValue(null),
                insertOne: vi.fn().mockResolvedValue({}),
              };
            }
            if (name === 'content_items') {
              return {
                findOne: vi.fn().mockResolvedValue(null),
                updateOne: vi.fn().mockResolvedValue({ matchedCount: 1 }),
              };
            }
            if (name === 'actor_states' || name === 'statistics') {
              return { updateOne: vi.fn().mockResolvedValue({}) };
            }
            throw new Error(`Unexpected collection: ${name}`);
          }),
        };

        // 1. seedAll với includeFixtures: true (mặc định) -> không warn cảnh báo thiếu Admin
        warnSpy.mockClear();
        // @ts-expect-error mockDb satisfies partial interface
        const r1 = await seedAll(mockDb, {
          datasets: ['sample'],
          includeFixtures: true,
          adminPassword: 'AdminPassword123!',
        });
        expect(r1.success).toBe(true);
        expect(r1.summary.totalInserted).toBeGreaterThan(0);
        const missingAdminWarns1 = warnSpy.mock.calls.filter((call) =>
          String(call[0]).includes('Chưa có tài khoản Admin'),
        );
        expect(missingAdminWarns1).toHaveLength(0);

        // 2. seedAll với includeFixtures: false -> warn đúng 1 lần
        warnSpy.mockClear();
        // @ts-expect-error mockDb satisfies partial interface
        const r2 = await seedAll(mockDb, {
          datasets: ['sample'],
          includeFixtures: false,
        });
        expect(r2.success).toBe(true);
        const missingAdminWarns2 = warnSpy.mock.calls.filter((call) =>
          String(call[0]).includes('Chưa có tài khoản Admin'),
        );
        expect(missingAdminWarns2).toHaveLength(1);

        // 3. seedContentDataset mặc định -> warn đúng 1 lần
        warnSpy.mockClear();
        // @ts-expect-error mockDb satisfies partial interface
        const r3 = await seedContentDataset(mockDb, sampleDataset);
        expect(r3.success).toBe(true);
        const missingAdminWarns3 = warnSpy.mock.calls.filter((call) =>
          String(call[0]).includes('Chưa có tài khoản Admin'),
        );
        expect(missingAdminWarns3).toHaveLength(1);
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('Ràng buộc mật khẩu tối thiểu 8 ký tự và fail-fast trước khi ghi (T4a)', async () => {
      const mockUsersColl = {
        findOne: vi.fn().mockResolvedValue(null),
        insertOne: vi.fn(),
      };
      const mockItemsColl = { findOne: vi.fn(), updateOne: vi.fn() };
      const mockVersionsColl = { findOne: vi.fn(), insertOne: vi.fn() };

      const mockDb = {
        databaseName: 'chiikaiwa_test',
        collection: vi.fn((name) => {
          if (name === 'users') return mockUsersColl;
          if (name === 'content_items') return mockItemsColl;
          if (name === 'content_versions') return mockVersionsColl;
          throw new Error(`Unexpected collection: ${name}`);
        }),
      };

      // Admin password 7 ký tự -> fail-fast
      await expect(
        seedAll(/** @type {any} */ (mockDb), {
          includeFixtures: true,
          adminPassword: 'short12',
        }),
      ).rejects.toThrow(/SEED_ADMIN_PASSWORD.*tối thiểu 8 ký tự/);

      expect(mockUsersColl.insertOne).not.toHaveBeenCalled();
      expect(mockItemsColl.updateOne).not.toHaveBeenCalled();
      expect(mockVersionsColl.insertOne).not.toHaveBeenCalled();

      // User password 7 ký tự -> fail-fast
      await expect(
        seedAll(/** @type {any} */ (mockDb), {
          includeFixtures: true,
          adminPassword: 'ValidAdminPass123!',
          userPassword: 'user123',
        }),
      ).rejects.toThrow(/SEED_USER_PASSWORD.*tối thiểu 8 ký tự/);

      expect(mockUsersColl.insertOne).not.toHaveBeenCalled();
      expect(mockItemsColl.updateOne).not.toHaveBeenCalled();
      expect(mockVersionsColl.insertOne).not.toHaveBeenCalled();
    });

    it('seedAll giữ lại records của các dataset trước khi dừng vì lỗi ở dataset sau (T8a)', async () => {
      const kContentId1 = new ObjectId().toHexString();
      const kVersionId1 = new ObjectId().toHexString();
      const kContentId2 = new ObjectId().toHexString();
      const kVersionId2 = new ObjectId().toHexString();

      const dataset1 = {
        knowledges: [
          {
            contentId: kContentId1,
            versionId: kVersionId1,
            revision: 1,
            type: 'vocabulary',
            expression: '言葉1',
            reading: 'ことば1',
            meaning: 'Nghĩa từ 1',
            examples: [{ japanese: '言葉1を使う。', vietnamese: 'Dùng từ 1.' }],
          },
        ],
      };

      const dataset2 = {
        knowledges: [
          {
            contentId: kContentId2,
            versionId: kVersionId2,
            revision: 1,
            type: 'vocabulary',
            expression: '言葉2',
            reading: 'ことば2',
            meaning: 'Nghĩa từ 2',
            examples: [{ japanese: '言葉2を使う。', vietnamese: 'Dùng từ 2.' }],
          },
        ],
      };

      try {
        AVAILABLE_DATASETS.ds1 = dataset1;
        AVAILABLE_DATASETS.ds2 = dataset2;

        const fakeVersions = new Map();
        const fakeItems = new Map();

        const mockDb = {
          databaseName: 'chiikaiwa_test',
          collection: vi.fn((name) => {
            if (name === 'users') {
              return { findOne: vi.fn().mockResolvedValue(null) };
            }
            if (name === 'content_versions') {
              return {
                findOne: vi.fn(async (q) => {
                  const idStr = q._id?.toHexString?.() || String(q._id);
                  if (q.contentId) {
                    const cidStr =
                      q.contentId.toHexString?.() || String(q.contentId);
                    if (cidStr === kContentId2) {
                      // Tạo xung đột revision bất biến cho dataset2 -> seedContentDataset trả success: false
                      return { _id: new ObjectId(), revision: 1 };
                    }
                  }
                  return fakeVersions.get(idStr) || null;
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
                findOne: vi.fn(async (q) => {
                  const idStr = q._id?.toHexString?.() || String(q._id);
                  return fakeItems.get(idStr) || null;
                }),
                updateOne: vi.fn(async (filter, update) => {
                  const idStr =
                    filter._id?.toHexString?.() || String(filter._id);
                  fakeItems.set(idStr, { ...update.$setOnInsert });
                  return { matchedCount: 1, modifiedCount: 1 };
                }),
              };
            }
            throw new Error(`Unexpected collection: ${name}`);
          }),
        };

        const res = await seedAll(/** @type {any} */ (mockDb), {
          datasets: ['ds1', 'ds2'],
          includeFixtures: false,
        });

        expect(res.success).toBe(false);
        // Records phải giữ lại bản ghi của ds1
        expect(res.records).toBeDefined();
        expect(res.records?.length).toBeGreaterThan(0);
        expect(res.records?.some((r) => r.contentId === kContentId1)).toBe(
          true,
        );
      } finally {
        delete AVAILABLE_DATASETS.ds1;
        delete AVAILABLE_DATASETS.ds2;
      }
    });
  });
});
