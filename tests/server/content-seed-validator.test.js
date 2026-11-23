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
            revision: 1,
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
            revision: 1,
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
            "tham chiếu tới knowledge versionId '672000000000000000000999' không tồn tại",
          ),
        ),
      ).toBe(true);
      expect(
        result.errors.some((e) =>
          e.includes(
            "tham chiếu tới question versionId '672000000000000000000888' không tồn tại",
          ),
        ),
      ).toBe(true);
    });

    it('validateSeedDataset báo lỗi khi có hai record cùng loại trùng contentId hoặc versionId (AC 2)', () => {
      const duplicateIdDataset = {
        knowledges: [
          {
            contentId: '672000000000000000000001',
            versionId: '6720000000000000000000a1',
            revision: 1,
            type: 'vocabulary',
            expression: 'Từ 1',
            meaning: 'Nghĩa 1',
            examples: [{ japanese: 'jp1', vietnamese: 'vi1' }],
          },
          {
            contentId: '672000000000000000000001', // Trùng contentId
            versionId: '6720000000000000000000a2',
            revision: 1,
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

    it('Must fix 1: từ chối khi questionVersionIds trỏ nhầm vào contentId của câu hỏi thay vì versionId (§7.2)', () => {
      const cloned = JSON.parse(JSON.stringify(sampleDataset));
      const targetQuestion = cloned.questions[0];
      cloned.scenarios[0].questionVersionIds[0] = targetQuestion.contentId;

      const result = validateSeedDataset(cloned);
      expect(result.isValid).toBe(false);
      expect(
        result.errors.some((e) =>
          e.includes(
            `tham chiếu tới question versionId '${targetQuestion.contentId}' không tồn tại`,
          ),
        ),
      ).toBe(true);
    });

    it('Must fix 1: từ chối khi dùng tên trường cũ questionIds / knowledgeIds / scenarioIds', () => {
      const scenarioWithOldField = {
        title: 'Tình huống dùng trường cũ',
        context: 'Bối cảnh',
        objective: 'Mục tiêu',
        roleA: 'Vai A',
        roleB: 'Vai B',
        hints: ['Gợi ý'],
        questionIds: ['6720000000000000000000b1'],
        knowledgeIds: ['6720000000000000000000a1'],
      };

      const errors = validateScenarioPayload(scenarioWithOldField, {
        isPublishing: false,
      });
      expect(
        errors.some((e) =>
          e.includes("không được dùng trường cũ 'questionIds'"),
        ),
      ).toBe(true);
      expect(
        errors.some((e) =>
          e.includes("không được dùng trường cũ 'knowledgeIds'"),
        ),
      ).toBe(true);
    });

    it('Must fix 2: báo lỗi khi một question và một knowledge có cùng contentId (trùng content_items._id)', () => {
      const duplicateAcrossKindsDataset = {
        knowledges: [
          {
            contentId: '672000000000000000000099',
            versionId: '6720000000000000000000a1',
            revision: 1,
            type: 'vocabulary',
            expression: 'りんご',
            meaning: 'Quả táo',
            examples: [{ japanese: 'りんご。', vietnamese: 'Táo.' }],
          },
        ],
        questions: [
          {
            contentId: '672000000000000000000099', // Trùng contentId với knowledge ở trên
            versionId: '6720000000000000000000b1',
            revision: 1,
            type: 'multipleChoice',
            prompt: 'Câu hỏi trắc nghiệm',
            options: [
              { id: '1', text: 'A' },
              { id: '2', text: 'B' },
            ],
            correctOptionId: '1',
            explanation: 'Giải thích',
          },
        ],
        scenarios: [],
        decks: [],
      };

      const result = validateSeedDataset(duplicateAcrossKindsDataset);
      expect(result.isValid).toBe(false);
      expect(
        result.errors.some((e) =>
          e.includes(
            "Question[672000000000000000000099]: trùng lặp contentId '672000000000000000000099' với một record khác (Knowledge[672000000000000000000099])",
          ),
        ),
      ).toBe(true);
    });

    it('Review: báo lỗi khi bản ghi thiếu revision hoặc revision không phải số nguyên dương >= 1', () => {
      const invalidRevisionDataset = {
        knowledges: [
          {
            contentId: '672000000000000000000001',
            versionId: '6720000000000000000000a1',
            // Thiếu revision
            type: 'vocabulary',
            expression: 'りんご',
            meaning: 'Quả táo',
            examples: [{ japanese: 'りんご。', vietnamese: 'Táo.' }],
          },
          {
            contentId: '672000000000000000000002',
            versionId: '6720000000000000000000a2',
            revision: 0, // revision < 1
            type: 'vocabulary',
            expression: 'みかん',
            meaning: 'Quả quýt',
            examples: [{ japanese: 'みかん。', vietnamese: 'Quýt.' }],
          },
        ],
        questions: [],
        scenarios: [],
        decks: [],
      };

      const result = validateSeedDataset(invalidRevisionDataset);
      expect(result.isValid).toBe(false);
      expect(
        result.errors.some((e) =>
          e.includes('revision bắt buộc phải là số nguyên dương (>= 1)'),
        ),
      ).toBe(true);
    });

    it('báo lỗi khi một nhóm học liệu không phải là mảng (Review Must fix: questions: not-an-array)', () => {
      const invalidTypeDataset = {
        knowledges: [
          {
            contentId: '672000000000000000000001',
            versionId: '6720000000000000000000a1',
            revision: 1,
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

    it('Must fix: báo lỗi khi record thiếu versionId kể cả khi có publishedVersionId cùng giá trị', () => {
      const cloned = JSON.parse(JSON.stringify(sampleDataset));
      const targetQuestion = cloned.questions[0];
      const validVersionId = targetQuestion.versionId;
      delete targetQuestion.versionId;
      targetQuestion.publishedVersionId = validVersionId;

      const result = validateSeedDataset(cloned);
      expect(result.isValid).toBe(false);
      expect(
        result.errors.some(
          (e) => e.includes("versionId 'undefined'") && e.includes('ObjectId'),
        ),
      ).toBe(true);
      expect(
        result.errors.some((e) =>
          e.includes(
            `tham chiếu tới question versionId '${validVersionId}' không tồn tại`,
          ),
        ),
      ).toBe(true);
    });

    it('Should fix: báo lỗi khi questionVersionIds không phải là mảng kể cả khi isPublishing là false', () => {
      const draftWithBadType = {
        title: 'Tình huống nháp',
        context: 'Bối cảnh',
        objective: 'Mục tiêu',
        roleA: 'Vai A',
        roleB: 'Vai B',
        hints: ['Gợi ý'],
        questionVersionIds: 'not-an-array',
      };

      const errors = validateScenarioPayload(draftWithBadType, {
        isPublishing: false,
      });
      expect(
        errors.some((e) => e.includes('questionVersionIds phải là mảng ID')),
      ).toBe(true);
    });

    it('Should fix: báo lỗi khi scenarioVersionIds của deck không phải là mảng kể cả khi isPublishing là false', () => {
      const draftDeckWithBadType = {
        title: 'Bộ chủ đề nháp',
        topicKey: 'draft_topic',
        level: 'N5',
        description: 'Mô tả',
        scenarioVersionIds: 'not-an-array',
      };

      const errors = validateDeckPayload(draftDeckWithBadType, {
        isPublishing: false,
      });
      expect(
        errors.some((e) => e.includes('scenarioVersionIds phải là mảng ID')),
      ).toBe(true);
    });

    it('Lỗi tiềm ẩn 2: báo lỗi khi contentId là chuỗi rỗng thay vì âm thầm fallback sang _id', () => {
      const emptyContentIdDataset = {
        knowledges: [
          {
            contentId: '', // falsy chuỗi rỗng
            _id: '672000000000000000000001',
            versionId: '6720000000000000000000a1',
            revision: 1,
            type: 'vocabulary',
            expression: 'りんご',
            meaning: 'Quả táo',
            examples: [{ japanese: 'りんご。', vietnamese: 'Táo.' }],
          },
        ],
        questions: [],
        scenarios: [],
        decks: [],
      };

      const result = validateSeedDataset(emptyContentIdDataset);
      expect(result.isValid).toBe(false);
      expect(
        result.errors.some(
          (e) => e.includes("contentId ''") && e.includes('ObjectId'),
        ),
      ).toBe(true);
    });

    it('Lỗi tiềm ẩn 3: Deck trỏ nhầm questionVersionIds vào contentId của câu hỏi thay vì versionId', () => {
      const cloned = JSON.parse(JSON.stringify(sampleDataset));
      const targetQuestion = cloned.questions[0];
      cloned.decks[0].questionVersionIds[0] = targetQuestion.contentId;

      const result = validateSeedDataset(cloned);
      expect(result.isValid).toBe(false);
      expect(
        result.errors.some((e) =>
          e.includes(
            `tham chiếu tới question versionId '${targetQuestion.contentId}' không tồn tại`,
          ),
        ),
      ).toBe(true);
    });

    it('Lỗi tiềm ẩn 4: báo lỗi khi versionId trùng nhau giữa hai loại học liệu khác nhau', () => {
      const duplicateVersionIdAcrossKindsDataset = {
        knowledges: [
          {
            contentId: '672000000000000000000001',
            versionId: '6720000000000000000000ff', // Trùng versionId với question
            revision: 1,
            type: 'vocabulary',
            expression: 'りんご',
            meaning: 'Quả táo',
            examples: [{ japanese: 'りんご。', vietnamese: 'Táo.' }],
          },
        ],
        questions: [
          {
            contentId: '672000000000000000000002',
            versionId: '6720000000000000000000ff', // Trùng versionId với knowledge
            revision: 1,
            type: 'multipleChoice',
            prompt: 'Câu hỏi trắc nghiệm',
            options: [
              { id: '1', text: 'A' },
              { id: '2', text: 'B' },
            ],
            correctOptionId: '1',
            explanation: 'Giải thích',
          },
        ],
        scenarios: [],
        decks: [],
      };

      const result = validateSeedDataset(duplicateVersionIdAcrossKindsDataset);
      expect(result.isValid).toBe(false);
      expect(
        result.errors.some((e) =>
          e.includes("trùng lặp versionId '6720000000000000000000ff'"),
        ),
      ).toBe(true);
    });

    it('Lỗi tiềm ẩn A: báo lỗi khi _id không khớp với contentId trong cùng bản ghi', () => {
      const mismatchIdDataset = {
        knowledges: [
          {
            _id: '672000000000000000000001',
            contentId: '672000000000000000000002', // Khác _id
            versionId: '6720000000000000000000a1',
            revision: 1,
            type: 'vocabulary',
            expression: 'りんご',
            meaning: 'Quả táo',
            examples: [{ japanese: 'りんご。', vietnamese: 'Táo.' }],
          },
        ],
        questions: [],
        scenarios: [],
        decks: [],
      };

      const result = validateSeedDataset(mismatchIdDataset);
      expect(result.isValid).toBe(false);
      expect(
        result.errors.some((e) =>
          e.includes(
            "_id '672000000000000000000001' phải bằng contentId '672000000000000000000002'",
          ),
        ),
      ).toBe(true);
    });

    it('Lỗi tiềm ẩn C: phát hiện trùng lặp ID trong cùng mảng questionVersionIds hoặc knowledgeVersionIds', () => {
      const duplicateInArrayScenario = {
        _id: '672000000000000000000101',
        title: 'Tình huống trùng lặp ID trong mảng',
        context: 'Bối cảnh',
        objective: 'Mục tiêu',
        roleA: 'Vai A',
        roleB: 'Vai B',
        hints: ['Gợi ý'],
        questionVersionIds: [
          '6720000000000000000000b1',
          '6720000000000000000000b1', // Trùng ID trong mảng
          '6720000000000000000000b2',
        ],
      };

      const errors = validateScenarioPayload(duplicateInArrayScenario, {
        isPublishing: true,
      });
      expect(
        errors.some((e) =>
          e.includes(
            "ID '6720000000000000000000b1' bị trùng lặp trong cùng mảng",
          ),
        ),
      ).toBe(true);
    });
  });
});
