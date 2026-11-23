import { describe, expect, it } from 'vitest';
import { AppError } from '../../server/middleware/http-error.js';
import {
  generateInvitationCode,
  INVITATION_TTL_MS,
} from '../../server/modules/invitations/invitation-service.js';
import {
  normalizeInvitationCode,
  validateCreateInvitationInput,
  validateCreateInviteRequestInput,
  validateExpectedVersion,
  validateIdempotencyKey,
  validateInviteRequestListQuery,
  validateInviteResponseInput,
  validateObjectId,
} from '../../server/modules/invitations/invitation-validation.js';

/**
 * @param {() => unknown} action
 * @param {{status: number, code: string, details?: Record<string, unknown>}} expected
 */
function expectAppError(action, expected) {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject(expected);
    return;
  }
  throw new Error('Expected an AppError');
}

describe('BE-009 invitation primitives', () => {
  it('generates a ten-character code without ambiguous characters', () => {
    for (let attempt = 0; attempt < 32; attempt += 1) {
      expect(generateInvitationCode()).toMatch(/^[A-HJ-NP-Z2-9]{10}$/u);
    }
    expect(INVITATION_TTL_MS).toBe(600_000);
  });

  it('supports deterministic code generation at the random boundary', () => {
    expect(generateInvitationCode(() => 0)).toBe('AAAAAAAAAA');
    expect(() => generateInvitationCode(() => -1)).toThrow(RangeError);
  });

  it('accepts only an empty plain object for invitation creation', () => {
    expect(validateCreateInvitationInput({})).toEqual({});
    expectAppError(() => validateCreateInvitationInput(null), {
      status: 400,
      code: 'MALFORMED_REQUEST',
    });
    expectAppError(() => validateCreateInvitationInput(undefined), {
      status: 400,
      code: 'MALFORMED_REQUEST',
    });
    expectAppError(() => validateCreateInvitationInput({ role: 'host' }), {
      status: 422,
      code: 'VALIDATION_FAILED',
      details: {
        fields: [
          expect.objectContaining({ path: 'role', code: 'UNKNOWN_FIELD' }),
        ],
      },
    });
  });

  it('normalizes a valid invitation code', () => {
    expect(normalizeInvitationCode(' abcd234567 ')).toBe('ABCD234567');
  });

  it.each(['ABCD23456', 'ABCD234560', 'ABCD23456I', '', null, 123])(
    'rejects invalid invitation code %j',
    (code) => {
      expectAppError(() => normalizeInvitationCode(code), {
        status: 422,
        code: 'VALIDATION_FAILED',
      });
    },
  );

  it('accepts only non-negative integer versions', () => {
    expect(validateExpectedVersion(0)).toBe(0);
    expect(validateExpectedVersion(12)).toBe(12);
    for (const value of [-1, 1.5, '1', null, undefined]) {
      expectAppError(() => validateExpectedVersion(value), {
        status: 422,
        code: 'VALIDATION_FAILED',
      });
    }
  });

  it('validates and normalizes ObjectId path parameters', () => {
    expect(validateObjectId('507F1F77BCF86CD799439011')).toBe(
      '507f1f77bcf86cd799439011',
    );
    for (const value of ['not-an-id', '507f1f77bcf86cd79943901z', null]) {
      expectAppError(() => validateObjectId(value, 'invitationId'), {
        status: 400,
        code: 'MALFORMED_REQUEST',
      });
    }
  });

  it('validates request creation and host response bodies', () => {
    expect(validateCreateInviteRequestInput({ code: ' abcd234567 ' })).toEqual({
      code: 'ABCD234567',
    });
    expect(
      validateInviteResponseInput({ expectedVersion: 2, decision: 'accept' }),
    ).toEqual({
      expectedVersion: 2,
      decision: 'accept',
    });
    expectAppError(
      () =>
        validateInviteResponseInput({ expectedVersion: 2, decision: 'maybe' }),
      { status: 422, code: 'VALIDATION_FAILED' },
    );
  });

  it('validates operation IDs and bounded list queries', () => {
    expect(validateIdempotencyKey('4f63d5d0-d68a-4704-81a3-2833f534e532')).toBe(
      '4f63d5d0-d68a-4704-81a3-2833f534e532',
    );
    expect(
      validateInviteRequestListQuery({ status: 'pending', limit: '50' }),
    ).toEqual({ status: 'pending', limit: 50, cursor: undefined });
    expectAppError(() => validateIdempotencyKey('not-a-uuid'), {
      status: 422,
      code: 'VALIDATION_FAILED',
    });
    expectAppError(() => validateInviteRequestListQuery({ limit: '51' }), {
      status: 422,
      code: 'VALIDATION_FAILED',
    });
  });
});
