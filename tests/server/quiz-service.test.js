import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import {
  decodeQuizCursor,
  encodeQuizCursor,
} from '../../server/modules/quiz/quiz-repository.js';
import {
  gradeQuizAnswers,
  hashAnswers,
  isGradableQuestion,
  resolveAlreadySubmitted,
  toQuizPublicDto,
  toQuizResultDto,
} from '../../server/modules/quiz/quiz-service.js';

const { ObjectId } = mongoose.Types;

describe('Quiz Service Unit Tests', () => {
  const q1Id = new ObjectId();
  const q2Id = new ObjectId();
  const q3Id = new ObjectId();
  const k1Id = new ObjectId();

  const snapshotQuestions = [
    {
      questionVersionId: q1Id,
      type: 'multipleChoice',
      prompt: 'Từ nào sau đây có nghĩa là "xin chào"?',
      options: [
        { id: 'opt_1', text: 'Konnichiwa' },
        { id: 'opt_2', text: 'Sayonara' },
        { id: 'opt_3', text: 'Arigatou' },
      ],
      correctOptionId: 'opt_1',
      explanation: 'Konnichiwa là lời chào buổi trưa thông dụng.',
      knowledgeVersionIds: [k1Id],
    },
    {
      questionVersionId: q2Id,
      type: 'shortAnswer',
      prompt: 'Điền thể Te của từ "iku" (行く):',
      acceptedAnswers: ['いって', '行って'],
      explanation: 'Iku là động từ đặc biệt, thể Te là itte (いって / 行って).',
      knowledgeVersionIds: [k1Id],
    },
    {
      questionVersionId: q3Id,
      type: 'shortAnswer',
      prompt: 'Điền cách đọc kana của "日本":',
      acceptedAnswers: ['にほん', 'にっぽん'],
      explanation: '日本 có thể đọc là にほん hoặc にっぽん.',
      knowledgeVersionIds: [k1Id],
    },
  ];

  describe('hashAnswers (Idempotency deterministic hashing)', () => {
    it('produces identical hash regardless of answer item ordering', () => {
      const answersA = [
        { questionVersionId: q1Id.toHexString(), optionId: 'opt_1' },
        { questionVersionId: q2Id.toHexString(), text: ' いって ' },
      ];
      const answersB = [
        { questionVersionId: q2Id.toHexString(), text: 'いって' },
        { questionVersionId: q1Id.toHexString(), optionId: 'opt_1' },
      ];
      expect(hashAnswers(answersA)).toBe(hashAnswers(answersB));
    });

    it('produces different hash when answers differ', () => {
      const answersA = [
        { questionVersionId: q1Id.toHexString(), optionId: 'opt_1' },
      ];
      const answersB = [
        { questionVersionId: q1Id.toHexString(), optionId: 'opt_2' },
      ];
      expect(hashAnswers(answersA)).not.toBe(hashAnswers(answersB));
    });
  });

  describe('gradeQuizAnswers (BR-22 Server-side Grading Rules)', () => {
    it('grades multiple choice correctly when matching correctOptionId', () => {
      const answers = [
        { questionVersionId: q1Id.toHexString(), optionId: 'opt_1' },
      ];
      const result = gradeQuizAnswers(snapshotQuestions, answers);
      expect(result.score).toBe(1);
      expect(result.results[0]).toMatchObject({
        questionVersionId: q1Id,
        isCorrect: true,
        points: 1,
      });
    });

    it('grades multiple choice as 0 points when wrong optionId or missing', () => {
      const answersWrong = [
        { questionVersionId: q1Id.toHexString(), optionId: 'opt_2' },
      ];
      const resultWrong = gradeQuizAnswers(snapshotQuestions, answersWrong);
      expect(resultWrong.results[0]).toMatchObject({
        questionVersionId: q1Id,
        isCorrect: false,
        points: 0,
      });

      const resultMissing = gradeQuizAnswers(snapshotQuestions, []);
      expect(resultMissing.results[0]).toMatchObject({
        questionVersionId: q1Id,
        isCorrect: false,
        points: 0,
      });
    });

    it('grades short answer with whitespace trimming and exact match (BR-22)', () => {
      const answers = [
        { questionVersionId: q2Id.toHexString(), text: '  いって \t ' },
        { questionVersionId: q3Id.toHexString(), text: 'にっぽん' },
      ];
      const result = gradeQuizAnswers(snapshotQuestions, answers);
      expect(result.score).toBe(2);
      expect(result.results[1]).toMatchObject({
        questionVersionId: q2Id,
        isCorrect: true,
        points: 1,
      });
      expect(result.results[2]).toMatchObject({
        questionVersionId: q3Id,
        isCorrect: true,
        points: 1,
      });
    });

    it('does not transform kana or punctuation (BR-22 strict match)', () => {
      // Katakana 'イッテ' should NOT match Hiragana 'いって'
      const answers = [
        { questionVersionId: q2Id.toHexString(), text: 'イッテ' },
      ];
      const result = gradeQuizAnswers(snapshotQuestions, answers);
      expect(result.results[1]).toMatchObject({
        questionVersionId: q2Id,
        isCorrect: false,
        points: 0,
      });
    });

    it('does not grade multiple choice as correct when text is provided', () => {
      const answers = [
        {
          questionVersionId: q1Id.toHexString(),
          optionId: 'opt_1',
          text: 'Konnichiwa',
        },
      ];
      const result = gradeQuizAnswers(snapshotQuestions, answers);
      expect(result.results[0]).toMatchObject({
        questionVersionId: q1Id,
        isCorrect: false,
        points: 0,
      });
    });

    it('does not grade short answer as correct when optionId is provided', () => {
      const answers = [
        {
          questionVersionId: q2Id.toHexString(),
          optionId: 'opt_1',
          text: 'いって',
        },
      ];
      const result = gradeQuizAnswers(snapshotQuestions, answers);
      expect(result.results[1]).toMatchObject({
        questionVersionId: q2Id,
        isCorrect: false,
        points: 0,
      });
    });

    it('handles blank / omitted answers as 0 points', () => {
      const answers = [
        { questionVersionId: q1Id.toHexString(), optionId: 'opt_1' },
        // q2 and q3 omitted
      ];
      const result = gradeQuizAnswers(snapshotQuestions, answers);
      expect(result.score).toBe(1);
      expect(result.results[0].points).toBe(1);
      expect(result.results[1].points).toBe(0);
      expect(result.results[2].points).toBe(0);
    });
  });

  describe('Projections (07 §9.2 and BR-23)', () => {
    const attemptDoc = {
      _id: new ObjectId(),
      deckVersionId: new ObjectId(),
      status: 'inProgress',
      total: 3,
      questions: snapshotQuestions,
      createdAt: new Date('2026-11-16T00:00:00.000Z'),
      version: 0,
    };

    it('toQuizPublicDto strips answers, correct options and explanations', () => {
      const publicDto = toQuizPublicDto(attemptDoc);
      expect(publicDto.id).toBe(attemptDoc._id.toHexString());
      expect(publicDto.status).toBe('inProgress');
      expect(publicDto.total).toBe(3);
      expect(publicDto.version).toBe(0);
      expect(publicDto.questions).toHaveLength(3);

      for (const q of publicDto.questions) {
        expect(q).not.toHaveProperty('correctOptionId');
        expect(q).not.toHaveProperty('acceptedAnswers');
        expect(q).not.toHaveProperty('explanation');
      }
    });

    it('toQuizResultDto includes full results, scores and explanations', () => {
      const submittedDoc = {
        ...attemptDoc,
        status: 'submitted',
        version: 1,
        score: 2,
        submittedAt: new Date('2026-11-16T00:05:00.000Z'),
        answers: [
          { questionVersionId: q1Id, optionId: 'opt_1' },
          { questionVersionId: q2Id, text: 'いって' },
          { questionVersionId: q3Id, text: 'sai' },
        ],
        results: [
          { questionVersionId: q1Id, isCorrect: true, points: 1 },
          { questionVersionId: q2Id, isCorrect: true, points: 1 },
          { questionVersionId: q3Id, isCorrect: false, points: 0 },
        ],
      };

      const resultDto = toQuizResultDto(submittedDoc);
      expect(resultDto.status).toBe('submitted');
      expect(resultDto.score).toBe(2);
      expect(resultDto.total).toBe(3);
      expect(resultDto.version).toBe(1);
      expect(resultDto.submittedAt).toBe('2026-11-16T00:05:00.000Z');
      expect(resultDto.answers).toHaveLength(3);
      expect(resultDto.results).toHaveLength(3);

      // questions giữ cấu trúc sạch như QuizPublic
      for (const q of resultDto.questions) {
        expect(q).not.toHaveProperty('isCorrect');
        expect(q).not.toHaveProperty('points');
      }

      const res1 = resultDto.results.find(
        (/** @type {any} */ r) => r.questionVersionId === q1Id.toHexString(),
      );
      expect(res1?.isCorrect).toBe(true);
      expect(res1?.points).toBe(1);
      expect(res1?.correctOptionId).toBe('opt_1');
      expect(res1?.explanation).toBe(snapshotQuestions[0].explanation);
      expect(res1?.knowledgeVersionIds).toEqual([k1Id.toHexString()]);
    });
  });

  describe('Pagination Cursor Encoding / Decoding', () => {
    it('encodes and decodes quiz attempt cursor correctly with context', () => {
      const doc = {
        _id: new ObjectId(),
        createdAt: new Date('2026-11-16T02:00:00.000Z'),
      };
      const context = JSON.stringify([
        'user:123',
        null,
        'createdAt:desc,_id:desc',
      ]);
      const cursor = encodeQuizCursor(doc, context);
      expect(typeof cursor).toBe('string');

      const decoded = decodeQuizCursor(cursor, context);
      expect(decoded).not.toBeNull();
      expect(decoded?.id.toHexString()).toBe(doc._id.toHexString());
      expect(decoded?.createdAt.toISOString()).toBe(
        doc.createdAt.toISOString(),
      );

      // Context mismatch returns null (Must fix 4)
      const differentContext = JSON.stringify([
        'user:123',
        'session_456',
        'createdAt:desc,_id:desc',
      ]);
      expect(decodeQuizCursor(cursor, differentContext)).toBeNull();
    });

    it('returns null for invalid or corrupted cursors', () => {
      const context = JSON.stringify([
        'user:123',
        null,
        'createdAt:desc,_id:desc',
      ]);
      expect(decodeQuizCursor('not-valid-base64', context)).toBeNull();
      expect(decodeQuizCursor('', context)).toBeNull();
      expect(decodeQuizCursor(null, context)).toBeNull();
      const corrupted = Buffer.from(
        JSON.stringify({ ctx: context, c: 'invalid-date', i: '123' }),
      ).toString('base64url');
      expect(decodeQuizCursor(corrupted, context)).toBeNull();
      // Non-ISO timestamp format fails strict check
      const nonIso = Buffer.from(
        JSON.stringify({
          ctx: context,
          c: '2026-11-16',
          i: '507f1f77bcf86cd799439011',
        }),
      ).toString('base64url');
      expect(decodeQuizCursor(nonIso, context)).toBeNull();
      // Missing expectedContext throws error
      expect(() => decodeQuizCursor('abc', /** @type {any} */ (''))).toThrow(
        /expectedContext is required/,
      );
    });
  });

  describe('isGradableQuestion (B4 Snapshot Validity)', () => {
    it('accepts valid multipleChoice and shortAnswer questions', () => {
      expect(
        isGradableQuestion({
          payload: {
            type: 'multipleChoice',
            prompt: 'Câu hỏi MC hợp lệ?',
            options: [
              { id: 'opt_1', text: 'A' },
              { id: 'opt_2', text: 'B' },
            ],
            correctOptionId: 'opt_1',
            explanation: 'Giải thích đầy đủ.',
          },
        }),
      ).toBe(true);

      expect(
        isGradableQuestion({
          payload: {
            type: 'shortAnswer',
            prompt: 'Câu hỏi SA hợp lệ?',
            acceptedAnswers: ['đúng', 'chính xác'],
            explanation: 'Giải thích đầy đủ.',
          },
        }),
      ).toBe(true);
    });

    it('rejects questions missing prompt or explanation or having empty whitespace', () => {
      expect(
        isGradableQuestion({
          payload: {
            type: 'multipleChoice',
            prompt: '   ',
            options: [
              { id: 'opt_1', text: 'A' },
              { id: 'opt_2', text: 'B' },
            ],
            correctOptionId: 'opt_1',
            explanation: 'Giải thích.',
          },
        }),
      ).toBe(false);

      expect(
        isGradableQuestion({
          payload: {
            type: 'multipleChoice',
            prompt: 'Câu hỏi?',
            options: [
              { id: 'opt_1', text: 'A' },
              { id: 'opt_2', text: 'B' },
            ],
            correctOptionId: 'opt_1',
            explanation: '',
          },
        }),
      ).toBe(false);
    });

    it('rejects multipleChoice with fewer than 2 options, duplicate option ids, or invalid correctOptionId', () => {
      // 1 option
      expect(
        isGradableQuestion({
          payload: {
            type: 'multipleChoice',
            prompt: 'Prompt?',
            options: [{ id: 'opt_1', text: 'A' }],
            correctOptionId: 'opt_1',
            explanation: 'Exp',
          },
        }),
      ).toBe(false);

      // duplicate option ids
      expect(
        isGradableQuestion({
          payload: {
            type: 'multipleChoice',
            prompt: 'Prompt?',
            options: [
              { id: 'opt_1', text: 'A' },
              { id: 'opt_1', text: 'B' },
            ],
            correctOptionId: 'opt_1',
            explanation: 'Exp',
          },
        }),
      ).toBe(false);

      // correctOptionId not in options
      expect(
        isGradableQuestion({
          payload: {
            type: 'multipleChoice',
            prompt: 'Prompt?',
            options: [
              { id: 'opt_1', text: 'A' },
              { id: 'opt_2', text: 'B' },
            ],
            correctOptionId: 'opt_unknown',
            explanation: 'Exp',
          },
        }),
      ).toBe(false);

      // option text is empty
      expect(
        isGradableQuestion({
          payload: {
            type: 'multipleChoice',
            prompt: 'Prompt?',
            options: [
              { id: 'opt_1', text: 'A' },
              { id: 'opt_2', text: '  ' },
            ],
            correctOptionId: 'opt_1',
            explanation: 'Exp',
          },
        }),
      ).toBe(false);
    });

    it('rejects shortAnswer with empty acceptedAnswers or answers containing untrimmed/empty strings', () => {
      expect(
        isGradableQuestion({
          payload: {
            type: 'shortAnswer',
            prompt: 'Prompt?',
            acceptedAnswers: [],
            explanation: 'Exp',
          },
        }),
      ).toBe(false);

      expect(
        isGradableQuestion({
          payload: {
            type: 'shortAnswer',
            prompt: 'Prompt?',
            acceptedAnswers: [''],
            explanation: 'Exp',
          },
        }),
      ).toBe(false);

      expect(
        isGradableQuestion({
          payload: {
            type: 'shortAnswer',
            prompt: 'Prompt?',
            acceptedAnswers: [' untrimmed '],
            explanation: 'Exp',
          },
        }),
      ).toBe(false);
    });
  });

  describe('resolveAlreadySubmitted (B3 Idempotency Replay)', () => {
    const submittedAttempt = {
      _id: new ObjectId(),
      deckVersionId: new ObjectId(),
      status: 'submitted',
      total: 1,
      score: 1,
      questions: [snapshotQuestions[0]],
      answers: [{ questionVersionId: q1Id, optionId: 'opt_1' }],
      results: [{ questionVersionId: q1Id, isCorrect: true, points: 1 }],
      submitPayloadHash: 'hash_abc123',
      submitOperationId: 'idem-key-1',
      createdAt: new Date(),
      submittedAt: new Date(),
    };

    it('returns existing result DTO when payloadHash matches', () => {
      const result = resolveAlreadySubmitted(
        submittedAttempt,
        'hash_abc123',
        'idem-key-1',
      );
      expect(result.status).toBe('submitted');
      expect(result.score).toBe(1);
    });

    it('throws 409 IDEMPOTENCY_CONFLICT when idempotencyKey matches but payloadHash differs', () => {
      expect(() =>
        resolveAlreadySubmitted(
          submittedAttempt,
          'different_hash',
          'idem-key-1',
        ),
      ).toThrowError(
        expect.objectContaining({
          status: 409,
          code: 'IDEMPOTENCY_CONFLICT',
        }),
      );
    });

    it('throws 409 QUIZ_ALREADY_SUBMITTED when payloadHash differs and key differs or missing', () => {
      expect(() =>
        resolveAlreadySubmitted(
          submittedAttempt,
          'different_hash',
          'idem-key-2',
        ),
      ).toThrowError(
        expect.objectContaining({
          status: 409,
          code: 'QUIZ_ALREADY_SUBMITTED',
        }),
      );

      expect(() =>
        resolveAlreadySubmitted(submittedAttempt, 'different_hash', undefined),
      ).toThrowError(
        expect.objectContaining({
          status: 409,
          code: 'QUIZ_ALREADY_SUBMITTED',
        }),
      );
    });
  });
});
