/**
 * @typedef {Object} FieldError
 * @property {string} path
 * @property {string} code
 * @property {string} message
 */

/**
 * @typedef {Object} ErrorMeta
 * @property {string} [requestId]
 * @property {string} [serverTime]
 */

/**
 * Custom error class representing API error envelopes according to Chiikaiwa API Specification.
 */
export class ApiError extends Error {
  /**
   * @param {Object} params
   * @param {number} params.status
   * @param {string} params.code
   * @param {string} params.message
   * @param {Record<string, unknown>} [params.details]
   * @param {ErrorMeta} [params.meta]
   * @param {number | null} [params.retryAfter]
   * @param {string | null} [params.idempotencyKey]
   */
  constructor({
    status,
    code,
    message,
    details = {},
    meta = {},
    retryAfter = null,
    idempotencyKey = null,
  }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.meta = meta;
    this.retryAfter = retryAfter;
    this.idempotencyKey = idempotencyKey;
  }

  /** @returns {boolean} */
  isValidationError() {
    return this.code === 'VALIDATION_FAILED' || this.status === 422;
  }

  /** @returns {boolean} */
  isVersionConflict() {
    return this.code === 'VERSION_CONFLICT';
  }

  /** @returns {boolean} */
  isAuthRequired() {
    return this.code === 'AUTH_REQUIRED' || this.code === 'SESSION_EXPIRED';
  }

  /** @returns {boolean} */
  isGuestExpired() {
    return this.code === 'GUEST_EXPIRED' || this.status === 410;
  }

  /** @returns {boolean} */
  isForbidden() {
    return (
      this.status === 403 ||
      this.code === 'FORBIDDEN' ||
      this.code === 'CSRF_INVALID' ||
      this.code === 'ACCOUNT_LOCKED' ||
      this.code === 'CONTROL_REQUIRED'
    );
  }

  /** @returns {boolean} */
  isRateLimited() {
    return this.code === 'RATE_LIMITED' || this.status === 429;
  }

  /**
   * Determines whether the request can be safely retried with the same Idempotency-Key.
   * Never true for 409 conflicts, 403 forbidden, or 422 validation errors.
   * @returns {boolean}
   */
  isRetryable() {
    return (
      this.code === 'TIMEOUT' ||
      this.code === 'NETWORK_ERROR' ||
      this.code === 'SERVICE_UNAVAILABLE' ||
      this.status === 503
    );
  }

  /**
   * Extracts field validation errors from error.details.fields into a path-to-message map.
   * @returns {Record<string, string>}
   */
  getFieldErrors() {
    /** @type {Record<string, string>} */
    const map = {};
    const fields = /** @type {FieldError[] | undefined} */ (
      this.details?.fields
    );
    if (Array.isArray(fields)) {
      for (const field of fields) {
        if (field && typeof field.path === 'string' && field.message) {
          map[field.path] = field.message;
        }
      }
    }
    return map;
  }
}
