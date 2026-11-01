/** @type {import('express').ErrorRequestHandler} */
export function errorHandler(error, _request, response, _next) {
  const malformed = error?.type === 'entity.parse.failed';
  const tooLarge = error?.type === 'entity.too.large';
  const status = tooLarge ? 413 : malformed ? 400 : 500;
  const code = tooLarge
    ? 'PAYLOAD_TOO_LARGE'
    : malformed
      ? 'MALFORMED_REQUEST'
      : 'INTERNAL_ERROR';
  const message = tooLarge
    ? 'Nội dung gửi lên quá lớn.'
    : malformed
      ? 'Yêu cầu không hợp lệ.'
      : 'Đã có lỗi xảy ra. Vui lòng thử lại.';
  return response
    .status(status)
    .json({ error: { code, message }, meta: response.locals.meta });
}
