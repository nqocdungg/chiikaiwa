import { AppError } from './http-error.js';

/** @type {import('express').ErrorRequestHandler} */
export function errorHandler(error, _request, response, _next) {
  if (error instanceof AppError) {
    if (error.headers) {
      for (const [headerName, headerValue] of Object.entries(error.headers)) {
        response.set(headerName, headerValue);
      }
    }
    /** @type {{ code: string, message: string, details?: Record<string, unknown> }} */
    const errorPayload = {
      code: error.code,
      message: error.message,
    };
    if (error.details && Object.keys(error.details).length > 0) {
      errorPayload.details = error.details;
    }
    return response
      .status(error.status)
      .json({ error: errorPayload, meta: response.locals.meta });
  }

  const malformed = error?.type === 'entity.parse.failed';
  const tooLarge = error?.type === 'entity.too.large';
  const keyPattern = error?.keyPattern;
  const emailExists =
    error?.code === 11000 &&
    keyPattern?.emailKey === 1 &&
    Object.keys(keyPattern).length === 1;
  const status = tooLarge ? 413 : malformed ? 400 : emailExists ? 409 : 500;
  const code = tooLarge
    ? 'PAYLOAD_TOO_LARGE'
    : malformed
      ? 'MALFORMED_REQUEST'
      : emailExists
        ? 'EMAIL_EXISTS'
        : 'INTERNAL_ERROR';
  const message = tooLarge
    ? 'Nội dung gửi lên quá lớn.'
    : malformed
      ? 'Yêu cầu không hợp lệ.'
      : emailExists
        ? 'Email này đã được đăng ký.'
        : 'Đã có lỗi xảy ra. Vui lòng thử lại.';
  return response
    .status(status)
    .json({ error: { code, message }, meta: response.locals.meta });
}
