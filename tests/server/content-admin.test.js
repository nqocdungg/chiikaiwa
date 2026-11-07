import { describe, expect, it } from 'vitest';
import {
  decodeContentCursor,
  encodeContentCursor,
  toContentItemDto,
} from '../../server/modules/content/content-dto.js';
import {
  validateContentItemDraftInput,
  validateDeckDraftPayload,
  validateKnowledgeDraftPayload,
  validateQuestionDraftPayload,
  validateScenarioDraftPayload,
} from '../../server/modules/content/content-validator.js';
import mongoose from 'mongoose';

const { ObjectId } = mongoose.Types;

describe('content-validator draft validation (BE-003)', () => {
  it('rejects invalid kind or empty draftPayload', () => {
    const invalidKindErrors = validateContentItemDraftInput({
      kind: 'invalid_kind',
      draftPayload: {},
    });
    expect(invalidKindErrors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'kind',
          code: 'INVALID_ENUM',
        }),
      ]),
    );

    const emptyPayloadErrors = validateContentItemDraftInput({
      kind: 'knowledge',
      draftPayload: null,
    });
    expect(emptyPayloadErrors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'draftPayload',
          code: 'REQUIRED',
        }),
      ]),
    );
  });

  it('validates knowledge draft payload correctly', () => {
    /** @type {any[]} */
    const fields = [];
    validateKnowledgeDraftPayload(
      {
        type: 'invalid',
        expression: '',
        meaning: '   ',
        reading: 123,
        examples: [],
      },
      fields,
    );

    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'draftPayload.type',
          code: 'INVALID_ENUM',
        }),
        expect.objectContaining({
          path: 'draftPayload.expression',
          code: 'REQUIRED',
        }),
        expect.objectContaining({
          path: 'draftPayload.meaning',
          code: 'REQUIRED',
        }),
        expect.objectContaining({
          path: 'draftPayload.reading',
          code: 'INVALID_TYPE',
        }),
        expect.objectContaining({
          path: 'draftPayload.examples',
          code: 'REQUIRED',
        }),
      ]),
    );
  });

  it('validates question draft payload (multipleChoice and shortAnswer)', () => {
    /** @type {any[]} */
    const mcFields = [];
    validateQuestionDraftPayload(
      {
        type: 'multipleChoice',
        prompt: '',
        explanation: '',
        options: [
          { id: 'opt1', text: 'A' },
          { id: 'opt1', text: 'B' }, // duplicate id
        ],
        correctOptionId: 'non_existent',
        knowledgeVersionIds: ['invalid-id'],
      },
      mcFields,
    );

    expect(mcFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'draftPayload.prompt',
          code: 'REQUIRED',
        }),
        expect.objectContaining({
          path: 'draftPayload.explanation',
          code: 'REQUIRED',
        }),
        expect.objectContaining({
          path: 'draftPayload.options[1].id',
          code: 'DUPLICATE',
        }),
        expect.objectContaining({
          path: 'draftPayload.correctOptionId',
          code: 'INVALID_REFERENCE',
        }),
        expect.objectContaining({
          path: 'draftPayload.knowledgeVersionIds[0]',
          code: 'INVALID_FORMAT',
        }),
      ]),
    );

    /** @type {any[]} */
    const saFields = [];
    validateQuestionDraftPayload(
      {
        type: 'shortAnswer',
        prompt: 'How to say hello?',
        explanation: 'Say konnichiwa',
        acceptedAnswers: [''],
      },
      saFields,
    );

    expect(saFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'draftPayload.acceptedAnswers[0]',
          code: 'REQUIRED',
        }),
      ]),
    );
  });

  it('validates scenario draft payload', () => {
    /** @type {any[]} */
    const fields = [];
    validateScenarioDraftPayload(
      {
        title: '',
        context: '',
        objective: '',
        roleA: '',
        roleB: '',
        hints: [],
      },
      fields,
    );

    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'draftPayload.title',
          code: 'REQUIRED',
        }),
        expect.objectContaining({
          path: 'draftPayload.context',
          code: 'REQUIRED',
        }),
        expect.objectContaining({
          path: 'draftPayload.objective',
          code: 'REQUIRED',
        }),
        expect.objectContaining({
          path: 'draftPayload.roleA',
          code: 'REQUIRED',
        }),
        expect.objectContaining({
          path: 'draftPayload.roleB',
          code: 'REQUIRED',
        }),
        expect.objectContaining({
          path: 'draftPayload.hints',
          code: 'REQUIRED',
        }),
      ]),
    );
  });

  it('validates deck draft payload', () => {
    /** @type {any[]} */
    const fields = [];
    validateDeckDraftPayload(
      {
        title: '',
        topicKey: '',
        level: 'N99',
        description: '',
      },
      fields,
    );

    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'draftPayload.title',
          code: 'REQUIRED',
        }),
        expect.objectContaining({
          path: 'draftPayload.topicKey',
          code: 'REQUIRED',
        }),
        expect.objectContaining({
          path: 'draftPayload.level',
          code: 'INVALID_ENUM',
        }),
        expect.objectContaining({
          path: 'draftPayload.description',
          code: 'REQUIRED',
        }),
      ]),
    );
  });
});

describe('content-dto and cursor encoding (BE-003)', () => {
  it('converts MongoDB doc to ContentItem DTO with correct fields', () => {
    const id = new ObjectId();
    const publishedId = new ObjectId();
    const now = new Date('2026-11-07T10:00:00.000Z');

    const deckDoc = {
      _id: id,
      kind: 'deck',
      status: 'draft',
      draftPayload: { title: 'Bài 1', level: 'N5' },
      publishedVersionId: publishedId,
      latestRevision: 1,
      version: 2,
      level: 'N5',
      title: 'Bài 1',
      createdBy: new ObjectId(),
      updatedBy: new ObjectId(),
      createdAt: now,
      updatedAt: now,
    };

    const dto = toContentItemDto(deckDoc);
    expect(dto).toEqual({
      id: id.toHexString(),
      kind: 'deck',
      status: 'draft',
      draftPayload: { title: 'Bài 1', level: 'N5' },
      publishedVersionId: publishedId.toHexString(),
      latestRevision: 1,
      version: 2,
      level: 'N5',
      title: 'Bài 1',
      createdAt: '2026-11-07T10:00:00.000Z',
      updatedAt: '2026-11-07T10:00:00.000Z',
    });
    // Đảm bảo không leak createdBy / updatedBy
    expect(dto).not.toHaveProperty('createdBy');
    expect(dto).not.toHaveProperty('updatedBy');
  });

  it('correctly encodes and decodes pagination cursor bound to query filters', () => {
    const id = new ObjectId();
    const date = new Date('2026-11-07T10:00:00.000Z');
    const filters = { kind: 'deck', status: 'draft', level: 'N5' };
    const cursor = encodeContentCursor({ createdAt: date, _id: id }, filters);

    expect(typeof cursor).toBe('string');
    // Decode với bộ lọc khớp
    const decoded = decodeContentCursor(cursor, filters);
    expect(decoded).not.toBeNull();
    expect(decoded?.createdAt.toISOString()).toBe(date.toISOString());
    expect(decoded?.id.toHexString()).toBe(id.toHexString());

    // Đổi bộ lọc giữa hai trang -> decode phải trả về null
    expect(decodeContentCursor(cursor, { kind: 'question' })).toBeNull();
    expect(
      decodeContentCursor(cursor, { kind: 'deck', level: 'N4' }),
    ).toBeNull();
    expect(
      decodeContentCursor(cursor, { kind: 'deck', status: 'published' }),
    ).toBeNull();

    // Invalid cursor tests
    expect(decodeContentCursor('not-valid-base64')).toBeNull();
    expect(decodeContentCursor(null)).toBeNull();
    expect(decodeContentCursor('')).toBeNull();
  });
});
