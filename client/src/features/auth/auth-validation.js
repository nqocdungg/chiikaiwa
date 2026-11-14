const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/;

const AUTH_ROUTE_PATHS = new Set([
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
]);

/**
 * @param {unknown} value
 * @returns {number}
 */
export function countCodePoints(value) {
  return Array.from(String(value ?? '')).length;
}

/**
 * @param {unknown} value
 * @returns {{ valid: boolean, normalized: string, error: string | null }}
 */
export function validateEmailInput(value) {
  if (typeof value !== 'string') {
    return {
      valid: false,
      normalized: '',
      error: 'Vui lòng nhập địa chỉ email.',
    };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return {
      valid: false,
      normalized: '',
      error: 'Vui lòng nhập địa chỉ email.',
    };
  }
  if (
    trimmed.length > 254 ||
    CONTROL_CHARS_RE.test(trimmed) ||
    /\s/.test(trimmed) ||
    !EMAIL_RE.test(trimmed)
  ) {
    return {
      valid: false,
      normalized: trimmed,
      error: 'Địa chỉ email không đúng định dạng.',
    };
  }
  const [localPart] = trimmed.split('@');
  if (!localPart || localPart.length > 64) {
    return {
      valid: false,
      normalized: trimmed,
      error: 'Địa chỉ email không đúng định dạng.',
    };
  }
  return { valid: true, normalized: trimmed, error: null };
}

/**
 * @param {unknown} value
 * @returns {{ valid: boolean, normalized: string, error: string | null }}
 */
export function validateDisplayNameInput(value) {
  if (typeof value !== 'string') {
    return {
      valid: false,
      normalized: '',
      error: 'Vui lòng nhập tên hiển thị.',
    };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return {
      valid: false,
      normalized: '',
      error: 'Vui lòng nhập tên hiển thị.',
    };
  }
  if (CONTROL_CHARS_RE.test(trimmed)) {
    return {
      valid: false,
      normalized: trimmed,
      error: 'Tên hiển thị chứa ký tự không hợp lệ.',
    };
  }
  const length = countCodePoints(trimmed);
  if (length < 1 || length > 100) {
    return {
      valid: false,
      normalized: trimmed,
      error: 'Tên hiển thị phải có từ 1 đến 100 ký tự.',
    };
  }
  return { valid: true, normalized: trimmed, error: null };
}

/**
 * @param {unknown} value
 * @returns {{ valid: boolean, error: string | null }}
 */
export function validateRegisterPasswordInput(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return { valid: false, error: 'Vui lòng nhập mật khẩu.' };
  }
  const length = countCodePoints(value);
  if (length < 8 || length > 128) {
    return { valid: false, error: 'Mật khẩu phải có từ 8 đến 128 ký tự.' };
  }
  return { valid: true, error: null };
}

/**
 * @param {unknown} value
 * @returns {{ valid: boolean, error: string | null }}
 */
export function validateLoginPasswordInput(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return { valid: false, error: 'Vui lòng nhập mật khẩu.' };
  }
  const length = countCodePoints(value);
  if (length > 128) {
    return { valid: false, error: 'Mật khẩu không được vượt quá 128 ký tự.' };
  }
  return { valid: true, error: null };
}

/**
 * @param {{ email?: unknown, password?: unknown }} input
 * @returns {{ valid: boolean, payload: { email: string, password: string }, fieldErrors: Record<string, string> }}
 */
export function validateLoginForm({ email, password }) {
  const fieldErrors = /** @type {Record<string, string>} */ ({});
  const emailCheck = validateEmailInput(email);
  if (!emailCheck.valid && emailCheck.error) {
    fieldErrors.email = emailCheck.error;
  }

  const passwordCheck = validateLoginPasswordInput(password);
  if (!passwordCheck.valid && passwordCheck.error) {
    fieldErrors.password = passwordCheck.error;
  }

  return {
    valid: Object.keys(fieldErrors).length === 0,
    payload: {
      email: emailCheck.normalized,
      password: typeof password === 'string' ? password : '',
    },
    fieldErrors,
  };
}

/**
 * @param {{
 *   displayName?: unknown,
 *   email?: unknown,
 *   password?: unknown,
 *   confirmPassword?: unknown,
 *   requireConfirmPassword?: boolean
 * }} input
 * @returns {{
 *   valid: boolean,
 *   payload: { email: string, password: string, displayName: string },
 *   fieldErrors: Record<string, string>
 * }}
 */
export function validateRegisterForm({
  displayName,
  email,
  password,
  confirmPassword,
  requireConfirmPassword = false,
}) {
  const fieldErrors = /** @type {Record<string, string>} */ ({});

  const displayNameCheck = validateDisplayNameInput(displayName);
  if (!displayNameCheck.valid && displayNameCheck.error) {
    fieldErrors.displayName = displayNameCheck.error;
  }

  const emailCheck = validateEmailInput(email);
  if (!emailCheck.valid && emailCheck.error) {
    fieldErrors.email = emailCheck.error;
  }

  const passwordCheck = validateRegisterPasswordInput(password);
  if (!passwordCheck.valid && passwordCheck.error) {
    fieldErrors.password = passwordCheck.error;
  }

  if (confirmPassword !== undefined) {
    const hasConfirmValue =
      typeof confirmPassword === 'string' && confirmPassword.length > 0;
    if (hasConfirmValue && confirmPassword !== password) {
      fieldErrors.confirmPassword = 'Mật khẩu xác nhận không khớp.';
    } else if (
      !hasConfirmValue &&
      (requireConfirmPassword || !passwordCheck.valid)
    ) {
      fieldErrors.confirmPassword = 'Vui lòng xác nhận lại mật khẩu.';
    }
  }

  return {
    valid: Object.keys(fieldErrors).length === 0,
    payload: {
      email: emailCheck.normalized,
      password: typeof password === 'string' ? password : '',
      displayName: displayNameCheck.normalized,
    },
    fieldErrors,
  };
}

/**
 * @param {unknown} rawFrom
 * @returns {string}
 */
function extractRawPath(rawFrom) {
  if (!rawFrom) return '';
  if (typeof rawFrom === 'string') return rawFrom;
  if (typeof rawFrom === 'object') {
    const loc =
      /** @type {{ pathname?: unknown, search?: unknown, hash?: unknown }} */ (
        rawFrom
      );
    if (typeof loc.pathname === 'string') {
      const search = typeof loc.search === 'string' ? loc.search : '';
      const hash = typeof loc.hash === 'string' ? loc.hash : '';
      return `${loc.pathname}${search}${hash}`;
    }
  }
  return '';
}

/**
 * @param {unknown} candidate
 * @returns {boolean}
 */
export function isSafeInternalRedirectPath(candidate) {
  if (typeof candidate !== 'string' || candidate.length === 0) {
    return false;
  }
  if (!candidate.startsWith('/') || candidate.startsWith('//')) {
    return false;
  }
  if (
    CONTROL_CHARS_RE.test(candidate) ||
    candidate.includes('\\') ||
    candidate.includes('://')
  ) {
    return false;
  }
  const [pathname] = candidate.split(/[?#]/, 1);
  if (!pathname || AUTH_ROUTE_PATHS.has(pathname)) {
    return false;
  }
  return true;
}

/**
 * @param {unknown} rawFrom
 * @param {string} [role]
 * @returns {string}
 */
export function resolvePostLoginRedirect(rawFrom, role = 'learner') {
  const defaultTarget = role === 'admin' ? '/admin' : '/home';
  const candidate = extractRawPath(rawFrom);

  if (!isSafeInternalRedirectPath(candidate)) {
    return defaultTarget;
  }

  const [pathname] = candidate.split(/[?#]/, 1);
  const isAdminPath = pathname === '/admin' || pathname.startsWith('/admin/');

  if (role === 'admin') {
    return isAdminPath ? candidate : '/admin';
  }

  if (isAdminPath || pathname === '/') {
    return '/home';
  }

  return candidate;
}

/**
 * @param {unknown} error
 * @param {'login' | 'register' | 'logout'} [context]
 * @returns {{ bannerMessage: string, fieldErrors: Record<string, string> }}
 */
export function mapAuthApiError(error, context = 'login') {
  const errObj =
    /** @type {{ code?: string, status?: number, message?: string, retryAfter?: number, details?: Array<{ field?: string, code?: string, message?: string }> } | null} */ (
      error && typeof error === 'object' ? error : null
    );
  const fieldErrors = /** @type {Record<string, string>} */ ({});

  if (Array.isArray(errObj?.details)) {
    for (const item of errObj.details) {
      if (item && typeof item.field === 'string' && !fieldErrors[item.field]) {
        if (item.field === 'email') {
          fieldErrors.email = 'Địa chỉ email không đúng định dạng.';
        } else if (item.field === 'displayName') {
          fieldErrors.displayName = 'Tên hiển thị phải có từ 1 đến 100 ký tự.';
        } else if (item.field === 'password') {
          fieldErrors.password =
            context === 'register'
              ? 'Mật khẩu phải có từ 8 đến 128 ký tự.'
              : 'Vui lòng kiểm tra lại mật khẩu.';
        } else {
          fieldErrors[item.field] = item.message || 'Giá trị không hợp lệ.';
        }
      }
    }
  }

  const code = errObj?.code;
  const status = errObj?.status;

  if (
    code === 'INVALID_CREDENTIALS' ||
    (context === 'login' && status === 401)
  ) {
    return {
      bannerMessage:
        'Email hoặc mật khẩu chưa đúng. Vui lòng kiểm tra và thử lại.',
      fieldErrors,
    };
  }

  if (code === 'ACCOUNT_LOCKED') {
    return {
      bannerMessage:
        'Tài khoản của bạn hiện đã bị khóa. Vui lòng liên hệ quản trị viên để được hỗ trợ.',
      fieldErrors,
    };
  }

  if (code === 'EMAIL_EXISTS' || (context === 'register' && status === 409)) {
    fieldErrors.email =
      fieldErrors.email ||
      'Email này đã được đăng ký. Vui lòng đăng nhập hoặc dùng email khác.';
    return {
      bannerMessage: 'Email này đã được sử dụng cho một tài khoản khác.',
      fieldErrors,
    };
  }

  if (code === 'VALIDATION_FAILED' || status === 422) {
    return {
      bannerMessage: 'Vui lòng kiểm tra lại thông tin đã nhập.',
      fieldErrors,
    };
  }

  if (code === 'CSRF_INVALID') {
    return {
      bannerMessage:
        'Phiên bảo mật (CSRF) đã hết hạn hoặc không hợp lệ. Vui lòng tải lại trang và thử lại.',
      fieldErrors,
    };
  }

  if (code === 'RATE_LIMITED' || status === 429) {
    const retryHint =
      typeof errObj?.retryAfter === 'number' && errObj.retryAfter > 0
        ? ` sau khoảng ${errObj.retryAfter} giây`
        : ' sau ít phút';
    return {
      bannerMessage: `Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại${retryHint}.`,
      fieldErrors,
    };
  }

  if (code === 'NETWORK_ERROR' || code === 'TIMEOUT') {
    return {
      bannerMessage:
        'Không thể kết nối tới máy chủ. Vui lòng kiểm tra kết nối mạng và thử lại.',
      fieldErrors,
    };
  }

  if (code === 'SERVICE_UNAVAILABLE' || status === 503) {
    return {
      bannerMessage:
        'Hệ thống đang tạm thời gián đoạn. Vui lòng thử lại sau ít phút.',
      fieldErrors,
    };
  }

  return {
    bannerMessage:
      errObj?.message || 'Đã xảy ra lỗi khi xử lý yêu cầu. Vui lòng thử lại.',
    fieldErrors,
  };
}
