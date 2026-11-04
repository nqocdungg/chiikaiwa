/**
 * @typedef {Object} FieldErrorItem
 * @property {string} path
 * @property {string} code
 * @property {string} message
 */

export class AppError extends Error {
  /**
   * @param {Object} options
   * @param {number} options.status
   * @param {string} options.code
   * @param {string} options.message
   * @param {Record<string, unknown>} [options.details]
   * @param {Record<string, string>} [options.headers]
   */
  constructor({ status, code, message, details, headers }) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.headers = headers;
  }
}

/**
 * @param {FieldErrorItem[]} fields
 * @param {string} [message]
 */
export function createValidationError(
  fields,
  message = 'Dữ liệu đầu vào không hợp lệ.',
) {
  return new AppError({
    status: 422,
    code: 'VALIDATION_FAILED',
    message,
    details: { fields },
  });
}

/**
 * @param {string} [message]
 */
export function createMalformedRequestError(message = 'Yêu cầu không hợp lệ.') {
  return new AppError({
    status: 400,
    code: 'MALFORMED_REQUEST',
    message,
  });
}
