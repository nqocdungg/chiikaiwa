import {
  AppError,
  createMalformedRequestError,
  createValidationError,
} from '../../middleware/http-error.js';
import {
  validateIdempotencyKey,
  validateObjectId,
} from '../invitations/invitation-validation.js';

export { validateIdempotencyKey, validateObjectId };

const USER_STATUSES = new Set(['active', 'locked']);
const REPORT_STATUSES = new Set(['new', 'inProgress', 'resolved', 'rejected']);
const STRICT_LIMIT_PATTERN = /^[1-9]\d*$/u;
const MAX_CURSOR_LENGTH = 512;
const MAX_RESOLUTION_CODE_POINTS = 2000;

/**
 * Checks whether the value is a plain JavaScript object.
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
export function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Parses and strictly validates a pagination limit (1-50, defaults to 20).
 * Rejects scientific notation, hexadecimal, leading spaces, floats, and numbers outside [1, 50].
 *
 * @param {unknown} rawLimit
 * @param {number} [defaultLimit=20]
 * @returns {number}
 */
export function parseAdminPageLimit(rawLimit, defaultLimit = 20) {
  if (rawLimit === undefined || rawLimit === null || rawLimit === '') {
    return defaultLimit;
  }
  if (typeof rawLimit !== 'string' || !STRICT_LIMIT_PATTERN.test(rawLimit)) {
    throw createValidationError([
      {
        path: 'limit',
        code: 'INVALID_LIMIT',
        message: 'limit phải là số nguyên từ 1 đến 50.',
      },
    ]);
  }
  const parsed = Number(rawLimit);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 50) {
    throw createValidationError([
      {
        path: 'limit',
        code: 'INVALID_LIMIT',
        message: 'limit phải là số nguyên từ 1 đến 50.',
      },
    ]);
  }
  return parsed;
}

/**
 * Validates GET /api/v1/admin/users query parameters.
 * @param {Record<string, unknown>} query
 * @returns {{ status?: 'active' | 'locked', limit: number, cursor?: string }}
 */
export function validateAdminUsersQuery(query) {
  if (!query || typeof query !== 'object') {
    throw createMalformedRequestError('Query parameters không hợp lệ.');
  }

  const allowedKeys = new Set(['status', 'limit', 'cursor']);
  const unknownKeys = Object.keys(query).filter((k) => !allowedKeys.has(k));
  if (unknownKeys.length > 0) {
    throw createValidationError(
      unknownKeys.map((key) => ({
        path: key,
        code: 'UNKNOWN_FIELD',
        message: `Tham số "${key}" không được phép.`,
      })),
    );
  }

  const { status, limit, cursor } = query;

  if (status !== undefined) {
    if (typeof status !== 'string' || !USER_STATUSES.has(status)) {
      throw createValidationError([
        {
          path: 'status',
          code: 'INVALID_STATUS',
          message: 'Trạng thái người dùng không hợp lệ.',
        },
      ]);
    }
  }

  const validatedLimit = parseAdminPageLimit(limit, 20);

  if (cursor !== undefined) {
    if (
      typeof cursor !== 'string' ||
      cursor === '' ||
      cursor.length > MAX_CURSOR_LENGTH
    ) {
      throw new AppError({
        status: 400,
        code: 'INVALID_CURSOR',
        message: 'Con trỏ không hợp lệ hoặc không khớp danh sách.',
      });
    }
  }

  return {
    status: /** @type {'active' | 'locked' | undefined} */ (status),
    limit: validatedLimit,
    cursor: cursor !== undefined ? String(cursor) : undefined,
  };
}

/**
 * Validates GET /api/v1/admin/reports query parameters.
 * @param {Record<string, unknown>} query
 * @returns {{ status?: 'new' | 'inProgress' | 'resolved' | 'rejected', limit: number, cursor?: string }}
 */
export function validateAdminReportsQuery(query) {
  if (!query || typeof query !== 'object') {
    throw createMalformedRequestError('Query parameters không hợp lệ.');
  }

  const allowedKeys = new Set(['status', 'limit', 'cursor']);
  const unknownKeys = Object.keys(query).filter((k) => !allowedKeys.has(k));
  if (unknownKeys.length > 0) {
    throw createValidationError(
      unknownKeys.map((key) => ({
        path: key,
        code: 'UNKNOWN_FIELD',
        message: `Tham số "${key}" không được phép.`,
      })),
    );
  }

  const { status, limit, cursor } = query;

  if (status !== undefined) {
    if (typeof status !== 'string' || !REPORT_STATUSES.has(status)) {
      throw createValidationError([
        {
          path: 'status',
          code: 'INVALID_STATUS',
          message: 'Trạng thái báo cáo không hợp lệ.',
        },
      ]);
    }
  }

  const validatedLimit = parseAdminPageLimit(limit, 20);

  if (cursor !== undefined) {
    if (
      typeof cursor !== 'string' ||
      cursor === '' ||
      cursor.length > MAX_CURSOR_LENGTH
    ) {
      throw new AppError({
        status: 400,
        code: 'INVALID_CURSOR',
        message: 'Con trỏ không hợp lệ hoặc không khớp danh sách.',
      });
    }
  }

  return {
    status:
      /** @type {'new' | 'inProgress' | 'resolved' | 'rejected' | undefined} */ (
        status
      ),
    limit: validatedLimit,
    cursor: cursor !== undefined ? String(cursor) : undefined,
  };
}

/**
 * Validates PATCH /api/v1/admin/users/:id/status body.
 * @param {unknown} body
 * @returns {{ expectedVersion: number, status: 'active' | 'locked' }}
 */
export function validateAdminUserStatusBody(body) {
  if (!isPlainObject(body)) {
    throw createMalformedRequestError(
      'Dữ liệu yêu cầu phải là một đối tượng JSON.',
    );
  }

  const allowedKeys = new Set(['expectedVersion', 'status']);
  const unknownKeys = Object.keys(body).filter((k) => !allowedKeys.has(k));
  if (unknownKeys.length > 0) {
    throw createValidationError(
      unknownKeys.map((key) => ({
        path: key,
        code: 'UNKNOWN_FIELD',
        message: `Trường "${key}" không được phép trong yêu cầu này.`,
      })),
    );
  }

  /** @type {Array<{ path: string, code: string, message: string }>} */
  const fields = [];

  const rawVersion = body.expectedVersion;
  if (
    rawVersion === undefined ||
    rawVersion === null ||
    typeof rawVersion !== 'number' ||
    !Number.isInteger(rawVersion) ||
    rawVersion < 0
  ) {
    fields.push({
      path: 'expectedVersion',
      code: 'INVALID_VERSION',
      message: 'expectedVersion phải là số nguyên không âm.',
    });
  }

  const rawStatus = body.status;
  if (
    rawStatus === undefined ||
    rawStatus === null ||
    typeof rawStatus !== 'string' ||
    !USER_STATUSES.has(rawStatus)
  ) {
    fields.push({
      path: 'status',
      code: 'INVALID_STATUS',
      message: 'status phải là active hoặc locked.',
    });
  }

  if (fields.length > 0) {
    throw createValidationError(fields);
  }

  return {
    expectedVersion: /** @type {number} */ (rawVersion),
    status: /** @type {'active' | 'locked'} */ (rawStatus),
  };
}

/**
 * Validates PATCH /api/v1/admin/reports/:id body.
 * @param {unknown} body
 * @returns {{ expectedVersion: number, status: 'new' | 'inProgress' | 'resolved' | 'rejected', resolution?: string }}
 */
export function validateAdminReportUpdateBody(body) {
  if (!isPlainObject(body)) {
    throw createMalformedRequestError(
      'Dữ liệu yêu cầu phải là một đối tượng JSON.',
    );
  }

  const allowedKeys = new Set(['expectedVersion', 'status', 'resolution']);
  const unknownKeys = Object.keys(body).filter((k) => !allowedKeys.has(k));
  if (unknownKeys.length > 0) {
    throw createValidationError(
      unknownKeys.map((key) => ({
        path: key,
        code: 'UNKNOWN_FIELD',
        message: `Trường "${key}" không được phép trong yêu cầu này.`,
      })),
    );
  }

  /** @type {Array<{ path: string, code: string, message: string }>} */
  const fields = [];

  const rawVersion = body.expectedVersion;
  if (
    rawVersion === undefined ||
    rawVersion === null ||
    typeof rawVersion !== 'number' ||
    !Number.isInteger(rawVersion) ||
    rawVersion < 0
  ) {
    fields.push({
      path: 'expectedVersion',
      code: 'INVALID_VERSION',
      message: 'expectedVersion phải là số nguyên không âm.',
    });
  }

  const rawStatus = body.status;
  if (
    rawStatus === undefined ||
    rawStatus === null ||
    typeof rawStatus !== 'string' ||
    !REPORT_STATUSES.has(rawStatus)
  ) {
    fields.push({
      path: 'status',
      code: 'INVALID_STATUS',
      message: 'status phải là new, inProgress, resolved hoặc rejected.',
    });
  }

  let resolution;
  if ('resolution' in body) {
    const rawResolution = body.resolution;
    if (
      typeof rawResolution !== 'string' ||
      rawResolution.trim() === '' ||
      [...rawResolution].length > MAX_RESOLUTION_CODE_POINTS
    ) {
      fields.push({
        path: 'resolution',
        code: 'INVALID_RESOLUTION',
        message: `resolution phải là chuỗi không rỗng và không quá ${MAX_RESOLUTION_CODE_POINTS} ký tự.`,
      });
    } else {
      resolution = rawResolution;
    }
  }

  if (fields.length > 0) {
    throw createValidationError(fields);
  }

  return {
    expectedVersion: /** @type {number} */ (rawVersion),
    status: /** @type {'new' | 'inProgress' | 'resolved' | 'rejected'} */ (
      rawStatus
    ),
    ...(resolution !== undefined ? { resolution } : {}),
  };
}
