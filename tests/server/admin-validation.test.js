import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import {
  encodeAdminCursor,
  decodeAdminCursor,
} from '../../server/modules/safety/admin-service.js';
import {
  parseAdminPageLimit,
  validateAdminReportUpdateBody,
  validateAdminReportsQuery,
  validateAdminUserStatusBody,
  validateAdminUsersQuery,
  validateIdempotencyKey,
  validateObjectId,
} from '../../server/modules/safety/admin-validation.js';

describe('Admin Validation Unit Tests (BE-026, V-01 - V-10)', () => {
  describe('V-01 & V-02: Query validation (Users & Reports)', () => {
    it('V-01: từ chối 422 UNKNOWN_FIELD khi query users có khóa lạ', () => {
      expect(() =>
        validateAdminUsersQuery({
          sort: 'createdAt:desc',
          email: 'test@example.com',
        }),
      ).toThrowError();
      try {
        validateAdminUsersQuery({ sort: 'asc' });
      } catch (/** @type {any} */ err) {
        expect(err.status).toBe(422);
        expect(err.code).toBe('VALIDATION_FAILED');
        expect(err.details?.fields[0]?.code).toBe('UNKNOWN_FIELD');
      }
    });

    it('V-01: từ chối 422 UNKNOWN_FIELD khi query reports có khóa lạ', () => {
      try {
        validateAdminReportsQuery({ sort: 'asc' });
      } catch (/** @type {any} */ err) {
        expect(err.status).toBe(422);
        expect(err.code).toBe('VALIDATION_FAILED');
        expect(err.details?.fields[0]?.code).toBe('UNKNOWN_FIELD');
      }
    });

    it('V-02: từ chối 422 INVALID_STATUS khi status users không hợp lệ hoặc sai hoa thường', () => {
      for (const invalidStatus of [
        'banned',
        'Active',
        'LOCKED',
        'pending',
        '',
      ]) {
        try {
          validateAdminUsersQuery({ status: invalidStatus });
          expect.unreachable('Should have thrown for invalid user status');
        } catch (/** @type {any} */ err) {
          expect(err.status).toBe(422);
          expect(err.details?.fields[0]?.code).toBe('INVALID_STATUS');
        }
      }
    });

    it('V-02: từ chối 422 INVALID_STATUS khi status reports không hợp lệ', () => {
      for (const invalidStatus of ['done', 'New', 'RESOLVED', 'closed', '']) {
        try {
          validateAdminReportsQuery({ status: invalidStatus });
          expect.unreachable('Should have thrown for invalid report status');
        } catch (/** @type {any} */ err) {
          expect(err.status).toBe(422);
          expect(err.details?.fields[0]?.code).toBe('INVALID_STATUS');
        }
      }
    });

    it('chấp nhận query hợp lệ với status đúng enum', () => {
      expect(validateAdminUsersQuery({ status: 'active' }).status).toBe(
        'active',
      );
      expect(validateAdminUsersQuery({ status: 'locked' }).status).toBe(
        'locked',
      );
      expect(validateAdminReportsQuery({ status: 'new' }).status).toBe('new');
      expect(validateAdminReportsQuery({ status: 'inProgress' }).status).toBe(
        'inProgress',
      );
      expect(validateAdminReportsQuery({ status: 'resolved' }).status).toBe(
        'resolved',
      );
      expect(validateAdminReportsQuery({ status: 'rejected' }).status).toBe(
        'rejected',
      );
    });
  });

  describe('V-03: Limit parsing and validation', () => {
    it('mặc định trả về 20 khi limit vắng mặt hoặc rỗng', () => {
      expect(parseAdminPageLimit(undefined)).toBe(20);
      expect(parseAdminPageLimit(null)).toBe(20);
      expect(parseAdminPageLimit('')).toBe(20);
      expect(validateAdminUsersQuery({}).limit).toBe(20);
      expect(validateAdminReportsQuery({}).limit).toBe(20);
    });

    it('chấp nhận limit từ 1 đến 50 dạng chuỗi số nguyên', () => {
      expect(parseAdminPageLimit('1')).toBe(1);
      expect(parseAdminPageLimit('20')).toBe(20);
      expect(parseAdminPageLimit('50')).toBe(50);
      expect(validateAdminUsersQuery({ limit: '50' }).limit).toBe(50);
    });

    it('từ chối 422 INVALID_LIMIT với các giá trị ngoài phạm vi hoặc không chuẩn', () => {
      const invalidLimits = [
        '0',
        '51',
        '-1',
        'abc',
        '1e1',
        ' 5',
        '0x10',
        '5.0',
        '20 ',
        10,
        [],
        {},
      ];
      for (const raw of invalidLimits) {
        try {
          parseAdminPageLimit(raw);
          expect.unreachable(`Should have thrown for limit: ${String(raw)}`);
        } catch (/** @type {any} */ err) {
          expect(err.status).toBe(422);
          expect(err.details?.fields[0]?.code).toBe('INVALID_LIMIT');
        }
      }
    });
  });

  describe('V-04: Cursor validation', () => {
    it('chấp nhận cursor là chuỗi hợp lệ có độ dài <= 512', () => {
      const validCursor = 'a'.repeat(512);
      expect(validateAdminUsersQuery({ cursor: validCursor }).cursor).toBe(
        validCursor,
      );
      expect(validateAdminReportsQuery({ cursor: validCursor }).cursor).toBe(
        validCursor,
      );
    });

    it('V-04: từ chối 400 INVALID_CURSOR khi cursor không phải chuỗi, rỗng hoặc vượt quá 512 ký tự', () => {
      const invalidCursors = ['', 123, null, true, {}, [], 'a'.repeat(513)];
      for (const cur of invalidCursors) {
        try {
          validateAdminUsersQuery({ cursor: cur });
          expect.unreachable('Should have thrown for invalid cursor');
        } catch (/** @type {any} */ err) {
          expect(err.status).toBe(400);
          expect(err.code).toBe('INVALID_CURSOR');
        }
        try {
          validateAdminReportsQuery({ cursor: cur });
          expect.unreachable('Should have thrown for invalid cursor');
        } catch (/** @type {any} */ err) {
          expect(err.status).toBe(400);
          expect(err.code).toBe('INVALID_CURSOR');
        }
      }
    });
  });

  describe('V-05, V-06, V-07: validateAdminUserStatusBody', () => {
    it('V-07: từ chối 400 MALFORMED_REQUEST khi body không phải đối tượng thuần', () => {
      const notObjects = [null, undefined, 'string', 123, true, [], ['item']];
      for (const body of notObjects) {
        expect(() => validateAdminUserStatusBody(body)).toThrowError();
        try {
          validateAdminUserStatusBody(body);
        } catch (/** @type {any} */ err) {
          expect(err.status).toBe(400);
          expect(err.code).toBe('MALFORMED_REQUEST');
        }
      }
    });

    it('V-07: từ chối 422 UNKNOWN_FIELD khi body có trường thừa', () => {
      try {
        validateAdminUserStatusBody({
          expectedVersion: 0,
          status: 'locked',
          role: 'admin',
        });
        expect.unreachable();
      } catch (/** @type {any} */ err) {
        expect(err.status).toBe(422);
        expect(err.details?.fields[0]?.code).toBe('UNKNOWN_FIELD');
      }
    });

    it('V-05: từ chối 422 INVALID_VERSION khi expectedVersion thiếu, âm, số thực, chuỗi hoặc null', () => {
      const invalidVersions = [
        undefined,
        null,
        -1,
        1.5,
        '0',
        '1',
        NaN,
        Infinity,
      ];
      for (const ver of invalidVersions) {
        try {
          validateAdminUserStatusBody({
            expectedVersion: ver,
            status: 'locked',
          });
          expect.unreachable(`Should throw for version: ${String(ver)}`);
        } catch (/** @type {any} */ err) {
          expect(err.status).toBe(422);
          expect(
            err.details?.fields.some(
              (/** @type {any} */ f) =>
                f.path === 'expectedVersion' && f.code === 'INVALID_VERSION',
            ),
          ).toBe(true);
        }
      }
    });

    it('V-06: từ chối 422 INVALID_STATUS khi status thiếu hoặc không phải active/locked', () => {
      const invalidStatuses = [
        undefined,
        null,
        '',
        'banned',
        'LOCKED',
        'Active',
        123,
      ];
      for (const st of invalidStatuses) {
        try {
          validateAdminUserStatusBody({ expectedVersion: 0, status: st });
          expect.unreachable(`Should throw for status: ${String(st)}`);
        } catch (/** @type {any} */ err) {
          expect(err.status).toBe(422);
          expect(
            err.details?.fields.some(
              (/** @type {any} */ f) =>
                f.path === 'status' && f.code === 'INVALID_STATUS',
            ),
          ).toBe(true);
        }
      }
    });

    it('chấp nhận body hợp lệ cho PATCH status user', () => {
      expect(
        validateAdminUserStatusBody({ expectedVersion: 0, status: 'locked' }),
      ).toEqual({ expectedVersion: 0, status: 'locked' });
      expect(
        validateAdminUserStatusBody({ expectedVersion: 3, status: 'active' }),
      ).toEqual({ expectedVersion: 3, status: 'active' });
    });
  });

  describe('V-08: validateAdminReportUpdateBody', () => {
    it('từ chối 400 MALFORMED_REQUEST khi body report không phải đối tượng thuần', () => {
      expect(() => validateAdminReportUpdateBody(null)).toThrowError();
      expect(() => validateAdminReportUpdateBody('string')).toThrowError();
    });

    it('từ chối 422 UNKNOWN_FIELD khi body report có trường lạ', () => {
      try {
        validateAdminReportUpdateBody({
          expectedVersion: 0,
          status: 'resolved',
          extra: true,
        });
        expect.unreachable();
      } catch (/** @type {any} */ err) {
        expect(err.status).toBe(422);
        expect(err.details?.fields[0]?.code).toBe('UNKNOWN_FIELD');
      }
    });

    it('từ chối 422 INVALID_STATUS khi status report ngoài enum', () => {
      for (const st of ['done', 'closed', 'New', undefined, null]) {
        try {
          validateAdminReportUpdateBody({ expectedVersion: 0, status: st });
          expect.unreachable();
        } catch (/** @type {any} */ err) {
          expect(err.status).toBe(422);
          expect(
            err.details?.fields.some(
              (/** @type {any} */ f) => f.path === 'status',
            ),
          ).toBe(true);
        }
      }
    });

    it('từ chối 422 INVALID_RESOLUTION khi resolution không phải chuỗi, null, rỗng hoặc chỉ khoảng trắng', () => {
      const invalidResolutions = [null, 123, true, '', '   ', '\n\t  '];
      for (const res of invalidResolutions) {
        try {
          validateAdminReportUpdateBody({
            expectedVersion: 0,
            status: 'resolved',
            resolution: res,
          });
          expect.unreachable(`Should throw for resolution: ${String(res)}`);
        } catch (/** @type {any} */ err) {
          expect(err.status).toBe(422);
          expect(
            err.details?.fields.some(
              (/** @type {any} */ f) =>
                f.path === 'resolution' && f.code === 'INVALID_RESOLUTION',
            ),
          ).toBe(true);
        }
      }
    });

    it('chấp nhận resolution đúng 2000 code points (kể cả emoji ngoài BMP), và từ chối 2001 code points', () => {
      // Emoji 😀 nằm ngoài BMP (2 UTF-16 code units, nhưng 1 code point)
      const emoji = '😀';
      const text2000 = emoji.repeat(2000);
      expect([...text2000].length).toBe(2000);

      const validated = validateAdminReportUpdateBody({
        expectedVersion: 1,
        status: 'resolved',
        resolution: text2000,
      });
      expect(validated.resolution).toBe(text2000);

      const text2001 = emoji.repeat(2001);
      try {
        validateAdminReportUpdateBody({
          expectedVersion: 1,
          status: 'resolved',
          resolution: text2001,
        });
        expect.unreachable();
      } catch (/** @type {any} */ err) {
        expect(err.status).toBe(422);
        expect(err.details?.fields[0]?.code).toBe('INVALID_RESOLUTION');
      }
    });

    it('chấp nhận body report không truyền resolution', () => {
      const result = validateAdminReportUpdateBody({
        expectedVersion: 0,
        status: 'inProgress',
      });
      expect(result).toEqual({ expectedVersion: 0, status: 'inProgress' });
      expect('resolution' in result).toBe(false);
    });

    it('từ chối 422 INVALID_RESOLUTION khi gửi resolution kèm status new (R3)', () => {
      try {
        validateAdminReportUpdateBody({
          expectedVersion: 0,
          status: 'new',
          resolution: 'Không hợp lệ',
        });
        expect.unreachable();
      } catch (/** @type {any} */ err) {
        expect(err.status).toBe(422);
        expect(err.details?.fields[0]?.path).toBe('resolution');
        expect(err.details?.fields[0]?.code).toBe('INVALID_RESOLUTION');
      }
    });
  });

  describe('V-09 & V-10: validateIdempotencyKey & validateObjectId', () => {
    it('V-09: kiểm tra Idempotency-Key UUID', () => {
      expect(
        validateIdempotencyKey('4f63d5d0-d68a-4704-81a3-2833f534e532'),
      ).toBe('4f63d5d0-d68a-4704-81a3-2833f534e532');

      const invalidKeys = [
        '',
        'not-a-uuid',
        '4f63d5d0-d68a-4704-81a3',
        123,
        null,
        undefined,
      ];
      for (const k of invalidKeys) {
        try {
          validateIdempotencyKey(k);
          expect.unreachable();
        } catch (/** @type {any} */ err) {
          expect(err.status).toBe(422);
          expect(err.details?.fields[0]?.code).toBe('INVALID_IDEMPOTENCY_KEY');
        }
      }
    });

    it('V-10: kiểm tra validateObjectId', () => {
      const validId = '507f1f77bcf86cd799439011';
      expect(validateObjectId(validId)).toBe(validId);

      const invalidIds = [
        '123',
        'not-hex',
        '507f1f77bcf86cd79943901',
        null,
        123,
      ];
      for (const id of invalidIds) {
        try {
          validateObjectId(id);
          expect.unreachable();
        } catch (/** @type {any} */ err) {
          expect(err.status).toBe(400);
          expect(err.code).toBe('MALFORMED_REQUEST');
        }
      }
    });
  });

  describe('encodeAdminCursor & decodeAdminCursor (R2)', () => {
    it('mã hóa và giải mã cursor hợp lệ khi createdAt là Date', () => {
      const now = new Date();
      const id = new mongoose.Types.ObjectId();
      const cursor = encodeAdminCursor({ _id: id, createdAt: now }, 'test-ctx');
      expect(typeof cursor).toBe('string');
      const decoded = decodeAdminCursor(cursor, 'test-ctx');
      expect(decoded).not.toBeNull();
      expect(decoded?.createdAt.toISOString()).toBe(now.toISOString());
      expect(decoded?.id.toHexString()).toBe(id.toHexString());
    });

    it('ném lỗi 500 INTERNAL_ERROR khi item không có createdAt kiểu Date hợp lệ (R2)', () => {
      const id = new mongoose.Types.ObjectId();
      expect(() => encodeAdminCursor({ _id: id }, 'test-ctx')).toThrow();
      try {
        encodeAdminCursor({ _id: id, createdAt: 'not-a-date' }, 'test-ctx');
        expect.unreachable();
      } catch (/** @type {any} */ err) {
        expect(err.status).toBe(500);
        expect(err.code).toBe('INTERNAL_ERROR');
      }
    });
  });
});
