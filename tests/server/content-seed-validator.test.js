import { describe, it, expect } from 'vitest';
import {
  validateSeedDataset,
  validateScenarioPayload,
  validateQuestionPayload,
  validateKnowledgePayload,
  validateDeckPayload,
  isValidObjectId,
} from '../../server/modules/content/content-validator.js';
import { sampleDataset } from '../../server/persistence/seed/sample-content.js';

describe('DATA-001: Content Seed & Learning Material Validator', () => {
  describe('isValidObjectId helper', () => {
    it('nhận diện đúng ObjectId 24 ký tự hex hợp lệ', () => {
      expect(isValidObjectId('672000000000000000000001')).toBe(true);
      expect(isValidObjectId('507f1f77bcf86cd799439011')).toBe(true);
    });

    it('từ chối chuỗi không phải 24 ký tự hex', () => {
      expect(isValidObjectId('not-an-id')).toBe(false);
      expect(isValidObjectId('67200000000000000000000z')).toBe(false);
      expect(isValidObjectId(null)).toBe(false);
      expect(isValidObjectId(123456)).toBe(false);
    });
  });

  describe('AC 1 & AC 2: Kiểm thử mẫu dữ liệu seed hoàn chỉnh (sampleDataset)', () => {
    it('mẫu dữ liệu sampleDataset phải vượt qua toàn bộ validation và không có bất kỳ lỗi nào', () => {
      const result = validateSeedDataset(sampleDataset);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('mẫu dữ liệu phải đáp ứng đúng contract Database Design §7.1 & §7.2', () => {
      expect(sampleDataset.scenarios.length).toBeGreaterThanOrEqual(1);
      const scenario = sampleDataset.scenarios[0];

      // Đủ định danh contentId và versionId
      expect(isValidObjectId(scenario.contentId)).toBe(true);
      expect(isValidObjectId(scenario.versionId)).toBe(true);

      // Đủ bối cảnh, mục tiêu, hai vai, gợi ý
      expect(scenario.context.trim()).not.toBe('');
      expect(scenario.objective.trim()).not.toBe('');
      expect(scenario.roleA.trim()).not.toBe('');
      expect(scenario.roleB.trim()).not.toBe('');
      expect(scenario.hints.length).toBeGreaterThan(0);

      // Chuẩn trường theo thiết kế §7.2: questionVersionIds và knowledgeVersionIds
      expect(scenario.questionVersionIds.length).toBeGreaterThanOrEqual(3);
      expect(scenario.knowledgeVersionIds.length).toBeGreaterThan(0);

      // Deck chuẩn trường: scenarioVersionIds, knowledgeVersionIds, questionVersionIds
      const deck = sampleDataset.decks[0];
      expect(deck.scenarioVersionIds.length).toBeGreaterThanOrEqual(1);
      expect(deck.questionVersionIds.length).toBeGreaterThanOrEqual(3);
      expect(deck.knowledgeVersionIds.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('AC 1 & AC 2: Kiểm thử phát hiện lỗi dữ liệu (Negative Cases)', () => {
    it('báo lỗi khi tình huống có ít hơn 3 câu hỏi quiz khi dùng questionVersionIds (AC 1 & §7.2)', () => {
      const invalidScenario = {
        _id: '672000000000000000000101',
        title: 'Tình huống thiếu quiz',
        context: 'Bối cảnh hội thoại',
        objective: 'Mục tiêu hội thoại',
        roleA: 'Khách hàng',
        roleB: 'Nhân viên',
        hints: ['Gợi ý 1'],
        questionVersionIds: [
          '672000000000000000000011',
          '672000000000000000000012',
        ], // Chỉ có 2 câu quiz
      };

      const errors = validateScenarioPayload(invalidScenario, {
        isPublishing: true,
      });
      expect(errors.length).toBeGreaterThan(0);
      expect(
        errors.some((e) => e.includes('ít nhất 3 questionVersionIds')),
      ).toBe(true);
    });

    it('cho phép tình huống có ít hơn 3 câu hỏi quiz nếu chưa xuất bản (đang soạn nháp)', () => {
      const draftScenario = {
        title: 'Tình huống đang soạn nháp',
        context: 'Bối cảnh nháp',
        objective: 'Mục tiêu nháp',
        roleA: 'Vai A',
        roleB: 'Vai B',
        hints: ['Gợi ý'],
        questionVersionIds: ['672000000000000000000011'], // 1 câu khi soạn dở
      };

      const errors = validateScenarioPayload(draftScenario, {
        isPublishing: false,
      });
      expect(errors.length).toBe(0);
    });

    it('báo lỗi khi câu hỏi trắc nghiệm có correctOptionId không nằm trong options (AC 2)', () => {
      const invalidQuestion = {
        _id: '672000000000000000000099',
        type: 'multipleChoice',
        prompt: 'Trắc nghiệm sai đáp án',
        explanation: 'Giải thích',
        options: [
          { id: 'opt_1', text: 'Đáp án A' },
          { id: 'opt_2', text: 'Đáp án B' },
        ],
        correctOptionId: 'opt_3', // Không có trong options
      };

      const errors = validateQuestionPayload(invalidQuestion);
      expect(errors.length).toBeGreaterThan(0);
      expect(
        errors.some((e) =>
          e.includes(
            "correctOptionId 'opt_3' phải nằm trong danh sách options",
          ),
        ),
      ).toBe(true);
    });

    it('báo lỗi khi câu hỏi điền ngắn thiếu acceptedAnswers (AC 2)', () => {
      const invalidQuestion = {
        _id: '672000000000000000000098',
        type: 'shortAnswer',
        prompt: 'Điền từ',
        explanation: 'Giải thích',
        acceptedAnswers: [], // Rỗng
      };

      const errors = validateQuestionPayload(invalidQuestion);
      expect(errors.length).toBeGreaterThan(0);
      expect(
        errors.some((e) => e.includes('ít nhất một acceptedAnswers')),
      ).toBe(true);
    });

    it('báo lỗi khi kiến thức thiếu ví dụ minh họa (AC 2)', () => {
      const invalidKnowledge = {
        _id: '672000000000000000000001',
        type: 'vocabulary',
        expression: 'ありがとう',
        meaning: 'Cảm ơn',
        examples: [], // Rỗng
      };

      const errors = validateKnowledgePayload(invalidKnowledge);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes('ít nhất một ví dụ'))).toBe(true);
    });

    it('báo lỗi khi bộ chủ đề có cấp độ không hợp lệ (AC 2)', () => {
      const invalidDeck = {
        _id: '672000000000000000001001',
        title: 'Chủ đề sai cấp độ',
        topicKey: 'test_topic',
        level: 'N6', // Sai cấp độ
        description: 'Mô tả',
        scenarioVersionIds: ['672000000000000000000101'],
      };

      const errors = validateDeckPayload(invalidDeck);
      expect(errors.length).toBeGreaterThan(0);
      expect(
        errors.some((e) => e.includes('level phải thuộc một trong các cấp độ')),
      ).toBe(true);
    });

    it('validateSeedDataset báo lỗi khi có ID tham chiếu version không tồn tại trong dataset (§7.2)', () => {
      const datasetWithBrokenRef = {
        knowledges: [
          {
            contentId: '672000000000000000000001',
            versionId: '6720000000000000000000a1',
            type: 'vocabulary',
            expression: 'りんご',
            meaning: 'Quả táo',
            examples: [{ japanese: 'りんごを食べる。', vietnamese: 'Ăn táo.' }],
          },
        ],
        questions: [],
        scenarios: [
          {
            contentId: '672000000000000000000101',
            versionId: '6720000000000000000000c1',
            title: 'Tình huống tham chiếu sai',
            context: 'Bối cảnh',
            objective: 'Mục tiêu',
            roleA: 'Vai A',
            roleB: 'Vai B',
            hints: ['Gợi ý'],
            knowledgeVersionIds: ['672000000000000000000999'], // Không tồn tại
            questionVersionIds: [
              '672000000000000000000888',
              '672000000000000000000889',
              '672000000000000000000890',
            ],
          },
        ],
        decks: [],
      };

      const result = validateSeedDataset(datasetWithBrokenRef);
      expect(result.isValid).toBe(false);
      expect(
        result.errors.some((e) =>
          e.includes(
            "tham chiếu tới knowledge ID/version '672000000000000000000999' không tồn tại",
          ),
        ),
      ).toBe(true);
      expect(
        result.errors.some((e) =>
          e.includes(
            "tham chiếu tới question ID/version '672000000000000000000888' không tồn tại",
          ),
        ),
      ).toBe(true);
    });

    it('validateSeedDataset báo lỗi khi có hai record trùng contentId hoặc versionId (AC 2)', () => {
      const duplicateIdDataset = {
        knowledges: [
          {
            contentId: '672000000000000000000001',
            versionId: '6720000000000000000000a1',
            type: 'vocabulary',
            expression: 'Từ 1',
            meaning: 'Nghĩa 1',
            examples: [{ japanese: 'jp1', vietnamese: 'vi1' }],
          },
          {
            contentId: '672000000000000000000001', // Trùng contentId
            versionId: '6720000000000000000000a2',
            type: 'vocabulary',
            expression: 'Từ 2',
            meaning: 'Nghĩa 2',
            examples: [{ japanese: 'jp2', vietnamese: 'vi2' }],
          },
        ],
        questions: [],
        scenarios: [],
        decks: [],
      };

      const result = validateSeedDataset(duplicateIdDataset);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('trùng lặp contentId'))).toBe(
        true,
      );
    });

    it('báo lỗi khi một nhóm học liệu không phải là mảng (Review Must fix: questions: not-an-array)', () => {
      const invalidTypeDataset = {
        knowledges: [
          {
            contentId: '672000000000000000000001',
            versionId: '6720000000000000000000a1',
            type: 'vocabulary',
            expression: 'りんご',
            meaning: 'Quả táo',
            examples: [{ japanese: 'りんご。', vietnamese: 'Táo.' }],
          },
        ],
        questions: 'not-an-array',
        scenarios: [],
        decks: [],
      };

      const result = validateSeedDataset(invalidTypeDataset);
      expect(result.isValid).toBe(false);
      expect(
        result.errors.some((e) =>
          e.includes('Dataset.questions phải là một mảng'),
        ),
      ).toBe(true);
    });

    it('báo lỗi khi bản ghi trong mảng không phải object (ví dụ null hoặc chuỗi)', () => {
      const invalidElementDataset = {
        knowledges: [null],
        questions: [],
        scenarios: [],
        decks: [],
      };

      const result = validateSeedDataset(invalidElementDataset);
      expect(result.isValid).toBe(false);
      expect(
        result.errors.some((e) => e.includes('bản ghi phải là một object')),
      ).toBe(true);
    });
  });
});
