import mongoose from 'mongoose';
import { readAuthEnv } from '../../config/env.js';
import { AppError } from '../../middleware/http-error.js';
import { SESSION_MAX_AGE_MS } from '../../middleware/cookies.js';
import {
  connectDatabase,
  withTransaction,
} from '../../persistence/database.js';
import {
  hashGuestCredential,
  hashPassword,
  signJwt,
  verifyDummyPassword,
  verifyJwt,
  verifyJwtIgnoreExpiration,
  verifyPassword,
} from './crypto.js';
import { DEFAULT_AVATAR_KEY, toSelfDto } from './dto.js';
import {
  validateEmptyObjectInput,
  validateLoginInput,
  validateProfileUpdateInput,
  validateRegisterInput,
} from './validation.js';

const { ObjectId } = mongoose.Types;

/**
 * Registers a new learner account in transaction TX-01 (users, actor_states, statistics.registeredAccounts).
 * Does NOT auto-login, does NOT send verification email, and never assigns admin role.
 *
 * @param {unknown} rawBody
 * @param {{ now?: Date }} [options]
 * @returns {Promise<{ user: ReturnType<typeof toSelfDto> }>}
 */
export async function registerUser(rawBody, { now = new Date() } = {}) {
  const { email, emailKey, password, displayName } =
    validateRegisterInput(rawBody);

  // Hash password outside the MongoDB transaction to keep transaction short (05 §5.2, 06 §11.1)
  const passwordHash = await hashPassword(password);
  const userId = new ObjectId();
  const actorKey = `user:${userId.toHexString()}`;

  const userDoc = {
    _id: userId,
    email,
    emailKey,
    passwordHash,
    role: /** @type {const} */ ('learner'),
    status: /** @type {const} */ ('active'),
    displayName,
    avatarKey: DEFAULT_AVATAR_KEY,
    profile: {
      interests: [],
    },
    authVersion: 0,
    version: 0,
    createdAt: now,
    updatedAt: now,
  };

  const actorStateDoc = {
    _id: actorKey,
    mode: 'idle',
    version: 0,
    createdAt: now,
    updatedAt: now,
  };

  const db = await connectDatabase();

  try {
    await withTransaction(async (session) => {
      await db.collection('users').insertOne(userDoc, { session });
      await db
        .collection('actor_states')
        .insertOne(/** @type {any} */ (actorStateDoc), { session });
      await db.collection('statistics').updateOne(
        /** @type {any} */ ({ _id: 'lifetime' }),
        {
          $inc: { registeredAccounts: 1 },
          $set: { updatedAt: now },
          $setOnInsert: {
            startedSessions: 0,
            reviewCount: 0,
            submittedQuizCount: 0,
          },
        },
        { upsert: true, session },
      );
    });
  } catch (err) {
    if (/** @type {{ code?: number }} */ (err)?.code === 11000) {
      throw new AppError({
        status: 409,
        code: 'EMAIL_EXISTS',
        message: 'Email này đã được đăng ký.',
      });
    }
    throw err;
  }

  return {
    user: toSelfDto(userDoc),
  };
}

/**
 * Authenticates a user by email and password, checks account status ONLY after valid password,
 * creates an auth_sessions record with max 7 days absolute expiry, and signs a session JWT.
 *
 * @param {unknown} rawBody
 * @param {{ now?: Date, envSource?: NodeJS.ProcessEnv }} [options]
 * @returns {Promise<{ user: ReturnType<typeof toSelfDto>, expiresAt: Date, jwtToken: string }>}
 */
export async function loginUser(
  rawBody,
  { now = new Date(), envSource = process.env } = {},
) {
  const { emailKey, password } = validateLoginInput(rawBody);
  const authEnv = readAuthEnv(envSource);
  const db = await connectDatabase();

  const userDoc = await db.collection('users').findOne({ emailKey });
  if (!userDoc || typeof userDoc.passwordHash !== 'string') {
    await verifyDummyPassword(password);
    throw new AppError({
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Email hoặc mật khẩu không đúng.',
    });
  }

  const isPasswordValid = await verifyPassword(password, userDoc.passwordHash);
  if (!isPasswordValid) {
    throw new AppError({
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Email hoặc mật khẩu không đúng.',
    });
  }

  // Per 07 §4: locked account is reported ONLY after valid password authentication
  if (userDoc.status === 'locked') {
    throw new AppError({
      status: 403,
      code: 'ACCOUNT_LOCKED',
      message: 'Tài khoản của bạn đã bị khóa.',
    });
  }

  const sessionId = new ObjectId();
  const issuedAt = now;
  const expiresAt = new Date(issuedAt.getTime() + SESSION_MAX_AGE_MS);
  const authVersion =
    typeof userDoc.authVersion === 'number' ? userDoc.authVersion : 0;

  await db.collection('auth_sessions').insertOne({
    _id: sessionId,
    userId: userDoc._id,
    authVersion,
    issuedAt,
    expiresAt,
    purgeAt: expiresAt,
  });

  const jwtToken = signJwt(
    {
      sub: userDoc._id.toHexString(),
      sid: sessionId.toHexString(),
      authVersion,
      iat: Math.floor(issuedAt.getTime() / 1000),
      exp: Math.floor(expiresAt.getTime() / 1000),
    },
    authEnv.jwtSecret,
    {
      issuer: authEnv.jwtIssuer,
      audience: authEnv.jwtAudience,
    },
  );

  return {
    user: toSelfDto(userDoc),
    expiresAt,
    jwtToken,
  };
}

/**
 * Revokes the current session credential (user or guest) in the database.
 * - When `ck_session` is present, logout handles the account cookie exclusively:
 *   it revokes the verified `auth_sessions` record (if signature & structure are valid),
 *   clears `ck_session`, and preserves any coexisting `ck_guest` cookie and guest credential.
 *   Tokens with an invalid signature only trigger clearing `ck_session` on the client
 *   and never touch the database.
 * - When only `ck_guest` is present, revokes the guest credential in `guest_sessions`
 *   (`revokedAt` + version increment) and clears `ck_guest` without deleting the root
 *   `guest_sessions` document or child learning/history records needed for cleanup.
 * - Repeated logout with an already-expired or already-revoked cookie remains safe (204).
 *
 * @param {Object} params
 * @param {string | undefined} params.authCookie
 * @param {string | undefined} params.guestCookie
 * @param {unknown} params.rawBody
 * @param {Date} [params.now]
 * @param {NodeJS.ProcessEnv} [params.envSource]
 * @returns {Promise<{ clearAuth: boolean, clearGuest: boolean }>}
 */
export async function logoutSession({
  authCookie,
  guestCookie,
  rawBody,
  now = new Date(),
  envSource = process.env,
}) {
  validateEmptyObjectInput(rawBody);

  if (authCookie !== undefined) {
    const authEnv = readAuthEnv(envSource);
    const decoded = verifyJwtIgnoreExpiration(authCookie, authEnv.jwtSecret, {
      issuer: authEnv.jwtIssuer,
      audience: authEnv.jwtAudience,
    });

    if (decoded) {
      const db = await connectDatabase();
      await db.collection('auth_sessions').updateOne(
        {
          _id: new ObjectId(decoded.sid),
          userId: new ObjectId(decoded.sub),
          revokedAt: { $exists: false },
        },
        {
          $set: { revokedAt: now },
        },
      );
    }

    return {
      clearAuth: true,
      clearGuest: false,
    };
  }

  if (guestCookie === undefined) {
    throw new AppError({
      status: 401,
      code: 'AUTH_REQUIRED',
      message: 'Vui lòng đăng nhập để tiếp tục.',
    });
  }

  if (guestCookie.trim().length > 0) {
    const db = await connectDatabase();
    const credentialHash = hashGuestCredential(guestCookie);
    await db.collection('guest_sessions').updateOne(
      {
        credentialHash,
        revokedAt: { $exists: false },
      },
      {
        $set: { revokedAt: now },
        $inc: { version: 1 },
      },
    );
  }

  return {
    clearAuth: false,
    clearGuest: true,
  };
}

/**
 * Resolves the active caller identity (`user` or `guest`) from cookies and database state.
 * - When `ck_session` is present, account identity is evaluated exclusively:
 *   valid session -> `user`; invalid/expired/revoked/stale authVersion -> 401 `SESSION_EXPIRED`;
 *   locked account with valid credential -> 403 `ACCOUNT_LOCKED` (never falls back to `ck_guest`).
 * - `ck_guest` is evaluated only when `ck_session` is absent.
 *
 * @param {Object} params
 * @param {string | undefined} params.authCookie
 * @param {string | undefined} params.guestCookie
 * @param {Date} [params.now]
 * @param {NodeJS.ProcessEnv} [params.envSource]
 */
export async function resolveIdentityFromCookies({
  authCookie,
  guestCookie,
  now = new Date(),
  envSource = process.env,
}) {
  if (authCookie !== undefined) {
    const authEnv = readAuthEnv(envSource);
    const claims = verifyJwt(authCookie, authEnv.jwtSecret, {
      issuer: authEnv.jwtIssuer,
      audience: authEnv.jwtAudience,
      now,
    });

    if (!claims) {
      throw new AppError({
        status: 401,
        code: 'SESSION_EXPIRED',
        message:
          'Phiên đăng nhập đã hết hạn hoặc không còn hiệu lực. Vui lòng đăng nhập lại.',
      });
    }

    const db = await connectDatabase();
    const sessionObjectId = new ObjectId(claims.sid);
    const userObjectId = new ObjectId(claims.sub);
    const sessionDoc = await db.collection('auth_sessions').findOne({
      _id: sessionObjectId,
      userId: userObjectId,
    });

    const isSessionActive =
      sessionDoc &&
      !sessionDoc.revokedAt &&
      sessionDoc.expiresAt instanceof Date &&
      sessionDoc.expiresAt.getTime() > now.getTime() &&
      sessionDoc.authVersion === claims.authVersion;

    if (!isSessionActive) {
      throw new AppError({
        status: 401,
        code: 'SESSION_EXPIRED',
        message:
          'Phiên đăng nhập đã hết hạn hoặc không còn hiệu lực. Vui lòng đăng nhập lại.',
      });
    }

    const userDoc = await db.collection('users').findOne({ _id: userObjectId });

    if (!userDoc || userDoc.authVersion !== claims.authVersion) {
      throw new AppError({
        status: 401,
        code: 'SESSION_EXPIRED',
        message:
          'Phiên đăng nhập đã hết hạn hoặc không còn hiệu lực. Vui lòng đăng nhập lại.',
      });
    }

    if (userDoc.status === 'locked') {
      throw new AppError({
        status: 403,
        code: 'ACCOUNT_LOCKED',
        message: 'Tài khoản của bạn đã bị khóa.',
      });
    }

    return {
      kind: /** @type {const} */ ('user'),
      actorKey: `user:${userDoc._id.toHexString()}`,
      userId: userDoc._id,
      sessionId: sessionDoc._id,
      role:
        userDoc.role === 'admin'
          ? /** @type {const} */ ('admin')
          : /** @type {const} */ ('learner'),
      user: userDoc,
    };
  }

  if (guestCookie === undefined) {
    throw new AppError({
      status: 401,
      code: 'AUTH_REQUIRED',
      message: 'Vui lòng đăng nhập để tiếp tục.',
    });
  }

  if (guestCookie.trim().length === 0) {
    throw new AppError({
      status: 401,
      code: 'SESSION_EXPIRED',
      message:
        'Phiên đăng nhập đã hết hạn hoặc không còn hiệu lực. Vui lòng đăng nhập lại.',
    });
  }

  const db = await connectDatabase();
  const credentialHash = hashGuestCredential(guestCookie);
  const guestDoc = await db
    .collection('guest_sessions')
    .findOne({ credentialHash });

  if (!guestDoc || guestDoc.revokedAt) {
    throw new AppError({
      status: 401,
      code: 'SESSION_EXPIRED',
      message:
        'Phiên đăng nhập đã hết hạn hoặc không còn hiệu lực. Vui lòng đăng nhập lại.',
    });
  }

  const isExpired =
    guestDoc.status === 'expired' ||
    (guestDoc.expiresAt instanceof Date &&
      guestDoc.expiresAt.getTime() <= now.getTime());

  if (isExpired) {
    throw new AppError({
      status: 410,
      code: 'GUEST_EXPIRED',
      message: 'Quyền truy cập tạm của khách đã hết hạn.',
    });
  }

  return {
    kind: /** @type {const} */ ('guest'),
    actorKey: `guest:${guestDoc._id.toHexString()}`,
    guestId: guestDoc._id,
    role: /** @type {const} */ ('guest'),
    guestSession: guestDoc,
  };
}

/**
 * Formats the GET /auth/me response payload from a resolved identity (07 §4).
 *
 * @param {Awaited<ReturnType<typeof resolveIdentityFromCookies>>} identity
 */
export function formatAuthMeDto(identity) {
  if (identity.kind === 'user') {
    return {
      kind: 'user',
      user: toSelfDto(identity.user),
    };
  }

  const guestSession = identity.guestSession;
  /** @type {{ sessionId?: string, expiresAt?: string, status: string }} */
  const guestDto = {
    status: String(guestSession.status ?? 'waiting'),
  };
  if (guestSession.practiceSessionId) {
    guestDto.sessionId =
      typeof guestSession.practiceSessionId.toHexString === 'function'
        ? guestSession.practiceSessionId.toHexString()
        : String(guestSession.practiceSessionId);
  }
  if (guestSession.expiresAt instanceof Date) {
    guestDto.expiresAt = guestSession.expiresAt.toISOString();
  }

  return {
    kind: 'guest',
    guest: guestDto,
  };
}

/**
 * Partially updates the authenticated learner/admin user's profile using atomic CAS on `expectedVersion` (06 §4.1, 07 §2.2, 07 §4).
 * - Only updates fields explicitly sent in the request body; omitted fields inside `profile` remain untouched.
 * - Optional nested `profile` fields set to `null` are unset in MongoDB.
 * - Increments `version` by 1 on commit; returns 409 `VERSION_CONFLICT` with `currentVersion` if stale.
 *
 * @param {Object} params
 * @param {import('mongoose').Types.ObjectId | string} params.userId
 * @param {unknown} params.rawBody
 * @param {Date} [params.now]
 * @returns {Promise<ReturnType<typeof toSelfDto>>}
 */
export async function updateUserProfile({ userId, rawBody, now = new Date() }) {
  const { expectedVersion, displayName, avatarKey, profileUpdates } =
    validateProfileUpdateInput(rawBody);

  const userObjectId =
    userId instanceof ObjectId ? userId : new ObjectId(String(userId));

  /** @type {Record<string, unknown>} */
  const setFields = {
    updatedAt: now,
  };
  /** @type {Record<string, ''>} */
  const unsetFields = {};

  if (displayName !== undefined) {
    setFields.displayName = displayName;
  }
  if (avatarKey !== undefined) {
    setFields.avatarKey = avatarKey;
  }

  for (const [key, value] of Object.entries(profileUpdates)) {
    if (value === null) {
      unsetFields[`profile.${key}`] = '';
    } else {
      setFields[`profile.${key}`] = value;
    }
  }

  /** @type {Record<string, unknown>} */
  const updateDoc = {
    $set: setFields,
    $inc: { version: 1 },
  };
  if (Object.keys(unsetFields).length > 0) {
    updateDoc.$unset = unsetFields;
  }

  const db = await connectDatabase();
  const updatedUser = await db.collection('users').findOneAndUpdate(
    {
      _id: userObjectId,
      status: 'active',
      version: expectedVersion,
    },
    updateDoc,
    { returnDocument: 'after' },
  );

  if (!updatedUser) {
    const currentUser = await db
      .collection('users')
      .findOne({ _id: userObjectId });

    if (!currentUser) {
      throw new AppError({
        status: 401,
        code: 'SESSION_EXPIRED',
        message:
          'Phiên đăng nhập đã hết hạn hoặc không còn hiệu lực. Vui lòng đăng nhập lại.',
      });
    }

    if (currentUser.status === 'locked') {
      throw new AppError({
        status: 403,
        code: 'ACCOUNT_LOCKED',
        message: 'Tài khoản của bạn đã bị khóa.',
      });
    }

    throw new AppError({
      status: 409,
      code: 'VERSION_CONFLICT',
      message: 'Dữ liệu đã thay đổi. Vui lòng tải lại.',
      details: {
        currentVersion:
          typeof currentUser.version === 'number' ? currentUser.version : 0,
      },
    });
  }

  return toSelfDto(updatedUser);
}
