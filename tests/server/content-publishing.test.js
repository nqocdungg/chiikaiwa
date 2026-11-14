import { describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import {
  normalizePublishPayload,
  resolveDeckManifest,
  validatePublishCompleteness,
} from '../../server/modules/content/content-validator.js';
import { parsePageLimit } from '../../server/modules/content/content-service.js';
import {
  toKnowledgeItemDto,
  toTopicSummaryDto,
  toTopicVersionDetailDto,
} from '../../server/modules/content/content-dto.js';

const { ObjectId } = mongoose.Types;

describe('BE-013: Unit validation and projections for content publishing', () => {
  const dummyDb = /** @type {any} */ ({
    collection: () => ({
      find: () => ({
        toArray: async () => [],
      }),
    }),
  });

  describe('validatePublishCompleteness', () => {
    it('rejects item without draftPayload with 422 REQUIRED', async () => {
      const item = { kind: 'deck', draftPayload: null };
      const errors = await validatePublishCompleteness(dummyDb, item);
      expect(errors).toEqual([
        expect.objectContaining({
          path: 'draftPayload',
          code: 'REQUIRED',
        }),
      ]);
    });

    it('rejects deck with 0 scenarioVersionIds (FR-ADM-03 threshold requirement)', async () => {
      const item = {
        kind: 'deck',
        draftPayload: {
          title: 'Khách sạn',
          topicKey: 'hotel',
          level: 'N4',
          description: 'Luyện hội thoại tại khách sạn',
          scenarioVersionIds: [],
        },
      };
      const errors = await validatePublishCompleteness(dummyDb, item);
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'draftPayload.scenarioVersionIds',
            code: 'THRESHOLD_NOT_MET',
          }),
        ]),
      );
    });

    it('rejects scenario with fewer than 3 questionVersionIds (FR-ADM-03, BR-24 threshold requirement)', async () => {
      const item = {
        kind: 'scenario',
        draftPayload: {
          title: 'Nhận phòng',
          context: 'Tại quầy lễ tân',
          objective: 'Lấy chìa khóa',
          roleA: 'Khách',
          roleB: 'Lễ tân',
          questionVersionIds: [
            new ObjectId().toHexString(),
            new ObjectId().toHexString(),
          ],
        },
      };
      const errors = await validatePublishCompleteness(dummyDb, item);
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'draftPayload.questionVersionIds',
            code: 'THRESHOLD_NOT_MET',
          }),
        ]),
      );
    });

    it('rejects knowledge without examples or meaning', async () => {
      const item = {
        kind: 'knowledge',
        draftPayload: {
          type: 'vocabulary',
          expression: 'チェックイン',
          meaning: '',
          examples: [],
        },
      };
      const errors = await validatePublishCompleteness(dummyDb, item);
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'draftPayload.meaning',
            code: 'REQUIRED',
          }),
          expect.objectContaining({
            path: 'draftPayload.examples',
            code: 'REQUIRED',
          }),
        ]),
      );
    });

    it('rejects multiple choice question without options or matching correctOptionId', async () => {
      const item = {
        kind: 'question',
        draftPayload: {
          type: 'multipleChoice',
          prompt: 'Chọn câu chào buổi sáng:',
          explanation: 'おはようございます là câu chào buổi sáng lịch sự.',
          options: [{ id: 'opt1', text: 'こんにちは' }],
          correctOptionId: 'opt_non_exist',
        },
      };
      const errors = await validatePublishCompleteness(dummyDb, item);
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'draftPayload.options',
            code: 'THRESHOLD_NOT_MET',
          }),
          expect.objectContaining({
            path: 'draftPayload.correctOptionId',
            code: 'INVALID_REFERENCE',
          }),
        ]),
      );
    });
  });

  describe('normalizePublishPayload', () => {
    it('deduplicates ID arrays and converts to ObjectId in transaction manifest', () => {
      const id1 = new ObjectId().toHexString();
      const id2 = new ObjectId().toHexString();
      const raw = {
        title: 'Chủ đề',
        scenarioVersionIds: [id1, id1, id2],
        knowledgeVersionIds: [id1, id2, id1],
        questionVersionIds: [id2, id2],
      };

      const normalized = normalizePublishPayload('deck', raw);
      expect(normalized.scenarioVersionIds).toHaveLength(2);
      expect(normalized.scenarioVersionIds[0]).toBeInstanceOf(ObjectId);
      expect(normalized.knowledgeVersionIds).toHaveLength(2);
      expect(normalized.questionVersionIds).toHaveLength(1);
    });
  });

  describe('Learner & Guest Projections (07 §7, 06 §12.1)', () => {
    it('projects topic summary without scenario details or answers', () => {
      const itemDoc = {
        _id: new ObjectId(),
        publishedVersionId: new ObjectId(),
        title: 'Mua sắm',
        level: 'N5',
      };
      const versionDoc = {
        payload: {
          description: 'Hội thoại mua đồ tại cửa hàng tiện lợi',
          scenarioVersionIds: [new ObjectId()],
          questionVersionIds: [new ObjectId()],
        },
      };

      const dto = toTopicSummaryDto(itemDoc, versionDoc);
      expect(dto).toEqual({
        id: itemDoc._id.toHexString(),
        versionId: itemDoc.publishedVersionId.toHexString(),
        title: 'Mua sắm',
        level: 'N5',
        description: 'Hội thoại mua đồ tại cửa hàng tiện lợi',
      });
      expect(dto).not.toHaveProperty('scenarioVersionIds');
      expect(dto).not.toHaveProperty('roleA');
      expect(dto).not.toHaveProperty('roleB');
    });

    it('projects topic version detail with counts only', () => {
      const q1 = new ObjectId();
      const q2 = new ObjectId();
      const k1 = new ObjectId();
      const versionDoc = {
        _id: new ObjectId(),
        contentId: new ObjectId(),
        payload: {
          title: 'Khách sạn',
          level: 'N4',
          description: 'Mô tả',
          knowledgeVersionIds: [k1],
          questionVersionIds: [q1, q2],
          roleA: 'Secret Role A',
          roleB: 'Secret Role B',
        },
      };

      const dto = toTopicVersionDetailDto(versionDoc);
      expect(dto).toEqual({
        id: versionDoc._id.toHexString(),
        contentId: versionDoc.contentId.toHexString(),
        title: 'Khách sạn',
        level: 'N4',
        description: 'Mô tả',
        knowledgeCount: 1,
        questionCount: 2,
      });
      expect(dto).not.toHaveProperty('roleA');
      expect(dto).not.toHaveProperty('roleB');
    });

    it('projects knowledge item without role or answer leakage', () => {
      const versionDoc = {
        _id: new ObjectId(),
        contentId: new ObjectId(),
        payload: {
          type: 'vocabulary',
          expression: '予約',
          reading: 'よやく',
          meaning: 'Đặt trước, hẹn trước',
          examples: [
            {
              japanese: '予約をしたいです。',
              vietnamese: 'Tôi muốn đặt trước.',
            },
          ],
          correctAnswer: 'leak',
          roleA: 'leak',
        },
      };

      const dto = toKnowledgeItemDto(versionDoc);
      expect(dto).toEqual({
        id: versionDoc.contentId.toHexString(),
        versionId: versionDoc._id.toHexString(),
        type: 'vocabulary',
        expression: '予約',
        reading: 'よやく',
        meaning: 'Đặt trước, hẹn trước',
        examples: [
          { japanese: '予約をしたいです。', vietnamese: 'Tôi muốn đặt trước.' },
        ],
      });
      expect(dto).not.toHaveProperty('correctAnswer');
      expect(dto).not.toHaveProperty('roleA');
    });
  });

  describe('normalizePublishPayload reference deduplication (06 §2.1, Review Fix)', () => {
    it('normalizes and deduplicates ObjectIds across uppercase and lowercase variants', () => {
      const lowerId = '507f1f77bcf86cd799439011';
      const upperId = '507F1F77BCF86CD799439011';

      const payload = {
        title: 'Thử nghiệm',
        knowledgeVersionIds: [lowerId, upperId],
      };

      const normalized = normalizePublishPayload('question', payload);
      expect(normalized.knowledgeVersionIds).toHaveLength(1);
      expect(normalized.knowledgeVersionIds[0].toHexString()).toBe(lowerId);
    });

    it('deduplicates all reference arrays in deck payload regardless of casing', () => {
      const id1 = '507f1f77bcf86cd799439011';
      const id1Upper = '507F1F77BCF86CD799439011';
      const id2 = '507f1f77bcf86cd799439022';

      const deckPayload = {
        title: 'Chủ đề du lịch',
        scenarioVersionIds: [id1, id1Upper],
        knowledgeVersionIds: [id1, id2, id1Upper],
        questionVersionIds: [id2, id2.toUpperCase()],
      };

      const normalized = normalizePublishPayload('deck', deckPayload);
      expect(normalized.scenarioVersionIds).toHaveLength(1);
      expect(normalized.knowledgeVersionIds).toHaveLength(2);
      expect(normalized.questionVersionIds).toHaveLength(1);
    });
  });

  describe('parsePageLimit unit validation (07 §1, OpenAPI)', () => {
    it('returns default limit 20 when limit is undefined', () => {
      expect(parsePageLimit(undefined)).toBe(20);
    });

    it('accepts valid integer strings and numbers in range [1, 50]', () => {
      expect(parsePageLimit('1')).toBe(1);
      expect(parsePageLimit('20')).toBe(20);
      expect(parsePageLimit('50')).toBe(50);
      expect(parsePageLimit(10)).toBe(10);
    });

    it('rejects invalid inputs with 400 MALFORMED_REQUEST', () => {
      const invalidInputs = [
        '0.5',
        0.5,
        '0',
        0,
        '-1',
        -5,
        '51',
        100,
        'abc',
        '',
        '   ',
        ['10'],
        null,
        {},
      ];

      for (const input of invalidInputs) {
        expect(
          () => parsePageLimit(input),
          `Expected input ${JSON.stringify(input)} to be rejected`,
        ).toThrowError(
          expect.objectContaining({
            status: 400,
            code: 'MALFORMED_REQUEST',
          }),
        );
      }
    });
  });

  describe('resolveDeckManifest merging and duplicate contentId detection (06 §7.2)', () => {
    it('merges knowledge and question references from scenarios into deck manifest', async () => {
      const scenarioVersionId = new ObjectId();
      const scenarioContentId = new ObjectId();
      const k1VersionId = new ObjectId();
      const k1ContentId = new ObjectId();
      const q1VersionId = new ObjectId();
      const q1ContentId = new ObjectId();

      const mockDb = /** @type {any} */ ({
        collection: () => ({
          find: (/** @type {any} */ { kind }) => ({
            toArray: async () => {
              if (kind === 'scenario') {
                return [
                  {
                    _id: scenarioVersionId,
                    contentId: scenarioContentId,
                    kind: 'scenario',
                    payload: {
                      knowledgeVersionIds: [k1VersionId],
                      questionVersionIds: [q1VersionId],
                    },
                  },
                ];
              }
              if (kind === 'knowledge') {
                return [
                  {
                    _id: k1VersionId,
                    contentId: k1ContentId,
                    kind: 'knowledge',
                  },
                ];
              }
              if (kind === 'question') {
                return [
                  {
                    _id: q1VersionId,
                    contentId: q1ContentId,
                    kind: 'question',
                  },
                ];
              }
              return [];
            },
          }),
        }),
      });

      const draftPayload = {
        title: 'Bộ học liệu du lịch',
        topicKey: 'travel',
        level: 'N4',
        description: 'Mô tả',
        scenarioVersionIds: [scenarioVersionId.toHexString()],
        // Không truyền knowledgeVersionIds hay questionVersionIds trực tiếp
      };

      const { errors, mergedPayload } = await resolveDeckManifest(
        mockDb,
        draftPayload,
      );

      expect(errors).toHaveLength(0);
      expect(mergedPayload.knowledgeVersionIds).toHaveLength(1);
      expect(mergedPayload.knowledgeVersionIds[0].equals(k1VersionId)).toBe(
        true,
      );
      expect(mergedPayload.questionVersionIds).toHaveLength(1);
      expect(mergedPayload.questionVersionIds[0].equals(q1VersionId)).toBe(
        true,
      );
    });

    it('detects two different revisions of the same knowledge item and returns DUPLICATE_CONTENT_REVISION', async () => {
      const scenario1Id = new ObjectId();
      const scenario2Id = new ObjectId();
      const sharedKnowledgeContentId = new ObjectId();
      const kVersion1Id = new ObjectId();
      const kVersion2Id = new ObjectId();

      const mockDb = /** @type {any} */ ({
        collection: () => ({
          find: (/** @type {any} */ { kind }) => ({
            toArray: async () => {
              if (kind === 'scenario') {
                return [
                  {
                    _id: scenario1Id,
                    contentId: new ObjectId(),
                    kind: 'scenario',
                    payload: {
                      knowledgeVersionIds: [kVersion1Id],
                      questionVersionIds: [],
                    },
                  },
                  {
                    _id: scenario2Id,
                    contentId: new ObjectId(),
                    kind: 'scenario',
                    payload: {
                      knowledgeVersionIds: [kVersion2Id],
                      questionVersionIds: [],
                    },
                  },
                ];
              }
              if (kind === 'knowledge') {
                return [
                  {
                    _id: kVersion1Id,
                    contentId: sharedKnowledgeContentId,
                    kind: 'knowledge',
                  },
                  {
                    _id: kVersion2Id,
                    contentId: sharedKnowledgeContentId, // Cùng contentId nhưng khác revision!
                    kind: 'knowledge',
                  },
                ];
              }
              return [];
            },
          }),
        }),
      });

      const draftPayload = {
        title: 'Bộ xung đột phiên bản',
        topicKey: 'conflict',
        level: 'N4',
        description: 'Mô tả',
        scenarioVersionIds: [
          scenario1Id.toHexString(),
          scenario2Id.toHexString(),
        ],
      };

      const { errors } = await resolveDeckManifest(mockDb, draftPayload);

      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'draftPayload.knowledgeVersionIds',
            code: 'DUPLICATE_CONTENT_REVISION',
          }),
        ]),
      );
    });
  });
});
