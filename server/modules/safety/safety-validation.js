import {
  createMalformedRequestError,
  createValidationError,
} from '../../middleware/http-error.js';
import {
  validateIdempotencyKey,
  validateObjectId,
} from '../invitations/invitation-validation.js';

const OBJECT_ID_RE = /^[0-9a-f]{24}$/iu;
const ACTOR_KEY_RE = /^(user|guest):([0-9a-f]{24})$/iu;

export const MAX_REPORT_REASON_LENGTH = 500;
export const MAX_REPORT_DESCRIPTION_LENGTH = 2000;
export const DEFAULT_BLOCKS_LIMIT = 20;
export const MAX_BLOCKS_LIMIT = 50;

export { validateIdempotencyKey, validateObjectId };

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Counts Unicode code points (07 §2.3).
 *
 * @param {string} value
 */
function codePointLength(value) {
  return [...value].length;
}

/**
 * Rejects any unexpected keys on a plain object payload (07 §1).
 *
 * @param {Record<string, unknown>} obj
 * @param {Set<string>} allowed
 */
function assertAllowedFields(obj, allowed) {
  const unknown = Object.keys(obj).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw createValidationError(
      unknown.map((field) => ({
        path: field,
        code: 'UNKNOWN_FIELD',
        message: `Trường "${field}" không được phép trong yêu cầu này.`,
      })),
    );
  }
}

/**
 * Validates and normalizes an actorKey (`user:<24-hex>` or `guest:<24-hex>`).
 *
 * @param {unknown} value
 * @returns {string | null}
 */
function normalizeActorKey(value) {
  if (typeof value !== 'string') return null;
  const match = ACTOR_KEY_RE.exec(value);
  if (!match) return null;
  return `${match[1].toLowerCase()}:${match[2].toLowerCase()}`;
}

/**
 * Validates query parameters for `GET /api/v1/me/blocks`.
 *
 * @param {Record<string, unknown>} query
 * @returns {{ limit: number, cursor?: string }}
 */
export function validateListBlocksQuery(query) {
  const allowed = new Set(['limit', 'cursor']);
  assertAllowedFields(query, allowed);

  const errors = [];
  let limit = DEFAULT_BLOCKS_LIMIT;

  if (query.limit !== undefined) {
    if (typeof query.limit !== 'string' || !/^\d+$/u.test(query.limit)) {
      errors.push({
        path: 'limit',
        code: 'INVALID_FIELD',
        message: `limit phải là số nguyên từ 1 đến ${MAX_BLOCKS_LIMIT}.`,
      });
    } else {
      const parsed = Number(query.limit);
      if (
        !Number.isSafeInteger(parsed) ||
        parsed < 1 ||
        parsed > MAX_BLOCKS_LIMIT
      ) {
        errors.push({
          path: 'limit',
          code: 'OUT_OF_RANGE',
          message: `limit phải nằm trong khoảng 1 đến ${MAX_BLOCKS_LIMIT}.`,
        });
      } else {
        limit = parsed;
      }
    }
  }

  /** @type {string | undefined} */
  let cursor;
  if (query.cursor !== undefined) {
    if (
      typeof query.cursor !== 'string' ||
      query.cursor.length === 0 ||
      query.cursor.length > 512
    ) {
      errors.push({
        path: 'cursor',
        code: 'INVALID_FIELD',
        message: 'cursor không hợp lệ.',
      });
    } else {
      cursor = query.cursor;
    }
  }

  if (errors.length > 0) {
    throw createValidationError(errors);
  }

  return cursor !== undefined ? { limit, cursor } : { limit };
}

/**
 * Validates request body for `POST /api/v1/me/blocks`.
 *
 * @param {unknown} body
 * @returns {{ sessionId: string, targetActorKey: string }}
 */
export function validateCreateBlockInput(body) {
  if (!isPlainObject(body)) {
    throw createMalformedRequestError('Dữ liệu yêu cầu chặn không hợp lệ.');
  }

  assertAllowedFields(body, new Set(['sessionId', 'targetActorKey']));

  const errors = [];
  if (body.sessionId === undefined || body.sessionId === null) {
    errors.push({
      path: 'sessionId',
      code: 'REQUIRED_FIELD',
      message: 'sessionId là bắt buộc.',
    });
  } else if (
    typeof body.sessionId !== 'string' ||
    !OBJECT_ID_RE.test(body.sessionId)
  ) {
    errors.push({
      path: 'sessionId',
      code: 'INVALID_FIELD',
      message: 'sessionId phải là ObjectId hợp lệ.',
    });
  }

  const normalizedTarget = normalizeActorKey(body.targetActorKey);
  if (body.targetActorKey === undefined || body.targetActorKey === null) {
    errors.push({
      path: 'targetActorKey',
      code: 'REQUIRED_FIELD',
      message: 'targetActorKey là bắt buộc.',
    });
  } else if (!normalizedTarget) {
    errors.push({
      path: 'targetActorKey',
      code: 'INVALID_FIELD',
      message: 'targetActorKey không đúng định dạng.',
    });
  }

  if (errors.length > 0) {
    throw createValidationError(errors);
  }

  return {
    sessionId: String(body.sessionId).toLowerCase(),
    targetActorKey: /** @type {string} */ (normalizedTarget),
  };
}

/**
 * Validates request body for `POST /api/v1/reports`.
 *
 * @param {unknown} body
 * @returns {{ sessionId: string, targetActorKey: string, reason: string, description?: string }}
 */
export function validateCreateReportInput(body) {
  if (!isPlainObject(body)) {
    throw createMalformedRequestError('Dữ liệu báo cáo không hợp lệ.');
  }

  assertAllowedFields(
    body,
    new Set(['sessionId', 'targetActorKey', 'reason', 'description']),
  );

  const errors = [];

  if (body.sessionId === undefined || body.sessionId === null) {
    errors.push({
      path: 'sessionId',
      code: 'REQUIRED_FIELD',
      message: 'sessionId là bắt buộc.',
    });
  } else if (
    typeof body.sessionId !== 'string' ||
    !OBJECT_ID_RE.test(body.sessionId)
  ) {
    errors.push({
      path: 'sessionId',
      code: 'INVALID_FIELD',
      message: 'sessionId phải là ObjectId hợp lệ.',
    });
  }

  const normalizedTarget = normalizeActorKey(body.targetActorKey);
  if (body.targetActorKey === undefined || body.targetActorKey === null) {
    errors.push({
      path: 'targetActorKey',
      code: 'REQUIRED_FIELD',
      message: 'targetActorKey là bắt buộc.',
    });
  } else if (!normalizedTarget) {
    errors.push({
      path: 'targetActorKey',
      code: 'INVALID_FIELD',
      message: 'targetActorKey không đúng định dạng.',
    });
  }

  let trimmedReason = '';
  if (body.reason === undefined || body.reason === null) {
    errors.push({
      path: 'reason',
      code: 'REQUIRED_FIELD',
      message: 'reason là bắt buộc.',
    });
  } else if (typeof body.reason !== 'string') {
    errors.push({
      path: 'reason',
      code: 'INVALID_FIELD',
      message: 'reason phải là chuỗi văn bản.',
    });
  } else {
    trimmedReason = body.reason.trim();
    if (trimmedReason.length === 0) {
      errors.push({
        path: 'reason',
        code: 'REQUIRED_FIELD',
        message: 'reason không được để trống.',
      });
    } else if (codePointLength(trimmedReason) > MAX_REPORT_REASON_LENGTH) {
      errors.push({
        path: 'reason',
        code: 'MAX_LENGTH_EXCEEDED',
        message: `reason không được vượt quá ${MAX_REPORT_REASON_LENGTH} ký tự.`,
      });
    }
  }

  /** @type {string | undefined} */
  let description;
  if (body.description !== undefined) {
    if (typeof body.description !== 'string') {
      errors.push({
        path: 'description',
        code: 'INVALID_FIELD',
        message: 'description phải là chuỗi văn bản.',
      });
    } else if (
      codePointLength(body.description) > MAX_REPORT_DESCRIPTION_LENGTH
    ) {
      errors.push({
        path: 'description',
        code: 'MAX_LENGTH_EXCEEDED',
        message: `description không được vượt quá ${MAX_REPORT_DESCRIPTION_LENGTH} ký tự.`,
      });
    } else if (body.description.length > 0) {
      description = body.description;
    }
  }

  if (errors.length > 0) {
    throw createValidationError(errors);
  }

  return {
    sessionId: String(body.sessionId).toLowerCase(),
    targetActorKey: /** @type {string} */ (normalizedTarget),
    reason: trimmedReason,
    ...(description !== undefined ? { description } : {}),
  };
}
