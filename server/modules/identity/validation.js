import {
  createMalformedRequestError,
  createValidationError,
} from '../../middleware/http-error.js';

const EMAIL_SYNTAX_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

/**
 * Checks whether a value is a plain JSON object (and not null, an array, or a custom class instance).
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
export function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Counts Unicode code points without normalizing the string.
 * @param {string} value
 * @returns {number}
 */
export function countCodePoints(value) {
  return Array.from(value).length;
}

/**
 * Validates and normalizes an email address according to 06 §4.1 and 07 §2.3.
 * Trims and lowercases for emailKey while preserving dots and +tags.
 *
 * @param {unknown} rawEmail
 * @param {string} [fieldPath]
 * @returns {{ email: string, emailKey: string } | { error: { path: string, code: string, message: string } }}
 */
export function validateEmailField(rawEmail, fieldPath = 'email') {
  if (typeof rawEmail !== 'string') {
    return {
      error: {
        path: fieldPath,
        code: 'INVALID_TYPE',
        message: 'Email phải là chuỗi ký tự.',
      },
    };
  }
  const trimmed = rawEmail.trim();
  if (!trimmed) {
    return {
      error: {
        path: fieldPath,
        code: 'REQUIRED',
        message: 'Vui lòng nhập email.',
      },
    };
  }
  const atIndex = trimmed.indexOf('@');
  const localPart = atIndex > 0 ? trimmed.slice(0, atIndex) : '';
  if (
    trimmed.length > 254 ||
    localPart.length > 64 ||
    !EMAIL_SYNTAX_REGEX.test(trimmed) ||
    /\p{Cc}/u.test(trimmed)
  ) {
    return {
      error: {
        path: fieldPath,
        code: 'INVALID_EMAIL',
        message: 'Email không đúng định dạng.',
      },
    };
  }
  return {
    email: trimmed,
    emailKey: trimmed.toLowerCase(),
  };
}

/**
 * Validates a password according to 07 §2.3:
 * 8–128 Unicode code points; no trimming; no Unicode normalization; no character group requirement.
 *
 * @param {unknown} rawPassword
 * @param {string} [fieldPath]
 * @returns {{ password: string } | { error: { path: string, code: string, message: string } }}
 */
export function validatePasswordField(rawPassword, fieldPath = 'password') {
  if (typeof rawPassword !== 'string') {
    return {
      error: {
        path: fieldPath,
        code: 'INVALID_TYPE',
        message: 'Mật khẩu phải là chuỗi ký tự.',
      },
    };
  }
  const length = countCodePoints(rawPassword);
  if (length < 8 || length > 128) {
    return {
      error: {
        path: fieldPath,
        code: 'INVALID_LENGTH',
        message: 'Mật khẩu phải từ 8 đến 128 ký tự.',
      },
    };
  }
  return { password: rawPassword };
}

/**
 * Validates a displayName according to 07 §2.3:
 * Trim, 1–100 Unicode code points.
 *
 * @param {unknown} rawDisplayName
 * @param {string} [fieldPath]
 * @returns {{ displayName: string } | { error: { path: string, code: string, message: string } }}
 */
export function validateDisplayNameField(
  rawDisplayName,
  fieldPath = 'displayName',
) {
  if (typeof rawDisplayName !== 'string') {
    return {
      error: {
        path: fieldPath,
        code: 'INVALID_TYPE',
        message: 'Tên hiển thị phải là chuỗi ký tự.',
      },
    };
  }
  const trimmed = rawDisplayName.trim();
  const length = countCodePoints(trimmed);
  if (length < 1 || length > 100) {
    return {
      error: {
        path: fieldPath,
        code: 'INVALID_LENGTH',
        message:
          'Tên hiển thị sau khi cắt khoảng trắng phải từ 1 đến 100 ký tự.',
      },
    };
  }
  return { displayName: trimmed };
}

/**
 * Validates POST /auth/register request payload.
 * Rejects unknown fields (such as `role`, `status`, `authVersion`) and non-plain objects.
 *
 * @param {unknown} body
 * @returns {{ email: string, emailKey: string, password: string, displayName: string }}
 */
export function validateRegisterInput(body) {
  if (!isPlainObject(body)) {
    throw createMalformedRequestError();
  }

  const allowedKeys = new Set(['email', 'password', 'displayName']);
  /** @type {Array<{ path: string, code: string, message: string }>} */
  const fields = [];

  for (const key of Object.keys(body)) {
    if (!allowedKeys.has(key)) {
      fields.push({
        path: key,
        code: 'UNKNOWN_FIELD',
        message: `Trường "${key}" không được phép trong yêu cầu này.`,
      });
    }
  }

  const emailRes = validateEmailField(body.email, 'email');
  if ('error' in emailRes) {
    fields.push(emailRes.error);
  }

  const passwordRes = validatePasswordField(body.password, 'password');
  if ('error' in passwordRes) {
    fields.push(passwordRes.error);
  }

  const displayNameRes = validateDisplayNameField(
    body.displayName,
    'displayName',
  );
  if ('error' in displayNameRes) {
    fields.push(displayNameRes.error);
  }

  if (
    fields.length > 0 ||
    'error' in emailRes ||
    'error' in passwordRes ||
    'error' in displayNameRes
  ) {
    throw createValidationError(fields);
  }

  return {
    email: emailRes.email,
    emailKey: emailRes.emailKey,
    password: passwordRes.password,
    displayName: displayNameRes.displayName,
  };
}

/**
 * Validates POST /auth/login request payload.
 *
 * @param {unknown} body
 * @returns {{ email: string, emailKey: string, password: string }}
 */
export function validateLoginInput(body) {
  if (!isPlainObject(body)) {
    throw createMalformedRequestError();
  }

  const allowedKeys = new Set(['email', 'password']);
  /** @type {Array<{ path: string, code: string, message: string }>} */
  const fields = [];

  for (const key of Object.keys(body)) {
    if (!allowedKeys.has(key)) {
      fields.push({
        path: key,
        code: 'UNKNOWN_FIELD',
        message: `Trường "${key}" không được phép trong yêu cầu này.`,
      });
    }
  }

  const emailRes = validateEmailField(body.email, 'email');
  if ('error' in emailRes) {
    fields.push(emailRes.error);
  }

  if (typeof body.password !== 'string' || body.password.length === 0) {
    fields.push({
      path: 'password',
      code: typeof body.password === 'string' ? 'REQUIRED' : 'INVALID_TYPE',
      message: 'Vui lòng nhập mật khẩu hợp lệ.',
    });
  } else if (countCodePoints(body.password) > 128) {
    fields.push({
      path: 'password',
      code: 'INVALID_LENGTH',
      message: 'Mật khẩu không được vượt quá 128 ký tự.',
    });
  }

  if (fields.length > 0 || 'error' in emailRes) {
    throw createValidationError(fields);
  }

  return {
    email: emailRes.email,
    emailKey: emailRes.emailKey,
    password: /** @type {string} */ (body.password),
  };
}

/**
 * Validates an empty body object (`{}`) for endpoints like POST /auth/logout.
 *
 * @param {unknown} body
 */
export function validateEmptyObjectInput(body) {
  if (body === undefined) {
    return;
  }
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
}
