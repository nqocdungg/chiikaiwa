import { AppError } from '../../middleware/http-error.js';

/** @param {string} [message] */
export function sessionEnded(message = 'Phiên đã kết thúc.') {
  return new AppError({ status: 409, code: 'SESSION_ENDED', message });
}

/** @param {string} [message] */
export function sessionVersionConflict(
  message = 'Quyền phiên đã thay đổi. Vui lòng thử lại.',
) {
  return new AppError({ status: 409, code: 'VERSION_CONFLICT', message });
}

/** @param {string} [message] */
export function sessionExpired(message = 'Phiên đăng nhập đã hết hạn.') {
  return new AppError({ status: 401, code: 'SESSION_EXPIRED', message });
}

/** @param {string} [message] */
export function mediaUnavailable(
  message = 'Chưa thể cấp quyền media. Vui lòng thử lại.',
) {
  return new AppError({ status: 503, code: 'SERVICE_UNAVAILABLE', message });
}
