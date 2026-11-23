const EMAIL_SYNTAX_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export const MAX_PROFILE_INTERESTS = 3;
export const DEFAULT_AVATAR_KEY = 'chiikawa';

const OPTIONAL_ENUM_KEYS = /** @type {const} */ ([
  'level',
  'nativeLanguageCode',
  'goal',
  'countryCode',
  'ageGroup',
  'gender',
]);

/**
 * @typedef {import('./auth-context.js').SelfUser} SelfUser
 */

/**
 * @typedef {Object} ProfileDraft
 * @property {string} displayName
 * @property {string} avatarKey
 * @property {string} level
 * @property {string} nativeLanguageCode
 * @property {string} goal
 * @property {string[]} interests
 * @property {string} countryCode
 * @property {string} ageGroup
 * @property {string} gender
 */

/**
 * Counts Unicode code points without normalizing the string (07 §2.3).
 * @param {string} value
 * @returns {number}
 */
export function countCodePoints(value) {
  return Array.from(value).length;
}

/**
 * Validates displayName according to 07 §2.3:
 * Trim, 1–100 Unicode code points.
 *
 * @param {string} rawDisplayName
 * @returns {{ value: string, error: string | null }}
 */
export function validateDisplayNameInput(rawDisplayName) {
  const trimmed = rawDisplayName.trim();
  const length = countCodePoints(trimmed);
  if (length < 1 || length > 100) {
    return {
      value: trimmed,
      error: 'Tên hiển thị sau khi cắt khoảng trắng phải từ 1 đến 100 ký tự.',
    };
  }
  return { value: trimmed, error: null };
}

/**
 * Validates newPassword according to 07 §2.3:
 * 8–128 Unicode code points; no trimming; no Unicode normalization.
 *
 * @param {string} rawPassword
 * @returns {string | null}
 */
export function validateNewPasswordInput(rawPassword) {
  if (typeof rawPassword !== 'string' || rawPassword.length === 0) {
    return 'Vui lòng nhập mật khẩu mới (từ 8 đến 128 ký tự).';
  }
  const length = countCodePoints(rawPassword);
  if (length < 8 || length > 128) {
    return 'Mật khẩu phải từ 8 đến 128 ký tự.';
  }
  return null;
}

/**
 * Validates confirmNewPassword without trimming or Unicode normalization.
 *
 * @param {string} newPassword
 * @param {string} confirmNewPassword
 * @returns {string | null}
 */
export function validateConfirmNewPasswordInput(
  newPassword,
  confirmNewPassword,
) {
  if (
    typeof confirmNewPassword !== 'string' ||
    confirmNewPassword.length === 0
  ) {
    return 'Vui lòng nhập lại mật khẩu mới để xác nhận.';
  }
  if (confirmNewPassword !== newPassword) {
    return 'Mật khẩu xác nhận không khớp với mật khẩu mới.';
  }
  return null;
}

/**
 * Validates currentPassword according to 07 §2.3 & §4:
 * Non-empty string, <= 128 Unicode code points; no trimming.
 *
 * @param {string} rawPassword
 * @returns {string | null}
 */
export function validateCurrentPasswordInput(rawPassword) {
  if (typeof rawPassword !== 'string' || rawPassword.length === 0) {
    return 'Vui lòng nhập mật khẩu hiện tại.';
  }
  if (countCodePoints(rawPassword) > 128) {
    return 'Mật khẩu hiện tại không được vượt quá 128 ký tự.';
  }
  return null;
}

/**
 * Validates email according to 07 §2.3:
 * Trimmed, non-empty, valid email syntax.
 *
 * @param {string} rawEmail
 * @returns {{ email: string, error: string | null }}
 */
export function validateEmailInput(rawEmail) {
  const trimmed = rawEmail.trim();
  if (!trimmed) {
    return { email: '', error: 'Vui lòng nhập email.' };
  }
  const atIndex = trimmed.indexOf('@');
  const localPart = atIndex > 0 ? trimmed.slice(0, atIndex) : '';
  if (
    trimmed.length > 254 ||
    localPart.length > 64 ||
    !EMAIL_SYNTAX_REGEX.test(trimmed) ||
    /\p{Cc}/u.test(trimmed)
  ) {
    return { email: trimmed, error: 'Email không đúng định dạng.' };
  }
  return { email: trimmed, error: null };
}

/**
 * Converts a SelfUser DTO into local form draft values.
 * @param {SelfUser | null} user
 * @returns {ProfileDraft}
 */
export function createDraftFromUser(user) {
  const profile = user?.profile ?? {};
  return {
    displayName: user?.displayName ?? '',
    avatarKey: user?.avatarKey || DEFAULT_AVATAR_KEY,
    level: typeof profile.level === 'string' ? profile.level : '',
    nativeLanguageCode:
      typeof profile.nativeLanguageCode === 'string'
        ? profile.nativeLanguageCode
        : '',
    goal: typeof profile.goal === 'string' ? profile.goal : '',
    interests: Array.isArray(profile.interests)
      ? profile.interests.filter((item) => typeof item === 'string')
      : [],
    countryCode:
      typeof profile.countryCode === 'string' ? profile.countryCode : '',
    ageGroup: typeof profile.ageGroup === 'string' ? profile.ageGroup : '',
    gender: typeof profile.gender === 'string' ? profile.gender : '',
  };
}

/**
 * Builds the PATCH /me/profile request payload according to 07 §2.3 & §4:
 * - Always sends `expectedVersion`.
 * - Distinguishes omitted fields (left unset when previously unset, or unchanged)
 *   from optional fields explicitly cleared by the user (sent as `null`).
 * - Never sends fields outside the contract.
 *
 * @param {SelfUser} baseUser
 * @param {ProfileDraft} draft
 * @returns {Record<string, unknown>}
 */
export function buildProfilePatchPayload(baseUser, draft) {
  const trimmedDisplayName = draft.displayName.trim();
  const baseAvatarKey = baseUser.avatarKey || DEFAULT_AVATAR_KEY;

  /** @type {Record<string, unknown>} */
  const payload = {
    expectedVersion: baseUser.version ?? 0,
  };

  if (trimmedDisplayName !== (baseUser.displayName ?? '')) {
    payload.displayName = trimmedDisplayName;
  }

  if (draft.avatarKey && draft.avatarKey !== baseAvatarKey) {
    payload.avatarKey = draft.avatarKey;
  }

  /** @type {Record<string, string | string[] | null>} */
  const profileUpdates = {};
  const baseProfile = baseUser.profile ?? {};

  for (const key of OPTIONAL_ENUM_KEYS) {
    const prevVal =
      typeof baseProfile[key] === 'string' ? baseProfile[key] : '';
    const nextVal = draft[key] ?? '';

    if (nextVal === '') {
      if (prevVal !== '') {
        profileUpdates[key] = null;
      }
    } else if (nextVal !== prevVal) {
      profileUpdates[key] = nextVal;
    }
  }

  const prevInterests = Array.isArray(baseProfile.interests)
    ? baseProfile.interests
    : [];
  const nextInterests = draft.interests;
  const interestsChanged =
    nextInterests.length !== prevInterests.length ||
    nextInterests.some((code, idx) => code !== prevInterests[idx]);

  if (interestsChanged) {
    profileUpdates.interests = [...nextInterests];
  }

  if (Object.keys(profileUpdates).length > 0) {
    payload.profile = profileUpdates;
  }

  // If the user submits without modifying any field, include displayName so the PATCH payload is a valid profile confirmation
  if (
    payload.displayName === undefined &&
    payload.avatarKey === undefined &&
    payload.profile === undefined
  ) {
    payload.displayName = trimmedDisplayName;
  }

  return payload;
}

/**
 * Merges only the fields that the user actually modified (relative to `prevBaseUser`)
 * onto the latest server profile `latestUser`, preserving any server-side updates
 * to fields the user did not touch.
 *
 * @param {SelfUser} prevBaseUser
 * @param {ProfileDraft} currentDraft
 * @param {SelfUser} latestUser
 * @returns {ProfileDraft}
 */
export function mergeDraftChangesOntoUser(
  prevBaseUser,
  currentDraft,
  latestUser,
) {
  const prevDraft = createDraftFromUser(prevBaseUser);
  const latestDraft = createDraftFromUser(latestUser);

  /** @type {ProfileDraft} */
  const merged = {
    ...latestDraft,
    interests: [...latestDraft.interests],
  };

  if (currentDraft.displayName !== prevDraft.displayName) {
    merged.displayName = currentDraft.displayName;
  }

  if (currentDraft.avatarKey !== prevDraft.avatarKey) {
    merged.avatarKey = currentDraft.avatarKey;
  }

  for (const key of OPTIONAL_ENUM_KEYS) {
    if (currentDraft[key] !== prevDraft[key]) {
      merged[key] = currentDraft[key];
    }
  }

  const interestsChanged =
    currentDraft.interests.length !== prevDraft.interests.length ||
    currentDraft.interests.some(
      (code, idx) => code !== prevDraft.interests[idx],
    );

  if (interestsChanged) {
    merged.interests = [...currentDraft.interests];
  }

  return merged;
}
