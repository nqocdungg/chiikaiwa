import {
  createMalformedRequestError,
  createValidationError,
} from '../../middleware/http-error.js';

const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/iu;
const INVITATION_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{10}$/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const REQUEST_STATUSES = new Set([
  'pending',
  'accepted',
  'rejected',
  'cancelled',
  'expired',
]);

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Validates POST /invitations, whose contract accepts only an empty object.
 * @param {unknown} body
 * @returns {Record<string, never>}
 */
export function validateCreateInvitationInput(body) {
  if (!isPlainObject(body)) {
    throw createMalformedRequestError();
  }

  const keys = Object.keys(body);
  if (keys.length > 0) {
    throw createValidationError(
      keys.map((key) => ({
        path: key,
        code: 'UNKNOWN_FIELD',
        message: `Trường "${key}" không được phép trong yêu cầu này.`,
      })),
    );
  }

  return {};
}

/**
 * Normalizes invitation input before lookup without accepting ambiguous code
 * characters that the server never generates.
 * @param {unknown} rawCode
 * @returns {string}
 */
export function normalizeInvitationCode(rawCode) {
  if (typeof rawCode !== 'string') {
    throw createValidationError([
      {
        path: 'code',
        code: 'INVALID_TYPE',
        message: 'Mã mời phải là chuỗi ký tự.',
      },
    ]);
  }

  const code = rawCode.trim().toUpperCase();
  if (!INVITATION_CODE_PATTERN.test(code)) {
    throw createValidationError([
      {
        path: 'code',
        code: 'INVALID_FORMAT',
        message: 'Mã mời phải gồm đúng 10 chữ cái in hoa hoặc chữ số hợp lệ.',
      },
    ]);
  }

  return code;
}

/**
 * @param {unknown} value
 * @param {string} [fieldName]
 * @returns {number}
 */
export function validateExpectedVersion(value, fieldName = 'expectedVersion') {
  if (!Number.isInteger(value) || /** @type {number} */ (value) < 0) {
    throw createValidationError([
      {
        path: fieldName,
        code: 'INVALID_VERSION',
        message: 'Phiên bản phải là số nguyên không âm.',
      },
    ]);
  }
  return /** @type {number} */ (value);
}

/**
 * Validates a resource identifier from a URL path.
 * @param {unknown} value
 * @param {string} [fieldName]
 * @returns {string}
 */
export function validateObjectId(value, fieldName = 'id') {
  if (typeof value !== 'string' || !OBJECT_ID_PATTERN.test(value)) {
    throw createMalformedRequestError(`${fieldName} không hợp lệ.`);
  }
  return value.toLowerCase();
}

/** @param {unknown} body */
export function validateCreateInviteRequestInput(body) {
  if (!isPlainObject(body)) throw createMalformedRequestError();
  const unknown = Object.keys(body).filter((key) => key !== 'code');
  if (unknown.length > 0) {
    throw createValidationError(
      unknown.map((key) => ({
        path: key,
        code: 'UNKNOWN_FIELD',
        message: `Trường "${key}" không được phép trong yêu cầu này.`,
      })),
    );
  }
  return { code: normalizeInvitationCode(body.code) };
}

/** @param {unknown} body */
export function validateInviteResponseInput(body) {
  if (!isPlainObject(body)) throw createMalformedRequestError();
  const allowed = new Set(['expectedVersion', 'decision']);
  const unknown = Object.keys(body).filter((key) => !allowed.has(key));
  const fields = unknown.map((key) => ({
    path: key,
    code: 'UNKNOWN_FIELD',
    message: `Trường "${key}" không được phép trong yêu cầu này.`,
  }));
  if (body.decision !== 'accept' && body.decision !== 'reject') {
    fields.push({
      path: 'decision',
      code: 'INVALID_DECISION',
      message: 'Quyết định phải là accept hoặc reject.',
    });
  }
  let expectedVersion;
  try {
    expectedVersion = validateExpectedVersion(body.expectedVersion);
  } catch (error) {
    if (error && typeof error === 'object' && 'details' in error) {
      const details = /** @type {{details?: {fields?: any[]}}} */ (error)
        .details;
      fields.push(...(details?.fields ?? []));
    } else throw error;
  }
  if (fields.length > 0) throw createValidationError(fields);
  return {
    expectedVersion: /** @type {number} */ (expectedVersion),
    decision: /** @type {'accept' | 'reject'} */ (body.decision),
  };
}

/** @param {unknown} value */
export function validateIdempotencyKey(value) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw createValidationError([
      {
        path: 'Idempotency-Key',
        code: 'INVALID_IDEMPOTENCY_KEY',
        message: 'Idempotency-Key phải là UUID hợp lệ.',
      },
    ]);
  }
  return value.toLowerCase();
}

/** @param {Record<string, unknown>} query */
export function validateInviteRequestListQuery(query) {
  const unknown = Object.keys(query).filter(
    (key) => !['status', 'limit', 'cursor'].includes(key),
  );
  if (unknown.length > 0) {
    throw createValidationError(
      unknown.map((key) => ({
        path: key,
        code: 'UNKNOWN_FIELD',
        message: `Tham số "${key}" không được phép.`,
      })),
    );
  }
  const status = query.status;
  if (
    status !== undefined &&
    (typeof status !== 'string' || !REQUEST_STATUSES.has(status))
  ) {
    throw createValidationError([
      {
        path: 'status',
        code: 'INVALID_STATUS',
        message: 'Trạng thái yêu cầu không hợp lệ.',
      },
    ]);
  }
  const rawLimit = query.limit ?? '20';
  const limit =
    typeof rawLimit === 'string' && /^\d+$/u.test(rawLimit)
      ? Number(rawLimit)
      : Number.NaN;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw createValidationError([
      {
        path: 'limit',
        code: 'INVALID_LIMIT',
        message: 'limit phải là số nguyên từ 1 đến 50.',
      },
    ]);
  }
  if (query.cursor !== undefined && typeof query.cursor !== 'string') {
    throw createValidationError([
      {
        path: 'cursor',
        code: 'INVALID_CURSOR',
        message: 'Cursor không hợp lệ.',
      },
    ]);
  }
  return { status, limit, cursor: query.cursor };
}
