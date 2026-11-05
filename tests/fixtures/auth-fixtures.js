import mongoose from 'mongoose';
import { signJwt } from '../../server/modules/identity/crypto.js';

const { ObjectId } = mongoose.Types;

export const DEFAULT_JWT_SECRET =
  'chiikaiwa-dev-only-jwt-secret-key-at-least-32-bytes';
export const DEFAULT_JWT_ISSUER = 'chiikaiwa';
export const DEFAULT_JWT_AUDIENCE = 'chiikaiwa-web';

// Deterministic ObjectIds for reproducible testing across modules
export const FIXTURE_USER_IDS = {
  learnerA: '507f1f77bcf86cd799439011',
  learnerB: '507f1f77bcf86cd799439022',
  admin: '507f1f77bcf86cd799439033',
  locked: '507f1f77bcf86cd799439044',
};

export const FIXTURE_SESSION_IDS = {
  learnerA: '607f1f77bcf86cd799439011',
  learnerB: '607f1f77bcf86cd799439022',
  admin: '607f1f77bcf86cd799439033',
  expired: '607f1f77bcf86cd799439099',
};

export const FIXTURE_GUEST_IDS = {
  active: '707f1f77bcf86cd799439011',
  expired: '707f1f77bcf86cd799439099',
};

export const FIXTURE_INVITATION_ID = '807f1f77bcf86cd799439011';
export const FIXTURE_PRACTICE_SESSION_ID = '907f1f77bcf86cd799439011';

/**
 * Baseline user fixture documents for database seeding.
 */
export const USER_FIXTURES = {
  learnerA: {
    _id: new ObjectId(FIXTURE_USER_IDS.learnerA),
    email: 'learner.a@example.com',
    emailKey: 'learner.a@example.com',
    passwordHash:
      'scrypt$16384$8$1$0123456789abcdef0123456789abcdef$a45371c6628c68ff0f81d18721c54b61f868ad93f1c7d23d854ec0915f79a9244093c12f0e3fc93be3d7ea3489ae21b2bb48f07ea519f0951664ab6268962071',
    role: /** @type {const} */ ('learner'),
    status: /** @type {const} */ ('active'),
    displayName: 'Learner A',
    avatarKey: 'chiikawa',
    profile: {
      level: 'N5',
      goal: 'kaiwa_fluency',
      interests: ['daily_life'],
      nativeLanguageCode: 'vi',
    },
    authVersion: 0,
    version: 0,
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
  },

  learnerB: {
    _id: new ObjectId(FIXTURE_USER_IDS.learnerB),
    email: 'learner.b@example.com',
    emailKey: 'learner.b@example.com',
    passwordHash:
      'scrypt$16384$8$1$0123456789abcdef0123456789abcdef$a45371c6628c68ff0f81d18721c54b61f868ad93f1c7d23d854ec0915f79a9244093c12f0e3fc93be3d7ea3489ae21b2bb48f07ea519f0951664ab6268962071',
    role: /** @type {const} */ ('learner'),
    status: /** @type {const} */ ('active'),
    displayName: 'Learner B',
    avatarKey: 'hachiware',
    profile: {
      level: 'N4',
      goal: 'travel',
      interests: ['food', 'travel'],
      nativeLanguageCode: 'vi',
    },
    authVersion: 0,
    version: 0,
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
  },

  admin: {
    _id: new ObjectId(FIXTURE_USER_IDS.admin),
    email: 'admin@example.com',
    emailKey: 'admin@example.com',
    passwordHash:
      'scrypt$16384$8$1$0123456789abcdef0123456789abcdef$a45371c6628c68ff0f81d18721c54b61f868ad93f1c7d23d854ec0915f79a9244093c12f0e3fc93be3d7ea3489ae21b2bb48f07ea519f0951664ab6268962071',
    role: /** @type {const} */ ('admin'),
    status: /** @type {const} */ ('active'),
    displayName: 'Admin Root',
    avatarKey: 'usagi',
    profile: {
      interests: [],
    },
    authVersion: 0,
    version: 0,
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
  },

  locked: {
    _id: new ObjectId(FIXTURE_USER_IDS.locked),
    email: 'locked@example.com',
    emailKey: 'locked@example.com',
    passwordHash:
      'scrypt$16384$8$1$0123456789abcdef0123456789abcdef$a45371c6628c68ff0f81d18721c54b61f868ad93f1c7d23d854ec0915f79a9244093c12f0e3fc93be3d7ea3489ae21b2bb48f07ea519f0951664ab6268962071',
    role: /** @type {const} */ ('learner'),
    status: /** @type {const} */ ('locked'),
    displayName: 'Locked Account',
    avatarKey: 'chiikawa',
    profile: {
      interests: [],
    },
    authVersion: 0,
    version: 0,
    statusChangedAt: new Date('2026-11-01T00:00:00.000Z'),
    statusChangedBy: new ObjectId(FIXTURE_USER_IDS.admin),
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
  },
};

/**
 * Baseline auth sessions corresponding to users.
 */
export const AUTH_SESSION_FIXTURES = {
  learnerA: {
    _id: new ObjectId(FIXTURE_SESSION_IDS.learnerA),
    userId: new ObjectId(FIXTURE_USER_IDS.learnerA),
    authVersion: 0,
    issuedAt: new Date('2026-11-05T00:00:00.000Z'),
    expiresAt: new Date('2026-11-12T00:00:00.000Z'),
    purgeAt: new Date('2026-11-12T00:00:00.000Z'),
  },

  learnerB: {
    _id: new ObjectId(FIXTURE_SESSION_IDS.learnerB),
    userId: new ObjectId(FIXTURE_USER_IDS.learnerB),
    authVersion: 0,
    issuedAt: new Date('2026-11-05T00:00:00.000Z'),
    expiresAt: new Date('2026-11-12T00:00:00.000Z'),
    purgeAt: new Date('2026-11-12T00:00:00.000Z'),
  },

  admin: {
    _id: new ObjectId(FIXTURE_SESSION_IDS.admin),
    userId: new ObjectId(FIXTURE_USER_IDS.admin),
    authVersion: 0,
    issuedAt: new Date('2026-11-05T00:00:00.000Z'),
    expiresAt: new Date('2026-11-12T00:00:00.000Z'),
    purgeAt: new Date('2026-11-12T00:00:00.000Z'),
  },

  expired: {
    _id: new ObjectId(FIXTURE_SESSION_IDS.expired),
    userId: new ObjectId(FIXTURE_USER_IDS.learnerA),
    authVersion: 0,
    issuedAt: new Date('2026-10-01T00:00:00.000Z'),
    expiresAt: new Date('2026-10-08T00:00:00.000Z'),
    purgeAt: new Date('2026-10-08T00:00:00.000Z'),
  },
};

export const RAW_GUEST_TOKENS = {
  active: 'guest_raw_secret_token_1234567890abcdef1234567890abcdef',
  expired: 'guest_raw_secret_expired_1234567890abcdef1234567890abcdef',
};

export const GUEST_CREDENTIAL_HASHES = {
  active: '54b9f074d287bb7b76251b68bbbc5122ea55cb992ce58f1262d1d0f508a8e1e3',
  expired: 'd9b897368ce4626dc31db00f7b06850c9f116515c0e1db4268e376e104f2ee9b',
};

export const GUEST_SESSION_FIXTURES = {
  active: {
    _id: new ObjectId(FIXTURE_GUEST_IDS.active),
    credentialHash: GUEST_CREDENTIAL_HASHES.active,
    invitationId: new ObjectId(FIXTURE_INVITATION_ID),
    practiceSessionId: new ObjectId(FIXTURE_PRACTICE_SESSION_ID),
    status: /** @type {const} */ ('active'),
    expiresAt: new Date('2026-11-12T00:00:00.000Z'),
    version: 0,
    cleanupState: /** @type {const} */ ('pending'),
    createdAt: new Date('2026-11-05T00:00:00.000Z'),
  },

  expired: {
    _id: new ObjectId(FIXTURE_GUEST_IDS.expired),
    credentialHash: GUEST_CREDENTIAL_HASHES.expired,
    invitationId: new ObjectId(FIXTURE_INVITATION_ID),
    status: /** @type {const} */ ('expired'),
    expiresAt: new Date('2026-10-01T00:00:00.000Z'),
    version: 0,
    cleanupState: /** @type {const} */ ('complete'),
    createdAt: new Date('2026-09-30T00:00:00.000Z'),
  },
};

/**
 * Generates pre-signed JWT tokens for fixtures.
 * @param {Object} [overrides]
 * @param {string} [overrides.sub]
 * @param {string} [overrides.sid]
 * @param {number} [overrides.authVersion]
 * @param {number} [overrides.iat]
 * @param {number} [overrides.exp]
 * @param {string} [secret]
 * @returns {string}
 */
export function createFixtureJwt(overrides = {}, secret = DEFAULT_JWT_SECRET) {
  const nowSec = Math.floor(Date.now() / 1000);
  return signJwt(
    {
      sub: overrides.sub ?? FIXTURE_USER_IDS.learnerA,
      sid: overrides.sid ?? FIXTURE_SESSION_IDS.learnerA,
      authVersion: overrides.authVersion ?? 0,
      iat: overrides.iat ?? nowSec,
      exp: overrides.exp ?? nowSec + 7 * 24 * 60 * 60,
    },
    secret,
    {
      issuer: DEFAULT_JWT_ISSUER,
      audience: DEFAULT_JWT_AUDIENCE,
    },
  );
}

/**
 * Input boundary fixtures according to 07 §2.3.
 */
export const BOUNDARY_FIXTURES = {
  passwords: {
    validMin: 'p'.repeat(8),
    validMax: 'p'.repeat(128),
    validUnicode: '日本語パスワード1234',
    invalidTooShort: 'p'.repeat(7),
    invalidTooLong: 'p'.repeat(129),
  },
  displayNames: {
    validMin: 'A',
    validMax: 'T'.repeat(100),
    validWithSpaces: '  Nguyễn Văn A  ',
    invalidEmpty: '',
    invalidOnlySpaces: '    ',
    invalidTooLong: 'T'.repeat(101),
  },
  emails: {
    validSimple: 'user@example.com',
    validWithPlusTag: 'user+study@example.com',
    validWithDots: 'first.middle.last@example.com',
    validUpper: 'USER.UPPER@EXAMPLE.COM',
    invalidMissingAt: 'userexample.com',
    invalidMissingDomain: 'user@',
    invalidWithSpaces: 'user name@example.com',
    invalidWithControlChar: 'user\u0000@example.com',
  },
};
