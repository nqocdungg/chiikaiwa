export const DEFAULT_AVATAR_KEY = 'chiikawa';

/**
 * Projects a user document's profile fields into a clean API object, omitting unset optional fields.
 *
 * @param {Record<string, unknown> | undefined | null} rawProfile
 * @returns {Record<string, unknown>}
 */
export function toProfileDto(rawProfile) {
  /** @type {Record<string, unknown>} */
  const profile = {
    interests: Array.isArray(rawProfile?.interests)
      ? [...rawProfile.interests]
      : [],
  };
  const optionalKeys = [
    'level',
    'nativeLanguageCode',
    'goal',
    'countryCode',
    'ageGroup',
    'gender',
  ];
  for (const key of optionalKeys) {
    const val = rawProfile?.[key];
    if (typeof val === 'string' && val.length > 0) {
      profile[key] = val;
    }
  }
  return profile;
}

/**
 * Projects a MongoDB user document into the `Self` API DTO (07 §3).
 * Never exposes passwordHash, emailKey, authVersion, or internal audit fields.
 *
 * @param {Record<string, any>} userDoc
 * @returns {{
 *   id: string,
 *   email: string,
 *   displayName: string,
 *   avatarKey: string,
 *   role: 'learner' | 'admin',
 *   profile: Record<string, unknown>,
 *   version: number
 * }}
 */
export function toSelfDto(userDoc) {
  const id =
    typeof userDoc._id?.toHexString === 'function'
      ? userDoc._id.toHexString()
      : String(userDoc._id ?? userDoc.id ?? '');

  return {
    id,
    email: String(userDoc.email ?? ''),
    displayName: String(userDoc.displayName ?? ''),
    avatarKey: String(userDoc.avatarKey ?? DEFAULT_AVATAR_KEY),
    role: userDoc.role === 'admin' ? 'admin' : 'learner',
    profile: toProfileDto(userDoc.profile),
    version: typeof userDoc.version === 'number' ? userDoc.version : 0,
  };
}

/**
 * Projects a MongoDB user document into the `Partner` API DTO (07 §3).
 * Strictly omits email and private account metadata.
 *
 * @param {Record<string, any>} userDoc
 * @returns {{
 *   actorKey: string,
 *   displayName: string,
 *   avatarKey?: string,
 *   profile: Record<string, unknown>
 * }}
 */
export function toPartnerDto(userDoc) {
  const id =
    typeof userDoc._id?.toHexString === 'function'
      ? userDoc._id.toHexString()
      : String(userDoc._id ?? userDoc.id ?? '');

  /** @type {{ actorKey: string, displayName: string, avatarKey?: string, profile: Record<string, unknown> }} */
  const dto = {
    actorKey: `user:${id}`,
    displayName: String(userDoc.displayName ?? ''),
    profile: toProfileDto(userDoc.profile),
  };
  if (typeof userDoc.avatarKey === 'string' && userDoc.avatarKey.length > 0) {
    dto.avatarKey = userDoc.avatarKey;
  }
  return dto;
}
