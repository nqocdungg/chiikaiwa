import { describe, expect, it } from 'vitest';
import {
  MAX_REPORT_DESCRIPTION_LENGTH,
  MAX_REPORT_REASON_LENGTH,
  validateCreateBlockInput,
  validateCreateReportInput,
  validateListBlocksQuery,
} from '../../server/modules/safety/safety-validation.js';

const VALID_SESSION_ID = '507f1f77bcf86cd799439011';
const VALID_TARGET_USER = 'user:507f1f77bcf86cd799439012';
const VALID_TARGET_GUEST = 'GUEST:507F1F77BCF86CD799439013';

describe('safety-validation', () => {
  describe('validateListBlocksQuery', () => {
    it('defaults limit to 20 when omitted', () => {
      expect(validateListBlocksQuery({})).toEqual({ limit: 20 });
    });

    it('accepts valid limit and cursor', () => {
      expect(
        validateListBlocksQuery({ limit: '10', cursor: 'abc123' }),
      ).toEqual({
        limit: 10,
        cursor: 'abc123',
      });
    });

    it('rejects out-of-range limit, unknown fields, and empty cursor', () => {
      for (const badQuery of [
        { limit: '0' },
        { limit: '51' },
        { sort: 'createdAt' },
        { cursor: '' },
      ]) {
        expect(() => validateListBlocksQuery(badQuery)).toThrowError(
          expect.objectContaining({ status: 422, code: 'VALIDATION_FAILED' }),
        );
      }
    });
  });

  describe('validateCreateBlockInput', () => {
    it('normalizes valid sessionId and targetActorKey', () => {
      expect(
        validateCreateBlockInput({
          sessionId: VALID_SESSION_ID.toUpperCase(),
          targetActorKey: VALID_TARGET_GUEST,
        }),
      ).toEqual({
        sessionId: VALID_SESSION_ID,
        targetActorKey: 'guest:507f1f77bcf86cd799439013',
      });
    });

    it('rejects non-object body with 400 MALFORMED_REQUEST', () => {
      expect(() => validateCreateBlockInput(null)).toThrowError(
        expect.objectContaining({ status: 400, code: 'MALFORMED_REQUEST' }),
      );
    });

    it('rejects unknown fields, missing fields, and invalid formats with 422', () => {
      expect(() =>
        validateCreateBlockInput({
          sessionId: VALID_SESSION_ID,
          targetActorKey: VALID_TARGET_USER,
          extra: true,
        }),
      ).toThrowError(
        expect.objectContaining({ status: 422, code: 'VALIDATION_FAILED' }),
      );

      expect(() =>
        validateCreateBlockInput({
          sessionId: 'not-an-id',
          targetActorKey: 'admin:507f1f77bcf86cd799439012',
        }),
      ).toThrowError(
        expect.objectContaining({ status: 422, code: 'VALIDATION_FAILED' }),
      );
    });
  });

  describe('validateCreateReportInput', () => {
    it('accepts valid reason with optional description and trims reason', () => {
      expect(
        validateCreateReportInput({
          sessionId: VALID_SESSION_ID,
          targetActorKey: VALID_TARGET_USER,
          reason: '  Ngôn từ không phù hợp  ',
        }),
      ).toEqual({
        sessionId: VALID_SESSION_ID,
        targetActorKey: VALID_TARGET_USER,
        reason: 'Ngôn từ không phù hợp',
      });

      const emojiDesc = '😀'.repeat(MAX_REPORT_DESCRIPTION_LENGTH);
      expect(
        validateCreateReportInput({
          sessionId: VALID_SESSION_ID,
          targetActorKey: VALID_TARGET_USER,
          reason: 'Quấy rối',
          description: emojiDesc,
        }).description,
      ).toBe(emojiDesc);
    });

    it('rejects blank reason, over-limit reason/description, null description, and unknown fields', () => {
      expect(() =>
        validateCreateReportInput({
          sessionId: VALID_SESSION_ID,
          targetActorKey: VALID_TARGET_USER,
          reason: '   ',
        }),
      ).toThrowError(
        expect.objectContaining({ status: 422, code: 'VALIDATION_FAILED' }),
      );

      expect(() =>
        validateCreateReportInput({
          sessionId: VALID_SESSION_ID,
          targetActorKey: VALID_TARGET_USER,
          reason: 'a'.repeat(MAX_REPORT_REASON_LENGTH + 1),
        }),
      ).toThrowError(
        expect.objectContaining({ status: 422, code: 'VALIDATION_FAILED' }),
      );

      expect(() =>
        validateCreateReportInput({
          sessionId: VALID_SESSION_ID,
          targetActorKey: VALID_TARGET_USER,
          reason: 'Quấy rối',
          description: '😀'.repeat(MAX_REPORT_DESCRIPTION_LENGTH + 1),
        }),
      ).toThrowError(
        expect.objectContaining({ status: 422, code: 'VALIDATION_FAILED' }),
      );

      expect(() =>
        validateCreateReportInput({
          sessionId: VALID_SESSION_ID,
          targetActorKey: VALID_TARGET_USER,
          reason: 'Quấy rối',
          description: null,
        }),
      ).toThrowError(
        expect.objectContaining({ status: 422, code: 'VALIDATION_FAILED' }),
      );

      expect(() =>
        validateCreateReportInput({
          sessionId: VALID_SESSION_ID,
          targetActorKey: VALID_TARGET_USER,
          reason: 'Quấy rối',
          attachments: ['evidence.png'],
        }),
      ).toThrowError(
        expect.objectContaining({ status: 422, code: 'VALIDATION_FAILED' }),
      );
    });
  });
});
