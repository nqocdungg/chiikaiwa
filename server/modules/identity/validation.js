import {
  createMalformedRequestError,
  createValidationError,
} from '../../middleware/http-error.js';
import {
  AGE_GROUP_CODES,
  AVATAR_CODES,
  COUNTRY_CODES,
  GENDER_CODES,
  GOAL_CODES,
  INTEREST_CODES,
  LANGUAGE_CODES,
  LEVEL_CODES,
  MAX_PROFILE_INTERESTS,
} from './catalogs.js';

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

/** @type {Array<{ key: string, codes: Set<string> }>} */
const PROFILE_OPTIONAL_ENUM_FIELDS = [
  { key: 'level', codes: LEVEL_CODES },
  { key: 'nativeLanguageCode', codes: LANGUAGE_CODES },
  { key: 'goal', codes: GOAL_CODES },
  { key: 'countryCode', codes: COUNTRY_CODES },
  { key: 'ageGroup', codes: AGE_GROUP_CODES },
  { key: 'gender', codes: GENDER_CODES },
];

const ALLOWED_PROFILE_TOP_KEYS = new Set([
  'expectedVersion',
  'displayName',
  'avatarKey',
  'profile',
]);

const ALLOWED_PROFILE_NESTED_KEYS = new Set([
  'level',
  'nativeLanguageCode',
  'goal',
  'interests',
  'countryCode',
  'ageGroup',
  'gender',
]);

/**
 * Validates PATCH /me/profile request payload (06 §2.2, 06 §4.1, 07 §2.3, 07 §4).
 * - Requires `expectedVersion` (non-negative integer).
 * - Rejects unknown fields (`role`, `status`, `authVersion`, `id`, `userId`, etc.) at root and inside `profile`.
 * - Rejects `null` on required fields (`expectedVersion`, `displayName`, `avatarKey`, `profile`, `profile.interests`).
 * - Allows `null` on optional nested `profile` fields (`level`, `nativeLanguageCode`, `goal`, `countryCode`, `ageGroup`, `gender`) to clear them.
 * - Preserves omitted fields by only recording explicitly supplied fields.
 *
 * @param {unknown} body
 * @returns {{
 *   expectedVersion: number,
 *   displayName?: string,
 *   avatarKey?: string,
 *   profileUpdates: Record<string, string | string[] | null>
 * }}
 */
export function validateProfileUpdateInput(body) {
  if (!isPlainObject(body)) {
    throw createMalformedRequestError();
  }

  /** @type {Array<{ path: string, code: string, message: string }>} */
  const fields = [];

  for (const key of Object.keys(body)) {
    if (!ALLOWED_PROFILE_TOP_KEYS.has(key)) {
      fields.push({
        path: key,
        code: 'UNKNOWN_FIELD',
        message: `Trường "${key}" không được phép trong yêu cầu này.`,
      });
    }
  }

  const rawExpectedVersion = body.expectedVersion;
  /** @type {number | undefined} */
  let expectedVersion;
  if (
    !Object.hasOwn(body, 'expectedVersion') ||
    rawExpectedVersion === undefined
  ) {
    fields.push({
      path: 'expectedVersion',
      code: 'REQUIRED',
      message:
        'Vui lòng cung cấp phiên bản dữ liệu hiện tại (expectedVersion).',
    });
  } else if (
    typeof rawExpectedVersion !== 'number' ||
    !Number.isInteger(rawExpectedVersion) ||
    rawExpectedVersion < 0
  ) {
    fields.push({
      path: 'expectedVersion',
      code: 'INVALID_VERSION',
      message: 'expectedVersion phải là số nguyên không âm.',
    });
  } else {
    expectedVersion = rawExpectedVersion;
  }

  /** @type {string | undefined} */
  let displayName;
  if (Object.hasOwn(body, 'displayName')) {
    const displayNameRes = validateDisplayNameField(
      body.displayName,
      'displayName',
    );
    if ('error' in displayNameRes) {
      fields.push(displayNameRes.error);
    } else {
      displayName = displayNameRes.displayName;
    }
  }

  /** @type {string | undefined} */
  let avatarKey;
  if (Object.hasOwn(body, 'avatarKey')) {
    const rawAvatarKey = body.avatarKey;
    if (typeof rawAvatarKey !== 'string') {
      fields.push({
        path: 'avatarKey',
        code: 'INVALID_TYPE',
        message: 'Mã ảnh đại diện phải là chuỗi ký tự.',
      });
    } else if (!AVATAR_CODES.has(rawAvatarKey)) {
      fields.push({
        path: 'avatarKey',
        code: 'INVALID_ENUM',
        message: 'Ảnh đại diện không nằm trong danh mục cho phép.',
      });
    } else {
      avatarKey = rawAvatarKey;
    }
  }

  /** @type {Record<string, string | string[] | null>} */
  const profileUpdates = Object.create(null);

  if (Object.hasOwn(body, 'profile')) {
    const rawProfile = body.profile;
    if (!isPlainObject(rawProfile)) {
      fields.push({
        path: 'profile',
        code: 'INVALID_TYPE',
        message: 'Thông tin hồ sơ phải là một đối tượng hợp lệ.',
      });
    } else {
      for (const key of Object.keys(rawProfile)) {
        if (!ALLOWED_PROFILE_NESTED_KEYS.has(key)) {
          fields.push({
            path: `profile.${key}`,
            code: 'UNKNOWN_FIELD',
            message: `Trường "profile.${key}" không được phép trong yêu cầu này.`,
          });
        }
      }

      for (const { key, codes } of PROFILE_OPTIONAL_ENUM_FIELDS) {
        if (!Object.hasOwn(rawProfile, key)) {
          continue;
        }
        const val = rawProfile[key];
        if (val === null) {
          profileUpdates[key] = null;
        } else if (typeof val !== 'string') {
          fields.push({
            path: `profile.${key}`,
            code: 'INVALID_TYPE',
            message: `Trường "profile.${key}" phải là chuỗi ký tự hoặc null.`,
          });
        } else if (!codes.has(val)) {
          fields.push({
            path: `profile.${key}`,
            code: 'INVALID_ENUM',
            message: `Giá trị của "profile.${key}" không nằm trong danh mục hợp lệ.`,
          });
        } else {
          profileUpdates[key] = val;
        }
      }

      if (Object.hasOwn(rawProfile, 'interests')) {
        const rawInterests = rawProfile.interests;
        if (!Array.isArray(rawInterests)) {
          fields.push({
            path: 'profile.interests',
            code: 'INVALID_TYPE',
            message: 'Danh sách sở thích phải là một mảng.',
          });
        } else {
          let interestsValid = true;
          if (rawInterests.length > MAX_PROFILE_INTERESTS) {
            interestsValid = false;
            fields.push({
              path: 'profile.interests',
              code: 'MAX_ITEMS_EXCEEDED',
              message: `Chỉ được chọn tối đa ${MAX_PROFILE_INTERESTS} sở thích.`,
            });
          }

          let hasInvalidType = false;
          let hasInvalidEnum = false;
          let hasDuplicate = false;
          /** @type {Set<string>} */
          const seenInterests = new Set();

          for (const item of rawInterests) {
            if (typeof item !== 'string') {
              hasInvalidType = true;
            } else if (!INTEREST_CODES.has(item)) {
              hasInvalidEnum = true;
            } else if (seenInterests.has(item)) {
              hasDuplicate = true;
            } else {
              seenInterests.add(item);
            }
          }

          if (hasInvalidType) {
            interestsValid = false;
            fields.push({
              path: 'profile.interests',
              code: 'INVALID_TYPE',
              message: 'Mỗi sở thích phải là chuỗi mã danh mục.',
            });
          }
          if (hasInvalidEnum) {
            interestsValid = false;
            fields.push({
              path: 'profile.interests',
              code: 'INVALID_ENUM',
              message: 'Sở thích không nằm trong danh mục hợp lệ.',
            });
          }
          if (hasDuplicate) {
            interestsValid = false;
            fields.push({
              path: 'profile.interests',
              code: 'DUPLICATE_ITEM',
              message: 'Danh sách sở thích không được chứa mục trùng lặp.',
            });
          }

          if (interestsValid) {
            profileUpdates.interests = /** @type {string[]} */ ([
              ...rawInterests,
            ]);
          }
        }
      }
    }
  }

  if (fields.length > 0 || expectedVersion === undefined) {
    throw createValidationError(fields);
  }

  /**
   * @type {{
   *   expectedVersion: number,
   *   displayName?: string,
   *   avatarKey?: string,
   *   profileUpdates: Record<string, string | string[] | null>
   * }}
   */
  const result = {
    expectedVersion,
    profileUpdates,
  };
  if (displayName !== undefined) {
    result.displayName = displayName;
  }
  if (avatarKey !== undefined) {
    result.avatarKey = avatarKey;
  }
  return result;
}
